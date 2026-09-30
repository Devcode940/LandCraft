/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { 
  Trash2, 
  RotateCw, 
  ArrowLeftRight, 
  Settings, 
  Lock, 
  Unlock,
  Ruler,
  Layers,
  Sparkles,
  Check,
  CheckCircle2,
  PanelRightClose
} from 'lucide-react';
import { 
  Wall, 
  Room, 
  Opening, 
  Furniture, 
  DimensionUnit 
} from '../types';
import { formatDimension, calculateRoomArea } from '../utils/geoUtils';
import { suggestRoomName } from '../utils/roomAutoLabeler';

interface PropertyInspectorProps {
  selectedElement: any | null;
  selectedType: 'wall' | 'room' | 'opening' | 'furniture' | null;
  onUpdateElement: (type: 'wall' | 'room' | 'opening' | 'furniture', id: string, updatedData: any) => void;
  onDeleteElement: (type: 'wall' | 'room' | 'opening' | 'furniture', id: string) => void;
  unit: DimensionUnit;
  highContrast: boolean;
  layerVisibility: any;
  setLayerVisibility: (v: any) => void;
  showWallLabels?: boolean;
  setShowWallLabels?: (val: boolean) => void;
  furnitureList?: Furniture[];
  onOpenAutoLabeler?: () => void;
  isOpen?: boolean;
  onToggle?: () => void;
}

export default function PropertyInspector({
  selectedElement,
  selectedType,
  onUpdateElement,
  onDeleteElement,
  unit,
  highContrast,
  layerVisibility,
  setLayerVisibility,
  showWallLabels = true,
  setShowWallLabels,
  furnitureList = [],
  onOpenAutoLabeler,
  isOpen = true,
  onToggle
}: PropertyInspectorProps) {

  const inspectorBg = highContrast
    ? 'bg-white border-l-2 border-black text-black'
    : 'bg-slate-50 dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200';

  if (!selectedElement || !selectedType) {
    return (
      <div id="inspector-container" className={`w-64 shrink-0 p-4 flex flex-col h-full overflow-y-auto ${inspectorBg}`}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Settings className="w-4 h-4 text-slate-400" />
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
              Element Inspector
            </h3>
          </div>
          {onToggle && (
            <button
              onClick={onToggle}
              className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              title="Collapse right sidebar (Inspector)"
            >
              <PanelRightClose className="w-4 h-4" />
            </button>
          )}
        </div>
        <div className="flex-1 flex flex-col items-center justify-center text-center p-6 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
          <Settings className="w-8 h-8 text-slate-300 dark:text-slate-700 mb-2.5 animate-spin-slow" />
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            No element selected
          </p>
          <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1 max-w-[140px] mx-auto">
            Click on any wall, room, door, window or furniture to inspect and edit its properties.
          </p>
        </div>

        {/* LAYER VISIBILITY MANAGER */}
        <div className="mt-6 pt-6 border-t border-slate-200 dark:border-slate-800">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-3 flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5" />
            <span>Blueprint Layers</span>
          </h4>
          <div className="space-y-2.5">
            {Object.entries(layerVisibility).map(([layer, visible]) => {
              if (layer === 'grid') return null; // handled separately or here
              const labelMap: Record<string, string> = {
                walls: 'Structural Walls',
                rooms: 'Room Label/Zones',
                openings: 'Doors & Windows',
                furniture: 'Furniture & Decor',
                dimensions: 'Auto-Dimensions',
                wallLabels: 'Wall L×W Labels'
              };
              return (
                <label key={layer} className="flex items-center gap-2 text-xs font-medium cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={visible as boolean}
                    onChange={(e) => {
                      const next = { ...layerVisibility, [layer]: e.target.checked };
                      setLayerVisibility(next);
                      if (layer === 'wallLabels' && setShowWallLabels) {
                        setShowWallLabels(e.target.checked);
                      }
                    }}
                    className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 w-3.5 h-3.5"
                  />
                  <span className="capitalize">{labelMap[layer] || layer}</span>
                </label>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // Handle value modifications
  const handleValueChange = (field: string, val: any) => {
    onUpdateElement(selectedType, selectedElement.id, { [field]: val });
  };

  const handleDelete = () => {
    onDeleteElement(selectedType, selectedElement.id);
  };

  return (
    <div id="inspector-container" className={`w-64 shrink-0 p-4 flex flex-col h-full overflow-y-auto ${inspectorBg}`}>
      <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3 mb-4">
        <div className="flex items-center gap-2">
          <Settings className="w-4 h-4 text-emerald-500" />
          <h3 className="text-xs font-bold uppercase tracking-wider">
            {selectedType} Properties
          </h3>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={handleDelete}
            className="p-1.5 text-slate-400 hover:text-red-500 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            title="Delete selected item"
          >
            <Trash2 className="w-4 h-4" />
          </button>
          {onToggle && (
            <button
              onClick={onToggle}
              className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              title="Collapse right sidebar (Inspector)"
            >
              <PanelRightClose className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 space-y-4 text-xs">
        {/* ID DISPLAY */}
        <div>
          <span className="text-[10px] text-slate-400 font-mono block">ELEMENT ID</span>
          <span className="font-mono text-slate-500 dark:text-slate-400 font-medium select-all bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded text-[10px]">{selectedElement.id}</span>
        </div>

        {/* 1. WALL PROPERTIES */}
        {selectedType === 'wall' && (
          <>
            <div>
              <label className="block text-slate-400 font-semibold mb-1">Wall Thickness (Width)</label>
              <div className="flex gap-1.5 items-center">
                <input
                  type="number"
                  min="4"
                  max="40"
                  value={(selectedElement as Wall).thickness}
                  onChange={(e) => handleValueChange('thickness', parseInt(e.target.value) || 8)}
                  className="w-20 p-1.5 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded font-mono text-center focus:outline-emerald-500"
                />
                <span className="text-slate-400 font-mono">px</span>
                <span className="text-[10px] text-slate-400">
                  (≈ {(((selectedElement as Wall).thickness / 40) * 100).toFixed(0)} cm / {(((selectedElement as Wall).thickness / 12.192) * 12).toFixed(0)} in)
                </span>
              </div>
            </div>

            <div>
              <span className="block text-slate-400 font-semibold mb-1">Real-Time Dimensions (L × W)</span>
              <div className="space-y-1.5 font-mono text-xs text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800/60 p-2.5 rounded-lg border border-slate-200 dark:border-slate-700/50">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-500" />
                    Length (Span):
                  </span>
                  <span className="font-bold text-emerald-600 dark:text-emerald-400">
                    {(() => {
                      const wall = selectedElement as Wall;
                      const len = Math.sqrt((wall.x2 - wall.x1) ** 2 + (wall.y2 - wall.y1) ** 2);
                      return formatDimension(len, unit);
                    })()}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-sky-500" />
                    Width (Thick):
                  </span>
                  <span className="font-bold text-sky-600 dark:text-sky-400">
                    {unit === 'm' 
                      ? `${(((selectedElement as Wall).thickness / 40) * 100).toFixed(0)} cm (${((selectedElement as Wall).thickness / 40).toFixed(2)} m)`
                      : `${(((selectedElement as Wall).thickness / 12.192) * 12).toFixed(0)} in`}
                  </span>
                </div>
              </div>
            </div>

            {/* Quick Canvas Toggle for Wall L×W Labels */}
            {setShowWallLabels && (
              <div className="pt-1">
                <button
                  type="button"
                  onClick={() => setShowWallLabels(!showWallLabels)}
                  className={`w-full py-1.5 px-2.5 rounded-md text-xs font-semibold flex items-center justify-between border cursor-pointer transition-colors ${
                    showWallLabels
                      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400'
                      : 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500'
                  }`}
                >
                  <span className="flex items-center gap-1.5">
                    <Ruler className="w-3.5 h-3.5" />
                    Wall L×W Labels on Canvas
                  </span>
                  <span className="font-mono font-bold text-[10px] uppercase">
                    {showWallLabels ? 'Active' : 'Off'}
                  </span>
                </button>
              </div>
            )}

            <div className="p-2.5 bg-slate-100 dark:bg-slate-800/40 rounded-lg space-y-1.5 text-[10px] text-slate-500">
              <p className="font-semibold text-slate-700 dark:text-slate-300">💡 Designer Tip</p>
              <p>Drag wall endpoints on the canvas to stretch or re-orient structural walls. Attached openings will slide correctly, and length & width recalculate in real-time.</p>
            </div>
          </>
        )}

        {/* 2. ROOM PROPERTIES */}
        {selectedType === 'room' && (() => {
          const room = selectedElement as Room;
          const roomSuggestion = suggestRoomName(room, furnitureList, unit);

          return (
            <>
              <div>
                <label className="block text-slate-400 font-semibold mb-1">Room Label</label>
                <input
                  type="text"
                  value={room.label}
                  onChange={(e) => handleValueChange('label', e.target.value)}
                  className="w-full p-2 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded focus:outline-emerald-500 font-medium"
                  placeholder="e.g. Master Bedroom"
                />
              </div>

              {/* AI Auto-Labeling Suggestion Card */}
              <div className="p-3 rounded-xl border border-emerald-500/30 bg-emerald-500/5 dark:bg-emerald-950/20 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-bold text-[11px]">
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Auto-Label Suggestion</span>
                  </div>
                  <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-600 dark:text-emerald-300 font-bold">
                    {roomSuggestion.confidence}% Match
                  </span>
                </div>

                <div className="space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-sm text-slate-800 dark:text-slate-100">
                      {roomSuggestion.suggestedName}
                    </span>
                    {!roomSuggestion.currentMatchesSuggestion ? (
                      <button
                        type="button"
                        onClick={() => handleValueChange('label', roomSuggestion.suggestedName)}
                        className="px-2.5 py-1 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[10px] cursor-pointer transition-transform hover:scale-105 shadow-sm"
                      >
                        Apply Name
                      </button>
                    ) : (
                      <span className="text-[10px] text-emerald-600 dark:text-emerald-400 flex items-center gap-1 font-semibold">
                        <Check className="w-3 h-3" /> Current Match
                      </span>
                    )}
                  </div>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-snug">
                    {roomSuggestion.reason}
                  </p>
                </div>

                {/* Detected furniture breakdown inside room boundary */}
                {roomSuggestion.detectedFurniture.length > 0 ? (
                  <div className="pt-2 border-t border-emerald-500/20">
                    <span className="text-[9px] uppercase tracking-wider text-slate-400 block mb-1 font-semibold">
                      Furniture Inside Boundary:
                    </span>
                    <div className="flex flex-wrap gap-1">
                      {roomSuggestion.detectedFurniture.map(f => (
                        <span 
                          key={f.subType} 
                          className="text-[9px] px-1.5 py-0.5 rounded bg-white dark:bg-slate-900 border border-emerald-500/20 text-slate-700 dark:text-slate-300 font-mono"
                        >
                          {f.count}× {f.label}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="pt-1.5 border-t border-emerald-500/20 text-[9px] text-slate-400 italic">
                    💡 Drop furniture inside room to refine architectural suggestions.
                  </div>
                )}

                {/* Alternative suggestions chips */}
                {roomSuggestion.alternativeNames.length > 0 && (
                  <div className="pt-2 border-t border-emerald-500/20">
                    <span className="text-[9px] uppercase tracking-wider text-slate-400 block mb-1 font-semibold">
                      Alternative Names:
                    </span>
                    <div className="flex flex-wrap gap-1">
                      {roomSuggestion.alternativeNames.map(alt => (
                        <button
                          key={alt}
                          type="button"
                          onClick={() => handleValueChange('label', alt)}
                          className={`text-[9px] px-2 py-0.5 rounded-md transition-colors cursor-pointer border ${
                            room.label.toLowerCase() === alt.toLowerCase()
                              ? 'bg-emerald-600 text-white font-bold border-emerald-600'
                              : 'bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800'
                          }`}
                        >
                          {alt}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Batch All Rooms Auto-Label trigger button */}
                {onOpenAutoLabeler && (
                  <div className="pt-1">
                    <button
                      type="button"
                      onClick={onOpenAutoLabeler}
                      className="w-full text-center text-[10px] text-emerald-600 dark:text-emerald-400 hover:underline cursor-pointer font-medium"
                    >
                      Scan & Auto-Label All Rooms...
                    </button>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-slate-400 font-semibold mb-1">Width (px)</label>
                <input
                  type="number"
                  min="30"
                  max="1000"
                  step="5"
                  value={Math.round((selectedElement as Room).width)}
                  onChange={(e) => handleValueChange('width', parseInt(e.target.value) || 100)}
                  className="w-full p-1.5 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded font-mono text-center focus:outline-emerald-500"
                />
              </div>
              <div>
                <label className="block text-slate-400 font-semibold mb-1">Height (px)</label>
                <input
                  type="number"
                  min="30"
                  max="1000"
                  step="5"
                  value={Math.round((selectedElement as Room).height)}
                  onChange={(e) => handleValueChange('height', parseInt(e.target.value) || 100)}
                  className="w-full p-1.5 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded font-mono text-center focus:outline-emerald-500"
                />
              </div>
            </div>

            <div>
              <span className="block text-slate-400 font-semibold mb-1">Calculated Area</span>
              <div className="flex items-center gap-1.5 font-mono text-slate-700 dark:text-slate-300 bg-emerald-500/10 p-2.5 rounded border border-emerald-500/20">
                <span className="font-bold text-emerald-600 dark:text-emerald-400 text-sm">
                  {calculateRoomArea((selectedElement as Room).width, (selectedElement as Room).height, unit).formatted}
                </span>
              </div>
            </div>

            <div>
              <span className="block text-slate-400 font-semibold mb-1.5">Color Shading</span>
              <div className="grid grid-cols-5 gap-1.5">
                {[
                  { name: 'Blue', color: 'rgba(59, 130, 246, 0.08)' },
                  { name: 'Emerald', color: 'rgba(16, 185, 129, 0.08)' },
                  { name: 'Amber', color: 'rgba(245, 158, 11, 0.08)' },
                  { name: 'Indigo', color: 'rgba(99, 102, 241, 0.08)' },
                  { name: 'Grey', color: 'rgba(107, 114, 128, 0.08)' }
                ].map((shade) => (
                  <button
                    key={shade.name}
                    onClick={() => handleValueChange('color', shade.color)}
                    className="h-6 rounded cursor-pointer border border-slate-200 dark:border-slate-800 transition-transform hover:scale-105"
                    style={{ backgroundColor: shade.color }}
                    title={shade.name}
                  />
                ))}
              </div>
            </div>
          </>
          );
        })()}

        {/* 3. OPENINGS (DOORS / WINDOWS) PROPERTIES */}
        {selectedType === 'opening' && (
          <>
            <div>
              <span className="block text-slate-400 font-semibold mb-1">Type</span>
              <span className="capitalize bg-slate-100 dark:bg-slate-800 py-1 px-2 rounded font-medium inline-block">
                {(selectedElement as Opening).type} ({(selectedElement as Opening).subType})
              </span>
            </div>

            <div>
              <label className="block text-slate-400 font-semibold mb-1">Width (px)</label>
              <div className="flex gap-1.5 items-center">
                <input
                  type="number"
                  min="15"
                  max="120"
                  step="2"
                  value={(selectedElement as Opening).width}
                  onChange={(e) => handleValueChange('width', parseInt(e.target.value) || 30)}
                  className="w-20 p-1.5 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded font-mono text-center focus:outline-emerald-500"
                />
                <span className="text-slate-400">px</span>
                <span className="text-[10px] text-slate-400">
                  (≈ {formatDimension((selectedElement as Opening).width, unit)})
                </span>
              </div>
            </div>

            <div>
              <label className="block text-slate-400 font-semibold mb-1">Rotation Angle</label>
              <div className="flex gap-2 items-center">
                <input
                  type="range"
                  min="0"
                  max="360"
                  step="45"
                  value={(selectedElement as Opening).rotation}
                  onChange={(e) => handleValueChange('rotation', parseInt(e.target.value))}
                  className="flex-1 accent-emerald-500 h-1 cursor-pointer bg-slate-200 dark:bg-slate-800 rounded-lg"
                />
                <span className="font-mono text-slate-600 dark:text-slate-400 font-medium">
                  {(selectedElement as Opening).rotation}°
                </span>
              </div>
            </div>

            {(selectedElement as Opening).type === 'door' && (
              <div>
                <button
                  onClick={() => handleValueChange('flipSwing', !(selectedElement as Opening).flipSwing)}
                  className="w-full flex items-center justify-center gap-1.5 p-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg font-medium cursor-pointer"
                >
                  <ArrowLeftRight className="w-3.5 h-3.5" />
                  <span>Flip Door Swing</span>
                </button>
              </div>
            )}

            <div>
              <span className="block text-slate-400 font-semibold mb-1">Wall Attachment</span>
              { (selectedElement as Opening).wallId ? (
                <div className="flex items-center gap-1.5 text-[11px] text-emerald-600 dark:text-emerald-400 font-medium bg-emerald-500/10 p-2 rounded">
                  <Lock className="w-3.5 h-3.5" />
                  <span>Snapped to wall: {(selectedElement as Opening).wallId}</span>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 text-[11px] text-amber-600 dark:text-amber-400 font-medium bg-amber-500/10 p-2 rounded">
                  <Unlock className="w-3.5 h-3.5" />
                  <span>Floating (unattached)</span>
                </div>
              )}
            </div>
          </>
        )}

        {/* 4. FURNITURE PROPERTIES */}
        {selectedType === 'furniture' && (
          <>
            <div>
              <label className="block text-slate-400 font-semibold mb-1">Custom Label</label>
              <input
                type="text"
                value={(selectedElement as Furniture).label}
                onChange={(e) => handleValueChange('label', e.target.value)}
                className="w-full p-2 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded focus:outline-emerald-500 font-medium"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-slate-400 font-semibold mb-1">Width (px)</label>
                <input
                  type="number"
                  min="10"
                  max="300"
                  value={Math.round((selectedElement as Furniture).width)}
                  onChange={(e) => handleValueChange('width', parseInt(e.target.value) || 20)}
                  className="w-full p-1.5 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded font-mono text-center focus:outline-emerald-500"
                />
              </div>
              <div>
                <label className="block text-slate-400 font-semibold mb-1">Height (px)</label>
                <input
                  type="number"
                  min="10"
                  max="300"
                  value={Math.round((selectedElement as Furniture).height)}
                  onChange={(e) => handleValueChange('height', parseInt(e.target.value) || 20)}
                  className="w-full p-1.5 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded font-mono text-center focus:outline-emerald-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-slate-400 font-semibold mb-1">Rotation Angle</label>
              <div className="flex gap-2 items-center">
                <input
                  type="range"
                  min="0"
                  max="315"
                  step="45"
                  value={(selectedElement as Furniture).rotation}
                  onChange={(e) => handleValueChange('rotation', parseInt(e.target.value))}
                  className="flex-1 accent-emerald-500 h-1 cursor-pointer bg-slate-200 dark:bg-slate-800 rounded-lg"
                />
                <button
                  onClick={() => handleValueChange('rotation', (((selectedElement as Furniture).rotation + 90) % 360))}
                  className="p-1 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded cursor-pointer"
                  title="Rotate 90 degrees"
                >
                  <RotateCw className="w-3.5 h-3.5" />
                </button>
                <span className="font-mono text-slate-600 dark:text-slate-400 font-medium">
                  {(selectedElement as Furniture).rotation}°
                </span>
              </div>
            </div>

            <div>
              <span className="block text-slate-400 font-semibold mb-1">Dimensions</span>
              <span className="text-[10px] text-slate-400">
                ≈ {formatDimension((selectedElement as Furniture).width, unit)} × {formatDimension((selectedElement as Furniture).height, unit)}
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
