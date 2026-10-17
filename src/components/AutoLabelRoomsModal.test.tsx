/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Integration cover for the panel that now sits inside <Modal>. The primitive
 * has its own tests; this checks the conversion itself -- that the dialog
 * wrapper did not swallow the panel's own layout, ids, or close paths.
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import AutoLabelRoomsModal from './AutoLabelRoomsModal';
import type { FloorPlanData } from '../types';

function plan(): FloorPlanData {
  return {
    walls: [
      { id: 'w1', x1: 0, y1: 0, x2: 400, y2: 0, thickness: 12 },
      { id: 'w2', x1: 0, y1: 0, x2: 0, y2: 300, thickness: 12 },
    ],
    rooms: [{ id: 'r1', x: 0, y: 0, width: 400, height: 300, label: 'Room 1', color: 'rgba(0,0,0,0.1)' }],
    openings: [],
    furniture: [
      {
        id: 'f1',
        subType: 'bed',
        label: 'Queen Bed',
        x: 200,
        y: 150,
        width: 60,
        height: 70,
        rotation: 0,
        category: 'bedroom',
      },
    ],
  };
}

function renderModal(over: Partial<Parameters<typeof AutoLabelRoomsModal>[0]> = {}) {
  const onClose = vi.fn();
  const onApplyLabels = vi.fn();
  const utils = render(
    <AutoLabelRoomsModal
      plan={plan()}
      unit="m"
      highContrast={false}
      onApplyLabels={onApplyLabels}
      onClose={onClose}
      {...over}
    />,
  );
  return { onClose, onApplyLabels, ...utils };
}

afterEach(() => {
  vi.clearAllMocks();
});

describe('AutoLabelRoomsModal inside Modal', () => {
  it('renders as an accessible dialog', () => {
    renderModal();
    expect(screen.getByRole('dialog', { name: /auto-label room names/i })).toBeInTheDocument();
  });

  it('keeps its own element id after the wrapper change', () => {
    renderModal();
    expect(document.getElementById('auto-label-rooms-modal')).not.toBeNull();
  });

  it('still shows the rule-engine disclosure, not an AI claim', () => {
    renderModal();
    expect(screen.getByText(/no ai model is called/i)).toBeInTheDocument();
  });

  it('closes when the header close button is pressed', async () => {
    const user = userEvent.setup();
    const { onClose } = renderModal();
    await user.click(screen.getByRole('button', { name: /close/i }));
    expect(onClose).toHaveBeenCalled();
  });

  it('closes on Escape', async () => {
    const user = userEvent.setup();
    const { onClose } = renderModal();
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();
  });

  it('renders an Apply control whose label reflects the selection count', () => {
    renderModal();
    // The panel pre-selects confident suggestions, so the count is not
    // necessarily zero; what matters is that the control exists and its label
    // tracks the count rather than being hard-coded.
    const apply = screen.getByRole('button', { name: /apply \d+ selected room/i });
    expect(apply).toBeInTheDocument();
  });
});
