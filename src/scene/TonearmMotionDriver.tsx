"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect } from "react";
import { ERAS, getEra } from "@/data/eras";
import type { EraId } from "@/data/types";
import type { ValueStore } from "@/state/valueStore";
import type { StationRig } from "@/stations/ListeningStation";
import type { TonearmMotionSystem } from "@/stations/tonearmMotion";
import type { TonearmDiagnostics } from "@/scene/dev/tonearmDiagnostics";

export interface TonearmMechanics {
  system: TonearmMotionSystem;
  rigs: Map<EraId, StationRig>;
  diagnostics: TonearmDiagnostics | null;
}

/**
 * The semantic ACTIVE station's full rig is animated (controller update + pivot writes). Every other
 * station's visible rig gets its era's current pose written as-is (placed directly by the record-change
 * sync, docs/RECORD_CHANGE.md §6) — two rotations each, no update, so a playing neighbour shows its arm in PLAY.
 */
export function TonearmMotionDriver({ mechanics, activeEra }: { mechanics: TonearmMechanics; activeEra: ValueStore<EraId> }) {
  const get = useThree(s => s.get);
  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
    const devWindow = window as Window & { __archiveTonearms?: TonearmMechanics };
    devWindow.__archiveTonearms = mechanics;
    return () => { delete devWindow.__archiveTonearms; };
  }, [mechanics]);
  useEffect(() => {
    const diagnostics = mechanics.diagnostics;
    if (!diagnostics) return;
    const gl = get().gl;
    const render = gl.render;
    gl.render = function (scene, camera) {
      render.call(this, scene, camera);
      diagnostics.capture(this, mechanics.rigs, mechanics.system);
    };
    return () => { gl.render = render; };
  }, [get, mechanics]);

  useFrame((_, delta) => {
    const era = activeEra.get();
    const rig = mechanics.rigs.get(era);
    const index = getEra(era).index;
    if (rig && rig.quality === "active") {
      const diagnostics = mechanics.diagnostics;
      const measured = diagnostics?.running ?? false;
      const start = measured ? performance.now() : 0;
      mechanics.system.update(delta, index);
      const state = mechanics.system.states[index];
      if (state) {
        rig.tonearmSwing.rotation.y = state.currentSwing;
        rig.tonearmLift.rotation.x = state.currentLift;
      }
      if (measured) diagnostics?.driverTime((performance.now() - start) * 1000);
    }
    for (const other of ERAS) {
      if (other.index === index && rig?.quality === "active") continue;
      const state = mechanics.system.states[other.index];
      const otherRig = mechanics.rigs.get(other.id);
      if (!state || !otherRig) continue;
      if (otherRig.tonearmSwing.rotation.y !== state.currentSwing) otherRig.tonearmSwing.rotation.y = state.currentSwing;
      if (otherRig.tonearmLift.rotation.x !== state.currentLift) otherRig.tonearmLift.rotation.x = state.currentLift;
    }
  });
  return null;
}
