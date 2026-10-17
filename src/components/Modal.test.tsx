/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Modal from './Modal';

function openWith(onClose = vi.fn()) {
  const user = userEvent.setup();
  const utils = render(
    <>
      <button type="button">Before</button>
      <Modal label="Test dialog" onClose={onClose}>
        <h2>Test dialog</h2>
        <button type="button">First</button>
        <button type="button">Second</button>
        <button type="button">Last</button>
      </Modal>
    </>,
  );
  return { user, onClose, ...utils };
}

afterEach(() => {
  cleanup();
  document.body.style.overflow = '';
});

describe('Modal', () => {
  it('exposes dialog semantics a screen reader can announce', () => {
    openWith();
    const dialog = screen.getByRole('dialog', { name: 'Test dialog' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAttribute('aria-labelledby');
  });

  it('moves focus into the dialog on open', async () => {
    openWith();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'First' })).toHaveFocus();
    });
  });

  it('returns focus to the opener on unmount', async () => {
    const opener = document.createElement('button');
    opener.textContent = 'Opener';
    document.body.appendChild(opener);
    opener.focus();
    expect(opener).toHaveFocus();

    const { unmount } = render(
      <Modal label="Return focus" onClose={() => {}}>
        <button type="button">Inside</button>
      </Modal>,
    );
    await waitFor(() => expect(screen.getByRole('button', { name: 'Inside' })).toHaveFocus());

    unmount();
    expect(opener).toHaveFocus();
    opener.remove();
  });

  it('wraps Tab from the last control back to the first', async () => {
    const { user } = openWith();
    const first = screen.getByRole('button', { name: 'First' });
    const last = screen.getByRole('button', { name: 'Last' });

    await waitFor(() => expect(first).toHaveFocus());
    last.focus();
    await user.tab();
    expect(first).toHaveFocus();
  });

  it('wraps Shift+Tab from the first control back to the last', async () => {
    const { user } = openWith();
    const first = screen.getByRole('button', { name: 'First' });
    const last = screen.getByRole('button', { name: 'Last' });

    await waitFor(() => expect(first).toHaveFocus());
    await user.tab({ shift: true });
    expect(last).toHaveFocus();
  });

  it('closes on Escape', async () => {
    const onClose = vi.fn();
    const { user } = openWith(onClose);
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not close on Escape when not dismissible', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(
      <Modal label="Busy" onClose={onClose} dismissible={false}>
        <button type="button">Working</button>
      </Modal>,
    );
    await user.keyboard('{Escape}');
    expect(onClose).not.toHaveBeenCalled();
  });

  it('locks background scroll while open and restores it after', () => {
    const { unmount } = render(
      <Modal label="Scroll lock" onClose={() => {}}>
        <button type="button">Inside</button>
      </Modal>,
    );
    expect(document.body.style.overflow).toBe('hidden');
    unmount();
    expect(document.body.style.overflow).toBe('');
  });

  it('renders into document.body so a transformed ancestor cannot clip it', () => {
    const { container } = render(
      <div style={{ transform: 'translateZ(0)', overflow: 'hidden' }}>
        <Modal label="Portal" onClose={() => {}}>
          <button type="button">Inside</button>
        </Modal>
      </div>,
    );
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(document.body.querySelector('[role="dialog"]')).not.toBeNull();
  });
});
