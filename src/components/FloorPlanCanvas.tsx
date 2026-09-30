/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef, useState, useEffect } from 'react';
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
  LayerVisibility
} from '../types';
import { 
  getSmartSnap, 
  snapOpeningToWalls, 
  formatDimension, 
  formatWallDimensions,
  getDistance,
  getClosestPointOnSegment
} from '../utils/geoUtils';
import { suggestRoomName } from '../utils/roomAutoLabeler';

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
  setZoom: (z: number) => void;
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
  showWallLabels?: boolean;
  setShowWallLabels?: (val: boolean | ((prev: boolean) => boolean)) => void;
  onStateChange: () => void; // Push history
}

export default function FloorPlanCanvas({
  plan,
  setPlan,
  selectedElementId,
  selectedElementType,
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
  showWallLabels,
  setShowWallLabels,
  onStateChange
}: FloorPlanCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  // Local fallback toggle for real-time wall L×W labels
  const [localShowWallLabels, setLocalShowWallLabels] = useState(true);
  const effectiveShowWallLabels = showWallLabels !== undefined 
    ? showWallLabels 
    : (layerVisibility?.wallLabels !== undefined ? layerVisibility.wallLabels : localShowWallLabels);

  const toggleWallLabels = () => {
    if (setShowWallLabels) {
      setShowWallLabels(!effectiveShowWallLabels);
    } else {
      setLocalShowWallLabels(!effectiveShowWallLabels);
    }
  };

  // Interaction State
  const [isDrawingWall, setIsDrawingWall] = useState(false);
  const [wallStartPoint, setWallStartPoint] = useState<Point | null>(null);
  const [currentMousePoint, setCurrentMousePoint] = useState<Point>({ x: 0, y: 0 });
  const [isDraggingCanvas, setIsDraggingCanvas] = useState(false);
  const [dragStartMouse, setDragStartMouse] = useState<Point>({ x: 0, y: 0 });
  const [dragStartPan, setDragStartPan] = useState<Point>({ x: 0, y: 0 });

  // Element Dragging State
  const [isDraggingElement, setIsDraggingElement] = useState(false);
  const [draggedElementId, setDraggedElementId] = useState<string | null>(null);
  const [draggedElementType, setDraggedElementType] = useState<'room' | 'opening' | 'furniture' | 'joint' | 'room-resize' | null>(null);
  const [dragOffset, setDragOffset] = useState<Point>({ x: 0, y: 0 });
  
  // Specific joint dragging
  const [activeJointWallId, setActiveJointWallId] = useState<string | null>(null);
  const [activeJointType, setActiveJointType] = useState<'p1' | 'p2' | null>(null);

  // Track hover guides
  const [snappedGuide, setSnappedGuide] = useState<Point | null>(null);

  // Esc key cancels active tool or placement
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsDrawingWall(false);
        setWallStartPoint(null);
        setSelectedPaletteItem(null);
        setActiveTool('select');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Convert client cursor coordinate to canvas grid coordinate (considering zoom, pan, grid offset)
  const getCanvasCoords = (clientX: number, clientY: number): Point => {
    if (!svgRef.current) return { x: 0, y: 0 };
    const rect = svgRef.current.getBoundingClientRect();
    const x = (clientX - rect.left - panX) / zoom;
    const y = (clientY - rect.top - panY) / zoom;
    return { x, y };
  };

  // Drag start
  const handleMouseDown = (e: React.MouseEvent<SVGSVGElement>) => {
    // 1. Right click or middle click drags the canvas pan
    if (e.button === 1 || e.button === 2 || activeTool === 'measure') {
      setIsDraggingCanvas(true);
      setDragStartMouse({ x: e.clientX, y: e.clientY });
      setDragStartPan({ x: panX, y: panY });
      e.preventDefault();
      return;
    }

    const coords = getCanvasCoords(e.clientX, e.clientY);
    const snapped = getSmartSnap(coords, plan.walls, gridSize, { snapToGrid, snapToElements });

    // 2. Drawing Wall
    if (activeTool === 'wall') {
      if (!isDrawingWall) {
        setIsDrawingWall(true);
        setWallStartPoint(snapped);
        setCurrentMousePoint(snapped);
      } else {
        // Complete current wall segment, and chain the next one!
        if (wallStartPoint && (snapped.x !== wallStartPoint.x || snapped.y !== wallStartPoint.y)) {
          const newWall: Wall = {
            id: `wall-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
            x1: wallStartPoint.x,
            y1: wallStartPoint.y,
            x2: snapped.x,
            y2: snapped.y,
            thickness: 10
          };
          setPlan(prev => ({
            ...prev,
            walls: [...prev.walls, newWall]
          }));
          onStateChange();
          // Chain start of next wall
          setWallStartPoint(snapped);
        }
      }
      return;
    }

    // 3. Stamping Palette Elements
    if (selectedPaletteItem) {
      const id = `${selectedPaletteItem.type}-${Date.now()}`;
      if (selectedPaletteItem.type === 'room') {
        const newRoom: Room = {
          id,
          x: snapped.x - (selectedPaletteItem.width || 120) / 2,
          y: snapped.y - (selectedPaletteItem.height || 80) / 2,
          width: selectedPaletteItem.width || 120,
          height: selectedPaletteItem.height || 80,
          label: selectedPaletteItem.label,
          color: 'rgba(59, 130, 246, 0.08)'
        };
        setPlan(prev => ({ ...prev, rooms: [...prev.rooms, newRoom] }));
      } else if (selectedPaletteItem.type === 'opening') {
        // Snapped to walls
        const snapRes = snapOpeningToWalls(coords, plan.walls);
        const newOpening: Opening = {
          id,
          type: selectedPaletteItem.subType === 'standard' || selectedPaletteItem.subType === 'large' || selectedPaletteItem.subType === 'bay' ? 'window' : 'door',
          subType: selectedPaletteItem.subType,
          x: snapRes.point.x,
          y: snapRes.point.y,
          width: selectedPaletteItem.width || 32,
          rotation: snapRes.rotation,
          wallId: snapRes.wallId,
          wallOffset: snapRes.offset,
          flipSwing: false
        };
        setPlan(prev => ({ ...prev, openings: [...prev.openings, newOpening] }));
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
          category: 'living'
        };
        setPlan(prev => ({ ...prev, furniture: [...prev.furniture, newFurn] }));
      }
      onStateChange();
      setSelectedPaletteItem(null); // Reset placement mode
      setActiveTool('select');
      return;
    }

    // 4. Normal interaction
    // Clicked empty space to deselect
    if (e.target === svgRef.current) {
      setSelectedElementId(null);
      setSelectedElementType(null);
      
      // Start dragging canvas if left click and select tool
      if (activeTool === 'select' && e.button === 0) {
        setIsDraggingCanvas(true);
        setDragStartMouse({ x: e.clientX, y: e.clientY });
        setDragStartPan({ x: panX, y: panY });
      }
    }
  };

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const coords = getCanvasCoords(e.clientX, e.clientY);
    const snapped = getSmartSnap(coords, plan.walls, gridSize, { snapToGrid, snapToElements });
    setCurrentMousePoint(snapped);

    // Live snap feedback indicator
    if (snapToGrid || snapToElements) {
      setSnappedGuide(snapped);
    } else {
      setSnappedGuide(null);
    }

    // 1. Pan canvas drag
    if (isDraggingCanvas) {
      const dx = e.clientX - dragStartMouse.x;
      const dy = e.clientY - dragStartMouse.y;
      setPanX(dragStartPan.x + dx);
      setPanY(dragStartPan.y + dy);
      return;
    }

    // 2. Drag Elements (Rooms, Openings, Furniture, Wall joints, room-resize)
    if (isDraggingElement && draggedElementId && draggedElementType) {
      if (draggedElementType === 'room') {
        setPlan(prev => ({
          ...prev,
          rooms: prev.rooms.map(rm => 
            rm.id === draggedElementId 
              ? { ...rm, x: snapped.x - dragOffset.x, y: snapped.y - dragOffset.y } 
              : rm
          )
        }));
      } else if (draggedElementType === 'furniture') {
        setPlan(prev => ({
          ...prev,
          furniture: prev.furniture.map(fn => 
            fn.id === draggedElementId 
              ? { ...fn, x: snapped.x, y: snapped.y } 
              : fn
          )
        }));
      } else if (draggedElementType === 'opening') {
        // Sliding opening on wall
        const snapRes = snapOpeningToWalls(coords, plan.walls);
        setPlan(prev => ({
          ...prev,
          openings: prev.openings.map(op => 
            op.id === draggedElementId 
              ? { 
                  ...op, 
                  x: snapRes.point.x, 
                  y: snapRes.point.y, 
                  rotation: snapRes.rotation, 
                  wallId: snapRes.wallId, 
                  wallOffset: snapRes.offset 
                } 
              : op
          )
        }));
      } else if (draggedElementType === 'joint' && activeJointWallId && activeJointType) {
        // Dragging wall endpoints
        setPlan(prev => ({
          ...prev,
          walls: prev.walls.map(w => {
            if (w.id === activeJointWallId) {
              if (activeJointType === 'p1') {
                return { ...w, x1: snapped.x, y1: snapped.y };
              } else {
                return { ...w, x2: snapped.x, y2: snapped.y };
              }
            }
            return w;
          })
        }));
      } else if (draggedElementType === 'room-resize') {
        // Resizing a Room
        setPlan(prev => ({
          ...prev,
          rooms: prev.rooms.map(rm => {
            if (rm.id === draggedElementId) {
              const newW = Math.max(40, snapped.x - rm.x);
              const newH = Math.max(40, snapped.y - rm.y);
              return { ...rm, width: newW, height: newH };
            }
            return rm;
          })
        }));
      }
    }
  };

  const handleMouseUp = () => {
    if (isDraggingCanvas) {
      setIsDraggingCanvas(false);
    }
    if (isDraggingElement) {
      setIsDraggingElement(false);
      setDraggedElementId(null);
      setDraggedElementType(null);
      setActiveJointWallId(null);
      setActiveJointType(null);
      onStateChange(); // Save final positioned state
    }
  };

  // Double click wall segment to finish wall segment or deselect drawing
  const handleDoubleClick = () => {
    if (isDrawingWall) {
      setIsDrawingWall(false);
      setWallStartPoint(null);
    }
  };

  // Helper: Element Select and Delete
  const handleElementClick = (e: React.MouseEvent, type: 'wall' | 'room' | 'opening' | 'furniture', id: string) => {
    e.stopPropagation();

    // Eraser active? Delete immediately
    if (activeTool === 'delete') {
      if (type === 'wall') {
        setPlan(prev => ({ ...prev, walls: prev.walls.filter(w => w.id !== id) }));
      } else if (type === 'room') {
        setPlan(prev => ({ ...prev, rooms: prev.rooms.filter(r => r.id !== id) }));
      } else if (type === 'opening') {
        setPlan(prev => ({ ...prev, openings: prev.openings.filter(o => o.id !== id) }));
      } else if (type === 'furniture') {
        setPlan(prev => ({ ...prev, furniture: prev.furniture.filter(f => f.id !== id) }));
      }
      setSelectedElementId(null);
      setSelectedElementType(null);
      onStateChange();
      return;
    }

    if (activeTool === 'select') {
      setSelectedElementId(id);
      setSelectedElementType(type);
      
      // Start drag offset mapping
      const coords = getCanvasCoords(e.clientX, e.clientY);
      
      if (type === 'room') {
        const rm = plan.rooms.find(r => r.id === id);
        if (rm) {
          setIsDraggingElement(true);
          setDraggedElementId(id);
          setDraggedElementType('room');
          setDragOffset({ x: coords.x - rm.x, y: coords.y - rm.y });
        }
      } else if (type === 'furniture') {
        setIsDraggingElement(true);
        setDraggedElementId(id);
        setDraggedElementType('furniture');
      } else if (type === 'opening') {
        setIsDraggingElement(true);
        setDraggedElementId(id);
        setDraggedElementType('opening');
      }
    }
  };

  // Initiate wall joint dragging
  const handleJointDragStart = (e: React.MouseEvent, wallId: string, type: 'p1' | 'p2') => {
    e.stopPropagation();
    setIsDraggingElement(true);
    setDraggedElementId(wallId);
    setDraggedElementType('joint');
    setActiveJointWallId(wallId);
    setActiveJointType(type);
  };

  // Initiate room resizing
  const handleRoomResizeStart = (e: React.MouseEvent, roomId: string) => {
    e.stopPropagation();
    setIsDraggingElement(true);
    setDraggedElementId(roomId);
    setDraggedElementType('room-resize');
  };

  // Zoom to Mouse Scroll wheel
  const handleWheel = (e: React.WheelEvent<SVGSVGElement>) => {
    e.preventDefault();
    const scaleFactor = 1.1;
    const nextZoom = e.deltaY < 0 ? zoom * scaleFactor : zoom / scaleFactor;
    setZoom(Math.max(0.4, Math.min(2.5, nextZoom)));
  };

  // Color theme logic
  const gridLineColor = highContrast 
    ? 'rgba(0, 0, 0, 0.15)' 
    : 'rgba(51, 65, 85, 0.05)';
  const gridMajorColor = highContrast 
    ? 'rgba(0, 0, 0, 0.3)' 
    : 'rgba(51, 65, 85, 0.1)';

  const canvasBackground = highContrast
    ? 'bg-white'
    : 'bg-[#fafaf9] dark:bg-slate-950';

  return (
    <div 
      id="floor-plan-editor-stage"
      ref={containerRef}
      className={`flex-1 relative overflow-hidden select-none outline-none ${canvasBackground}`}
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* 1. Measurement guide/instructions overlay */}
      <div className="absolute top-3 left-3 bg-white/90 dark:bg-slate-900/90 backdrop-blur-xs p-2 rounded border border-slate-200 dark:border-slate-800 text-[10px] space-y-0.5 pointer-events-none z-10 font-medium">
        <div className="flex items-center gap-1.5 text-slate-700 dark:text-slate-300">
          <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block animate-pulse" />
          <span>Active Mode: <strong className="font-semibold uppercase text-emerald-600 dark:text-emerald-400">{activeTool}</strong></span>
        </div>
        <p className="text-slate-400">
          {activeTool === 'wall' && 'Click to start drawing a wall. Double click to finish segment.'}
          {activeTool === 'select' && 'Drag furniture & doors to move. Drag red endpoints to stretch walls.'}
          {activeTool === 'measure' && 'Hold middle click or drag canvas.'}
          {activeTool === 'delete' && 'Click elements to delete.'}
        </p>
      </div>

      {/* Real-Time Canvas Wall L×W Quick Toggle HUD */}
      <div className="absolute top-3 right-3 flex items-center gap-2 z-10">
        <button
          id="canvas-toggle-wall-labels"
          type="button"
          onClick={toggleWallLabels}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 shadow-lg backdrop-blur-md transition-all cursor-pointer border ${
            effectiveShowWallLabels 
              ? highContrast 
                ? 'bg-black text-white border-black font-bold' 
                : 'bg-slate-900/90 hover:bg-slate-900 text-white border-emerald-500/50 shadow-emerald-950/30 ring-1 ring-emerald-500/30' 
              : highContrast
                ? 'bg-white text-black border-black font-bold'
                : 'bg-slate-900/80 hover:bg-slate-800 text-slate-300 border-slate-700/60'
          }`}
          title={effectiveShowWallLabels ? "Hide real-time wall length & width labels on canvas" : "Show real-time wall length & width labels on canvas"}
        >
          <Ruler className={`w-3.5 h-3.5 ${effectiveShowWallLabels ? 'text-emerald-400' : 'text-slate-400'}`} />
          <span className="font-medium">Wall L×W Labels</span>
          <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono font-bold uppercase transition-colors ${
            effectiveShowWallLabels 
              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' 
              : 'bg-slate-800 text-slate-400 border border-slate-700'
          }`}>
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
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onWheel={handleWheel}
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
          {layerVisibility.rooms && plan.rooms.map((room) => {
            const isSelected = selectedElementId === room.id;
            return (
              <g key={room.id} id={`group-room-${room.id}`}>
                {/* Background area block */}
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
                  onClick={(e) => handleElementClick(e, 'room', room.id)}
                  className="transition-colors hover:fill-emerald-500/5 cursor-pointer"
                />

                {/* Central Labels & Square Foot Calculated Labels */}
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
                    return unit === 'm' 
                      ? `${areaM2.toFixed(1)} m²` 
                      : `${(areaM2 * 10.7639).toFixed(0)} sq ft`;
                  })()}
                </text>

                {/* On-canvas Auto-Label suggestion chip when room is selected */}
                {isSelected && (() => {
                  const suggestion = suggestRoomName(room, plan.furniture, unit);
                  if (suggestion.currentMatchesSuggestion) return null;

                  return (
                    <g 
                      transform={`translate(${room.x + room.width / 2}, ${room.y + room.height / 2 + 28})`}
                      className="cursor-pointer"
                      onClick={(e) => {
                        e.stopPropagation();
                        setPlan(prev => ({
                          ...prev,
                          rooms: prev.rooms.map(r => r.id === room.id ? { ...r, label: suggestion.suggestedName } : r)
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
          {layerVisibility.walls && plan.walls.map((wall) => {
            const isSelected = selectedElementId === wall.id;
            return (
              <g key={wall.id} id={`group-wall-${wall.id}`}>
                {/* Thick architectural wall line */}
                <line
                  id={`wall-line-${wall.id}`}
                  x1={wall.x1}
                  y1={wall.y1}
                  x2={wall.x2}
                  y2={wall.y2}
                  stroke={isSelected ? '#10b981' : highContrast ? 'black' : '#334155'}
                  strokeWidth={wall.thickness}
                  strokeLinecap="round"
                  onClick={(e) => handleElementClick(e, 'wall', wall.id)}
                  className="cursor-pointer transition-opacity hover:opacity-80"
                />

                {/* Real-time Length and Width labels on wall segments */}
                {effectiveShowWallLabels ? (() => {
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

                  // Normal perpendicular vector to offset badge away from the wall stroke
                  const nx = -Math.sin(angleRad) * normalSign;
                  const ny = Math.cos(angleRad) * normalSign;
                  const offsetDist = Math.max(16, wall.thickness / 2 + 13);
                  const labelX = midX + nx * offsetDist;
                  const labelY = midY + ny * offsetDist;

                  return (
                    <g className="pointer-events-none select-none" id={`wall-lw-label-${wall.id}`}>
                      {/* Subtle leader tick connecting wall center to label badge */}
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
                      {/* Rotated badge container */}
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
                          <tspan fill={highContrast ? '#000000' : '#34d399'} fontWeight="800">L: </tspan>
                          <tspan fill={highContrast ? '#000000' : '#f8fafc'}>{lengthStr}</tspan>
                          <tspan fill={highContrast ? '#444444' : '#64748b'}> │ </tspan>
                          <tspan fill={highContrast ? '#000000' : '#38bdf8'} fontWeight="800">W: </tspan>
                          <tspan fill={highContrast ? '#000000' : '#f8fafc'}>{widthStr}</tspan>
                        </text>
                      </g>
                    </g>
                  );
                })() : layerVisibility.dimensions && (
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
                      className={`text-[8px] font-mono font-bold ${
                        highContrast ? 'fill-black' : 'fill-slate-100'
                      }`}
                    >
                      {(() => {
                        const len = getDistance({ x: wall.x1, y: wall.y1 }, { x: wall.x2, y: wall.y2 });
                        return formatDimension(len, unit);
                      })()}
                    </text>
                  </g>
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
                      className="cursor-move animate-ping absolute"
                    />
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
          {layerVisibility.openings && plan.openings.map((op) => {
            const isSelected = selectedElementId === op.id;
            
            // Render specific geometric representation
            return (
              <g 
                key={op.id} 
                id={`group-op-${op.id}`}
                transform={`translate(${op.x}, ${op.y}) rotate(${op.rotation})`}
                onClick={(e) => handleElementClick(e, 'opening', op.id)}
                className="cursor-pointer"
              >
                {/* 1. Window architectural block representation */}
                {op.type === 'window' ? (
                  <>
                    {/* Outline bounding box */}
                    <rect
                      x={-op.width / 2}
                      y="-4"
                      width={op.width}
                      height="8"
                      fill={highContrast ? 'white' : '#cbd5e1'}
                      stroke={isSelected ? '#10b981' : highContrast ? 'black' : '#475569'}
                      strokeWidth="1.5"
                    />
                    {/* Glass double line representation */}
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
                  // 2. Door 90-degree swing representation
                  <>
                    {/* Door hinge node */}
                    <circle cx="0" cy="0" r="3" fill={highContrast ? 'black' : '#475569'} />
                    {/* Door leaf wood block */}
                    <line
                      x1="0"
                      y1="0"
                      x2={op.width}
                      y2="0"
                      stroke={isSelected ? '#10b981' : highContrast ? 'black' : '#b45309'}
                      strokeWidth="3.5"
                      transform={op.flipSwing ? 'scale(1, -1)' : 'none'}
                    />
                    {/* Door swing arc path */}
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

                {/* Selection Halo */}
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
          {layerVisibility.furniture && plan.furniture.map((furn) => {
            const isSelected = selectedElementId === furn.id;
            
            return (
              <g
                key={furn.id}
                id={`group-furn-${furn.id}`}
                transform={`translate(${furn.x}, ${furn.y}) rotate(${furn.rotation})`}
                onClick={(e) => handleElementClick(e, 'furniture', furn.id)}
                className="cursor-pointer"
              >
                {/* Visual rendering of specific furniture subtypes */}
                {furn.subType === 'sofa' ? (
                  // Elegant vector sofa block
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
                    {/* Cushions separators */}
                    <line x1={-furn.width / 6} y1={-furn.height / 2} x2={-furn.width / 6} y2={furn.height / 2 - 6} stroke="#cbd5e1" strokeWidth="1" />
                    <line x1={furn.width / 6} y1={-furn.height / 2} x2={furn.width / 6} y2={furn.height / 2 - 6} stroke="#cbd5e1" strokeWidth="1" />
                    {/* Backrest cushion */}
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
                  // Cozy bed with pillows
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
                    {/* Folded Sheet outline */}
                    <line x1={-furn.width / 2} y1={furn.height / 6} x2={furn.width / 2} y2={furn.height / 6} stroke="#cbd5e1" strokeWidth="1.2" />
                    {/* Pillows */}
                    <rect x={-furn.width / 2.4} y={-furn.height / 2.5} width={furn.width / 3} height="12" rx="2" fill="#e2e8f0" />
                    <rect x={furn.width / 12} y={-furn.height / 2.5} width={furn.width / 3} height="12" rx="2" fill="#e2e8f0" />
                  </g>
                ) : (
                  // Generic decorative rectangle with beautiful architectural diagonal stroke
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

                {/* Subtype visual labels */}
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

                {/* Selection dashed halo */}
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

              {/* Live dimension calculations (real-time Length & Width) */}
              {(() => {
                const len = getDistance(wallStartPoint, currentMousePoint);
                const liveDims = formatWallDimensions(len, 10, unit);
                return (
                  <g transform={`translate(${(wallStartPoint.x + currentMousePoint.x) / 2}, ${(wallStartPoint.y + currentMousePoint.y) / 2 - 18})`}>
                    <rect x="-52" y="-11" width="104" height="22" rx="4" fill="#047857" stroke="#34d399" strokeWidth="1.5" className="filter drop-shadow-md" />
                    <text x="0" y="3.5" textAnchor="middle" className="fill-white text-[9px] font-mono font-bold">
                      <tspan fill="#a7f3d0">L: </tspan>{liveDims.lengthStr}
                      <tspan fill="#6ee7b7"> │ </tspan>
                      <tspan fill="#7dd3fc">W: </tspan>{liveDims.widthStr}
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
                  r={selectedPaletteItem.width / 2}
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

          {/* 8. SNAPPED TARGET HIGHLIGHT GLOW */}
          {snappedGuide && (
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
