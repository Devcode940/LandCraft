/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { EMPTY_PLAN, normalizePlan } from './normalizePlan';

describe('normalizePlan', () => {
  it('returns all four collections for garbage input', () => {
    for (const input of [null, undefined, 42, 'nope', [], true]) {
      const plan = normalizePlan(input);
      expect(Array.isArray(plan.walls)).toBe(true);
      expect(Array.isArray(plan.rooms)).toBe(true);
      expect(Array.isArray(plan.openings)).toBe(true);
      expect(Array.isArray(plan.furniture)).toBe(true);
    }
  });

  it('never throws on hostile structures', () => {
    expect(() =>
      normalizePlan({
        walls: [null, 1, 'x', { x1: 'abc' }, { x1: NaN, y1: Infinity }],
        rooms: [{ width: -100, height: 0 }],
        openings: [{ type: 'spaceship', rotation: 100000 }],
        furniture: [{ subType: 5 }],
      }),
    ).not.toThrow();
  });

  it('coerces non-numeric coordinates to finite numbers', () => {
    const plan = normalizePlan({
      walls: [{ id: 'w', x1: '50', y1: null, x2: undefined, y2: 'nope', thickness: 'x' }],
    });
    const w = plan.walls[0];
    expect(Number.isFinite(w.x1)).toBe(true);
    expect(Number.isFinite(w.y1)).toBe(true);
    expect(Number.isFinite(w.x2)).toBe(true);
    expect(Number.isFinite(w.y2)).toBe(true);
    expect(Number.isFinite(w.thickness)).toBe(true);
  });

  it('floors room extents at 1px so area math cannot go negative', () => {
    const plan = normalizePlan({ rooms: [{ id: 'r', width: -50, height: 0 }] });
    expect(plan.rooms[0].width).toBeGreaterThanOrEqual(1);
    expect(plan.rooms[0].height).toBeGreaterThanOrEqual(1);
  });

  it('generates ids when the model omits them', () => {
    const plan = normalizePlan({
      rooms: [
        { width: 10, height: 10 },
        { width: 10, height: 10 },
      ],
    });
    expect(plan.rooms).toHaveLength(2);
    expect(plan.rooms[0].id).toBeTruthy();
    expect(plan.rooms[0].id).not.toBe(plan.rooms[1].id);
  });

  it('normalizes rotation into [0, 360)', () => {
    const plan = normalizePlan({
      openings: [
        { id: 'a', type: 'door', rotation: -90 },
        { id: 'b', type: 'door', rotation: 450 },
      ],
    });
    expect(plan.openings[0].rotation).toBe(270);
    expect(plan.openings[1].rotation).toBe(90);
  });

  it('clears wallId pointers to walls that do not exist', () => {
    const plan = normalizePlan({
      walls: [{ id: 'w1', x1: 0, y1: 0, x2: 10, y2: 0, thickness: 8 }],
      openings: [
        { id: 'ok', type: 'door', wallId: 'w1' },
        { id: 'stale', type: 'door', wallId: 'deleted-wall' },
      ],
    });
    expect(plan.openings.find((o) => o.id === 'ok')?.wallId).toBe('w1');
    expect(plan.openings.find((o) => o.id === 'stale')?.wallId).toBeUndefined();
  });

  it('rejects non-colour strings for room fill', () => {
    const plan = normalizePlan({ rooms: [{ id: 'r', width: 10, height: 10, color: 'javascript:alert(1)' }] });
    expect(plan.rooms[0].color).toMatch(/^(rgba?\(|#|hsl\()/);
  });

  it('caps runaway collections', () => {
    const many = Array.from({ length: 20000 }, () => ({ id: 'x', width: 1, height: 1 }));
    expect(normalizePlan({ rooms: many }).rooms.length).toBeLessThanOrEqual(5000);
  });

  it('preserves a valid plan unchanged (idempotent)', () => {
    const input = {
      walls: [{ id: 'w', x1: 0, y1: 0, x2: 100, y2: 0, thickness: 12 }],
      rooms: [{ id: 'r', x: 0, y: 0, width: 100, height: 100, label: 'Living', color: 'rgba(0,0,0,0.1)' }],
      openings: [{ id: 'o', type: 'door', subType: 'single', x: 50, y: 0, width: 32, rotation: 0 }],
      furniture: [
        {
          id: 'f',
          subType: 'sofa',
          label: 'Sofa',
          x: 50,
          y: 50,
          width: 60,
          height: 30,
          rotation: 0,
          category: 'living',
        },
      ],
    };
    const once = normalizePlan(input);
    expect(normalizePlan(once)).toEqual(once);
  });

  it('exposes a frozen empty plan constant', () => {
    expect(EMPTY_PLAN.walls).toHaveLength(0);
  });
});
