/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { 
  Undo2, 
  Redo2, 
  Trash2, 
  Grid, 
  Eye, 
  EyeOff, 
  Download, 
  FileCode, 
  Eye as HighContrastIcon, 
  ZoomIn, 
  ZoomOut, 
  Maximize2,
  FolderOpen,
  Settings,
  FlameKindling,
  Box,
  Calculator,
  Ruler,
  Sparkles,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen
} from 'lucide-react';
import { DimensionUnit } from '../types';

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
  onOpenAR: () => void;
  onOpenEstimator: () => void;
  onOpenAutoLabeler?: () => void;
  isLeftSidebarOpen?: boolean;
  onToggleLeftSidebar?: () => void;
  isRightSidebarOpen?: boolean;
  onToggleRightSidebar?: () => void;
  zoom: number;
  setZoom: (z: number) => void;
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
  onOpenAR,
  onOpenEstimator,
  onOpenAutoLabeler,
  isLeftSidebarOpen = true,
  onToggleLeftSidebar,
  isRightSidebarOpen = true,
  onToggleRightSidebar,
  zoom,
  setZoom
}: ToolbarProps) {

  const toolbarBg = highContrast
    ? 'bg-white border-b-2 border-black text-black'
    : 'bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200';

  const btnStyle = (disabled = false) => {
    if (highContrast) {
      return `p-1.5 rounded text-xs font-bold border border-black flex items-center gap-1 cursor-pointer transition-colors ${
        disabled 
          ? 'bg-gray-100 text-gray-400 border-gray-300' 
          : 'bg-white text-black hover:bg-black hover:text-white'
      }`;
    }
    return `p-2 rounded-lg text-xs font-medium border flex items-center gap-1.5 transition-colors cursor-pointer ${
      disabled 
        ? 'bg-slate-50 dark:bg-slate-800/50 border-slate-100 dark:border-slate-800 text-slate-400 dark:text-slate-600 cursor-not-allowed' 
        : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
    }`;
  };

  const activeBtnStyle = (isActive: boolean) => {
    if (highContrast) {
      return isActive 
        ? 'bg-black text-white border-2 border-black font-bold' 
        : 'bg-white text-black border border-black font-bold';
    }
    return isActive
      ? 'bg-emerald-600 text-white border-emerald-600 dark:bg-emerald-700 dark:border-emerald-700 hover:bg-emerald-700 dark:hover:bg-emerald-800'
      : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700';
  };

  return (
    <div id="toolbar-container" className={`p-3 flex flex-wrap gap-3 items-center justify-between ${toolbarBg}`}>
      {/* 1. Sidebars & History & Modification */}
      <div className="flex items-center gap-1.5">
        {/* Toggle Left Sidebar (Palette) */}
        {onToggleLeftSidebar && (
          <button
            id="toggle-left-sidebar-btn"
            onClick={onToggleLeftSidebar}
            className={`${btnStyle()} ${activeBtnStyle(isLeftSidebarOpen)}`}
            title={isLeftSidebarOpen ? "Hide Left Sidebar (Catalog & Tools)" : "Show Left Sidebar (Catalog & Tools)"}
          >
            {isLeftSidebarOpen ? <PanelLeftClose className="w-4 h-4" /> : <PanelLeftOpen className="w-4 h-4" />}
            <span className="hidden sm:inline">Palette</span>
          </button>
        )}

        <div className="h-5 w-px bg-slate-200 dark:bg-slate-800 mx-0.5" />

        <button
          id="undo-btn"
          onClick={onUndo}
          disabled={!canUndo}
          className={btnStyle(!canUndo)}
          title="Undo last change"
        >
          <Undo2 className="w-4 h-4" />
          <span className="hidden sm:inline">Undo</span>
        </button>
        <button
          id="redo-btn"
          onClick={onRedo}
          disabled={!canRedo}
          className={btnStyle(!canRedo)}
          title="Redo next change"
        >
          <Redo2 className="w-4 h-4" />
          <span className="hidden sm:inline">Redo</span>
        </button>
        <div className="h-5 w-px bg-slate-200 dark:bg-slate-800 mx-1" />
        <button
          id="clear-canvas-btn"
          onClick={onClear}
          className={`${btnStyle()} hover:text-red-600 dark:hover:text-red-400`}
          title="Wipe canvas clean"
        >
          <Trash2 className="w-4 h-4" />
          <span className="hidden sm:inline">Clear Plan</span>
        </button>
      </div>

      {/* 2. Snaps & Grid Configuration */}
      <div className="flex items-center gap-1.5">
        {/* Toggle Grid */}
        <button
          id="toggle-grid-snap-btn"
          onClick={() => setSnapToGrid(!snapToGrid)}
          className={`${btnStyle()} ${activeBtnStyle(snapToGrid)}`}
          title="Snap elements to drawing grid"
        >
          <Grid className="w-4 h-4" />
          <span className="hidden sm:inline">Grid Snap</span>
        </button>

        {/* Toggle Wall snap */}
        <button
          id="toggle-wall-snap-btn"
          onClick={() => setSnapToElements(!snapToElements)}
          className={`${btnStyle()} ${activeBtnStyle(snapToElements)}`}
          title="Snap joints and windows to walls"
        >
          <Maximize2 className="w-4 h-4" />
          <span className="hidden sm:inline">Element Snap</span>
        </button>

        {/* Toggle Unit Metric vs Imperial */}
        <button
          id="toggle-unit-btn"
          onClick={() => setUnit(unit === 'm' ? 'ft' : 'm')}
          className={`${btnStyle()} font-mono font-bold`}
          title="Toggle Metric (meters) vs Imperial (feet/inches)"
        >
          <span>Unit: {unit === 'm' ? 'Metric' : 'Imperial'}</span>
        </button>

        {/* Toggle Real-time Wall Length & Width Labels */}
        {setShowWallLabels && (
          <button
            id="toggle-wall-labels-btn"
            onClick={() => setShowWallLabels(!showWallLabels)}
            className={`${btnStyle()} ${activeBtnStyle(showWallLabels)}`}
            title="Toggle real-time Length and Width labels on all wall segments"
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
          onClick={() => setZoom(Math.max(0.5, zoom - 0.1))}
          className={btnStyle()}
          title="Zoom Out"
        >
          <ZoomOut className="w-4 h-4" />
        </button>
        <span className="text-xs font-mono font-bold min-w-[44px] text-center">
          {Math.round(zoom * 100)}%
        </span>
        <button
          id="zoom-in-btn"
          onClick={() => setZoom(Math.min(2.0, zoom + 0.1))}
          className={btnStyle()}
          title="Zoom In"
        >
          <ZoomIn className="w-4 h-4" />
        </button>
        <button
          id="zoom-reset-btn"
          onClick={() => setZoom(1.0)}
          className={btnStyle()}
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
          >
            <option value="" disabled>Load Starter Plan...</option>
            <option value="oneBedroom">Modern 1-Bedroom Apartment</option>
            <option value="tinyStudio">Cozy Tiny Studio (Off-Grid)</option>
          </select>
        </div>
      </div>

      {/* 5. Exporters & High Contrast */}
      <div className="flex items-center gap-1.5">
        {/* High Contrast Mode Toggle */}
        <button
          id="toggle-high-contrast-btn"
          onClick={() => setHighContrast(!highContrast)}
          className={`${btnStyle()} ${activeBtnStyle(highContrast)}`}
          title="Toggle High Contrast Accessible Drafting mode"
        >
          <HighContrastIcon className="w-4 h-4" />
          <span className="hidden lg:inline">High Contrast</span>
        </button>

        {/* Auto-Label Rooms */}
        {onOpenAutoLabeler && (
          <button
            id="auto-label-rooms-btn"
            onClick={onOpenAutoLabeler}
            className={`${btnStyle()} hover:border-emerald-500 hover:text-emerald-500 text-emerald-600 dark:text-emerald-400 font-bold`}
            title="Auto-label room names based on dimensions & placed furniture"
          >
            <Sparkles className="w-4 h-4 text-emerald-500" />
            <span className="hidden sm:inline">Auto-Label</span>
          </button>
        )}

        {/* Cost Estimator */}
        <button
          id="cost-estimator-btn"
          onClick={onOpenEstimator}
          className={`${btnStyle()} hover:border-emerald-500 hover:text-emerald-500`}
          title="Open Construction Cost Estimator"
        >
          <Calculator className="w-4 h-4 text-emerald-500" />
          <span className="hidden sm:inline font-bold">Estimate</span>
        </button>

        {/* View in AR */}
        <button
          id="view-ar-btn"
          onClick={onOpenAR}
          className={`${btnStyle()} hover:border-blue-500 hover:text-blue-500`}
          title="View plan in Augmented Reality"
        >
          <Box className="w-4 h-4 text-blue-500" />
          <span className="hidden sm:inline font-bold">View in AR</span>
        </button>

        {/* Export SVG */}
        <button
          id="export-svg-btn"
          onClick={onExportSvg}
          className={btnStyle()}
          title="Export vector floor plan"
        >
          <Download className="w-4 h-4 text-emerald-500" />
          <span className="hidden sm:inline">Export SVG</span>
        </button>

        {/* Export JSON for 3D Conversion */}
        <button
          id="export-json-btn"
          onClick={onExportJson}
          className={`${btnStyle()} hover:border-emerald-500 hover:text-emerald-500`}
          title="Export JSON metadata for 3D web rendering conversion engines"
        >
          <FileCode className="w-4 h-4 text-emerald-500" />
          <span className="hidden sm:inline">Export JSON 3D</span>
        </button>

        <div className="h-5 w-px bg-slate-200 dark:bg-slate-800 mx-0.5" />

        {/* Toggle Right Sidebar (Inspector) */}
        {onToggleRightSidebar && (
          <button
            id="toggle-right-sidebar-btn"
            onClick={onToggleRightSidebar}
            className={`${btnStyle()} ${activeBtnStyle(isRightSidebarOpen)}`}
            title={isRightSidebarOpen ? "Hide Right Sidebar (Properties & Layers)" : "Show Right Sidebar (Properties & Layers)"}
          >
            <span className="hidden sm:inline">Inspector</span>
            {isRightSidebarOpen ? <PanelRightClose className="w-4 h-4" /> : <PanelRightOpen className="w-4 h-4" />}
          </button>
        )}
      </div>
    </div>
  );
}
