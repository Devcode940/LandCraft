/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { emptyPlan, splitWallWithOpening } from './planOps';
import type { FloorPlanData, Wall } from '../types';

function planWithWall(): FloorPlanData {
  return {
    ...emptyPlan(),
    walls: [{ id: 'w1', x1: 0, y1: 0, x2: 400, y2: 0, thickness: 12 }],
  };
}

const SPLIT = {
  ratio: 0.5,
  gapWidth: 80,
  openingType: 'door' as const,
  openingSubType: 'standard' as const,
  openingWidth: 60,
};

describe('splitWallWithOpening', () => {
  it('replaces one wall with two, separated by a gap', () => {
    const next = splitWallWithOpening(planWithWall(), 'w1', SPLIT);
    expect(next.walls).toHaveLength(2);
    // First segment ends 40px before the midpoint.
    expect(next.walls[0]).toMatchObject({ x1: 0, x2: 160 });
    // Second starts 40px past it.
    expect(next.walls[1]).toMatchObject({ x1: 240, x2: 400 });
  });

  it('inserts an unattached opening in the gap', () => {
    const next = splitWallWithOpening(planWithWall(), 'w1', SPLIT);
    expect(next.openings).toHaveLength(1);
    const door = next.openings[0];
    expect(door).toMatchObject({
      type: 'door',
      x: 200,
      y: 0,
      width: 60,
    });
    // Not pinned to the removed wall.
    expect(door.wallId).toBeUndefined();
    // Aligned with the (horizontal) wall.
    expect(door.rotation).toBe(0);
  });

  it('gives the new segments fresh ids', () => {
    const next = splitWallWithOpening(planWithWall(), 'w1', SPLIT);
    const ids = next.walls.map((w) => w.id);
    expect(new Set(ids).size).toBe(2);
    expect(ids).not.toContain('w1');
  });

  it('splits at the requested ratio', () => {
    const next = splitWallWithOpening(planWithWall(), 'w1', { ...SPLIT, ratio: 0.25 });
    // Split at 100, gap 60..140.
    expect(next.walls[0]).toMatchObject({ x2: 60 });
    expect(next.walls[1]).toMatchObject({ x1: 140 });
    expect(next.openings[0].x).toBe(100);
  });

  it('aligns the opening with a diagonal wall', () => {
    const p: FloorPlanData = {
      ...emptyPlan(),
      walls: [{ id: 'w1', x1: 0, y1: 0, x2: 100, y2: 100, thickness: 12 } as Wall],
    };
    const next = splitWallWithOpening(p, 'w1', SPLIT);
    expect(next.openings[0].rotation).toBeCloseTo(45);
  });

  it('unpins openings that referenced the removed wall', () => {
    const p: FloorPlanData = {
      ...emptyPlan(),
      walls: [{ id: 'w1', x1: 0, y1: 0, x2: 400, y2: 0, thickness: 12 }],
      openings: [
        { id: 'o0', type: 'window', subType: 'standard', x: 50, y: 0, width: 30, rotation: 0, wallId: 'w1' },
      ],
    };
    const next = splitWallWithOpening(p, 'w1', SPLIT);
    expect(next.openings[0].wallId).toBeUndefined();
  });

  it('drops the zero-length segment when splitting at the boundary', () => {
    // ratio 0.01 clamps to the earliest valid split: the gap
    // starts exactly at the wall's start point.
    const next = splitWallWithOpening(planWithWall(), 'w1', { ...SPLIT, ratio: 0.01 });
    expect(next.walls).toHaveLength(1);
    expect(next.walls[0]).toMatchObject({ x1: 80, x2: 400 });
    expect(next.openings[0].x).toBe(40);
  });

  it('shrinks the gap rather than refusing a short wall', () => {
    const p: FloorPlanData = {
      ...emptyPlan(),
      walls: [{ id: 'w1', x1: 0, y1: 0, x2: 60, y2: 0, thickness: 12 }],
    };
    const next = splitWallWithOpening(p, 'w1', SPLIT);
    // Gap clamped to half the wall: two 15px segments.
    expect(next.walls).toHaveLength(2);
    expect(next.walls[0]).toMatchObject({ x2: 15 });
    expect(next.openings[0].width).toBe(30);
  });

  it('refuses to split a degenerate wall', () => {
    const p: FloorPlanData = {
      ...emptyPlan(),
      walls: [{ id: 'w1', x1: 0, y1: 0, x2: 1, y2: 0, thickness: 12 }],
    };
    expect(splitWallWithOpening(p, 'w1', SPLIT)).toBe(p);
  });

  it('returns the same plan for an unknown wall', () => {
    const p = planWithWall();
    expect(splitWallWithOpening(p, 'ghost', SPLIT)).toBe(p);
  });

  it('preserves the wall thickness on both segments', () => {
    const next = splitWallWithOpening(planWithWall(), 'w1', SPLIT);
    expect(next.walls.every((w) => w.thickness === 12)).toBe(true);
  });
});
