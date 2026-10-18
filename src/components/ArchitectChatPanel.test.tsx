/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * The architect chat is the one place where model output becomes
 * canvas state. These tests pin the contract: a `generatedPlan`
 * replaces the whole plan, an `edits` array patches it, and the
 * user always sees what happened.
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ArchitectChatPanel from './ArchitectChatPanel';
import type { EditResult } from '../lib/planEdits';
import type { FloorPlanData } from '../types';

vi.mock('../utils/apiClient', () => ({
  apiPost: vi.fn(),
}));

import { apiPost } from '../utils/apiClient';

const mockedPost = vi.mocked(apiPost);

const plan: FloorPlanData = {
  walls: [{ id: 'w1', x1: 0, y1: 0, x2: 400, y2: 0, thickness: 12 }],
  rooms: [{ id: 'r1', x: 0, y: 0, width: 400, height: 300, label: 'Kitchen', color: 'bg-red-100' }],
  openings: [],
  furniture: [],
};

function editResult(applied: number): EditResult {
  return {
    plan,
    applied,
    skipped: [],
    summaries: applied ? ['resized Kitchen to 15.00 m × 10.00 m'] : [],
  };
}

function renderPanel(over: Partial<Parameters<typeof ArchitectChatPanel>[0]> = {}) {
  const onClose = vi.fn();
  const onUpdatePlan = vi.fn();
  // An explicit override wins, and is the same reference the
  // assertions below check -- otherwise the default mock would
  // be returned while the component used the override.
  const onApplyEdits = over.onApplyEdits ?? vi.fn(() => editResult(1));
  const utils = render(
    <ArchitectChatPanel
      plan={plan}
      onClose={onClose}
      onUpdatePlan={onUpdatePlan}
      onApplyEdits={onApplyEdits}
      {...over}
    />,
  );
  return { onClose, onUpdatePlan, onApplyEdits, ...utils };
}

afterEach(() => {
  vi.clearAllMocks();
});

describe('ArchitectChatPanel', () => {
  it('renders as a non-modal floating panel', () => {
    renderPanel();
    expect(screen.getByText('AI Architect Chat')).toBeInTheDocument();
    // Floating panels are not dialogs; they must not trap focus.
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('closes on Escape', async () => {
    const user = userEvent.setup();
    const { onClose } = renderPanel();
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();
  });

  it('sends the conversation and current plan to the server', async () => {
    const user = userEvent.setup();
    mockedPost.mockResolvedValue({ success: true, text: 'Sure thing.' });
    const { onApplyEdits } = renderPanel();

    await user.type(screen.getByPlaceholderText(/ask about design/i), 'Make the kitchen bigger{Enter}');

    expect(mockedPost).toHaveBeenCalledWith('/api/architect-chat', {
      messages: [{ role: 'user', content: 'Make the kitchen bigger' }],
      plan,
    });
    // No edits in the response: nothing is applied.
    expect(onApplyEdits).not.toHaveBeenCalled();
    expect(await screen.findByText('Sure thing.')).toBeInTheDocument();
  });

  it('applies structured edits and reports them in the transcript', async () => {
    const user = userEvent.setup();
    mockedPost.mockResolvedValue({
      success: true,
      text: 'Done.',
      edits: [{ kind: 'resizeRoom', roomId: 'r1', width: 600, height: 400 }],
    });
    const { onApplyEdits } = renderPanel();

    await user.type(screen.getByPlaceholderText(/ask about design/i), 'Bigger kitchen{Enter}');

    expect(onApplyEdits).toHaveBeenCalledWith([
      { kind: 'resizeRoom', roomId: 'r1', width: 600, height: 400 },
    ]);
    // The receipt names what changed and how to undo it.
    expect(await screen.findByText(/Applied 1 change to the canvas/)).toBeInTheDocument();
    expect(screen.getByText(/resized Kitchen to 15\.00 m × 10\.00 m/)).toBeInTheDocument();
    expect(screen.getByText(/Ctrl\+Z undoes/)).toBeInTheDocument();
  });

  it('reports skipped edits instead of silently dropping them', async () => {
    const user = userEvent.setup();
    mockedPost.mockResolvedValue({
      success: true,
      text: 'Done.',
      edits: [{ kind: 'resizeRoom', roomId: 'ghost-room', width: 100, height: 100 }],
    });
    const { onApplyEdits } = renderPanel({
      onApplyEdits: vi.fn(() => ({
        ...editResult(0),
        skipped: [{ index: 0, reason: 'resizeRoom: no room with id ghost-room' }],
      })),
    });

    await user.type(screen.getByPlaceholderText(/ask about design/i), 'Resize it{Enter}');

    expect(onApplyEdits).toHaveBeenCalled();
    expect(
      await screen.findByText(/Skipped edit 1: resizeRoom: no room with id ghost-room/),
    ).toBeInTheDocument();
  });

  it('still supports full-plan regeneration', async () => {
    const user = userEvent.setup();
    mockedPost.mockResolvedValue({
      success: true,
      text: 'Here is a new layout.',
      generatedPlan: { plan: { ...plan, rooms: [] } },
    });
    const { onUpdatePlan, onApplyEdits } = renderPanel();

    await user.type(screen.getByPlaceholderText(/ask about design/i), 'New layout{Enter}');

    expect(onUpdatePlan).toHaveBeenCalledWith({ ...plan, rooms: [] });
    expect(onApplyEdits).not.toHaveBeenCalled();
  });

  it('shows model errors in the transcript', async () => {
    const user = userEvent.setup();
    mockedPost.mockRejectedValue(new Error('API key missing'));
    renderPanel();

    await user.type(screen.getByPlaceholderText(/ask about design/i), 'Hello{Enter}');

    expect(await screen.findByText(/API key missing/)).toBeInTheDocument();
  });
});
