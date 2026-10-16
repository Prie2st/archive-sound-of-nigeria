/**
 * Travel model: progress wrapping, station influence, active-era selection and the
 * inertial controller — including GLOBAL ↔ ROOTS and endless travel in both directions.
 * Run with: npm test
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getHallLayout, STATION_SLOTS } from "../data/hallLayout.ts";
import {
  loopProgress,
  normalizeWheelDelta,
  resolveTravelConfig,
  selectActiveStation,
  stationInfluence,
  strongestStation,
  TRAVEL_CONFIG,
  TravelController,
  WHEEL_DELTA_LINE,
  WHEEL_DELTA_PAGE,
  WHEEL_DELTA_PIXEL,
} from "./travel.ts";

const layout = getHallLayout();
const stations = layout.stations;
const ROOTS = 0;
const RECORDING = 1;
const GLOBAL = 7;
const close = (a: number, b: number, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≉ ${b}`);

describe("progress wrapping", () => {
  it("maps absolute progress to the loop", () => {
    close(loopProgress(0.25), 0.25);
    close(loopProgress(0.95), 0.95);
    close(loopProgress(1.05), 0.05);
    close(loopProgress(8.877), 0.877, 1e-12);
    close(loopProgress(-0.1), 0.9);
    close(loopProgress(-3.25), 0.75);
    close(loopProgress(1), 0);
  });
});

describe("station influence (wrap-aware)", () => {
  it("peaks at 1 on every anchor and is 0 far away", () => {
    for (const s of stations) {
      close(stationInfluence(s.progress, s), 1);
      assert.equal(stationInfluence(s.progress + 0.5, s), 0);
    }
  });

  it("ROOTS influences the end of the loop (0.95–0.99) as well as 0.00–0.02", () => {
    const roots = stations[ROOTS];
    assert.ok(stationInfluence(0.96, roots) > 0);
    assert.ok(stationInfluence(0.99, roots) > stationInfluence(0.97, roots));
    assert.ok(stationInfluence(0.01, roots) > 0);
    assert.equal(stationInfluence(0.9, roots), 0);
    assert.equal(strongestStation(0.99, stations).index, ROOTS);
  });

  it("is continuous across the GLOBAL → ROOTS seam", () => {
    const roots = stations[ROOTS];
    close(stationInfluence(0.9999999, roots), stationInfluence(0.0000001, roots), 1e-4);
  });

  it("rises before the anchor and falls after it, smoothly, inside the approach window", () => {
    for (const s of stations) {
      const before = (s.progress - s.approach.start + 1) % 1;
      const after = (s.approach.end - s.progress + 1) % 1;
      let previous = 0;
      for (let k = 1; k <= 20; k++) {
        const value = stationInfluence(s.progress - before + (before * k) / 20, s);
        assert.ok(value >= previous - 1e-12);
        previous = value;
      }
      previous = 1;
      for (let k = 1; k <= 20; k++) {
        const value = stationInfluence(s.progress + (after * k) / 20, s);
        assert.ok(value <= previous + 1e-12);
        previous = value;
      }
    }
  });

  it("never has two stations influencing the same point", () => {
    for (let i = 0; i < 2000; i++) {
      const u = i / 2000;
      assert.ok(stations.filter((s) => stationInfluence(u, s) > 0).length <= 1, `overlap at ${u}`);
    }
  });
});

describe("active era selection", () => {
  const select = (u: number, current = -1) => selectActiveStation(u, current, stations, TRAVEL_CONFIG.activeEraHysteresis);

  it("picks the station nearest along the loop, with wrapping", () => {
    assert.equal(select(0), ROOTS);
    assert.equal(select(0.99), ROOTS);
    assert.equal(select(0.02), ROOTS);
    assert.equal(select(stations[GLOBAL].progress), GLOBAL);
    assert.equal(select(0.88), GLOBAL);
    assert.equal(select(stations[RECORDING].progress), RECORDING);
    stations.forEach((s, i) => assert.equal(select(s.progress), i));
  });

  it("switches GLOBAL → ROOTS at the midpoint (with hysteresis), not at 0", () => {
    const midpoint = (stations[GLOBAL].progress + 1) / 2;
    const h = TRAVEL_CONFIG.activeEraHysteresis;
    assert.equal(select(midpoint + h, GLOBAL), ROOTS);
    assert.equal(select(midpoint + h * 0.3, GLOBAL), GLOBAL); // inside the hysteresis band: keep
    assert.equal(select(midpoint - h * 0.3, ROOTS), ROOTS); // and back again: no flicker
    assert.equal(select(midpoint - h, ROOTS), GLOBAL);
  });

  it("follows forward travel GLOBAL → ROOTS → RECORDING and backward RECORDING → ROOTS → GLOBAL", () => {
    const sequence = (from: number, to: number, steps = 400) => {
      const seen: number[] = [];
      let current = -1;
      for (let k = 0; k <= steps; k++) {
        current = select(loopProgress(from + ((to - from) * k) / steps), current);
        if (seen.at(-1) !== current) seen.push(current);
      }
      return seen.map((i) => STATION_SLOTS[i].eraId);
    };
    assert.deepEqual(sequence(stations[GLOBAL].progress, 1 + stations[RECORDING].progress), ["global", "roots", "recording"]);
    assert.deepEqual(sequence(1 + stations[RECORDING].progress, stations[GLOBAL].progress), ["recording", "roots", "global"]);
  });
});

describe("wheel normalization", () => {
  it("scales lines and pages to pixels and clamps huge events", () => {
    assert.equal(normalizeWheelDelta(100, WHEEL_DELTA_PIXEL, 800, 150), 100);
    assert.equal(normalizeWheelDelta(3, WHEEL_DELTA_LINE, 800, 150), 48);
    assert.equal(normalizeWheelDelta(1, WHEEL_DELTA_PAGE, 800, 150), 150);
    assert.equal(normalizeWheelDelta(-5000, WHEEL_DELTA_PIXEL, 800, 150), -150);
  });
});

describe("travel controller", () => {
  const run = (controller: TravelController, seconds: number, influence = 0, fps = 60) => {
    for (let i = 0; i < seconds * fps; i++) controller.step(1 / fps, influence);
  };

  it("touch up travels forward, touch down backward, then inertia settles", () => {
    for (const direction of [-1, 1]) {
      const c = new TravelController(resolveTravelConfig(false), layout.length, 0.5);
      for (let frame = 0; frame < 20; frame++) {
        c.addDrag(direction * 10);
        c.step(1 / 60, 0);
        assert.ok(Math.abs(c.velocity) <= TRAVEL_CONFIG.maxVelocity);
      }
      const atRelease = c.absoluteProgress;
      run(c, 10);
      assert.ok((c.absoluteProgress - 0.5) * -direction > 0);
      assert.ok((c.absoluteProgress - atRelease) * -direction > 0, "coasts in the same direction");
      assert.equal(c.velocity, 0);
    }
  });

  it("touch while focus locks travel cannot accumulate a launch on close", () => {
    const c = new TravelController(resolveTravelConfig(false), layout.length, 0.5);
    c.setLocked(true);
    for (let frame = 0; frame < 30; frame++) { c.addDrag(-20); c.step(1 / 60, 0); }
    close(c.absoluteProgress, 0.5);
    c.setLocked(false, 0.5);
    run(c, 1);
    close(c.absoluteProgress, 0.5);
    assert.equal(c.velocity, 0);
  });

  it("one wheel notch travels a short, finite distance and stops", () => {
    const c = new TravelController(resolveTravelConfig(false), layout.length);
    c.addWheel(100, WHEEL_DELTA_PIXEL, 800);
    run(c, 10);
    const metres = c.absoluteProgress * layout.length;
    assert.ok(metres > 1 && metres < 3, `${metres} m`);
    assert.equal(c.velocity, 0);
  });

  it("clamps velocity, not progress: a flood of wheel events cannot exceed maxVelocity", () => {
    const c = new TravelController(resolveTravelConfig(false), layout.length);
    for (let i = 0; i < 600; i++) {
      c.addWheel(10000, WHEEL_DELTA_PIXEL, 800);
      c.step(1 / 60, 0);
      assert.ok(Math.abs(c.velocity) <= TRAVEL_CONFIG.maxVelocity + 1e-9);
    }
  });

  it("travels forward forever across the seam (absolute progress keeps growing)", () => {
    const c = new TravelController(resolveTravelConfig(false), layout.length, 0.85);
    let previous = c.absoluteProgress;
    for (let i = 0; i < 60 * 120; i++) {
      c.addImpulse(1);
      c.step(1 / 60, 0);
      assert.ok(c.absoluteProgress >= previous);
      previous = c.absoluteProgress;
    }
    assert.ok(c.absoluteProgress > 3, `${c.absoluteProgress}`);
    assert.ok(c.loopProgress >= 0 && c.loopProgress < 1);
  });

  it("travels backward forever across the seam (absolute progress goes negative)", () => {
    const c = new TravelController(resolveTravelConfig(false), layout.length, 0.15);
    for (let i = 0; i < 60 * 120; i++) {
      c.addImpulse(-1);
      c.step(1 / 60, 0);
    }
    assert.ok(c.absoluteProgress < -2, `${c.absoluteProgress}`);
    assert.ok(c.loopProgress >= 0 && c.loopProgress < 1);
  });

  it("keeps velocity across the seam (no reset)", () => {
    const c = new TravelController(resolveTravelConfig(false), layout.length, 0.995);
    c.addImpulse(4);
    run(c, 0.3);
    const before = c.velocity;
    while (c.absoluteProgress < 1.002) c.step(1 / 60, 0);
    assert.ok(c.velocity > 0 && c.velocity <= before);
    assert.ok(c.velocity > before * 0.5, "velocity only decays by friction across the seam");
  });

  it("station influence slows travel without stopping it", () => {
    const free = new TravelController(resolveTravelConfig(false), layout.length);
    const near = new TravelController(resolveTravelConfig(false), layout.length);
    for (let i = 0; i < 120; i++) {
      free.addImpulse(1);
      near.addImpulse(1);
      free.step(1 / 60, 0);
      near.step(1 / 60, 1);
    }
    assert.ok(near.velocity > 0, "never stops");
    assert.ok(near.velocity < free.velocity, "but is slower");
    assert.ok(near.velocity >= TRAVEL_CONFIG.maxVelocity * TRAVEL_CONFIG.minApproachSpeedMultiplier * 0.9);
  });

  it("rate-limits held keys and ignores input while paused", () => {
    const c = new TravelController(resolveTravelConfig(false), layout.length);
    c.addKey(1, 0);
    c.addKey(1, 0.05); // repeat too soon: ignored
    c.addKey(1, 0.3);
    run(c, 2);
    const twoPresses = c.absoluteProgress;
    const d = new TravelController(resolveTravelConfig(false), layout.length);
    d.addKey(1, 0);
    d.addKey(1, 0.3);
    run(d, 2);
    close(twoPresses, d.absoluteProgress, 1e-12);
    c.setPaused(true);
    c.addWheel(100, WHEEL_DELTA_PIXEL, 800);
    run(c, 1);
    assert.equal(c.velocity, 0);
  });

  it("dev jump keeps the lap count and stops", () => {
    const c = new TravelController(resolveTravelConfig(false), layout.length, 3.9);
    c.devJumpTo(stations[ROOTS].progress);
    close(c.absoluteProgress, 4);
    c.devJumpTo(stations[GLOBAL].progress);
    close(c.loopProgress, stations[GLOBAL].progress);
    assert.ok(Math.abs(c.absoluteProgress - 4) < 0.5);
  });

  it("reduced motion: much less inertia", () => {
    const normal = new TravelController(resolveTravelConfig(false), layout.length);
    const reduced = new TravelController(resolveTravelConfig(true), layout.length);
    normal.addWheel(100, WHEEL_DELTA_PIXEL, 800);
    reduced.addWheel(100, WHEEL_DELTA_PIXEL, 800);
    run(normal, 10);
    run(reduced, 10);
    assert.ok(reduced.absoluteProgress < normal.absoluteProgress * 0.5);
  });
});
