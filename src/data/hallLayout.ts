/**
 * Marble hall spatial layout — the single source of truth for the visitor route
 * and the eight listening-station slots. Marble-specific (CLAUDE.md §9); the
 * classic gallery has no layout.
 *
 * World space = runtime marble-gallery.glb: metres, Y up, origin at the hall centre
 * on the central platform floor. Measurements behind the numbers below (from the
 * runtime GLB, see scripts/check-hall-layout.mjs):
 *   - central platform floor y = 0, from r ≈ 3 to the colonnade
 *   - centre sculpture + plinth occupies |x|, |z| < ≈3 (footprint radius ≈3.7)
 *   - colonnade: 16 pillars (footprint radius ≈0.6) at r ≈ 11.0–12.4
 *       N/S sides: x = ±3.27 and ±6.65 at z = ±10.5   (inner pair faces at r ≈ 10.45)
 *       E/W sides: z = ±4.9 at x = ±10.82
 *       diagonals: (±8.75, ±7.72)
 *     openings: N/S ≈ 5.3 m, E/W ≈ 8.6 m, diagonal gaps ≈ 2.3 m
 *   - sunken ring y = −0.79 beyond the steps; flat band (measured per angle) from
 *     r ≈ 13.9–15.9 (inner steps) to r ≈ 19.7–22.7 (outer steps), 5.6–6.6 m wide
 *   - outer walkway y = 0 (same level as the platform) from the top of the outer steps
 *     (z = ±22 on N/S, x = ±22.5 on E/W, r ≈ 24.5 on the diagonals) to the walls
 *     (z = ±25.36 with a ≈3 m doorway centred on N/S, x = ±25.93, chamfered corners r ≈ 27.4)
 *   - wall colonnade: 16 pillars (footprint radius ≈0.53) along the walkway
 *       N/S: x = ±7.14, ±14.30 at z = ±22.6     E/W: z = ±3.51, ±10.59 at x = ±23.27
 *       corners: (±18.81, ±16.60)
 *
 * This module is plain TypeScript + three (no React), so Node can import it
 * directly for the clearance check.
 */
import * as THREE from "three";
import type { EraId } from "./types.ts";

export type Vec3 = readonly [number, number, number];

// ---------------------------------------------------------------------------
// Hall constants
// ---------------------------------------------------------------------------

export const HALL = {
  roomCenter: [0, 0, 0] as Vec3,
  /** Central platform floor. */
  platformFloorY: 0,
  /** Sunken ring floor between the platform and the outer walkway. */
  sunkenFloorY: -0.79,
  /** Floor the visitor route runs on (= sunkenFloorY: the route follows the sunken ring). */
  routeFloorY: -0.79,
  /** Outer walkway floor (where the station slots sit). */
  walkwayFloorY: 0,
  /** Camera eye height above the route floor. */
  cameraEyeHeight: 1.65,
  /** Nominal loop radius; the authored path varies inside `loopRadiusRange`. */
  initialLoopRadius: 18.5,
  loopRadiusRange: [17.5, 20.5] as const,
  /** Route look-at height above the station floor: table (0.635 m) + turntable deck (≈0.14 m). */
  stationFocusHeight: 0.78,
} as const;

const EYE = HALL.routeFloorY + HALL.cameraEyeHeight;

// ---------------------------------------------------------------------------
// Visitor route — closed centripetal Catmull-Rom through explicit control points
// ---------------------------------------------------------------------------

/**
 * The route runs on the sunken ring floor, between the central platform and the
 * outer walkway where the stations stand. Travel order is clockwise seen from above
 * (−Z "north" → +X "east" → +Z → −X).
 * Even indices are the eight view points: ≈1.2–1.5 m inside the outer steps, just
 * before each station in the travel direction (stations are seen at ≈5–6 m).
 * Odd indices sit mid-band between stations, well clear of both step edges.
 * Index 0 is the ROOTS view point, so progress 0 = ROOTS and the closed curve's
 * seam (GLOBAL → ROOTS) has continuous tangents.
 */
export const PATH_CONTROL_POINTS: readonly Vec3[] = [
  [0.65, EYE, -18.49], //  0  ROOTS view                    (−88°,    r 18.5; band 13.9–19.7)
  [6.12, EYE, -16.82], //  1  mid-band                      (−70°,    r 17.9; band 14.8–21.0)
  [12.56, EYE, -16.08], //  2  RECORDING view                (−52°,    r 20.4; band 16.3–22.1)
  [16.75, EYE, -8.54], //  3  mid-band                      (−27°,    r 18.8; band 15.9–21.6)
  [18.79, EYE, -0.66], //  4  HIGH-LIFE view                (−2°,     r 18.8; band 14.4–20.1)
  [17.12, EYE, 7.27], //  5  mid-band                      (23°,     r 18.6)
  [13.76, EYE, 15.06], //  6  EXPLOSION view                (47.6°,   r 20.4)
  [6.12, EYE, 16.82], //  7  mid-band                      (70°,     r 17.9)
  [-0.65, EYE, 18.49], //  8  TRANSITION view               (92°,     r 18.5)
  [-6.12, EYE, 16.82], //  9  mid-band                      (110°,    r 17.9)
  [-12.56, EYE, 16.08], // 10  NAIJA view                    (128°,    r 20.4)
  [-16.75, EYE, 8.54], // 11  mid-band                      (153°,    r 18.8)
  [-18.79, EYE, 0.66], // 12  AFROBEATS view                (178°,    r 18.8)
  [-17.12, EYE, -7.27], // 13  mid-band                      (−157°,   r 18.6)
  [-13.76, EYE, -15.06], // 14  GLOBAL view                   (−132.4°, r 20.4)
  [-6.12, EYE, -16.82], // 15  mid-band, back to ROOTS       (−110°,   r 17.9)
];

// ---------------------------------------------------------------------------
// Station slots (provisional — no station models yet)
// ---------------------------------------------------------------------------

export interface StationSlot {
  index: number;
  /** Joins the slot to its era in eras.ts (STATION_SLOTS[i].eraId === ERAS[i].id). */
  eraId: EraId;
  /** Debug-only label until the era data milestone. */
  debugLabel: string;
  /** Floor-level anchor on the outer walkway (table bottom-centre). */
  position: Vec3;
  /** Index into PATH_CONTROL_POINTS of the camera view point that frames this station. */
  viewControlPoint: number;
  /** Per-station overrides for the listening-mode (FOCUS) camera; see DEFAULT_FOCUS. */
  focusAuthoring?: Partial<FocusAuthoring>;
  /** Why it sits where it does. */
  note: string;
}

/**
 * Listening-mode (FOCUS) camera, authored relative to the station so it follows the
 * station if a transform ever changes. The camera orbits the platter centre:
 * yawOffsetDeg 0 = straight in front of the station (on its forward vector),
 * positive = counter-clockwise seen from above.
 */
export interface FocusAuthoring {
  yawOffsetDeg: number;
  /** Horizontal distance from the platter centre (m). */
  distance: number;
  /** Eye height above the station floor (m). */
  eyeHeight: number;
}

/**
 * Default: three-quarter view from the turntable's left (−20°), looking across the
 * platter toward the tonearm (local +X); 1.8 m horizontal ≈ 2.0 m to the platter,
 * eye 1.65 m above the walkway (≈27° down onto the record).
 */
export const DEFAULT_FOCUS: FocusAuthoring = { yawOffsetDeg: -20, distance: 1.8, eyeHeight: 1.65 };

/**
 * Where the platter centre sits relative to the station anchor, in station space
 * (+Z = station front): table top (table.glb TopAnchor, 0.635) + turntable Platter
 * origin (turntable.glb: x −0.046, y 0.101, z −0.0004) + record thickness (0.0015).
 */
export const PLATTER_OFFSET: Vec3 = [-0.046, 0.635 + 0.101 + 0.0015, -0.0004];

/**
 * Stations stand on the outer walkway, in the bays between the wall pillars with the
 * wall behind them, facing the route on the sunken ring below (the walkway is 0.79 m
 * higher than the route floor).
 *   N/S: beside the doorway (not blocking it), a little ahead of the view point in the
 *        travel direction, so they are approached in a three-quarter view.
 *   E/W: in the central bay between the wall pillars at z = ±3.51, slightly ahead.
 *   Diagonals: centred in the corner bay between two wall pillars.
 */
export const STATION_SLOTS: readonly StationSlot[] = [
  { index: 0, eraId: "roots", debugLabel: "01 ROOTS", position: [3.6, HALL.walkwayFloorY, -23.9], viewControlPoint: 0, note: "N walkway, between the doorway (x ±1.5) and the wall pillar at x 7.14" },
  { index: 1, eraId: "recording", debugLabel: "02 RECORDING", position: [16.54, HALL.walkwayFloorY, -19.56], viewControlPoint: 2, note: "NE corner bay between wall pillars (14.30, −22.60) and (18.81, −16.60)" },
  { index: 2, eraId: "highlife", debugLabel: "03 HIGH-LIFE", position: [24, HALL.walkwayFloorY, 1.5], viewControlPoint: 4, note: "E walkway, central bay between wall pillars at z ±3.51" },
  { index: 3, eraId: "explosion", debugLabel: "04 EXPLOSION", position: [16.54, HALL.walkwayFloorY, 19.56], viewControlPoint: 6, note: "SE corner bay" },
  { index: 4, eraId: "transition", debugLabel: "05 TRANSITION", position: [-3.6, HALL.walkwayFloorY, 23.9], viewControlPoint: 8, note: "S walkway, between the doorway (x ±1.5) and the wall pillar at x −7.14" },
  { index: 5, eraId: "naija", debugLabel: "06 NAIJA", position: [-16.54, HALL.walkwayFloorY, 19.56], viewControlPoint: 10, note: "SW corner bay" },
  { index: 6, eraId: "afrobeats", debugLabel: "07 AFROBEATS", position: [-24, HALL.walkwayFloorY, -1.5], viewControlPoint: 12, note: "W walkway, central bay between wall pillars at z ±3.51" },
  { index: 7, eraId: "global", debugLabel: "08 GLOBAL", position: [-16.54, HALL.walkwayFloorY, -19.56], viewControlPoint: 14, note: "NW corner bay" },
];

/**
 * Instrument exhibits (src/data/exhibits.ts) on plinths on the outer walkway, one in the bay just before each era's
 * station (seen on the approach), two for ROOTS in the GLOBAL → ROOTS seam bay. Each faces the hall centre, turned
 * by `yawOffsetDeg`. Added 2026-10-18 (docs/HALL_LAYOUT_LOCK.md §8, docs/EXHIBITS.md); screened by `npm run check:hall` and
 * `npm run check:visuals`.
 */
export interface ExhibitSlot {
  exhibitId: string;
  position: Vec3;
  yawOffsetDeg: number;
  note: string;
}

export const EXHIBIT_PLINTH = { width: 0.7, depth: 0.7 } as const;

export const EXHIBIT_SLOTS: readonly ExhibitSlot[] = [
  { exhibitId: "talking-drum", position: [-11.2, HALL.walkwayFloorY, -23.6], yawOffsetDeg: 0, note: "N walkway, west bay (GLOBAL → ROOTS seam)" },
  { exhibitId: "axatse", position: [-9.6, HALL.walkwayFloorY, -23.6], yawOffsetDeg: 0, note: "N walkway, west bay, beside the talking drum" },
  { exhibitId: "gramophone", position: [10.7, HALL.walkwayFloorY, -23.6], yawOffsetDeg: -30, note: "N walkway, east bay (ROOTS → RECORDING)" },
  { exhibitId: "trumpet", position: [23.8, HALL.walkwayFloorY, -7], yawOffsetDeg: 0, note: "E walkway, bay between the wall pillars at z −10.6 and −3.4 (RECORDING → HIGH-LIFE)" },
  { exhibitId: "saxophone", position: [23.8, HALL.walkwayFloorY, 7], yawOffsetDeg: 0, note: "E walkway, bay between the wall pillars at z 3.4 and 10.6 (HIGH-LIFE → EXPLOSION)" },
  { exhibitId: "boombox", position: [10.7, HALL.walkwayFloorY, 23.6], yawOffsetDeg: 0, note: "S walkway, east bay (EXPLOSION → TRANSITION)" },
  { exhibitId: "guitar", position: [-10.7, HALL.walkwayFloorY, 23.6], yawOffsetDeg: 0, note: "S walkway, west bay (TRANSITION → NAIJA)" },
  { exhibitId: "conga", position: [-23.8, HALL.walkwayFloorY, 7], yawOffsetDeg: 0, note: "W walkway, bay between the wall pillars at z 10.6 and 3.4 (NAIJA → AFROBEATS)" },
  { exhibitId: "tambourine", position: [-23.8, HALL.walkwayFloorY, -7], yawOffsetDeg: 0, note: "W walkway, bay between the wall pillars at z −3.4 and −10.6 (AFROBEATS → GLOBAL)" },
];

/** Heading (rotation.y) of an exhibit: front (+Z) towards the hall centre, plus the slot's offset. */
export const exhibitHeading = (slot: ExhibitSlot): number =>
  Math.atan2(-slot.position[0], -slot.position[2]) + (slot.yawOffsetDeg * Math.PI) / 180;

// ---------------------------------------------------------------------------
// Derived layout (curve, progress anchors, headings, view anchors)
// ---------------------------------------------------------------------------

/**
 * Future camera states (not implemented yet — data only):
 *   TRAVEL   camera on the route, looking along it.
 *   APPROACH camera still on the route; inside the station's `approach` progress window
 *            it gradually turns toward `view.target` (and may slow slightly).
 *   FOCUS    camera leaves the route for `focusCamera` (listening mode) and returns.
 * Approach window, as fractions of the gap to the neighbouring station's progress.
 */
export const APPROACH_WINDOW = { before: 0.45, after: 0.2 } as const;

export interface StationLayout extends StationSlot {
  /** Arc-length progress of the station's view point on the loop, in [0, 1). */
  progress: number;
  /** Same, in metres along the loop from ROOTS. */
  distanceAlongLoop: number;
  /** Yaw (radians) for rotation.y so the station's front (+Z) faces its view point. */
  heading: number;
  /** Unit horizontal vector the station faces. */
  forward: Vec3;
  /** Route look-at anchor: above the station centre at deck height. */
  lookAt: Vec3;
  /** Route view anchor (TRAVEL/APPROACH): on the curve at `progress`, looking at `lookAt`. */
  view: { position: Vec3; target: Vec3 };
  /** APPROACH progress window around `progress` (may wrap across 0 — use progressDelta). */
  approach: { start: number; end: number };
  /** Platter / record centre in world space. */
  platter: Vec3;
  /** Listening-mode (FOCUS) camera: position and look-at (the platter centre). */
  focusCamera: { position: Vec3; target: Vec3; authoring: FocusAuthoring };
}

export interface HallLayout {
  curve: THREE.CatmullRomCurve3;
  /** Loop length in metres. */
  length: number;
  stations: readonly StationLayout[];
}

const toVec3 = (v: THREE.Vector3): Vec3 => [v.x, v.y, v.z];

/** Arc-length progress of the curve point nearest to `point`. */
function nearestProgress(curve: THREE.CatmullRomCurve3, point: THREE.Vector3, samples = 4000): number {
  const probe = new THREE.Vector3();
  let best = 0;
  let bestDistance = Infinity;
  for (let i = 0; i < samples; i++) {
    const u = i / samples;
    const distance = curve.getPointAt(u, probe).distanceToSquared(point);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = u;
    }
  }
  return best;
}

function buildHallLayout(): HallLayout {
  const curve = new THREE.CatmullRomCurve3(
    PATH_CONTROL_POINTS.map((p) => new THREE.Vector3(...p)),
    true,
    "centripetal",
  );
  curve.arcLengthDivisions = 2000;
  const length = curve.getLength();

  const progresses = STATION_SLOTS.map((slot) =>
    slot.viewControlPoint === 0 ? 0 : nearestProgress(curve, new THREE.Vector3(...PATH_CONTROL_POINTS[slot.viewControlPoint])),
  );

  const stations = STATION_SLOTS.map((slot, i): StationLayout => {
    const progress = progresses[i];
    const camera = curve.getPointAt(progress);
    const dx = camera.x - slot.position[0];
    const dz = camera.z - slot.position[2];
    const horizontal = Math.hypot(dx, dz);
    const heading = Math.atan2(dx, dz);
    const lookAt: Vec3 = [slot.position[0], slot.position[1] + HALL.stationFocusHeight, slot.position[2]];

    // APPROACH window: a fraction of the gap to each neighbour.
    const previous = progresses[(i - 1 + progresses.length) % progresses.length];
    const next = progresses[(i + 1) % progresses.length];
    const approach = {
      start: wrapProgress(progress - APPROACH_WINDOW.before * wrapProgress(progress - previous)),
      end: wrapProgress(progress + APPROACH_WINDOW.after * wrapProgress(next - progress)),
    };

    // Platter centre: PLATTER_OFFSET rotated into the station's heading.
    const station = new THREE.Vector3(...slot.position);
    const yaw = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), heading);
    const platter = new THREE.Vector3(...PLATTER_OFFSET).applyQuaternion(yaw).add(station);

    // FOCUS camera: orbit the platter at the authored yaw / distance / eye height.
    const authoring: FocusAuthoring = { ...DEFAULT_FOCUS, ...slot.focusAuthoring };
    const direction = heading + THREE.MathUtils.degToRad(authoring.yawOffsetDeg);
    const focusPosition: Vec3 = [
      platter.x + Math.sin(direction) * authoring.distance,
      slot.position[1] + authoring.eyeHeight,
      platter.z + Math.cos(direction) * authoring.distance,
    ];

    return {
      ...slot,
      progress,
      distanceAlongLoop: progress * length,
      heading,
      forward: [dx / horizontal, 0, dz / horizontal],
      lookAt,
      view: { position: toVec3(camera), target: lookAt },
      approach,
      platter: toVec3(platter),
      focusCamera: { position: focusPosition, target: toVec3(platter), authoring },
    };
  });

  return { curve, length, stations };
}

let cached: HallLayout | null = null;

/** The marble hall layout (built once). */
export function getHallLayout(): HallLayout {
  cached ??= buildHallLayout();
  return cached;
}

// ---------------------------------------------------------------------------
// Loop helpers (for future scroll, station detail tiers and audio neighbours)
// ---------------------------------------------------------------------------

/** Wraps any (unbounded) progress value into [0, 1). */
export const wrapProgress = (u: number): number => ((u % 1) + 1) % 1;

/** Shortest signed progress difference from `from` to `to`, in [−0.5, 0.5). */
export const progressDelta = (from: number, to: number): number => wrapProgress(to - from + 0.5) - 0.5;

/** Previous / next station indices on the loop (GLOBAL ↔ ROOTS wrap). */
export function stationNeighbours(index: number): { previous: number; next: number } {
  const count = STATION_SLOTS.length;
  return { previous: (index - 1 + count) % count, next: (index + 1) % count };
}

/** Station whose progress anchor is nearest to `u` along the loop. */
export function nearestStationIndex(u: number, layout: HallLayout = getHallLayout()): number {
  let best = 0;
  let bestDelta = Infinity;
  for (const station of layout.stations) {
    const delta = Math.abs(progressDelta(u, station.progress));
    if (delta < bestDelta) {
      bestDelta = delta;
      best = station.index;
    }
  }
  return best;
}
