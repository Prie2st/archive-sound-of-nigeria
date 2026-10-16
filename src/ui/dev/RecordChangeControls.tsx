"use client";

import { useEffect, useRef } from "react";
import type { AudioEngine } from "@/audio/engine";
import { getEra, getEraByIndex } from "@/data/eras";
import type { EraId } from "@/data/types";
import { useStoreValue, type ValueStore } from "@/state/valueStore";
import type { PlatterMotionSystem } from "@/stations/platterMotion";
import { artworkStats } from "@/stations/recordArtwork";
import type { RecordChangeController } from "@/stations/recordChange";
import type { TonearmMotionSystem } from "@/stations/tonearmMotion";

const short = (trackId: string | null) => (trackId === null ? "—" : trackId.length > 30 ? `${trackId.slice(0, 29)}…` : trackId);

/**
 * DEV INSPECTOR → RECORD CHANGE (development builds only): the controller's semantic state, the deck it
 * drives and its invariants, 4× per second into the DOM. Actions go through the same public API as the
 * production controls (so they are refused outside FOCUS); no phase mutation is exposed.
 */
export function RecordChangeControls({
  records,
  audio,
  platters,
  tonearms,
  activeEra,
}: {
  records: RecordChangeController;
  audio: AudioEngine;
  platters: PlatterMotionSystem;
  tonearms: TonearmMotionSystem;
  activeEra: ValueStore<EraId>;
}) {
  const readout = useRef<HTMLPreElement>(null);
  const eraId = useStoreValue(activeEra);

  useEffect(() => {
    const write = () => {
      const pre = readout.current;
      if (!pre) return;
      const era = getEraByIndex(records.eraIndex);
      const arm = tonearms.states[era.index];
      const target = records.targetTrackId;
      const art = artworkStats();
      const problems = records.checkInvariants();
      pre.textContent = [
        `era       ${era.number} ${era.title} · phase ${records.phase}${records.restoring ? " (restoring)" : ""}`,
        `mounted   ${short(audio.selection.get(era.id))}  (selected)`,
        `pending   ${short(records.pendingTrackId)}${records.committed ? " · committed" : ""}`,
        `playing   ${short(audio.eraVoiceTrack(era.id))}${audio.isEraHeld(era.id) ? " · era HELD" : ""}`,
        `queued    ${records.queued ?? "—"} · exit ${records.exitPending ? "PENDING" : "—"} · last ${records.lastOutcome ?? "—"} · completed ${records.completed}`,
        `platter   ${platters.states[era.index].currentRpm.toFixed(2)} RPM (target ${platters.states[era.index].targetRpm.toFixed(2)})`,
        `tonearm   ${arm ? `${arm.currentPose ?? arm.phase} → ${arm.targetPose}` : "—"}`,
        `vinyl     lift ${(records.vinyl[1] * 1000).toFixed(1)} mm · lateral ${(records.vinyl[0] * 1000).toFixed(1)} mm · sleeve ${(records.sleeve * 100).toFixed(0)} %`,
        `dest      audio ${target ? audio.trackLoadState(era.id, target) : "—"}`,
        `locks     input ${records.inputOpen() ? "open" : "LOCKED"} · focus exit ${records.changing ? "LOCKED" : "free"}`,
        `artwork   ${art.textures} textures (${(art.bytes / 1024 / 1024).toFixed(1)} MB)`,
        `checks    ${problems.length ? problems.join(" | ") : "all invariants hold"}`,
      ].join("\n");
    };
    write();
    const timer = window.setInterval(write, 250);
    return () => window.clearInterval(timer);
  }, [records, audio, platters, tonearms]);

  const era = getEra(eraId);
  return (
    <section className="dev-panel__section">
      <strong>RECORD CHANGE</strong>
      <div className="dev-panel__buttons">
        {era.number} {era.title} (FOCUS only):
        <button type="button" onClick={() => records.requestStep("previous")}>
          PREVIOUS
        </button>
        <button type="button" onClick={() => records.requestStep("next")}>
          NEXT
        </button>
        <button type="button" onClick={() => records.requestTrack(era.heroTrackId)}>
          RESET TO HERO
        </button>
      </div>
      <pre ref={readout} />
    </section>
  );
}
