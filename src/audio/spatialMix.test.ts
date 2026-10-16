/**
 * Semantic station mix: wrap-aware adjacency, the station coordinate across GLOBAL → ROOTS,
 * the presence curve, adjacency gating (non-neighbours always silent), focus and preload targets.
 * Run with: npm test
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ERAS } from "../data/eras.ts";
import { getHallLayout } from "../data/hallLayout.ts";
import { selectActiveStation, TRAVEL_CONFIG } from "../state/travel.ts";
import {
  adjacentEras,
  computeMixGains,
  preloadIndices,
  presence,
  roleOf,
  SPATIAL_MIX_CONFIG,
  stationCoordinate,
  stationOffset,
  type MixInput,
} from "./spatialMix.ts";

const layout = getHallLayout();
const anchors = layout.stations.map((station) => station.progress);
const COUNT = anchors.length;
const ROOTS = 0;
const RECORDING = 1;
const HIGHLIFE = 2;
const TRANSITION = 4;
const AFROBEATS = 6;
const GLOBAL = 7;
const close = (a: number, b: number, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≉ ${b}`);
const input = (loopProgress: number, activeIndex: number, extra: Partial<MixInput> = {}): MixInput => ({
  loopProgress,
  activeIndex,
  focusAmount: 0,
  focusStation: -1,
  soloActive: false,
  ...extra,
});
const gains = (mix: MixInput, config = SPATIAL_MIX_CONFIG) => Array.from(computeMixGains(mix, anchors, new Float64Array(COUNT), config));

/** Sweeps the loop like the CameraRig: active station by selectActiveStation with hysteresis. */
function sweep(from: number, to: number, step: number, visit: (u: number, active: number, g: number[]) => void) {
  let active = -1;
  const direction = Math.sign(to - from);
  for (let p = from; direction > 0 ? p <= to : p >= to; p += direction * step) {
    const u = ((p % 1) + 1) % 1;
    active = selectActiveStation(u, active, layout.stations, TRAVEL_CONFIG.activeEraHysteresis);
    visit(u, active, gains(input(u, active)));
  }
}

describe("spatial mix — adjacency", () => {
  it("wraps previous / next around the loop", () => {
    assert.deepEqual(adjacentEras("roots"), { previous: "global", active: "roots", next: "recording" });
    assert.deepEqual(adjacentEras("global"), { previous: "afrobeats", active: "global", next: "roots" });
    assert.deepEqual(adjacentEras("highlife"), { previous: "recording", active: "highlife", next: "explosion" });
  });

  it("assigns roles only to the three adjacent eras", () => {
    assert.equal(roleOf(GLOBAL, ROOTS), "previous");
    assert.equal(roleOf(RECORDING, ROOTS), "next");
    assert.equal(roleOf(ROOTS, GLOBAL), "next");
    assert.equal(roleOf(AFROBEATS, GLOBAL), "previous");
    for (let i = 2; i <= 6; i++) assert.equal(roleOf(i, ROOTS), null, `era ${i}`);
  });
});

describe("spatial mix — station coordinate", () => {
  it("is the era index at every station anchor", () => {
    anchors.forEach((anchor, index) => close(stationCoordinate(anchor, anchors), index));
  });

  it("is continuous across GLOBAL → ROOTS (7.x → 8 ≡ 0)", () => {
    const before = stationCoordinate(0.9999, anchors);
    assert.ok(before > 7.99 && before < 8, String(before));
    close(stationCoordinate(1, anchors), 0);
    close(stationOffset(before, ROOTS), before - 8);
    close(stationOffset(0.001, GLOBAL), 0.001 + 1);
  });

  it("is halfway between two anchors at their progress midpoint", () => {
    close(stationCoordinate((anchors[GLOBAL] + 1) / 2, anchors), 7.5);
    close(stationCoordinate((anchors[HIGHLIFE] + anchors[HIGHLIFE + 1]) / 2, anchors), 2.5);
  });
});

describe("spatial mix — presence curve", () => {
  it("has the documented shape", () => {
    const { bleed } = SPATIAL_MIX_CONFIG;
    close(presence(0), 1);
    close(presence(0.25), 1);
    close(presence(0.5), bleed + (1 - bleed) * Math.cos(Math.PI / 4));
    close(presence(0.75), bleed);
    close(presence(1), bleed);
    close(presence(1.5), 0);
    close(presence(3), 0);
    close(presence(-0.5), presence(0.5));
  });

  it("decreases monotonically and continuously", () => {
    let previous = presence(0);
    for (let x = 0.001; x <= 2; x += 0.001) {
      const value = presence(x);
      assert.ok(value <= previous + 1e-12, `rises at ${x}`);
      assert.ok(previous - value < 0.01, `jumps at ${x}`);
      previous = value;
    }
  });
});

describe("spatial mix — gains", () => {
  it("at every station: active 1, previous / next = bleed, the other five 0", () => {
    for (const era of ERAS) {
      const g = gains(input(anchors[era.index], era.index));
      for (let i = 0; i < COUNT; i++) {
        const role = roleOf(i, era.index);
        const expected = role === "active" ? 1 : role ? SPATIAL_MIX_CONFIG.bleed : 0;
        close(g[i], expected);
      }
    }
  });

  it("over three full laps: at most three non-zero eras, all adjacent to the active era", () => {
    sweep(0, 3, 0.0005, (u, active, g) => {
      const audible = g.flatMap((value, i) => (value > 0 ? [i] : []));
      assert.ok(audible.length <= 3, `${audible.length} eras at ${u}`);
      for (const i of audible) assert.notEqual(roleOf(i, active), null, `era ${i} audible with active ${active} at ${u}`);
    });
  });

  it("never lets distant eras in through the open hall (ROOTS ↛ TRANSITION, HIGH-LIFE ↛ AFROBEATS)", () => {
    sweep(0, 1, 0.0005, (u, active, g) => {
      if (active === ROOTS) assert.equal(g[TRANSITION], 0);
      if (active === HIGHLIFE) assert.equal(g[AFROBEATS], 0);
    });
  });

  it("crossfades smoothly through every boundary, GLOBAL → ROOTS included, in both directions", () => {
    for (const [from, to] of [
      [0, 1.2],
      [1.2, -0.2],
    ]) {
      let last: number[] | null = null;
      let maxJump = 0;
      sweep(from, to, 0.0002, (_u, _active, g) => {
        if (last) for (let i = 0; i < COUNT; i++) maxJump = Math.max(maxJump, Math.abs(g[i] - last[i]));
        last = g;
      });
      // 0.0002 progress ≈ 2.4 cm; the steepest part of the curve moves < 0.02 per step. The adjacency
      // gate's step at an era switch (hysteresis) touches only a fading tail (< 0.01).
      assert.ok(maxJump < 0.02, `max jump ${maxJump}`);
    }
  });

  it("raises the incoming era before the active-era switch and keeps the outgoing one after it", () => {
    let active = -1;
    let previousGains: number[] = [];
    let switches = 0;
    sweep(anchors[HIGHLIFE], 1 + anchors[RECORDING], 0.0002, (_u, current, g) => {
      if (active >= 0 && current !== active) {
        switches++;
        assert.ok(previousGains[current] > 0.5, `incoming ${current} at ${previousGains[current]} before the switch`);
        assert.ok(g[active] > 0.5, `outgoing ${active} cut to ${g[active]} at the switch`);
      }
      active = current;
      previousGains = g;
    });
    assert.equal(switches, 7); // HIGH-LIFE → … → GLOBAL → ROOTS → RECORDING
  });

  it("solo active: only the active era", () => {
    const g = gains(input(anchors[ROOTS] + 0.02, ROOTS, { soloActive: true }));
    assert.deepEqual(g.map((value, i) => (i === ROOTS ? value : value === 0)), [1, true, true, true, true, true, true, true]);
  });

  it("bleed off: silent neighbours at the station, crossfade unchanged", () => {
    const noBleed = { ...SPATIAL_MIX_CONFIG, bleed: 0 };
    const atStation = gains(input(anchors[TRANSITION], TRANSITION), noBleed);
    assert.equal(atStation[TRANSITION - 1], 0);
    assert.equal(atStation[TRANSITION + 1], 0);
    const midpoint = gains(input((anchors[TRANSITION] + anchors[TRANSITION + 1]) / 2, TRANSITION), noBleed);
    close(midpoint[TRANSITION], Math.cos(Math.PI / 4));
  });
});

describe("spatial mix — focus", () => {
  it("pulls the focused station to full presence and the neighbours to 0, proportionally", () => {
    const u = anchors[GLOBAL] + 0.05; // inside GLOBAL's range, past its plateau (offset ≈ 0.41)
    const travel = gains(input(u, GLOBAL));
    const focused = gains(input(u, GLOBAL, { focusAmount: 1, focusStation: GLOBAL }));
    const half = gains(input(u, GLOBAL, { focusAmount: 0.5, focusStation: GLOBAL }));
    assert.ok(travel[GLOBAL] < 1 && travel[ROOTS] > 0);
    assert.equal(focused[GLOBAL], 1);
    assert.equal(focused[ROOTS], 0);
    assert.equal(focused[AFROBEATS], 0);
    close(half[ROOTS], travel[ROOTS] / 2);
    close(half[GLOBAL], (travel[GLOBAL] + 1) / 2);
    // Exit (focusAmount back to 0) restores the travel mix exactly.
    assert.deepEqual(gains(input(u, GLOBAL, { focusAmount: 0, focusStation: GLOBAL })), travel);
  });
});

describe("spatial mix — preload targets", () => {
  it("previous / active / next at a station, plus the era beyond the neighbour ahead in either direction", () => {
    assert.deepEqual(preloadIndices(ROOTS, 0), [ROOTS, RECORDING, GLOBAL]);
    assert.deepEqual(preloadIndices(GLOBAL, 7), [GLOBAL, ROOTS, AFROBEATS]);
    assert.deepEqual(preloadIndices(GLOBAL, 7.4), [GLOBAL, ROOTS, AFROBEATS, RECORDING]);
    assert.deepEqual(preloadIndices(ROOTS, 7.6), [ROOTS, RECORDING, GLOBAL, AFROBEATS]);
    assert.deepEqual(preloadIndices(ROOTS, null), [ROOTS, RECORDING, GLOBAL]);
  });
});
