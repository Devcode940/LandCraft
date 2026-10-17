# Security

## Reporting a vulnerability

Report privately through GitHub's "Report a vulnerability" (Security →
Advisories). Please do not open a public issue for a live vulnerability.

Include reproduction steps and the impact you believe it has. You can expect an
acknowledgement within a few days.

## Threat model

This is a single-tenant web app with no authentication and no user data at rest.

**What is at risk**

- **The Gemini API key.** Server-side only. Never sent to the client, never
  logged. `GIT_COMMIT` and model names are exposed via `/api/ready`; secrets are
  not.
- **API spend.** Every `/api/*` request is rate limited per client IP
  (`RATE_LIMIT_PER_MIN`, default 30/min). Each generation request fans out to at
  most three model calls, and `variantsCount` is clamped to 3.
- **Request smuggling and header injection.** Inbound `X-Request-Id` values are
  only echoed when they match `[A-Za-z0-9._-]{8,128}`; anything else is replaced
  with a generated id, so an attacker cannot write arbitrary content into logs
  or response headers.

**What is deliberately not protected**

- Anyone who can reach the app can spend your Gemini quota, up to the rate
  limit. If the app is public, put it behind authentication at the edge.
- Uploaded images are held in memory for the duration of one request and are
  not persisted.

## Hardening already in place

- **CSP** with `script-src 'self'` in production — no inline script, no `eval`.
  Helmet defaults for `X-Content-Type-Options`, `Referrer-Policy`, HSTS in
  production, and `object-src 'none'`.
- **Body limit** of 10 MB, with a JSON error handler so an oversized upload
  returns a 413 JSON body rather than an HTML error page.
- **Strict input coercion** on every route: numbers clamped to sane ranges,
  text trimmed and length-capped, image MIME allow-listed and base64 validated
  before it reaches the model.
- **No secret in client code.** A grep of `dist/assets/*.js` for `GEMINI` or
  `AIza` returns nothing.
- **Non-root container** and a pruned production dependency tree.

## Dependency policy

`npm audit` runs in CI. Advisories that are unreachable at runtime (for
example, a parser that only ever sees our own build-time CSS) are documented in
the commit that defers them rather than silently ignored.
