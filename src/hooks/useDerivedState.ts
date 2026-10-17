/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from 'react';

/**
 * Runs `onReset` when any entry of `deps` changes, adjusting state during
 * render instead of inside an effect.
 *
 * This is React's documented replacement for the `useEffect(() => setState(...),
 * [dep])` pattern. The effect form forces a committed paint with the stale
 * value and then a second render — visible as a flicker on number inputs — and
 * the react-hooks linter now rejects it outright.
 *
 * `onReset` is invoked at most once per dependency change and must be cheap
 * (a handful of `setState` calls), never a network request or subscription.
 */
export function useResetOnDeps(deps: readonly unknown[], onReset: () => void): void {
  const [prev, setPrev] = useState<readonly unknown[]>(deps);

  const changed = prev.length !== deps.length || deps.some((d, i) => !Object.is(d, prev[i]));
  if (changed) {
    setPrev(deps);
    onReset();
  }
}

/**
 * Single-dependency shorthand for {@link useResetOnDeps}.
 */
export function useResetOnChange<T>(value: T, onReset: () => void): void {
  const [prev, setPrev] = useState<T>(value);
  if (!Object.is(prev, value)) {
    setPrev(value);
    onReset();
  }
}
