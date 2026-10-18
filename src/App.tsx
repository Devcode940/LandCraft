/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { lazy, Suspense, useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { Sparkles, PanelLeftOpen, PanelRightOpen, Loader2, AlertTriangle, X } from 'lucide-react';
import {
  FloorPlanData,
  ToolType,
  DimensionUnit,
  LayerVisibility,
  Furniture,
  Opening,
  PaletteItem,
  Wall,
  Room,
} from './types';
import { starterPlans } from './utils/sampleData';
import { normalizePlan } from './utils/normalizePlan';
import { editorReducer, initEditorState, type EditorState } from './lib/editorState';
import {
  addElement,
  deleteElement,
  emptyPlan,
  findElement,
  makeId,
  updateElement,
  type ElementType,
} from './lib/planOps';
import { applyEdits, type EditResult } from './lib/planEdits';
import { printBlueprint } from './lib/printBlueprint';
import { clearStoredPlan, loadPlanLocally, parsePlanFile, savePlanLocally } from './lib/persistence';
import { downloadBlob } from './lib/download';

// Components
import Toolbar from './components/Toolbar';
import SidebarPalette from './components/SidebarPalette';
import FloorPlanCanvas from './components/FloorPlanCanvas';
import PropertyInspector from './components/PropertyInspector';
import AiAssistantPanel from './components/AiAssistantPanel';
import DisclaimerBanner from './components/DisclaimerBanner';
import CostEstimatorPanel from './components/CostEstimatorPanel';
import ArchitectChatPanel from './components/ArchitectChatPanel';
import AutoLabelRoomsModal from './components/AutoLabelRoomsModal';
import ErrorBoundary from './components/ErrorBoundary';

// three.js / R3F / drei / WebXR is ~1.5 MB and sits behind a button most users
// never press. Keep it out of the initial bundle.
const ARViewer = lazy(() => import('./components/ARViewer'));

/**
 * Boot state: restore the last session if there is one, otherwise the starter
 * plan. This is what makes a refresh non-destructive; the autosave effect below
 * is the other half.
 */
function createInitialEditorState(): EditorState {
  const restored = loadPlanLocally();
  return restored
    ? initEditorState(restored.plan)
    : initEditorState(normalizePlan(starterPlans.oneBedroom.data));
}

/** Debounce for autosave, in milliseconds. */
const AUTOSAVE_DEBOUNCE_MS = 600;

/** How long an import failure stays on screen, in milliseconds. */
const IMPORT_ERROR_TIMEOUT_MS = 6000;

export default function App() {
  const [state, dispatch] = useReducer(editorReducer, undefined, createInitialEditorState);
  const { plan, entries, index } = state;

  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
  const [selectedElementType, setSelectedElementType] = useState<
    'wall' | 'room' | 'opening' | 'furniture' | null
  >(null);
  const [activeTool, setActiveTool] = useState<ToolType>('select');
  const [selectedPaletteItem, setSelectedPaletteItem] = useState<PaletteItem | null>(null);

  // Viewport Settings
  const [zoom, setZoom] = useState(1.0);
  const [panX, setPanX] = useState(100);
  const [panY, setPanY] = useState(50);
  const [unit, setUnit] = useState<DimensionUnit>('m');
  const [snapToGrid, setSnapToGrid] = useState(true);
  const [snapToElements, setSnapToElements] = useState(true);
  const [highContrast, setHighContrast] = useState(false);

  // Layers Visibility -- the single source of truth for wall L x W labels.
  // There used to be a parallel `showWallLabels` state kept in sync by calling
  // setLayerVisibility from inside another setter's updater (impure, and easy
  // to desync). One object, one writer.
  const [layerVisibility, setLayerVisibility] = useState<LayerVisibility>({
    walls: true,
    rooms: true,
    openings: true,
    furniture: true,
    dimensions: true,
    wallLabels: true,
    grid: true,
  });

  const toggleWallLabels = useCallback(() => {
    setLayerVisibility((curr) => ({ ...curr, wallLabels: !curr.wallLabels }));
  }, []);

  const [isARViewerOpen, setIsARViewerOpen] = useState(false);
  const [isEstimatorOpen, setIsEstimatorOpen] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isAutoLabelModalOpen, setIsAutoLabelModalOpen] = useState(false);

  const [isLeftSidebarOpen, setIsLeftSidebarOpen] = useState(true);
  const [isRightSidebarOpen, setIsRightSidebarOpen] = useState(true);

  // -------------------------------------------------------------------------
  // Dark mode / high contrast
  //
  // Tailwind v4's `dark:` variant keys off prefers-color-scheme, so the old
  // high-contrast mode left dark children inside a light shell. Switching to a
  // class-based variant (see index.css) lets high contrast force light.
  // -------------------------------------------------------------------------
  const [systemPrefersDark, setSystemPrefersDark] = useState(
    () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches,
  );

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (e: MediaQueryListEvent) => setSystemPrefersDark(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    // High contrast always wins: it is an accessibility override, and mixing it
    // with dark-mode child styling defeats the point.
    root.classList.toggle('dark', systemPrefersDark && !highContrast);
  }, [systemPrefersDark, highContrast]);

  // -------------------------------------------------------------------------
  // Plan mutations
  // -------------------------------------------------------------------------

  /** Apply a change without recording an undo step (used during drags). */
  const updatePlan = useCallback((updater: FloorPlanData | ((prev: FloorPlanData) => FloorPlanData)) => {
    dispatch(
      typeof updater === 'function'
        ? { type: 'update', updater, commit: false }
        : { type: 'set', plan: updater, commit: false },
    );
  }, []);

  /** Snapshot the current plan into history (call on drag end). */
  const commitHistory = useCallback(() => dispatch({ type: 'commit' }), []);

  /** Apply a discrete edit and record one undo step. */
  const updatePlanAndCommit = useCallback(
    (updater: FloorPlanData | ((prev: FloorPlanData) => FloorPlanData)) => {
      dispatch(
        typeof updater === 'function'
          ? { type: 'update', updater, commit: true }
          : { type: 'set', plan: updater, commit: true },
      );
    },
    [],
  );

  /**
   * Load a plan from an external source (AI variant, starter template, chat
   * tool call). Always normalized: model output is not a structural guarantee.
   */
  const loadPlan = useCallback((incoming: unknown) => {
    dispatch({ type: 'set', plan: normalizePlan(incoming), commit: true });
    setSelectedElementId(null);
    setSelectedElementType(null);
  }, []);

  /**
   * Apply structured edits from the architect chat. The reducer
   * applies them to its own state -- so an async chat response can
   * never patch a stale plan -- as one undoable history entry.
   * The dry run here is for the chat transcript only; it uses the
   * same pure function the reducer just ran.
   */
  const handleApplyEdits = useCallback(
    (edits: unknown): EditResult => {
      const preview = applyEdits(plan, edits);
      dispatch({ type: 'apply-edits', edits });
      return preview;
    },
    [plan],
  );

  const handleUndo = useCallback(() => dispatch({ type: 'undo' }), []);
  const handleRedo = useCallback(() => dispatch({ type: 'redo' }), []);

  const handleClear = useCallback(() => {
    dispatch({ type: 'set', plan: emptyPlan(), commit: true });
    // Drop the autosave too, otherwise refreshing right after a Clear would
    // quietly bring the starter plan back.
    clearStoredPlan();
    setSelectedElementId(null);
    setSelectedElementType(null);
  }, []);

  const handleLoadSample = useCallback(
    (key: string) => {
      const sample = starterPlans[key];
      if (!sample) {
        console.warn(`[LandCraft] Unknown starter plan: ${key}`);
        return;
      }
      loadPlan(sample.data);
    },
    [loadPlan],
  );

  // Apply auto-labeled room names to plan
  const handleApplyAutoLabels = useCallback(
    (updatedRooms: { id: string; label: string }[]) => {
      updatePlanAndCommit((prev) => {
        const byId = new Map(updatedRooms.map((u) => [u.id, u.label]));
        return {
          ...prev,
          rooms: prev.rooms.map((rm) => (byId.has(rm.id) ? { ...rm, label: byId.get(rm.id)! } : rm)),
        };
      });
    },
    [updatePlanAndCommit],
  );

  // -------------------------------------------------------------------------
  // Element edits
  //
  // Property fields are edited by typing, so each keystroke used to push its
  // own undo step (and the old code debounced via setTimeout inside an
  // updater). Collapse a burst of edits into a single history entry.
  // -------------------------------------------------------------------------
  const commitTimer = useRef<number | null>(null);
  const scheduleCommit = useCallback(() => {
    if (commitTimer.current !== null) window.clearTimeout(commitTimer.current);
    commitTimer.current = window.setTimeout(() => {
      commitTimer.current = null;
      dispatch({ type: 'commit' });
    }, 500);
  }, []);

  useEffect(
    () => () => {
      if (commitTimer.current !== null) window.clearTimeout(commitTimer.current);
    },
    [],
  );

  const handleUpdateElement = useCallback(
    (type: ElementType, id: string, updatedData: Partial<Wall & Room & Opening & Furniture>) => {
      updatePlan((prev) => updateElement(prev, type, id, updatedData));
      // Inspector fields fire on every keystroke/slider tick; collapse the
      // burst into one undo step once typing settles.
      scheduleCommit();
    },
    [updatePlan, scheduleCommit],
  );

  const handleDeleteElement = useCallback(
    (type: 'wall' | 'room' | 'opening' | 'furniture', id: string) => {
      updatePlanAndCommit((prev) => deleteElement(prev, type, id));
      setSelectedElementId(null);
      setSelectedElementType(null);
    },
    [updatePlanAndCommit],
  );

  /**
   * Place a palette preset at the centre of the viewport.
   *
   * The old version did `const next = {...prev}; next.rooms.push(...)`, which
   * mutates the array every history entry aliases -- undo could never restore
   * prior rooms -- and the id was computed outside the updater, so React's
   * StrictMode double-invoke created two elements sharing one id. Immutable
   * spread + id inside the updater fixes both.
   */
  const handleInstantAdd = useCallback(
    (
      type: 'room' | 'opening' | 'furniture',
      subType: string,
      label: string,
      width?: number,
      height?: number,
      extra?: { color?: string; category?: string },
    ) => {
      const centerX = Math.round((400 - panX) / zoom);
      const centerY = Math.round((250 - panY) / zoom);

      updatePlanAndCommit((prev) => {
        // Generated inside the updater so React's StrictMode double-invoke
        // cannot create two elements sharing one id.
        const id = makeId(type);

        if (type === 'room') {
          const w = width || 120;
          const h = height || 80;
          return addElement(prev, 'room', {
            id,
            x: centerX - w / 2,
            y: centerY - h / 2,
            width: w,
            height: h,
            label,
            color: extra?.color || 'rgba(59, 130, 246, 0.08)',
          });
        }

        if (type === 'opening') {
          const isWindow = subType === 'standard' || subType === 'large' || subType === 'bay';
          return addElement(prev, 'opening', {
            id,
            type: isWindow ? 'window' : 'door',
            subType: subType as Opening['subType'],
            x: centerX,
            y: centerY,
            width: width || 32,
            rotation: 0,
            flipSwing: false,
          });
        }

        if (type === 'furniture') {
          return addElement(prev, 'furniture', {
            id,
            subType,
            label,
            x: centerX,
            y: centerY,
            width: width || 40,
            height: height || 40,
            rotation: 0,
            category: (extra?.category as Furniture['category']) || 'living',
          });
        }

        return prev;
      });
    },
    [updatePlanAndCommit, panX, panY, zoom],
  );

  const getSelectedElementData = useMemo(() => {
    if (!selectedElementId || !selectedElementType) return null;
    return findElement(plan, selectedElementType, selectedElementId);
  }, [plan, selectedElementId, selectedElementType]);

  // -------------------------------------------------------------------------
  // Statistics
  // -------------------------------------------------------------------------
  const stats = useMemo(() => {
    let totalAreaPixels = 0;
    plan.rooms.forEach((r) => {
      totalAreaPixels += r.width * r.height;
    });
    // 40px * 40px = 1600px2 per m2
    const totalAreaM2 = totalAreaPixels / 1600;
    const formattedArea =
      unit === 'm' ? `${totalAreaM2.toFixed(1)} m²` : `${(totalAreaM2 * 10.7639).toFixed(0)} sq ft`;

    return {
      area: formattedArea,
      wallsCount: plan.walls.length,
      openingsCount: plan.openings.length,
      furnitureCount: plan.furniture.length,
    };
  }, [plan, unit]);

  // -------------------------------------------------------------------------
  // Keyboard shortcuts
  //
  // A drafting tool without Ctrl+Z is not a drafting tool. Bound here at the
  // document level so they work regardless of which panel has focus, but
  // suppressed while typing so they never eat characters in a text field.
  // -------------------------------------------------------------------------
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      const isTyping =
        tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target?.isContentEditable === true;

      const mod = e.ctrlKey || e.metaKey;

      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) handleRedo();
        else handleUndo();
        return;
      }
      if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        handleRedo();
        return;
      }

      // Everything below is a bare-key shortcut, so it must not fire while the
      // user is typing in the inspector or the chat box.
      if (isTyping || mod || e.altKey) return;

      switch (e.key) {
        case 'Delete':
        case 'Backspace':
          if (selectedElementId && selectedElementType) {
            e.preventDefault();
            handleDeleteElement(selectedElementType, selectedElementId);
          }
          break;
        case 'Escape':
          setSelectedElementId(null);
          setSelectedElementType(null);
          break;
        case 'v':
        case 'V':
          setActiveTool('select');
          break;
        case 'w':
        case 'W':
          setActiveTool('wall');
          break;
        case 'r':
        case 'R':
          setActiveTool('room');
          break;
        case 'd':
        case 'D':
          setActiveTool('door');
          break;
        case 'n':
        case 'N':
          setActiveTool('window');
          break;
        case 'f':
        case 'F':
          setActiveTool('furniture');
          break;
        case 'm':
        case 'M':
          setActiveTool('measure');
          break;
        default:
          break;
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    handleRedo,
    handleUndo,
    handleDeleteElement,
    selectedElementId,
    selectedElementType,
    setActiveTool,
    setSelectedElementId,
    setSelectedElementType,
  ]);

  // -------------------------------------------------------------------------
  // Persistence
  // -------------------------------------------------------------------------

  /**
   * Autosave. Debounced because `plan` gets a new identity on every mousemove
   * during a drag, and writing to localStorage is synchronous -- doing it per
   * frame visibly janks the canvas. Flushed on unmount and on `beforeunload`
   * so a drag in progress is not lost.
   */
  const saveTimer = useRef<number | null>(null);

  // Mirrored into a ref so the beforeunload handler (registered once) always
  useEffect(() => {
    if (saveTimer.current !== null) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      saveTimer.current = null;
      savePlanLocally(plan);
    }, AUTOSAVE_DEBOUNCE_MS);

    return () => {
      if (saveTimer.current !== null) window.clearTimeout(saveTimer.current);
    };
  }, [plan]);

  // Re-binds on every plan change so the handler always sees the
  // latest state without a ref.
  useEffect(() => {
    const flush = () => savePlanLocally(plan);
    window.addEventListener('beforeunload', flush);
    return () => {
      window.removeEventListener('beforeunload', flush);
      flush();
    };
  }, [plan]);

  const [importError, setImportError] = useState<string | null>(null);

  // Auto-dismiss import errors: they are transient feedback, not a state the
  // user has to click away before continuing.
  useEffect(() => {
    if (!importError) return;
    const timer = window.setTimeout(() => setImportError(null), IMPORT_ERROR_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [importError]);

  const handleImportJson = useCallback(async (file: File) => {
    setImportError(null);
    try {
      const parsed = parsePlanFile(await file.text());
      dispatch({ type: 'set', plan: parsed, commit: true });
      setSelectedElementId(null);
      setSelectedElementType(null);
    } catch (error) {
      // parsePlanFile throws user-facing messages; never leak a stack trace
      // into the UI for what is almost always a wrong-file mistake.
      setImportError(error instanceof Error ? error.message : 'That file could not be read.');
    }
  }, []);

  // -------------------------------------------------------------------------
  // Exports
  // -------------------------------------------------------------------------
  const handleExportJson = useCallback(() => {
    downloadBlob(`landcraft-plan-${Date.now()}.json`, JSON.stringify(plan, null, 2), 'application/json');
  }, [plan]);

  const handleExportSvg = useCallback(() => {
    const svgElement = document.querySelector<SVGSVGElement>('#interactive-blueprint-svg');
    if (!svgElement) return;

    const serializer = new XMLSerializer();
    const clone = svgElement.cloneNode(true) as SVGSVGElement;

    // The live element is sized by CSS (w-full/h-full) and carries the current
    // pan/zoom transform. Give the export intrinsic dimensions so it opens at a
    // sane size in a viewer, and a viewBox so it scales.
    const rect = svgElement.getBoundingClientRect();
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    clone.setAttribute('width', String(Math.max(1, Math.round(rect.width))));
    clone.setAttribute('height', String(Math.max(1, Math.round(rect.height))));
    clone.setAttribute(
      'viewBox',
      `0 0 ${Math.max(1, Math.round(rect.width))} ${Math.max(1, Math.round(rect.height))}`,
    );

    downloadBlob(
      `landcraft-blueprint-${Date.now()}.svg`,
      serializer.serializeToString(clone),
      'image/svg+xml',
    );
  }, []);

  const handlePrint = useCallback(() => {
    const svgElement = document.querySelector<SVGSVGElement>('#interactive-blueprint-svg');
    if (svgElement) printBlueprint(svgElement);
  }, []);

  // -------------------------------------------------------------------------

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
              <h1 className="text-lg font-black tracking-tight uppercase">LandCraft AI</h1>
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
          <div className="bg-slate-800/60 border border-slate-700/50 px-3 py-2 rounded-lg text-[11px] font-mono">
            <span className="text-slate-400 block uppercase text-[8px] tracking-wider font-semibold">
              Total Area
            </span>
            <span className="font-bold text-slate-100 text-xs">{stats.area}</span>
          </div>
          <div className="bg-slate-800/60 border border-slate-700/50 px-3 py-2 rounded-lg text-[11px] font-mono">
            <span className="text-slate-400 block uppercase text-[8px] tracking-wider font-semibold">
              Structural Walls
            </span>
            <span className="font-bold text-slate-100 text-xs">{stats.wallsCount}</span>
          </div>
          <div className="bg-slate-800/60 border border-slate-700/50 px-3 py-2 rounded-lg text-[11px] font-mono">
            <span className="text-slate-400 block uppercase text-[8px] tracking-wider font-semibold">
              Openings (Doors/Win)
            </span>
            <span className="font-bold text-slate-100 text-xs">{stats.openingsCount}</span>
          </div>
          <div className="bg-slate-800/60 border border-slate-700/50 px-3 py-2 rounded-lg text-[11px] font-mono">
            <span className="text-slate-400 block uppercase text-[8px] tracking-wider font-semibold">
              Furniture
            </span>
            <span className="font-bold text-slate-100 text-xs">{stats.furnitureCount}</span>
          </div>
        </div>
      </header>

      {/* 2. Primary Layout Editor Body */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden relative">
        {isLeftSidebarOpen && (
          <SidebarPalette
            activeTool={activeTool}
            setActiveTool={setActiveTool}
            selectedPaletteItem={selectedPaletteItem}
            setSelectedPaletteItem={setSelectedPaletteItem}
            highContrast={highContrast}
            onInstantAdd={handleInstantAdd}
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
            showWallLabels={layerVisibility.wallLabels}
            setShowWallLabels={toggleWallLabels}
            highContrast={highContrast}
            setHighContrast={setHighContrast}
            canUndo={index > 0}
            canRedo={index < entries.length - 1}
            onUndo={handleUndo}
            onRedo={handleRedo}
            onClear={handleClear}
            onLoadSample={handleLoadSample}
            onExportJson={handleExportJson}
            onExportSvg={handleExportSvg}
            onPrint={handlePrint}
            onImportJson={handleImportJson}
            onOpenAR={() => setIsARViewerOpen(true)}
            onOpenEstimator={() => setIsEstimatorOpen(true)}
            onOpenAutoLabeler={() => setIsAutoLabelModalOpen(true)}
            isLeftSidebarOpen={isLeftSidebarOpen}
            onToggleLeftSidebar={() => setIsLeftSidebarOpen((prev) => !prev)}
            isRightSidebarOpen={isRightSidebarOpen}
            onToggleRightSidebar={() => setIsRightSidebarOpen((prev) => !prev)}
            zoom={zoom}
            setZoom={setZoom}
          />

          {/* Interactive Blueprint drafting board */}
          <FloorPlanCanvas
            plan={plan}
            setPlan={updatePlan}
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
            gridSize={20}
            highContrast={highContrast}
            layerVisibility={layerVisibility}
            onToggleWallLabels={toggleWallLabels}
            onStateChange={commitHistory}
          />

          {/* Dynamic AI continuous diagnostic review board. Isolated: it
              renders parsed model output, the most likely thing to throw. */}
          <ErrorBoundary variant="panel">
            <AiAssistantPanel plan={plan} unit={unit} highContrast={highContrast} onLoadPlan={loadPlan} />
          </ErrorBoundary>
        </div>

        {/* Right side drawer - Properties inspector and layout sheets */}
        {isRightSidebarOpen && (
          <ErrorBoundary variant="panel">
            <PropertyInspector
              selectedElement={getSelectedElementData}
              selectedType={selectedElementType}
              onUpdateElement={handleUpdateElement}
              onDeleteElement={handleDeleteElement}
              unit={unit}
              highContrast={highContrast}
              layerVisibility={layerVisibility}
              setLayerVisibility={setLayerVisibility}
              onToggleWallLabels={toggleWallLabels}
              furnitureList={plan.furniture}
              onOpenAutoLabeler={() => setIsAutoLabelModalOpen(true)}
              onToggle={() => setIsRightSidebarOpen(false)}
            />
          </ErrorBoundary>
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

      {/* AR Viewer Overlay -- lazily loaded */}
      {isARViewerOpen && (
        <ErrorBoundary
          fallback={
            <div className="fixed inset-0 z-[100] bg-black/80 text-white flex items-center justify-center p-6 text-sm">
              The 3D viewer could not start. Your 2D plan is unaffected — close this to continue.
            </div>
          }
        >
          <Suspense
            fallback={
              <div className="fixed inset-0 z-[100] bg-black text-white flex flex-col items-center justify-center gap-3">
                <Loader2 className="w-8 h-8 animate-spin text-emerald-400" />
                <span className="text-xs text-slate-400">Loading 3D viewer…</span>
              </div>
            }
          >
            <ARViewer plan={plan} onClose={() => setIsARViewerOpen(false)} />
          </Suspense>
        </ErrorBoundary>
      )}

      {/* Import failure feedback */}
      {importError && (
        <div
          role="alert"
          className={`fixed top-20 left-1/2 -translate-x-1/2 z-[110] max-w-md flex items-start gap-3 px-4 py-3 rounded-xl shadow-2xl border text-sm ${
            highContrast
              ? 'bg-white border-2 border-black text-black font-semibold'
              : 'bg-red-950/95 border-red-700 text-red-100'
          }`}
        >
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <span className="flex-1">{importError}</span>
          <button
            onClick={() => setImportError(null)}
            className="shrink-0 opacity-70 hover:opacity-100 transition-opacity"
            aria-label="Dismiss"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Cost Estimator Overlay */}
      {isEstimatorOpen && <CostEstimatorPanel plan={plan} onClose={() => setIsEstimatorOpen(false)} />}

      {/* AI Architect Chat */}
      {isChatOpen ? (
        <ArchitectChatPanel
          plan={plan}
          onClose={() => setIsChatOpen(false)}
          onUpdatePlan={loadPlan}
          onApplyEdits={handleApplyEdits}
        />
      ) : (
        <div className="fixed bottom-6 right-6 z-[90]">
          <button
            onClick={() => setIsChatOpen(true)}
            className="w-14 h-14 bg-blue-600 hover:bg-blue-500 text-white rounded-full flex items-center justify-center shadow-2xl transition-transform hover:scale-105"
            title="Open AI Architect Chat"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 8V4H8" />
              <rect width="16" height="12" x="4" y="8" rx="2" />
              <path d="M2 14h2" />
              <path d="M20 14h2" />
              <path d="M15 13v2" />
              <path d="M9 13v2" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}
