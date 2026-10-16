"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { QUALITY_SETTINGS, type ExperienceQuality } from "@/config/quality";

/**
 * Neutral, offline image-based lighting for inspecting PBR materials (the marble
 * gallery is lit PBR with metallic surfaces, which render black without an environment).
 * The existing neutral key also provides a cached, broad grounding shadow. The era light supplies
 * the small live shadow map; the full hall never needs to render into a shadow map every frame.
 */
export function DevEnvironment({ quality, shadowsReady }: { quality: ExperienceQuality; shadowsReady: () => boolean }) {
  const get = useThree((state) => state.get);
  const sun = useRef<THREE.DirectionalLight>(null);
  const captured = useRef(false);
  const mapSize = QUALITY_SETTINGS[quality].hallShadowMapSize;

  useEffect(() => { captured.current = false; }, [mapSize, shadowsReady]);

  useFrame(() => {
    if (captured.current || !sun.current) return;
    // Suspense loads the hall and stations independently. Capture only after both have mounted;
    // from then on this coarse map holds static architecture / desk contact, not moving detail.
    sun.current.shadow.needsUpdate = true;
    if (shadowsReady()) captured.current = true;
  });

  useEffect(() => {
    const { gl, scene } = get();
    const pmrem = new THREE.PMREMGenerator(gl);
    const texture = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    const previous = scene.environment;
    scene.environment = texture;
    return () => {
      scene.environment = previous;
      texture.dispose();
      pmrem.dispose();
    };
  }, [get]);

  return (
    <>
      <ambientLight intensity={0.25} />
      <directionalLight ref={sun} name="MuseumKey" position={[10, 20, 8]} intensity={1.2} castShadow
        shadow-mapSize={[mapSize, mapSize]} shadow-autoUpdate={false}
        shadow-camera-left={-36} shadow-camera-right={36} shadow-camera-top={36} shadow-camera-bottom={-36}
        shadow-camera-near={0.1} shadow-camera-far={80}
        shadow-bias={-0.00001} shadow-normalBias={0.002}
        shadow-radius={3.5 * mapSize / 1024} shadow-intensity={0.65} />
    </>
  );
}
