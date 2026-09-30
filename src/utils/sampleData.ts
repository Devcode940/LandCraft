/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { FloorPlanData } from '../types';

export const starterPlans: Record<string, { name: string; data: FloorPlanData }> = {
  oneBedroom: {
    name: "Modern 1-Bedroom Apartment",
    data: {
      walls: [
        // Outer box (8m x 6m -> 320px x 240px)
        { id: "wall-outer-top", x1: 50, y1: 50, x2: 450, y2: 50, thickness: 12 },
        { id: "wall-outer-right", x1: 450, y1: 50, x2: 450, y2: 350, thickness: 12 },
        { id: "wall-outer-bottom", x1: 450, y1: 350, x2: 50, y2: 350, thickness: 12 },
        { id: "wall-outer-left", x1: 50, y1: 350, x2: 50, y2: 50, thickness: 12 },
        // Interior partitions
        // Bathroom/Bedroom wall (x = 250px)
        { id: "wall-int-1", x1: 250, y1: 50, x2: 250, y2: 200, thickness: 8 },
        // Bedroom divider (y = 200px)
        { id: "wall-int-2", x1: 50, y1: 200, x2: 250, y2: 200, thickness: 8 },
        // Hallway divider (x = 170px)
        { id: "wall-int-3", x1: 170, y1: 200, x2: 170, y2: 350, thickness: 8 }
      ],
      rooms: [
        // Living & Dining Area (Right side, 200px x 300px)
        { id: "room-living", x: 250, y: 50, width: 200, height: 300, label: "Living & Kitchen", color: "rgba(59, 130, 246, 0.08)" },
        // Master Bedroom (Left Top, 200px x 150px)
        { id: "room-bed", x: 50, y: 50, width: 200, height: 150, label: "Master Bedroom", color: "rgba(16, 185, 129, 0.08)" },
        // Bathroom (Left Bottom Left, 120px x 150px)
        { id: "room-bath", x: 50, y: 200, width: 120, height: 150, label: "Bathroom", color: "rgba(245, 158, 11, 0.08)" },
        // Entry Hallway (Left Bottom Right, 80px x 150px)
        { id: "room-entry", x: 170, y: 200, width: 80, height: 150, label: "Entryway", color: "rgba(107, 114, 128, 0.08)" }
      ],
      openings: [
        // Front door (Entrance hallway bottom)
        { id: "door-front", type: "door", subType: "single", x: 210, y: 350, width: 36, rotation: 180, wallId: "wall-outer-bottom", wallOffset: 0.6 },
        // Bedroom door (Bedroom dividing wall near hallway)
        { id: "door-bed", type: "door", subType: "single", x: 210, y: 200, width: 32, rotation: 0, wallId: "wall-int-2", wallOffset: 0.8 },
        // Bathroom door (Bathroom wall near entry)
        { id: "door-bath", type: "door", subType: "single", x: 170, y: 250, width: 30, rotation: 90, wallId: "wall-int-3", wallOffset: 0.33 },
        // Living room windows
        { id: "win-living-1", type: "window", subType: "standard", x: 450, y: 150, width: 50, rotation: 90, wallId: "wall-outer-right", wallOffset: 0.33 },
        { id: "win-living-2", type: "window", subType: "large", x: 450, y: 260, width: 60, rotation: 90, wallId: "wall-outer-right", wallOffset: 0.7 },
        // Bedroom window
        { id: "win-bed", type: "window", subType: "standard", x: 150, y: 50, width: 50, rotation: 0, wallId: "wall-outer-top", wallOffset: 0.25 },
        // Bathroom window
        { id: "win-bath", type: "window", subType: "standard", x: 50, y: 275, width: 24, rotation: 270, wallId: "wall-outer-left", wallOffset: 0.75 }
      ],
      furniture: [
        // Bedroom
        { id: "furn-bed", subType: "bed", label: "Queen Bed", x: 120, y: 100, width: 60, height: 70, rotation: 0, category: "bedroom" },
        { id: "furn-bedside-l", subType: "table", label: "Nightstand L", x: 80, y: 75, width: 16, height: 16, rotation: 0, category: "bedroom" },
        { id: "furn-bedside-r", subType: "table", label: "Nightstand R", x: 160, y: 75, width: 16, height: 16, rotation: 0, category: "bedroom" },
        // Living / Dining
        { id: "furn-sofa", subType: "sofa", label: "Sofa", x: 340, y: 260, width: 70, height: 32, rotation: 90, category: "living" },
        { id: "furn-coffee", subType: "table", label: "Coffee Table", x: 380, y: 260, width: 24, height: 40, rotation: 90, category: "living" },
        { id: "furn-tv", subType: "chair", label: "TV Stand", x: 440, y: 260, width: 10, height: 50, rotation: 90, category: "living" },
        { id: "furn-dining-table", subType: "table", label: "Dining Table", x: 300, y: 110, width: 45, height: 32, rotation: 0, category: "kitchen" },
        { id: "furn-dining-c1", subType: "chair", label: "Chair 1", x: 300, y: 85, width: 14, height: 14, rotation: 0, category: "kitchen" },
        { id: "furn-dining-c2", subType: "chair", label: "Chair 2", x: 300, y: 135, width: 14, height: 14, rotation: 180, category: "kitchen" },
        // Kitchen appliances
        { id: "furn-fridge", subType: "fridge", label: "Refrigerator", x: 420, y: 75, width: 24, height: 24, rotation: 0, category: "kitchen" },
        // Bathroom
        { id: "furn-toilet", subType: "toilet", label: "Toilet", x: 80, y: 230, width: 18, height: 24, rotation: 270, category: "bathroom" },
        { id: "furn-shower", subType: "tub", label: "Bathtub", x: 125, y: 320, width: 50, height: 28, rotation: 180, category: "bathroom" },
        // Plant
        { id: "furn-plant", subType: "plant", label: "Fiddle Leaf Fig", x: 280, y: 320, width: 18, height: 18, rotation: 0, category: "living" }
      ]
    }
  },
  tinyStudio: {
    name: "Cozy Tiny Studio (Off-Grid)",
    data: {
      walls: [
        // Outer box (6m x 4m -> 240px x 160px)
        { id: "tiny-w-top", x1: 100, y1: 100, x2: 340, y2: 100, thickness: 12 },
        { id: "tiny-w-right", x1: 340, y1: 100, x2: 340, y2: 260, thickness: 12 },
        { id: "tiny-w-bottom", x1: 340, y1: 260, x2: 100, y2: 260, thickness: 12 },
        { id: "tiny-w-left", x1: 100, y1: 260, x2: 100, y2: 100, thickness: 12 },
        // Bath separation
        { id: "tiny-w-bath", x1: 100, y1: 200, x2: 180, y2: 200, thickness: 8 },
        { id: "tiny-w-bath-front", x1: 180, y1: 200, x2: 180, y2: 260, thickness: 8 }
      ],
      rooms: [
        { id: "tiny-r-main", x: 180, y: 100, width: 160, height: 160, label: "Studio Living", color: "rgba(139, 92, 246, 0.08)" },
        { id: "tiny-r-bath", x: 100, y: 200, width: 80, height: 60, label: "Bath", color: "rgba(239, 68, 68, 0.06)" },
        { id: "tiny-r-loft", x: 100, y: 100, width: 80, height: 100, label: "Kitchenette", color: "rgba(245, 158, 11, 0.08)" }
      ],
      openings: [
        { id: "tiny-door-main", type: "door", subType: "single", x: 260, y: 260, width: 32, rotation: 180, wallId: "tiny-w-bottom", wallOffset: 0.66 },
        { id: "tiny-door-bath", type: "door", subType: "single", x: 180, y: 225, width: 24, rotation: 90, wallId: "tiny-w-bath-front", wallOffset: 0.4 },
        { id: "tiny-win-front", type: "window", subType: "large", x: 260, y: 100, width: 50, rotation: 0, wallId: "tiny-w-top", wallOffset: 0.66 },
        { id: "tiny-win-side", type: "window", subType: "standard", x: 340, y: 180, width: 36, rotation: 90, wallId: "tiny-w-right", wallOffset: 0.5 }
      ],
      furniture: [
        { id: "tiny-f-bed", subType: "bed", label: "Folding Sofa Bed", x: 295, y: 150, width: 45, height: 60, rotation: 90, category: "bedroom" },
        { id: "tiny-f-kitchen", subType: "counter", label: "Kitchen Counter", x: 135, y: 115, width: 50, height: 20, rotation: 0, category: "kitchen" },
        { id: "tiny-f-toilet", subType: "toilet", label: "Compost Toilet", x: 120, y: 230, width: 16, height: 20, rotation: 180, category: "bathroom" },
        { id: "tiny-f-table", subType: "table", label: "Drop-Leaf Table", x: 220, y: 130, width: 24, height: 24, rotation: 0, category: "living" },
        { id: "tiny-f-chair", subType: "chair", label: "Folding Chair", x: 220, y: 160, width: 14, height: 14, rotation: 0, category: "living" }
      ]
    }
  }
};
