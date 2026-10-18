/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { HISTORY_LIMIT, canRedo, canUndo, editorReducer, initEditorState, trimHistory } from './editorState';
import { emptyPlan, makeId, moveRoomWithContents, updateElement, deleteElement, addElement } from './planOps';
import type { FloorPlanData } from '../types';

const planWith = (n: number): FloorPlanData => ({
  ...emptyPlan(),
  rooms: Array.from({ length: n }, (_, i) => ({
    id: `r${i}`,
    x: i * 10,
    y: 0,
    width: 100,
    height: 100,
    label: `Room ${i}`,
    color: 'rgba(59, 130, 246, 0.08)',
  })),
});

describe('editorReducer', () => {
  it('initialises with one history entry', () => {
    const s = initEditorState(planWith(1));
    expect(s.entries).toHaveLength(1);
    expect(s.index).toBe(0);
  });

  it('deep-copies the initial plan so module constants are never mutated', () => {
    const shared = planWith(1);
    const s = initEditorState(shared);
    expect(s.plan).not.toBe(shared);
    expect(s.plan.rooms).not.toBe(shared.rooms);
    expect(s.plan).toEqual(shared);
  });

  it('records one history entry per committed update', () => {
    let s = initEditorState(planWith(1));
    s = editorReducer(s, { type: 'update', updater: () => planWith(2), commit: true });
    s = editorReducer(s, { type: 'update', updater: () => planWith(3), commit: true });
    expect(s.plan.rooms).toHaveLength(3);
    expect(s.entries).toHaveLength(3);
    expect(s.index).toBe(2);
  });

  it('does not record history for uncommitted updates (drag frames)', () => {
    let s = initEditorState(planWith(1));
    for (let i = 2; i <= 50; i++) {
      s = editorReducer(s, { type: 'update', updater: () => planWith(i), commit: false });
    }
    expect(s.plan.rooms).toHaveLength(50);
    expect(s.entries).toHaveLength(1); // still just the initial entry
  });

  it('snapshots the live plan on commit (drag end)', () => {
    let s = initEditorState(planWith(1));
    s = editorReducer(s, { type: 'update', updater: () => planWith(5), commit: false });
    s = editorReducer(s, { type: 'commit' });
    expect(s.entries).toHaveLength(2);
    expect(s.index).toBe(1);
    expect(s.plan.rooms).toHaveLength(5);
  });

  it('does not add an undo step when commit changes nothing', () => {
    const s0 = initEditorState(planWith(1));
    const s1 = editorReducer(s0, { type: 'commit' });
    expect(s1).toBe(s0);
  });

  it('undoes and redoes across the whole stack', () => {
    let s = initEditorState(planWith(1));
    s = editorReducer(s, { type: 'update', updater: () => planWith(2), commit: true });
    s = editorReducer(s, { type: 'update', updater: () => planWith(3), commit: true });

    s = editorReducer(s, { type: 'undo' });
    expect(s.plan.rooms).toHaveLength(2);
    s = editorReducer(s, { type: 'undo' });
    expect(s.plan.rooms).toHaveLength(1);
    expect(canUndo(s)).toBe(false);

    s = editorReducer(s, { type: 'redo' });
    expect(s.plan.rooms).toHaveLength(2);
    s = editorReducer(s, { type: 'redo' });
    expect(s.plan.rooms).toHaveLength(3);
    expect(canRedo(s)).toBe(false);
  });

  it('is a no-op at the ends of the stack', () => {
    const s0 = initEditorState(planWith(1));
    expect(editorReducer(s0, { type: 'undo' })).toBe(s0);
    expect(editorReducer(s0, { type: 'redo' })).toBe(s0);
  });

  it('drops the redo tail when new work follows an undo', () => {
    let s = initEditorState(planWith(1));
    s = editorReducer(s, { type: 'update', updater: () => planWith(2), commit: true });
    s = editorReducer(s, { type: 'update', updater: () => planWith(3), commit: true });
    s = editorReducer(s, { type: 'undo' });
    s = editorReducer(s, { type: 'update', updater: () => planWith(9), commit: true });

    expect(s.plan.rooms).toHaveLength(9);
    expect(s.entries).toHaveLength(3);
    expect(canRedo(s)).toBe(false);
  });

  it('caps history so long sessions cannot grow memory without bound', () => {
    let s = initEditorState(planWith(0));
    for (let i = 1; i <= HISTORY_LIMIT + 60; i++) {
      s = editorReducer(s, { type: 'update', updater: () => planWith(i), commit: true });
    }
    expect(s.entries.length).toBe(HISTORY_LIMIT);
    expect(s.index).toBe(HISTORY_LIMIT - 1);
  });

  it('normalizes plans arriving from external sources', () => {
    let s = initEditorState(planWith(1));
    // Model output missing `openings` must not survive into state.
    s = editorReducer(s, { type: 'set', plan: { walls: [], rooms: [] }, commit: true });
    expect(Array.isArray(s.plan.openings)).toBe(true);
    expect(Array.isArray(s.plan.furniture)).toBe(true);
  });

  it('reset clears the stack', () => {
    let s = initEditorState(planWith(1));
    s = editorReducer(s, { type: 'update', updater: () => planWith(4), commit: true });
    s = editorReducer(s, { type: 'reset', plan: planWith(1) });
    expect(s.entries).toHaveLength(1);
    expect(s.index).toBe(0);
  });

  it('ignores an updater that returns the same object', () => {
    const s0 = initEditorState(planWith(1));
    const s1 = editorReducer(s0, { type: 'update', updater: (p) => p, commit: true });
    expect(s1).toBe(s0);
  });
});

describe('trimHistory', () => {
  it('keeps the newest entries', () => {
    const entries = [planWith(1), planWith(2), planWith(3)];
    expect(trimHistory(entries)).toBe(entries);
  });
});

describe('planOps', () => {
  const base = (): FloorPlanData => ({
    walls: [{ id: 'w1', x1: 0, y1: 0, x2: 100, y2: 0, thickness: 10 }],
    rooms: [{ id: 'r1', x: 0, y: 0, width: 100, height: 100, label: 'A', color: 'rgba(0,0,0,0.1)' }],
    openings: [
      { id: 'o1', type: 'door', subType: 'single', x: 50, y: 0, width: 32, rotation: 0, wallId: 'w1' },
    ],
    furniture: [
      {
        id: 'f1',
        subType: 'sofa',
        label: 'Sofa',
        x: 50,
        y: 50,
        width: 40,
        height: 20,
        rotation: 0,
        category: 'living',
      },
      {
        id: 'f2',
        subType: 'bed',
        label: 'Bed',
        x: 900,
        y: 900,
        width: 60,
        height: 80,
        rotation: 0,
        category: 'bedroom',
      },
    ],
  });

  it('updateElement does not mutate the input', () => {
    const p = base();
    const next = updateElement(p, 'room', 'r1', { label: 'Living' });
    expect(p.rooms[0].label).toBe('A');
    expect(next.rooms[0].label).toBe('Living');
    expect(next).not.toBe(p);
  });

  it('updateElement returns the same plan when the id is missing', () => {
    const p = base();
    expect(updateElement(p, 'room', 'nope', { label: 'x' })).toBe(p);
  });

  it('deleteElement clears openings pinned to a removed wall', () => {
    const next = deleteElement(base(), 'wall', 'w1');
    expect(next.walls).toHaveLength(0);
    expect(next.openings[0].wallId).toBeUndefined();
  });

  it('moveRoomWithContents carries what is inside and leaves the rest', () => {
    const next = moveRoomWithContents(base(), 'r1', 200, 100);
    expect(next.rooms[0]).toMatchObject({ x: 200, y: 100 });
    // f1 (50,50) is inside r1 -> moves by (+200,+100)
    expect(next.furniture[0]).toMatchObject({ x: 250, y: 150 });
    // f2 (900,900) is outside -> untouched
    expect(next.furniture[1]).toMatchObject({ x: 900, y: 900 });
    // o1 (50,0) is on the room edge -> carried
    expect(next.openings[0]).toMatchObject({ x: 250, y: 100 });
  });

  it('moveRoomWithContents is a no-op for a zero delta', () => {
    const p = base();
    expect(moveRoomWithContents(p, 'r1', 0, 0)).toBe(p);
  });

  it('moveRoomWithContents ignores an unknown room', () => {
    const p = base();
    expect(moveRoomWithContents(p, 'nope', 10, 10)).toBe(p);
  });

  it('apply-edits patches the plan as one undoable step', () => {
    const state = initEditorState(planWith(1));
    const next = editorReducer(state, {
      type: 'apply-edits',
      edits: [{ kind: 'resizeRoom', roomId: 'r0', width: 200, height: 150 }],
    });
    expect(next.plan.rooms[0]).toMatchObject({ width: 200, height: 150 });
    expect(next.index).toBe(1);
    // And Ctrl+Z takes it back.
    const undone = editorReducer(next, { type: 'undo' });
    expect(undone.plan.rooms[0].width).toBe(100);
  });

  it('apply-edits against a stale copy still applies to the freshest plan', () => {
    // The reducer applies to its own state, so an async chat
    // response cannot clobber edits made after it was sent.
    const state = initEditorState(planWith(1));
    const intermediate = editorReducer(state, {
      type: 'update',
      commit: true,
      updater: (prev) => updateElement(prev, 'room', 'r0', { label: 'Studio' }),
    });
    const next = editorReducer(intermediate, {
      type: 'apply-edits',
      edits: [{ kind: 'resizeRoom', roomId: 'r0', width: 200, height: 150 }],
    });
    expect(next.plan.rooms[0]).toMatchObject({ label: 'Studio', width: 200 });
  });

  it('apply-edits with nothing valid records no history entry', () => {
    const state = initEditorState(planWith(1));
    const next = editorReducer(state, {
      type: 'apply-edits',
      edits: [{ kind: 'resizeRoom', roomId: 'missing', width: 5, height: 5 }],
    });
    expect(next).toBe(state);
  });

  it('addElement appends without mutating the previous arrays', () => {
    const base = planWith(1);
    const room = { id: 'r-new', x: 0, y: 0, width: 10, height: 10, label: 'New', color: 'rgba(0,0,0,0.1)' };
    const next = addElement(base, 'room', room);

    expect(next.rooms).toHaveLength(2);
    expect(base.rooms).toHaveLength(1);
    expect(next.rooms).not.toBe(base.rooms);
    // Untouched collections keep their identity -- no needless re-render churn.
    expect(next.walls).toBe(base.walls);
    expect(next.furniture).toBe(base.furniture);
  });

  it('makeId produces unique ids within the same millisecond', () => {
    const ids = new Set(Array.from({ length: 5000 }, () => makeId('room')));
    expect(ids.size).toBe(5000);
  });
});
