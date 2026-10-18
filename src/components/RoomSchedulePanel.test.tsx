/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import RoomSchedulePanel from './RoomSchedulePanel';
import type { FloorPlanData } from '../types';

vi.mock('../lib/download', () => ({ downloadBlob: vi.fn() }));

const plan: FloorPlanData = {
  walls: [],
  rooms: [
    { id: 'r1', x: 0, y: 0, width: 400, height: 300, label: 'Kitchen', color: 'bg-red-100' },
    { id: 'r2', x: 0, y: 0, width: 200, height: 200, label: 'Bath', color: 'bg-blue-100' },
  ],
  openings: [],
  furniture: [],
};

describe('RoomSchedulePanel', () => {
  it('renders as an accessible dialog with one row per room', () => {
    render(<RoomSchedulePanel plan={plan} unit="m" onClose={vi.fn()} />);
    expect(screen.getByRole('dialog', { name: /room schedule/i })).toBeInTheDocument();
    expect(screen.getByText('Kitchen')).toBeInTheDocument();
    expect(screen.getByText('Bath')).toBeInTheDocument();
  });

  it('shows the total build area', () => {
    render(<RoomSchedulePanel plan={plan} unit="m" onClose={vi.fn()} />);
    // 10x7.5 + 5x5 = 100 m2
    expect(screen.getByText('100.0 m²')).toBeInTheDocument();
  });

  it('exports CSV', async () => {
    const user = userEvent.setup();
    const { downloadBlob } = await import('../lib/download');
    render(<RoomSchedulePanel plan={plan} unit="m" onClose={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: /export csv/i }));
    expect(downloadBlob).toHaveBeenCalledWith(
      expect.stringContaining('landcraft-room-schedule-'),
      expect.stringContaining('Kitchen, North'.replace(', North', '')), // header row check below
      'text/csv',
    );
    const csv = (downloadBlob as ReturnType<typeof vi.fn>).mock.calls[0][1] as string;
    expect(csv.split('\n')[0]).toBe('Room,Width,Height,Area,Perimeter');
  });

  it('says so when there are no rooms', () => {
    render(<RoomSchedulePanel plan={{ ...plan, rooms: [] }} unit="m" onClose={vi.fn()} />);
    expect(screen.getByText(/no rooms yet/i)).toBeInTheDocument();
  });
});
