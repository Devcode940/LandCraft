/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import {
  boxIntersectsDoorSwing,
  checkBoundingBoxCollision,
  checkOverlapWarnings,
  endpointAtLength,
  formatDimension,
  formatWallDimensions,
  furnitureRect,
  getClosestPointOnSegment,
  getDistance,
  getWallBounds,
  isPointInDoorSwing,
  parseWallLength,
  pixelsToFeetInches,
  snapToGrid,
} from './geoUtils';
import { normalizePlan } from './normalizePlan';
import type { Furniture, Opening } from '../types';

const furniture = (over: Partial<Furniture> = {}): Furniture => ({
  id: 'f1',
  subType: 'table',
  label: 'Table',
  x: 0,
  y: 0,
  width: 40,
  height: 40,
  rotation: 0,
  category: 'living',
  ...over,
});

const opening = (over: Partial<Opening> = {}): Opening => ({
  id: 'o1',
  type: 'door',
  subType: 'single',
  x: 0,
  y: 0,
  width: 32,
  rotation: 0,
  ...over,
});

describe('pixelsToFeetInches', () => {
  it('carries rounded inches into the feet component', () => {
    // 71.9" must become 6' 0", never 5' 12".
    expect(pixelsToFeetInches((71.9 / 12) * 12.192)).toEqual({ feet: 6, inches: 0 });
  });

  it('never emits 12 inches', () => {
    for (let px = 0; px < 4000; px += 0.37) {
      const { inches } = pixelsToFeetInches(px);
      expect(inches).toBeLessThan(12);
      expect(inches).toBeGreaterThanOrEqual(0);
    }
  });

  it('rounds to the nearest inch', () => {
    const oneFoot = 12.192;
    expect(pixelsToFeetInches(oneFoot)).toEqual({ feet: 1, inches: 0 });
    expect(pixelsToFeetInches(oneFoot / 2)).toEqual({ feet: 0, inches: 6 });
  });
});

describe('formatDimension', () => {
  it('formats metric', () => {
    expect(formatDimension(40, 'm')).toBe('1.00 m');
    expect(formatDimension(100, 'm')).toBe('2.50 m');
  });

  it('formats imperial without impossible values', () => {
    const out = formatDimension(73.15, 'ft');
    expect(out).not.toContain('12"');
  });
});

describe('formatWallDimensions', () => {
  it('reports centimetres below a metre and metres above', () => {
    expect(formatWallDimensions(400, 8, 'm').widthStr).toBe('20cm');
    expect(formatWallDimensions(400, 40, 'm').widthStr).toBe('1.00m');
  });

  it('round-trips length in both unit systems', () => {
    expect(formatWallDimensions(40, 10, 'm').lengthStr).toBe('1.00m');
    expect(formatWallDimensions(12.192, 10, 'ft').lengthStr).toBe('1\' 0"');
  });
});

describe('geometry primitives', () => {
  it('measures distance', () => {
    expect(getDistance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
  });

  it('clamps projection to the segment', () => {
    const a = { x: 0, y: 0 };
    const b = { x: 10, y: 0 };
    expect(getClosestPointOnSegment({ x: -5, y: 0 }, a, b).point).toEqual({ x: 0, y: 0 });
    expect(getClosestPointOnSegment({ x: 15, y: 0 }, a, b).point).toEqual({ x: 10, y: 0 });
    expect(getClosestPointOnSegment({ x: 5, y: 3 }, a, b).distance).toBeCloseTo(3);
  });

  it('snaps to the nearest grid line', () => {
    expect(snapToGrid({ x: 11, y: 9 }, 20)).toEqual({ x: 20, y: 0 });
  });

  it('derives wall bounds, or null when there are no walls', () => {
    expect(getWallBounds([])).toBeNull();
    expect(
      getWallBounds(
        normalizePlan({
          walls: [
            { id: 'a', x1: 10, y1: 20, x2: 110, y2: 20, thickness: 10 },
            { id: 'b', x1: 110, y1: 20, x2: 110, y2: 120, thickness: 10 },
          ],
        }).walls,
      ),
    ).toEqual({ x: 10, y: 20, width: 100, height: 100 });
  });

  it('detects AABB collisions', () => {
    const r = { x: 0, y: 0, width: 10, height: 10 };
    expect(checkBoundingBoxCollision(r, { x: 5, y: 5, width: 10, height: 10 })).toBe(true);
    expect(checkBoundingBoxCollision(r, { x: 10, y: 0, width: 10, height: 10 })).toBe(false);
  });

  it('treats furniture x/y as the centre', () => {
    expect(furnitureRect(furniture({ x: 100, y: 100, width: 40, height: 20 }))).toEqual({
      x: 80,
      y: 90,
      width: 40,
      height: 20,
    });
  });
});

describe('isPointInDoorSwing', () => {
  // Door at origin, rotation 0 -> leaf along +x, swing sweeps +x..+y (screen-down).
  const door = opening({ x: 0, y: 0, width: 32, rotation: 0 });

  it('includes points inside the swept quarter disc', () => {
    expect(isPointInDoorSwing({ x: 20, y: 5 }, door)).toBe(true);
    expect(isPointInDoorSwing({ x: 5, y: 20 }, door)).toBe(true);
  });

  it('excludes points behind the hinge (the old 2w box reported these)', () => {
    expect(isPointInDoorSwing({ x: -20, y: -5 }, door)).toBe(false);
    expect(isPointInDoorSwing({ x: 20, y: -20 }, door)).toBe(false);
  });

  it('excludes points beyond the leaf radius', () => {
    expect(isPointInDoorSwing({ x: 40, y: 0 }, door)).toBe(false);
  });

  it('mirrors the sector when the swing is flipped', () => {
    const flipped = opening({ ...door, flipSwing: true });
    expect(isPointInDoorSwing({ x: 20, y: 5 }, flipped)).toBe(false);
    expect(isPointInDoorSwing({ x: 20, y: -5 }, flipped)).toBe(true);
  });

  it('follows the door rotation', () => {
    const rotated = opening({ ...door, rotation: 90 });
    // Sector now spans +y..-x (screen coords).
    expect(isPointInDoorSwing({ x: -20, y: 5 }, rotated)).toBe(true);
    expect(isPointInDoorSwing({ x: 20, y: 5 }, rotated)).toBe(false);
  });

  it('treats the hinge itself as inside', () => {
    expect(isPointInDoorSwing({ x: 0, y: 0 }, door)).toBe(true);
  });
});

describe('boxIntersectsDoorSwing', () => {
  it('detects a box overlapping the sweep', () => {
    const door = opening({ x: 0, y: 0, width: 32, rotation: 0 });
    expect(boxIntersectsDoorSwing({ x: 10, y: 10, width: 20, height: 20 }, door)).toBe(true);
  });

  it('detects a swing biting into the middle of an edge without touching a corner', () => {
    const door = opening({ x: 0, y: 0, width: 60, rotation: 0 });
    expect(boxIntersectsDoorSwing({ x: -10, y: 20, width: 80, height: 5 }, door)).toBe(true);
  });

  it('returns false for a box clear of the sweep', () => {
    const door = opening({ x: 0, y: 0, width: 32, rotation: 0 });
    expect(boxIntersectsDoorSwing({ x: 100, y: 100, width: 20, height: 20 }, door)).toBe(false);
  });
});

describe('checkOverlapWarnings', () => {
  it('flags furniture that overlaps other furniture', () => {
    const a = furniture({ id: 'a', x: 0, y: 0 });
    const b = furniture({ id: 'b', x: 10, y: 0, label: 'Chair' });
    const warnings = checkOverlapWarnings([], [], [a, b]);
    expect(warnings.some((w) => w.id === 'warn-f-a-b')).toBe(true);
  });

  it('flags overlapping room zones (the `rooms` arg used to be ignored)', () => {
    const rooms = normalizePlan({
      rooms: [
        { id: 'r1', x: 0, y: 0, width: 100, height: 100, label: 'A', color: 'rgba(0,0,0,0.1)' },
        { id: 'r2', x: 50, y: 50, width: 100, height: 100, label: 'B', color: 'rgba(0,0,0,0.1)' },
      ],
    }).rooms;
    const warnings = checkOverlapWarnings(rooms, [], []);
    expect(warnings.some((w) => w.id === 'warn-room-r1-r2')).toBe(true);
  });

  it('flags furniture sitting outside every room', () => {
    const rooms = normalizePlan({
      rooms: [{ id: 'r1', x: 0, y: 0, width: 100, height: 100, label: 'A', color: 'rgba(0,0,0,0.1)' }],
    }).rooms;
    const warnings = checkOverlapWarnings(rooms, [], [furniture({ x: 500, y: 500 })]);
    expect(warnings.some((w) => w.id === 'warn-f-outside-f1')).toBe(true);
  });

  it('does not flag furniture fully inside a room', () => {
    const rooms = normalizePlan({
      rooms: [{ id: 'r1', x: 0, y: 0, width: 200, height: 200, label: 'A', color: 'rgba(0,0,0,0.1)' }],
    }).rooms;
    const warnings = checkOverlapWarnings(rooms, [], [furniture({ x: 100, y: 100 })]);
    expect(warnings).toHaveLength(0);
  });

  it('flags furniture blocking a door swing', () => {
    const door = opening({ id: 'd1', x: 0, y: 0, width: 40, rotation: 0 });
    const warnings = checkOverlapWarnings([], [door], [furniture({ x: 20, y: 15, width: 20, height: 20 })]);
    expect(warnings.some((w) => w.id === 'warn-f-door-f1-d1')).toBe(true);
  });

  it('does not flag a clear plan', () => {
    expect(checkOverlapWarnings([], [], [])).toHaveLength(0);
  });
});

describe('endpointAtLength', () => {
  it('places the endpoint at the typed distance along the cursor direction', () => {
    const end = endpointAtLength({ x: 0, y: 0 }, { x: 100, y: 0 }, 250);
    expect(end).toEqual({ x: 250, y: 0 });
  });

  it('normalises the direction, so a short drag still gives an exact length', () => {
    const end = endpointAtLength({ x: 10, y: 10 }, { x: 11, y: 10 }, 400);
    expect(end).toEqual({ x: 410, y: 10 });
  });

  it('follows diagonal directions', () => {
    const end = endpointAtLength({ x: 0, y: 0 }, { x: 100, y: 100 }, Math.SQRT2 * 100);
    expect(end.x).toBeCloseTo(100);
    expect(end.y).toBeCloseTo(100);
  });

  it('defaults to horizontal before the cursor moves', () => {
    const end = endpointAtLength({ x: 50, y: 50 }, { x: 50, y: 50 }, 120);
    expect(end).toEqual({ x: 170, y: 50 });
  });
});

describe('parseWallLength', () => {
  it('converts meters to canvas pixels', () => {
    expect(parseWallLength('2.5', 'm')).toBe(100);
  });

  it('converts feet to canvas pixels', () => {
    expect(parseWallLength('10', 'ft')).toBeCloseTo(10 * 12.192);
  });

  it('rejects non-numbers and non-positive values', () => {
    expect(parseWallLength('abc', 'm')).toBeNull();
    expect(parseWallLength('', 'm')).toBeNull();
    expect(parseWallLength('-3', 'm')).toBeNull();
    expect(parseWallLength('0', 'm')).toBeNull();
  });
});
