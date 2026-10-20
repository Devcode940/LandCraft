/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import {
  cameraDistanceFor,
  furnitureToBox,
  openingToBox,
  planCenter,
  wallToBox,
} from './plan3D';
import type { FloorPlanData } from '../types';

const plan = (): FloorPlanData => ({
  walls: [{ id: 'w1', x1: 0, y1: 0, x2: 400, y2: 0, thickness: 12 }],
  rooms: [{ id: 'r1', x: 0, y: 0, width: 400, height: 300, label: 'Kitchen', color: 'bg-red-100' }],
  openings: [
    { id: 'o1', type: 'door', subType: 'standard', x: 200, y: 0, width: 60, rotation: 0, wallId: 'w1' },
    {
      id: 'o2',
      type: 'window',
      subType: 'standard',
      x: 100,
      y: 0,
      width: 80,
      rotation: 0,
      wallId: 'w1',
    },
  ],
  furniture: [
    {
      id: 'f1',
      subType: 'table',
      label: 'Dining Table',
      x: 200,
      y: 150,
      width: 60,
      height: 40,
      rotation: 90,
      category: 'kitchen',
    },
  ],
});

describe('wallToBox', () => {
  it('converts pixels to metres and centres the box', () => {
    const box = wallToBox(plan().walls[0]);
    expect(box.center).toEqual([5, 1.35, 0]);
    expect(box.size[0]).toBeCloseTo(10);
    expect(box.size[2]).toBeCloseTo(0.3);
    expect(box.rotationY).toBeCloseTo(0);
  });

  it('respects an explicit wall height', () => {
    const box = wallToBox({ ...plan().walls[0], height: 300 });
    expect(box.size[1]).toBeCloseTo(7.5);
  });

  it('rotates diagonal walls (negated for three.js)', () => {
    const box = wallToBox({ id: 'w', x1: 0, y1: 0, x2: 100, y2: 100, thickness: 10 });
    expect(box.rotationY).toBeCloseTo(-Math.PI / 4);
  });
});

describe('openingToBox', () => {
  it('stands a door leaf on its hinge, swung along the wall', () => {
    const box = openingToBox(plan().openings[0]);
    expect(box.size).toEqual([1.5, 2.1, 0.05]);
    // Hinge at x=5m, leaf extends half its width along +x.
    expect(box.center[0]).toBeCloseTo(5.75);
    expect(box.center[1]).toBeCloseTo(1.05);
  });

  it('hangs a window at sill height', () => {
    const box = openingToBox(plan().openings[1]);
    expect(box.center[1]).toBeCloseTo(0.9 + 1.2 / 2);
    expect(box.size).toEqual([2, 1.2, 0.08]);
  });
});

describe('furnitureToBox', () => {
  it('uses per-subtype heights and converts rotation', () => {
    const box = furnitureToBox(plan().furniture[0]);
    expect(box.size).toEqual([1.5, 0.75, 1]);
    expect(box.center[1]).toBeCloseTo(0.375);
    expect(box.rotationY).toBeCloseTo(-Math.PI / 2);
  });

  it('falls back to a default height for unknown subtypes', () => {
    const box = furnitureToBox({
      ...plan().furniture[0],
      id: 'f2',
      subType: 'hovercraft',
    });
    expect(box.size[1]).toBe(0.8);
  });
});

describe('planCenter', () => {
  it('centres on the wall extent', () => {
    expect(planCenter(plan())).toEqual({ x: 5, z: 0 });
  });

  it('falls back to rooms when there are no walls', () => {
    const p = plan();
    const center = planCenter({ ...p, walls: [] });
    expect(center).toEqual({ x: 5, z: 3.75 });
  });

  it('returns the origin for an empty plan', () => {
    expect(planCenter({ walls: [], rooms: [], openings: [], furniture: [] })).toEqual({
      x: 0,
      z: 0,
    });
  });
});

describe('cameraDistanceFor', () => {
  it('frames the whole plan with margin', () => {
    const d = cameraDistanceFor(plan());
    // Half-diagonal of the 10m x 7.5m plan is ~6.25m; the
    // distance must comfortably exceed it.
    expect(d).toBeGreaterThan(6.25 * 2);
  });

  it('never collapses to zero', () => {
    expect(cameraDistanceFor({ walls: [], rooms: [], openings: [], furniture: [] })).toBe(
      3 * 2.4 + 2,
    );
  });
});
