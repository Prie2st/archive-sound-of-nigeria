"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useState, type RefObject } from "react";
import { ERAS } from "@/data/eras";
import type { EraId } from "@/data/types";
import { AlbumStackSystem } from "@/stations/albumStack";
import type { StationRig } from "@/stations/ListeningStation";
import type { PlatterMotionSystem } from "@/stations/platterMotion";
import { presentRecord, sleeveArtworkTexture } from "@/stations/recordArtwork";
import type { RecordChangeController } from "@/stations/recordChange";

/** Each era's playlist as track ids (static data, resolved once). */
const PLAYLISTS = ERAS.map((era) => era.tracks.map((track) => track.id));

/**
 * Applies the record-change controller to the scene, once per frame and BEFORE the platter and
 * tonearm drivers (mounted first): advances the controller, then writes
 *   - every station's identity (label / sleeve maps) from its selected = mounted record,
 *   - the changing station's record offset,
 *   - every station's ALBUM STACK (docs/LISTENING_STATION_TABLE.md): at rest on the selection's order; during a
 *     change, the browse choreography gated by the controller's phase (lift → reorder → settle at the commit).
 * The offset is in turntable space; the record stays a child of the platter's RecordAnchor, so the
 * offset is rotated by the (stopped) platter angle into the anchor's frame. When not changing, the
 * record sits exactly at the canonical mounted transform (0, 0, 0). No allocations, no React state.
 */
export function RecordChangeDriver({
  controller,
  rigs,
  platters,
  selected,
}: {
  controller: RecordChangeController;
  rigs: RefObject<Map<EraId, StationRig>>;
  platters: PlatterMotionSystem;
  /** The era's selected (= mounted) record. */
  selected: (eraId: EraId) => string;
}) {
  const [stacks] = useState(() => new AlbumStackSystem(ERAS.length));

  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
    const devWindow = window as Window & { __archiveRecords?: { controller: RecordChangeController; rigs: Map<EraId, StationRig>; stacks: AlbumStackSystem } };
    devWindow.__archiveRecords = { controller, rigs: rigs.current, stacks };
    return () => {
      delete devWindow.__archiveRecords;
    };
  }, [controller, rigs, stacks]);

  useFrame((_, delta) => {
    controller.update(delta);
    const moving = controller.changing ? controller.eraIndex : -1;
    const request = controller.request;
    const [x, y, z] = controller.vinyl;
    for (const era of ERAS) {
      const rig = rigs.current.get(era.id);
      const mounted = selected(era.id);
      // The stack follows the selection (and, for the changing era, the controller's phase) even when the era's
      // rig is not mounted, so a remembered selection is already in order when the station comes into view.
      const change = request && request.eraId === era.id ? request : null;
      stacks.update(era.index, delta, PLAYLISTS[era.index], mounted, change, controller.phase, controller.restoring);
      if (!rig) continue;
      presentRecord(rig.presentation, era.id, mounted);
      const stack = stacks.eras[era.index];
      rig.albumStack.applyPoses(stack.poses, stack.version);
      dressStack(rig, era.id, era.index);
      const position = rig.record.position;
      if (era.index === moving) {
        const angle = platters.states[era.index].angle; // anchor frame = turntable frame rotated by the platter
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        position.set(x * cos - z * sin, y, x * sin + z * cos);
      } else if (position.x !== 0 || position.y !== 0 || position.z !== 0) position.set(0, 0, 0);
    }
  });
  return null;
}

/**
 * Gives the ACTIVE stack's sleeves their own records' artwork, loading lazily (only stations that become ACTIVE
 * load their five sleeves; textures are shared with the deck's once-per-URL artwork cache). Cheap once dressed.
 */
function dressStack(rig: StationRig, eraId: EraId, eraIndex: number) {
  const materials = rig.albumStack.artMaterials;
  if (materials.length === 0) return;
  const playlist = PLAYLISTS[eraIndex];
  for (let i = 0; i < materials.length; i++) {
    const material = materials[i];
    if (material.userData.dressed) continue;
    const texture = sleeveArtworkTexture(eraId, playlist[i]);
    if (texture === undefined) continue; // still loading: the plain card face shows meanwhile
    material.map = texture ?? rig.presentation.defaultSleeveMap;
    material.needsUpdate = true;
    material.userData.dressed = true;
  }
}
