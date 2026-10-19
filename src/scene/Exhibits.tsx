"use client";

import { useGLTF } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { QUALITY_SETTINGS, type ExperienceQuality } from "@/config/quality";
import { EXHIBITS, exhibitUrl, type ExhibitDefinition } from "@/data/exhibits";
import { EXHIBIT_SLOTS, exhibitHeading, exhibitOffsets, exhibitPlinthSize } from "@/data/hallLayout";

const noRaycast = () => undefined;
/** Exhibits farther than this from the camera are not drawn (the hall is 52 m across; the route ring ~37 m). */
const DRAW_DISTANCE = 22;
/** One shared spotlight picks out the exhibit nearest the camera: full within NEAR, faded out by FAR (metres). */
const SPOT = { near: 8, far: 12, intensity: 14, height: 3.6, towardRoute: 1.1, color: "#ffe2b8" } as const;
/** Floor contact around the lit plinth (m), as the station's desk contact: a native shadow receiver, no fake blob. */
const FLOOR_CONTACT = 2.6;

// Native shadow receivers, as under the listening desk: they keep contact readable under the bright image-based
// lighting, which a shadow alone would wash out. Opacity follows the spotlight's fade.
const contactSurface = new THREE.PlaneGeometry(1, 1);
const floorContact = new THREE.ShadowMaterial({ color: "#302a22", opacity: 0.48, depthWrite: false });
const topContact = new THREE.ShadowMaterial({ color: "#241f19", opacity: 0.42, depthWrite: false });
const CONTACT_OPACITY = { floor: floorContact.opacity, top: topContact.opacity } as const;

/** The exhibits on a slot's plinth, and the plinth height they share (the tallest of their values). */
const slotExhibits = EXHIBIT_SLOTS.map((slot) => {
  const members = slot.exhibitIds.map((id) => EXHIBITS.find((e) => e.id === id)).filter((e): e is ExhibitDefinition => !!e);
  return { members, plinth: Math.max(0, ...members.map((e) => e.plinth)) };
});

/**
 * The instrument exhibits on their plinths (src/data/exhibits.ts, placed by EXHIBIT_SLOTS beside the route), with one
 * shared spotlight on the plinth nearest the camera. That light casts a tight shadow map, like the listening desk's
 * light, and contact receivers on the floor and plinth top keep those shadows readable. The exhibits load only once
 * the museum is ready, so they never hold up the loader, and then join the hall's static shadow map once.
 */
export function Exhibits({ ready, quality }: { ready: () => boolean; quality: ExperienceQuality }) {
  const [mounted, setMounted] = useState(false);
  useFrame(() => {
    if (!mounted && ready()) setMounted(true);
  });
  if (!mounted) return null;
  return (
    <Suspense fallback={null}>
      <ExhibitSet quality={quality} />
    </Suspense>
  );
}

function ExhibitSet({ quality }: { quality: ExperienceQuality }) {
  const scene = useThree((state) => state.scene);
  const plinth = useMemo(
    () => ({
      geometry: new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0),
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
  const contacts = useRef<THREE.Group>(null);
  const topContactMesh = useRef<THREE.Mesh>(null);
  const lit = useRef(-1);
  // Where the shared spotlight sits for each plinth: above, and toward the route so it lights the front.
  const spotPoses = useMemo(
    () =>
      EXHIBIT_SLOTS.map((slot, i) => {
        const { members, plinth: height } = slotExhibits[i];
        const [x, y, z] = slot.position;
        const inward = Math.hypot(x, z) || 1;
        const tallest = Math.max(0, ...members.map((e) => e.size * e.display));
        return {
          light: [x - (x / inward) * SPOT.towardRoute, y + SPOT.height, z - (z / inward) * SPOT.towardRoute] as const,
          target: [x, y + height + tallest / 2, z] as const,
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
    // A quality change resized the shadow map: drop the old one so it is reallocated and rendered once more.
    const map = light.shadow.map;
    if (map && map.width !== light.shadow.mapSize.x) {
      map.dispose();
      light.shadow.map = null;
      light.shadow.needsUpdate = true;
    }
    const fade = THREE.MathUtils.clamp((SPOT.far - nearestDistance) / (SPOT.far - SPOT.near), 0, 1);
    light.intensity = SPOT.intensity * fade;
    floorContact.opacity = CONTACT_OPACITY.floor * fade;
    topContact.opacity = CONTACT_OPACITY.top * fade;
    if (contacts.current) contacts.current.visible = fade > 0;
    if (nearest < 0 || fade === 0 || nearest === lit.current) return;
    // The light moved to another plinth: re-aim it and render its (static) shadow map once there.
    lit.current = nearest;
    const pose = spotPoses[nearest];
    light.position.set(pose.light[0], pose.light[1], pose.light[2]);
    spotTarget.position.set(pose.target[0], pose.target[1], pose.target[2]);
    spotTarget.updateMatrixWorld();
    light.shadow.needsUpdate = true;
    const slot = EXHIBIT_SLOTS[nearest];
    const size = exhibitPlinthSize(slot);
    contacts.current?.position.set(slot.position[0], slot.position[1], slot.position[2]);
    contacts.current?.rotation.set(0, exhibitHeading(slot), 0);
    topContactMesh.current?.position.set(0, slotExhibits[nearest].plinth + 0.0005, 0);
    topContactMesh.current?.scale.set(size.width, size.depth, 1);
  });

  const mapSize = QUALITY_SETTINGS[quality].stationShadowMapSize;
  return (
    <group name="Exhibits">
      <primitive object={spotTarget} />
      {/* Always mounted (intensity fades) so the shader set never changes. Its shadow map covers one plinth and is
          rendered only when the light moves to another plinth (the exhibits never move). */}
      <spotLight ref={spot} name="ExhibitSpot" target={spotTarget} color={SPOT.color} intensity={0} distance={7} decay={2} angle={0.42} penumbra={0.75}
        castShadow shadow-autoUpdate={false} shadow-mapSize={[mapSize, mapSize]} shadow-camera-near={1} shadow-camera-far={7}
        shadow-bias={-0.00006} shadow-normalBias={0.0006} shadow-radius={3 * mapSize / 1024} shadow-intensity={0.7} />
      <group ref={contacts} name="ExhibitContact" visible={false}>
        <mesh name="ExhibitFloorContact" geometry={contactSurface} material={floorContact} dispose={null}
          position={[0, 0.001, 0]} rotation={[-Math.PI / 2, 0, 0]} scale={[FLOOR_CONTACT, FLOOR_CONTACT, 1]} receiveShadow raycast={noRaycast} />
        <mesh ref={topContactMesh} name="ExhibitTopContact" geometry={contactSurface} material={topContact} dispose={null}
          rotation={[-Math.PI / 2, 0, 0]} receiveShadow raycast={noRaycast} />
      </group>
      {EXHIBIT_SLOTS.map((slot, i) => {
        const { members, plinth: height } = slotExhibits[i];
        const size = exhibitPlinthSize(slot);
        const offsets = exhibitOffsets(slot);
        return (
          <group
            key={slot.exhibitIds.join("+")}
            ref={(group) => {
              groups.current[i] = group;
            }}
            name={`Exhibit_${slot.exhibitIds.join("+")}`}
            position={[...slot.position]}
            rotation={[0, exhibitHeading(slot), 0]}
          >
            {height > 0 && (
              <mesh geometry={plinth.geometry} material={plinth.material} scale={[size.width, height, size.depth]} castShadow receiveShadow raycast={noRaycast} />
            )}
            {members.map((exhibit, j) => (
              <ExhibitModel key={exhibit.id} exhibit={exhibit} position={[offsets[j], height, 0]} />
            ))}
          </group>
        );
      })}
    </group>
  );
}

function ExhibitModel({ exhibit, position }: { exhibit: ExhibitDefinition; position: readonly [number, number, number] }) {
  const { scene } = useGLTF(exhibitUrl(exhibit.id), false, true);
  useEffect(() => {
    scene.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      object.castShadow = true;
      object.receiveShadow = true;
      object.raycast = noRaycast;
    });
  }, [scene]);
  return <primitive object={scene} position={[...position]} scale={exhibit.display} />;
}
