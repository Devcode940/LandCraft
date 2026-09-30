/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type ToolType =
  | 'select'
  | 'wall'
  | 'room'
  | 'door'
  | 'window'
  | 'furniture'
  | 'measure'
  | 'delete';

export type DimensionUnit = 'ft' | 'm';

export interface Point {
  x: number;
  y: number;
}

export interface Wall {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  thickness: number; // in pixels
  height?: number; // conceptual standard is 9ft / 2.7m
  isLocked?: boolean;
}

export interface Room {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
  color: string; // Tailwind bg color preset e.g., 'bg-blue-100/30'
  customLabel?: string;
}

export interface Opening {
  id: string;
  type: 'door' | 'window';
  subType: 'single' | 'double' | 'sliding' | 'bifold' | 'standard' | 'bay' | 'large';
  x: number; // raw x if free, or computed based on wall attachment
  y: number; // raw y if free, or computed based on wall attachment
  width: number; // in pixels
  rotation: number; // in degrees
  wallId?: string; // ID of wall it is attached/snapped to
  wallOffset?: number; // ratio along the wall (0 to 1) or offset distance
  flipSwing?: boolean; // relevant for doors (swing direction)
}

export interface Furniture {
  id: string;
  subType: string; // 'sofa' | 'bed' | 'table' | 'chair' | 'plant' | 'toilet' | 'tub' | 'counter' | 'fridge' | 'tv-stand' | 'vanity'
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  category: 'living' | 'bedroom' | 'kitchen' | 'bathroom' | 'outdoor';
}

export interface MeasurementTape {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export type FloorPlanElement = 
  | { type: 'wall'; data: Wall }
  | { type: 'room'; data: Room }
  | { type: 'opening'; data: Opening }
  | { type: 'furniture'; data: Furniture };

export interface FloorPlanData {
  walls: Wall[];
  rooms: Room[];
  openings: Opening[];
  furniture: Furniture[];
}

export interface LayerVisibility {
  walls: boolean;
  rooms: boolean;
  openings: boolean;
  furniture: boolean;
  dimensions: boolean;
  wallLabels: boolean;
  grid: boolean;
}

export interface EditorState {
  plan: FloorPlanData;
  selectedElementId: string | null;
  selectedElementType: 'wall' | 'room' | 'opening' | 'furniture' | null;
  activeTool: ToolType;
  selectedPaletteItem: {
    type: 'room' | 'opening' | 'furniture';
    subType: string;
    label: string;
    width?: number;
    height?: number;
  } | null;
  history: FloorPlanData[];
  historyIndex: number;
  zoom: number;
  panX: number;
  panY: number;
  unit: DimensionUnit;
  snapToGrid: boolean;
  snapToElements: boolean;
  gridSize: number; // pixels per grid cell (e.g. 20px)
  highContrast: boolean;
}

export interface AIReviewItem {
  id: string;
  type: 'info' | 'success' | 'warning' | 'error';
  category: 'safety' | 'accessibility' | 'flow' | 'structure';
  title: string;
  message: string;
  elementId?: string;
}
