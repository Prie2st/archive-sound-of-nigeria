"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { getEra } from "@/data/eras";
import type { EraId } from "@/data/types";
import type { TonearmMechanics } from "@/scene/TonearmMotionDriver";
import { useStoreValue, type ValueStore } from "@/state/valueStore";
import { TONEARM_POSES, type TonearmPose } from "@/stations/tonearmMotion";

const LABELS: Record<TonearmPose, string> = { REST: "REST", LIFTED_REST: "LIFT REST", LIFTED_PLAY: "LIFT PLAY", PLAY: "PLAY" };

/** Mechanical controls only, mounted by the development inspector. No production actions. */
export function TonearmControls({ mechanics, activeEra }: { mechanics: TonearmMechanics; activeEra: ValueStore<EraId> }) {
  const eraId = useStoreValue(activeEra);
  const era = getEra(eraId);
  const readout = useRef<HTMLPreElement>(null);
  useEffect(() => {
    const tip = new THREE.Vector3();
    const record = new THREE.Vector3();
    const write = () => {
      if (!readout.current) return;
      const active = getEra(activeEra.get());
      const rig = mechanics.rigs.get(active.id);
      const state = mechanics.system.states[active.index];
      if (!rig || !state) { readout.current.textContent = "ACTIVE rig not yet loaded"; return; }
      rig.root.updateWorldMatrix(true, true); // 4 Hz dev inspection only; never in the motion driver.
      rig.stylusTip.getWorldPosition(tip);
      rig.record.getWorldPosition(record);
      const surfaceY = record.y + (rig.record.userData.thickness as number);
      const radius = Math.hypot(tip.x - record.x, tip.z - record.z);
      const deg = (n: number) => `${(n * 180 / Math.PI).toFixed(2)}° (${n.toFixed(5)} rad)`;
      readout.current.textContent = [
        `era       ${active.number} ${active.title} · tier ${rig.quality}`,
        `pose      ${state.currentPose ?? state.phase} → ${state.targetPose} · ${state.phase}`,
        `swing     ${deg(state.currentSwing)} → ${deg(state.targetSwing)}`,
        `lift      ${deg(state.currentLift)} → ${deg(state.targetLift)}`,
        `StylusTip ${tip.toArray().map(n => n.toFixed(5)).join(", ")} m`,
        `surface   ${((tip.y - surfaceY) * 1000).toFixed(3)} mm above plane · radius ${(radius * 1000).toFixed(2)} mm${radius > (rig.record.userData.diameter as number) / 2 ? " (outside disc)" : ""}`,
        rig.quality === "active" ? "mechanical only · audio/platter independent" : "static simplified arm · controller paused",
        mechanics.diagnostics?.result ?? "",
      ].join("\n");
    };
    write();
    const timer = window.setInterval(write, 250);
    return () => window.clearInterval(timer);
  }, [mechanics, activeEra]);
  return (
    <section className="dev-panel__section">
      <strong>TONEARM</strong>
      <div className="dev-panel__buttons">
        {era.number} {era.title}:
        {TONEARM_POSES.map(pose => (
          <button key={pose} type="button" onClick={() => {
            if (mechanics.rigs.get(eraId)?.quality === "active") mechanics.system.request(era.index, pose);
          }}>{LABELS[pose]}</button>
        ))}
      </div>
      <div className="dev-panel__buttons">
        <button type="button" onClick={() => mechanics.diagnostics?.start("still",eraId,era.index,mechanics.system)}>MEASURE STILL</button>
        <button type="button" onClick={() => mechanics.diagnostics?.start("motion",eraId,era.index,mechanics.system)}>MEASURE MOTION</button>
      </div>
      <pre ref={readout} />
    </section>
  );
}
