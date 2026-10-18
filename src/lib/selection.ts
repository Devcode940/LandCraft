/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Selection model.
 *
 * The editor started with a single selected element (one id + one
 * type in two useStates). Multi-select needs one source of truth:
 * a selection is always a set of ids of ONE element type, because
 * the inspector edits fields that only make sense per type.
 *
 * Pure and unit-tested: toggle/single semantics are exactly the
 * kind of thing that drifts when written inline in event handlers.
 */

import type { ElementType } from './planOps';

export interface EditorSelection {
  type: ElementType | null;
  ids: string[];
}

export const EMPTY_SELECTION: EditorSelection = { type: null, ids: [] };

/** Select exactly one element. */
export function selectSingle(type: ElementType, id: string): EditorSelection {
  return { type, ids: [id] };
}

/**
 * Additive click (Shift/Ctrl/Cmd+click): toggles one id within the
 * same type. Clicking a different type starts a fresh selection --
 * mixing types would leave the inspector with nothing coherent to edit.
 */
export function toggleId(selection: EditorSelection, type: ElementType, id: string): EditorSelection {
  if (selection.type !== type) return selectSingle(type, id);
  return selection.ids.includes(id)
    ? { type, ids: selection.ids.filter((i) => i !== id) }
    : { type, ids: [...selection.ids, id] };
}

/** True when the element is part of the current selection. */
export function isSelected(selection: EditorSelection, type: ElementType, id: string): boolean {
  return selection.type === type && selection.ids.includes(id);
}
