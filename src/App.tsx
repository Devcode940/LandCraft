/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  Sparkles, 
  HelpCircle, 
  Info, 
  Home, 
  Layers, 
  Settings, 
  Ruler, 
  Flame,
  CheckCircle2,
  PanelLeftOpen,
  PanelRightOpen
} from 'lucide-react';
import { FloorPlanData, ToolType, DimensionUnit, LayerVisibility } from './types';
import { starterPlans } from './utils/sampleData';
import { calculateRoomArea } from './utils/geoUtils';

// Components
import Toolbar from './components/Toolbar';
import SidebarPalette from './components/SidebarPalette';
import FloorPlanCanvas from './components/FloorPlanCanvas';
import PropertyInspector from './components/PropertyInspector';
import AiAssistantPanel from './components/AiAssistantPanel';
import DisclaimerBanner from './components/DisclaimerBanner';
import ARViewer from './components/ARViewer';
import CostEstimatorPanel from './components/CostEstimatorPanel';
import ArchitectChatPanel from './components/ArchitectChatPanel';
import AutoLabelRoomsModal from './components/AutoLabelRoomsModal';

export default function App() {
  // --- STATE ---
  const [plan, setPlan] = useState<FloorPlanData>({
    walls: [],
    rooms: [],
    openings: [],
    furniture: []
  });

  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
  const [selectedElementType, setSelectedElementType] = useState<'wall' | 'room' | 'opening' | 'furniture' | null>(null);
  const [activeTool, setActiveTool] = useState<ToolType>('select');
  const [selectedPaletteItem, setSelectedPaletteItem] = useState<any | null>(null);
  
  // History State
  const [history, setHistory] = useState<FloorPlanData[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  // Viewport Settings
  const [zoom, setZoom] = useState(1.0);
  const [panX, setPanX] = useState(100);
  const [panY, setPanY] = useState(50);
  const [unit, setUnit] = useState<DimensionUnit>('m');
  const [snapToGrid, setSnapToGrid] = useState(true);
  const [snapToElements, setSnapToElements] = useState(true);
  const [highContrast, setHighContrast] = useState(false);

  // Layers Visibility
  const [showWallLabels, setShowWallLabels] = useState(true);
  const [layerVisibility, setLayerVisibility] = useState<LayerVisibility>({
    walls: true,
    rooms: true,
    openings: true,
    furniture: true,
    dimensions: true,
    wallLabels: true,
    grid: true
  });

  const handleToggleWallLabels = (val: boolean | ((prev: boolean) => boolean)) => {
    setShowWallLabels(prev => {
      const next = typeof val === 'function' ? val(prev) : val;
      setLayerVisibility(curr => ({ ...curr, wallLabels: next }));
      return next;
    });
  };

  const [isARViewerOpen, setIsARViewerOpen] = useState(false);
  const [isEstimatorOpen, setIsEstimatorOpen] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isAutoLabelModalOpen, setIsAutoLabelModalOpen] = useState(false);

  // Sidebars visibility states
  const [isLeftSidebarOpen, setIsLeftSidebarOpen] = useState(true);
  const [isRightSidebarOpen, setIsRightSidebarOpen] = useState(true);

  // Apply auto-labeled room names to plan
  const handleApplyAutoLabels = (updatedRooms: { id: string; label: string }[]) => {
    setPlan(prev => {
      const nextRooms = prev.rooms.map(rm => {
        const update = updatedRooms.find(u => u.id === rm.id);
        return update ? { ...rm, label: update.label } : rm;
      });
      const nextPlan = { ...prev, rooms: nextRooms };
      setTimeout(() => handleStateChange(nextPlan), 0);
      return nextPlan;
    });
  };

  // Load standard template on startup
  useEffect(() => {
    const starter = starterPlans.oneBedroom.data;
    setPlan(starter);
    setHistory([starter]);
    setHistoryIndex(0);
  }, []);

  // Save state change in undo/redo history
  const handleStateChange = (newPlan?: FloorPlanData) => {
    const targetPlan = newPlan || plan;
    const nextHistory = history.slice(0, historyIndex + 1);
    setHistory([...nextHistory, targetPlan]);
    setHistoryIndex(nextHistory.length);
  };

  const handleUpdatePlanDirectly = (updater: FloorPlanData | ((prev: FloorPlanData) => FloorPlanData)) => {
    setPlan(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      // Schedule history save
      setTimeout(() => handleStateChange(next), 0);
      return next;
    });
  };

  // --- UNDO / REDO ---
  const handleUndo = () => {
    if (historyIndex > 0) {
      const prevIndex = historyIndex - 1;
      setHistoryIndex(prevIndex);
      setPlan(history[prevIndex]);
    }
  };

  const handleRedo = () => {
    if (historyIndex < history.length - 1) {
      const nextIndex = historyIndex + 1;
      setHistoryIndex(nextIndex);
      setPlan(history[nextIndex]);
    }
  };

  const handleClear = () => {
    const cleared: FloorPlanData = { walls: [], rooms: [], openings: [], furniture: [] };
    setPlan(cleared);
    setSelectedElementId(null);
    setSelectedElementType(null);
    handleStateChange(cleared);
  };

  const handleLoadSample = (key: string) => {
    const sample = starterPlans[key];
    if (sample) {
      setPlan(sample.data);
      setSelectedElementId(null);
      setSelectedElementType(null);
      handleStateChange(sample.data);
    }
  };

  // --- DYNAMIC PLAN STATISTICS ---
  const getPlanStats = () => {
    let totalAreaPixels = 0;
    plan.rooms.forEach(r => {
      totalAreaPixels += r.width * r.height;
    });
    // Convert to sq meters
    const totalAreaM2 = totalAreaPixels / 1600; // 40px * 40px = 1600px2 per m2
    const formattedArea = unit === 'm' 
      ? `${totalAreaM2.toFixed(1)} m²` 
      : `${(totalAreaM2 * 10.7639).toFixed(0)} sq ft`;

    return {
      area: formattedArea,
      wallsCount: plan.walls.length,
      openingsCount: plan.openings.length,
      furnitureCount: plan.furniture.length
    };
  };

  const stats = getPlanStats();

  // --- MANUAL EXPORTS ---
  const handleExportJson = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(plan, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `landcraft-plan-${Date.now()}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const handleExportSvg = () => {
    const svgElement = document.getElementById('interactive-blueprint-svg');
    if (!svgElement) return;

    // Serialize SVG markup to string
    const serializer = new XMLSerializer();
    let svgString = serializer.serializeToString(svgElement);
    
    // Add standard namespace if missing
    if (!svgString.match(/^<svg[^>]+xmlns="http\:\/\/www\.w3\.org\/2000\/svg"/)) {
      svgString = svgString.replace(/^<svg/, '<svg xmlns="http://www.w3.org/2000/svg"');
    }

    const dataStr = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svgString);
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `landcraft-blueprint-${Date.now()}.svg`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  // Update properties of a selected element
  const handleUpdateElement = (type: 'wall' | 'room' | 'opening' | 'furniture', id: string, updatedData: any) => {
    setPlan(prev => {
      const next = { ...prev };
      if (type === 'wall') {
        next.walls = next.walls.map(w => w.id === id ? { ...w, ...updatedData } : w);
      } else if (type === 'room') {
        next.rooms = next.rooms.map(r => r.id === id ? { ...r, ...updatedData } : r);
      } else if (type === 'opening') {
        next.openings = next.openings.map(o => o.id === id ? { ...o, ...updatedData } : o);
      } else if (type === 'furniture') {
        next.furniture = next.furniture.map(f => f.id === id ? { ...f, ...updatedData } : f);
      }
      return next;
    });
    // Schedule history push after state finishes batching
    setTimeout(() => handleStateChange(), 50);
  };

  // Delete element from active collection
  const handleDeleteElement = (type: 'wall' | 'room' | 'opening' | 'furniture', id: string) => {
    setPlan(prev => {
      const next = { ...prev };
      if (type === 'wall') {
        next.walls = next.walls.filter(w => w.id !== id);
      } else if (type === 'room') {
        next.rooms = next.rooms.filter(r => r.id !== id);
      } else if (type === 'opening') {
        next.openings = next.openings.filter(o => o.id !== id);
      } else if (type === 'furniture') {
        next.furniture = next.furniture.filter(f => f.id !== id);
      }
      return next;
    });
    setSelectedElementId(null);
    setSelectedElementType(null);
    setTimeout(() => handleStateChange(), 50);
  };

  // Callback to instantly place custom presets onto the center of the viewport
  const handleInstantAdd = (type: 'room' | 'opening' | 'furniture', subType: string, label: string, width?: number, height?: number) => {
    // Drop at center of the active viewport (approximated center or offset pan)
    const centerX = Math.round((400 - panX) / zoom);
    const centerY = Math.round((250 - panY) / zoom);
    const id = `${type}-${Date.now()}`;

    setPlan(prev => {
      const next = { ...prev };
      if (type === 'room') {
        next.rooms.push({
          id,
          x: centerX - (width || 120) / 2,
          y: centerY - (height || 80) / 2,
          width: width || 120,
          height: height || 80,
          label,
          color: 'rgba(59, 130, 246, 0.08)'
        });
      } else if (type === 'opening') {
        next.openings.push({
          id,
          type: subType === 'standard' || subType === 'large' || subType === 'bay' ? 'window' : 'door',
          subType: subType as any,
          x: centerX,
          y: centerY,
          width: width || 32,
          rotation: 0,
          flipSwing: false
        });
      } else if (type === 'furniture') {
        next.furniture.push({
          id,
          subType,
          label,
          x: centerX,
          y: centerY,
          width: width || 40,
          height: height || 40,
          rotation: 0,
          category: 'living'
        });
      }
      return next;
    });

    setSelectedElementId(id);
    setSelectedElementType(type);
    setTimeout(() => handleStateChange(), 50);
  };

  const getSelectedElementData = () => {
    if (!selectedElementId || !selectedElementType) return null;
    if (selectedElementType === 'wall') {
      return plan.walls.find(w => w.id === selectedElementId) || null;
    }
    if (selectedElementType === 'room') {
      return plan.rooms.find(r => r.id === selectedElementId) || null;
    }
    if (selectedElementType === 'opening') {
      return plan.openings.find(o => o.id === selectedElementId) || null;
    }
    if (selectedElementType === 'furniture') {
      return plan.furniture.find(f => f.id === selectedElementId) || null;
    }
    return null;
  };

  // Accessibility styling overrides
  const mainShellStyle = highContrast
    ? 'bg-white text-black font-sans'
    : 'bg-slate-100 dark:bg-slate-950 text-slate-800 dark:text-slate-200 font-sans';

  return (
    <div className={`min-h-screen flex flex-col ${mainShellStyle}`} id="landcraft-main-container">
      {/* 1. Header Banner */}
      <header 
        id="landcraft-header"
        className={`px-5 py-3.5 flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b ${
          highContrast 
            ? 'bg-white border-black text-black border-b-2' 
            : 'bg-slate-900 border-slate-800 text-white'
        }`}
      >
        <div className="flex items-center gap-3">
          <div className="p-2 bg-emerald-500 rounded-lg text-slate-950 shadow-md">
            <Sparkles className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-black tracking-tight uppercase">
                LandCraft AI
              </h1>
              <span className="text-[9px] uppercase tracking-wider bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded font-bold">
                Professional Blueprint Engine
              </span>
            </div>
            <p className="text-xs text-slate-400 font-medium">
              From land photo to dream home in minutes — AI that thinks like an architect.
            </p>
          </div>
        </div>

        {/* Dynamic plan status overview counters */}
        <div className="flex flex-wrap items-center gap-4 text-xs">
          <div className="bg-slate-800/60 dark:bg-slate-950/40 border border-slate-700/50 px-3 py-2 rounded-lg text-[11px] font-mono">
            <span className="text-slate-400 block uppercase text-[8px] tracking-wider font-semibold">Total Area</span>
            <span className="font-bold text-slate-100 text-xs">{stats.area}</span>
          </div>
          <div className="bg-slate-800/60 dark:bg-slate-950/40 border border-slate-700/50 px-3 py-2 rounded-lg text-[11px] font-mono">
            <span className="text-slate-400 block uppercase text-[8px] tracking-wider font-semibold">Structural Walls</span>
            <span className="font-bold text-slate-100 text-xs">{stats.wallsCount}</span>
          </div>
          <div className="bg-slate-800/60 dark:bg-slate-950/40 border border-slate-700/50 px-3 py-2 rounded-lg text-[11px] font-mono">
            <span className="text-slate-400 block uppercase text-[8px] tracking-wider font-semibold">Openings (Doors/Win)</span>
            <span className="font-bold text-slate-100 text-xs">{stats.openingsCount}</span>
          </div>
          <div className="bg-slate-800/60 dark:bg-slate-950/40 border border-slate-700/50 px-3 py-2 rounded-lg text-[11px] font-mono">
            <span className="text-slate-400 block uppercase text-[8px] tracking-wider font-semibold">Furniture</span>
            <span className="font-bold text-slate-100 text-xs">{stats.furnitureCount}</span>
          </div>
        </div>
      </header>

      {/* 2. Primary Layout Editor Body */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden relative">
        {/* Left sidebar - Component elements catalog */}
        {isLeftSidebarOpen && (
          <SidebarPalette
            activeTool={activeTool}
            setActiveTool={setActiveTool}
            selectedPaletteItem={selectedPaletteItem}
            setSelectedPaletteItem={setSelectedPaletteItem}
            highContrast={highContrast}
            onInstantAdd={handleInstantAdd}
            isOpen={isLeftSidebarOpen}
            onToggle={() => setIsLeftSidebarOpen(false)}
          />
        )}

        {/* Floating edge tab to reopen left sidebar when collapsed */}
        {!isLeftSidebarOpen && (
          <button
            id="open-left-sidebar-tab"
            onClick={() => setIsLeftSidebarOpen(true)}
            className={`absolute left-0 top-16 z-30 flex items-center gap-1.5 px-2.5 py-2 rounded-r-xl border shadow-xl backdrop-blur-md transition-all cursor-pointer hover:translate-x-1 ${
              highContrast 
                ? 'bg-white border-2 border-black text-black font-bold' 
                : 'bg-slate-900/95 hover:bg-slate-800 text-slate-200 border-slate-700/80 hover:border-emerald-500 shadow-emerald-950/20'
            }`}
            title="Show Left Sidebar (Catalog & Tools)"
          >
            <PanelLeftOpen className="w-4 h-4 text-emerald-400" />
            <span className="text-[11px] font-bold hidden sm:inline">Tools</span>
          </button>
        )}

        {/* Center work area (Toolbar + Canvas + Bottom review board) */}
        <div className="flex-1 flex flex-col min-w-0">
          <Toolbar
            unit={unit}
            setUnit={setUnit}
            snapToGrid={snapToGrid}
            setSnapToGrid={setSnapToGrid}
            snapToElements={snapToElements}
            setSnapToElements={setSnapToElements}
            showWallLabels={showWallLabels}
            setShowWallLabels={handleToggleWallLabels}
            highContrast={highContrast}
            setHighContrast={setHighContrast}
            canUndo={historyIndex > 0}
            canRedo={historyIndex < history.length - 1}
            onUndo={handleUndo}
            onRedo={handleRedo}
            onClear={handleClear}
            onLoadSample={handleLoadSample}
            onExportJson={handleExportJson}
            onExportSvg={handleExportSvg}
            onOpenAR={() => setIsARViewerOpen(true)}
            onOpenEstimator={() => setIsEstimatorOpen(true)}
            onOpenAutoLabeler={() => setIsAutoLabelModalOpen(true)}
            isLeftSidebarOpen={isLeftSidebarOpen}
            onToggleLeftSidebar={() => setIsLeftSidebarOpen(prev => !prev)}
            isRightSidebarOpen={isRightSidebarOpen}
            onToggleRightSidebar={() => setIsRightSidebarOpen(prev => !prev)}
            zoom={zoom}
            setZoom={setZoom}
          />

          {/* Interactive Blueprint drafting board */}
          <FloorPlanCanvas
            plan={plan}
            setPlan={handleUpdatePlanDirectly}
            selectedElementId={selectedElementId}
            selectedElementType={selectedElementType}
            setSelectedElementId={setSelectedElementId}
            setSelectedElementType={setSelectedElementType}
            activeTool={activeTool}
            setActiveTool={setActiveTool}
            selectedPaletteItem={selectedPaletteItem}
            setSelectedPaletteItem={setSelectedPaletteItem}
            zoom={zoom}
            setZoom={setZoom}
            panX={panX}
            setPanX={setPanX}
            panY={panY}
            setPanY={setPanY}
            unit={unit}
            snapToGrid={snapToGrid}
            snapToElements={snapToElements}
            gridSize={20} // Standard grid spacing
            highContrast={highContrast}
            layerVisibility={layerVisibility}
            showWallLabels={showWallLabels}
            setShowWallLabels={handleToggleWallLabels}
            onStateChange={handleStateChange}
          />

          {/* Dynamic AI continuous diagnostic review board */}
          <AiAssistantPanel
            plan={plan}
            unit={unit}
            highContrast={highContrast}
            onLoadPlan={handleUpdatePlanDirectly}
          />
        </div>

        {/* Right side drawer - Properties inspector and layout sheets */}
        {isRightSidebarOpen && (
          <PropertyInspector
            selectedElement={getSelectedElementData()}
            selectedType={selectedElementType}
            onUpdateElement={handleUpdateElement}
            onDeleteElement={handleDeleteElement}
            unit={unit}
            highContrast={highContrast}
            layerVisibility={layerVisibility}
            setLayerVisibility={setLayerVisibility}
            showWallLabels={showWallLabels}
            setShowWallLabels={handleToggleWallLabels}
            furnitureList={plan.furniture}
            onOpenAutoLabeler={() => setIsAutoLabelModalOpen(true)}
            isOpen={isRightSidebarOpen}
            onToggle={() => setIsRightSidebarOpen(false)}
          />
        )}

        {/* Floating edge tab to reopen right sidebar when collapsed */}
        {!isRightSidebarOpen && (
          <button
            id="open-right-sidebar-tab"
            onClick={() => setIsRightSidebarOpen(true)}
            className={`absolute right-0 top-16 z-30 flex items-center gap-1.5 px-2.5 py-2 rounded-l-xl border shadow-xl backdrop-blur-md transition-all cursor-pointer hover:-translate-x-1 ${
              highContrast 
                ? 'bg-white border-2 border-black text-black font-bold' 
                : 'bg-slate-900/95 hover:bg-slate-800 text-slate-200 border-slate-700/80 hover:border-emerald-500 shadow-emerald-950/20'
            }`}
            title="Show Right Sidebar (Properties & Layers)"
          >
            <span className="text-[11px] font-bold hidden sm:inline">Inspector</span>
            <PanelRightOpen className="w-4 h-4 text-emerald-400" />
          </button>
        )}
      </div>

      {/* 3. Footer - Permanent architect disclaimers */}
      <DisclaimerBanner highContrast={highContrast} />

      {/* Auto-Label Rooms Modal */}
      {isAutoLabelModalOpen && (
        <AutoLabelRoomsModal
          plan={plan}
          unit={unit}
          highContrast={highContrast}
          onApplyLabels={handleApplyAutoLabels}
          onClose={() => setIsAutoLabelModalOpen(false)}
        />
      )}

      {/* AR Viewer Overlay */}
      {isARViewerOpen && (
        <ARViewer plan={plan} onClose={() => setIsARViewerOpen(false)} />
      )}

      {/* Cost Estimator Overlay */}
      {isEstimatorOpen && (
        <CostEstimatorPanel plan={plan} unit={unit} onClose={() => setIsEstimatorOpen(false)} />
      )}

      {/* AI Architect Chat */}
      {isChatOpen ? (
        <ArchitectChatPanel 
           plan={plan} 
           onClose={() => setIsChatOpen(false)} 
           onUpdatePlan={handleUpdatePlanDirectly}
        />
      ) : (
        <div className="fixed bottom-6 right-6 z-[90]">
           <button 
             onClick={() => setIsChatOpen(true)}
             className="w-14 h-14 bg-blue-600 hover:bg-blue-500 text-white rounded-full flex items-center justify-center shadow-2xl transition-transform hover:scale-105"
             title="Open AI Architect Chat"
           >
             <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/></svg>
           </button>
        </div>
      )}
    </div>
  );
}
