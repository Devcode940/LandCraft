/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Structured plan edits returned by the architect chat.
 *
 * The chat previously could only regenerate the *entire* plan, so asking
 * "make the kitchen bigger" discarded the user's layout and redrew it.
 * `edit_floor_plan` lets the model propose a small, typed patch instead:
 * a list of operations applied to the existing plan through the same
 * pure helpers the canvas uses (`updateElement`, `moveRoomWithContents`,
 * ...), which makes the result undoable like any manual edit.
 *
 * Model output is never trusted. Every edit is validated against a
 * whitelist of shapes before anything touches plan state; invalid
 * entries are skipped with a reason, not thrown, so one bad item in a
 * batch cannot block the good ones.
 */

import type { DimensionUnit, FloorPlanData, Furniture } from '../types';
import { addElement, deleteElement, makeId, moveRoomWithContents, updateElement } from './planOps';
import { formatDimension } from '../utils/geoUtils';

/** Matches the clip/clamp bounds in normalizePlan. */
const COORD_LIMIT = 100_000;
const MAX_SIZE = 10_000;
const MAX_THICKNESS = 500;
const MAX_LABEL = 120;
/** Bounds the work a single model response can request. */
const MAX_EDITS = 100;

const FURNITURE_CATEGORIES = new Set(['living', 'bedroom', 'kitchen', 'bathroom', 'outdoor']);

export type PlanEdit =
  | { kind: 'resizeRoom'; roomId: string; width: number; height: number }
  | { kind: 'moveRoom'; roomId: string; x: number; y: number }
  | { kind: 'relabelRoom'; roomId: string; label: string }
  | {
      kind: 'addFurniture';
      subType: string;
      label: string;
      x: number;
      y: number;
      width: number;
      height: number;
      rotation: number;
      category: Furniture['category'];
    }
  | { kind: 'moveFurniture'; furnitureId: string; x: number; y: number }
  | { kind: 'deleteElement'; elementType: 'wall' | 'room' | 'opening' | 'furniture'; id: string }
  | { kind: 'addWall'; x1: number; y1: number; x2: number; y2: number; thickness: number };

export interface SkippedEdit {
  index: number;
  reason: string;
}

export interface EditResult {
  /** New plan; identical reference to the input when nothing was applied. */
  plan: FloorPlanData;
  applied: number;
  skipped: SkippedEdit[];
  /** One line per applied edit, for the chat transcript. */
  summaries: string[];
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isId(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

/** Finite number inside the canvas coordinate bounds. */
function isCoord(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= COORD_LIMIT;
}

/** Finite positive number within a sane element size. */
function isSize(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 && v <= MAX_SIZE;
}

function isLabel(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0 && v.trim().length <= MAX_LABEL;
}

/**
 * Validate one raw edit object into a `PlanEdit`.
 * Returns null with `reason` set when the shape is wrong or references
 * nothing that could exist.
 */
function validateEdit(raw: unknown): { edit: PlanEdit } | { reason: string } {
  if (!isRecord(raw)) return { reason: 'edit is not an object' };
  const kind = raw.kind;

  switch (kind) {
    case 'resizeRoom':
      if (!isId(raw.roomId)) return { reason: 'resizeRoom: missing roomId' };
      if (!isSize(raw.width)) return { reason: 'resizeRoom: width must be a positive number' };
      if (!isSize(raw.height)) return { reason: 'resizeRoom: height must be a positive number' };
      return { edit: { kind, roomId: raw.roomId, width: raw.width, height: raw.height } };

    case 'moveRoom':
      if (!isId(raw.roomId)) return { reason: 'moveRoom: missing roomId' };
      if (!isCoord(raw.x) || !isCoord(raw.y)) return { reason: 'moveRoom: x/y out of bounds' };
      return { edit: { kind, roomId: raw.roomId, x: raw.x, y: raw.y } };

    case 'relabelRoom':
      if (!isId(raw.roomId)) return { reason: 'relabelRoom: missing roomId' };
      if (!isLabel(raw.label)) return { reason: 'relabelRoom: label must be a non-empty string' };
      return { edit: { kind, roomId: raw.roomId, label: raw.label.trim() } };

    case 'addFurniture': {
      if (!isLabel(raw.subType)) return { reason: 'addFurniture: missing subType' };
      if (!isLabel(raw.label)) return { reason: 'addFurniture: missing label' };
      if (!isCoord(raw.x) || !isCoord(raw.y)) return { reason: 'addFurniture: x/y out of bounds' };
      if (!isSize(raw.width) || !isSize(raw.height)) {
        return { reason: 'addFurniture: width/height must be positive numbers' };
      }
      if (typeof raw.rotation !== 'number' || !Number.isFinite(raw.rotation)) {
        return { reason: 'addFurniture: rotation must be a number' };
      }
      if (!FURNITURE_CATEGORIES.has(raw.category as string)) {
        return { reason: 'addFurniture: unknown category' };
      }
      return {
        edit: {
          kind,
          subType: raw.subType,
          label: raw.label,
          x: raw.x,
          y: raw.y,
          width: raw.width,
          height: raw.height,
          rotation: raw.rotation,
          category: raw.category as Furniture['category'],
        },
      };
    }

    case 'moveFurniture':
      if (!isId(raw.furnitureId)) return { reason: 'moveFurniture: missing furnitureId' };
      if (!isCoord(raw.x) || !isCoord(raw.y)) return { reason: 'moveFurniture: x/y out of bounds' };
      return { edit: { kind, furnitureId: raw.furnitureId, x: raw.x, y: raw.y } };

    case 'deleteElement':
      if (
        raw.elementType !== 'wall' &&
        raw.elementType !== 'room' &&
        raw.elementType !== 'opening' &&
        raw.elementType !== 'furniture'
      ) {
        return { reason: 'deleteElement: unknown elementType' };
      }
      if (!isId(raw.id)) return { reason: 'deleteElement: missing id' };
      return { edit: { kind, elementType: raw.elementType, id: raw.id } };

    case 'addWall':
      if (!isCoord(raw.x1) || !isCoord(raw.y1) || !isCoord(raw.x2) || !isCoord(raw.y2)) {
        return { reason: 'addWall: endpoints out of bounds' };
      }
      if (Math.hypot(raw.x2 - raw.x1, raw.y2 - raw.y1) < 1) {
        return { reason: 'addWall: endpoints are identical' };
      }
      if (typeof raw.thickness !== 'number' || raw.thickness <= 0 || raw.thickness > MAX_THICKNESS) {
        return { reason: 'addWall: thickness must be a positive number' };
      }
      return {
        edit: { kind, x1: raw.x1, y1: raw.y1, x2: raw.x2, y2: raw.y2, thickness: raw.thickness },
      };

    default:
      return { reason: `unknown edit kind: ${String(kind)}` };
  }
}

/**
 * Apply a batch of edits to a plan, in order.
 *
 * Later edits see the plan produced by earlier ones, so a batch can move
 * a room and then add furniture inside it. Edits that reference an id
 * removed earlier in the same batch are skipped, not applied.
 */
export function applyEdits(plan: FloorPlanData, edits: unknown, unit: DimensionUnit = 'm'): EditResult {
  if (!Array.isArray(edits) || edits.length === 0) {
    return { plan, applied: 0, skipped: [], summaries: [] };
  }

  let current = plan;
  let applied = 0;
  const skipped: SkippedEdit[] = [];
  const summaries: string[] = [];

  const considered = Math.min(edits.length, MAX_EDITS);
  for (let i = 0; i < considered; i++) {
    const outcome = validateEdit(edits[i]);
    if ('reason' in outcome) {
      skipped.push({ index: i, reason: outcome.reason });
      continue;
    }
    const edit = outcome.edit;

    switch (edit.kind) {
      case 'resizeRoom': {
        const next = updateElement(current, 'room', edit.roomId, {
          width: edit.width,
          height: edit.height,
        });
        if (next === current) {
          skipped.push({ index: i, reason: `resizeRoom: no room with id ${edit.roomId}` });
          continue;
        }
        current = next;
        break;
      }
      case 'moveRoom': {
        const next = moveRoomWithContents(current, edit.roomId, edit.x, edit.y);
        if (next === current) {
          skipped.push({ index: i, reason: `moveRoom: no room with id ${edit.roomId}` });
          continue;
        }
        current = next;
        break;
      }
      case 'relabelRoom': {
        const next = updateElement(current, 'room', edit.roomId, { label: edit.label });
        if (next === current) {
          skipped.push({ index: i, reason: `relabelRoom: no room with id ${edit.roomId}` });
          continue;
        }
        current = next;
        break;
      }
      case 'addFurniture': {
        current = addElement(current, 'furniture', { ...edit, id: makeId('furn') });
        break;
      }
      case 'moveFurniture': {
        const next = updateElement(current, 'furniture', edit.furnitureId, {
          x: edit.x,
          y: edit.y,
        });
        if (next === current) {
          skipped.push({ index: i, reason: `moveFurniture: no furniture with id ${edit.furnitureId}` });
          continue;
        }
        current = next;
        break;
      }
      case 'deleteElement': {
        const next = deleteElement(current, edit.elementType, edit.id);
        if (next === current) {
          skipped.push({ index: i, reason: `deleteElement: no ${edit.elementType} with id ${edit.id}` });
          continue;
        }
        current = next;
        break;
      }
      case 'addWall': {
        current = addElement(current, 'wall', { ...edit, id: makeId('wall') });
        break;
      }
    }
    summaries.push(describeEdit(edit, unit, current));
    applied++;
  }

  // A batch longer than the cap is truncated, not silently swallowed:
  // the receipt must say so, or the model appears to have dropped
  // edits without explanation.
  if (edits.length > considered) {
    skipped.push({
      index: considered,
      reason: `${edits.length - considered} more edits exceed the ${MAX_EDITS}-edit cap and were not applied`,
    });
  }

    // Preserve reference identity when nothing changed, so the editor
    // reducer (which compares with ===) records no history entry.
    return { plan: applied === 0 ? plan : current, applied, skipped, summaries };
}

/** Human-readable summary of one edit, for the chat transcript. */
export function describeEdit(edit: PlanEdit, unit: DimensionUnit, plan?: FloorPlanData): string {
  const roomLabel = (id: string): string => {
    const room = plan?.rooms.find((r) => r.id === id);
    return room?.label || id;
  };
  switch (edit.kind) {
    case 'resizeRoom':
      return `resized ${roomLabel(edit.roomId)} to ${formatDimension(edit.width, unit)} × ${formatDimension(edit.height, unit)}`;
    case 'moveRoom':
      return `moved ${roomLabel(edit.roomId)}`;
    case 'relabelRoom':
      return `renamed a room to “${edit.label}”`;
    case 'addFurniture':
      return `added ${edit.label}`;
      case 'moveFurniture': {
        const furn = plan?.furniture.find((f) => f.id === edit.furnitureId);
        return `moved ${furn?.label || edit.furnitureId}`;
      }
    case 'deleteElement':
      return `deleted ${edit.elementType} ${edit.id}`;
    case 'addWall':
      return `added a wall ${formatDimension(Math.hypot(edit.x2 - edit.x1, edit.y2 - edit.y1), unit)} long`;
  }
}
