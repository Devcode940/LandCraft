/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Adds the DOM matchers used by the component tests (toHaveFocus, toHaveAttribute...).
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Unmount anything a test left behind so focus and body styles do not leak
// between test files.
afterEach(() => {
  cleanup();
});
