/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef } from 'react';
import {
  Undo2,
  Redo2,
  Trash2,
  Grid,
  Download,
  Printer,
  Repeat,
  CalendarRange,
  Upload,
  FileCode,
  Eye as HighContrastIcon,
  ZoomIn,
  ZoomOut,
  Maximize2,
  FolderOpen,
  Box,
  Boxes,
  Calculator,
  Ruler,
  Sparkles,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
} from 'lucide-react';
import { DimensionUnit } from '../types';
import { MIN_ZOOM, MAX_ZOOM, ZOOM_STEP } from '../constants';

interface ToolbarProps {
  unit: DimensionUnit;
  setUnit: (u: DimensionUnit) => void;
  snapToGrid: boolean;
  setSnapToGrid: (b: boolean) => void;
  snapToElements: boolean;
  setSnapToElements: (b: boolean) => void;
  showWallLabels?: boolean;
  setShowWallLabels?: (b: boolean) => void;
  highContrast: boolean;
  setHighContrast: (b: boolean) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onClear: () => void;
  onLoadSample: (planKey: string) => void;
  onExportJson: () => void;
  onExportSvg: () => void;
  onPrint: () => void;
  onRepeatPlacement: () => void;
  canRepeat: boolean;
  onOpenSchedule: () => void;
  onImportJson?: (file: File) => void;
  onOpenAR: () => void;
  onOpen3D: () => void;
  onOpenEstimator: () => void;
  onOpenAutoLabeler?: () => void;
  isLeftSidebarOpen?: boolean;
  onToggleLeftSidebar?: () => void;
  isRightSidebarOpen?: boolean;
  onToggleRightSidebar?: () => void;
  zoom: number;
  setZoom: React.Dispatch<React.SetStateAction<number>>;
}

type ButtonState = 'idle' | 'active' | 'disabled';

/**
 * Return ONE complete class string per button.
 *
 * The previous implementation concatenated `btnStyle()` and `activeBtnStyle()`,
 * both of which set `background-color`. Tailwind resolves same-specificity
 * collisions by position in the generated stylesheet, not by order in the class
 * attribute -- and `.bg-white` is emitted after `.bg-emerald-600`, so every
 * "active" toggle rendered with the idle background. Never compose two strings
 * that style the same property; pick one.
 */
function buttonClass(state: ButtonState, highContrast: boolean): string {
  const shape = highContrast
    ? 'p-1.5 rounded text-xs font-bold border-2 border-black flex items-center gap-1 cursor-pointer transition-colors'
    : 'p-2 rounded-lg text-xs font-medium border flex items-center gap-1.5 transition-colors';

  if (highContrast) {
    if (state === 'disabled') return `${shape} bg-gray-100 text-gray-400 border-gray-300 cursor-not-allowed`;
    if (state === 'active') return `${shape} bg-black text-white hover:bg-slate-800`;
    return `${shape} bg-white text-black hover:bg-black hover:text-white`;
  }

  if (state === 'disabled') {
    return `${shape} bg-slate-50 dark:bg-slate-800/50 border-slate-100 dark:border-slate-800 text-slate-400 dark:text-slate-600 cursor-not-allowed`;
  }
  if (state === 'active') {
    return `${shape} bg-emerald-600 border-emerald-600 text-white dark:bg-emerald-700 dark:border-emerald-700 hover:bg-emerald-700 dark:hover:bg-emerald-800 cursor-pointer`;
  }
  return `${shape} bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer`;
}

/** Idle button with a coloured hover accent (export / open-panel actions). */
function accentButtonClass(highContrast: boolean, accent: 'emerald' | 'blue' | 'red'): string {
  const base = buttonClass('idle', highContrast);
  const hover =
    accent === 'emerald'
      ? 'hover:border-emerald-500 hover:text-emerald-600 dark:hover:text-emerald-400'
      : accent === 'blue'
        ? 'hover:border-blue-500 hover:text-blue-600 dark:hover:text-blue-400'
        : 'hover:border-red-500 hover:text-red-600 dark:hover:text-red-400';
  return highContrast ? base : `${base} ${hover}`;
}

export default function Toolbar({
  unit,
  setUnit,
  snapToGrid,
  setSnapToGrid,
  snapToElements,
  setSnapToElements,
  showWallLabels = true,
  setShowWallLabels,
  highContrast,
  setHighContrast,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onClear,
  onLoadSample,
  onExportJson,
  onExportSvg,
  onPrint,
  onRepeatPlacement,
  canRepeat,
  onOpenSchedule,
  onImportJson,
  onOpenAR,
  onOpen3D,
  onOpenEstimator,
  onOpenAutoLabeler,
  isLeftSidebarOpen = true,
  onToggleLeftSidebar,
  isRightSidebarOpen = true,
  onToggleRightSidebar,
  zoom,
  setZoom,
}: ToolbarProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const toolbarBg = highContrast
    ? 'bg-white border-b-2 border-black text-black'
    : 'bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200';

  const divider = <div className="h-5 w-px bg-slate-200 dark:bg-slate-800 mx-0.5" />;

  return (
    <div
      id="toolbar-container"
      className={`p-3 flex flex-wrap gap-3 items-center justify-between ${toolbarBg}`}
    >
      {/* 1. Sidebars & History & Modification */}
      <div className="flex items-center gap-1.5">
        {onToggleLeftSidebar && (
          <button
            id="toggle-left-sidebar-btn"
            onClick={onToggleLeftSidebar}
            className={buttonClass(isLeftSidebarOpen ? 'active' : 'idle', highContrast)}
            title={
              isLeftSidebarOpen
                ? 'Hide Left Sidebar (Catalog & Tools)'
                : 'Show Left Sidebar (Catalog & Tools)'
            }
            aria-pressed={isLeftSidebarOpen}
          >
            {isLeftSidebarOpen ? (
              <PanelLeftClose className="w-4 h-4" />
            ) : (
              <PanelLeftOpen className="w-4 h-4" />
            )}
            <span className="hidden sm:inline">Palette</span>
          </button>
        )}

        {divider}

        <button
          id="undo-btn"
          onClick={onUndo}
          disabled={!canUndo}
          className={buttonClass(canUndo ? 'idle' : 'disabled', highContrast)}
          title="Undo last change"
        >
          <Undo2 className="w-4 h-4" />
          <span className="hidden sm:inline">Undo</span>
        </button>
        <button
          id="redo-btn"
          onClick={onRedo}
          disabled={!canRedo}
          className={buttonClass(canRedo ? 'idle' : 'disabled', highContrast)}
          title="Redo next change"
        >
          <Redo2 className="w-4 h-4" />
          <span className="hidden sm:inline">Redo</span>
        </button>

        {divider}

        <button
          id="clear-canvas-btn"
          onClick={onClear}
          className={accentButtonClass(highContrast, 'red')}
          title="Wipe canvas clean"
        >
          <Trash2 className="w-4 h-4" />
          <span className="hidden sm:inline">Clear Plan</span>
        </button>
      </div>

      {/* 2. Snaps & Grid Configuration */}
      <div className="flex items-center gap-1.5">
        <button
          id="toggle-grid-snap-btn"
          onClick={() => setSnapToGrid(!snapToGrid)}
          className={buttonClass(snapToGrid ? 'active' : 'idle', highContrast)}
          title="Snap elements to drawing grid"
          aria-pressed={snapToGrid}
        >
          <Grid className="w-4 h-4" />
          <span className="hidden sm:inline">Grid Snap</span>
        </button>

        <button
          id="toggle-wall-snap-btn"
          onClick={() => setSnapToElements(!snapToElements)}
          className={buttonClass(snapToElements ? 'active' : 'idle', highContrast)}
          title="Snap joints and windows to walls"
          aria-pressed={snapToElements}
        >
          <Maximize2 className="w-4 h-4" />
          <span className="hidden sm:inline">Element Snap</span>
        </button>

        <button
          id="toggle-unit-btn"
          onClick={() => setUnit(unit === 'm' ? 'ft' : 'm')}
          className={buttonClass('idle', highContrast)}
          title="Toggle Metric (meters) vs Imperial (feet/inches)"
        >
          <span className="font-mono font-bold">Unit: {unit === 'm' ? 'Metric' : 'Imperial'}</span>
        </button>

        {setShowWallLabels && (
          <button
            id="toggle-wall-labels-btn"
            onClick={() => setShowWallLabels(!showWallLabels)}
            className={buttonClass(showWallLabels ? 'active' : 'idle', highContrast)}
            title="Toggle real-time Length and Width labels on all wall segments"
            aria-pressed={showWallLabels}
          >
            <Ruler className="w-4 h-4" />
            <span className="hidden sm:inline">Wall L×W</span>
          </button>
        )}
      </div>

      {/* 3. Zoom Controllers */}
      <div className="flex items-center gap-1.5">
        <button
          id="zoom-out-btn"
          onClick={() => setZoom((z) => Math.max(MIN_ZOOM, +(z - ZOOM_STEP).toFixed(2)))}
          className={buttonClass('idle', highContrast)}
          title="Zoom Out"
        >
          <ZoomOut className="w-4 h-4" />
        </button>
        <span className="text-xs font-mono font-bold min-w-[44px] text-center">
          {Math.round(zoom * 100)}%
        </span>
        <button
          id="zoom-in-btn"
          onClick={() => setZoom((z) => Math.min(MAX_ZOOM, +(z + ZOOM_STEP).toFixed(2)))}
          className={buttonClass('idle', highContrast)}
          title="Zoom In"
        >
          <ZoomIn className="w-4 h-4" />
        </button>
        <button
          id="zoom-reset-btn"
          onClick={() => setZoom(1.0)}
          className={buttonClass('idle', highContrast)}
          title="Reset Zoom to 100%"
        >
          <span>1:1</span>
        </button>
      </div>

      {/* 4. Starter Blueprint Loaders */}
      <div className="flex items-center gap-1.5">
        <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 rounded-lg p-1">
          <FolderOpen className="w-3.5 h-3.5 text-slate-400 ml-1.5" />
          <select
            id="load-sample-select"
            onChange={(e) => {
              if (e.target.value) {
                onLoadSample(e.target.value);
                e.target.value = ''; // Reset select
              }
            }}
            className="text-xs font-semibold bg-transparent border-none focus:ring-0 text-slate-700 dark:text-slate-300 pr-4 py-1 cursor-pointer"
            defaultValue=""
            aria-label="Load a starter plan"
          >
            <option value="" disabled>
              Load Starter Plan...
            </option>
            <option value="oneBedroom">Modern 1-Bedroom Apartment</option>
            <option value="tinyStudio">Cozy Tiny Studio (Off-Grid)</option>
          </select>
        </div>
      </div>

      {/* 5. Exporters & High Contrast */}
      <div className="flex items-center gap-1.5">
        <button
          id="toggle-high-contrast-btn"
          onClick={() => setHighContrast(!highContrast)}
          className={buttonClass(highContrast ? 'active' : 'idle', highContrast)}
          title="Toggle High Contrast Accessible Drafting mode"
          aria-pressed={highContrast}
        >
          <HighContrastIcon className="w-4 h-4" />
          <span className="hidden lg:inline">High Contrast</span>
        </button>

        {onOpenAutoLabeler && (
          <button
            id="auto-label-rooms-btn"
            onClick={onOpenAutoLabeler}
            className={accentButtonClass(highContrast, 'emerald')}
            title="Auto-label room names based on dimensions & placed furniture"
          >
            <Sparkles className="w-4 h-4 text-emerald-500" />
            <span className="hidden sm:inline">Auto-Label</span>
          </button>
        )}

        <button
          id="cost-estimator-btn"
          onClick={onOpenEstimator}
          className={accentButtonClass(highContrast, 'emerald')}
          title="Open Construction Cost Estimator"
        >
          <Calculator className="w-4 h-4 text-emerald-500" />
          <span className="hidden sm:inline font-bold">Estimate</span>
        </button>

        <button
          id="view-3d-btn"
          onClick={onOpen3D}
          className={accentButtonClass(highContrast, 'blue')}
          title="Orbit a 3D model of the plan"
        >
          <Boxes className="w-4 h-4 text-blue-500" />
          <span className="hidden sm:inline font-bold">3D View</span>
        </button>

        <button
          id="view-ar-btn"
          onClick={onOpenAR}
          className={accentButtonClass(highContrast, 'blue')}
          title="View plan in Augmented Reality"
        >
          <Box className="w-4 h-4 text-blue-500" />
          <span className="hidden sm:inline font-bold">View in AR</span>
        </button>

        {onImportJson && (
          <>
            <input
              ref={fileInputRef}
              id="import-json-input"
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                // Reset first: picking the same file twice would otherwise not
                // fire a second change event.
                e.target.value = '';
                if (file) onImportJson(file);
              }}
            />
            <button
              id="import-json-btn"
              onClick={() => fileInputRef.current?.click()}
              className={accentButtonClass(highContrast, 'emerald')}
              title="Import a previously exported LandCraft JSON plan"
            >
              <Upload className="w-4 h-4 text-emerald-500" />
              <span className="hidden sm:inline">Import JSON</span>
            </button>
          </>
        )}

        <button
          id="repeat-placement-btn"
          onClick={onRepeatPlacement}
          disabled={!canRepeat}
          className={buttonClass('idle', highContrast)}
          title="Place the last palette item again (P)"
        >
          <Repeat className="w-4 h-4" />
          <span className="hidden sm:inline">Repeat</span>
        </button>

        <button
          id="room-schedule-btn"
          onClick={onOpenSchedule}
          className={accentButtonClass(highContrast, 'emerald')}
          title="Room area schedule with CSV export"
        >
          <CalendarRange className="w-4 h-4 text-emerald-500" />
          <span className="hidden sm:inline">Schedule</span>
        </button>

        <button
          id="export-svg-btn"
          onClick={onExportSvg}
          className={accentButtonClass(highContrast, 'emerald')}
          title="Export vector floor plan"
        >
          <Download className="w-4 h-4 text-emerald-500" />
          <span className="hidden sm:inline">Export SVG</span>
        </button>

        <button
          id="print-btn"
          onClick={onPrint}
          className={accentButtonClass(highContrast, 'emerald')}
          title="Print or save the current view as a PDF"
        >
          <Printer className="w-4 h-4 text-emerald-500" />
          <span className="hidden sm:inline">Print / PDF</span>
        </button>

        <button
          id="export-json-btn"
          onClick={onExportJson}
          className={accentButtonClass(highContrast, 'emerald')}
          title="Export JSON metadata for 3D web rendering conversion engines"
        >
          <FileCode className="w-4 h-4 text-emerald-500" />
          <span className="hidden sm:inline">Export JSON 3D</span>
        </button>

        {divider}

        {onToggleRightSidebar && (
          <button
            id="toggle-right-sidebar-btn"
            onClick={onToggleRightSidebar}
            className={buttonClass(isRightSidebarOpen ? 'active' : 'idle', highContrast)}
            title={
              isRightSidebarOpen
                ? 'Hide Right Sidebar (Properties & Layers)'
                : 'Show Right Sidebar (Properties & Layers)'
            }
            aria-pressed={isRightSidebarOpen}
          >
            <span className="hidden sm:inline">Inspector</span>
            {isRightSidebarOpen ? (
              <PanelRightClose className="w-4 h-4" />
            ) : (
              <PanelRightOpen className="w-4 h-4" />
            )}
          </button>
        )}
      </div>
    </div>
  );
}
