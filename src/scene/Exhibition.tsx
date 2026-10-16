"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, type RefObject } from "react";
import * as THREE from "three";
import { ERAS, getEra, getEraLoopDistance } from "@/data/eras";
import { getHallLayout } from "@/data/hallLayout";
import { qualityForLoopDistance, type StationQuality } from "@/data/stationLod";
import type { StationModelVariant } from "@/data/textureProfiles";
import type { EraId } from "@/data/types";
import type { ExperienceQuality } from "@/config/quality";
import type { FocusController } from "@/state/focus";
import type { TravelController } from "@/state/travel";
import { useStoreValue, type ValueStore } from "@/state/valueStore";
import { ListeningStation, type StationRig } from "@/stations/ListeningStation";
import type { PlatterMotionSystem } from "@/stations/platterMotion";
import { StationInteraction } from "@/stations/StationInteraction";
import { RecordChangeDriver } from "@/scene/RecordChangeDriver";
import { TonearmMotionDriver, type TonearmMechanics } from "@/scene/TonearmMotionDriver";
import type { RecordChangeController } from "@/stations/recordChange";

interface ExhibitionProps {
  textures: StationModelVariant;
  experienceQuality: ExperienceQuality;
  /**
   * The era whose station is ACTIVE; its previous / next neighbours (wrapping GLOBAL ↔ ROOTS)
   * are NEARBY, the other five DISTANT. Set from the dev panel until the camera rig exists.
   */
  activeEra: ValueStore<EraId>;
  /** Development: force one tier on every station (LOD comparison) instead of the assignment above. */
  qualityOverride?: StationQuality | null;
  /** Development: DOM node for the per-station readout (tiers, triangles, texture memory). */
  statsRef?: RefObject<HTMLPreElement | null>;
  /** Development: log record / stylus / bounds alignment when a station changes tier (≈25 ms per era change). */
  logAlignment?: boolean;
  /** TRAVEL mode: the ACTIVE station gets the focus interaction volume (click / tap → focus). */
  interaction?: { focus: FocusController; travel: TravelController; showVolume: boolean };
  /**
   * Platter playback motion (docs/PLATTER_MOTION.md): one state per era, driven by the audio layer's
   * semantic answer `isPlaying(eraIndex)`; applied to whichever tier each station shows.
   */
  platters?: { system: PlatterMotionSystem; isPlaying: (eraIndex: number) => boolean };
  /** Development: a red radial line on every record, to see speed / direction / continuity. */
  rotationMarker?: boolean;
  tonearms?: TonearmMechanics;
  /** Record change (docs/RECORD_CHANGE.md): the one controller, and each era's selected (= mounted) record. */
  records?: { controller: RecordChangeController; selected: (eraId: EraId) => string };
}

/** Tier of each era's station for a given active era (wrap-aware, see getEraLoopDistance). */
const stationQualityFor =(activeEra: EraId, eraId: EraId): StationQuality =>
  qualityForLoopDistance(getEraLoopDistance(activeEra, eraId));

/** The eight listening stations of the marble hall, placed from the locked hall layout. */
export function Exhibition({
  textures,
  experienceQuality,
  activeEra: activeEraStore,
  qualityOverride = null,
  statsRef,
  logAlignment = false,
  interaction,
  platters,
  rotationMarker = false,
  tonearms,
  records,
}: ExhibitionProps) {
  const layout = getHallLayout();
  const activeEra = useStoreValue(activeEraStore);
  const group = useRef<THREE.Group>(null);
  const rigs = useRef(new Map<EraId, StationRig>());
  const logged = useRef(new Map<EraId, StationQuality>());
  // Stable ref callbacks, so memoised stations whose tier is unchanged skip re-rendering.
  const rigRefs = useMemo(
    () =>
      Object.fromEntries(
        ERAS.map((era) => [
          era.id,
          (rig: StationRig | null) => {
            if (rig) {
              rigs.current.set(era.id, rig);
              tonearms?.rigs.set(era.id, rig);
              // Every tier resolves identical poses: the era's controller exists from the start, so a playing
              // neighbour can show its arm in PLAY before it is ever ACTIVE (docs/RECORD_CHANGE.md §6).
              tonearms?.system.register(era.index, rig.tonearmPoses);
            } else {
              rigs.current.delete(era.id);
              tonearms?.rigs.delete(era.id);
            }
          },
        ]),
      ) as Record<EraId, (rig: StationRig | null) => void>,
    [tonearms],
  );

  // Development check (for stations whose tier changed): each record sits where the hall
  // layout expects the platter and lies flat; the bounds show whether tiers line up (no jump).
  useEffect(() => {
    if (process.env.NODE_ENV !== "development" || !logAlignment) return;
    const mm = (v: THREE.Vector3) => v.toArray().map((n) => (n * 1000).toFixed(1)).join(", ");
    for (const [eraId, rig] of rigs.current) {
      if (logged.current.get(eraId) === rig.quality) continue;
      logged.current.set(eraId, rig.quality);
      rig.root.updateWorldMatrix(true, true);
      const expected = new THREE.Vector3(...layout.stations[getEra(eraId).index].platter);
      const actual = rig.record.getWorldPosition(new THREE.Vector3());
      const up = new THREE.Vector3(0, 1, 0).transformDirection(rig.record.matrixWorld);
      const stylus = rig.stylusTip.getWorldPosition(new THREE.Vector3());
      const bounds = new THREE.Box3().setFromObject(rig.root);
      console.info(
        `[station ${eraId} · ${rig.quality}] record centre (${actual.toArray().map((v) => v.toFixed(3)).join(", ")}),` +
          ` Δ to layout platter ${(actual.distanceTo(expected) * 1000).toFixed(1)} mm, record up·Y ${up.y.toFixed(4)};` +
          ` stylus (${mm(stylus)}) mm; bounds centre (${mm(bounds.getCenter(new THREE.Vector3()))}) size (${mm(bounds.getSize(new THREE.Vector3()))}) mm`,
      );
    }
  }, [layout, activeEra, qualityOverride, logAlignment]);

  return (
    <group name="Exhibition" ref={group}>
      {ERAS.map((era) => (
        <ListeningStation
          key={era.id}
          era={era}
          station={layout.stations[era.index]}
          quality={qualityOverride ?? stationQualityFor(activeEra, era.id)}
          textures={textures}
          experienceQuality={experienceQuality}
          devRotationMarker={rotationMarker}
          ref={rigRefs[era.id]}
        />
      ))}
      {interaction && (
        <StationInteraction
          index={getEra(activeEra).index}
          station={layout.stations[getEra(activeEra).index]}
          focus={interaction.focus}
          travel={interaction.travel}
          debug={interaction.showVolume}
        />
      )}
      {/* Order matters: the record change decides first, then the platter and tonearm follow in the same frame. */}
      {records && platters && <RecordChangeDriver controller={records.controller} rigs={rigs} platters={platters.system} selected={records.selected} />}
      {platters && <PlatterMotionDriver system={platters.system} isPlaying={platters.isPlaying} rigs={rigs} />}
      {tonearms && <TonearmMotionDriver mechanics={tonearms} activeEra={activeEraStore} />}
      {statsRef && <StationStatsReadout statsRef={statsRef} rigs={rigs} exhibition={group} />}
    </group>
  );
}

/**
 * Platter playback motion, once per frame: update the per-era states from the audio layer, then set
 * each station's CURRENT tier platter to its era's angle (the record rides on the platter's
 * RecordAnchor, so it follows — one rotation, never two). The angle belongs to the era, so a tier
 * switch (the new tier's platter gets the angle before its first render) or an era becoming active
 * never resets it. Allocation-free; the tonearm and sleeve are not touched.
 */
function PlatterMotionDriver({
  system,
  isPlaying,
  rigs,
}: {
  system: PlatterMotionSystem;
  isPlaying: (eraIndex: number) => boolean;
  rigs: RefObject<Map<EraId, StationRig>>;
}) {
  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
    const devWindow = window as Window & { __archivePlatters?: { system: PlatterMotionSystem; rigs: Map<EraId, StationRig> } };
    devWindow.__archivePlatters = { system, rigs: rigs.current };
    return () => {
      delete devWindow.__archivePlatters;
    };
  }, [system, rigs]);

  useFrame((_, delta) => {
    system.update(delta, isPlaying);
    for (const era of ERAS) {
      const rig = rigs.current.get(era.id);
      if (rig) rig.platter.rotation.y = system.states[era.index].angle;
    }
  });
  return null;
}

const meshTriangles = (mesh: THREE.Mesh) => {
  const geometry = mesh.geometry as THREE.BufferGeometry;
  return (geometry.index?.count ?? geometry.attributes.position.count) / 3;
};

/**
 * Development readout (2 Hz, written straight into the DOM — no React state per frame):
 * per station its tier, triangles, and the triangles / meshes inside the camera frustum
 * (what three.js will draw after frustum culling), plus the decoded texture memory of the
 * station models vs the dev placards (RGBA8 + mips, unique textures only).
 */
function StationStatsReadout({
  statsRef,
  rigs,
  exhibition,
}: {
  statsRef: RefObject<HTMLPreElement | null>;
  rigs: RefObject<Map<EraId, StationRig>>;
  exhibition: RefObject<THREE.Group | null>;
}) {
  const elapsed = useRef(0);
  const frustum = useRef(new THREE.Frustum());
  const viewProjection = useRef(new THREE.Matrix4());

  useFrame((state, delta) => {
    elapsed.current += delta;
    if (elapsed.current < 0.5 || !statsRef.current || !exhibition.current) return;
    elapsed.current = 0;
    const { camera } = state;
    viewProjection.current.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    frustum.current.setFromProjectionMatrix(viewProjection.current);

    const rows: string[] = [];
    const totals = { triangles: 0, visible: 0, meshes: 0 };
    for (const era of ERAS) {
      const rig = rigs.current.get(era.id);
      if (!rig) continue;
      let triangles = 0;
      let visible = 0;
      let meshes = 0;
      rig.root.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        const count = meshTriangles(object);
        triangles += count;
        if (object.visible && (!object.frustumCulled || frustum.current.intersectsObject(object))) {
          visible += count;
          meshes++;
        }
      });
      totals.triangles += triangles;
      totals.visible += visible;
      totals.meshes += meshes;
      rows.push(
        `${`${era.number} ${era.title}`.padEnd(14)} ${rig.quality.padEnd(8)} ${triangles.toLocaleString().padStart(8)} ${visible.toLocaleString().padStart(8)} ${String(meshes).padStart(3)}`,
      );
    }

    const textures = { models: new Set<THREE.Texture>(), placards: new Set<THREE.Texture>() };
    exhibition.current.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      const bucket = object.name.startsWith("DevPlacard") ? textures.placards : textures.models;
      for (const material of [object.material].flat() as THREE.Material[]) {
        for (const value of Object.values(material)) if (value instanceof THREE.Texture) bucket.add(value);
      }
    });
    const megabytes = (set: Set<THREE.Texture>) => {
      let bytes = 0;
      for (const texture of set) {
        const image = texture.image as { width?: number; height?: number } | undefined;
        if (image?.width && image.height) bytes += image.width * image.height * 4 * (4 / 3);
      }
      return `${(bytes / 1024 / 1024).toFixed(1)} MB (${set.size})`;
    };

    statsRef.current.textContent =
      `station        tier       tris  visible  meshes\n` +
      `${rows.join("\n")}\n` +
      `TOTAL                   ${totals.triangles.toLocaleString().padStart(8)} ${totals.visible.toLocaleString().padStart(8)} ${String(totals.meshes).padStart(3)}\n` +
      `station textures: models ${megabytes(textures.models)} · dev placards ${megabytes(textures.placards)}`;
  });

  return null;
}
