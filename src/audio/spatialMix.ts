/**
 * Semantic station mix (docs/SPATIAL_AUDIO.md §4–§6): HOW MUCH each era's music should be heard,
 * independent of physical distance. PannerNodes add direction and distance character on top;
 * this model decides relevance, so a station across the open hall never becomes audible just
 * because it is geometrically close.
 *
 * Station coordinate: the loop position is mapped onto the eight station anchors (their route
 * view points, hallLayout.ts) — s = k + t on the segment from anchor k to anchor k+1, wrapping
 * 8 → 0. Each era's presence is a function of its circular offset from s, measured in stations:
 *
 *   |offset| 0 ─ plateau ── crossfade (equal power) ── bleed ── tail ─▶ 0
 *            1.0            1.0 → bleed                 bleed    bleed → 0
 *
 * so the active station dominates, the incoming one rises BEFORE the active-era switch (which
 * happens near the segment midpoint), and GLOBAL → ROOTS is just another segment. Only the
 * previous / active / next eras of the SEMANTIC active era (CameraRig's store) may be non-zero.
 *
 * Plain TypeScript (Node tests import it).
 */
import { ERAS, getNextEra, getPreviousEra } from "../data/eras.ts";
import type { EraId } from "../data/types.ts";

export interface SpatialMixConfig {
  /** Within this many stations of its anchor an era stays at full presence. */
  plateau: number;
  /** The equal-power crossfade from 1 down to `bleed` ends here (stations). */
  crossfadeEnd: number;
  /** Presence of the previous / next station while the visitor stands at a station. */
  bleed: number;
  /** Beyond one station the bleed fades out, reaching 0 here (stations). Keep ≤ 1.5: never more than three eras. */
  tail: number;
}

export const SPATIAL_MIX_CONFIG: SpatialMixConfig = {
  plateau: 0.25,
  crossfadeEnd: 0.75,
  bleed: 0.1,
  tail: 1.5,
};

export type VoiceRole = "previous" | "active" | "next";

/** What the mix needs from the visitor's state (all semantic; no spline math). */
export interface MixInput {
  /** Travel loop position in [0, 1) (TravelController.loopProgress). */
  loopProgress: number;
  /** Era index of the semantic active era (the CameraRig's active-era store). */
  activeIndex: number;
  /** 0 = travelling, 1 = fully in FOCUS (FocusController eased progress while not in TRAVEL). */
  focusAmount: number;
  /** Focused station index (−1 = none). Always the active station. */
  focusStation: number;
  /** Development: only the active era is heard (neighbours 0). */
  soloActive: boolean;
}

const smoothstep = (x: number) => {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
};

/** Wrap-aware station index (…, −1 → 7, 8 → 0). */
export const wrapIndex = (index: number, count = ERAS.length) => ((Math.trunc(index) % count) + count) % count;

/**
 * Continuous station coordinate in [0, count) for a loop position: k + t between anchors k and
 * k+1 (circular, so GLOBAL → ROOTS is the segment 7 → 8 ≡ 0). Anchors must be in era order.
 */
export function stationCoordinate(loopProgress: number, anchors: readonly number[]): number {
  const count = anchors.length;
  const u = ((loopProgress % 1) + 1) % 1;
  for (let k = 0; k < count; k++) {
    const from = anchors[k];
    const to = anchors[(k + 1) % count];
    const span = (((to - from) % 1) + 1) % 1 || 1;
    const along = (((u - from) % 1) + 1) % 1;
    if (along < span) return k + along / span;
  }
  return 0;
}

/** Signed circular offset (stations) of coordinate `s` from station `index`, in [−count/2, count/2). */
export function stationOffset(s: number, index: number, count = ERAS.length): number {
  const d = (((s - index) % count) + count) % count;
  return d >= count / 2 ? d - count : d;
}

/** Presence of an era `distance` stations away from the visitor (see the module header). */
export function presence(distance: number, config: SpatialMixConfig = SPATIAL_MIX_CONFIG): number {
  const x = Math.abs(distance);
  if (x <= config.plateau) return 1;
  if (x <= config.crossfadeEnd) {
    const w = smoothstep((x - config.plateau) / (config.crossfadeEnd - config.plateau));
    return config.bleed + (1 - config.bleed) * Math.cos((w * Math.PI) / 2);
  }
  if (x <= 1) return config.bleed;
  if (x < config.tail) return config.bleed * (1 - smoothstep((x - 1) / (config.tail - 1)));
  return 0;
}

/** The three musically relevant eras of an active era, wrap-aware (ROOTS → GLOBAL, ROOTS, RECORDING). */
export function adjacentEras(active: EraId): { previous: EraId; active: EraId; next: EraId } {
  return { previous: getPreviousEra(active).id, active, next: getNextEra(active).id };
}

/** Role of era `index` relative to the active era, or null for the five distant eras. */
export function roleOf(index: number, activeIndex: number, count = ERAS.length): VoiceRole | null {
  const offset = wrapIndex(index - activeIndex, count);
  return offset === 0 ? "active" : offset === 1 ? "next" : offset === count - 1 ? "previous" : null;
}

/**
 * Semantic gain target per era index (written into `out`, length = station count). Non-adjacent
 * eras are always 0. Focus pulls the focused station to full presence and the neighbours to 0.
 * Pass a config with `bleed: 0` to switch neighbour bleed off (dev); nothing is allocated here.
 */
export function computeMixGains(
  input: MixInput,
  anchors: readonly number[],
  out: Float64Array,
  config: SpatialMixConfig = SPATIAL_MIX_CONFIG,
): Float64Array {
  const count = anchors.length;
  const s = stationCoordinate(input.loopProgress, anchors);
  const focus = Math.min(1, Math.max(0, input.focusAmount));
  for (let i = 0; i < count; i++) {
    const role = roleOf(i, input.activeIndex, count);
    let gain = role === null || (input.soloActive && role !== "active") ? 0 : presence(stationOffset(s, i, count), config);
    if (input.soloActive && role === "active") gain = 1;
    if (focus > 0 && input.focusStation >= 0) gain = i === input.focusStation ? gain + (1 - gain) * focus : gain * (1 - focus);
    out[i] = gain;
  }
  return out;
}

/**
 * Eras whose selected record should be decoded now: previous / active / next, plus the era beyond
 * the neighbour the visitor is heading toward once they leave the active station's plateau
 * (forward or backward — travel direction is read from the position, not assumed).
 */
export function preloadIndices(activeIndex: number, s: number | null, config: SpatialMixConfig = SPATIAL_MIX_CONFIG, count = ERAS.length): number[] {
  const indices = [activeIndex, wrapIndex(activeIndex + 1, count), wrapIndex(activeIndex - 1, count)];
  if (s !== null) {
    const offset = stationOffset(s, activeIndex, count);
    if (offset > config.plateau) indices.push(wrapIndex(activeIndex + 2, count));
    else if (offset < -config.plateau) indices.push(wrapIndex(activeIndex - 2, count));
  }
  return indices;
}
