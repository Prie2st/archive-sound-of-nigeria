"use client";

import { useGLTF } from "@react-three/drei";
import { memo, useEffect, useLayoutEffect, useImperativeHandle, useMemo, type Ref } from "react";
import * as THREE from "three";
import { QUALITY_SETTINGS, type ExperienceQuality } from "@/config/quality";
import type { StationLayout } from "@/data/hallLayout";
import { STATION_QUALITIES, lodNodeName, sleeveNodeName, type StationQuality } from "@/data/stationLod";
import { stationModelUrl, type StationModelVariant } from "@/data/textureProfiles";
import type { Era } from "@/data/types";
import { LISTENING_DESK } from "@/stations/albumStack";
import { createAlbumStack, deskGeometry, type AlbumStackView } from "@/stations/listeningDesk";
import { createStationPresentation, type StationPresentation } from "@/stations/recordArtwork";
import { StationDevPlacard } from "@/stations/StationDevPlacard";
import { resolveTonearmPoses, type TonearmAngles, type TonearmPoses } from "@/stations/tonearmMotion";

/** Starts loading the station models of a texture profile (each GLB is loaded once and cached). */
export function preloadStationModels(textures: StationModelVariant) {
  for (const model of ["table", "turntable", "vinyl"] as const) useGLTF.preload(stationModelUrl(model, textures), false, true);
}

export type { StationQuality } from "@/data/stationLod";

/** Tonearm poses authored by the model build (radians, see CLAUDE.md §9). */
export type { TonearmAngles } from "@/stations/tonearmMotion";

/**
 * Handles for future animation (record switching, CLAUDE.md §5). Resolved once when
 * the station is assembled — never looked up per frame. Every quality tier has the same
 * handles in the same frame, so a future tier switch can copy the pose (platter
 * rotation, tonearm angles) from one rig to the next. Only ACTIVE is meant to be
 * interactive (record switching); lower tiers just hold a pose.
 */
export interface StationRig {
  /** Geometry tier this rig was assembled from. */
  quality: StationQuality;
  /** The assembly in station space (the parent group carries the hall-layout transform). */
  root: THREE.Group;
  /**
   * THE playback rotation pivot: rotation.y only (negative = clockwise seen from above; authored rotation
   * is identity). The record rides on its RecordAnchor child — never rotate the record separately.
   */
  platter: THREE.Object3D;
  /** rotation.y swings the arm (see `angles`). */
  tonearmSwing: THREE.Object3D;
  /** rotation.x raises / lowers the arm (see `angles`). */
  tonearmLift: THREE.Object3D;
  stylusTip: THREE.Object3D;
  /** The vinyl Record (record + label), parented to the platter's RecordAnchor. */
  record: THREE.Object3D;
  /**
   * The vinyl GLB's sleeve, NOT mounted: since the listening desk it only provides the station's shared sleeve
   * material (presentation.sleeveFront, used by the NEARBY stack top). The visible records are the album stack.
   */
  sleeve: THREE.Object3D;
  /** The era's five-record album stack on the desk (docs/LISTENING_STATION_TABLE.md); posed by the record-change driver. */
  albumStack: AlbumStackView;
  /** The station's label / sleeve identity materials — ONE object shared by all three tier rigs. */
  presentation: StationPresentation;
  angles: TonearmAngles;
  tonearmPoses: TonearmPoses;
}

interface ListeningStationProps {
  era: Era;
  station: StationLayout;
  /** Geometry tier (src/data/stationLod.ts): full / simplified / proxy models. */
  quality: StationQuality;
  /** Texture profile of the station models (src/data/textureProfiles.ts); same geometry in all. */
  textures: StationModelVariant;
  experienceQuality: ExperienceQuality;
  /** Animation handles for the future record-switching controller. */
  ref?: Ref<StationRig>;
  /** Development-only era placard (number, title, dates). */
  devTypography?: boolean;
  /** Development-only red radial line on the record (rotation speed / direction / continuity checks). */
  devRotationMarker?: boolean;
}

/** Shared by every dev rotation marker (one geometry, one material). */
let markerParts: { geometry: THREE.PlaneGeometry; material: THREE.MeshBasicMaterial } | null = null;

// Native shadow receivers keep contact readable even under bright image-based lighting.
// They reuse the existing light maps: no extra lights, depth captures, blur passes or fake blobs.
const contactSurface = new THREE.PlaneGeometry(1, 1);
const floorContact = new THREE.ShadowMaterial({ color: "#302a22", opacity: 0.48, depthWrite: false });
const deskContact = new THREE.ShadowMaterial({ color: "#241f19", opacity: 0.42, depthWrite: false });
const noContactRaycast = () => undefined;
const deskCentre = (LISTENING_DESK.slab.xMin + LISTENING_DESK.slab.xMax) / 2;

/** DEV ONLY: a thin red radial line lying on the record's top face, from the label edge outward (local +X). */
function createRotationMarker(record: THREE.Object3D): THREE.Mesh {
  markerParts ??= {
    geometry: new THREE.PlaneGeometry(0.085, 0.005).rotateX(-Math.PI / 2).translate(0.0975, 0, 0),
    material: new THREE.MeshBasicMaterial({ color: "#ff2d2d", toneMapped: false }),
  };
  const thickness = typeof record.userData.thickness === "number" ? record.userData.thickness : 0.0015;
  const marker = new THREE.Mesh(markerParts.geometry, markerParts.material);
  marker.name = "DevRotationMarker";
  marker.position.y = thickness + 0.0004;
  return marker;
}

function requireNode(root: THREE.Object3D, name: string): THREE.Object3D {
  const node = root.getObjectByName(name);
  if (!node) throw new Error(`ListeningStation: node "${name}" not found in ${root.name || "model"}`);
  return node;
}

/**
 * Assembles one tier of a station from the shared models (clones share geometry and
 * materials). Built once per tier and kept: switching tier only toggles visibility.
 */
function buildStationRig(
  eraId: string,
  quality: StationQuality,
  table: THREE.Object3D,
  turntable: THREE.Object3D,
  vinyl: THREE.Object3D,
  rotationMarker: boolean,
): Omit<StationRig, "presentation" | "albumStack"> {
  const name = (base: string) => lodNodeName(base, quality);
  const root = new THREE.Group();
  root.name = `Station:${eraId}`;

  // The listening desk: two original table bases under one slab, merged into one draw with the table's own
  // material (shared by every station). Its surface is the original table top, so the turntable sits on the
  // same anchor height as before — the platter, tonearm, focus target and audio source do not move.
  table.updateMatrixWorld(true);
  const tableMesh = requireNode(table, "TableMesh") as THREE.Mesh;
  const desk = new THREE.Mesh(deskGeometry(tableMesh), tableMesh.material);
  desk.name = "ListeningDesk";
  root.add(desk);
  const deskTop = new THREE.Object3D();
  deskTop.name = "DeskTopAnchor";
  deskTop.position.set(0, LISTENING_DESK.top, 0);
  root.add(deskTop);
  const turntableClone = requireNode(turntable, name("Turntable")).clone(true);
  deskTop.add(turntableClone);

  // Record on the platter's authored record anchor (spins with the platter).
  const record = requireNode(vinyl, name("Record")).clone(true);
  record.position.set(0, 0, 0);
  requireNode(turntableClone, name("RecordAnchor")).add(record);
  if (rotationMarker) record.add(createRotationMarker(record));

  // The vinyl GLB's sleeve is no longer placed on the floor beside the table (the records now lie on the desk
  // as the album stack); the clone only feeds the station's shared sleeve material.
  const sleeve = requireNode(vinyl, sleeveNodeName(quality)).clone(true);

  const tonearmSwing = requireNode(turntableClone, name("TonearmSwing"));
  const extras = tonearmSwing.userData as Partial<TonearmAngles>;
  const angle = (key: keyof TonearmAngles) => {
    const value = extras[key];
    if (typeof value !== "number") throw new Error(`ListeningStation: TonearmSwing extras missing "${key}"`);
    return value;
  };

  const angles: TonearmAngles = {
    restSwing: angle("restSwing"), leadInSwing: angle("leadInSwing"), runOutSwing: angle("runOutSwing"),
    restLift: angle("restLift"), playLift: angle("playLift"), raisedLift: angle("raisedLift"),
  };
  const stylusTip = requireNode(turntableClone, name("StylusTip"));
  const platter = requireNode(turntableClone, name("Platter"));
  const thickness = record.userData.thickness as number;
  const tonearmPoses = resolveTonearmPoses(angles, {
    tipY: stylusTip.position.y, tipZ: stylusTip.position.z,
    surfaceY: platter.position.y + thickness - tonearmSwing.position.y,
  });

  return {
    quality,
    root,
    platter,
    tonearmSwing,
    tonearmLift: requireNode(turntableClone, name("TonearmLift")),
    stylusTip,
    record,
    sleeve,
    angles,
    tonearmPoses,
  };
}

/**
 * One data-driven listening station: LISTENING DESK + TURNTABLE + VINYL + the era's ALBUM STACK, assembled on
 * the models' authored anchors and placed at the hall-layout transform. Each model is
 * loaded once (useGLTF cache) and cloned per station; clones share geometry and materials.
 * `quality` picks the geometry tier inside the same GLBs (docs/STATION_LOD.md); the table
 * is the same in every tier, and the station transform never depends on the tier.
 */
export const ListeningStation = memo(function ListeningStation({
  era,
  station,
  quality,
  textures,
  experienceQuality,
  ref,
  devTypography = false,
  devRotationMarker = false,
}: ListeningStationProps) {
  const table = useGLTF(stationModelUrl("table", textures), false, true);
  const turntable = useGLTF(stationModelUrl("turntable", textures), false, true);
  const vinyl = useGLTF(stationModelUrl("vinyl", textures), false, true);

  // All three tiers are assembled once (cheap: clones share geometry and materials); an
  // era change only toggles which one is visible — no cloning, no remounting.
  const rigs = useMemo(() => {
    const parts = STATION_QUALITIES.map((q) => [q, buildStationRig(era.id, q, table.scene, turntable.scene, vinyl.scene, devRotationMarker)] as const);
    // One identity (label + sleeve materials) per station, shared by its three tiers: a record change
    // or a remembered selection shows at every distance, and only texture maps ever change.
    const presentation = createStationPresentation(
      parts.map(([, rig]) => rig.record),
      parts.map(([, rig]) => rig.sleeve),
    );
    // The album stack per tier: full five-sleeve stack (ACTIVE), a pile with the selected art on top (NEARBY),
    // a plain pile (DISTANT). One record per playlist entry; the era's content is the only difference.
    return Object.fromEntries(
      parts.map(([q, rig]) => {
        const albumStack = createAlbumStack(q, era.tracks.length, presentation.sleeveFront);
        rig.root.add(albumStack.group);
        return [q, { ...rig, presentation, albumStack }];
      }),
    ) as Record<StationQuality, StationRig>;
  }, [era.id, era.tracks.length, table.scene, turntable.scene, vinyl.scene, devRotationMarker]);
  useEffect(() => () => STATION_QUALITIES.forEach((q) => rigs[q].albumStack.dispose()), [rigs]);
  const rig = rigs[quality];

  useLayoutEffect(() => {
    const detail = QUALITY_SETTINGS[experienceQuality].shadowDetail;
    for (const q of STATION_QUALITIES) rigs[q].root.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      const desk = object.name === "ListeningDesk";
      const stackBody = object.name === "AlbumSleeveBodies" || object.name === "AlbumSleevePile";
      const deck = /^(BodyMesh|PlatterMesh)/.test(object.name);
      const fine = /^(TonearmMesh|RecordMesh)/.test(object.name);
      object.castShadow = desk || stackBody || (q === "active" && (deck || (detail === "full" && fine)));
      object.receiveShadow = desk || stackBody || object.name === "AlbumSleeveArt" ||
        (q === "active" && detail !== "minimal" && /^(BodyMesh|PlatterMesh|RecordMesh|LabelMesh)/.test(object.name));
    });
  }, [rigs, experienceQuality]);

  useImperativeHandle(ref, () => rig, [rig]);

  // Station root: the locked hall-layout transform; everything below moves with it.
  const [x, y, z] = station.position;
  return (
    <group name={`ListeningStation:${era.id}`} position={[x, y, z]} rotation={[0, station.heading, 0]} userData={{ quality }}>
      {STATION_QUALITIES.map((q) => (
        <primitive key={q} object={rigs[q].root} visible={q === quality} />
      ))}
      <mesh name="DeskFloorContact" geometry={contactSurface} material={floorContact} dispose={null}
        position={[deskCentre, 0.001, 0]} rotation={[-Math.PI / 2, 0, 0]} scale={[1.9, 1.6, 1]}
        receiveShadow raycast={noContactRaycast} />
      {quality === "active" && <mesh name="DeckAndSleeveContact" geometry={contactSurface} material={deskContact} dispose={null}
        position={[deskCentre, LISTENING_DESK.top + 0.0002, 0]} rotation={[-Math.PI / 2, 0, 0]}
        scale={[LISTENING_DESK.slab.xMax - LISTENING_DESK.slab.xMin, LISTENING_DESK.slab.zMax - LISTENING_DESK.slab.zMin, 1]}
        receiveShadow raycast={noContactRaycast} />}
      {devTypography && <StationDevPlacard era={era} />}
    </group>
  );
});

