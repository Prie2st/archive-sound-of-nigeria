"use client";

import { useGLTF } from "@react-three/drei";
import { useLayoutEffect } from "react";
import * as THREE from "three";
import type { GalleryDefinition } from "@/data/galleries";
import type { ExperienceQuality } from "@/config/quality";

export interface GalleryStats {
  bounds: THREE.Box3;
  meshes: number;
  materials: number;
  triangles: number;
}

interface GalleryProps {
  definition: GalleryDefinition;
  opaqueFix: boolean;
  quality: ExperienceQuality;
  onLoaded?: (stats: GalleryStats) => void;
}

/** Loads one museum shell. Geometry is used exactly as authored (no repositioning). */
export function Gallery({ definition, opaqueFix, quality, onLoaded }: GalleryProps) {
  // Draco off (assets use Meshopt or nothing), Meshopt on.
  const { scene } = useGLTF(definition.url, false, true);

  useLayoutEffect(() => {
    const materials = new Set<THREE.Material>();
    let meshes = 0;
    let triangles = 0;

    scene.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      meshes++;
      // RoomMesh includes the floor AND ceiling: receive only, so the roof never blocks the key.
      // Cache the broad architectural shadows; the tight desk light culls distant pillar chunks.
      // LOW omits the heavy pillars and doorways from shadow casting entirely.
      object.castShadow = definition.hasHallLayout && (object.name === "SculptureMesh" || object.name === "InnerRingMesh" ||
        (quality !== "low" && (object.name.startsWith("PillarsMesh_") || object.name === "DoorwaysMesh")));
      object.receiveShadow = definition.hasHallLayout && ![object.material].flat().some(material => material.name === "RoomGlass");
      const geometry = object.geometry as THREE.BufferGeometry;
      triangles += (geometry.index?.count ?? geometry.attributes.position.count) / 3;
      for (const material of [object.material].flat() as THREE.Material[]) {
        materials.add(material);
        // Dev-only fix, applied to the cached GLTF materials; reload the page to see the authored state.
        if (opaqueFix && definition.opaqueMaterials.includes(material.name)) {
          material.transparent = false;
          material.depthWrite = true;
          material.needsUpdate = true;
        }
      }
    });

    onLoaded?.({
      bounds: new THREE.Box3().setFromObject(scene),
      meshes,
      materials: materials.size,
      triangles,
    });
  }, [scene, definition, opaqueFix, quality, onLoaded]);

  return <primitive object={scene} />;
}
