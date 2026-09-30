/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Room, Furniture, DimensionUnit, Point } from '../types';
import { PIXELS_PER_METER, PIXELS_PER_FOOT } from './geoUtils';

export interface DetectedFurnitureSummary {
  subType: string;
  label: string;
  count: number;
}

export interface RoomSuggestion {
  roomId: string;
  currentLabel: string;
  suggestedName: string;
  confidence: number; // 0 - 100
  category: 'bedroom' | 'bathroom' | 'kitchen' | 'living' | 'dining' | 'office' | 'utility' | 'storage' | 'general';
  reason: string;
  detectedFurniture: DetectedFurnitureSummary[];
  alternativeNames: string[];
  areaFormatted: string;
  dimensionsFormatted: string;
  areaM2: number;
  currentMatchesSuggestion: boolean;
  isGenericLabel: boolean;
}

/**
 * Checks if a 2D point is inside a room boundary
 */
export function isPointInRoom(p: Point, room: Room): boolean {
  return (
    p.x >= room.x &&
    p.x <= room.x + room.width &&
    p.y >= room.y &&
    p.y <= room.y + room.height
  );
}

/**
 * Returns all furniture items placed within a defined room boundary
 */
export function getFurnitureInRoom(room: Room, furnitureList: Furniture[]): Furniture[] {
  return furnitureList.filter(furn => isPointInRoom({ x: furn.x, y: furn.y }, room));
}

/**
 * Analyzes room dimensions and placed furniture to suggest the most appropriate room name
 */
export function suggestRoomName(
  room: Room,
  allFurniture: Furniture[],
  unit: DimensionUnit = 'm'
): RoomSuggestion {
  const furnitureInRoom = getFurnitureInRoom(room, allFurniture);

  // Calculate dimensions and area
  const widthM = room.width / PIXELS_PER_METER;
  const heightM = room.height / PIXELS_PER_METER;
  const areaM2 = (room.width * room.height) / (PIXELS_PER_METER * PIXELS_PER_METER);
  const areaSqFt = areaM2 * 10.7639;

  const areaFormatted = unit === 'm' 
    ? `${areaM2.toFixed(1)} m²` 
    : `${Math.round(areaSqFt)} sq ft`;

  const dimWidthFormatted = unit === 'm'
    ? `${widthM.toFixed(1)}m`
    : `${Math.round(widthM * 3.28084)}'`;
  const dimHeightFormatted = unit === 'm'
    ? `${heightM.toFixed(1)}m`
    : `${Math.round(heightM * 3.28084)}'`;
  const dimensionsFormatted = `${dimWidthFormatted} × ${dimHeightFormatted}`;

  // Tally furniture types
  const counts: Record<string, { label: string; count: number }> = {};
  for (const f of furnitureInRoom) {
    const key = f.subType.toLowerCase();
    if (!counts[key]) {
      counts[key] = { label: f.label || f.subType, count: 0 };
    }
    counts[key].count++;
  }

  const detectedFurniture: DetectedFurnitureSummary[] = Object.entries(counts).map(
    ([subType, info]) => ({
      subType,
      label: info.label,
      count: info.count
    })
  );

  const has = (type: string) => (counts[type]?.count || 0) > 0;
  const getCount = (type: string) => counts[type]?.count || 0;

  // Inference logic
  let suggestedName = "Room";
  let confidence = 50;
  let category: RoomSuggestion['category'] = 'general';
  let reason = "";
  let alternativeNames: string[] = [];

  // Check signature furniture combinations
  if (has('bed')) {
    category = 'bedroom';
    if (areaM2 >= 16 || (has('plant') && areaM2 >= 13) || getCount('bed') > 1) {
      suggestedName = "Master Bedroom";
      confidence = 96;
      reason = `Spacious ${areaFormatted} suite with bed layout`;
      alternativeNames = ["Primary Suite", "Bedroom", "Guest Bedroom", "Executive Suite"];
    } else if (areaM2 >= 9) {
      suggestedName = "Bedroom";
      confidence = 94;
      reason = `Standard bedroom layout (${areaFormatted}) with bed`;
      alternativeNames = ["Guest Bedroom", "Master Bedroom", "Kids Bedroom", "Bedroom 2"];
    } else {
      suggestedName = "Compact Bedroom";
      confidence = 88;
      reason = `Cozy footprint (${areaFormatted}) with bed setup`;
      alternativeNames = ["Nursery", "Single Bedroom", "Guest Room", "Study / Bedroom"];
    }
  } else if (has('toilet') || has('tub')) {
    category = 'bathroom';
    if (has('toilet') && has('tub')) {
      if (areaM2 >= 6.5) {
        suggestedName = "Master Bathroom";
        confidence = 98;
        reason = `Full ensuite bathroom with bathtub & toilet (${areaFormatted})`;
        alternativeNames = ["Ensuite Bathroom", "Full Bathroom", "Spa Bathroom"];
      } else {
        suggestedName = "Full Bathroom";
        confidence = 96;
        reason = `Equipped with toilet and bathtub fixtures (${areaFormatted})`;
        alternativeNames = ["Bathroom", "Family Bathroom", "Guest Bath"];
      }
    } else if (has('tub')) {
      suggestedName = "Bathroom";
      confidence = 92;
      reason = `Contains bathtub/shower unit (${areaFormatted})`;
      alternativeNames = ["Bath Suite", "Washroom", "Master Bath"];
    } else if (has('toilet')) {
      if (areaM2 <= 3.5) {
        suggestedName = "Powder Room";
        confidence = 95;
        reason = `Compact half-bath with toilet fixture (${areaFormatted})`;
        alternativeNames = ["Half Bathroom", "Guest WC", "Restroom"];
      } else {
        suggestedName = "Bathroom";
        confidence = 90;
        reason = `Equipped with toilet facility (${areaFormatted})`;
        alternativeNames = ["Half Bathroom", "Powder Room", "Washroom"];
      }
    }
  } else if (has('counter') || has('fridge')) {
    category = 'kitchen';
    if (has('counter') && has('fridge')) {
      if (has('table') || areaM2 >= 18) {
        suggestedName = "Eat-In Kitchen";
        confidence = 96;
        reason = `Kitchen counters, fridge, and dining space (${areaFormatted})`;
        alternativeNames = ["Kitchen & Dining", "Open Kitchen", "Chef's Kitchen"];
      } else if (areaM2 <= 6) {
        suggestedName = "Kitchenette";
        confidence = 92;
        reason = `Compact galley kitchen with counters and fridge (${areaFormatted})`;
        alternativeNames = ["Kitchen", "Pantry Kitchen", "Prep Kitchen"];
      } else {
        suggestedName = "Kitchen";
        confidence = 95;
        reason = `Food preparation layout with counters and fridge (${areaFormatted})`;
        alternativeNames = ["Chef's Kitchen", "Open Kitchen", "Kitchenette"];
      }
    } else if (has('counter')) {
      if (has('table')) {
        suggestedName = "Kitchen & Dining";
        confidence = 88;
        reason = `Includes preparation counter and dining table (${areaFormatted})`;
        alternativeNames = ["Kitchen", "Dining Area", "Breakfast Nook"];
      } else if (areaM2 <= 4.5) {
        suggestedName = "Pantry / Scullery";
        confidence = 85;
        reason = `Compact preparation/counter storage zone (${areaFormatted})`;
        alternativeNames = ["Utility Room", "Kitchenette", "Coffee Bar"];
      } else {
        suggestedName = "Kitchen";
        confidence = 90;
        reason = `Installed cabinetry and preparation counter (${areaFormatted})`;
        alternativeNames = ["Kitchenette", "Prep Kitchen", "Utility Room"];
      }
    } else if (has('fridge')) {
      suggestedName = "Kitchenette";
      confidence = 82;
      reason = `Equipped with refrigeration unit (${areaFormatted})`;
      alternativeNames = ["Kitchen", "Refreshment Bar", "Break Room"];
    }
  } else if (has('sofa')) {
    category = 'living';
    if (has('table') && areaM2 >= 18) {
      suggestedName = "Open Living & Dining";
      confidence = 94;
      reason = `Combined lounge seating and dining table (${areaFormatted})`;
      alternativeNames = ["Great Room", "Living Room", "Family Room"];
    } else if (areaM2 >= 22) {
      suggestedName = "Great Room";
      confidence = 95;
      reason = `Spacious entertainment and gathering hall (${areaFormatted})`;
      alternativeNames = ["Living Room", "Main Lounge", "Family Room"];
    } else if (areaM2 >= 11) {
      suggestedName = "Living Room";
      confidence = 94;
      reason = `Comfortable lounge area with sofa (${areaFormatted})`;
      alternativeNames = ["Family Room", "Sitting Room", "Media Room", "Lounge"];
    } else {
      suggestedName = "Cozy Den";
      confidence = 86;
      reason = `Intimate lounge space with sofa (${areaFormatted})`;
      alternativeNames = ["TV Room", "Sitting Area", "Reading Nook", "Study"];
    }
  } else if (has('table') && has('chair')) {
    if (areaM2 >= 10) {
      category = 'dining';
      suggestedName = "Dining Room";
      confidence = 92;
      reason = `Dedicated dining setting with table and chairs (${areaFormatted})`;
      alternativeNames = ["Formal Dining", "Conference Room", "Dining Area"];
    } else {
      category = 'dining';
      suggestedName = "Breakfast Nook";
      confidence = 86;
      reason = `Compact seating area with table and chairs (${areaFormatted})`;
      alternativeNames = ["Dining Area", "Study Nook", "Dinette"];
    }
  } else if (has('table')) {
    category = 'office';
    suggestedName = "Home Office";
    confidence = 80;
    reason = `Workspace area with desk/table (${areaFormatted})`;
    alternativeNames = ["Study", "Library", "Craft Room", "Work Room"];
  } else if (has('plant') && furnitureInRoom.length === 1) {
    if (areaM2 >= 15) {
      category = 'living';
      suggestedName = "Living Room";
      confidence = 65;
      reason = `Open plan living dimensions with decor (${areaFormatted})`;
      alternativeNames = ["Lounge", "Sunroom", "Great Room"];
    } else {
      category = 'utility';
      suggestedName = "Sunroom / Foyer";
      confidence = 65;
      reason = `Decorated entryway or sunroom (${areaFormatted})`;
      alternativeNames = ["Entry Foyer", "Study", "Solarium"];
    }
  } else {
    // Pure dimensional inference (no furniture placed)
    if (areaM2 <= 2.8) {
      category = 'storage';
      suggestedName = "Walk-In Closet";
      confidence = 68;
      reason = `Compact footprint (${areaFormatted}) typical for storage or closet`;
      alternativeNames = ["Pantry", "Storage Closet", "Utility Space", "Powder Room"];
    } else if (areaM2 <= 5.5) {
      category = 'bathroom';
      suggestedName = "Bathroom / Utility";
      confidence = 65;
      reason = `Proportions (${areaFormatted}) match standard bathroom or laundry`;
      alternativeNames = ["Bathroom", "Laundry Room", "Walk-In Closet", "Foyer"];
    } else if (areaM2 <= 9) {
      category = 'office';
      suggestedName = "Office / Den";
      confidence = 65;
      reason = `Compact room scale (${areaFormatted}) ideal for study or den`;
      alternativeNames = ["Home Office", "Small Bedroom", "Study", "Nursery"];
    } else if (areaM2 <= 17) {
      category = 'bedroom';
      suggestedName = "Bedroom";
      confidence = 70;
      reason = `Standard residential room proportion (${areaFormatted}) for bedrooms`;
      alternativeNames = ["Master Bedroom", "Guest Room", "Kitchen", "Dining Room"];
    } else if (areaM2 <= 26) {
      category = 'living';
      suggestedName = "Living Room";
      confidence = 72;
      reason = `Expansive area (${areaFormatted}) suited for primary living`;
      alternativeNames = ["Great Room", "Open Living & Dining", "Master Suite"];
    } else {
      category = 'living';
      suggestedName = "Great Room";
      confidence = 75;
      reason = `Large open area (${areaFormatted}) suited for main hall or open living`;
      alternativeNames = ["Open Concept Living", "Main Hall", "Studio Space"];
    }
  }

  // Check if current room label already aligns
  const currentTrimmed = (room.label || '').trim().toLowerCase();
  const suggestedTrimmed = suggestedName.toLowerCase();
  
  // Generic labels check
  const genericPatterns = [/^(room|zone|area|space|unnamed|untitled|new room)\b/i, /^\d+$/, /^$/];
  const isGenericLabel = genericPatterns.some(pat => pat.test(currentTrimmed));

  const currentMatchesSuggestion = 
    currentTrimmed === suggestedTrimmed ||
    alternativeNames.some(alt => alt.toLowerCase() === currentTrimmed);

  return {
    roomId: room.id,
    currentLabel: room.label,
    suggestedName,
    confidence,
    category,
    reason,
    detectedFurniture,
    alternativeNames,
    areaFormatted,
    dimensionsFormatted,
    areaM2,
    currentMatchesSuggestion,
    isGenericLabel
  };
}

/**
 * Returns suggestions for all rooms in the floor plan
 */
export function suggestAllRooms(
  rooms: Room[],
  allFurniture: Furniture[],
  unit: DimensionUnit = 'm'
): RoomSuggestion[] {
  return rooms.map(room => suggestRoomName(room, allFurniture, unit));
}
