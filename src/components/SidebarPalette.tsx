/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { 
  Square, 
  DoorClosed, 
  Tv, 
  Bed, 
  Bath, 
  Utensils, 
  Layout, 
  Hammer, 
  Ruler, 
  MousePointer, 
  Trash2, 
  Grid,
  Sparkles,
  ChevronDown,
  ChevronRight,
  PanelLeftClose
} from 'lucide-react';
import { ToolType } from '../types';

interface SidebarPaletteProps {
  activeTool: ToolType;
  setActiveTool: (tool: ToolType) => void;
  selectedPaletteItem: {
    type: 'room' | 'opening' | 'furniture';
    subType: string;
    label: string;
    width?: number;
    height?: number;
  } | null;
  setSelectedPaletteItem: (item: any | null) => void;
  highContrast: boolean;
  onInstantAdd: (type: 'room' | 'opening' | 'furniture', subType: string, label: string, width?: number, height?: number) => void;
  isOpen?: boolean;
  onToggle?: () => void;
}

export default function SidebarPalette({
  activeTool,
  setActiveTool,
  selectedPaletteItem,
  setSelectedPaletteItem,
  highContrast,
  onInstantAdd,
  isOpen = true,
  onToggle
}: SidebarPaletteProps) {
  const [expandedSection, setExpandedSection] = useState<string | null>('rooms');

  const toggleSection = (section: string) => {
    setExpandedSection(expandedSection === section ? null : section);
  };

  const handlePaletteSelect = (type: 'room' | 'opening' | 'furniture', subType: string, label: string, width?: number, height?: number) => {
    setSelectedPaletteItem({ type, subType, label, width, height });
    
    // Set appropriate active tool
    if (type === 'room') setActiveTool('room');
    else if (type === 'opening') setActiveTool('door');
    else if (type === 'furniture') setActiveTool('furniture');
  };

  // Pre-configured room presets (width/height in pixels)
  const roomPresets = [
    { subType: 'living', label: 'Living Room', icon: Tv, width: 160, height: 120, color: 'rgba(59, 130, 246, 0.08)' },
    { subType: 'bedroom', label: 'Bedroom', icon: Bed, width: 140, height: 100, color: 'rgba(16, 185, 129, 0.08)' },
    { subType: 'kitchen', label: 'Kitchen', icon: Utensils, width: 120, height: 80, color: 'rgba(245, 158, 11, 0.08)' },
    { subType: 'bathroom', label: 'Bathroom', icon: Bath, width: 80, height: 60, color: 'rgba(239, 68, 68, 0.06)' },
    { subType: 'office', label: 'Office/Den', icon: Square, width: 100, height: 80, color: 'rgba(99, 102, 241, 0.08)' },
    { subType: 'garage', label: 'Garage', icon: Layout, width: 180, height: 140, color: 'rgba(107, 114, 128, 0.08)' }
  ];

  // Opening presets (doors / windows)
  const openingPresets = [
    { subType: 'single', label: 'Single Door', type: 'opening', icon: DoorClosed, width: 32 },
    { subType: 'double', label: 'Double Door', type: 'opening', icon: DoorClosed, width: 48 },
    { subType: 'sliding', label: 'Sliding Door', type: 'opening', icon: DoorClosed, width: 50 },
    { subType: 'standard', label: 'Standard Window', type: 'opening', icon: Grid, width: 36 },
    { subType: 'large', label: 'Large Window', type: 'opening', icon: Grid, width: 54 },
    { subType: 'bay', label: 'Bay Window', type: 'opening', icon: Grid, width: 44 }
  ];

  // Furniture categorizations
  const furniturePresets = [
    { subType: 'bed', label: 'Queen Bed', category: 'bedroom', width: 60, height: 70 },
    { subType: 'sofa', label: '3-Seater Sofa', category: 'living', width: 70, height: 32 },
    { subType: 'table', label: 'Dining Table', category: 'kitchen', width: 50, height: 32 },
    { subType: 'chair', label: 'Dining Chair', category: 'kitchen', width: 14, height: 14 },
    { subType: 'toilet', label: 'Toilet', category: 'bathroom', width: 16, height: 22 },
    { subType: 'tub', label: 'Bathtub', category: 'bathroom', width: 50, height: 26 },
    { subType: 'counter', label: 'Kitchen Counter', category: 'kitchen', width: 60, height: 20 },
    { subType: 'fridge', label: 'Refrigerator', category: 'kitchen', width: 24, height: 24 },
    { subType: 'plant', label: 'House Plant', category: 'living', width: 16, height: 16 }
  ];

  const sidebarBg = highContrast 
    ? 'bg-white border-r-2 border-black text-black' 
    : 'bg-slate-50 dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200';

  const activeBtnStyle = highContrast
    ? 'bg-black text-white border-2 border-black'
    : 'bg-emerald-600 text-white dark:bg-emerald-700';

  const inactiveBtnStyle = highContrast
    ? 'bg-white text-black border-2 border-gray-400 hover:border-black'
    : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700';

  return (
    <div id="side-palette-container" className={`w-64 shrink-0 flex flex-col h-full overflow-y-auto ${sidebarBg}`}>
      {/* Sidebar Header & Collapse Toggle */}
      <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Layout className="w-4 h-4 text-emerald-500" />
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
            Catalog & Tools
          </h2>
        </div>
        {onToggle && (
          <button
            onClick={onToggle}
            className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            title="Collapse left sidebar (Palette)"
          >
            <PanelLeftClose className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Structural Tools */}
      <div className="p-4 border-b border-slate-200 dark:border-slate-800">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-3 flex items-center gap-1.5">
          <Hammer className="w-3.5 h-3.5" />
          <span>Editor Actions</span>
        </h3>
        <div className="grid grid-cols-2 gap-2">
          {/* Select Tool */}
          <button
            id="tool-select-btn"
            onClick={() => {
              setActiveTool('select');
              setSelectedPaletteItem(null);
            }}
            className={`flex items-center gap-2 p-2 rounded-lg text-xs font-medium cursor-pointer transition-all ${
              activeTool === 'select' ? activeBtnStyle : inactiveBtnStyle
            }`}
            title="Select & move elements"
          >
            <MousePointer className="w-3.5 h-3.5" />
            <span>Select</span>
          </button>

          {/* Wall Tool */}
          <button
            id="tool-wall-btn"
            onClick={() => {
              setActiveTool('wall');
              setSelectedPaletteItem(null);
            }}
            className={`flex items-center gap-2 p-2 rounded-lg text-xs font-medium cursor-pointer transition-all ${
              activeTool === 'wall' ? activeBtnStyle : inactiveBtnStyle
            }`}
            title="Draw wall segments"
          >
            <Hammer className="w-3.5 h-3.5 animate-pulse" />
            <span>Draw Wall</span>
          </button>

          {/* Measure Tool */}
          <button
            id="tool-measure-btn"
            onClick={() => {
              setActiveTool('measure');
              setSelectedPaletteItem(null);
            }}
            className={`flex items-center gap-2 p-2 rounded-lg text-xs font-medium cursor-pointer transition-all ${
              activeTool === 'measure' ? activeBtnStyle : inactiveBtnStyle
            }`}
            title="Measurement tape"
          >
            <Ruler className="w-3.5 h-3.5" />
            <span>Measure</span>
          </button>

          {/* Delete Tool */}
          <button
            id="tool-delete-btn"
            onClick={() => {
              setActiveTool('delete');
              setSelectedPaletteItem(null);
            }}
            className={`flex items-center gap-2 p-2 rounded-lg text-xs font-medium cursor-pointer transition-all ${
              activeTool === 'delete' ? 'bg-red-600 text-white dark:bg-red-700' : inactiveBtnStyle
            }`}
            title="Click components to delete them"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Eraser</span>
          </button>
        </div>
      </div>

      {/* Palette Elements Accordion */}
      <div className="flex-1 p-4 space-y-4">
        {/* ROOMS */}
        <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
          <button
            onClick={() => toggleSection('rooms')}
            className="w-full flex items-center justify-between p-3 text-xs font-semibold bg-slate-100 dark:bg-slate-800/50 hover:bg-slate-200 dark:hover:bg-slate-800"
          >
            <span className="flex items-center gap-1.5">
              <Square className="w-4 h-4 text-emerald-500" />
              Rooms & Zones
            </span>
            {expandedSection === 'rooms' ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
          </button>

          {expandedSection === 'rooms' && (
            <div className="p-2.5 bg-white dark:bg-slate-950 space-y-1.5">
              <p className="text-[10px] text-slate-400 dark:text-slate-500 pb-1">
                Select a room template, then click on the canvas to place it:
              </p>
              {roomPresets.map((preset) => {
                const isSelected = selectedPaletteItem?.type === 'room' && selectedPaletteItem?.subType === preset.subType;
                return (
                  <div key={preset.subType} className="flex gap-1.5 items-center">
                    <button
                      onClick={() => handlePaletteSelect('room', preset.subType, preset.label, preset.width, preset.height)}
                      className={`flex-1 flex items-center gap-2 p-2 text-left rounded text-xs transition-colors cursor-pointer ${
                        isSelected 
                          ? 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 border border-emerald-500 font-medium' 
                          : 'hover:bg-slate-100 dark:hover:bg-slate-900 border border-transparent'
                      }`}
                    >
                      <preset.icon className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <div className="truncate">
                        <div>{preset.label}</div>
                        <div className="text-[9px] text-slate-400">Default: {(preset.width / 40).toFixed(1)}m × {(preset.height / 40).toFixed(1)}m</div>
                      </div>
                    </button>
                    <button 
                      onClick={() => onInstantAdd('room', preset.subType, preset.label, preset.width, preset.height)}
                      className="p-1 text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700 rounded h-8 shrink-0 cursor-pointer"
                      title="Instantly center on plan"
                    >
                      Add +
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* OPENINGS */}
        <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
          <button
            onClick={() => toggleSection('openings')}
            className="w-full flex items-center justify-between p-3 text-xs font-semibold bg-slate-100 dark:bg-slate-800/50 hover:bg-slate-200 dark:hover:bg-slate-800"
          >
            <span className="flex items-center gap-1.5">
              <DoorClosed className="w-4 h-4 text-emerald-500" />
              Doors & Windows
            </span>
            {expandedSection === 'openings' ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
          </button>

          {expandedSection === 'openings' && (
            <div className="p-2.5 bg-white dark:bg-slate-950 space-y-1.5">
              <p className="text-[10px] text-slate-400 dark:text-slate-500 pb-1">
                Stamps will auto-snap to nearby walls when placed or dragged:
              </p>
              {openingPresets.map((preset) => {
                const isSelected = selectedPaletteItem?.type === 'opening' && selectedPaletteItem?.subType === preset.subType;
                return (
                  <div key={preset.subType} className="flex gap-1.5 items-center">
                    <button
                      onClick={() => handlePaletteSelect('opening', preset.subType, preset.label, preset.width)}
                      className={`flex-1 flex items-center gap-2 p-2 text-left rounded text-xs transition-colors cursor-pointer ${
                        isSelected 
                          ? 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 border border-emerald-500 font-medium' 
                          : 'hover:bg-slate-100 dark:hover:bg-slate-900 border border-transparent'
                      }`}
                    >
                      <preset.icon className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <div className="truncate">
                        <div>{preset.label}</div>
                        <div className="text-[9px] text-slate-400">Width: {(preset.width / 40).toFixed(2)}m</div>
                      </div>
                    </button>
                    <button 
                      onClick={() => onInstantAdd('opening', preset.subType, preset.label, preset.width)}
                      className="p-1 text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700 rounded h-8 shrink-0 cursor-pointer"
                      title="Instantly center on plan"
                    >
                      Add +
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* FURNITURE */}
        <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
          <button
            onClick={() => toggleSection('furniture')}
            className="w-full flex items-center justify-between p-3 text-xs font-semibold bg-slate-100 dark:bg-slate-800/50 hover:bg-slate-200 dark:hover:bg-slate-800"
          >
            <span className="flex items-center gap-1.5">
              <Tv className="w-4 h-4 text-emerald-500" />
              Furniture & Layout
            </span>
            {expandedSection === 'furniture' ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
          </button>

          {expandedSection === 'furniture' && (
            <div className="p-2.5 bg-white dark:bg-slate-950 space-y-1.5 max-h-[300px] overflow-y-auto">
              {furniturePresets.map((preset) => {
                const isSelected = selectedPaletteItem?.type === 'furniture' && selectedPaletteItem?.subType === preset.subType;
                return (
                  <div key={preset.subType} className="flex gap-1.5 items-center">
                    <button
                      onClick={() => handlePaletteSelect('furniture', preset.subType, preset.label, preset.width, preset.height)}
                      className={`flex-1 flex items-center gap-2 p-2 text-left rounded text-xs transition-colors cursor-pointer ${
                        isSelected 
                          ? 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 border border-emerald-500 font-medium' 
                          : 'hover:bg-slate-100 dark:hover:bg-slate-900 border border-transparent'
                      }`}
                    >
                      <Bed className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <div className="truncate">
                        <div>{preset.label}</div>
                        <div className="text-[9px] text-slate-400">{(preset.width / 40).toFixed(1)}m × {(preset.height / 40).toFixed(1)}m</div>
                      </div>
                    </button>
                    <button 
                      onClick={() => onInstantAdd('furniture', preset.subType, preset.label, preset.width, preset.height)}
                      className="p-1 text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700 rounded h-8 shrink-0 cursor-pointer"
                      title="Instantly center on plan"
                    >
                      Add +
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Selected placement helper warning */}
      {selectedPaletteItem && (
        <div className="p-3 m-3 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/40 rounded-lg text-[11px] text-amber-800 dark:text-amber-300">
          <div className="flex items-center gap-1 font-medium mb-1">
            <Sparkles className="w-3 h-3 text-amber-500 animate-spin" />
            <span>Placement Active</span>
          </div>
          <p className="leading-snug">
            Click on canvas to place <strong className="font-semibold">{selectedPaletteItem.label}</strong>. Press <kbd className="px-1 bg-white dark:bg-slate-800 border border-slate-300 rounded shadow-xs text-[9px]">Esc</kbd> to cancel.
          </p>
        </div>
      )}
    </div>
  );
}
