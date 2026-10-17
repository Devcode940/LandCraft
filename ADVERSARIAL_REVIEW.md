# LandCraft AI — Adversarial Code Review

**Repo:** `Devcode940/LandCraft` @ `145df63` (branch `arena/f9692fa8-landcraft`)
**Scope:** 27 files, ~7,200 LOC (`server.ts` + 13 React components + 3 utils)
**Review date:** 2026-10-17
**Status:** ✅ ALL FINDINGS BELOW HAVE BEEN FIXED (see `IMPROVEMENTS.md` for the next backlog)
**Method:** full read of every source file, plus `npm install` → `tsc --noEmit` → `vite build` → live server probes → targeted reproductions. Findings marked **[VERIFIED]** were confirmed by running code, not by inspection.

---

## Verdict

The 2D editor is genuinely well-built: the SVG canvas, snapping, dimension math, and sample data are consistent and correct (I checked the sample plans pack perfectly to the pixel). The problem is that **the product's headline value — "AI that thinks like an architect" — is largely not wired to a live model**, and the interactive editor has three bugs severe enough that a first-time user will hit one within about thirty seconds.

**Ship-blocking:** 4 of 6 AI features call models Google shut down in September 2025. Three interaction bugs (sticky drag, corrupt undo, invisible toggle states) are immediately user-visible. Unauthenticated AI endpoints will drain the operator's API key.

**Severity counts:** 5 critical · 9 high · 12 medium · 10 low/hygiene

---

## CRITICAL

### C1 — Four of six AI features call models that were shut down on 2025-09-29

`server.ts` hardcodes six model strings. Four name retired models:

| Endpoint | Model | Status | Called by UI? |
|---|---|---|---|
| `/api/generate-floor-plan` (:271) | `gemini-3.5-flash` | Deprecated 2026-10-08, auto-routed to 3.6 | ✅ Generator tab |
| `/api/analyze-land-photo` (:390) | `gemini-3.5-flash` | Same | ❌ **never called** |
| `/api/design-from-photo` (:519) | `gemini-1.5-pro` | **Shut down 2025-09-29** | ✅ Land Photo tab |
| `/api/analyze-blueprint` (:612) | `gemini-1.5-pro` | **Shut down 2025-09-29** | ✅ Deep AI Audit |
| `/api/optimize-costs` (:674) | `gemini-1.5-flash` | **Shut down 2025-09-29** | ✅ Cost Estimator |
| `/api/architect-chat` (:732) | `gemini-1.5-pro` | **Shut down 2025-09-29** | ✅ AI Architect Chat |

Google shut down all Gemini 1.5 models on 2025-09-29 [3](https://ai.google.dev/gemini-api/docs/changelog). `gemini-3.5-flash` still responds only because requests are silently auto-routed to `gemini-3.6-flash`; it is deprecated and should be `gemini-3.8-flash` [7](https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash).

**Impact:** the feature named in `metadata.json` — *"From land photo to dream home in minutes"* — is dead. So are the AI audit, the architect chat, and the AI cost insights. Only the text-to-plan generator works, and it is on a deprecated alias.

**Fix:** hoist model IDs to one exported constant, point everything at `gemini-3.8-flash` (or `gemini-3.1-pro-preview` for the audit/chat, which want reasoning depth). Add a startup smoke test that pings each model so this fails loudly instead of silently.

### C2 — `handleInstantAdd` mutates state, corrupts undo history, and double-adds elements

`src/App.tsx:264-290`:

```js
const id = `${type}-${Date.now()}`;
setPlan(prev => {
  const next = { ...prev };        // shallow → next.rooms === prev.rooms
  next.rooms.push({ id, ... });    // mutates the PREVIOUS state array
  return next;
});
```

Two independent failures: (a) `push` on an aliased array means every stored history entry shares one array, so **undo cannot restore prior rooms**; (b) React 19 StrictMode double-invokes updaters, so the push runs twice — and because `id` is computed *outside* the updater, both copies get the **same id**.

**[VERIFIED]** with a direct reproduction of the reducer:

```
rooms after ONE click        : 2          <- expected 1
duplicate ids?               : true
history[0].rooms === current?: true       <- UNDO IS CORRUPTED
header "Total Area" reports  : 17.5 m²    (real: 8.8 m²)
```

Three user-visible symptoms: every "Add +" in the palette inserts a duplicate, the header area stat double-counts, and React logs a duplicate-key warning. Note this is the **only** mutating updater — `handleUpdateElement` uses `.map()`, `handleDeleteElement` uses `.filter()`. One inconsistent line.

### C3 — Click any element, then just move the mouse: it sticks to your cursor

`FloorPlanCanvas.tsx` starts drags in `onClick` but ends them in `onMouseUp`. Browser event order is `mousedown → mouseup → click`, so at mouseup `isDraggingElement` is still `false`; the click handler then sets it `true`, and nothing clears it until the *next* mouseup.

Sequence: click a room → release → **move the mouse with no button held** → `handleMouseMove` sees `isDraggingElement === true` and repositions the room to the cursor. It keeps following until you click somewhere else.

Affects rooms, furniture, and openings (walls are unaffected — `handleElementClick` has no `'wall'` branch). This makes the editor feel fundamentally broken.

**Fix:** move drag initiation into `handleMouseDown` (which already branches on element type) and add a `window`-level `mouseup` listener.

### C4 — Every toolbar toggle renders in the wrong state

`Toolbar.tsx` composes two class strings that both set `background-color`:

```jsx
className={`${btnStyle()} ${activeBtnStyle(isLeftSidebarOpen)}`}
// btnStyle()      → 'bg-white dark:bg-slate-800 ...'
// activeBtnStyle() → 'bg-emerald-600 text-white dark:bg-emerald-700 ...'
```

Tailwind resolves same-specificity conflicts by **position in the generated stylesheet**, not by class order.

**[VERIFIED]** against the real build output (`dist/assets/index-*.css`):

```
.bg-emerald-600        @ byte 27841
.bg-white              @ byte 32988   <- later, WINS
.dark\:bg-emerald-700  @ byte 52730
.dark\:bg-slate-800    @ byte 53254   <- later, WINS
```

The inactive style wins in both light and dark mode, so **no toggle ever shows its active state** — Grid Snap, Element Snap, Wall L×W, High Contrast, Palette, Inspector. Users cannot tell what is on. This is the classic Tailwind `clsx`-without-`tailwind-merge` trap; the codebase uses it in `Toolbar.tsx` and nowhere else (`SidebarPalette` and `PropertyInspector` correctly pick *one* of two strings).

### C5 — AI endpoints have no auth, no rate limit, and spend the operator's key

All six `/api/*` routes are unauthenticated with `express.json({ limit: '50mb' })`. Anyone who can reach the host can loop `/api/generate-floor-plan` to drain Gemini quota or push 50 MB bodies to exhaust memory. There is no session, no per-IP limit, no CAPTCHA, no request budget.

Note the failure mode is amplified: `Promise.all` fans each request out to up to 3 model calls (server.ts:288, 407, 546), so **one HTTP request = 3 billed generations**, and with 3 variants requested plus a photo, one call can bill ~9 generations.

---

## HIGH

### H1 — Unvalidated bodies return 500s that leak internal TypeErrors **[VERIFIED]**

With a key configured, malformed-but-plausible requests crash before any validation:

```
POST /api/optimize-costs  {"plan":{},"metrics":{}}
 → 500 {"message":"Cannot read properties of undefined (reading 'total')"}

POST /api/architect-chat  {"plan":{}}
 → 500 {"message":"Cannot read properties of undefined (reading 'map')"}

POST /api/design-from-photo  {"imageBase64":{"a":1}}
 → 500 {"message":"imageBase64.replace is not a function"}
```

Root causes: `costs.total.toFixed(0)` (:663), `messages.map(...)` (:717), `imageBase64.replace(...)` (:487). The `typeof` check is missing on all of them, and raw `error.message` is returned to the client.

### H2 — Oversized uploads return HTML, making the frontend's error handling unreachable **[VERIFIED]**

Every client call site does this:

```js
const result = await response.json();   // throws on non-JSON
if (!response.ok) throw new Error(result.message || ...);
```

`response.json()` runs *before* the `!response.ok` check. A 58 MB upload makes Express return an **HTML** `PayloadTooLargeError` page, so `response.json()` throws `SyntaxError` and the user gets the generic catch-all message instead of anything useful. The server's carefully worded "Missing API Key" text is only reachable when the body happens to be JSON. Affects all 5 fetch sites.

Check `response.ok` first, and add a JSON error handler to Express so all errors return JSON.

### H3 — AI-generated plans are loaded into the canvas with zero validation

`onLoadPlan(result.variants[0].plan)` (`AiAssistantPanel.tsx:229`), `onUpdatePlan(data.generatedPlan.plan)` (`ArchitectChatPanel.tsx:77`), and `onLoadPlan(optimizedPlan)` all pass raw model output straight into state. `FloorPlanCanvas` then does `plan.rooms.map(...)`, `plan.furniture.map(...)`, `plan.walls.map(...)` with no guards.

Structured output is a best-effort contract, not a guarantee. One missing array = `TypeError` during render = **white screen**.

**[VERIFIED]** there is no error boundary anywhere in `src/` (no `componentDidCatch`, no `ErrorBoundary`), so any render throw takes down the entire app and leaves the user with a blank page and no recovery.

Write a `normalizePlan()` that coerces all four arrays and drops malformed items, and wrap the app in an error boundary.

### H4 — AR viewer ships a fake camera button

`ARViewer.tsx:203`:

```js
const capturePhoto = () => {
  // For this prototype, we simulate the action.
  alert("Photo captured and saved to gallery!");
};
```

A camera button in the UI that does nothing but lie to the user. Either implement it (`preserveDrawingBuffer: true` + `canvas.toDataURL()`) or remove the button.

### H5 — The AR/3D view renders no doors and no windows

`plan.openings` is imported and typed in `ARViewer.tsx:6` and then **never rendered**. The `door` material is created (`:33`) and never used. The headline "AR Site Projection" shows a building envelope with walls and furniture but no openings at all — for a feature whose entire purpose is visualising circulation, that guts it.

### H6 — `modelPosition` is dead; "Reposition Model" is broken

`ARViewer` keeps `modelPosition` state and passes it down (`:251`), but `ARScene` never reads it — the placed group uses its own internal `currentPos`. "Reposition Model" resets the parent's `modelPosition` and `isPlaced` but not `ARScene`'s `currentPos`, so the reticle resumes from a stale position.

### H7 — XR session state is read non-reactively

```js
const inSession = !!store.getState?.()?.session;
{!store.getState?.()?.session && showDisclaimer && ( ... )}
```

`store.getState()` does not subscribe. React never re-renders when the session changes on its own; the code only works because `setShowDisclaimer(false)` happens to fire alongside. If the user exits AR via the browser/OS control, no state updates and the UI is stuck showing AR chrome over a plain 3D view. Use `useXRStore`/a subscription hook.

### H8 — `Environment preset="city"` is an undeclared CDN dependency with no error handling

drei's `Environment` with a preset fetches an HDRI from a remote CDN at runtime. It is pointless in an AR scene (you want the real camera feed, not a baked city env map), it is not declared anywhere, and with no suspense fallback or error boundary a failed fetch crashes the viewer. The build confirms drei emitted ~3.6 MB of HDRI chunks (`living_room`, `music_room`, `meeting_room`, `office_*`).

### H9 — Three.js (~1.5 MB) is in the initial bundle for everyone

`App.tsx` statically imports `ARViewer`, so `@react-three/fiber`, `@react-three/drei`, `@react-three/xr`, and `three` are all in the main chunk — even though the AR viewer sits behind a button most users never press.

**[VERIFIED]** `vite build`: `dist/assets/index-*.js` = **1,605 kB (447 kB gzip)**, plus 6 MB of lazy drei/HDRI chunks. Wrap `ARViewer` in `React.lazy()` and drop the `Environment` preset.

---

## MEDIUM

### M1 — History/undo is fragile and unbounded
- `handleStateChange` reads `history`/`historyIndex` from the render closure but is invoked via `setTimeout(..., 0)` and `(..., 50)` from *inside state updaters* (`App.tsx:110, 258, 290, 315`) → stale closures and duplicate entries.
- Side effects inside updaters violate purity: `setTimeout` inside `setPlan(prev => ...)`, and `setLayerVisibility` called from inside the `setShowWallLabels` updater (`App.tsx:89-96`).
- No cap on history length. `FloorPlanCanvas` calls `setPlan` on **every mousemove** during a drag, and each call schedules a history push → a 2-second drag creates ~120 undo entries. Memory grows without bound, and undo becomes useless.

### M2 — The static audit re-runs on every mousemove
`AiAssistantPanel.tsx:111-114` runs `runStaticAudit()` on every `plan` change. Since `plan` changes on every mousemove during a drag, this rebuilds the whole findings array and calls `setReviews` + `setOptimizedPlan(null)` dozens of times per second, re-rendering a heavy panel. Debounce it.

### M3 — `checkOverlapWarnings` ignores its `rooms` parameter entirely
`geoUtils.ts:217` takes `rooms: Room[]` and never reads it. So there is no room-vs-room overlap check and no furniture-outside-room check. The panel then asserts:

> "No furniture overlaps or door swing blocks detected. Interior pathways have optimal physical clearances."

**A false clean bill of health** on a panel labelled "Code & Safety Verification." That is worse than no check at all.

### M4 — Door-swing collision geometry is wrong
The swing is modelled as a `2w × 2w` box centred on the hinge (`geoUtils.ts:250`). A door sweep is a quarter-disc anchored at the hinge, so this reports collisions *through the wall* and *behind the hinge*, producing false positives while missing real blocks on the swing side.

### M5 — Fabricated regulatory citations
The audit asserts, with no computation and no source:

- *"International Building Code (IBC) requires natural light window area to be at least 8-10% of room floor area"* — the code never computes this; it is a static "you have zero windows" message wearing a code citation.
- *"Residential building codes mandate at least one fully partitioned bathroom"*
- *"ADA Access: Narrow Doorways"* — ADA is US-specific; the app is metric-first.
- *"Universal Design: Bath Turning Radius"* — checks `width < 60 || height < 60` px (=1.5 m) with no turning-circle math.

For a product whose UI and disclaimer lean heavily on compliance framing, presenting invented code numbers is a real liability. Either cite a real, versioned code or soften to "design heuristic."

### M6 — Passive-solar advice is backwards for the target user
`AiAssistantPanel.tsx` unconditionally advises: *"Place primary living room windows on the south-facing wall (northern hemisphere)."* Nairobi is at ~1.3°S — **southern hemisphere**, where the sun tracks to the **north**. The advice is inverted for the user's location, and it is shown with no hemisphere awareness at all.

### M7 — Fake confidence percentages
`suggestRoomName` returns hardcoded constants (`96`, `94`, `65`…) from if/else rules. The UI renders them as `{confidence}% Match` (`PropertyInspector.tsx`) and `{confidence}% match` (`AutoLabelRoomsModal.tsx`), implying a model score. The modal is badged **"AI Heuristic Engine"** — it is neither AI nor a scored classifier; it does not even use the Gemini API.

### M8 — Static fallback text is presented as AI output
When `/api/optimize-costs` fails (always, per C1), `CostEstimatorPanel` falls back to hardcoded strings displayed under the heading **"AI Cost Optimization Insights"** — including the reassuring *"Layout is highly efficient for the selected quality tier. No major cost sinks identified."* Users cannot distinguish a live analysis from a fallback.

### M9 — Cost estimator has no Africa, and reports $0 for roomless plans
- `REGION_MULTIPLIERS` offers North America, Europe, Asia, South America, Global Average. **No Africa** — notable for a Nairobi-based user, while South America gets an entry.
- `metrics.areaM2` sums **room** rectangles, not the wall envelope. A plan with walls but no room zones — the normal result of hand-drawing — estimates **$0 total**.

### M10 — Zoom clamps disagree
Toolbar clamps to `[0.5, 2.0]`; the canvas wheel clamps to `[0.4, 2.5]`. Wheel-zoom to 250%, click zoom-in, and it snaps back to 200%.

### M11 — The documented "double click to finish" does not exist
`handleDoubleClick` is defined at `FloorPlanCanvas.tsx:359` but the `<svg>` element never receives an `onDoubleClick` prop — **[VERIFIED]** by grep, `onDoubleClick` appears exactly once in the whole codebase (its own definition). The on-canvas help text says *"Click to start drawing a wall. Double click to finish segment."* That instruction is false; only Escape works.

### M12 — Releasing the mouse outside the canvas leaves elements permanently stuck
`handleMouseUp` is bound to the `<svg>` only, with no `window`-level listener. Release outside the SVG and `isDraggingElement` stays `true` forever — the element stays glued to the cursor across the whole page. Same root cause class as C3.

### M13 — `e.preventDefault()` in the wheel handler is a no-op
React attaches `wheel` at the root container as a **passive** listener, so `preventDefault()` in `onWheel` (`FloorPlanCanvas.tsx:352`) is ignored and logs *"Unable to preventDefault inside passive event listener."* Zoom cannot suppress page scroll. Needs `svgRef.current.addEventListener('wheel', h, { passive: false })`.

### M14 — Markdown in the chat renders completely unstyled
`ArchitectChatPanel.tsx` uses `className="markdown-body prose prose-invert prose-sm max-w-none"`. **[VERIFIED]** `prose` appears **0 times** in the built CSS — `@tailwindcss/typography` is not in `package.json`, and `src/index.css` is a bare `@import "tailwindcss";`. LLM output therefore renders as unstyled text: no headings, no list bullets, no code blocks, no spacing. `markdown-body` is likewise undefined.

---

## LOW / HYGIENE

### L1 — Layer controls disappear the moment you select anything
`PropertyInspector` returns the "Blueprint Layers" panel **only** from the `!selectedElement` early-return branch, so it is unreachable while editing. Separately, `if (layer === 'grid') return null` skips the grid with no alternative control — **the grid can never be toggled off**, despite `grid` being a documented layer.

### L2 — Three sources of truth for one setting
`showWallLabels` (App), `layerVisibility.wallLabels` (App), and `localShowWallLabels` (FloorPlanCanvas), kept in sync by calling `setLayerVisibility` from inside the `setShowWallLabels` updater.

### L3 — High-contrast mode does not defeat dark mode
The shell gets `bg-white text-black`, but children keep `dark:*` variants, which Tailwind v4 drives from `prefers-color-scheme` — not from `highContrast`. On a dark-mode OS, "High Contrast" still renders dark children. Also `animate-spin-slow` (`PropertyInspector.tsx`) is not a Tailwind class — **[VERIFIED]** absent from the built CSS.

### L4 — `formatDimension` can emit `5' 12"`
`geoUtils.ts:24-27` rounds inches independently of feet: `71.6"` → `floor(5)`, `round(11.6) = 12` → **`5' 12"`**. Carry the round-up into the feet.

### L5 — Every furniture preset uses the bed icon
`SidebarPalette.tsx` hardcodes `<Bed className=... />` in the furniture map, so toilets, bathtubs, fridges, and plants all render as a bed.

### L6 — Room preset colors are silently dropped
`roomPresets` define a per-type `color` (Bathroom red, Kitchen amber…), but `handlePaletteSelect`/`onInstantAdd` never pass it and the canvas hardcodes `rgba(59, 130, 246, 0.08)`. **Every stamped room is blue**, regardless of type.

### L7 — `/api/analyze-land-photo` is ~180 lines of unreachable code
Nearly a duplicate of `/api/design-from-photo`, differing only in model, defaults, and `contents` shape. **[VERIFIED]** no frontend `fetch()` targets it — only 5 endpoints are called from `src/`. Delete it.

### L8 — `Promise.all` without `allSettled`
One flaky model call rejects the whole batch (server.ts:288, 407, 546), so the user loses *all* variants on a single transient failure, with a generic 500.

### L9 — `app.listen` has no error handler
**[VERIFIED]** a port conflict crashed the process outright with an unhandled `'error'` event (`EADDRINUSE`). Add `.on('error', ...)`.

### L10 — Boilerplate leftovers and dead code
- `package.json` → `"name": "react-example"`; `index.html` → `<title>My Google AI Studio App</title>`
- No `LICENSE` file, though every source carries `SPDX-License-Identifier: Apache-2.0`
- `vite.config.ts:17` contains mojibake (`Do not modifyâ—file`) — the file was saved with the wrong encoding
- `assets/.aistudio/.gitignore` contains `*` (a directory that ignores its own contents)
- Unused imports **[VERIFIED]**: `HelpCircle, Info, Home, Layers, Settings, Ruler, Flame, CheckCircle2` (App.tsx); `FlameKindling, EyeOff, Settings` (Toolbar); `calculateRoomArea` imported but unused in App.tsx and CostEstimatorPanel; `Wall, Room, Opening`, `getClosestPointOnSegment` (ARViewer); `isGenericLabel` and `formatWallDimensions().combinedStr` computed and never read
- `PIXELS_PER_METER = 40` redefined in `ARViewer` instead of imported from `geoUtils`

---

## Resolution status — all findings now fixed

The findings above were reported first; every one has since been implemented and
verified (`tsc --noEmit` clean, `vite build` clean, live HTTP probes re-run).
Highlights:

| Area | Fix |
|---|---|
| C1 dead models | One `MODELS` map (env-overridable) → `gemini-3.8-flash` / `gemini-3.1-pro-preview` / `gemini-3.5-flash-lite`; logged at boot; `/api/health` reports them |
| C2 corrupt undo | `useReducer` replaces three `useState` values + `setTimeout`-in-updater; immutable updates, history capped at 100 |
| C3 sticky drag | Drag starts on `mousedown`, ends on a `window` `mouseup` |
| C4 toggle states | `buttonClass()` returns ONE class string; no conflicting utilities |
| C5 no rate limit | `express-rate-limit` on `/api/*`; body limit 50 MB → 10 MB |
| H1/H2 error paths | Input coercion everywhere; JSON error handler; new `apiPost` checks `response.ok` before parsing |
| H3 crash risk | `normalizePlan()` guards all model output; app wrapped in `ErrorBoundary` |
| H4–H9 AR | Real PNG capture, doors/windows rendered, reactive XR session, no CDN `Environment`, lazy-loaded |
| M3/M4 audit | `rooms` parameter now used; door swing is a true quarter-disc sector |
| M5/M7/M8 honesty | No fabricated code citations; heuristic scores labelled; AI vs local fallback distinguished |
| M6/M9 locale | Hemisphere-correct solar advice; Africa + Middle East regions; area falls back to wall envelope |
| M11–M14 | `onDoubleClick` wired; window-level mouseup; non-passive wheel; typography plugin for `prose` |

**Verified impact:** initial JS bundle 1,605 kB → **491 kB** (447 → 141 kB gzip, −69%);
all previously-500 endpoints now return clean 400/413 JSON.

See **`IMPROVEMENTS.md`** for what remains.

---

## Original note on method

---

## Suggested fix order

**Day 1 — unbreak the product**
1. **C1** — repoint all six model IDs at live models; hoist to one constant; add a startup model smoke test.
2. **C3 + M12** — move drag initiation to `mousedown`, add a `window` `mouseup` listener.
3. **C2** — replace `push` with `[...prev.rooms, newItem]`; move `id` generation inside the updater.
4. **C4** — stop concatenating conflicting Tailwind class strings (pick one string, or add `tailwind-merge`).

**Week 1 — stop the bleeding**
5. **C5** — rate-limit and/or require auth on `/api/*`; lower the 50 MB limit; compress images client-side before upload.
6. **H3** — add `normalizePlan()` + an app-level error boundary.
7. **H1 + H2** — validate request bodies; make all Express errors return JSON; check `response.ok` before `response.json()`.
8. **M14** — add `@tailwindcss/typography`, or write the handful of markdown styles by hand.

**Next**
9. **H9** — `React.lazy()` the AR viewer; drop `Environment preset="city"`.
10. **H4, H5, H6, H7** — fix or remove the AR feature; at minimum delete the fake camera button and render openings.
11. **M3, M4, M5, M7, M8** — make the audit honest: implement the checks it claims, or relabel the panel as heuristics and drop the fake scores and code citations.
12. **M6, M9** — hemisphere-aware solar advice; add Africa to regions; derive cost area from the wall envelope.

---

## Note on method

Findings marked **[VERIFIED]** were confirmed by running code: `tsc --noEmit` (clean), `vite build` (clean, 1,605 kB main chunk), live HTTP probes against the dev server, byte-offset inspection of the generated CSS, and a standalone reproduction of the `handleInstantAdd` reducer.

The Gemini calls themselves could not be executed — this sandbox has no route to `generativelanguage.googleapis.com`. I confirmed the SDK does attempt that host correctly, so **C1 rests on Google's published shutdown dates rather than a live 404.** Everything else is from the code as it runs today.
