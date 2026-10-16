/**
 * Platter motion: spring timing, frame-rate independence, delta clamping, angle wrapping,
 * direction (clockwise from above) and per-era independence. Run with: npm test
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import * as THREE from "three";
import { PLATTER_MOTION_CONFIG, PlatterMotionSystem, settleOmega } from "./platterMotion.ts";

const RPM = PLATTER_MOTION_CONFIG.rpm;
const TAU = Math.PI * 2;
const close = (a: number, b: number, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≉ ${b}`);

/** Runs `seconds` at `fps` (or an explicit list of frame deltas) with a fixed playing flag per era. */
function run(system: PlatterMotionSystem, seconds: number, playing: (index: number) => boolean, fps = 60) {
  const frames = Math.round(seconds * fps);
  for (let i = 0; i < frames; i++) system.update(1 / fps, playing);
}

/** Unwrapped angle travelled between two wrapped angles, assuming less than half a turn per step. */
const stepAngle = (from: number, to: number) => {
  let d = (to - from) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
};

describe("platter motion — spring", () => {
  it("settleOmega solves (1 + ωt)·e^(−ωt) = fraction", () => {
    for (const [seconds, fraction] of [
      [1, 0.02],
      [1.2, 0.02],
      [0.5, 0.05],
    ]) {
      const x = settleOmega(seconds, fraction) * seconds;
      close((1 + x) * Math.exp(-x), fraction, 1e-12);
    }
  });

  it("locked / not playing: every platter stays at rest (no motion, no work)", () => {
    const system = new PlatterMotionSystem(8);
    run(system, 3, () => false);
    for (const state of system.states) assert.deepEqual([state.targetRpm, state.currentRpm, state.rpmVelocity, state.angle], [0, 0, 0, 0]);
  });

  it("spins up smoothly to 33⅓ RPM: monotonic, no overshoot, within 2 % at spinUpTime", () => {
    const system = new PlatterMotionSystem(1);
    let previous = 0;
    let atHalf = 0;
    for (let frame = 1; frame <= 120; frame++) {
      system.update(1 / 60, () => true);
      const rpm = system.states[0].currentRpm;
      assert.ok(rpm >= previous - 1e-12 && rpm <= RPM + 1e-9, `frame ${frame}: ${rpm}`);
      assert.ok(rpm - previous < RPM * 0.05, `jump at frame ${frame}`);
      if (frame === 30) atHalf = rpm;
      if (frame === 60) close(rpm, RPM * (1 - PLATTER_MOTION_CONFIG.settleFraction), 0.05);
      previous = rpm;
    }
    assert.equal(system.states[0].targetRpm, RPM);
    assert.ok(atHalf > RPM * 0.3 && atHalf < RPM * 0.9, `at 0.5 s: ${atHalf}`);
  });

  it("spins down smoothly to rest: monotonic, within 2 % at spinDownTime, then exactly 0", () => {
    const system = new PlatterMotionSystem(1);
    run(system, 3, () => true);
    let previous = system.states[0].currentRpm;
    for (let frame = 1; frame <= 72; frame++) {
      system.update(1 / 60, () => false);
      const rpm = system.states[0].currentRpm;
      assert.ok(rpm <= previous + 1e-12 && rpm >= 0, `frame ${frame}: ${rpm}`);
      previous = rpm;
    }
    close(previous, RPM * PLATTER_MOTION_CONFIG.settleFraction, 0.05);
    run(system, 3, () => false);
    assert.deepEqual([system.states[0].currentRpm, system.states[0].rpmVelocity], [0, 0]);
  });

  it("reverses smoothly when playback toggles mid spin-up (no jump in RPM)", () => {
    const system = new PlatterMotionSystem(1);
    run(system, 0.4, () => true);
    let previous = system.states[0].currentRpm;
    for (let frame = 0; frame < 120; frame++) {
      system.update(1 / 60, () => false);
      assert.ok(Math.abs(system.states[0].currentRpm - previous) < RPM * 0.05);
      previous = system.states[0].currentRpm;
    }
  });
});

describe("platter motion — time, not frames", () => {
  /** Spin up for 2 s, steady 1 s, spin down for 2 s with the given frame deltas. */
  const profile = (deltas: (time: number) => number) => {
    const system = new PlatterMotionSystem(1);
    let time = 0;
    let unwrapped = 0;
    let last = 0;
    const samples: Record<string, { rpm: number; angle: number }> = {};
    for (const [until, playing] of [
      [3, true],
      [5, false],
    ] as const) {
      while (time < until - 1e-9) {
        const dt = Math.min(deltas(time), until - time);
        system.update(dt, () => playing);
        time += dt;
        unwrapped += stepAngle(last, system.states[0].angle);
        last = system.states[0].angle;
      }
      samples[String(until)] = { rpm: system.states[0].currentRpm, angle: unwrapped };
    }
    return samples;
  };

  it("gives the same RPM and (within 0.01 rad) the same angle at 30, 60, 144 fps and with irregular frames", () => {
    const reference = profile(() => 1 / 60);
    for (const deltas of [() => 1 / 30, () => 1 / 144, (t: number) => (Math.floor(t * 37) % 3 === 0 ? 0.045 : 0.008)]) {
      const result = profile(deltas);
      for (const key of ["3", "5"]) {
        close(result[key].rpm, reference[key].rpm, 1e-6);
        close(result[key].angle, reference[key].angle, 0.01);
      }
    }
    // 33⅓ RPM clockwise: the angle decreases.
    assert.ok(reference["3"].angle < -TAU);
  });

  it("clamps a huge frame (hidden tab, stall) to maxDelta: no giant angle jump", () => {
    const system = new PlatterMotionSystem(1);
    run(system, 3, () => true);
    const before = system.states[0].angle;
    system.update(37, () => true); // e.g. 37 s in a background tab
    const maxStep = (RPM / 60) * TAU * PLATTER_MOTION_CONFIG.maxDelta;
    assert.ok(Math.abs(stepAngle(before, system.states[0].angle)) <= maxStep + 1e-9);
    system.update(-1, () => true); // a negative delta does nothing
  });

  it("keeps the angle bounded over a long session without changing the visible rotation", () => {
    const system = new PlatterMotionSystem(1);
    run(system, 600, () => true, 30); // 10 minutes
    const angle = system.states[0].angle;
    assert.ok(Math.abs(angle) < TAU, String(angle));
    // A wrapped angle draws the same as the unwrapped one (rotation is periodic).
    const a = new THREE.Object3D();
    const b = new THREE.Object3D();
    a.rotation.y = angle;
    b.rotation.y = angle - TAU * 333;
    const pa = a.localToWorld(new THREE.Vector3(0.1, 0, 0));
    const pb = b.localToWorld(new THREE.Vector3(0.1, 0, 0));
    assert.ok(pa.distanceTo(pb) < 1e-9);
  });
});

describe("platter motion — direction and eras", () => {
  it("rotates clockwise seen from above (north → east)", () => {
    const system = new PlatterMotionSystem(1);
    run(system, 2, () => true);
    const platter = new THREE.Object3D();
    const record = new THREE.Object3D();
    platter.add(record); // the record rides on the platter's RecordAnchor
    platter.rotation.y = system.states[0].angle;
    platter.updateMatrixWorld();
    const p0 = record.localToWorld(new THREE.Vector3(0, 0, -0.1));
    system.update(1 / 60, () => true);
    platter.rotation.y = system.states[0].angle;
    platter.updateMatrixWorld();
    const p1 = record.localToWorld(new THREE.Vector3(0, 0, -0.1));
    // Seen from +Y: clockwise ⇔ (p0 × p1).y < 0.
    assert.ok(p0.z * p1.x - p0.x * p1.z < 0);
  });

  it("keeps one independent state per era (one spinning, one stopping, the rest at rest)", () => {
    const system = new PlatterMotionSystem(8);
    run(system, 2, (i) => i === 0 || i === 1);
    run(system, 0.3, (i) => i === 1); // era 0 retired: spinning down; era 1 continues
    assert.ok(system.states[0].currentRpm < RPM && system.states[0].currentRpm > 0);
    close(system.states[1].currentRpm, RPM, 1e-3);
    for (let i = 2; i < 8; i++) assert.equal(system.states[i].currentRpm, 0);
  });

  it("development overrides force play / stop and AUTO returns to the audio", () => {
    const system = new PlatterMotionSystem(2);
    system.setOverride(0, "play");
    system.setOverride(1, "stop");
    run(system, 2, (i) => i === 1);
    close(system.states[0].currentRpm, RPM, 1e-2);
    assert.equal(system.states[1].currentRpm, 0);
    assert.equal(system.states[1].audioPlaying, true);
    system.setOverride(0, null);
    system.setOverride(1, null);
    run(system, 3, (i) => i === 1);
    assert.equal(system.states[0].currentRpm, 0);
    close(system.states[1].currentRpm, RPM, 1e-2);
  });
});
