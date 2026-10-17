/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { createXRStore, XR, useXRHitTest, XRDomOverlay } from '@react-three/xr';
import { ContactShadows, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { FloorPlanData } from '../types';
import { PIXELS_PER_METER } from '../utils/geoUtils';
import { X, RotateCcw, Crosshair, ArrowDownToLine, Info, Camera, Scale, Minus, Plus, Box } from 'lucide-react';

/**
 * Module-scope XR store.
 *
 * Note this is created at import time, which is why ARViewer is lazy-loaded
 * from App -- importing it eagerly pulled three/R3F/drei/xr into the initial
 * bundle (~1.5 MB) for a screen most sessions never open.
 */
const store = createXRStore();

const WALL_HEIGHT = 2.7;
const DOOR_HEIGHT = 2.1;
const DOOR_THICKNESS = 0.05;
const WINDOW_SILL = 0.9;
const WINDOW_HEIGHT = 1.2;

/** Furniture heights in metres, by subtype. Everything used to render as 0.8m. */
const FURNITURE_HEIGHTS: Record<string, number> = {
  bed: 0.6,
  sofa: 0.8,
  table: 0.75,
  chair: 0.9,
  counter: 0.9,
  fridge: 1.8,
  toilet: 0.75,
  tub: 0.55,
  plant: 1.2,
  'tv-stand': 0.5,
  vanity: 0.85,
};
const DEFAULT_FURNITURE_HEIGHT = 0.8;

/**
 * Subscribe to the XR session reactively.
 *
 * The previous version read `store.getState()?.session` directly in render.
 * That does not subscribe, so React never re-rendered when the session changed
 * on its own -- exiting AR via the browser/OS control left the AR chrome stuck
 * on screen over a plain 3D view.
 */
function useXRSession(): XRSession | null {
  const [session, setSession] = useState<XRSession | null>(() => (store as any)?.getState?.()?.session ?? null);

  useEffect(() => {
    const s = store as any;
    if (typeof s?.subscribe !== 'function') return;
    const unsubscribe = s.subscribe((next: any) => {
      const value = next?.session ?? null;
      setSession((prev) => (prev === value ? prev : value));
    });
    return () => unsubscribe?.();
  }, []);

  return session;
}

function Plan3DModel({ plan }: { plan: FloorPlanData }) {
  // Derived, not state: the old version used useState + useEffect, which
  // rendered one frame at the un-centred origin before correcting.
  const centerOffset = useMemo(() => {
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    plan.walls.forEach((w) => {
      minX = Math.min(minX, w.x1, w.x2);
      maxX = Math.max(maxX, w.x1, w.x2);
      minY = Math.min(minY, w.y1, w.y2);
      maxY = Math.max(maxY, w.y1, w.y2);
    });
    if (minX === Infinity) return { x: 0, z: 0 };
    return { x: (minX + maxX) / 2, z: (minY + maxY) / 2 };
  }, [plan.walls]);

  const materials = useMemo(
    () => ({
      wall: new THREE.MeshStandardMaterial({ color: '#f0f0f0', roughness: 0.9 }),
      floor: new THREE.MeshStandardMaterial({ color: '#e0e0e0', roughness: 0.8 }),
      furniture: new THREE.MeshStandardMaterial({ color: '#88aaff', roughness: 0.4 }),
      door: new THREE.MeshStandardMaterial({ color: '#8b5a2b', roughness: 0.6 }),
      window: new THREE.MeshStandardMaterial({
        color: '#a5d8ff',
        roughness: 0.1,
        transparent: true,
        opacity: 0.55,
      }),
    }),
    []
  );

  // Dispose on unmount: these were previously leaked on every close.
  useEffect(
    () => () => {
      Object.values(materials).forEach((m) => m.dispose());
    },
    [materials]
  );

  return (
    <group position={[-centerOffset.x / PIXELS_PER_METER, 0, -centerOffset.z / PIXELS_PER_METER]}>
      {/* Floor Room areas */}
      {plan.rooms.map((room) => (
        <mesh
          key={room.id}
          position={[
            (room.x + room.width / 2) / PIXELS_PER_METER,
            0.01,
            (room.y + room.height / 2) / PIXELS_PER_METER,
          ]}
          rotation={[-Math.PI / 2, 0, 0]}
          receiveShadow
        >
          <planeGeometry args={[room.width / PIXELS_PER_METER, room.height / PIXELS_PER_METER]} />
          <primitive object={materials.floor} attach="material" />
        </mesh>
      ))}

      {/* Walls */}
      {plan.walls.map((wall) => {
        const dx = wall.x2 - wall.x1;
        const dy = wall.y2 - wall.y1;
        const length = Math.sqrt(dx * dx + dy * dy) / PIXELS_PER_METER;
        const angle = Math.atan2(dy, dx);
        const thickness = (wall.thickness || 10) / PIXELS_PER_METER;
        const height = wall.height || WALL_HEIGHT;

        return (
          <mesh
            key={wall.id}
            position={[
              (wall.x1 + wall.x2) / 2 / PIXELS_PER_METER,
              height / 2,
              (wall.y1 + wall.y2) / 2 / PIXELS_PER_METER,
            ]}
            rotation={[0, -angle, 0]}
            castShadow
            receiveShadow
          >
            <boxGeometry args={[length, height, thickness]} />
            <primitive object={materials.wall} attach="material" />
          </mesh>
        );
      })}

      {/* Doors & windows.
          These were previously not rendered at all (the `door` material was
          created and never used), so the "AR site projection" showed a sealed
          box with no way in and no daylight. */}
      {plan.openings.map((op) => {
        const theta = (op.rotation * Math.PI) / 180;
        const cx = op.x / PIXELS_PER_METER;
        const cz = op.y / PIXELS_PER_METER;
        const width = op.width / PIXELS_PER_METER;

        if (op.type === 'window') {
          return (
            <mesh
              key={op.id}
              position={[cx, WINDOW_SILL + WINDOW_HEIGHT / 2, cz]}
              rotation={[0, -theta, 0]}
              castShadow
            >
              <boxGeometry args={[width, WINDOW_HEIGHT, 0.08]} />
              <primitive object={materials.window} attach="material" />
            </mesh>
          );
        }

        // Door leaf standing at the hinge, swung along the wall direction.
        const dirX = Math.cos(theta);
        const dirZ = Math.sin(theta);
        return (
          <mesh
            key={op.id}
            position={[
              cx + (dirX * width) / 2,
              DOOR_HEIGHT / 2,
              cz + (dirZ * width) / 2,
            ]}
            rotation={[0, -theta, 0]}
            castShadow
          >
            <boxGeometry args={[width, DOOR_HEIGHT, DOOR_THICKNESS]} />
            <primitive object={materials.door} attach="material" />
          </mesh>
        );
      })}

      {/* Furniture */}
      {plan.furniture.map((f) => {
        const width = f.width / PIXELS_PER_METER;
        const depth = f.height / PIXELS_PER_METER;
        const height = FURNITURE_HEIGHTS[f.subType] ?? DEFAULT_FURNITURE_HEIGHT;

        return (
          <mesh
            key={f.id}
            position={[f.x / PIXELS_PER_METER, height / 2, f.y / PIXELS_PER_METER]}
            rotation={[0, (-f.rotation * Math.PI) / 180, 0]}
            castShadow
          >
            <boxGeometry args={[width, height, depth]} />
            <primitive object={materials.furniture} attach="material" />
          </mesh>
        );
      })}
    </group>
  );
}

function ARScene({
  plan,
  modelScale,
  isPlaced,
  setPlaced,
  modelRotation,
  onPlace,
  placedPos,
}: {
  plan: FloorPlanData;
  modelScale: number;
  isPlaced: boolean;
  setPlaced: (v: boolean) => void;
  modelRotation: number;
  onPlace: (pos: THREE.Vector3) => void;
  placedPos: THREE.Vector3 | null;
}) {
  const reticleRef = useRef<THREE.Mesh>(null);
  const [currentPos, setCurrentPos] = useState<THREE.Vector3 | null>(null);
  const inSession = useXRSession() != null;

  useXRHitTest(
    (results, getWorldMatrix) => {
      if (isPlaced || !reticleRef.current) return;

      if (results.length === 0) {
        reticleRef.current.visible = false;
        return;
      }
      reticleRef.current.visible = true;
      const matrixHelper = new THREE.Matrix4();
      getWorldMatrix(matrixHelper, results[0]);

      reticleRef.current.matrixAutoUpdate = false;
      reticleRef.current.matrix.copy(matrixHelper);
      // Without flagging this, three never recomputes matrixWorld from the
      // hand-written matrix and the reticle stays pinned at the origin.
      reticleRef.current.matrixWorldNeedsUpdate = true;

      const pos = new THREE.Vector3().setFromMatrixPosition(matrixHelper);
      setCurrentPos(pos);
    },
    'viewer'
  );

  useEffect(() => {
    const handlePointerDown = () => {
      if (!isPlaced && currentPos && inSession) {
        onPlace(currentPos.clone());
        setPlaced(true);
      }
    };
    window.addEventListener('pointerdown', handlePointerDown);
    return () => window.removeEventListener('pointerdown', handlePointerDown);
  }, [isPlaced, currentPos, onPlace, setPlaced, inSession]);

  return (
    <>
      <ambientLight intensity={0.6} />
      <directionalLight
        position={[5, 10, 5]}
        intensity={1.5}
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
      />

      {inSession ? (
        <>
          {isPlaced && placedPos ? (
            <group position={placedPos} rotation={[0, modelRotation, 0]} scale={modelScale}>
              <Plan3DModel plan={plan} />
              <ContactShadows opacity={0.6} scale={20} blur={2} far={10} />
            </group>
          ) : (
            <mesh ref={reticleRef} rotation={[-Math.PI / 2, 0, 0]}>
              <ringGeometry args={[0.1, 0.15, 32]} />
              <meshBasicMaterial color="#10b981" />
            </mesh>
          )}
        </>
      ) : (
        <group>
          <OrbitControls makeDefault />
          <Plan3DModel plan={plan} />
          <ContactShadows opacity={0.4} scale={20} blur={2} far={10} />
        </group>
      )}
    </>
  );
}

export default function ARViewer({ plan, onClose }: { plan: FloorPlanData; onClose: () => void }) {
  const [isPlaced, setPlaced] = useState(false);
  const [placedPos, setPlacedPos] = useState<THREE.Vector3 | null>(null);
  const [modelRotation, setModelRotation] = useState(0);
  const [modelScale, setModelScale] = useState(1);
  const [showDisclaimer, setShowDisclaimer] = useState(true);
  const [toast, setToast] = useState<string | null>(null);
  const glRef = useRef<THREE.WebGLRenderer | null>(null);

  const session = useXRSession();
  const inSession = session != null;

  const showToast = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(null), 3000);
  };

  const handleStartAR = async () => {
    try {
      await store.enterAR();
      setShowDisclaimer(false);
    } catch (e) {
      console.error('Failed to enter AR', e);
      showToast('WebXR AR is not supported on this device or browser.');
    }
  };

  const handleEndSession = () => {
    try {
      session?.end();
    } catch {
      /* session may already be ending */
    }
    onClose();
  };

  /**
   * Real capture. The previous implementation was a bare
   * `alert("Photo captured and saved to gallery!")` that did nothing.
   *
   * Requires preserveDrawingBuffer on the renderer (set below). In an active AR
   * session the WebXR compositor owns the output, so this captures the 3D layer
   * only -- not the camera feed -- which we say out loud rather than pretend.
   */
  const capturePhoto = () => {
    const gl = glRef.current;
    if (!gl) {
      showToast('Capture is not available yet.');
      return;
    }
    try {
      const url = gl.domElement.toDataURL('image/png');
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `landcraft-view-${Date.now()}.png`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      showToast(inSession ? 'Saved the 3D layer (camera feed is not captured).' : 'Saved PNG to your downloads.');
    } catch (e) {
      console.error('Capture failed', e);
      showToast('Capture failed on this device.');
    }
  };

  const handleReposition = () => {
    setPlaced(false);
    setPlacedPos(null);
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black text-white flex flex-col font-sans">
      {/* Non-XR Fallback / Starter UI */}
      {!inSession && showDisclaimer && (
        <div className="absolute inset-0 flex flex-col items-center justify-center p-6 bg-black/50 backdrop-blur z-50">
          <div className="bg-slate-800 p-8 rounded-2xl max-w-md text-center space-y-6 shadow-2xl border border-slate-700">
            <div className="bg-amber-500/20 text-amber-500 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
              <Info className="w-8 h-8" />
            </div>
            <h2 className="text-2xl font-bold">AR Site Projection</h2>
            <p className="text-sm text-slate-300 leading-relaxed">
              You are viewing the 3D generated model.
              <strong className="block mt-2 text-amber-400">Ready to place this in the real world?</strong>
            </p>

            <div className="pt-4 space-y-3">
              <button
                onClick={handleStartAR}
                className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold transition-all"
              >
                Start AR Mode
              </button>
              <button
                onClick={() => setShowDisclaimer(false)}
                className="w-full py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-xl font-bold transition-all"
              >
                Preview 3D Only
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 3D Canvas */}
      <Canvas
        className="w-full h-full"
        shadows
        camera={{ position: [5, 5, 5], fov: 50 }}
        gl={{ preserveDrawingBuffer: true }}
        onCreated={({ gl }) => {
          glRef.current = gl;
        }}
      >
        <XR store={store}>
          <ARScene
            plan={plan}
            isPlaced={isPlaced}
            setPlaced={setPlaced}
            placedPos={placedPos}
            onPlace={setPlacedPos}
            modelRotation={modelRotation}
            modelScale={modelScale}
          />
        </XR>
      </Canvas>

      {/* AR DOM Overlay UI (Active during AR).
          Children are now gated on `inSession` so the "scan floor" prompt no
          longer floats over the plain desktop 3D preview. */}
      <XRDomOverlay className="pointer-events-none absolute inset-0 w-full h-full p-4 flex flex-col justify-between">
        <div className="flex justify-between items-start pointer-events-auto">
          <button
            onClick={handleEndSession}
            className="p-3 bg-black/50 backdrop-blur rounded-full text-white hover:bg-red-500/80 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>

          <div className="flex gap-2">
            <button
              onClick={capturePhoto}
              className="p-3 bg-black/50 backdrop-blur rounded-full text-white hover:bg-slate-700 transition-colors"
              title="Save a PNG of the 3D view"
            >
              <Camera className="w-6 h-6" />
            </button>
          </div>
        </div>

        {inSession && !isPlaced && (
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center pointer-events-none animate-pulse drop-shadow-md">
            <div className="bg-black/60 text-white px-4 py-2 rounded-full text-sm font-bold backdrop-blur flex items-center gap-2">
              <Crosshair className="w-4 h-4" /> Scan floor slowly to find surface
            </div>
          </div>
        )}

        {inSession && isPlaced && (
          <div className="pointer-events-auto flex flex-col gap-4 max-w-sm mx-auto w-full">
            <div className="bg-black/60 backdrop-blur rounded-2xl p-4 space-y-4 border border-white/10 shadow-xl">
              <div className="flex items-center justify-between text-sm font-bold">
                <span className="flex items-center gap-2 text-emerald-400">
                  <Scale className="w-4 h-4" /> Scale{' '}
                </span>
                <div className="flex items-center gap-3 bg-black/40 rounded-lg p-1 border border-white/10">
                  <button
                    onClick={() => setModelScale((s) => Math.max(0.1, +(s - 0.1).toFixed(2)))}
                    className="p-2 hover:bg-white/20 rounded text-slate-300"
                  >
                    <Minus className="w-4 h-4" />
                  </button>
                  <span className="w-12 text-center">{Math.round(modelScale * 100)}%</span>
                  <button
                    onClick={() => setModelScale((s) => +(s + 0.1).toFixed(2))}
                    className="p-2 hover:bg-white/20 rounded text-slate-300"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between text-sm font-bold">
                <span className="flex items-center gap-2 text-blue-400">
                  <RotateCcw className="w-4 h-4" /> Rotate
                </span>
                <div className="flex items-center gap-3 bg-black/40 rounded-lg p-1 border border-white/10">
                  <button
                    onClick={() => setModelRotation((r) => r - Math.PI / 8)}
                    className="p-2 hover:bg-white/20 rounded text-slate-300"
                  >
                    -45°
                  </button>
                  <button
                    onClick={() => setModelRotation((r) => r + Math.PI / 8)}
                    className="p-2 hover:bg-white/20 rounded text-slate-300"
                  >
                    +45°
                  </button>
                </div>
              </div>
            </div>

            <button
              onClick={handleReposition}
              className="w-full py-4 bg-emerald-600 hover:bg-emerald-500 rounded-2xl font-bold flex items-center justify-center gap-2 shadow-lg"
            >
              <ArrowDownToLine className="w-5 h-5" /> Reposition Model
            </button>
          </div>
        )}
      </XRDomOverlay>

      {/* Fallback standard UI for 3D Viewer Mode (when not in XR) */}
      {!inSession && !showDisclaimer && (
        <div className="pointer-events-none absolute inset-0 w-full h-full p-4 flex flex-col justify-between z-10">
          <div className="flex justify-between items-start pointer-events-auto">
            <button
              onClick={onClose}
              className="p-3 bg-black/50 backdrop-blur rounded-full text-white hover:bg-red-500/80 transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
          <div className="pointer-events-auto mx-auto mb-6 flex items-center gap-3">
            <button
              onClick={capturePhoto}
              className="px-4 py-3 bg-black/50 hover:bg-slate-700 backdrop-blur rounded-2xl font-bold flex items-center gap-2 shadow-lg transition-colors"
            >
              <Camera className="w-5 h-5" /> Save Image
            </button>
            <button
              onClick={handleStartAR}
              className="px-6 py-3 bg-emerald-600 hover:bg-emerald-500 rounded-2xl font-bold flex items-center gap-2 shadow-lg transition-colors"
            >
              <Box className="w-5 h-5" /> Start AR Mode
            </button>
          </div>
        </div>
      )}

      {toast && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-50 bg-black/80 backdrop-blur text-white text-xs font-semibold px-4 py-2 rounded-full border border-white/10">
          {toast}
        </div>
      )}
    </div>
  );
}
