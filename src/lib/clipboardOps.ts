/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Copy / paste / duplicate for the editor.
 *
 * Pasted elements must never keep their source ids: React keys
 * would collide and the undo history would conflate the original
 * with the copy. Every pasted element gets a fresh id, a fixed
 * offset so it does not stack invisibly on the original, and
 * openings lose their wall pin (the source wall was not copied,
 * so the reference would dangle).
 */

import type { FloorPlanData, Furniture, Opening, Room, Wall } from '../types';
import { makeId, type ElementType } from './planOps';

/** Fixed paste offset in canvas px. Successive pastes stack. */
export const PASTE_OFFSET_PX = 40;

export interface Clipboard {
  type: ElementType;
  items: ReadonlyArray<Wall | Room | Opening | Furniture>;
}

/** Deep-copy the selected elements for the clipboard. */
export function copyElements(
  plan: FloorPlanData,
  type: ElementType,
  ids: readonly string[],
): Clipboard | null {
  if (ids.length === 0) return null;
  const idSet = new Set(ids);

  switch (type) {
    case 'wall': {
      const items = plan.walls.filter((w) => idSet.has(w.id));
      return items.length ? { type, items: items.map((w) => ({ ...w })) } : null;
    }
    case 'room': {
      const items = plan.rooms.filter((r) => idSet.has(r.id));
      return items.length ? { type, items: items.map((r) => ({ ...r })) } : null;
    }
    case 'opening': {
      const items = plan.openings.filter((o) => idSet.has(o.id));
      return items.length ? { type, items: items.map((o) => ({ ...o })) } : null;
    }
    case 'furniture': {
      const items = plan.furniture.filter((f) => idSet.has(f.id));
      return items.length ? { type, items: items.map((f) => ({ ...f })) } : null;
    }
    default:
      return null;
  }
}

/**
 * Append the clipboard to the plan at `offsetPx` from the
 * originals. Returns the SAME plan reference when the clipboard
 * is empty or holds ids that no longer exist.
 */
export function pasteElements(
  plan: FloorPlanData,
  clipboard: Clipboard | null,
  offsetPx: number = PASTE_OFFSET_PX,
): FloorPlanData {
  if (!clipboard || clipboard.items.length === 0) return plan;

  switch (clipboard.type) {
    case 'wall':
      return {
        ...plan,
        walls: [
          ...plan.walls,
          ...(clipboard.items as Wall[]).map((w) => ({
            ...(w as Wall),
            id: makeId('wall'),
            x1: w.x1 + offsetPx,
            y1: w.y1 + offsetPx,
            x2: w.x2 + offsetPx,
            y2: w.y2 + offsetPx,
          })),
        ],
      };
    case 'room':
      return {
        ...plan,
        rooms: [
          ...plan.rooms,
          ...(clipboard.items as Room[]).map((r) => ({
            ...r,
            id: makeId('room'),
            x: r.x + offsetPx,
            y: r.y + offsetPx,
          })),
        ],
      };
    case 'opening':
      return {
        ...plan,
        openings: [
          ...plan.openings,
          ...(clipboard.items as Opening[]).map((o) => ({
            ...o,
            id: makeId('open'),
            x: o.x + offsetPx,
            y: o.y + offsetPx,
            // The source wall was not copied with it.
            wallId: undefined,
            wallOffset: undefined,
          })),
        ],
      };
    case 'furniture':
      return {
        ...plan,
        furniture: [
          ...plan.furniture,
          ...(clipboard.items as Furniture[]).map((f) => ({
            ...f,
            id: makeId('furn'),
            x: f.x + offsetPx,
            y: f.y + offsetPx,
          })),
        ],
      };
    default:
      return plan;
  }
}
