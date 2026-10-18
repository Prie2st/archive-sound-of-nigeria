"use client";

import { useGLTF } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { EXHIBITS, exhibitUrl, type ExhibitDefinition } from "@/data/exhibits";
import { EXHIBIT_PLINTH, EXHIBIT_SLOTS, exhibitHeading } from "@/data/hallLayout";

const noRaycast = () => undefined;
/** Exhibits farther than this from the camera are not drawn (the hall is 52 m across; the route ring ~37 m). */
const DRAW_DISTANCE = 22;
/** One shared spotlight picks out the exhibit nearest the camera: full within NEAR, faded out by FAR (metres). */
const SPOT = { near: 8, far: 12, intensity: 14, height: 3.6, towardRoute: 1.1, color: "#ffe2b8" } as const;

/**
 * The instrument exhibits on their plinths (src/data/exhibits.ts, placed by EXHIBIT_SLOTS beside the route), shown at
 * their display scale, with one shared spotlight on the exhibit nearest the camera. They load only once the museum is
 * ready, so they never hold up the loader, and then join the hall's static shadow map once.
 */
export function Exhibits({ ready }: { ready: () => boolean }) {
  const [mounted, setMounted] = useState(false);
  useFrame(() => {
    if (!mounted && ready()) setMounted(true);
  });
  if (!mounted) return null;
  return (
    <Suspense fallback={null}>
      <ExhibitSet />
    </Suspense>
  );
}

function ExhibitSet() {
  const scene = useThree((state) => state.scene);
  const plinth = useMemo(
    () => ({
      geometry: new THREE.BoxGeometry(EXHIBIT_PLINTH.width, 1, EXHIBIT_PLINTH.depth).translate(0, 0.5, 0),
      material: new THREE.MeshStandardMaterial({ color: "#14120f", roughness: 0.62, metalness: 0 }),
    }),
    [],
  );
  useEffect(
    () => () => {
      plinth.geometry.dispose();
      plinth.material.dispose();
    },
    [plinth],
  );
  // Everything has loaded (Suspense resolved): refresh the hall key light's static shadow map once to include them.
  useEffect(() => {
    const key = scene.getObjectByName("MuseumKey");
    if (key instanceof THREE.DirectionalLight) key.shadow.needsUpdate = true;
  }, [scene]);

  const groups = useRef<(THREE.Group | null)[]>([]);
  const camera = useThree((state) => state.camera);
  const scratch = useMemo(() => new THREE.Vector3(), []);
  const spot = useRef<THREE.SpotLight>(null);
  const spotTarget = useMemo(() => new THREE.Object3D(), []);
  // Where the shared spotlight sits for each exhibit: above, and toward the route so it lights the front.
  const spotPoses = useMemo(
    () =>
      EXHIBIT_SLOTS.map((slot) => {
        const exhibit = EXHIBITS.find((e) => e.id === slot.exhibitId);
        const [x, y, z] = slot.position;
        const inward = Math.hypot(x, z) || 1;
        const centreY = y + (exhibit ? exhibit.plinth + (exhibit.size * exhibit.display) / 2 : 1);
        return {
          light: [x - (x / inward) * SPOT.towardRoute, y + SPOT.height, z - (z / inward) * SPOT.towardRoute] as const,
          target: [x, centreY, z] as const,
        };
      }),
    [],
  );
  useFrame(() => {
    let nearest = -1;
    let nearestDistance = Infinity;
    groups.current.forEach((group, i) => {
      if (!group) return;
      const p = EXHIBIT_SLOTS[i].position;
      const distance = camera.position.distanceTo(scratch.set(p[0], p[1], p[2]));
      group.visible = distance < DRAW_DISTANCE;
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearest = i;
      }
    });
    const light = spot.current;
    if (!light) return;
    const fade = THREE.MathUtils.clamp((SPOT.far - nearestDistance) / (SPOT.far - SPOT.near), 0, 1);
    light.intensity = SPOT.intensity * fade;
    if (nearest < 0 || fade === 0) return;
    const pose = spotPoses[nearest];
    light.position.set(pose.light[0], pose.light[1], pose.light[2]);
    spotTarget.position.set(pose.target[0], pose.target[1], pose.target[2]);
    spotTarget.updateMatrixWorld();
  });

  return (
    <group name="Exhibits">
      <primitive object={spotTarget} />
      {/* Always mounted (intensity fades) so the shader set never changes; no shadow map. */}
      <spotLight ref={spot} name="ExhibitSpot" target={spotTarget} color={SPOT.color} intensity={0} distance={7} decay={2} angle={0.42} penumbra={0.75} />
      {EXHIBIT_SLOTS.map((slot, i) => {
        const exhibit = EXHIBITS.find((e) => e.id === slot.exhibitId);
        if (!exhibit) return null;
        return (
          <group
            key={slot.exhibitId}
            ref={(group) => {
              groups.current[i] = group;
            }}
            name={`Exhibit_${exhibit.id}`}
            position={[...slot.position]}
            rotation={[0, exhibitHeading(slot), 0]}
          >
            {exhibit.plinth > 0 && (
              <mesh geometry={plinth.geometry} material={plinth.material} scale={[1, exhibit.plinth, 1]} castShadow receiveShadow raycast={noRaycast} />
            )}
            <ExhibitModel exhibit={exhibit} />
          </group>
        );
      })}
    </group>
  );
}

function ExhibitModel({ exhibit }: { exhibit: ExhibitDefinition }) {
  const { scene } = useGLTF(exhibitUrl(exhibit.id), false, true);
  useEffect(() => {
    scene.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      object.castShadow = true;
      object.receiveShadow = true;
      object.raycast = noRaycast;
    });
  }, [scene]);
  return <primitive object={scene} position={[0, exhibit.plinth, 0]} scale={exhibit.display} />;
}
