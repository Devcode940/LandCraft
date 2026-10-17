/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Thin wrapper around fetch for the /api routes.
 *
 * Every call site previously did `const result = await response.json()` and only
 * then checked `response.ok`. Two consequences:
 *   1. A non-JSON error body (Express's HTML 413 page, a proxy error page, an
 *      empty body) threw a SyntaxError inside `response.json()`, so the
 *      server's carefully-worded message was never shown.
 *   2. `result.message` could be undefined on a malformed response.
 *
 * This parses defensively, checks the status FIRST, and always throws an Error
 * carrying the best message available.
 */

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function apiPost<T = any>(url: string, body: unknown, signal?: AbortSignal): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err;
    throw new ApiError('Could not reach the server. Check your connection and try again.', 0);
  }

  const text = await response.text();

  let data: any = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      // Non-JSON body (HTML error page from Express/a proxy). Fall through and
      // report the HTTP status instead of a confusing SyntaxError.
      data = null;
    }
  }

  if (!response.ok) {
    const message =
      data?.message ||
      data?.error ||
      (response.status === 413
        ? 'That upload is too large. Please use a smaller image.'
        : `Request failed (${response.status}).`);
    throw new ApiError(message, response.status);
  }

  if (data === null) {
    throw new ApiError('The server returned an empty response.', response.status);
  }

  return data as T;
}
