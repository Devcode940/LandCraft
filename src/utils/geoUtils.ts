/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Point, Wall, Room, Opening, Furniture, DimensionUnit } from '../types';

// Scale factor: 1 meter = 40 pixels
// 1 foot = 12.192 pixels (since 1 foot = 0.3048 meters)
export const PIXELS_PER_METER = 40;
export const PIXELS_PER_FOOT = 12.192;

/** Split a pixel length into feet + whole inches, carrying the round-up. */
export function pixelsToFeetInches(pixels: number): { feet: number; inches: number } {
  // Round to whole inches FIRST, then split. Rounding the remainder
  // independently produced impossible values like 5' 12".
  const totalInches = Math.round((pixels / PIXELS_PER_FOOT) * 12);
  return { feet: Math.floor(totalInches / 12), inches: totalInches % 12 };
}

/**
 * Convert pixels to formatted dimension string
 */
export function formatDimension(pixels: number, unit: DimensionUnit): string {
  if (unit === 'm') {
    const meters = pixels / PIXELS_PER_METER;
    return `${meters.toFixed(2)} m`;
  } else {
    const { feet, inches } = pixelsToFeetInches(pixels);
    return `${feet}' ${inches}"`;
  }
}

/**
 * Convert pixels to formatted wall length and width (thickness) strings
 */
export function formatWallDimensions(
  lengthPx: number,
  thicknessPx: number,
  unit: DimensionUnit,
): { lengthStr: string; widthStr: string; combinedStr: string } {
  let lengthStr: string;
  let widthStr: string;

  if (unit === 'm') {
    const lengthMeters = lengthPx / PIXELS_PER_METER;
    lengthStr = `${lengthMeters.toFixed(2)}m`;

    // 40px = 1m = 100cm
    const thicknessCm = Math.round((thicknessPx / PIXELS_PER_METER) * 100);
    widthStr = thicknessCm >= 100 ? `${(thicknessCm / 100).toFixed(2)}m` : `${thicknessCm}cm`;
  } else {
    // Imperial: 12.192px = 1ft
    const { feet, inches } = pixelsToFeetInches(lengthPx);
    lengthStr = `${feet}' ${inches}"`;

    const thicknessInches = Math.round((thicknessPx / PIXELS_PER_FOOT) * 12);
    widthStr = `${thicknessInches}"`;
  }

  return {
    lengthStr,
    widthStr,
    combinedStr: `L: ${lengthStr} • W: ${widthStr}`,
  };
}

/**
 * Calculate distance between two points
 */
/**
 * The point `lengthPx` away from `start` in the direction of
 * `towards`. Used by the numeric wall-length input: the user
 * types an exact dimension while drafting, and the wall runs
 * towards wherever the cursor currently points (horizontal by
 * default, before the cursor has moved).
 */
export function endpointAtLength(start: Point, towards: Point, lengthPx: number): Point {
  const dx = towards.x - start.x;
  const dy = towards.y - start.y;
  const magnitude = Math.hypot(dx, dy);
  if (magnitude < 1e-6) return { x: start.x + lengthPx, y: start.y };
  return {
    x: start.x + (dx / magnitude) * lengthPx,
    y: start.y + (dy / magnitude) * lengthPx,
  };
}

/**
 * Position and orientation of a point at `offset` (0..1) along a
 * wall. Openings pinned to a wall derive their render position from
 * this, so a wall that is moved or reshaped can keep its doors and
 * windows attached instead of leaving them floating behind.
 */
export function pointAtWallOffset(
  wall: Wall,
  offset: number,
): { x: number; y: number; rotation: number } {
  const t = Math.min(1, Math.max(0, offset));
  return {
    x: wall.x1 + (wall.x2 - wall.x1) * t,
    y: wall.y1 + (wall.y2 - wall.y1) * t,
    rotation: (Math.atan2(wall.y2 - wall.y1, wall.x2 - wall.x1) * 180) / Math.PI,
  };
}

/**
 * Parse a typed wall length in the active unit into
 * canvas pixels. Returns null for anything that is not
 * a positive finite number -- the input stays up so the
 * user can fix it, rather than silently drawing nothing.
 */
export function parseWallLength(input: string, unit: DimensionUnit): number | null {
  const n = Number(input.trim());
  if (!Number.isFinite(n) || n <= 0) return null;
  return unit === 'm' ? n * PIXELS_PER_METER : n * PIXELS_PER_FOOT;
}

export function getDistance(p1: Point, p2: Point): number {
  return Math.sqrt((p2.x - p1.x) ** 2 + (p2.y - p1.y) ** 2);
}

/**
 * Get closest point on a line segment (AB) from point (P)
 */
export function getClosestPointOnSegment(
  p: Point,
  a: Point,
  b: Point,
): { point: Point; offset: number; distance: number } {
  const abX = b.x - a.x;
  const abY = b.y - a.y;
  const abLen2 = abX * abX + abY * abY;

  if (abLen2 === 0) {
    const dist = getDistance(p, a);
    return { point: { ...a }, offset: 0, distance: dist };
  }

  // Projection factor (t)
  const apX = p.x - a.x;
  const apY = p.y - a.y;
  let t = (apX * abX + apY * abY) / abLen2;
  t = Math.max(0, Math.min(1, t)); // clamp to segment

  const closestPoint = {
    x: a.x + t * abX,
    y: a.y + t * abY,
  };

  const dist = getDistance(p, closestPoint);
  return { point: closestPoint, offset: t, distance: dist };
}

/**
 * Snap point to grid
 */
export function snapToGrid(p: Point, gridSize: number): Point {
  return {
    x: Math.round(p.x / gridSize) * gridSize,
    y: Math.round(p.y / gridSize) * gridSize,
  };
}

/**
 * Smart snap a point considering grid and nearby wall endpoints
 */
export function getSmartSnap(
  p: Point,
  walls: Wall[],
  gridSize: number,
  options: { snapToGrid: boolean; snapToElements: boolean },
): Point {
  if (!options.snapToGrid && !options.snapToElements) {
    return p;
  }

  let bestPoint = { ...p };
  let bestDist = Infinity;
  const elementSnapThreshold = 15; // pixels

  // 1. Element Snapping (Snap to Wall Joints)
  if (options.snapToElements) {
    for (const wall of walls) {
      const endpoints = [
        { x: wall.x1, y: wall.y1 },
        { x: wall.x2, y: wall.y2 },
      ];

      for (const ep of endpoints) {
        const d = getDistance(p, ep);
        if (d < elementSnapThreshold && d < bestDist) {
          bestDist = d;
          bestPoint = { ...ep };
        }
      }
    }
  }

  // If snapped to an element, return it
  if (bestDist < elementSnapThreshold) {
    return bestPoint;
  }

  // 2. Grid Snapping
  if (options.snapToGrid) {
    return snapToGrid(p, gridSize);
  }

  return p;
}

/**
 * Smart snap an opening (Door/Window) to the closest wall
 */
export function snapOpeningToWalls(
  p: Point,
  walls: Wall[],
  threshold = 20,
): { point: Point; wallId: string | undefined; rotation: number; offset: number } {
  let closestWall: Wall | undefined;
  let minDistance = threshold;
  let snappedPoint = { ...p };
  let wallOffset = 0;
  let rotation = 0;

  for (const wall of walls) {
    const a = { x: wall.x1, y: wall.y1 };
    const b = { x: wall.x2, y: wall.y2 };

    const { point, offset, distance } = getClosestPointOnSegment(p, a, b);

    if (distance < minDistance) {
      minDistance = distance;
      closestWall = wall;
      snappedPoint = point;
      wallOffset = offset;

      // Calculate rotation along wall
      const dy = b.y - a.y;
      const dx = b.x - a.x;
      rotation = (Math.atan2(dy, dx) * 180) / Math.PI;
    }
  }

  return {
    point: snappedPoint,
    wallId: closestWall?.id,
    rotation: closestWall ? rotation : 0,
    offset: wallOffset,
  };
}

/**
 * Calculate area of a room in square meters and square feet
 */
export function calculateRoomArea(
  width: number,
  height: number,
  unit: DimensionUnit,
): { area: number; formatted: string } {
  const widthM = width / PIXELS_PER_METER;
  const heightM = height / PIXELS_PER_METER;
  const areaM2 = widthM * heightM;

  if (unit === 'm') {
    return {
      area: areaM2,
      formatted: `${areaM2.toFixed(1)} m²`,
    };
  } else {
    const widthFt = width / PIXELS_PER_FOOT;
    const heightFt = height / PIXELS_PER_FOOT;
    const areaFt2 = widthFt * heightFt;
    return {
      area: areaFt2,
      formatted: `${areaFt2.toFixed(0)} sq ft`,
    };
  }
}

/**
 * Bounding box of all walls, in pixels. Returns null when there are no walls.
 * Used to derive build area from the structural envelope rather than from
 * user-drawn room rectangles (which are often absent or overlapping).
 */
export function getWallBounds(walls: Wall[]): { x: number; y: number; width: number; height: number } | null {
  if (walls.length === 0) return null;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const w of walls) {
    minX = Math.min(minX, w.x1, w.x2);
    maxX = Math.max(maxX, w.x1, w.x2);
    minY = Math.min(minY, w.y1, w.y2);
    maxY = Math.max(maxY, w.y1, w.y2);
  }

  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/**
 * Intersection helper to check collision between two AABBs (Axis-Aligned Bounding Boxes)
 */
export function checkBoundingBoxCollision(
  rect1: { x: number; y: number; width: number; height: number },
  rect2: { x: number; y: number; width: number; height: number },
): boolean {
  return (
    rect1.x < rect2.x + rect2.width &&
    rect1.x + rect1.width > rect2.x &&
    rect1.y < rect2.y + rect2.height &&
    rect1.y + rect1.height > rect2.y
  );
}

export function furnitureRect(f: Furniture) {
  return { x: f.x - f.width / 2, y: f.y - f.height / 2, width: f.width, height: f.height };
}

const normalizeDeg = (deg: number) => ((deg % 360) + 360) % 360;

/**
 * Is `p` inside the swept quarter-disc of a door?
 *
 * The canvas draws the leaf from the hinge along local +x, and the swing arc
 * to (0, ±width). In world space that is the angular sector [rotation,
 * rotation+90] (or [rotation-90, rotation] when flipped), radius = width.
 *
 * The previous implementation used a 2w x 2w box centred on the hinge, which
 * is twice the swept area and extends through the wall and behind the hinge --
 * it reported collisions that cannot happen and missed ones that can.
 */
export function isPointInDoorSwing(p: Point, op: Opening): boolean {
  const dx = p.x - op.x;
  const dy = p.y - op.y;
  const dist2 = dx * dx + dy * dy;
  const r = op.width;

  if (dist2 > r * r) return false;
  if (dist2 < 1e-6) return true; // on the hinge

  const angle = normalizeDeg((Math.atan2(dy, dx) * 180) / Math.PI);
  const start = normalizeDeg(op.flipSwing ? op.rotation - 90 : op.rotation);
  return normalizeDeg(angle - start) <= 90;
}

/** Does an AABB intersect a door's swing sector? */
export function boxIntersectsDoorSwing(
  box: { x: number; y: number; width: number; height: number },
  op: Opening,
): boolean {
  const corners: Point[] = [
    { x: box.x, y: box.y },
    { x: box.x + box.width, y: box.y },
    { x: box.x, y: box.y + box.height },
    { x: box.x + box.width, y: box.y + box.height },
  ];
  if (corners.some((c) => isPointInDoorSwing(c, op))) return true;

  // Closest point on the box to the hinge: catches a swing that bites into the
  // middle of an edge without touching a corner.
  const closest = {
    x: Math.min(Math.max(op.x, box.x), box.x + box.width),
    y: Math.min(Math.max(op.y, box.y), box.y + box.height),
  };
  return isPointInDoorSwing(closest, op);
}

export interface OverlapWarning {
  id: string;
  elementId: string;
  type: 'warning';
  message: string;
}

/**
 * Check collision of elements.
 *
 * `rooms` is now actually used: the previous version accepted it and ignored
 * it, which meant room-vs-room overlaps and furniture sitting outside every
 * room were never reported -- while the UI asserted "No furniture overlaps ...
 * detected. Interior pathways have optimal physical clearances."
 */
export function checkOverlapWarnings(
  rooms: Room[],
  openings: Opening[],
  furniture: Furniture[],
): OverlapWarning[] {
  const warnings: OverlapWarning[] = [];

  // --- Room vs Room: zones should tile, not stack ---
  for (let i = 0; i < rooms.length; i++) {
    for (let j = i + 1; j < rooms.length; j++) {
      const a = rooms[i];
      const b = rooms[j];
      if (checkBoundingBoxCollision(a, b)) {
        warnings.push({
          id: `warn-room-${a.id}-${b.id}`,
          elementId: a.id,
          type: 'warning',
          message: `Room zones '${a.label}' and '${b.label}' overlap, which double-counts floor area.`,
        });
      }
    }
  }

  for (let i = 0; i < furniture.length; i++) {
    const f1 = furniture[i];
    const r1 = furnitureRect(f1);

    // --- Furniture vs Furniture ---
    for (let j = i + 1; j < furniture.length; j++) {
      const f2 = furniture[j];
      const r2 = furnitureRect(f2);

      if (checkBoundingBoxCollision(r1, r2)) {
        warnings.push({
          id: `warn-f-${f1.id}-${f2.id}`,
          elementId: f1.id,
          type: 'warning',
          message: `Overlap detected between '${f1.label}' and '${f2.label}'.`,
        });
      }
    }

    // --- Furniture outside every room boundary ---
    const insideSomeRoom = rooms.some(
      (room) =>
        r1.x >= room.x - 0.5 &&
        r1.y >= room.y - 0.5 &&
        r1.x + r1.width <= room.x + room.width + 0.5 &&
        r1.y + r1.height <= room.y + room.height + 0.5,
    );
    if (rooms.length > 0 && !insideSomeRoom) {
      warnings.push({
        id: `warn-f-outside-${f1.id}`,
        elementId: f1.id,
        type: 'warning',
        message: `'${f1.label}' sits outside every room zone. Place it fully inside a room for accurate area and clearance checks.`,
      });
    }

    // --- Furniture blocking a door swing ---
    for (const op of openings) {
      if (op.type !== 'door') continue;
      if (boxIntersectsDoorSwing(r1, op)) {
        warnings.push({
          id: `warn-f-door-${f1.id}-${op.id}`,
          elementId: f1.id,
          type: 'warning',
          message: `'${f1.label}' blocks the swing of the ${op.subType === 'single' ? 'door' : `${op.subType} door`}.`,
        });
      }
    }
  }

  return warnings;
}
