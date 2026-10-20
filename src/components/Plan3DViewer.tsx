/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Orbit-able 3D preview of the current plan.
 *
 * The AR viewer projects the model into a room; this one is
 * for desk review: spin it, zoom it, check masses and
 * proportions before anything is built.
 *
 * Like ARViewer, it is lazy-loaded from App -- three.js and
 * R3F are ~1.5 MB and have no business in the initial bundle
 * of a 2D drafting tool.
 */

import { useMemo, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { Grid, OrbitControls } from '@react-three/drei';
import { Box, RotateCw, X } from 'lucide-react';
import { FloorPlanData } from '../types';
import { cameraDistanceFor, planCenter } from '../lib/plan3D';
import Plan3DModel from './Plan3DModel';
import Modal from './Modal';

export default function Plan3DViewer({
  plan,
  highContrast,
  onClose,
}: {
  plan: FloorPlanData;
  highContrast: boolean;
  onClose: () => void;
}) {
  const [autoRotate, setAutoRotate] = useState(false);

  const center = useMemo(() => planCenter(plan), [plan]);
  const distance = useMemo(() => cameraDistanceFor(plan), [plan]);

  const shell = highContrast
    ? 'bg-white text-black border-2 border-black'
    : 'bg-slate-900 text-slate-100 border border-slate-700';

  return (
    <Modal
      label="3D plan preview"
      onClose={onClose}
      className={`w-[min(94vw,920px)] overflow-hidden rounded-2xl shadow-2xl ${shell}`}
      overlayClassName="bg-black/60 backdrop-blur-sm"
    >
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-inherit">
        <div className="flex items-center gap-2">
          <Box className="w-4 h-4 text-emerald-400" />
          <h2 className="text-sm font-bold uppercase tracking-wide">3D Preview</h2>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setAutoRotate((r) => !r)}
            aria-pressed={autoRotate}
            title="Toggle auto-rotate"
            className={`p-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 cursor-pointer transition-colors ${
              autoRotate
                ? 'bg-emerald-600 text-white'
                : highContrast
                  ? 'bg-white text-black border border-black hover:bg-black hover:text-white'
                  : 'bg-slate-800 hover:bg-slate-700'
            }`}
          >
            <RotateCw className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Auto-rotate</span>
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close 3D preview"
            className={`p-1.5 rounded-lg cursor-pointer transition-colors ${
              highContrast
                ? 'bg-white text-black border border-black hover:bg-black hover:text-white'
                : 'bg-slate-800 hover:bg-slate-700'
            }`}
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="h-[min(72vh,620px)] w-full">
        <Canvas
          shadows
          camera={{ position: [distance / 1.6, distance / 1.4, distance / 1.6], fov: 50 }}
        >
          <ambientLight intensity={0.55} />
          <directionalLight
            position={[8, 12, 6]}
            intensity={1.6}
            castShadow
            shadow-mapSize-width={1024}
            shadow-mapSize-height={1024}
          />
          <color attach="background" args={[highContrast ? '#ffffff' : '#0f172a']} />

          {/* Ground reference so proportions are readable. */}
          <Grid
            position={[center.x, -0.01, center.z]}
            args={[200, 200]}
            cellSize={1}
            sectionSize={5}
            fadeDistance={60}
            cellColor={highContrast ? '#999999' : '#1e293b'}
            sectionColor={highContrast ? '#666666' : '#334155'}
            infiniteGrid
          />

          <Plan3DModel plan={plan} />
          <OrbitControls
            makeDefault
            autoRotate={autoRotate}
            autoRotateSpeed={1.2}
            target={[center.x, 0, center.z]}
            maxPolarAngle={Math.PI / 2 - 0.05}
            minDistance={2}
            maxDistance={distance * 3}
          />
        </Canvas>
      </div>

      <p className="px-4 py-2 text-[11px] opacity-70 border-t border-inherit">
        Drag to orbit · scroll to zoom · right-drag to pan. Heights are
        illustrative (walls 2.7 m, doors 2.1 m).
      </p>
    </Modal>
  );
}
