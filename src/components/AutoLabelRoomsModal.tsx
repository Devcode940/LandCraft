/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { 
  Sparkles, 
  X, 
  Check, 
  CheckCircle2, 
  ArrowRight, 
  Tv, 
  Bed, 
  Bath, 
  Utensils, 
  Square, 
  Layers,
  Ruler,
  AlertCircle
} from 'lucide-react';
import { FloorPlanData, DimensionUnit } from '../types';
import { suggestAllRooms, RoomSuggestion } from '../utils/roomAutoLabeler';

interface AutoLabelRoomsModalProps {
  plan: FloorPlanData;
  unit: DimensionUnit;
  highContrast: boolean;
  onApplyLabels: (updatedRooms: { id: string; label: string }[]) => void;
  onClose: () => void;
}

export default function AutoLabelRoomsModal({
  plan,
  unit,
  highContrast,
  onApplyLabels,
  onClose
}: AutoLabelRoomsModalProps) {
  const suggestions: RoomSuggestion[] = suggestAllRooms(plan.rooms, plan.furniture, unit);

  // Custom selected choices per room
  const [selectedLabels, setSelectedLabels] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    suggestions.forEach(s => {
      initial[s.roomId] = s.suggestedName;
    });
    return initial;
  });

  // Track which rooms are checked for batch apply
  const [checkedRoomIds, setCheckedRoomIds] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    suggestions.forEach(s => {
      // Auto-check if current label does not already match suggestion
      initial[s.roomId] = !s.currentMatchesSuggestion || s.isGenericLabel;
    });
    return initial;
  });

  const handleSelectChoice = (roomId: string, name: string) => {
    setSelectedLabels(prev => ({ ...prev, [roomId]: name }));
    setCheckedRoomIds(prev => ({ ...prev, [roomId]: true }));
  };

  const toggleCheck = (roomId: string) => {
    setCheckedRoomIds(prev => ({ ...prev, [roomId]: !prev[roomId] }));
  };

  const handleApplySelected = () => {
    const updates = suggestions
      .filter(s => checkedRoomIds[s.roomId])
      .map(s => ({
        id: s.roomId,
        label: selectedLabels[s.roomId] || s.suggestedName
      }));
    if (updates.length > 0) {
      onApplyLabels(updates);
    }
    onClose();
  };

  const handleApplySingle = (roomId: string) => {
    const label = selectedLabels[roomId] || suggestions.find(s => s.roomId === roomId)?.suggestedName;
    if (label) {
      onApplyLabels([{ id: roomId, label }]);
    }
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'bedroom': return Bed;
      case 'bathroom': return Bath;
      case 'kitchen': return Utensils;
      case 'living': return Tv;
      default: return Square;
    }
  };

  const modalBg = highContrast
    ? 'bg-white text-black border-2 border-black'
    : 'bg-slate-900 text-slate-100 border border-slate-800 shadow-2xl';

  const selectedCount = Object.values(checkedRoomIds).filter(Boolean).length;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs">
      <div 
        className={`w-full max-w-2xl rounded-2xl overflow-hidden flex flex-col max-h-[85vh] ${modalBg}`}
        id="auto-label-rooms-modal"
      >
        {/* Modal Header */}
        <div className={`p-4 sm:p-5 flex items-center justify-between border-b ${
          highContrast ? 'border-black bg-gray-50' : 'border-slate-800 bg-slate-950/60'
        }`}>
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 rounded-xl">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold flex items-center gap-2">
                Auto-Label Room Names
                <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-bold">
                  AI Heuristic Engine
                </span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Analyzes room dimensions, aspect ratio, and placed furniture within each boundary to infer architectural names.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body - Room List */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-3.5">
          {suggestions.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <AlertCircle className="w-10 h-10 mx-auto text-slate-500 mb-2.5 opacity-60" />
              <p className="text-sm font-semibold">No rooms found in floor plan</p>
              <p className="text-xs text-slate-500 mt-1 max-w-xs mx-auto">
                Draw or add room boundaries to your canvas to use the smart auto-labeling feature.
              </p>
            </div>
          ) : (
            suggestions.map((s) => {
              const IconComp = getCategoryIcon(s.category);
              const isChecked = !!checkedRoomIds[s.roomId];
              const chosenName = selectedLabels[s.roomId] || s.suggestedName;
              const matchesCurrent = s.currentLabel.trim().toLowerCase() === chosenName.trim().toLowerCase();

              return (
                <div
                  key={s.roomId}
                  className={`p-3.5 sm:p-4 rounded-xl border transition-all ${
                    highContrast
                      ? isChecked ? 'border-2 border-black bg-gray-50' : 'border border-gray-300'
                      : isChecked
                        ? 'border-emerald-500/50 bg-slate-800/70 shadow-sm'
                        : 'border-slate-800 bg-slate-900/60 opacity-80'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    {/* Left: Checkbox + Icon + Current/Suggested */}
                    <div className="flex items-start sm:items-center gap-3">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleCheck(s.roomId)}
                        className="mt-1 sm:mt-0 w-4 h-4 rounded border-slate-700 text-emerald-500 focus:ring-emerald-500 cursor-pointer"
                        id={`check-${s.roomId}`}
                      />
                      <div className="p-2 rounded-lg bg-slate-800 text-slate-300 border border-slate-700 shrink-0">
                        <IconComp className="w-4 h-4 text-emerald-400" />
                      </div>
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs font-semibold text-slate-400 line-through decoration-slate-500">
                            {s.currentLabel || 'Untitled Room'}
                          </span>
                          <ArrowRight className="w-3.5 h-3.5 text-slate-500" />
                          <span className="text-sm font-bold text-emerald-400">
                            {chosenName}
                          </span>
                          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-bold">
                            {s.confidence}% match
                          </span>
                          {matchesCurrent && (
                            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 flex items-center gap-1 font-semibold">
                              <Check className="w-2.5 h-2.5" /> Current
                            </span>
                          )}
                        </div>

                        {/* Room Reasoning & Detected Furniture */}
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-400 mt-1">
                          <span className="font-mono text-slate-300">
                            📐 {s.dimensionsFormatted} ({s.areaFormatted})
                          </span>
                          <span>•</span>
                          <span>{s.reason}</span>
                        </div>
                      </div>
                    </div>

                    {/* Right: Apply individual button */}
                    <div className="flex items-center gap-2 self-end sm:self-center">
                      <button
                        onClick={() => handleApplySingle(s.roomId)}
                        disabled={matchesCurrent}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer border ${
                          matchesCurrent
                            ? 'bg-slate-800 text-slate-500 border-slate-700/50 cursor-not-allowed'
                            : 'bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-400/40 shadow-sm'
                        }`}
                      >
                        {matchesCurrent ? 'Applied' : 'Apply'}
                      </button>
                    </div>
                  </div>

                  {/* Alternative suggestions chips */}
                  {s.alternativeNames.length > 0 && (
                    <div className="mt-3 pt-2.5 border-t border-slate-800/80 flex flex-wrap items-center gap-1.5">
                      <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mr-1">
                        Alternatives:
                      </span>
                      {s.alternativeNames.map((alt) => {
                        const isAltActive = chosenName === alt;
                        return (
                          <button
                            key={alt}
                            type="button"
                            onClick={() => handleSelectChoice(s.roomId, alt)}
                            className={`px-2 py-0.5 rounded-md text-[10px] font-medium transition-colors cursor-pointer border ${
                              isAltActive
                                ? 'bg-emerald-500 text-slate-950 font-bold border-emerald-400'
                                : 'bg-slate-800/80 hover:bg-slate-800 text-slate-300 border-slate-700/60'
                            }`}
                          >
                            {alt}
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {/* Detected furniture chips */}
                  {s.detectedFurniture.length > 0 && (
                    <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[10px] text-slate-400 font-mono">
                      <span className="text-slate-500">Inside Boundary:</span>
                      {s.detectedFurniture.map((f) => (
                        <span 
                          key={f.subType}
                          className="px-1.5 py-0.5 rounded bg-slate-800/90 border border-slate-700 text-slate-300"
                        >
                          {f.count}× {f.label}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Modal Footer */}
        <div className={`p-4 sm:p-5 flex flex-wrap items-center justify-between gap-3 border-t ${
          highContrast ? 'border-black bg-gray-50' : 'border-slate-800 bg-slate-950/80'
        }`}>
          <div className="flex items-center gap-3 text-xs text-slate-400">
            <span>
              Selected: <strong className="text-white font-mono">{selectedCount}</strong> of {suggestions.length} rooms
            </span>
            <button
              type="button"
              onClick={() => {
                const allChecked = selectedCount === suggestions.length;
                const next: Record<string, boolean> = {};
                suggestions.forEach(s => { next[s.roomId] = !allChecked; });
                setCheckedRoomIds(next);
              }}
              className="text-emerald-400 hover:underline cursor-pointer font-medium"
            >
              {selectedCount === suggestions.length ? 'Deselect All' : 'Select All'}
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              onClick={handleApplySelected}
              disabled={selectedCount === 0}
              className={`px-5 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer shadow-lg ${
                selectedCount === 0
                  ? 'bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed'
                  : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-950/40 border border-emerald-400/40 hover:scale-[1.02]'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Apply {selectedCount} Selected Room{selectedCount === 1 ? '' : 's'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
