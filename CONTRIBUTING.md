# Contributing

## Before you push

```bash
npm run verify      # typecheck + tests + build
npm run format      # Prettier
```

CI runs the same commands plus a Docker build and a smoke test of the image, so
a local `verify` is the cheapest way to find out you have broken something.

## Rules that are not negotiable

**`src/lib` stays pure.** No React imports, no DOM access, no `window`. If a
function needs the DOM, it belongs in `hooks/` or `components/`.

**Never trust model output.** Anything coming back from Gemini goes through
`normalizePlan()` before it is rendered or stored. A model returning
`{"rooms": null}` must not be able to blank the canvas or throw.

**Never mutate a plan.** Every operation returns a new object. The undo history
holds references to every previous plan; mutating one silently rewrites the
past. `src/lib/planOps.ts` exists so there is exactly one place to get this
right, and `editorState.test.ts` asserts that untouched collections keep their
identity.

**No secrets in the client.** The browser talks to `/api/*` and nothing else.
The Gemini key lives only in the server process.

**Add a test with the fix.** A bug that was worth fixing was worth a test that
would have caught it. Look at the existing files for the shape.

## Commit messages

Explain *why*, not what. The diff already says what changed. If you are fixing
a bug, say what the user saw before and why the old code produced it.

## Accessibility

High-contrast mode must remain a genuine override: it forces light styling and
disables dark-mode child variants. Do not add colour-only affordances, and keep
the `aria-label`s on icon-only buttons.

## Adding an AI feature

1. Put the prompt and response schema in `server.ts` next to the existing ones.
2. Coerce and clamp every field in the request body — `clampNum`, `clampInt`,
   `cleanText`. Assume the caller is hostile.
3. Return `{ success, ... }` on success and `{ success: false, error, message }`
   on failure, with a message a user can act on.
4. Normalise any plan in the response before sending it.
5. Fall back to something useful when the call fails. The client should degrade,
   not break.
