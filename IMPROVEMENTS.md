# LandCraft AI — Improvement Backlog

Everything listed in `ADVERSARIAL_REVIEW.md` is now fixed (see "Resolution status"
at the top of that file). This document is the **next** tier: things that are
wrong, missing, or fragile but were out of scope for the first pass.

Effort is rough, in developer-days: S ≤ 0.5 · M ≈ 1–2 · L ≈ 3–5.

---

## 1. Should be next — correctness gaps found while fixing

### 1.1 `tsconfig.json` has no `strict: true` — **S**
The single highest-leverage change in this list. `strict` is absent entirely, so
`strictNullChecks`, `strictFunctionTypes`, and `noImplicitAny` are all off. Every
`any` in the codebase (`selectedPaletteItem: any | null`, `selectedElement: any`,
`layerVisibility: any`, `updatedData: any`, the `(selectedElement as Wall)` casts)
is load-bearing and unenforced. Turning it on will surface real null/undefined
bugs. Plan on fixing ~60–100 errors; do it as one dedicated PR, not piecemeal.

### 1.2 The "Measure" tool does not measure — **M**
`ToolType` includes `'measure'`, the sidebar shows a "Measure" button, and
`src/types.ts` defines a `MeasurementTape` interface that is **never used
anywhere**. Today selecting the measure tool just makes left-drag pan the canvas.
Either implement the tape (click A, click B, show live distance) or remove the
button and the dead type. Shipping a tool that silently does something else is
worse than not having it.

### 1.3 `floors` is collected, sent to the model, and ignored — **M**
The generation form has "Number of floors", the server forwards it, and nothing
else ever reads it. `FloorPlanData` is single-storey by construction. Either add
a floor selector with per-floor plans (a real feature), or remove the field so
you are not promising something the data model cannot represent.

### 1.4 Wall thickness is inconsistent — **S**
The AI prompt says 12px exterior / 8px interior, hand-drawn walls are hardcoded
to `10`, and the live preview passes `10` to `formatWallDimensions` regardless.
Pick a rule, expose thickness presets in the wall tool, and default new walls to
match the AI's convention.

### 1.5 Moving a room leaves its contents behind — **M**
Dragging a room moves only the rectangle; furniture and openings stay put. Users
expect a room drag to carry its contents. Needs a `containedIn(room, item)`
helper (you already have the AABB math in `geoUtils`) applied on drag-move.

### 1.6 Undo/redo has no keyboard shortcuts — **S**
There are toolbar buttons but no `Ctrl/Cmd+Z` and `Ctrl/Cmd+Shift+Z`. Also
missing: `Delete`/`Backspace` to remove the selection, `Escape` to close open
modals (it only cancels the active tool), and arrow-key nudging of a selection.

### 1.7 No tests at all — **L**
Zero test files. The highest-value first targets are pure functions:
- `geoUtils` — `pixelsToFeetInches` carry, `isPointInDoorSwing` sector math,
  `checkOverlapWarnings`
- `normalizePlan` — every coercion path (missing arrays, wrong types, absurd
  values, `wallId` cleanup)
- the `editorReducer` in `App.tsx` — undo/redo, history cap, coalescing

Add `vitest`. These three files are where a regression would be silent and
expensive.

---

## 2. Data loss and persistence — **M**

Nothing survives a refresh. There is JSON **export** but no **import**, and no
autosave.

- Autosave the plan to `localStorage` (debounced), restore on boot with
  `normalizePlan`.
- Add "Import plan JSON" next to the export button — you already have the
  normalizer, so this is nearly free and makes the export actually useful.
- Warn before `Clear Plan` destroys work (currently one click, no confirm).

---

## 3. Performance

### 3.1 The canvas redraws every element on every mousemove — **M**
Dragging one room re-renders all walls, rooms, openings, and furniture. Wrap the
element groups in `React.memo` keyed on their own data, and split the
static/transforming layers. Noticeable above ~200 elements.

### 3.2 `suggestRoomName` runs inside the canvas render path — **S**
`FloorPlanCanvas` calls `suggestRoomName(room, plan.furniture, unit)` inline for
the selected room. That iterates all furniture and runs the full rule ladder on
**every render**, including every mousemove during a drag. Memoize on
`[room, furniture, unit]`.

### 3.3 The static audit is O(n²) — **S**
`checkOverlapWarnings` compares every room pair and every furniture pair. Fine at
50 elements, a stall at 500. Debouncing (already added) covers the drag case; add
an element-count guard that skips the pairwise passes above a threshold and says
so in the UI.

---

## 4. The compliance panel could be genuinely correct — **L**

Right now the audit checks a handful of properties and reports them as
"Code & Safety Verification". The honest version is not much more work and would
be a real differentiator:

- **Adjacency graph.** Build room adjacency from shared wall segments, then check
  real things: is every bedroom reachable without passing through another
  bedroom or a bathroom? Can you reach a bathroom from the living area without
  going outside? These are actual code concerns and are computable from data you
  already have.
- **Real glazing check.** You have window widths and wall geometry. Compute
  glazing area per room and compare against floor area, instead of the current
  "zero windows → generic warning".
- **Turning circle.** You check `width < 60 || height < 60` px. The real
  requirement is an unobstructed 1.5 m circle — test it against placed furniture
  rather than just the room's bounding box.
- **Door swing into circulation.** You now have correct sector geometry; extend it
  to detect two doors whose swings intersect.

Pair each check with a citation field (`source`, `jurisdiction`) and render
"heuristic" vs "code reference" distinctly. Do not add citations you cannot
substantiate.

---

## 5. Architecture

- **Extract the plan-mutation switch.** Nearly identical `switch (type)` mapping
  logic exists in `App.tsx` (`handleUpdateElement`, `handleDeleteElement`) and
  `FloorPlanCanvas` (drag branches). Move to one
  `updateElementInPlan(plan, type, id, patch)` helper. **S**
- **Zod over hand-rolled coercion.** `server.ts` has `clampNum` / `cleanText` /
  `normalizeMessages`. Zod would express the same contracts declaratively and
  give you typed request bodies. **M**
- **ESLint + Prettier.** `npm run lint` currently only runs `tsc --noEmit`, so
  unused variables, hook dependency bugs, and `any` creep are all unenforced.
  This is what would have caught the original `setTimeout`-inside-updater bug. **S**
- **CI.** A GitHub Actions workflow running `typecheck` → `lint` → `test` →
  `build` on every PR. Currently nothing verifies a change compiles. **S**
- **Dead types.** `FloorPlanElement`, `EditorState`, and `MeasurementTape` in
  `src/types.ts` are declared and never used. Delete or use them. **S**
- **Structured logging + request IDs** on the server; today it is bare
  `console.error` of whole error objects. **S**

---

## 6. Product

- **Import JSON** (see §2) and **export PDF/PNG** alongside SVG. **M**
- **Multi-floor** support, or drop the field (see §1.3). **L**
- **Plot/site outline.** The land-photo feature promises site context, but the
  canvas has no notion of a plot boundary, setbacks, or a north arrow. Add a site
  rectangle layer and a north indicator. **M**
- **Print-ready title block** with scale bar and dimensions — the single most
  requested thing in a tool that calls itself a "Blueprint Engine". **M**
- **Currency + units per region.** Currency is hardcoded USD and region is only a
  cost multiplier. Let region drive both. **S**
- **Touch support.** The canvas binds `mousedown`/`mousemove`/`mouseup` only, so
  the editor is unusable on a tablet. Switch to Pointer Events. **M**
- **Accessibility.** SVG elements have no ARIA roles or keyboard focus; modals do
  not trap focus or close on Escape; the canvas cannot be driven by keyboard.
  **M**
- **Empty-state onboarding.** A first-time user lands on a sample plan with no
  guidance. **S**

---

## 7. Security and operations

- **Per-user auth and quotas.** Rate limiting (added) stops casual abuse but all
  users still share one operator key. Move to per-user sessions with individual
  budgets before exposing this publicly. **L**
- **`helmet` + CSP.** No security headers are set. **S**
- **Retry with backoff** on upstream 429/503. Right now a single transient
  failure drops the variant (mitigated by `allSettled`, but not retried). **S**
- **Prompt caching / dedupe.** Identical briefs re-bill the full generation. **S**
- **A startup model smoke test.** `/api/health` now reports which models are
  targeted. Wire a boot-time check that actually calls each one so a retired
  model id fails at deploy instead of at first user click. This is the specific
  control that would have caught the `gemini-1.5-pro` shutdown. **S**
- **Streaming responses** for chat and generation, so users are not staring at a
  spinner for 10+ seconds. **M**

---

## 8. Nice-to-haves

- Post-generation geometric repair pass: validate that the model's rooms actually
  tile inside the wall envelope and nudge/repair if not. **L**
- Multi-select, marquee selection, copy/paste, duplicate. **M**
- Orthogonal lock (hold Shift while drawing a wall). **S**
- Room edge snapping to walls. **M**
- Variant comparison view (two plans side by side). **M**
- Rate-the-variant feedback loop to improve prompt selection over time. **M**
- Remove the orphaned drei HDRI chunks from `dist` (~4.6 MB of dead build output;
  they are never fetched at runtime, but they bloat every deploy). Importing
  `ContactShadows`/`OrbitControls` via drei's deep paths instead of the barrel
  should drop them. **S**
