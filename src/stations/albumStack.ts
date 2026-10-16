/**
 * The listening desk and its album stack (docs/LISTENING_STATION_TABLE.md) — pure TypeScript: layout
 * numbers, the stack order rule, resting poses and the browse choreography. Rendering lives in
 * ListeningStation (desk geometry, sleeves); the record-change driver feeds this module every frame.
 *
 * Station space: metres, +Z = station front (the visitor), the turntable stays exactly where it always was
 * (table TopAnchor at the station origin, top 0.635 m), so the locked hall layout, focus camera, platter and
 * audio anchors are untouched. The desk grows toward local −X — the side the focus camera looks from and the
 * side the record-change staging point already uses — and the album stack lives there.
 */
import { CHANGE_PHASES, type RecordPhase } from "./recordChange.ts";

// ---------------------------------------------------------------------------
// Desk layout (station space)
// ---------------------------------------------------------------------------

export const LISTENING_DESK = {
  /** Height of the desk surface = the original table top (TopAnchor); the turntable sits on it unchanged. */
  top: 0.635,
  /** One continuous slab: wood top, black-metal edge band (UV-mapped from the table's own atlas). */
  slab: { xMin: -0.725, xMax: 0.255, zMin: -0.32, zMax: 0.32, thickness: 0.024 },
  /** Two clones of the original table (0.457 m square inverted-pyramid bases), scaled to sit under the slab. */
  bases: [{ x: 0 }, { x: -0.47 }],
  /** The original table's footprint (table.glb), for reference / checks. */
  baseSize: 0.457,
  /** Turntable footprint on the desk (turntable.glb, unscaled): centred on the station origin. */
  turntable: { xMin: -0.2275, xMax: 0.2275, zMin: -0.1765, zMax: 0.1765, height: 0.142 },
} as const;

// ---------------------------------------------------------------------------
// Album stack layout
// ---------------------------------------------------------------------------

export const ALBUM_STACK = {
  /** Stack centre on the desk (station space x, z) and its yaw (rad) — the top sleeve faces the focus camera. */
  origin: { x: -0.475, z: -0.098 },
  yaw: -0.1,
  /** A 12-inch LP sleeve (the vinyl GLB's Sleeve: 0.314 × 0.314 × 0.0033 m). */
  sleeve: { size: 0.314, thickness: 0.0033 },
  /** Vertical pitch per level (thickness + 0.3 mm air, so faces never z-fight). */
  pitch: 0.0036,
  /** Resting offset per level below the top (stack-local x, z): lower sleeves step out to the left / back. */
  step: { x: -0.014, z: -0.009 },
  /** Small alternating resting rotations (degrees) per depth — tidy, not identical. */
  yawPatternDeg: [0, 1.6, -1.2, 1.9, -1.4, 0.9, -1.6, 1.3, -0.8, 1.7],
  /** Browse choreography. */
  motion: {
    /** Lift of the top sleeve before it glides (m). */
    lift: 0.014,
    /** Glide distance toward the visitor (stack-local +Z): clears the stack by ≥ the sleeve size + fan. */
    glide: 0.33,
    /** Progress per second (≈ 0.95 s of motion end to end). */
    rate: 1 / 0.95,
  },
} as const;

export interface SleevePose {
  /** Stack-local position (m); y above the desk surface (sleeve centre). */
  x: number;
  y: number;
  z: number;
  /** Stack-local yaw (rad). */
  yaw: number;
}

/** Reused per call (no per-frame allocation). */
const scratchA: SleevePose = { x: 0, y: 0, z: 0, yaw: 0 };
const scratchB: SleevePose = { x: 0, y: 0, z: 0, yaw: 0 };
const DEG = Math.PI / 180;
const clamp01 = (t: number) => Math.min(1, Math.max(0, t));
/** Smootherstep: zero velocity and acceleration at both ends (no bounce). */
const ease = (t: number) => {
  const x = clamp01(t);
  return x * x * x * (x * (x * 6 - 15) + 10);
};
const span = (p: number, from: number, to: number) => ease((p - from) / (to - from));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

// ---------------------------------------------------------------------------
// Order rule
// ---------------------------------------------------------------------------

/**
 * The stack order, top first: the selected (= mounted) record, then the playlist continuing circularly.
 * Playlist A B C D E, selected C → C D E A B. NEXT therefore brings the second sleeve to the top and sends the
 * old top to the bottom — like browsing through a pile. Derived only from the existing selection state.
 */
export function stackOrder(playlist: readonly string[], selectedId: string): string[] {
  const start = playlist.indexOf(selectedId);
  if (start < 0) throw new Error(`album stack: "${selectedId}" is not in this playlist`);
  return playlist.map((_, i) => playlist[(start + i) % playlist.length]);
}

/** Resting pose of the sleeve at `depth` (0 = top) in a stack of `count`. Exact values — no accumulation. */
export function restPose(depth: number, count: number, out: SleevePose = { x: 0, y: 0, z: 0, yaw: 0 }): SleevePose {
  const s = ALBUM_STACK;
  out.x = s.step.x * depth + 0; // + 0 normalises −0 (depth 0 is exactly the origin)
  out.z = s.step.z * depth + 0;
  out.y = (count - 1 - depth) * s.pitch + s.sleeve.thickness / 2;
  out.yaw = s.yawPatternDeg[depth % s.yawPatternDeg.length] * DEG;
  return out;
}

// ---------------------------------------------------------------------------
// Browse choreography
// ---------------------------------------------------------------------------

export type StackDirection = "next" | "previous" | "direct";

/**
 * NEXT (old top → bottom), expressed as progress p ∈ [0, 1]:
 *   0.00–0.20  LIFT      the top sleeve rises a little
 *   0.20–0.45  GLIDE     it slides toward the visitor until clear of the pile
 *   0.25–0.55  REORDER   the others step up one level (the second sleeve becomes the top)
 *   0.45–0.60  DESCEND   the glided sleeve lowers to the bottom level beside the pile
 *   0.60–1.00  SETTLE    it slides back underneath into the bottom resting pose
 * PREVIOUS is the exact time-reverse of the NEXT that would undo it (the bottom sleeve slides out, rises,
 * glides back over the top and settles), so the two read as one gesture in two directions.
 */
function nextPose(fromDepth: number, toDepth: number, count: number, p: number, out: SleevePose): SleevePose {
  const m = ALBUM_STACK.motion;
  if (fromDepth === 0 && toDepth === count - 1 && count > 1) {
    // The sleeve that leaves the top for the bottom.
    const top = restPose(0, count, scratchA);
    const bottom = restPose(count - 1, count, scratchB);
    const lifted = top.y + m.lift;
    const settle = span(p, 0.6, 1);
    out.x = lerp(top.x, bottom.x, settle);
    out.yaw = lerp(top.yaw, bottom.yaw, settle);
    out.z = lerp(top.z, bottom.z, settle) + m.glide * (span(p, 0.2, 0.45) - settle);
    out.y = lerp(lerp(top.y, lifted, span(p, 0, 0.2)), bottom.y, span(p, 0.45, 0.6));
    return out;
  }
  // Everyone else steps up one level while the glided sleeve is clear of the pile.
  const a = restPose(fromDepth, count, scratchA);
  const b = restPose(toDepth, count, scratchB);
  const t = span(p, 0.25, 0.55);
  out.x = lerp(a.x, b.x, t);
  out.y = lerp(a.y, b.y, t);
  out.z = lerp(a.z, b.z, t);
  out.yaw = lerp(a.yaw, b.yaw, t);
  return out;
}

/**
 * Pose of one sleeve during a browse from `fromOrder` to `toOrder` at progress p. `direction` selects NEXT,
 * PREVIOUS (time-reverse of NEXT) or a direct jump (every sleeve eases to its new depth — development only).
 */
export function browsePose(trackId: string, fromOrder: readonly string[], toOrder: readonly string[], direction: StackDirection, p: number, out: SleevePose): SleevePose {
  const count = fromOrder.length;
  const fromDepth = fromOrder.indexOf(trackId);
  const toDepth = toOrder.indexOf(trackId);
  if (direction === "next") return nextPose(fromDepth, toDepth, count, p, out);
  if (direction === "previous") return nextPose(toDepth, fromDepth, count, 1 - p, out);
  const a = restPose(fromDepth, count, scratchA);
  const b = restPose(toDepth, count, scratchB);
  const t = ease(p);
  out.x = lerp(a.x, b.x, t);
  out.y = lerp(a.y, b.y, t) + ALBUM_STACK.motion.lift * Math.sin(Math.PI * t) * (toDepth === 0 ? 1 : 0);
  out.z = lerp(a.z, b.z, t) + (toDepth === 0 ? ALBUM_STACK.motion.glide * Math.sin(Math.PI * t) : 0);
  out.yaw = lerp(a.yaw, b.yaw, t);
  return out;
}

// ---------------------------------------------------------------------------
// Coordination with the record change
// ---------------------------------------------------------------------------

const PHASE_INDEX = Object.fromEntries(CHANGE_PHASES.map((phase, i) => [phase, i])) as Record<string, number>;

/**
 * How far the browse may progress in each record-change phase (the stack follows the deck, it never runs ahead
 * of it): while the music ducks and the arm lifts / returns, only the LIFT; while the platter stops and the
 * record is lifted and carried to the staging point, the REORDER (the destination becomes the visible top);
 * from the physical commit (PREPARE_NEXT) on, the SETTLE. A restore (destination failed before the commit)
 * winds the browse back to the original top.
 */
export function browseCap(phase: RecordPhase, restoring: boolean): number {
  if (restoring) return 0;
  const i = PHASE_INDEX[phase];
  if (i === undefined) return 1; // stable phases: the change is over
  if (i <= PHASE_INDEX.RETURN_ARM) return 0.25;
  if (i <= PHASE_INDEX.REMOVE_RECORD) return 0.75;
  return 1;
}

/** The running record change of an era, as the stack needs it (RecordChangeRequest subset). */
export interface StackChangeRequest {
  fromTrackId: string;
  toTrackId: string;
  direction: StackDirection;
}

interface EraStack {
  /** Running browse, or null when the stack rests on the selection. */
  browse: { from: string[]; to: string[]; direction: StackDirection; progress: number; key: string } | null;
  /** The order the stack currently represents at rest (= the selection's order when stable). */
  order: string[];
  poses: SleevePose[];
  /** Bumped whenever poses change (renderers re-upload only then). */
  version: number;
}

/**
 * One small mechanical controller for all eras' album stacks. It owns no selection: the stable order is always
 * recomputed from the era's selected (= mounted) record, so mounted record, metadata and top sleeve agree as
 * soon as the deck is stable, and nothing integrates (zero drift). Only a running record change animates.
 */
export class AlbumStackSystem {
  readonly eras: EraStack[];

  constructor(eraCount: number) {
    this.eras = Array.from({ length: eraCount }, () => ({ browse: null, order: [], poses: [], version: 0 }));
  }

  /**
   * Advance one era. `playlist` is the era's playlist (track ids, display order); `selected` its selected record;
   * `change` the running record change of THIS era (or null), with the controller's `phase` and `restoring`.
   */
  update(eraIndex: number, dt: number, playlist: readonly string[], selected: string, change: StackChangeRequest | null, phase: RecordPhase = "PLAYING", restoring = false): void {
    const era = this.eras[eraIndex];
    const count = playlist.length;
    if (era.poses.length !== count) {
      era.poses = playlist.map(() => ({ x: 0, y: 0, z: 0, yaw: 0 }));
      era.order = [];
    }

    if (change) {
      const key = `${change.fromTrackId}>${change.toTrackId}:${change.direction}`;
      if (!era.browse || era.browse.key !== key) {
        era.browse = { from: stackOrder(playlist, change.fromTrackId), to: stackOrder(playlist, change.toTrackId), direction: change.direction, progress: 0, key };
      }
      const browse = era.browse;
      const cap = browseCap(phase, restoring);
      const step = ALBUM_STACK.motion.rate * Math.min(dt, 0.1);
      browse.progress = browse.progress <= cap ? Math.min(cap, browse.progress + step) : Math.max(cap, browse.progress - step);
      playlist.forEach((id, i) => browsePose(id, browse.from, browse.to, browse.direction, browse.progress, era.poses[i]));
      era.order = browse.progress >= 0.55 ? browse.to : browse.from;
      era.version++;
      return;
    }

    // Stable: rest exactly on the selection's order (re-written when it changes, and once when a browse ends so
    // the interpolated end pose is replaced by the exact resting values — zero drift).
    const browsed = era.browse !== null;
    era.browse = null;
    const order = stackOrder(playlist, selected);
    if (!browsed && era.order.length === count && era.order.every((id, i) => id === order[i])) return;
    era.order = order;
    playlist.forEach((id, i) => restPose(order.indexOf(id), count, era.poses[i]));
    era.version++;
  }

  /** The track currently on top (the browse's destination once it has risen; the selection at rest). */
  topTrack(eraIndex: number): string | undefined {
    return this.eras[eraIndex].order[0];
  }

  progress(eraIndex: number): number | null {
    return this.eras[eraIndex].browse?.progress ?? null;
  }
}
