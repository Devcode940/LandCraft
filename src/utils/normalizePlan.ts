/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Defensive normalization for floor-plan data.
 *
 * Structured output from the Gemini API is a best-effort contract, not a
 * guarantee: fields can be missing, mistyped, or absurdly large. Every AI
 * response passes through `normalizePlan` before it reaches React state,
 * because the canvas does `plan.rooms.map(...)` etc. during render -- a single
 * missing array is an unrecoverable white screen.
 */

import type { FloorPlanData, Furniture, Opening, Room, Wall } from '../types';

/** Upper bound per collection. Guards against pathological model output. */
const MAX_ITEMS = 5000;

/** Coordinate bounds in pixels. Anything outside is clipped, not dropped. */
const COORD_LIMIT = 100_000;

const OPENING_TYPES = new Set(['door', 'window']);
const FURNITURE_CATEGORIES = new Set(['living', 'bedroom', 'kitchen', 'bathroom', 'outdoor']);

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v.slice(0, MAX_ITEMS) : [];
}

/** Coerce to a finite number, clamped into range, with a fallback. */
function num(v: unknown, fallback: number, min: number, max: number): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

/** Coerce to a non-empty string id; generates one when absent. */
function id(v: unknown, prefix: string, index: number): string {
  const s = typeof v === 'string' ? v.trim() : '';
  return s.length > 0 && s.length <= 128 ? s : `${prefix}-${index}-${Math.random().toString(36).slice(2, 9)}`;
}

function normalizeWall(raw: unknown, i: number): Wall {
  const o = isRecord(raw) ? raw : {};
  return {
    id: id(o.id, 'wall', i),
    x1: num(o.x1, 0, -COORD_LIMIT, COORD_LIMIT),
    y1: num(o.y1, 0, -COORD_LIMIT, COORD_LIMIT),
    x2: num(o.x2, 0, -COORD_LIMIT, COORD_LIMIT),
    y2: num(o.y2, 0, -COORD_LIMIT, COORD_LIMIT),
    thickness: num(o.thickness, 10, 1, 200),
    height: o.height === undefined ? undefined : num(o.height, 2.7, 0.5, 20),
    isLocked: o.isLocked === true,
  };
}

function normalizeRoom(raw: unknown, i: number): Room {
  const o = isRecord(raw) ? raw : {};
  const label = typeof o.label === 'string' && o.label.trim() ? o.label.trim().slice(0, 64) : 'Untitled Room';
  const color =
    typeof o.color === 'string' && /^(rgba?\(|#|hsl\()/i.test(o.color) && o.color.length <= 64
      ? o.color
      : 'rgba(59, 130, 246, 0.08)';
  return {
    id: id(o.id, 'room', i),
    x: num(o.x, 0, -COORD_LIMIT, COORD_LIMIT),
    y: num(o.y, 0, -COORD_LIMIT, COORD_LIMIT),
    // Negative or zero extents break rendering and area math; floor at 1px.
    width: num(o.width, 100, 1, COORD_LIMIT),
    height: num(o.height, 100, 1, COORD_LIMIT),
    label,
    color,
    customLabel: typeof o.customLabel === 'string' ? o.customLabel.slice(0, 64) : undefined,
  };
}

function normalizeOpening(raw: unknown, i: number): Opening {
  const o = isRecord(raw) ? raw : {};
  const type = o.type === 'window' ? 'window' : 'door';
  return {
    id: id(o.id, type, i),
    type,
    subType: (typeof o.subType === 'string' && o.subType.trim() ? o.subType.trim().slice(0, 32) : 'single') as Opening['subType'],
    x: num(o.x, 0, -COORD_LIMIT, COORD_LIMIT),
    y: num(o.y, 0, -COORD_LIMIT, COORD_LIMIT),
    width: num(o.width, 32, 1, 1000),
    // Normalize into [0, 360) so the rotation slider stays in range.
    rotation: ((num(o.rotation, 0, -100000, 100000) % 360) + 360) % 360,
    wallId: typeof o.wallId === 'string' && o.wallId ? o.wallId.slice(0, 128) : undefined,
    wallOffset: o.wallOffset === undefined ? undefined : num(o.wallOffset, 0, 0, 1),
    flipSwing: o.flipSwing === true,
  };
}

function normalizeFurniture(raw: unknown, i: number): Furniture {
  const o = isRecord(raw) ? raw : {};
  const subType = typeof o.subType === 'string' && o.subType.trim() ? o.subType.trim().slice(0, 32) : 'table';
  const category = FURNITURE_CATEGORIES.has(o.category as string)
    ? (o.category as Furniture['category'])
    : 'living';
  return {
    id: id(o.id, 'furn', i),
    subType,
    label: typeof o.label === 'string' && o.label.trim() ? o.label.trim().slice(0, 64) : subType,
    x: num(o.x, 0, -COORD_LIMIT, COORD_LIMIT),
    y: num(o.y, 0, -COORD_LIMIT, COORD_LIMIT),
    width: num(o.width, 40, 1, COORD_LIMIT),
    height: num(o.height, 40, 1, COORD_LIMIT),
    rotation: ((num(o.rotation, 0, -100000, 100000) % 360) + 360) % 360,
    category,
  };
}

export const EMPTY_PLAN: FloorPlanData = Object.freeze({
  walls: [],
  rooms: [],
  openings: [],
  furniture: [],
}) as FloorPlanData;

/**
 * Coerce arbitrary input (parsed JSON, model output, untrusted client payload)
 * into a structurally valid FloorPlanData. Never throws, never returns
 * undefined members.
 */
export function normalizePlan(input: unknown): FloorPlanData {
  if (!isRecord(input)) return { walls: [], rooms: [], openings: [], furniture: [] };

  const walls = asArray(input.walls).map(normalizeWall);
  const rooms = asArray(input.rooms).map(normalizeRoom);
  const openings = asArray(input.openings).map(normalizeOpening);
  const furniture = asArray(input.furniture).map(normalizeFurniture);

  // Openings that reference a wallId which no longer exists are stale pointers;
  // clear them so the inspector shows "Floating" rather than a dangling id.
  const wallIds = new Set(walls.map((w) => w.id));
  for (const op of openings) {
    if (op.wallId && !wallIds.has(op.wallId)) op.wallId = undefined;
  }

  return { walls, rooms, openings, furniture };
}
