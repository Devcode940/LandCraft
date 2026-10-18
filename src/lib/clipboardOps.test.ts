/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { copyElements, pasteElements, PASTE_OFFSET_PX } from './clipboardOps';
import { moveElements } from './planOps';
import type { FloorPlanData } from '../types';

function plan(): FloorPlanData {
  return {
    walls: [{ id: 'w1', x1: 0, y1: 0, x2: 400, y2: 0, thickness: 12 }],
    rooms: [
      { id: 'r1', x: 0, y: 0, width: 400, height: 300, label: 'Kitchen', color: 'bg-red-100' },
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

describe('copyElements', () => {
  it('copies the selected elements of one type', () => {
    const clip = copyElements(plan(), 'furniture', ['f1']);
    expect(clip?.type).toBe('furniture');
    expect(clip?.items).toHaveLength(1);
  });

  it('returns null for an empty selection', () => {
    expect(copyElements(plan(), 'room', [])).toBeNull();
  });

  it('returns null when no id matches (stale selection)', () => {
    expect(copyElements(plan(), 'room', ['gone'])).toBeNull();
  });
});

describe('pasteElements', () => {
  it('appends an offset copy with a fresh id', () => {
    const clip = copyElements(plan(), 'furniture', ['f1']);
    const next = pasteElements(plan(), clip);
    expect(next.furniture).toHaveLength(2);
    const copy = next.furniture[1];
    expect(copy.id).not.toBe('f1');
    expect(copy).toMatchObject({ x: 200 + PASTE_OFFSET_PX, y: 150 + PASTE_OFFSET_PX });
    expect(copy.label).toBe('Dining Table');
  });

  it('regenerates ids per paste, so repeats never collide', () => {
    const clip = copyElements(plan(), 'room', ['r1']);
    const once = pasteElements(plan(), clip);
    const twice = pasteElements(once, clip);
    const ids = [once.rooms[1].id, twice.rooms[2].id];
    expect(new Set(ids).size).toBe(2);
  });

  it('moves walls by both endpoints', () => {
    const clip = copyElements(plan(), 'wall', ['w1']);
    const next = pasteElements(plan(), clip);
    expect(next.walls[1]).toMatchObject({ x1: 40, y1: 40, x2: 440, y2: 40 });
  });

  it('drops the wall pin from pasted openings', () => {
    const clip = copyElements(plan(), 'opening', ['o1']);
    const next = pasteElements(plan(), clip);
    expect(next.openings[1].wallId).toBeUndefined();
    // The original keeps its pin.
    expect(next.openings[0].wallId).toBe('w1');
  });

  it('is a no-op for an empty clipboard', () => {
    const p = plan();
    expect(pasteElements(p, null)).toBe(p);
  });
});

describe('moveElements (group drag)', () => {
  it('moves a group of furniture by the delta', () => {
    const p = {
      ...plan(),
      furniture: [
        ...plan().furniture,
        { ...plan().furniture[0], id: 'f2', x: 300, y: 300 },
      ],
    };
    const next = moveElements(p, 'furniture', ['f1', 'f2'], 10, -5);
    expect(next.furniture[0]).toMatchObject({ x: 210, y: 145 });
    expect(next.furniture[1]).toMatchObject({ x: 310, y: 295 });
  });

  it('moves a room and its contents', () => {
    const next = moveElements(plan(), 'room', ['r1'], 50, 50);
    expect(next.rooms[0]).toMatchObject({ x: 50, y: 50 });
    // Table centre is inside the room; it travels along.
    expect(next.furniture[0]).toMatchObject({ x: 250, y: 200 });
  });

  it('moves walls by both endpoints', () => {
    const next = moveElements(plan(), 'wall', ['w1'], 5, 5);
    expect(next.walls[0]).toMatchObject({ x1: 5, y1: 5, x2: 405, y2: 5 });
  });

  it('ignores ids that no longer exist', () => {
    const p = plan();
    expect(moveElements(p, 'furniture', ['ghost'], 10, 10)).toBe(p);
  });

  it('returns the same plan for a zero delta', () => {
    const p = plan();
    expect(moveElements(p, 'furniture', ['f1'], 0, 0)).toBe(p);
  });
});
