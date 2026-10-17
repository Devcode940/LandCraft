/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ErrorBoundary from './ErrorBoundary';

function Boom(): never {
  throw new Error('kaboom');
}

/** Renders only when `shouldThrow` is false, so recovery can be exercised. */
function Flaky({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) throw new Error('kaboom');
  return <p>Recovered content</p>;
}

beforeEach(() => {
  // React logs the caught error; keep the test output readable.
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ErrorBoundary', () => {
  it('renders children when nothing throws', () => {
    render(
      <ErrorBoundary>
        <p>Fine</p>
      </ErrorBoundary>,
    );
    expect(screen.getByText('Fine')).toBeInTheDocument();
  });

  it('renders the fallback instead of unmounting the tree', () => {
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );
    expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();
    expect(screen.getByText('kaboom')).toBeInTheDocument();
  });

  it('tells the user the drawing is autosaved rather than lost', () => {
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );
    // The old copy said the plan "may not be saved", which stopped being true
    // once autosave landed and sent users looking for a lost file.
    expect(screen.getByText(/autosaved locally/i)).toBeInTheDocument();
  });

  it('panel variant renders a compact card, not a full-screen takeover', () => {
    render(
      <ErrorBoundary variant="panel">
        <Boom />
      </ErrorBoundary>,
    );
    expect(screen.getByText(/this panel failed to render/i)).toBeInTheDocument();
    expect(screen.getByText(/the rest of the editor is unaffected/i)).toBeInTheDocument();
    expect(screen.queryByText(/something went wrong/i)).not.toBeInTheDocument();
  });

  it('uses a custom fallback when given one', () => {
    render(
      <ErrorBoundary fallback={<p>Custom fallback</p>}>
        <Boom />
      </ErrorBoundary>,
    );
    expect(screen.getByText('Custom fallback')).toBeInTheDocument();
  });

  it('recovers when the offending child renders again after a reset', () => {
    // Simulates a transient failure: the boundary must be able to render good
    // content again, which is what a "try again" control relies on.
    const { rerender } = render(
      <ErrorBoundary>
        <Flaky shouldThrow />
      </ErrorBoundary>,
    );
    expect(screen.getByText('kaboom')).toBeInTheDocument();

    // React keeps the boundary in its error state until state resets; a key
    // change is the supported way to retry a subtree.
    rerender(
      <ErrorBoundary key="retry">
        <Flaky shouldThrow={false} />
      </ErrorBoundary>,
    );
    expect(screen.getByText('Recovered content')).toBeInTheDocument();
  });
});
