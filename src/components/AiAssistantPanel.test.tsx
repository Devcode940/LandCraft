/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * The workbench is a large bottom panel; the minimize
 * control must actually dock it, and the choice must
 * survive a reload.
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import AiAssistantPanel from './AiAssistantPanel';
import type { FloorPlanData } from '../types';

vi.mock('../utils/apiClient', () => ({ apiPost: vi.fn() }));

const plan: FloorPlanData = {
  walls: [],
  rooms: [{ id: 'r1', x: 0, y: 0, width: 400, height: 300, label: 'Kitchen', color: 'bg-red-100' }],
  openings: [],
  furniture: [],
};

function renderPanel() {
  return render(<AiAssistantPanel plan={plan} unit="m" highContrast={false} onLoadPlan={() => {}} />);
}

afterEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});

describe('AiAssistantPanel minimize', () => {
  it('renders expanded by default', () => {
    renderPanel();
    expect(screen.getByText('LandCraft AI Assistant Workbench')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /ai assistant/i })).toBeNull();
  });

  it('minimizes to a launcher and reopens', async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.click(screen.getByRole('button', { name: /minimize workbench/i }));
    // The full header is gone; a compact launcher remains.
    expect(screen.queryByText('LandCraft AI Assistant Workbench')).toBeNull();
    const launcher = screen.getByRole('button', { name: /ai assistant/i });
    expect(launcher).toBeInTheDocument();

    await user.click(launcher);
    expect(screen.getByText('LandCraft AI Assistant Workbench')).toBeInTheDocument();
  });

  it('starts minimized when stored that way', () => {
    localStorage.setItem('landcraft:workbench-minimized', '1');
    renderPanel();
    expect(screen.getByRole('button', { name: /ai assistant/i })).toBeInTheDocument();
    expect(screen.queryByText('LandCraft AI Assistant Workbench')).toBeNull();
  });

  it('persists the minimized choice', async () => {
    const user = userEvent.setup();
    renderPanel();
    await user.click(screen.getByRole('button', { name: /minimize workbench/i }));
    expect(localStorage.getItem('landcraft:workbench-minimized')).toBe('1');
  });

  it('expanding a collapsed bar does not undock it', async () => {
    const user = userEvent.setup();
    renderPanel();
    // Collapse to the compact bar (not minimized).
    await user.click(screen.getByRole('button', { name: /collapse workbench/i }));
    expect(screen.getByText(/Ready to compile layouts/i)).toBeInTheDocument();
    // The minimize control is still available from the bar.
    await user.click(screen.getByRole('button', { name: /minimize workbench/i }));
    expect(screen.getByRole('button', { name: /ai assistant/i })).toBeInTheDocument();
  });
});
