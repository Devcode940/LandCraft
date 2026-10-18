# LandCraft AI

An architectural floor-plan editor that runs in the browser, with Gemini doing
the parts that are genuinely hard: turning a written brief or a photo of a plot
into a buildable layout, auditing a drawing for circulation and accessibility
problems, and value-engineering a cost estimate.

The editor itself is local-first. You can draw walls, place rooms, doors,
windows and furniture, measure, undo, and export without a network connection
and without an API key. AI features are additive, never required.

---

## What it does

**Drafting**

- Wall drawing with live snap-to-grid and snap-to-endpoint, with the length and
  thickness on the segment as you draw.
- Rooms, doors, windows and ~30 furniture presets, each with an inspector for
  exact dimensions.
- Moving a room carries the furniture and openings inside it.
- Tape measure with snapping, live distance readout, and a clear-all control.
- Undo/redo across 100 steps. A drag is one step, not one per frame.
- Layer visibility, wall length × width labels, metric or imperial.
- Export to JSON (lossless, re-importable) or SVG (vector, opens anywhere).

**AI**

- Generate two or three variant layouts from plot dimensions, programme and
  style, each with a rationale for its zoning and circulation.
- Generate from a photo of the land.
- Audit a plan for circulation, accessibility, daylight and safety, with an
  optimized plan offered alongside the findings.
- Conversational architect with a `generate_floor_plan` tool call.
- Cost optimization suggestions grounded in the actual measured quantities.

**Everywhere**

- Autosave to `localStorage`, restored on reload.
- Keyboard shortcuts: `Ctrl/Cmd+Z`, `Ctrl/Cmd+Shift+Z`, `Delete`, `Esc`, and
  `V`/`W`/`R`/`D`/`N`/`F`/`M` for tools.
- High-contrast mode that is a real accessibility override, not a colour tweak.
- AR viewer on WebXR-capable devices, loaded lazily so it costs nothing on the
  devices that cannot use it.

---

## Getting started

Requires Node 22 or newer.

```bash
npm ci
cp .env.example .env        # add GEMINI_API_KEY
npm run dev                 # http://localhost:3000
```

The app runs without a key. AI routes return `400 Missing API Key` and
`/api/ready` reports unready; everything else works.

### Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Vite middleware + Express on port 3000, with HMR |
| `npm run build` | Client bundle to `dist/assets`, server bundle to `dist/server.cjs` |
| `npm start` | Run the built server (`node dist/server.cjs`) |
| `npm run typecheck` | `tsc --noEmit` under `strict` |
| `npm run lint` | Typecheck + ESLint |
| `npm test` | Vitest, 149 tests |
| `npm run test:coverage` | Same, with V8 coverage over `src/lib` and `src/utils` |
| `npm run format` | Prettier |
| `npm run verify` | Typecheck + tests + build. Run this before pushing. |

---

## Architecture

```
server.ts                 Express app: routes, input coercion, model prompts
server/operations.ts      Security headers, request logging, probes, shutdown
src/
  lib/                    Pure, unit-tested logic. No React, no DOM.
    editorState.ts        Undo/redo reducer
    planOps.ts            Add / update / delete / move over FloorPlanData
    persistence.ts        localStorage + file import
    download.ts           Blob download helper
  hooks/                  React-only helpers
  utils/                  Geometry, normalisation, room labelling, samples
  components/
    Modal.tsx             Accessible dialog: focus trap, Escape, scroll lock
    ErrorBoundary.tsx     Root and per-panel crash containment
    FloorPlanCanvas.tsx   The SVG editor surface
    ...                   Panels and inspector
  types.ts                Shared data shapes
```

Three rules keep this maintainable:

1. **`src/lib` is pure.** Every function takes data and returns new data. That
   is what makes it testable without a browser, and why the undo history is
   correct: snapshots never share mutable arrays.
2. **Model output is never trusted.** Everything returned by Gemini goes
   through `normalizePlan()` before it reaches the canvas. It fills missing
   collections, coerces every coordinate to a finite number, clamps extents,
   normalises rotation, and clears references to walls that do not exist.
3. **The server is the only thing holding a secret.** The API key never reaches
   the browser; the client only ever talks to `/api/*`.

### Data model

All geometry is in pixels at **40 px per metre**. Furniture `x`/`y` is the
*centre*; room `x`/`y` is the top-left corner. Openings carry a `rotation` in
degrees and an optional `wallId`.

```ts
interface FloorPlanData {
  walls: Wall[];
  rooms: Room[];
  openings: Opening[];
  furniture: Furniture[];
}
```

---

## Configuration

See `.env.example` for the full list. The ones that matter in production:

| Variable | Default | Purpose |
| --- | --- | --- |
| `GEMINI_API_KEY` | — | Required for AI routes |
| `PORT` | `3000` | Listen port (Cloud Run sets this) |
| `TRUST_PROXY_HOPS` | `1` | Proxy hops trusted for client-IP derivation. Wrong values break rate limiting |
| `RATE_LIMIT_PER_MIN` | `30` | Per-IP ceiling on `/api/*` |
| `SHUTDOWN_TIMEOUT_MS` | `10000` | Drain period before forcing exit |

Model IDs are pinned in one place (`MODELS` in `server.ts`) and can be
overridden per role with `MODEL_*` variables.

---

## Deployment

```bash
docker build -t landcraft-ai .
docker run -p 8080:8080 -e GEMINI_API_KEY=... landcraft-ai
```

The image is multi-stage: build, prune dev dependencies, then copy only
`dist/`, production `node_modules`, and `package.json` into a non-root runtime.
It is roughly 300 MB, most of which is the Node runtime.

**Probes.** `GET /api/health` is liveness — 200 whenever the process is up.
`GET /api/ready` is readiness — 503 when no API key is configured, so a
misconfigured instance stays out of rotation without being crash-looped.

**Shutdown.** `SIGTERM` stops accepting connections, drains in-flight requests
for up to `SHUTDOWN_TIMEOUT_MS`, then exits. The server runs as PID 1 under the
exec-form `CMD`, so the signal arrives.

---

## Testing

```bash
npm test
```

149 tests across thirteen files. The suite covers the parts where a mistake is
silently wrong rather than visibly broken:

| File | Covers |
| --- | --- |
| `lib/editorState.test.ts` | history coalescing, undo/redo, the 100-step cap, immutability |
| `lib/planOps.test.ts` (in the same file) | add/update/delete/move, dangling `wallId` cleanup |
| `lib/persistence.test.ts` | storage round trip, corrupt data, hostile import files |
| `utils/normalizePlan.test.ts` | garbage, hostile and missing model output |
| `utils/geoUtils.test.ts` | geometry, door-swing collision, `5' 12"` formatting bugs |
| `components/Modal.test.tsx` | focus trap, Escape, focus restoration, scroll lock |
| `components/ErrorBoundary.test.tsx` | fallbacks, panel variant, recovery |
| `components/AutoLabelRoomsModal.test.tsx` | the panel still mounts and closes correctly inside `Modal` |
| `components/ArchitectChatPanel.test.tsx` | chat applies structured edits, reports skips, still regenerates |
| `components/Toolbar.test.tsx` | the three export paths are reachable |
| `lib/printBlueprint.test.ts` | printer attributes set and restored |
| `lib/selection.test.ts` | multi-select toggle semantics |
| `lib/clipboardOps.test.ts` | copy/paste id regeneration, offsets, group moves |

Not covered: canvas interaction (wall chains, snapping, drag bookkeeping), the
AR viewer, and the AI panels themselves. Those need a browser, and the AI ones
need a live key.

---

## Limitations

Stated plainly, because a floor plan that looks authoritative but is wrong is
worse than no floor plan:

- **Conceptual only.** Output is not a construction document. It has no
  structural analysis, no MEP, no egress calculation, and no compliance
  checking. Have a licensed architect or engineer review anything before it is
  built.
- **No multi-storey.** The `floors` field is collected and passed to the model
  as context, but the canvas is single-level.
- **Rooms are rectangles.** L-shaped rooms are drawn as two overlapping rooms.
- **The cost estimator is a rough order of magnitude.** Rates are regional
  averages, not a quote.
- **British spelling of "metre"** in prose, `m`/`ft` in the UI.

## License

Apache-2.0. See [LICENSE](./LICENSE).
