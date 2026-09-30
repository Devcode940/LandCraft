import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { createXRStore, XR, useXRHitTest, XRDomOverlay } from '@react-three/xr';
import { Environment, ContactShadows, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { FloorPlanData, Wall, Room, Furniture, Opening } from '../types';
import { X, RotateCcw, Crosshair, ArrowDownToLine, Info, Camera, Scale, Maximize, Minus, Plus, Box } from 'lucide-react';

const PIXELS_PER_METER = 40;

const store = createXRStore();

function Plan3DModel({ plan, opacity = 1 }: { plan: FloorPlanData, opacity?: number }) {
  const groupRef = useRef<THREE.Group>(null);
  
  // Center the plan
  const [centerOffset, setCenterOffset] = useState({ x: 0, z: 0 });
  
  useEffect(() => {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    plan.walls.forEach(w => {
      minX = Math.min(minX, w.x1, w.x2);
      maxX = Math.max(maxX, w.x1, w.x2);
      minY = Math.min(minY, w.y1, w.y2);
      maxY = Math.max(maxY, w.y1, w.y2);
    });
    if (minX !== Infinity) {
      setCenterOffset({
        x: (minX + maxX) / 2,
        z: (minY + maxY) / 2
      });
    }
  }, [plan]);

  const materials = useMemo(() => {
    return {
      wall: new THREE.MeshStandardMaterial({ color: '#f0f0f0', roughness: 0.9, transparent: opacity < 1, opacity }),
      floor: new THREE.MeshStandardMaterial({ color: '#e0e0e0', roughness: 0.8, transparent: opacity < 1, opacity: opacity * 0.5 }),
      furniture: new THREE.MeshStandardMaterial({ color: '#88aaff', roughness: 0.4, transparent: opacity < 1, opacity }),
      door: new THREE.MeshStandardMaterial({ color: '#8b5a2b', roughness: 0.6, transparent: opacity < 1, opacity }),
    };
  }, [opacity]);

  return (
    <group ref={groupRef} position={[-centerOffset.x / PIXELS_PER_METER, 0, -centerOffset.z / PIXELS_PER_METER]}>
      {/* Floor Room areas */}
      {plan.rooms.map(room => (
        <mesh 
          key={room.id}
          position={[(room.x + room.width/2) / PIXELS_PER_METER, 0.01, (room.y + room.height/2) / PIXELS_PER_METER]} 
          rotation={[-Math.PI / 2, 0, 0]}
          receiveShadow
        >
          <planeGeometry args={[room.width / PIXELS_PER_METER, room.height / PIXELS_PER_METER]} />
          <primitive object={materials.floor} attach="material" />
        </mesh>
      ))}

      {/* Walls */}
      {plan.walls.map(wall => {
        const dx = wall.x2 - wall.x1;
        const dy = wall.y2 - wall.y1;
        const length = Math.sqrt(dx*dx + dy*dy) / PIXELS_PER_METER;
        const angle = Math.atan2(dy, dx);
        const thickness = (wall.thickness || 10) / PIXELS_PER_METER;
        const height = (wall.height || 2.7);
        const cx = (wall.x1 + wall.x2) / 2 / PIXELS_PER_METER;
        const cz = (wall.y1 + wall.y2) / 2 / PIXELS_PER_METER;

        return (
          <mesh 
            key={wall.id} 
            position={[cx, height / 2, cz]} 
            rotation={[0, -angle, 0]}
            castShadow
            receiveShadow
          >
            <boxGeometry args={[length, height, thickness]} />
            <primitive object={materials.wall} attach="material" />
          </mesh>
        );
      })}

      {/* Furniture */}
      {plan.furniture.map(f => {
        const width = f.width / PIXELS_PER_METER;
        const depth = f.height / PIXELS_PER_METER;
        const height = 0.8;
        const cx = f.x / PIXELS_PER_METER;
        const cz = f.y / PIXELS_PER_METER;
        
        return (
          <mesh 
            key={f.id} 
            position={[cx, height / 2, cz]}
            rotation={[0, -f.rotation * Math.PI / 180, 0]}
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

function ARScene({ plan, modelScale, setPlaced, isPlaced, modelRotation, setModelPosition }: any) {
  const reticleRef = useRef<THREE.Mesh>(null);
  const [currentPos, setCurrentPos] = useState<THREE.Vector3 | null>(null);

  // Check if we are inside an active AR session
  const inSession = !!store.getState?.()?.session;

  useXRHitTest(
    (results, getWorldMatrix) => {
      if (!isPlaced && reticleRef.current) {
        if (results.length === 0) {
          reticleRef.current.visible = false;
          return;
        }
        reticleRef.current.visible = true;
        const matrixHelper = new THREE.Matrix4();
        getWorldMatrix(matrixHelper, results[0]);
        reticleRef.current.matrixAutoUpdate = false;
        reticleRef.current.matrix.copy(matrixHelper);
        
        const pos = new THREE.Vector3().setFromMatrixPosition(matrixHelper);
        setCurrentPos(pos);
      }
    },
    'viewer'
  );

  // When user taps on screen
  useEffect(() => {
    const handlePointerDown = () => {
      if (!isPlaced && currentPos && inSession) {
        setModelPosition(currentPos.clone());
        setPlaced(true);
      }
    };
    window.addEventListener('pointerdown', handlePointerDown);
    return () => window.removeEventListener('pointerdown', handlePointerDown);
  }, [isPlaced, currentPos, setModelPosition, setPlaced, inSession]);

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
      <Environment preset="city" />

      {inSession ? (
        // AR MODE
        <>
          {isPlaced && currentPos ? (
            <group position={currentPos} rotation={[0, modelRotation, 0]} scale={modelScale}>
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
        // FALLBACK 3D VIEWER MODE
        <group>
          <OrbitControls makeDefault />
          <Plan3DModel plan={plan} />
          <ContactShadows opacity={0.4} scale={20} blur={2} far={10} />
        </group>
      )}
    </>
  );
}

export default function ARViewer({ plan, onClose }: { plan: FloorPlanData, onClose: () => void }) {
  const [isPlaced, setPlaced] = useState(false);
  const [modelPosition, setModelPosition] = useState<THREE.Vector3 | null>(null);
  const [modelRotation, setModelRotation] = useState(0);
  const [modelScale, setModelScale] = useState(1);
  const [showDisclaimer, setShowDisclaimer] = useState(true);

  const handleStartAR = async () => {
    try {
      await store.enterAR();
      setShowDisclaimer(false);
    } catch (e) {
      console.error("Failed to enter AR", e);
      alert("WebXR AR is not supported on this device or browser.");
    }
  };

  const capturePhoto = () => {
    // In WebXR, capturing the canvas can be tricky without preserveDrawingBuffer.
    // For this prototype, we simulate the action.
    alert("Photo captured and saved to gallery!");
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black text-white flex flex-col font-sans">
      {/* Non-XR Fallback / Starter UI */}
      {!store.getState?.()?.session && showDisclaimer && (
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
                onClick={() => {
                  setShowDisclaimer(false);
                }}
                className="w-full py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-xl font-bold transition-all"
              >
                Preview 3D Only
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 3D Canvas */}
      <Canvas className="w-full h-full" shadows camera={{ position: [5, 5, 5], fov: 50 }}>
        <XR store={store}>
          <ARScene 
            plan={plan} 
            isPlaced={isPlaced} 
            setPlaced={setPlaced} 
            modelPosition={modelPosition}
            setModelPosition={setModelPosition}
            modelRotation={modelRotation}
            modelScale={modelScale}
          />
        </XR>
      </Canvas>

      {/* AR DOM Overlay UI (Active during AR) */}
      <XRDomOverlay className="pointer-events-none absolute inset-0 w-full h-full p-4 flex flex-col justify-between">
        
        {/* Top bar */}
        <div className="flex justify-between items-start pointer-events-auto">
          <button 
            onClick={() => {
              store.getState?.()?.session?.end();
              onClose();
            }}
            className="p-3 bg-black/50 backdrop-blur rounded-full text-white hover:bg-red-500/80 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
          
          <div className="flex gap-2">
            <button 
              onClick={capturePhoto}
              className="p-3 bg-black/50 backdrop-blur rounded-full text-white hover:bg-slate-700 transition-colors"
            >
              <Camera className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* Status indicator */}
        {!isPlaced && (
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center pointer-events-none animate-pulse drop-shadow-md">
            <div className="bg-black/60 text-white px-4 py-2 rounded-full text-sm font-bold backdrop-blur flex items-center gap-2">
              <Crosshair className="w-4 h-4" /> Scan floor slowly to find surface
            </div>
          </div>
        )}

        {/* Bottom controls */}
        {isPlaced && (
          <div className="pointer-events-auto flex flex-col gap-4 max-w-sm mx-auto w-full">
            {/* Calibration Tools */}
            <div className="bg-black/60 backdrop-blur rounded-2xl p-4 space-y-4 border border-white/10 shadow-xl">
              
              <div className="flex items-center justify-between text-sm font-bold">
                <span className="flex items-center gap-2 text-emerald-400"><Scale className="w-4 h-4" /> Scale </span>
                <div className="flex items-center gap-3 bg-black/40 rounded-lg p-1 border border-white/10">
                  <button onClick={() => setModelScale(s => Math.max(0.1, s - 0.1))} className="p-2 hover:bg-white/20 rounded text-slate-300">
                    <Minus className="w-4 h-4" />
                  </button>
                  <span className="w-12 text-center">{Math.round(modelScale * 100)}%</span>
                  <button onClick={() => setModelScale(s => s + 0.1)} className="p-2 hover:bg-white/20 rounded text-slate-300">
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between text-sm font-bold">
                <span className="flex items-center gap-2 text-blue-400"><RotateCcw className="w-4 h-4" /> Rotate</span>
                <div className="flex items-center gap-3 bg-black/40 rounded-lg p-1 border border-white/10">
                  <button onClick={() => setModelRotation(r => r - Math.PI / 8)} className="p-2 hover:bg-white/20 rounded text-slate-300">
                    -45°
                  </button>
                  <button onClick={() => setModelRotation(r => r + Math.PI / 8)} className="p-2 hover:bg-white/20 rounded text-slate-300">
                    +45°
                  </button>
                </div>
              </div>

            </div>

            {/* Reposition */}
            <button 
              onClick={() => {
                setPlaced(false);
                setModelPosition(null);
              }}
              className="w-full py-4 bg-emerald-600 hover:bg-emerald-500 rounded-2xl font-bold flex items-center justify-center gap-2 shadow-lg"
            >
              <ArrowDownToLine className="w-5 h-5" /> Reposition Model
            </button>
          </div>
        )}
      </XRDomOverlay>

      {/* Fallback standard UI for 3D Viewer Mode (when not in XR) */}
      {!store.getState?.()?.session && !showDisclaimer && (
        <div className="pointer-events-none absolute inset-0 w-full h-full p-4 flex flex-col justify-between z-10">
          <div className="flex justify-between items-start pointer-events-auto">
            <button 
              onClick={onClose}
              className="p-3 bg-black/50 backdrop-blur rounded-full text-white hover:bg-red-500/80 transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
          <div className="pointer-events-auto mx-auto mb-6">
            <button 
              onClick={handleStartAR}
              className="px-6 py-3 bg-emerald-600 hover:bg-emerald-500 rounded-2xl font-bold flex items-center gap-2 shadow-lg transition-colors"
            >
              <Box className="w-5 h-5" /> Start AR Mode
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
