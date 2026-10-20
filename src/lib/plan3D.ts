/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Pure plan -> 3D geometry transforms.
 *
 * Everything the 3D viewers need (AR projection and the orbit
 * preview) is derived here as plain data: positions in metres,
 * sizes in metres, Y-rotations in radians. Keeping the math out
 * of the components means it is unit-testable without a WebGL
 * context, and the two viewers cannot drift apart.
 */

import type { FloorPlanData, Furniture, Opening, Wall } from '../types';
import { PIXELS_PER_METER } from '../utils/geoUtils';

/** Standard storey height, matching the wall `height` convention. */
export const WALL_HEIGHT_M = 2.7;
export const DOOR_HEIGHT_M = 2.1;
export const DOOR_THICKNESS_M = 0.05;
export const WINDOW_SILL_M = 0.9;
export const WINDOW_HEIGHT_M = 1.2;

/** Furniture heights in metres, by subtype. */
export const FURNITURE_HEIGHTS: Record<string, number> = {
  bed: 0.6,
  sofa: 0.8,
  table: 0.75,
  chair: 0.9,
  counter: 0.9,
  fridge: 1.8,
  toilet: 0.75,
  tub: 0.55,
  plant: 1.2,
  'tv-stand': 0.5,
  vanity: 0.85,
};
export const DEFAULT_FURNITURE_HEIGHT_M = 0.8;

export interface WallBox {
  id: string;
  /** Centre in metres, Y up. */
  center: [number, number, number];
  size: [number, number, number];
  /** Radians about Y. Three.js rotates clockwise for positive angles
   *  while canvas angles run counter-clockwise, hence the negation. */
  rotationY: number;
}

export interface OpeningBox {
  id: string;
  center: [number, number, number];
  size: [number, number, number];
  rotationY: number;
}

export interface FurnitureBox {
  id: string;
  center: [number, number, number];
  size: [number, number, number];
  rotationY: number;
}

const toM = (px: number): number => px / PIXELS_PER_METER;

export function wallToBox(wall: Wall): WallBox {
  const dx = wall.x2 - wall.x1;
  const dy = wall.y2 - wall.y1;
  const height = wall.height ? toM(wall.height) : WALL_HEIGHT_M;
  return {
    id: wall.id,
    center: [toM((wall.x1 + wall.x2) / 2), height / 2, toM((wall.y1 + wall.y2) / 2)],
    size: [toM(Math.hypot(dx, dy)), height, toM(wall.thickness || 10)],
    rotationY: -Math.atan2(dy, dx),
  };
}

/**
 * A door or window as a box.
 *
 * Doors render as a leaf standing on the hinge, swung along the
 * wall direction (matching the 2D swing arc); windows as a panel
 * in the upper part of the wall.
 */
export function openingToBox(op: Opening): OpeningBox {
  const theta = (op.rotation * Math.PI) / 180;
  const cx = toM(op.x);
  const cz = toM(op.y);
  const width = toM(op.width);
  const rotationY = -theta;

  if (op.type === 'window') {
    return {
      id: op.id,
      center: [cx, WINDOW_SILL_M + WINDOW_HEIGHT_M / 2, cz],
      size: [width, WINDOW_HEIGHT_M, 0.08],
      rotationY,
    };
  }

  const dirX = Math.cos(theta);
  const dirZ = Math.sin(theta);
  return {
    id: op.id,
    center: [cx + (dirX * width) / 2, DOOR_HEIGHT_M / 2, cz + (dirZ * width) / 2],
    size: [width, DOOR_HEIGHT_M, DOOR_THICKNESS_M],
    rotationY,
  };
}

export function furnitureToBox(f: Furniture): FurnitureBox {
  const height = FURNITURE_HEIGHTS[f.subType] ?? DEFAULT_FURNITURE_HEIGHT_M;
  return {
    id: f.id,
    center: [toM(f.x), height / 2, toM(f.y)],
    size: [toM(f.width), height, toM(f.height)],
    rotationY: (-f.rotation * Math.PI) / 180,
  };
}

/** Centre of the plan's extent in metres, so the model is
 *  positioned around the origin instead of wherever the user
 *  happened to start drawing. Falls back to rooms when the plan
 *  has zones but no walls yet. */
export function planCenter(plan: FloorPlanData): { x: number; z: number } {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  const consider = (xs: number[], ys: number[]) => {
    for (const x of xs) {
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
    }
    for (const y of ys) {
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
  };

  plan.walls.forEach((w) => consider([w.x1, w.x2], [w.y1, w.y2]));
  if (minX === Infinity) {
    plan.rooms.forEach((r) => consider([r.x, r.x + r.width], [r.y, r.y + r.height]));
  }
  if (minX === Infinity) return { x: 0, z: 0 };

  return { x: ((minX + maxX) / 2) / PIXELS_PER_METER, z: ((minY + maxY) / 2) / PIXELS_PER_METER };
}

/** Suggested starting camera distance: far enough to frame the
 *  whole model with margin. */
export function cameraDistanceFor(plan: FloorPlanData): number {
  const center = planCenter(plan);
  let radius = 3;
  const consider = (x: number, y: number) => {
    radius = Math.max(radius, Math.hypot(x / PIXELS_PER_METER - center.x, y / PIXELS_PER_METER - center.z));
  };
  plan.walls.forEach((w) => {
    consider(w.x1, w.y1);
    consider(w.x2, w.y2);
  });
  plan.rooms.forEach((r) => {
    consider(r.x, r.y);
    consider(r.x + r.width, r.y + r.height);
  });
  // Distance from an isometric-ish angle that frames `radius`.
  return radius * 2.4 + 2;
}
