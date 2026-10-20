/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * The plan as a three.js scene graph: room floors, extruded
 * walls, doors and windows, and furniture blocks.
 *
 * Extracted from ARViewer so the orbit 3D preview and the AR
 * projection render the exact same model instead of two copies
 * of the same geometry code. All positioning math lives in
 * ../lib/plan3D (pure, unit-tested); this component only maps
 * the results onto R3F primitives.
 */

import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import type { FloorPlanData } from '../types';
import {
  furnitureToBox,
  openingToBox,
  planCenter,
  wallToBox,
} from '../lib/plan3D';

export default function Plan3DModel({ plan }: { plan: FloorPlanData }) {
  // Derived, not state: the old version used useState + useEffect,
  // which rendered one frame at the un-centred origin before
  // correcting.
  const center = useMemo(() => planCenter(plan), [plan]);

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
    [],
  );

  // Dispose on unmount: these were previously leaked on every close.
  useEffect(
    () => () => {
      Object.values(materials).forEach((m) => m.dispose());
    },
    [materials],
  );

  return (
    <group position={[-center.x, 0, -center.z]}>
      {/* Room floors */}
      {plan.rooms.map((room) => (
        <mesh
          key={room.id}
          position={[
            (room.x + room.width / 2) / 40,
            0.01,
            (room.y + room.height / 2) / 40,
          ]}
          rotation={[-Math.PI / 2, 0, 0]}
          receiveShadow
        >
          <planeGeometry args={[room.width / 40, room.height / 40]} />
          <primitive object={materials.floor} attach="material" />
        </mesh>
      ))}

      {/* Walls */}
      {plan.walls.map((wall) => {
        const box = wallToBox(wall);
        return (
          <mesh
            key={wall.id}
            position={box.center}
            rotation={[0, box.rotationY, 0]}
            castShadow
            receiveShadow
          >
            <boxGeometry args={box.size} />
            <primitive object={materials.wall} attach="material" />
          </mesh>
        );
      })}

      {/* Doors & windows. These were previously not rendered at all
          (the `door` material was created and never used), so the
          "AR site projection" showed a sealed box with no way in
          and no daylight. */}
      {plan.openings.map((op) => {
        const box = openingToBox(op);
        return (
          <mesh
            key={op.id}
            position={box.center}
            rotation={[0, box.rotationY, 0]}
            castShadow
          >
            <boxGeometry args={box.size} />
            <primitive
              object={op.type === 'window' ? materials.window : materials.door}
              attach="material"
            />
          </mesh>
        );
      })}

      {/* Furniture */}
      {plan.furniture.map((f) => {
        const box = furnitureToBox(f);
        return (
          <mesh
            key={f.id}
            position={box.center}
            rotation={[0, box.rotationY, 0]}
            castShadow
          >
            <boxGeometry args={box.size} />
            <primitive object={materials.furniture} attach="material" />
          </mesh>
        );
      })}
    </group>
  );
}
