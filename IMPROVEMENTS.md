# Remaining improvements

Updated after the production-hardening pass. Most of the original backlog is
now done — see [What shipped](#what-shipped) at the bottom. This file is only
what is still outstanding, ordered by value.

Effort: **S** ≈ under an hour, **M** ≈ a day, **L** ≈ several days or needs a
decision first.

---

## 1. Correctness

### 1.1 `floors` is collected, sent to the model, and ignored — **M**

The generation form asks for a floor count, `readBrief()` passes it to the
prompt, and the model returns a single-level plan. Nothing on the canvas can
represent a second storey.

Either implement storeys — a `FloorPlanData[]` plus a storey selector, with the
undo stack keyed per storey — or remove the field. Shipping a control that
silently does nothing is worse than not having it.

### 1.2 Wall thickness is inconsistent — **S**

Exterior walls are 12px, interior 8px in the prompt, but the drawing tools
default everything to 10px. The audit's assumptions and the user's actual
geometry disagree.

### 1.3 Rooms are rectangles only — **M**

An L-shaped room is drawn as two overlapping rooms, which inflates the area
statistic and confuses the auto-labeller. A polygon room type would fix it;
the cost is rewriting hit-testing, the SVG render, and `calculateRoomArea`.

### 1.4 The cost estimator is a rough order of magnitude — **L**

Rates are regional averages with a flat 15% contingency. It is labelled as ROM
in the UI and should stay that way unless someone builds a real quantity
take-off (measured wall lengths, opening schedules, material yields).

---

## 2. Performance

### 2.1 The canvas re-renders every element on every mousemove — **M**

`FloorPlanCanvas` is a single component holding all four collections. During a
drag it re-renders every wall, room, opening and furniture item at ~60fps. At
the current scale (tens of elements) this is invisible; at a few hundred it
will not be.

The fix is to memoise the element subtree (`React.memo` per element, or move
each collection into its own `<g>` with memoised children) and keep only the
dragged element in fast-changing state. Profile before optimising — it may
never matter for real use.

### 2.2 `suggestRoomName` runs during canvas render — **S**

It is called to label rooms as they are drawn. It is cheap per call but runs
on every render. Move it behind `useMemo` keyed on the room's dimensions and
furniture.

### 2.3 The static audit is O(n²) — **S**

`checkOverlapWarnings` compares every furniture item with every other. Fine at
tens of items, quadratic at hundreds. A spatial hash keyed on a coarse grid
would make it linear; only worth doing if plans get large.

---

## 3. Architecture

### 3.1 One giant `App.tsx` — **M**

It is now ~750 lines and owns viewport state, selection, layer visibility,
modals, persistence, shortcuts, and the stats bar. Extracting a
`useEditorState` hook (plan + history) and a `useViewport` hook would leave
`App` as layout plus wiring.

### 3.2 No data layer for AI calls — **S**

Each panel calls `apiPost` directly and hand-rolls its own loading, error and
fallback states. A small `useAiRequest` hook would remove three near-duplicate
implementations and make the fallback behaviour consistent.

### 3.3 `src/utils` and `src/lib` overlap — **S**

`normalizePlan` and `geoUtils` are pure and belong in `lib` with the others.
The split is historical, not principled.

---

## 4. Testing

### 4.1 No canvas interaction tests — **M**

The editor's most complex logic — wall chains, snapping, drag bookkeeping,
room resize — has no automated coverage. It is currently verified by hand.
`@testing-library` with synthetic pointer events over the SVG would cover the
common paths; the window-level mouseup/passive-wheel behaviour needs jsdom
shims.

### 4.2 No AI endpoint contract tests — **M**

The request-coercion logic in `server.ts` (`clampNum`, `parseImage`,
`normalizeMessages`) is exactly the kind of code that should have a test table,
and it is currently only covered by manual `curl` probes. Extracting those
helpers into `server/validation.ts` would make them unit-testable without
booting Express.

### 4.3 No visual regression baseline — **L**

An SVG floor plan is a good candidate for snapshot testing. Playwright against
the built app with a fixed plan fixture would catch layout regressions that
unit tests cannot see.

---

## 5. Accessibility

### 5.1 The AR viewer and chat panel are not dialogs — **S**

`AutoLabelRoomsModal` and `CostEstimatorPanel` now use the `Modal` primitive.
`ARViewer` (full-screen) and `ArchitectChatPanel` (a docked panel) still don't:
the chat panel should at least close on Escape, and the AR viewer needs an
escape hatch that is reachable by keyboard before the WebXR session starts.

### 5.2 Canvas has no keyboard alternative — **L**

Every element is mouse-only. A keyboard user can inspect and edit a selected
element through the property inspector, but cannot select one in the first
place. Tabbing through elements and nudging with arrow keys would be a real
improvement; it is also a substantial interaction design job.

### 5.3 No focus-visible styling audit — **S**

Tailwind's default focus ring is present but has not been checked against the
high-contrast theme.

---

## 6. Operations

### 6.1 Rate limiting is per-instance, in memory — **M**

`express-rate-limit` with the default store counts per process. Behind more
than one replica, a client gets N× the configured limit. The limit is
documented as a cost ceiling, so this matters if the app is scaled out.

Fix: a shared store (`rate-limit-redis`, or Firestore/Memcache on GCP).

### 6.2 No error reporting service — **M**

Errors go to stdout as JSON and are caught by the log aggregator, but there is
no grouping, alerting, or release tagging. Sentry (or equivalent) needs a DSN
and is a deploy-time decision.

### 6.3 No metrics — **M**

There are structured request logs but no counters or latency histograms. Time
to first plan, AI failure rate, and p95 generation latency are the numbers
worth watching, and none are instrumented.

### 6.4 No authentication — **L**

Anyone who can reach the app spends the Gemini quota, bounded only by the rate
limit. If it is deployed publicly, put it behind auth at the edge (IAP, Cloud
Run's built-in IAM, or an OAuth proxy) rather than building auth here.

### 6.5 No backup or account model — **L**

Plans live in one browser's `localStorage`. There is no server-side storage, no
account, no sharing, and clearing site data loses everything. That is a
deliberate local-first choice, but it should be an explicit product decision
rather than an accident.

---

## What shipped

**Drafting accelerators (2026-10-18):**
Numeric wall length (type an exact dimension while
drafting; the typed value is the spec, so it is not
grid-snapped), repeat placement (P), split wall &
insert door in the wall inspector, and a room
schedule modal with CSV export.

**Multi-select, clipboard, live collisions (2026-10-18):**
Shift/Ctrl+click selects several elements of one type and
drags them as a group (rooms still carry their contents);
the eraser clears a whole selection in one undo step.
Ctrl+C/X/V/D copy, cut, paste and duplicate -- pasted
elements get fresh ids and a stacking offset, and openings
lose their wall pin. `checkOverlapWarnings` now runs on
every plan change (skipped above 600 elements) and shows
an amber strip, instead of only inside the AI audit panel.

**Chat-driven edits (2026-10-18):**

**Chat-driven edits (2026-10-18):** the architect chat can now modify the
existing plan instead of only regenerating it. The model calls
`edit_floor_plan` with a whitelisted, typed edit list (resize/move/relabel
room, add/move furniture, add wall, delete element); `applyEdits`
validates every item, applies the good ones through the same pure
`planOps` helpers the canvas uses, and skips bad ones with a reason.
Edits land as one undoable history step via a new `apply-edits` reducer
action, so Ctrl+Z rolls back a whole AI edit. The reducer owns freshness,
which let us delete the `planRef` latest-value pattern entirely.

**Print / PDF (2026-10-18):** a Print / PDF button next to the SVG/JSON
exporters. `printBlueprint` gives the CSS-sized SVG intrinsic dimensions
and a viewBox for the printer and restores them on `afterprint`; a print
stylesheet hides all chrome so the sheet carries only the blueprint.

**Correction:** inline wall dimensions (with a toggle) and room
area/perimeter in the inspector already existed; an earlier review pass
listed them as missing based on a grep that missed the names
(`effectiveShowWallLabels`, `calculateRoomArea`).

Everything below was on this list and is now done.

**Correctness** — `strict: true` plus `noUnusedLocals`/`noUnusedParameters`
(0 errors); the Measure tool actually measures; moving a room carries its
contents; undo/redo keyboard shortcuts; 89 unit tests.

**Persistence** — debounced autosave to `localStorage`, restored on load, plus
JSON import with validation and a dismissable error toast.

**Types** — all 30 `any` warnings eliminated. That surfaced four real holes:
the palette item, `apiPost`'s default generic, the inspector's selected
element, and three untyped AI responses.

**Server** — Helmet CSP/HSTS/referrer policy, compression, structured JSON
request logs with correlation ids, `trust proxy` fixed (one hop, so the rate
limiter sees real client IPs instead of throttling everyone as one), graceful
SIGTERM drain, crash handlers, `/api/ready` readiness probe, and hashed-asset
immutable caching.

**Build** — `vite` is no longer imported at module scope in `server.ts`; it is
a devDependency, so the production bundle used to die on boot with
`MODULE_NOT_FOUND`. Also split runtime from build dependencies so
`npm prune --omit=dev` actually works.

**Infrastructure** — multi-stage Dockerfile (non-root, PID-1 signals, health
check), CI with typecheck/lint/format/test/build, a guard against the
dev-import regression, and a Docker build that smoke-tests the real image.

**Accessibility** — accessible `Modal` primitive with focus trap, Escape,
focus restoration and scroll lock; error boundaries at the root and around the
two most fragile panels.

**Docs** — README, CONTRIBUTING, SECURITY with a threat model, and
`.env.example`.
