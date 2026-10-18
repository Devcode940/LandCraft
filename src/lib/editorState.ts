/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Undo/redo state for the editor, as a pure reducer.
 *
 * Extracted from App.tsx so it can be unit-tested. The previous implementation
 * kept `plan`, `history` and `historyIndex` in three separate useState values
 * and pushed history via `setTimeout(..., 50)` fired from *inside* state
 * updaters, which produced stale closures, duplicate entries and impure
 * updaters. One reducer makes every transition atomic.
 */

import type { FloorPlanData } from '../types';
import { normalizePlan } from '../utils/normalizePlan';
import { applyEdits } from './planEdits';

/** Maximum undo steps retained. Bounds memory regardless of session length. */
export const HISTORY_LIMIT = 100;

export interface EditorState {
  plan: FloorPlanData;
  entries: FloorPlanData[];
  index: number;
}

export type PlanUpdater = FloorPlanData | ((prev: FloorPlanData) => FloorPlanData);

export type EditorAction =
  | { type: 'set'; plan: FloorPlanData | unknown; commit: boolean; normalize?: boolean }
  | { type: 'update'; updater: (prev: FloorPlanData) => FloorPlanData; commit: boolean }
  | { type: 'commit' }
  | { type: 'apply-edits'; edits: unknown }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'reset'; plan: FloorPlanData | unknown };

export function trimHistory(entries: FloorPlanData[]): FloorPlanData[] {
  return entries.length > HISTORY_LIMIT ? entries.slice(entries.length - HISTORY_LIMIT) : entries;
}

/** Snapshot `plan` as the newest history entry, dropping any redo tail. */
export function pushHistory(state: EditorState, plan: FloorPlanData): EditorState {
  // Coalesce no-op commits so a stray mouseup does not add an undo step.
  if (state.entries[state.index] === plan) return { ...state, plan };
  const entries = trimHistory([...state.entries.slice(0, state.index + 1), plan]);
  return { plan, entries, index: entries.length - 1 };
}

export function editorReducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case 'set': {
      const plan = action.normalize === false ? (action.plan as FloorPlanData) : normalizePlan(action.plan);
      return action.commit ? pushHistory(state, plan) : { ...state, plan };
    }

    case 'update': {
      const plan = action.updater(state.plan);
      if (plan === state.plan) return state;
      return action.commit ? pushHistory(state, plan) : { ...state, plan };
    }

    case 'apply-edits': {
      // Structured edits from the architect chat. Applied to the
      // reducer's own state, so an async chat response can never
      // patch a stale plan, and committed as one undoable step.
      const result = applyEdits(state.plan, action.edits);
      if (result.applied === 0) return state;
      return pushHistory(state, result.plan);
    }

    case 'commit':
      // Snapshot the live plan after a burst of uncommitted updates (e.g. the
      // end of a drag) without changing it.
      if (state.entries[state.index] === state.plan) return state;
      return (() => {
        const entries = trimHistory([...state.entries.slice(0, state.index + 1), state.plan]);
        return { ...state, entries, index: entries.length - 1 };
      })();

    case 'undo': {
      if (state.index <= 0) return state;
      const index = state.index - 1;
      return { ...state, index, plan: state.entries[index] };
    }

    case 'redo': {
      if (state.index >= state.entries.length - 1) return state;
      const index = state.index + 1;
      return { ...state, index, plan: state.entries[index] };
    }

    case 'reset': {
      const plan = normalizePlan(action.plan);
      return { plan, entries: [plan], index: 0 };
    }

    default:
      return state;
  }
}

export function initEditorState(plan: unknown): EditorState {
  // normalizePlan deep-copies, so editing never mutates the shared module constant.
  const first = normalizePlan(plan);
  return { plan: first, entries: [first], index: 0 };
}

export const canUndo = (s: EditorState): boolean => s.index > 0;
export const canRedo = (s: EditorState): boolean => s.index < s.entries.length - 1;
