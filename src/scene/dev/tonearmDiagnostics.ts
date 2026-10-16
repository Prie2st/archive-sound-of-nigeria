import type * as THREE from "three";
import type { EraId } from "@/data/types";
import type { StationRig } from "@/stations/ListeningStation";
import type { TonearmMotionSystem } from "@/stations/tonearmMotion";

/** Optional dev benchmark. Fixed buffers, no allocations during capture, no production sampling. */
export class TonearmDiagnostics {
  running = false;
  result = "";
  private mode: "still" | "motion" = "still";
  private era: EraId = "roots";
  private index = 0;
  private started = 0;
  private previous = 0;
  private count = 0;
  private cpu = 0;
  private mismatches = 0;
  private readonly frameMs = new Float64Array(1200);
  private readonly cpuUs = new Float64Array(1200);
  private readonly calls = new Float64Array(1200);
  private readonly triangles = new Float64Array(1200);

  start(mode: "still" | "motion", era: EraId, index: number, system: TonearmMotionSystem) {
    this.mode = mode; this.era = era; this.index = index;
    this.started = this.previous = performance.now(); this.count = this.mismatches = 0;
    this.result = "measuring 4 seconds (collapse inspector for comparison)…";
    this.running = true;
    if (mode === "motion") system.request(index, system.states[index]?.targetPose === "PLAY" ? "REST" : "PLAY");
  }

  driverTime(microseconds: number) { this.cpu = microseconds; }

  /** Called AFTER gl.render: counts describe what was drawn, and the visible rig has its frame pose. */
  capture(gl: THREE.WebGLRenderer, rigs: Map<EraId, StationRig>, system: TonearmMotionSystem) {
    if (!this.running) return;
    const now = performance.now();
    const state = system.states[this.index];
    const rig = rigs.get(this.era);
    if (!rig || rig.quality !== "active" || !state) {
      this.running = false; this.result = "measurement cancelled: era is no longer ACTIVE"; return;
    }
    if (rig.tonearmSwing.rotation.y !== state.currentSwing || rig.tonearmLift.rotation.x !== state.currentLift) this.mismatches++;
    if (now - this.started > 250 && this.count < this.frameMs.length) {
      const i = this.count++;
      this.frameMs[i] = now - this.previous; this.cpuUs[i] = this.cpu;
      this.calls[i] = gl.info.render.calls; this.triangles[i] = gl.info.render.triangles;
    }
    this.previous = now;
    if (now - this.started >= 4250) {
      this.running = false;
      const sorted = (values: Float64Array) => Array.from(values.subarray(0,this.count)).sort((a,b)=>a-b);
      const percentile = (values: number[], p: number) => values[Math.floor((values.length-1)*p)];
      const f=sorted(this.frameMs),c=sorted(this.cpuUs),d=sorted(this.calls),t=sorted(this.triangles);
      this.result = `${this.era} ${this.mode}: ${this.count} drawn frames · fps ${(1000/percentile(f,0.5)).toFixed(1)} · frame ms ${percentile(f,0.5).toFixed(2)} / p95 ${percentile(f,0.95).toFixed(2)}\n` +
        `calls ${d[0]}/${percentile(d,0.5)}/${d.at(-1)} · tris ${t[0]}/${percentile(t,0.5)}/${t.at(-1)} · driver µs median ${percentile(c,0.5).toFixed(2)} / p95 ${percentile(c,0.95).toFixed(2)} · pose mismatches ${this.mismatches}`;
      return;
    }
    if (this.mode === "motion" && state.phase === "IDLE") system.request(this.index,state.targetPose === "PLAY" ? "REST" : "PLAY");
  }
}
