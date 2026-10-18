/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { roomSchedule, scheduleToCsv } from './schedule';
import { emptyPlan } from './planOps';
import type { FloorPlanData } from '../types';

const plan: FloorPlanData = {
  ...emptyPlan(),
  rooms: [
    { id: 'r1', x: 0, y: 0, width: 400, height: 300, label: 'Kitchen, North', color: 'bg-red-100' },
    { id: 'r2', x: 0, y: 0, width: 200, height: 200, label: 'Bath', color: 'bg-blue-100' },
  ],
};

describe('roomSchedule', () => {
  it('lists each room with formatted dimensions', () => {
    const s = roomSchedule(plan, 'm');
    expect(s.rows).toHaveLength(2);
    expect(s.rows[0]).toMatchObject({
      label: 'Kitchen, North',
      width: '10.00 m',
      height: '7.50 m',
      area: '75.0 m²',
    });
  });

  it('sums the total area', () => {
    const s = roomSchedule(plan, 'm');
    // 10×7.5 + 5×5 = 75 + 25 m²
    expect(s.totalArea).toBe('100.0 m²');
    expect(s.totalAreaValue).toBeCloseTo(100);
  });

  it('switches unit for imperial', () => {
    const s = roomSchedule(plan, 'ft');
    expect(s.rows[0].area).toMatch(/sq ft$/);
    expect(s.totalArea).toMatch(/sq ft$/);
  });

  it('is empty for a plan without rooms', () => {
    const s = roomSchedule(emptyPlan(), 'm');
    expect(s.rows).toEqual([]);
    expect(s.totalAreaValue).toBe(0);
  });
});

describe('scheduleToCsv', () => {
  it('quotes fields containing commas', () => {
    const csv = scheduleToCsv(roomSchedule(plan, 'm'));
    const kitchenLine = csv.split('\n').find((l) => l.includes('Kitchen'));
    expect(kitchenLine).toBe('"Kitchen, North",10.00 m,7.50 m,75.0 m²,35.00 m');
  });

  it('ends with the total row', () => {
    const csv = scheduleToCsv(roomSchedule(plan, 'm'));
    expect(csv.trimEnd().split('\n').pop()).toBe('Total,, ,100.0 m²,');
  });
});
