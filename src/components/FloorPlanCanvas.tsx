/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Ruler } from 'lucide-react';
import {
  Wall,
  Room,
  Opening,
  Furniture,
  FloorPlanData,
  Point,
  ToolType,
  DimensionUnit,
  LayerVisibility,
  MeasurementTape,
} from '../types';
import {
  getSmartSnap,
  snapOpeningToWalls,
  formatDimension,
  formatWallDimensions,
  getDistance,
} from '../utils/geoUtils';
import { suggestRoomName } from '../utils/roomAutoLabeler';
import { MIN_ZOOM, MAX_ZOOM } from '../constants';
import { moveRoomWithContents } from '../lib/planOps';

interface FloorPlanCanvasProps {
  plan: FloorPlanData;
  setPlan: (p: FloorPlanData | ((prev: FloorPlanData) => FloorPlanData)) => void;
  selectedElementId: string | null;
  selectedElementType: 'wall' | 'room' | 'opening' | 'furniture' | null;
  setSelectedElementId: (id: string | null) => void;
  setSelectedElementType: (t: 'wall' | 'room' | 'opening' | 'furniture' | null) => void;
  activeTool: ToolType;
  setActiveTool: (tool: ToolType) => void;
  selectedPaletteItem: any | null;
  setSelectedPaletteItem: (item: any | null) => void;
  zoom: number;
  setZoom: React.Dispatch<React.SetStateAction<number>>;
  panX: number;
  setPanX: (x: number) => void;
  panY: number;
  setPanY: (y: number) => void;
  unit: DimensionUnit;
  snapToGrid: boolean;
  snapToElements: boolean;
  gridSize: number;
  highContrast: boolean;
  layerVisibility: LayerVisibility;
  onToggleWallLabels: () => void;
  onStateChange: () => void; // Push history
}

type DragElementType = 'room' | 'opening' | 'furniture' | 'joint' | 'room-resize';

interface DragState {
  mode: 'none' | 'pan' | 'element' | 'measure';
  elementType: DragElementType | null;
  elementId: string | null;
  jointWallId: string | null;
  jointType: 'p1' | 'p2' | null;
  /** Grab offset so an element doesn't jump to centre under the cursor. */
  offset: Point;
  startMouse: Point;
  startPan: Point;
  /** Anchor point for a measurement drag. */
  measureStart: Point | null;
}

/** Shortest drag that counts as an intentional measurement, in canvas px. */
const MIN_MEASURE_PX = 4;

const IDLE_DRAG: DragState = {
  mode: 'none',
  elementType: null,
  elementId: null,
  jointWallId: null,
  jointType: null,
  offset: { x: 0, y: 0 },
  startMouse: { x: 0, y: 0 },
  startPan: { x: 0, y: 0 },
  measureStart: null,
};

export default function FloorPlanCanvas({
  plan,
  setPlan,
  selectedElementId,
  setSelectedElementId,
  setSelectedElementType,
  activeTool,
  setActiveTool,
  selectedPaletteItem,
  setSelectedPaletteItem,
  zoom,
  setZoom,
  panX,
  setPanX,
  panY,
  setPanY,
  unit,
  snapToGrid,
  snapToElements,
  gridSize,
  highContrast,
  layerVisibility,
  onToggleWallLabels,
  onStateChange,
}: FloorPlanCanvasProps) {
  const svgRef = useRef<SVGSVGElement>(null);

  // Wall L x W labels now have exactly one source of truth: layerVisibility.
  const effectiveShowWallLabels = layerVisibility?.wallLabels ?? true;

  // Interaction State
  const [isDrawingWall, setIsDrawingWall] = useState(false);
  const [wallStartPoint, setWallStartPoint] = useState<Point | null>(null);
  const [currentMousePoint, setCurrentMousePoint] = useState<Point>({ x: 0, y: 0 });
  const [snappedGuide, setSnappedGuide] = useState<Point | null>(null);

  /**
   * Measurement tapes. These are drafting annotations, not plan geometry, so
   * they are deliberately NOT part of FloorPlanData: they must not end up in a
   * JSON export, an AI round trip, or the undo history.
   */
  const [measurements, setMeasurements] = useState<MeasurementTape[]>([]);
  const [measureDraft, setMeasureDraft] = useState<MeasurementTape | null>(null);

  /**
   * Drag bookkeeping lives in a ref because the move/up listeners are attached
   * to `window` (bound once). Previously they were React handlers on the <svg>:
   * releasing the mouse outside the element left `isDraggingElement` stuck true
   * forever, gluing the element to the cursor.
   */
  const dragRef = useRef<DragState>({ ...IDLE_DRAG });

  /**
   * Latest props for the window listeners. Refreshed in an effect so the
   * handlers never close over stale plan/zoom/pan values.
   */
  const latest = useRef({
    plan,
    setPlan,
    zoom,
    panX,
    panY,
    gridSize,
    snapToGrid,
    snapToElements,
    activeTool,
    selectedPaletteItem,
    onStateChange,
    unit,
  });

  useEffect(() => {
    latest.current = {
      plan,
      setPlan,
      zoom,
      panX,
      panY,
      gridSize,
      snapToGrid,
      snapToElements,
      activeTool,
      selectedPaletteItem,
      onStateChange,
      unit,
    };
  });

  // Convert client cursor coordinate to canvas grid coordinate (considering zoom, pan, grid offset)
  const getCanvasCoords = useCallback((clientX: number, clientY: number): Point => {
    if (!svgRef.current) return { x: 0, y: 0 };
    const { zoom: z, panX: px, panY: py } = latest.current;
    const rect = svgRef.current.getBoundingClientRect();
    return {
      x: (clientX - rect.left - px) / z,
      y: (clientY - rect.top - py) / z,
    };
  }, []);

  // -------------------------------------------------------------------------
  // Window-level move / up
  // -------------------------------------------------------------------------

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const s = latest.current;
      const drag = dragRef.current;

      if (drag.mode === 'pan') {
        setPanX(drag.startPan.x + (e.clientX - drag.startMouse.x));
        setPanY(drag.startPan.y + (e.clientY - drag.startMouse.y));
        return;
      }

      const coords = getCanvasCoords(e.clientX, e.clientY);
      const snapped = getSmartSnap(coords, s.plan.walls, s.gridSize, {
        snapToGrid: s.snapToGrid,
        snapToElements: s.snapToElements,
      });
      setCurrentMousePoint(snapped);
      setSnappedGuide(s.snapToGrid || s.snapToElements ? snapped : null);

      if (drag.mode === 'measure' && drag.measureStart) {
        setMeasureDraft({
          id: 'draft',
          x1: drag.measureStart.x,
          y1: drag.measureStart.y,
          x2: snapped.x,
          y2: snapped.y,
        });
        return;
      }

      if (drag.mode !== 'element' || !drag.elementId || !drag.elementType) return;

      const id = drag.elementId;
      s.setPlan((prev) => {
        const next = { ...prev };

        switch (drag.elementType) {
          case 'room':
            // Carry the furniture and openings inside the room: moving a room
            // and leaving its contents behind is not what anyone means by it.
            return moveRoomWithContents(prev, id, snapped.x - drag.offset.x, snapped.y - drag.offset.y);

          case 'furniture':
            // Offset-aware now: previously furniture snapped its centre to the
            // cursor the moment a drag began, unlike rooms.
            next.furniture = prev.furniture.map((fn) =>
              fn.id === id ? { ...fn, x: snapped.x - drag.offset.x, y: snapped.y - drag.offset.y } : fn
            );
            break;

          case 'opening': {
            const snapRes = snapOpeningToWalls(coords, prev.walls);
            next.openings = prev.openings.map((op) =>
              op.id === id
                ? {
                    ...op,
                    x: snapRes.point.x,
                    y: snapRes.point.y,
                    rotation: snapRes.rotation,
                    wallId: snapRes.wallId,
                    wallOffset: snapRes.offset,
                  }
                : op
            );
            break;
          }

          case 'joint': {
            const wallId = drag.jointWallId;
            const jointType = drag.jointType;
            if (!wallId || !jointType) break;
            next.walls = prev.walls.map((w) => {
              if (w.id !== wallId) return w;
              return jointType === 'p1'
                ? { ...w, x1: snapped.x, y1: snapped.y }
                : { ...w, x2: snapped.x, y2: snapped.y };
            });
            break;
          }

          case 'room-resize':
            next.rooms = prev.rooms.map((rm) => {
              if (rm.id !== id) return rm;
              return {
                ...rm,
                width: Math.max(40, snapped.x - rm.x),
                height: Math.max(40, snapped.y - rm.y),
              };
            });
            break;
        }

        return next;
      });
    };

    const onUp = () => {
      const drag = dragRef.current;
      if (drag.mode === 'element') {
        // One history entry per drag, recorded on release.
        latest.current.onStateChange();
      }
      if (drag.mode === 'measure') {
        setMeasureDraft((draft) => {
          // Discard accidental clicks: a tape shorter than a few pixels is a
          // mis-click, not a measurement.
          if (draft && getDistance({ x: draft.x1, y: draft.y1 }, { x: draft.x2, y: draft.y2 }) >= MIN_MEASURE_PX) {
            setMeasurements((prev) => [...prev, { ...draft, id: `m-${prev.length}-${Date.now()}` }]);
          }
          return null;
        });
      }
      dragRef.current = { ...IDLE_DRAG };
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [getCanvasCoords, setPanX, setPanY]);

  // Esc key cancels active tool or placement
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        dragRef.current = { ...IDLE_DRAG };
        setIsDrawingWall(false);
        setWallStartPoint(null);
        setSelectedPaletteItem(null);
        setMeasureDraft(null);
        setActiveTool('select');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [setActiveTool, setSelectedPaletteItem]);

  /**
   * Wheel zoom. React attaches `onWheel` passively, so `preventDefault()` in a
   * React handler is ignored ("Unable to preventDefault inside passive event
   * listener") and page scroll leaks through. Bind directly with passive:false.
   */
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const scaleFactor = 1.1;
      setZoom((z) => {
        const next = e.deltaY < 0 ? z * scaleFactor : z / scaleFactor;
        return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, next));
      });
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [setZoom]);

  const startPan = (e: React.MouseEvent) => {
    dragRef.current = {
      ...IDLE_DRAG,
      mode: 'pan',
      startMouse: { x: e.clientX, y: e.clientY },
      startPan: { x: panX, y: panY },
    };
  };

  // -------------------------------------------------------------------------
  // Mouse down on the SVG stage
  // -------------------------------------------------------------------------

  const handleMouseDown = (e: React.MouseEvent<SVGSVGElement>) => {
    // 1. Right / middle click always pans, whatever the active tool is.
    if (e.button === 1 || e.button === 2) {
      startPan(e);
      e.preventDefault();
      return;
    }
    if (e.button !== 0) return;

    const coords = getCanvasCoords(e.clientX, e.clientY);
    const snapped = getSmartSnap(coords, plan.walls, gridSize, { snapToGrid, snapToElements });

    // 2. Measure tool: drag out a tape measure. It used to fall through to the
    //    pan branch, so the tool existed in the palette but did nothing.
    if (activeTool === 'measure') {
      const anchor = snapToGrid || snapToElements ? snapped : coords;
      dragRef.current = { ...IDLE_DRAG, mode: 'measure', measureStart: anchor };
      setMeasureDraft({ id: 'draft', x1: anchor.x, y1: anchor.y, x2: anchor.x, y2: anchor.y });
      e.preventDefault();
      return;
    }

    // 2. Drawing Wall
    if (activeTool === 'wall') {
      if (!isDrawingWall) {
        setIsDrawingWall(true);
        setWallStartPoint(snapped);
        setCurrentMousePoint(snapped);
      } else if (wallStartPoint && (snapped.x !== wallStartPoint.x || snapped.y !== wallStartPoint.y)) {
        const newWall: Wall = {
          id: `wall-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          x1: wallStartPoint.x,
          y1: wallStartPoint.y,
          x2: snapped.x,
          y2: snapped.y,
          thickness: 10,
        };
        setPlan((prev) => ({ ...prev, walls: [...prev.walls, newWall] }));
        onStateChange();
        // Chain start of next wall
        setWallStartPoint(snapped);
      }
      return;
    }

    // 3. Stamping Palette Elements
    if (selectedPaletteItem) {
      const id = `${selectedPaletteItem.type}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      if (selectedPaletteItem.type === 'room') {
        const w = selectedPaletteItem.width || 120;
        const h = selectedPaletteItem.height || 80;
        const newRoom: Room = {
          id,
          x: snapped.x - w / 2,
          y: snapped.y - h / 2,
          width: w,
          height: h,
          label: selectedPaletteItem.label,
          // Honour the palette preset's colour; it used to be silently dropped
          // so every stamped room came out blue.
          color: selectedPaletteItem.color || 'rgba(59, 130, 246, 0.08)',
        };
        setPlan((prev) => ({ ...prev, rooms: [...prev.rooms, newRoom] }));
      } else if (selectedPaletteItem.type === 'opening') {
        const snapRes = snapOpeningToWalls(coords, plan.walls);
        const isWindow =
          selectedPaletteItem.subType === 'standard' ||
          selectedPaletteItem.subType === 'large' ||
          selectedPaletteItem.subType === 'bay';
        const newOpening: Opening = {
          id,
          type: isWindow ? 'window' : 'door',
          subType: selectedPaletteItem.subType,
          x: snapRes.point.x,
          y: snapRes.point.y,
          width: selectedPaletteItem.width || 32,
          rotation: snapRes.rotation,
          wallId: snapRes.wallId,
          wallOffset: snapRes.offset,
          flipSwing: false,
        };
        setPlan((prev) => ({ ...prev, openings: [...prev.openings, newOpening] }));
      } else if (selectedPaletteItem.type === 'furniture') {
        const newFurn: Furniture = {
          id,
          subType: selectedPaletteItem.subType,
          label: selectedPaletteItem.label,
          x: snapped.x,
          y: snapped.y,
          width: selectedPaletteItem.width || 40,
          height: selectedPaletteItem.height || 40,
          rotation: 0,
          category: selectedPaletteItem.category || 'living',
        };
        setPlan((prev) => ({ ...prev, furniture: [...prev.furniture, newFurn] }));
      }
      onStateChange();
      setSelectedPaletteItem(null); // Reset placement mode
      setActiveTool('select');
      return;
    }

    // 4. Normal interaction -- clicked empty space
    if (e.target === svgRef.current) {
      setSelectedElementId(null);
      setSelectedElementType(null);
      if (activeTool === 'select') startPan(e);
    }
  };

  /**
   * Element press: select, delete, or begin a drag.
   *
   * This is `onMouseDown`, not `onClick`. With `onClick`, the drag flag was set
   * *after* the mouseup that was supposed to clear it, so simply clicking an
   * element and moving the mouse (no button held) dragged it.
   */
  const handleElementMouseDown = (
    e: React.MouseEvent,
    type: 'wall' | 'room' | 'opening' | 'furniture',
    id: string
  ) => {
    e.stopPropagation();
    if (e.button !== 0) return;

    // Eraser active? Delete immediately
    if (activeTool === 'delete') {
      setPlan((prev) => {
        const next = { ...prev };
        if (type === 'wall') {
          next.walls = prev.walls.filter((w) => w.id !== id);
          next.openings = prev.openings.map((o) => (o.wallId === id ? { ...o, wallId: undefined } : o));
        } else if (type === 'room') next.rooms = prev.rooms.filter((r) => r.id !== id);
        else if (type === 'opening') next.openings = prev.openings.filter((o) => o.id !== id);
        else if (type === 'furniture') next.furniture = prev.furniture.filter((f) => f.id !== id);
        return next;
      });
      setSelectedElementId(null);
      setSelectedElementType(null);
      onStateChange();
      return;
    }

    if (activeTool !== 'select') return;

    setSelectedElementId(id);
    setSelectedElementType(type);

    const coords = getCanvasCoords(e.clientX, e.clientY);

    if (type === 'room') {
      const rm = plan.rooms.find((r) => r.id === id);
      if (!rm) return;
      dragRef.current = {
        ...IDLE_DRAG,
        mode: 'element',
        elementType: 'room',
        elementId: id,
        offset: { x: coords.x - rm.x, y: coords.y - rm.y },
      };
    } else if (type === 'furniture') {
      const fn = plan.furniture.find((f) => f.id === id);
      if (!fn) return;
      dragRef.current = {
        ...IDLE_DRAG,
        mode: 'element',
        elementType: 'furniture',
        elementId: id,
        offset: { x: coords.x - fn.x, y: coords.y - fn.y },
      };
    } else if (type === 'opening') {
      dragRef.current = {
        ...IDLE_DRAG,
        mode: 'element',
        elementType: 'opening',
        elementId: id,
      };
    }
    // Walls are selected but not dragged from their body; use the endpoint
    // handles (joints) to reshape them.
  };

  const handleJointDragStart = (e: React.MouseEvent, wallId: string, type: 'p1' | 'p2') => {
    e.stopPropagation();
    if (e.button !== 0) return;
    dragRef.current = {
      ...IDLE_DRAG,
      mode: 'element',
      elementType: 'joint',
      elementId: wallId,
      jointWallId: wallId,
      jointType: type,
    };
  };

  const handleRoomResizeStart = (e: React.MouseEvent, roomId: string) => {
    e.stopPropagation();
    if (e.button !== 0) return;
    dragRef.current = {
      ...IDLE_DRAG,
      mode: 'element',
      elementType: 'room-resize',
      elementId: roomId,
    };
  };

  /**
   * Finish a wall chain. Previously defined but never bound to the element, so
   * the on-canvas instruction "Double click to finish segment" did nothing.
   */
  const handleDoubleClick = () => {
    if (isDrawingWall) {
      setIsDrawingWall(false);
      setWallStartPoint(null);
    }
  };

  // Color theme logic
  const gridLineColor = highContrast ? 'rgba(0, 0, 0, 0.15)' : 'rgba(51, 65, 85, 0.05)';
  const gridMajorColor = highContrast ? 'rgba(0, 0, 0, 0.3)' : 'rgba(51, 65, 85, 0.1)';
  const canvasBackground = highContrast ? 'bg-white' : 'bg-[#fafaf9] dark:bg-slate-950';

  return (
    <div
      id="floor-plan-editor-stage"
      className={`flex-1 relative overflow-hidden select-none outline-none ${canvasBackground}`}
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* 1. Measurement guide/instructions overlay */}
      <div className="absolute top-3 left-3 bg-white/90 dark:bg-slate-900/90 backdrop-blur-xs p-2 rounded border border-slate-200 dark:border-slate-800 text-[10px] space-y-0.5 pointer-events-none z-10 font-medium">
        <div className="flex items-center gap-1.5 text-slate-700 dark:text-slate-300">
          <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block animate-pulse" />
          <span>
            Active Mode: <strong className="font-semibold uppercase text-emerald-600 dark:text-emerald-400">{activeTool}</strong>
          </span>
        </div>
        <p className="text-slate-400">
          {activeTool === 'wall' && 'Click to start drawing a wall. Double click or Esc to finish.'}
          {activeTool === 'select' && 'Drag furniture & doors to move. Drag red endpoints to stretch walls.'}
          {activeTool === 'measure' &&
            'Drag between two points to measure. Middle-drag still pans. Esc clears.'}
          {activeTool === 'delete' && 'Click elements to delete.'}
        </p>
      </div>

      {/* Measurement controls -- only shown once there is something to clear. */}
      {measurements.length > 0 && (
        <div className="absolute top-3 right-3 mr-0 z-10 translate-y-14 flex items-center gap-2">
          <button
            id="clear-measurements-btn"
            type="button"
            onClick={() => setMeasurements([])}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 shadow-lg backdrop-blur-md transition-all cursor-pointer border ${
              highContrast
                ? 'bg-white text-black border-2 border-black font-bold'
                : 'bg-white dark:bg-slate-800 hover:bg-amber-50 dark:hover:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-400/60'
            }`}
            title="Remove all measurement tapes from the canvas"
          >
            <Ruler className="w-3.5 h-3.5" />
            <span className="font-medium">
              Clear {measurements.length} measurement{measurements.length === 1 ? '' : 's'}
            </span>
          </button>
        </div>
      )}

      {/* Real-Time Canvas Wall L x W Quick Toggle HUD */}
      <div className="absolute top-3 right-3 flex items-center gap-2 z-10">
        <button
          id="canvas-toggle-wall-labels"
          type="button"
          onClick={onToggleWallLabels}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 shadow-lg backdrop-blur-md transition-all cursor-pointer border ${
            effectiveShowWallLabels
              ? highContrast
                ? 'bg-black text-white border-black font-bold'
                : 'bg-slate-900/90 hover:bg-slate-900 text-white border-emerald-500/50 shadow-emerald-950/30 ring-1 ring-emerald-500/30'
              : highContrast
                ? 'bg-white text-black border-2 border-black font-bold'
                : 'bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-300 border-slate-300 dark:border-slate-600'
          }`}
          title={
            effectiveShowWallLabels
              ? 'Hide real-time wall length & width labels on canvas'
              : 'Show real-time wall length & width labels on canvas'
          }
        >
          <Ruler className={`w-3.5 h-3.5 ${effectiveShowWallLabels ? 'text-emerald-400' : 'text-slate-400'}`} />
          <span className="font-medium">Wall L×W Labels</span>
          <span
            className={`text-[10px] px-1.5 py-0.5 rounded font-mono font-bold uppercase transition-colors ${
              effectiveShowWallLabels
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                : 'bg-slate-200 dark:bg-slate-900 text-slate-500 dark:text-slate-400 border border-slate-300 dark:border-slate-700'
            }`}
          >
            {effectiveShowWallLabels ? 'ON' : 'OFF'}
          </span>
        </button>
      </div>

      {/* 2. Interactive SVG Element */}
      <svg
        id="interactive-blueprint-svg"
        ref={svgRef}
        className="w-full h-full cursor-crosshair"
        onMouseDown={handleMouseDown}
        onDoubleClick={handleDoubleClick}
        onMouseLeave={() => setSnappedGuide(null)}
        style={{ touchAction: 'none' }}
      >
        <defs>
          {/* Snap Grid Background */}
          <pattern id="grid-pattern-minor" width={gridSize} height={gridSize} patternUnits="userSpaceOnUse">
            <line x1="0" y1="0" x2={gridSize} y2="0" stroke={gridLineColor} strokeWidth="1" />
            <line x1="0" y1="0" x2="0" y2={gridSize} stroke={gridLineColor} strokeWidth="1" />
          </pattern>
          <pattern id="grid-pattern-major" width={gridSize * 4} height={gridSize * 4} patternUnits="userSpaceOnUse">
            <rect width={gridSize * 4} height={gridSize * 4} fill="url(#grid-pattern-minor)" />
            <line x1="0" y1="0" x2={gridSize * 4} y2="0" stroke={gridMajorColor} strokeWidth="1.5" />
            <line x1="0" y1="0" x2="0" y2={gridSize * 4} stroke={gridMajorColor} strokeWidth="1.5" />
          </pattern>
        </defs>

        {/* Scaled and Panned Workspace Group */}
        <g transform={`translate(${panX}, ${panY}) scale(${zoom})`}>
          {/* 1. GRID BACKGROUND LAYER */}
          {layerVisibility.grid && (
            <rect
              id="grid-canvas-backing"
              x="-5000"
              y="-5000"
              width="10000"
              height="10000"
              fill="url(#grid-pattern-major)"
              className="pointer-events-none"
            />
          )}

          {/* 2. ROOM ZONES LAYER */}
          {layerVisibility.rooms &&
            plan.rooms.map((room) => {
              const isSelected = selectedElementId === room.id;
              return (
                <g key={room.id} id={`group-room-${room.id}`}>
                  <rect
                    id={`room-rect-${room.id}`}
                    x={room.x}
                    y={room.y}
                    width={room.width}
                    height={room.height}
                    fill={room.color}
                    stroke={isSelected ? '#10b981' : highContrast ? 'black' : 'rgba(59, 130, 246, 0.2)'}
                    strokeWidth={isSelected ? '2' : '1'}
                    strokeDasharray={isSelected ? '5 5' : 'none'}
                    onMouseDown={(e) => handleElementMouseDown(e, 'room', room.id)}
                    className="transition-colors hover:fill-emerald-500/5 cursor-pointer"
                  />

                  <text
                    x={room.x + room.width / 2}
                    y={room.y + room.height / 2 - 4}
                    textAnchor="middle"
                    className={`text-[11px] font-bold select-none pointer-events-none ${
                      highContrast ? 'fill-black' : 'fill-slate-800 dark:fill-slate-200'
                    }`}
                  >
                    {room.label}
                  </text>
                  <text
                    x={room.x + room.width / 2}
                    y={room.y + room.height / 2 + 10}
                    textAnchor="middle"
                    className="text-[9px] font-semibold opacity-80 pointer-events-none fill-slate-400 font-mono"
                  >
                    {(() => {
                      const metersX = room.width / 40;
                      const metersY = room.height / 40;
                      const areaM2 = metersX * metersY;
                      return unit === 'm' ? `${areaM2.toFixed(1)} m²` : `${(areaM2 * 10.7639).toFixed(0)} sq ft`;
                    })()}
                  </text>

                  {/* On-canvas Auto-Label suggestion chip when room is selected */}
                  {isSelected &&
                    (() => {
                      const suggestion = suggestRoomName(room, plan.furniture, unit);
                      if (suggestion.currentMatchesSuggestion) return null;

                      return (
                        <g
                          transform={`translate(${room.x + room.width / 2}, ${room.y + room.height / 2 + 28})`}
                          className="cursor-pointer"
                          onMouseDown={(e) => {
                            e.stopPropagation();
                            setPlan((prev) => ({
                              ...prev,
                              rooms: prev.rooms.map((r) =>
                                r.id === room.id ? { ...r, label: suggestion.suggestedName } : r
                              ),
                            }));
                            onStateChange();
                          }}
                        >
                          <rect
                            x="-60"
                            y="-10"
                            width="120"
                            height="20"
                            rx="10"
                            fill={highContrast ? '#ffffff' : '#047857'}
                            stroke="#10b981"
                            strokeWidth="1.5"
                            className="filter drop-shadow-md hover:opacity-90 transition-opacity"
                          />
                          <text
                            x="0"
                            y="3.5"
                            textAnchor="middle"
                            className={`text-[8.5px] font-bold select-none ${highContrast ? 'fill-black' : 'fill-white'}`}
                          >
                            ✨ Suggest: {suggestion.suggestedName}
                          </text>
                        </g>
                      );
                    })()}

                  {/* Resize Handle (bottom right corner) */}
                  {isSelected && (
                    <circle
                      cx={room.x + room.width}
                      cy={room.y + room.height}
                      r="6"
                      fill="#10b981"
                      stroke="white"
                      strokeWidth="1.5"
                      className="cursor-se-resize"
                      onMouseDown={(e) => handleRoomResizeStart(e, room.id)}
                    />
                  )}
                </g>
              );
            })}

          {/* 3. STRUCTURAL WALLS LAYER */}
          {layerVisibility.walls &&
            plan.walls.map((wall) => {
              const isSelected = selectedElementId === wall.id;
              return (
                <g key={wall.id} id={`group-wall-${wall.id}`}>
                  <line
                    id={`wall-line-${wall.id}`}
                    x1={wall.x1}
                    y1={wall.y1}
                    x2={wall.x2}
                    y2={wall.y2}
                    stroke={isSelected ? '#10b981' : highContrast ? 'black' : '#334155'}
                    strokeWidth={wall.thickness}
                    strokeLinecap="round"
                    onMouseDown={(e) => handleElementMouseDown(e, 'wall', wall.id)}
                    className="cursor-pointer transition-opacity hover:opacity-80"
                  />

                  {/* Real-time Length and Width labels on wall segments */}
                  {effectiveShowWallLabels ? (
                    (() => {
                      const len = getDistance({ x: wall.x1, y: wall.y1 }, { x: wall.x2, y: wall.y2 });
                      const { lengthStr, widthStr } = formatWallDimensions(len, wall.thickness, unit);

                      const midX = (wall.x1 + wall.x2) / 2;
                      const midY = (wall.y1 + wall.y2) / 2;
                      const dx = wall.x2 - wall.x1;
                      const dy = wall.y2 - wall.y1;
                      const angleRad = Math.atan2(dy, dx);
                      let angleDeg = (angleRad * 180) / Math.PI;

                      let normalSign = 1;
                      if (angleDeg > 90) {
                        angleDeg -= 180;
                        normalSign = -1;
                      } else if (angleDeg < -90) {
                        angleDeg += 180;
                        normalSign = -1;
                      }

                      const nx = -Math.sin(angleRad) * normalSign;
                      const ny = Math.cos(angleRad) * normalSign;
                      const offsetDist = Math.max(16, wall.thickness / 2 + 13);
                      const labelX = midX + nx * offsetDist;
                      const labelY = midY + ny * offsetDist;

                      return (
                        <g className="pointer-events-none select-none" id={`wall-lw-label-${wall.id}`}>
                          <line
                            x1={midX}
                            y1={midY}
                            x2={labelX}
                            y2={labelY}
                            stroke={highContrast ? '#000000' : isSelected ? '#10b981' : '#64748b'}
                            strokeWidth="0.75"
                            strokeDasharray="2 2"
                            opacity="0.7"
                          />
                          <g transform={`translate(${labelX}, ${labelY}) rotate(${angleDeg})`}>
                            <rect
                              x="-48"
                              y="-10"
                              width="96"
                              height="20"
                              rx="4"
                              fill={highContrast ? '#ffffff' : '#0f172a'}
                              stroke={highContrast ? '#000000' : isSelected ? '#10b981' : '#334155'}
                              strokeWidth={highContrast ? '1.5' : isSelected ? '1.5' : '1'}
                              opacity="0.96"
                              className="filter drop-shadow-sm"
                            />
                            <text
                              x="0"
                              y="3.5"
                              textAnchor="middle"
                              className="font-mono text-[8.5px] font-bold select-none tracking-tight"
                            >
                              <tspan fill={highContrast ? '#000000' : '#34d399'} fontWeight="800">
                                L:{' '}
                              </tspan>
                              <tspan fill={highContrast ? '#000000' : '#f8fafc'}>{lengthStr}</tspan>
                              <tspan fill={highContrast ? '#444444' : '#64748b'}> │ </tspan>
                              <tspan fill={highContrast ? '#000000' : '#38bdf8'} fontWeight="800">
                                W:{' '}
                              </tspan>
                              <tspan fill={highContrast ? '#000000' : '#f8fafc'}>{widthStr}</tspan>
                            </text>
                          </g>
                        </g>
                      );
                    })()
                  ) : (
                    layerVisibility.dimensions && (
                      <g className="pointer-events-none">
                        <rect
                          x={(wall.x1 + wall.x2) / 2 - 20}
                          y={(wall.y1 + wall.y2) / 2 - 8}
                          width="40"
                          height="16"
                          rx="3"
                          fill={highContrast ? 'white' : '#1e293b'}
                          className="opacity-95"
                        />
                        <text
                          x={(wall.x1 + wall.x2) / 2}
                          y={(wall.y1 + wall.y2) / 2 + 3}
                          textAnchor="middle"
                          className={`text-[8px] font-mono font-bold ${highContrast ? 'fill-black' : 'fill-slate-100'}`}
                        >
                          {(() => {
                            const len = getDistance({ x: wall.x1, y: wall.y1 }, { x: wall.x2, y: wall.y2 });
                            return formatDimension(len, unit);
                          })()}
                        </text>
                      </g>
                    )
                  )}

                  {/* Drag joints handles at wall endpoints */}
                  {isSelected && (
                    <>
                      <circle
                        cx={wall.x1}
                        cy={wall.y1}
                        r="6"
                        fill="#ef4444"
                        stroke="white"
                        strokeWidth="1.5"
                        className="cursor-move"
                        onMouseDown={(e) => handleJointDragStart(e, wall.id, 'p1')}
                      />
                      <circle
                        cx={wall.x2}
                        cy={wall.y2}
                        r="6"
                        fill="#ef4444"
                        stroke="white"
                        strokeWidth="1.5"
                        className="cursor-move"
                        onMouseDown={(e) => handleJointDragStart(e, wall.id, 'p2')}
                      />
                    </>
                  )}
                </g>
              );
            })}

          {/* 4. DOORS & WINDOWS (OPENINGS) LAYER */}
          {layerVisibility.openings &&
            plan.openings.map((op) => {
              const isSelected = selectedElementId === op.id;

              return (
                <g
                  key={op.id}
                  id={`group-op-${op.id}`}
                  transform={`translate(${op.x}, ${op.y}) rotate(${op.rotation})`}
                  onMouseDown={(e) => handleElementMouseDown(e, 'opening', op.id)}
                  className="cursor-pointer"
                >
                  {op.type === 'window' ? (
                    <>
                      <rect
                        x={-op.width / 2}
                        y="-4"
                        width={op.width}
                        height="8"
                        fill={highContrast ? 'white' : '#cbd5e1'}
                        stroke={isSelected ? '#10b981' : highContrast ? 'black' : '#475569'}
                        strokeWidth="1.5"
                      />
                      <line
                        x1={-op.width / 2}
                        y1="0"
                        x2={op.width / 2}
                        y2="0"
                        stroke={highContrast ? 'black' : '#38bdf8'}
                        strokeWidth="1.5"
                      />
                    </>
                  ) : (
                    <>
                      <circle cx="0" cy="0" r="3" fill={highContrast ? 'black' : '#475569'} />
                      <line
                        x1="0"
                        y1="0"
                        x2={op.width}
                        y2="0"
                        stroke={isSelected ? '#10b981' : highContrast ? 'black' : '#b45309'}
                        strokeWidth="3.5"
                        transform={op.flipSwing ? 'scale(1, -1)' : 'none'}
                      />
                      <path
                        d={`M ${op.width} 0 A ${op.width} ${op.width} 0 0 1 0 ${op.width}`}
                        fill="none"
                        stroke={highContrast ? 'black' : 'rgba(148, 163, 184, 0.6)'}
                        strokeWidth="1"
                        strokeDasharray="3 3"
                        transform={op.flipSwing ? 'scale(1, -1)' : 'none'}
                      />
                    </>
                  )}

                  {isSelected && (
                    <rect
                      x={-op.width / 2 - 4}
                      y="-10"
                      width={op.width + 8}
                      height="20"
                      fill="none"
                      stroke="#10b981"
                      strokeWidth="1.5"
                      strokeDasharray="4 4"
                    />
                  )}
                </g>
              );
            })}

          {/* 5. FURNITURE & DECOR LAYER */}
          {layerVisibility.furniture &&
            plan.furniture.map((furn) => {
              const isSelected = selectedElementId === furn.id;

              return (
                <g
                  key={furn.id}
                  id={`group-furn-${furn.id}`}
                  transform={`translate(${furn.x}, ${furn.y}) rotate(${furn.rotation})`}
                  onMouseDown={(e) => handleElementMouseDown(e, 'furniture', furn.id)}
                  className="cursor-pointer"
                >
                  {furn.subType === 'sofa' ? (
                    <g>
                      <rect
                        x={-furn.width / 2}
                        y={-furn.height / 2}
                        width={furn.width}
                        height={furn.height}
                        rx="4"
                        fill={highContrast ? 'white' : '#f1f5f9'}
                        stroke={isSelected ? '#10b981' : highContrast ? 'black' : '#94a3b8'}
                        strokeWidth="1.5"
                      />
                      <line
                        x1={-furn.width / 6}
                        y1={-furn.height / 2}
                        x2={-furn.width / 6}
                        y2={furn.height / 2 - 6}
                        stroke="#cbd5e1"
                        strokeWidth="1"
                      />
                      <line
                        x1={furn.width / 6}
                        y1={-furn.height / 2}
                        x2={furn.width / 6}
                        y2={furn.height / 2 - 6}
                        stroke="#cbd5e1"
                        strokeWidth="1"
                      />
                      <rect
                        x={-furn.width / 2 + 3}
                        y={furn.height / 2 - 6}
                        width={furn.width - 6}
                        height="4"
                        rx="1"
                        fill="#e2e8f0"
                      />
                    </g>
                  ) : furn.subType === 'bed' ? (
                    <g>
                      <rect
                        x={-furn.width / 2}
                        y={-furn.height / 2}
                        width={furn.width}
                        height={furn.height}
                        rx="3"
                        fill={highContrast ? 'white' : '#f8fafc'}
                        stroke={isSelected ? '#10b981' : highContrast ? 'black' : '#94a3b8'}
                        strokeWidth="1.5"
                      />
                      <line
                        x1={-furn.width / 2}
                        y1={furn.height / 6}
                        x2={furn.width / 2}
                        y2={furn.height / 6}
                        stroke="#cbd5e1"
                        strokeWidth="1.2"
                      />
                      <rect
                        x={-furn.width / 2.4}
                        y={-furn.height / 2.5}
                        width={furn.width / 3}
                        height="12"
                        rx="2"
                        fill="#e2e8f0"
                      />
                      <rect
                        x={furn.width / 12}
                        y={-furn.height / 2.5}
                        width={furn.width / 3}
                        height="12"
                        rx="2"
                        fill="#e2e8f0"
                      />
                    </g>
                  ) : (
                    <g>
                      <rect
                        x={-furn.width / 2}
                        y={-furn.height / 2}
                        width={furn.width}
                        height={furn.height}
                        rx="2"
                        fill={highContrast ? 'white' : '#f1f5f9'}
                        stroke={isSelected ? '#10b981' : highContrast ? 'black' : '#94a3b8'}
                        strokeWidth="1.5"
                      />
                      <line
                        x1={-furn.width / 2}
                        y1={-furn.height / 2}
                        x2={furn.width / 2}
                        y2={furn.height / 2}
                        stroke="rgba(148, 163, 184, 0.2)"
                        strokeWidth="1"
                      />
                    </g>
                  )}

                  <text
                    x="0"
                    y="3"
                    textAnchor="middle"
                    className={`text-[8px] font-semibold tracking-tight uppercase select-none pointer-events-none ${
                      highContrast ? 'fill-black' : 'fill-slate-500'
                    }`}
                  >
                    {furn.label}
                  </text>

                  {isSelected && (
                    <rect
                      x={-furn.width / 2 - 5}
                      y={-furn.height / 2 - 5}
                      width={furn.width + 10}
                      height={furn.height + 10}
                      fill="none"
                      stroke="#10b981"
                      strokeWidth="1.5"
                      strokeDasharray="4 4"
                    />
                  )}
                </g>
              );
            })}

          {/* 6. WALL DRAWING LIVE PREVIEW */}
          {activeTool === 'wall' && isDrawingWall && wallStartPoint && (
            <g id="live-wall-drawing-preview">
              <line
                x1={wallStartPoint.x}
                y1={wallStartPoint.y}
                x2={currentMousePoint.x}
                y2={currentMousePoint.y}
                stroke="#10b981"
                strokeWidth="10"
                strokeLinecap="round"
                className="opacity-60"
              />
              <circle cx={wallStartPoint.x} cy={wallStartPoint.y} r="5" fill="#10b981" />
              <circle cx={currentMousePoint.x} cy={currentMousePoint.y} r="5" fill="#10b981" />

              {(() => {
                const len = getDistance(wallStartPoint, currentMousePoint);
                const liveDims = formatWallDimensions(len, 10, unit);
                return (
                  <g
                    transform={`translate(${(wallStartPoint.x + currentMousePoint.x) / 2}, ${
                      (wallStartPoint.y + currentMousePoint.y) / 2 - 18
                    })`}
                  >
                    <rect
                      x="-52"
                      y="-11"
                      width="104"
                      height="22"
                      rx="4"
                      fill="#047857"
                      stroke="#34d399"
                      strokeWidth="1.5"
                      className="filter drop-shadow-md"
                    />
                    <text x="0" y="3.5" textAnchor="middle" className="fill-white text-[9px] font-mono font-bold">
                      <tspan fill="#a7f3d0">L: </tspan>
                      {liveDims.lengthStr}
                      <tspan fill="#6ee7b7"> │ </tspan>
                      <tspan fill="#7dd3fc">W: </tspan>
                      {liveDims.widthStr}
                    </text>
                  </g>
                );
              })()}
            </g>
          )}

          {/* 7. PALETTE ELEMENT FLOATING PREVIEW */}
          {selectedPaletteItem && (
            <g id="palette-floating-preview" opacity="0.5" className="pointer-events-none">
              {selectedPaletteItem.type === 'room' && (
                <rect
                  x={currentMousePoint.x - (selectedPaletteItem.width || 120) / 2}
                  y={currentMousePoint.y - (selectedPaletteItem.height || 80) / 2}
                  width={selectedPaletteItem.width || 120}
                  height={selectedPaletteItem.height || 80}
                  fill="rgba(16, 185, 129, 0.2)"
                  stroke="#10b981"
                  strokeWidth="2"
                  strokeDasharray="4 4"
                />
              )}
              {selectedPaletteItem.type === 'opening' && (
                <circle
                  cx={currentMousePoint.x}
                  cy={currentMousePoint.y}
                  r={(selectedPaletteItem.width || 32) / 2}
                  fill="rgba(14, 165, 233, 0.2)"
                  stroke="#0284c7"
                  strokeWidth="2"
                  strokeDasharray="4 4"
                />
              )}
              {selectedPaletteItem.type === 'furniture' && (
                <rect
                  x={currentMousePoint.x - (selectedPaletteItem.width || 40) / 2}
                  y={currentMousePoint.y - (selectedPaletteItem.height || 40) / 2}
                  width={selectedPaletteItem.width || 40}
                  height={selectedPaletteItem.height || 40}
                  fill="rgba(245, 158, 11, 0.2)"
                  stroke="#f59e0b"
                  strokeWidth="2"
                  strokeDasharray="4 4"
                />
              )}
            </g>
          )}

          {/* 7b. Measurement tapes (draft first so committed ones draw on top) */}
          {[...(measureDraft ? [measureDraft] : []), ...measurements].map((m, i) => {
            const isDraft = m.id === 'draft';
            const midX = (m.x1 + m.x2) / 2;
            const midY = (m.y1 + m.y2) / 2;
            const length = getDistance({ x: m.x1, y: m.y1 }, { x: m.x2, y: m.y2 });
            const label = formatDimension(length, unit);
            const stroke = isDraft ? '#f59e0b' : '#0ea5e9';

            return (
              <g key={m.id + i} className="pointer-events-none">
                <line
                  x1={m.x1}
                  y1={m.y1}
                  x2={m.x2}
                  y2={m.y2}
                  stroke={stroke}
                  strokeWidth={2 / zoom}
                  strokeDasharray={isDraft ? `${6 / zoom} ${4 / zoom}` : undefined}
                  strokeLinecap="round"
                />
                {/* End ticks, drawn perpendicular to the tape. */}
                {[0, 1].map((end) => {
                  const px = end === 0 ? m.x1 : m.x2;
                  const py = end === 0 ? m.y1 : m.y2;
                  const dx = m.x2 - m.x1;
                  const dy = m.y2 - m.y1;
                  const len = Math.hypot(dx, dy) || 1;
                  const nx = -dy / len;
                  const ny = dx / len;
                  const tick = 7 / zoom;
                  return (
                    <line
                      key={end}
                      x1={px - nx * tick}
                      y1={py - ny * tick}
                      x2={px + nx * tick}
                      y2={py + ny * tick}
                      stroke={stroke}
                      strokeWidth={2 / zoom}
                      strokeLinecap="round"
                    />
                  );
                })}
                <g transform={`translate(${midX}, ${midY})`}>
                  <rect
                    x={-30 / zoom}
                    y={-11 / zoom}
                    width={60 / zoom}
                    height={20 / zoom}
                    rx={4 / zoom}
                    fill={isDraft ? '#b45309' : '#0369a1'}
                    stroke={stroke}
                    strokeWidth={1.5 / zoom}
                  />
                  <text
                    x={0}
                    y={4 / zoom}
                    textAnchor="middle"
                    fontSize={11 / zoom}
                    className="fill-white font-mono font-bold"
                  >
                    {label}
                  </text>
                </g>
              </g>
            );
          })}

          {/* 8. SNAPPED TARGET HIGHLIGHT GLOW */}
          {snappedGuide && activeTool !== 'measure' && (
            <circle
              cx={snappedGuide.x}
              cy={snappedGuide.y}
              r="4"
              fill="none"
              stroke="#ef4444"
              strokeWidth="2"
              className="pointer-events-none animate-ping"
            />
          )}
        </g>
      </svg>
    </div>
  );
}
