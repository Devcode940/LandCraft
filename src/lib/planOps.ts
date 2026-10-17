/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Pure operations over FloorPlanData.
 *
 * These were previously duplicated: `App.tsx` (inspector edits, deletes, palette
 * placement) and `FloorPlanCanvas.tsx` (drags) each had their own `switch (type)`
 * mapping over the four collections. Centralising them means one place to get
 * immutability right, and one place to unit-test.
 *
 * Every function returns a NEW plan. None mutate their arguments.
 */

import type { FloorPlanData, Furniture, Opening, Room, Wall } from '../types';

export type ElementType = 'wall' | 'room' | 'opening' | 'furniture';

export const EMPTY_PLAN: FloorPlanData = Object.freeze({
  walls: [],
  rooms: [],
  openings: [],
  furniture: [],
}) as FloorPlanData;

/** Fresh empty plan (not the shared frozen constant). */
export function emptyPlan(): FloorPlanData {
  return { walls: [], rooms: [], openings: [], furniture: [] };
}

/** Stable-ish unique id. Random suffix avoids the Date.now() collisions that
 *  previously produced duplicate React keys on rapid successive adds. */
export function makeId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Replace one element by id.
 * Returns the SAME plan object when nothing matched, so callers can skip a
 * wasted render (and the reducer can skip a history entry).
 */
export function updateElement<T extends ElementType>(
  plan: FloorPlanData,
  type: T,
  id: string,
  patch: Partial<FloorPlanDataMap[T]>
): FloorPlanData {
  switch (type) {
    case 'wall': {
      const i = plan.walls.findIndex((w) => w.id === id);
      if (i === -1) return plan;
      const walls = plan.walls.slice();
      walls[i] = { ...walls[i], ...patch } as Wall;
      return { ...plan, walls };
    }
    case 'room': {
      const i = plan.rooms.findIndex((r) => r.id === id);
      if (i === -1) return plan;
      const rooms = plan.rooms.slice();
      rooms[i] = { ...rooms[i], ...patch } as Room;
      return { ...plan, rooms };
    }
    case 'opening': {
      const i = plan.openings.findIndex((o) => o.id === id);
      if (i === -1) return plan;
      const openings = plan.openings.slice();
      openings[i] = { ...openings[i], ...patch } as Opening;
      return { ...plan, openings };
    }
    case 'furniture': {
      const i = plan.furniture.findIndex((f) => f.id === id);
      if (i === -1) return plan;
      const furniture = plan.furniture.slice();
      furniture[i] = { ...furniture[i], ...patch } as Furniture;
      return { ...plan, furniture };
    }
    default:
      return plan;
  }
}

interface FloorPlanDataMap {
  wall: Wall;
  room: Room;
  opening: Opening;
  furniture: Furniture;
}

/** Remove one element by id, clearing any dangling references to it. */
export function deleteElement(plan: FloorPlanData, type: ElementType, id: string): FloorPlanData {
  switch (type) {
    case 'wall':
      return {
        ...plan,
        walls: plan.walls.filter((w) => w.id !== id),
        // Openings pinned to a removed wall would keep a dangling wallId.
        openings: plan.openings.map((o) => (o.wallId === id ? { ...o, wallId: undefined } : o)),
      };
    case 'room':
      return { ...plan, rooms: plan.rooms.filter((r) => r.id !== id) };
    case 'opening':
      return { ...plan, openings: plan.openings.filter((o) => o.id !== id) };
    case 'furniture':
      return { ...plan, furniture: plan.furniture.filter((f) => f.id !== id) };
    default:
      return plan;
  }
}

export function findElement(plan: FloorPlanData, type: ElementType, id: string) {
  switch (type) {
    case 'wall':
      return plan.walls.find((w) => w.id === id) ?? null;
    case 'room':
      return plan.rooms.find((r) => r.id === id) ?? null;
    case 'opening':
      return plan.openings.find((o) => o.id === id) ?? null;
    case 'furniture':
      return plan.furniture.find((f) => f.id === id) ?? null;
    default:
      return null;
  }
}

/** Axis-aligned bounds of a furniture item (its x/y is the centre). */
export function furnitureBounds(f: Furniture) {
  return {
    x: f.x - f.width / 2,
    y: f.y - f.height / 2,
    width: f.width,
    height: f.height,
  };
}

export function rectContainsPoint(
  rect: { x: number; y: number; width: number; height: number },
  px: number,
  py: number
): boolean {
  return px >= rect.x && px <= rect.x + rect.width && py >= rect.y && py <= rect.y + rect.height;
}

export function rectContainsRect(
  outer: { x: number; y: number; width: number; height: number },
  inner: { x: number; y: number; width: number; height: number }
): boolean {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.width <= outer.x + outer.width &&
    inner.y + inner.height <= outer.y + outer.height
  );
}

/**
 * Move a room to a new origin, carrying the furniture and openings inside it.
 *
 * Previously dragging a room moved only the rectangle and left its contents
 * behind, which is not what anyone means by "move this room".
 */
export function moveRoomWithContents(plan: FloorPlanData, roomId: string, newX: number, newY: number): FloorPlanData {
  const room = plan.rooms.find((r) => r.id === roomId);
  if (!room) return plan;

  const dx = newX - room.x;
  const dy = newY - room.y;
  if (dx === 0 && dy === 0) return plan;

  const rooms = plan.rooms.map((r) => (r.id === roomId ? { ...r, x: newX, y: newY } : r));

  // Carry furniture whose centre sits inside the room.
  const furniture = plan.furniture.map((f) =>
    rectContainsPoint(room, f.x, f.y) ? { ...f, x: f.x + dx, y: f.y + dy } : f
  );

  // Carry openings that sit inside the room's rectangle.
  const openings = plan.openings.map((o) =>
    rectContainsPoint(room, o.x, o.y) ? { ...o, x: o.x + dx, y: o.y + dy } : o
  );

  return { ...plan, rooms, furniture, openings };
}

/** All ids currently in use, for duplicate detection after an import/merge. */
export function allIds(plan: FloorPlanData): Set<string> {
  const ids = new Set<string>();
  plan.walls.forEach((w) => ids.add(w.id));
  plan.rooms.forEach((r) => ids.add(r.id));
  plan.openings.forEach((o) => ids.add(o.id));
  plan.furniture.forEach((f) => ids.add(f.id));
  return ids;
}

/** True when the plan has nothing in it. */
export function isPlanEmpty(plan: FloorPlanData): boolean {
  return plan.walls.length === 0 && plan.rooms.length === 0 && plan.openings.length === 0 && plan.furniture.length === 0;
}

/** Total element count, used to gate O(n²) analysis passes. */
export function elementCount(plan: FloorPlanData): number {
  return plan.walls.length + plan.rooms.length + plan.openings.length + plan.furniture.length;
}
