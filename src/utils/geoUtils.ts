/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Point, Wall, Room, Opening, Furniture, DimensionUnit } from '../types';

// Scale factor: 1 meter = 40 pixels
// 1 foot = 12.192 pixels (since 1 foot = 0.3048 meters)
export const PIXELS_PER_METER = 40;
export const PIXELS_PER_FOOT = 12.192;

/**
 * Convert pixels to formatted dimension string
 */
export function formatDimension(pixels: number, unit: DimensionUnit): string {
  if (unit === 'm') {
    const meters = pixels / PIXELS_PER_METER;
    return `${meters.toFixed(2)} m`;
  } else {
    const totalInches = (pixels / PIXELS_PER_FOOT) * 12;
    const feet = Math.floor(totalInches / 12);
    const inches = Math.round(totalInches % 12);
    return `${feet}' ${inches}"`;
  }
}

/**
 * Convert pixels to formatted wall length and width (thickness) strings
 */
export function formatWallDimensions(
  lengthPx: number,
  thicknessPx: number,
  unit: DimensionUnit
): { lengthStr: string; widthStr: string; combinedStr: string } {
  let lengthStr = '';
  let widthStr = '';

  if (unit === 'm') {
    const lengthMeters = lengthPx / PIXELS_PER_METER;
    lengthStr = `${lengthMeters.toFixed(2)}m`;

    // 40px = 1m = 100cm
    const thicknessCm = Math.round((thicknessPx / PIXELS_PER_METER) * 100);
    widthStr = thicknessCm >= 100 
      ? `${(thicknessCm / 100).toFixed(2)}m` 
      : `${thicknessCm}cm`;
  } else {
    // Imperial: 12.192px = 1ft
    const totalInches = (lengthPx / PIXELS_PER_FOOT) * 12;
    const feet = Math.floor(totalInches / 12);
    const inches = Math.round(totalInches % 12);
    lengthStr = `${feet}' ${inches}"`;

    const thicknessInches = Math.round((thicknessPx / PIXELS_PER_FOOT) * 12);
    widthStr = `${thicknessInches}"`;
  }

  return {
    lengthStr,
    widthStr,
    combinedStr: `L: ${lengthStr} • W: ${widthStr}`
  };
}

/**
 * Calculate distance between two points
 */
export function getDistance(p1: Point, p2: Point): number {
  return Math.sqrt((p2.x - p1.x) ** 2 + (p2.y - p1.y) ** 2);
}

/**
 * Get closest point on a line segment (AB) from point (P)
 */
export function getClosestPointOnSegment(p: Point, a: Point, b: Point): { point: Point; offset: number; distance: number } {
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
    y: a.y + t * abY
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
    y: Math.round(p.y / gridSize) * gridSize
  };
}

/**
 * Smart snap a point considering grid and nearby wall endpoints
 */
export function getSmartSnap(
  p: Point,
  walls: Wall[],
  gridSize: number,
  options: { snapToGrid: boolean; snapToElements: boolean }
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
        { x: wall.x2, y: wall.y2 }
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
  threshold = 20
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
    offset: wallOffset
  };
}

/**
 * Calculate area of a room in square meters and square feet
 */
export function calculateRoomArea(width: number, height: number, unit: DimensionUnit): { area: number; formatted: string } {
  const widthM = width / PIXELS_PER_METER;
  const heightM = height / PIXELS_PER_METER;
  const areaM2 = widthM * heightM;
  
  if (unit === 'm') {
    return {
      area: areaM2,
      formatted: `${areaM2.toFixed(1)} m²`
    };
  } else {
    const widthFt = width / PIXELS_PER_FOOT;
    const heightFt = height / PIXELS_PER_FOOT;
    const areaFt2 = widthFt * heightFt;
    return {
      area: areaFt2,
      formatted: `${areaFt2.toFixed(0)} sq ft`
    };
  }
}

/**
 * Intersection helper to check collision between two AABBs (Axis-Aligned Bounding Boxes)
 */
export function checkBoundingBoxCollision(
  rect1: { x: number; y: number; width: number; height: number },
  rect2: { x: number; y: number; width: number; height: number }
): boolean {
  return (
    rect1.x < rect2.x + rect2.width &&
    rect1.x + rect1.width > rect2.x &&
    rect1.y < rect2.y + rect2.height &&
    rect1.y + rect1.height > rect2.y
  );
}

/**
 * Check collision of elements (furniture-furniture or door-furniture)
 */
export function checkOverlapWarnings(
  rooms: Room[],
  openings: Opening[],
  furniture: Furniture[]
): { id: string; elementId: string; type: 'warning'; message: string }[] {
  const warnings: { id: string; elementId: string; type: 'warning'; message: string }[] = [];

  // Check furniture overlaps
  for (let i = 0; i < furniture.length; i++) {
    const f1 = furniture[i];
    const r1 = { x: f1.x - f1.width / 2, y: f1.y - f1.height / 2, width: f1.width, height: f1.height };
    
    // Furniture vs Furniture
    for (let j = i + 1; j < furniture.length; j++) {
      const f2 = furniture[j];
      const r2 = { x: f2.x - f2.width / 2, y: f2.y - f2.height / 2, width: f2.width, height: f2.height };
      
      if (checkBoundingBoxCollision(r1, r2)) {
        warnings.push({
          id: `warn-f-${f1.id}-${f2.id}`,
          elementId: f1.id,
          type: 'warning',
          message: `Overlap detected between '${f1.label}' and '${f2.label}'.`
        });
      }
    }

    // Furniture vs Doors/Windows (especially door swing areas!)
    for (const op of openings) {
      if (op.type === 'door') {
        // Approximate a door swing box
        // Swing is width-sized radius from (x, y)
        const doorRadius = op.width;
        const doorBox = {
          x: op.x - doorRadius,
          y: op.y - doorRadius,
          width: doorRadius * 2,
          height: doorRadius * 2
        };
        
        if (checkBoundingBoxCollision(r1, doorBox)) {
          warnings.push({
            id: `warn-f-door-${f1.id}-${op.id}`,
            elementId: f1.id,
            type: 'warning',
            message: `Furniture '${f1.label}' blocks the door swing of '${op.subType === 'single' ? 'Door' : 'Sliding Door'}'.`
          });
        }
      }
    }
  }

  return warnings;
}
