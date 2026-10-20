/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { applyEdits, describeEdit } from './planEdits';
import { makeId } from './planOps';
import type { FloorPlanData } from '../types';

function plan(): FloorPlanData {
  return {
    walls: [{ id: 'w1', x1: 0, y1: 0, x2: 400, y2: 0, thickness: 12 }],
    rooms: [
      {
        id: 'r1',
        x: 0,
        y: 0,
        width: 400,
        height: 300,
        label: 'Kitchen',
        color: 'rgba(0,0,0,0.1)',
      },
    ],
    openings: [
      { id: 'o1', type: 'door', subType: 'standard', x: 200, y: 0, width: 32, rotation: 0, wallId: 'w1' },
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
        rotation: 0,
        category: 'kitchen',
      },
    ],
  };
}

describe('applyEdits', () => {
  it('resizes a room', () => {
    const next = applyEdits(plan(), [{ kind: 'resizeRoom', roomId: 'r1', width: 500, height: 400 }]);
    expect(next.applied).toBe(1);
    expect(next.plan.rooms[0]).toMatchObject({ width: 500, height: 400 });
    // Untouched fields survive.
    expect(next.plan.rooms[0].label).toBe('Kitchen');
  });

  it('moves a room and carries its contents', () => {
    const next = applyEdits(plan(), [{ kind: 'moveRoom', roomId: 'r1', x: 100, y: 50 }]);
    expect(next.applied).toBe(1);
    expect(next.plan.rooms[0]).toMatchObject({ x: 100, y: 50 });
    // Furniture whose centre is inside the room travels with it.
    expect(next.plan.furniture[0]).toMatchObject({ x: 300, y: 200 });
  });

  it('relabels a room', () => {
    const next = applyEdits(plan(), [{ kind: 'relabelRoom', roomId: 'r1', label: 'Pantry' }]);
    expect(next.plan.rooms[0].label).toBe('Pantry');
  });

  it('moves furniture', () => {
    const next = applyEdits(plan(), [{ kind: 'moveFurniture', furnitureId: 'f1', x: 20, y: 30 }]);
    expect(next.plan.furniture[0]).toMatchObject({ x: 20, y: 30 });
  });

  it('adds furniture with a fresh unique id', () => {
    const next = applyEdits(plan(), [
      {
        kind: 'addFurniture',
        subType: 'chair',
        label: 'Chair',
        x: 10,
        y: 10,
        width: 20,
        height: 20,
        rotation: 90,
        category: 'living',
      },
    ]);
    expect(next.applied).toBe(1);
    expect(next.plan.furniture).toHaveLength(2);
    const added = next.plan.furniture.find((f) => f.id !== 'f1');
    expect(added).toMatchObject({ label: 'Chair', rotation: 90 });
    expect(added?.id).not.toBe('f1');
  });

  it('adds a wall', () => {
    const next = applyEdits(plan(), [{ kind: 'addWall', x1: 0, y1: 300, x2: 400, y2: 300, thickness: 12 }]);
    expect(next.plan.walls).toHaveLength(2);
  });

  it('deletes an element and clears dangling references', () => {
    const next = applyEdits(plan(), [{ kind: 'deleteElement', elementType: 'wall', id: 'w1' }]);
    expect(next.plan.walls).toHaveLength(0);
    // The door was pinned to that wall; the reference must not dangle.
    expect(next.plan.openings[0].wallId).toBeUndefined();
  });

  it('composes sequential edits in one batch', () => {
    const next = applyEdits(plan(), [
      { kind: 'moveRoom', roomId: 'r1', x: 100, y: 0 },
      { kind: 'resizeRoom', roomId: 'r1', width: 600, height: 300 },
    ]);
    expect(next.applied).toBe(2);
    expect(next.plan.rooms[0]).toMatchObject({ x: 100, width: 600 });
    // One summary line per applied edit, in order.
    expect(next.summaries).toHaveLength(2);
    expect(next.summaries[1]).toBe('resized Kitchen to 15.00 m × 7.50 m');
  });

  it('returns the same plan reference when nothing applies', () => {
    const original = plan();
    const next = applyEdits(original, [{ kind: 'resizeRoom', roomId: 'nope', width: 100, height: 100 }]);
    expect(next.plan).toBe(original);
    expect(next.applied).toBe(0);
    expect(next.summaries).toEqual([]);
    expect(next.skipped[0].reason).toContain('no room with id');
  });

  it('skips edits referencing ids removed earlier in the same batch', () => {
    const next = applyEdits(plan(), [
      { kind: 'deleteElement', elementType: 'room', id: 'r1' },
      { kind: 'resizeRoom', roomId: 'r1', width: 100, height: 100 },
    ]);
    expect(next.applied).toBe(1);
    expect(next.skipped).toHaveLength(1);
    expect(next.skipped[0].reason).toContain('no room with id');
  });

  describe('rejects hostile input without throwing', () => {
    it('rejects a non-array', () => {
      const next = applyEdits(plan(), { kind: 'resizeRoom' });
      expect(next.applied).toBe(0);
      expect(next.plan).toEqual(plan());
    });

    it('rejects an unknown kind', () => {
      const next = applyEdits(plan(), [{ kind: 'explode', roomId: 'r1' }]);
      expect(next.skipped[0].reason).toContain('unknown edit kind');
    });

    it('rejects non-object entries', () => {
      const next = applyEdits(plan(), ['resizeRoom', 42, null]);
      expect(next.skipped).toHaveLength(3);
    });

    it('rejects non-finite and out-of-range numbers', () => {
      const next = applyEdits(plan(), [
        { kind: 'resizeRoom', roomId: 'r1', width: Number.POSITIVE_INFINITY, height: 100 },
        { kind: 'resizeRoom', roomId: 'r1', width: -5, height: 100 },
        { kind: 'moveRoom', roomId: 'r1', x: 1e9, y: 0 },
      ]);
      expect(next.applied).toBe(0);
      expect(next.skipped).toHaveLength(3);
    });

    it('rejects a furniture category outside the known set', () => {
      const next = applyEdits(plan(), [
        {
          kind: 'addFurniture',
          subType: 'chair',
          label: 'Chair',
          x: 0,
          y: 0,
          width: 20,
          height: 20,
          rotation: 0,
          category: 'spaceship',
        },
      ]);
      expect(next.skipped[0].reason).toContain('unknown category');
    });

    it('rejects a zero-length wall', () => {
      const next = applyEdits(plan(), [{ kind: 'addWall', x1: 5, y1: 5, x2: 5, y2: 5, thickness: 12 }]);
      expect(next.skipped[0].reason).toContain('identical');
    });

    it('rejects an oversized label', () => {
      const next = applyEdits(plan(), [{ kind: 'relabelRoom', roomId: 'r1', label: 'x'.repeat(500) }]);
      expect(next.skipped[0].reason).toContain('label');
    });

    it('caps the batch size', () => {
      const edits = Array.from({ length: 500 }, (_, i) => ({
        kind: 'moveFurniture',
        furnitureId: 'f1',
        x: i,
        y: 0,
      }));
      const next = applyEdits(plan(), edits);
      // Only the capped prefix is considered...
      expect(next.applied).toBe(100);
      // ...and the overflow is reported, not silently dropped.
      expect(next.skipped).toHaveLength(1);
      expect(next.skipped[0].reason).toMatch(/cap/);
    });
  });

  it('leaves the input plan unmutated', () => {
    const original = plan();
    const snapshot = JSON.stringify(original);
    applyEdits(original, [
      { kind: 'resizeRoom', roomId: 'r1', width: 999, height: 999 },
      { kind: 'deleteElement', elementType: 'furniture', id: 'f1' },
    ]);
    expect(JSON.stringify(original)).toBe(snapshot);
  });
});

describe('applyEdits caps', () => {
  it('reports a batch longer than the cap instead of silently dropping it', () => {
    const edits = Array.from({ length: 120 }, (_, i) => ({
      kind: 'moveFurniture' as const,
      furnitureId: `ghost-${i}`,
      x: 10,
      y: 10,
    }));
    const result = applyEdits(plan(), edits);
    expect(result.applied).toBe(0);
    // 100 individually skipped (unknown ids) + 1 truncation notice.
    expect(result.skipped).toHaveLength(101);
    expect(result.skipped[100].reason).toMatch(/cap/);
  });
});

describe('describeEdit', () => {
  it('describes edits in the active unit', () => {
    const p = plan();
    expect(describeEdit({ kind: 'resizeRoom', roomId: 'r1', width: 800, height: 600 }, 'm', p)).toBe(
      'resized Kitchen to 20.00 m × 15.00 m',
    );
    expect(
      describeEdit(
        {
          kind: 'addFurniture',
          subType: 'chair',
          label: 'Chair',
          x: 0,
          y: 0,
          width: 1,
          height: 1,
          rotation: 0,
          category: 'living',
        },
        'ft',
      ),
    ).toBe('added Chair');
  });

  it('falls back to the id when the room is unknown', () => {
    expect(describeEdit({ kind: 'moveRoom', roomId: makeId('r'), x: 0, y: 0 }, 'm')).toMatch(/^moved /);
  });

  it('names moved furniture by its label, not its id', () => {
    const p = plan();
    expect(
      describeEdit({ kind: 'moveFurniture', furnitureId: p.furniture[0].id, x: 0, y: 0 }, 'm', p),
    ).toBe(`moved ${p.furniture[0].label}`);
  });
});
