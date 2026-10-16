/**
 * Visitor travel along the authored route (docs/CAMERA_RIG.md).
 *
 * Pure TypeScript (no React, no three objects) so Node tests can import it directly. The
 * route itself is NOT defined here: positions come from the one closed Catmull-Rom curve in
 * hallLayout.ts; this module only owns progress, velocity and the station influence model.
 *
 * Units: velocity in metres per second along the route (arc length), + = forward
 * (ROOTS → RECORDING → …). Progress is arc-length based (0–1 = one lap of the loop).
 */
import { progressDelta, wrapProgress } from "../data/hallLayout.ts";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface TravelConfig {
  // --- input → velocity ---
  /** m/s of velocity impulse per normalized wheel pixel (one mouse notch ≈ 100 px). */
  scrollSensitivity: number;
  /** A single wheel event is clamped to this many normalized pixels (big jumps, fast flicks). */
  maxWheelPixels: number;
  /** m/s of impulse per pixel of vertical touch drag (finger up = forward). */
  touchSensitivity: number;
  /** m/s of impulse per ArrowDown / PageDown (backward for ArrowUp / PageUp). */
  keyImpulse: number;
  /** Minimum time between two keyboard impulses while a key is held (s). */
  keyRepeatInterval: number;
  /** Multiplies every impulse (dev "acceleration scale"). */
  accelerationScale: number;
  /** Pending (not yet applied) impulse is capped at this many m/s. */
  maxPendingImpulse: number;
  /** Impulses are fed into the velocity over this time constant (s): the "slightly delayed" feel. */
  impulseSmoothing: number;
  // --- velocity ---
  /** Hard cap on |velocity| (m/s). Velocity is clamped — never the progress. */
  maxVelocity: number;
  /** Exponential friction (1/s): velocity × e^(−friction·dt). Coast distance = v / friction. */
  friction: number;
  /** Below this |velocity| (m/s) and with no pending impulse, travel stops. */
  minVelocity: number;
  // --- station approach (influence comes from the stations' approach windows) ---
  /** Effective max velocity at full influence = maxVelocity × max(minApproachSpeedMultiplier, 1 − slowdownStrength). */
  slowdownStrength: number;
  minApproachSpeedMultiplier: number;
  /** Extra friction at full influence (× friction): the visitor coasts slightly shorter near a station. */
  approachFrictionBoost: number;
  /** How quickly velocity above the approach limit eases down to it (1/s) — soft, never a snap. */
  slowdownResponse: number;
  // --- camera ---
  /** Route direction = average of the directions to two points this far ahead on the route (m). */
  lookAheadNear: number;
  lookAheadFar: number;
  /** How much the station's route look-at dominates the view at full influence (0–1). */
  stationLookWeight: number;
  /** Orientation follows its target with this rate (1/s): smooth, slightly delayed, never snaps. */
  orientationResponse: number;
  /**
   * Velocity-aware catch-up: response × (1 + orientationSpeedBoost × |v| / maxVelocity). Slow travel keeps
   * the cinematic lag; at top speed the view no longer trails a bend long enough to stare at a wall.
   */
  orientationSpeedBoost: number;
  /** Vertical FOV (degrees) while travelling and at full station influence. */
  travelFov: number;
  approachFov: number;
  /** FOV follows its target with this rate (1/s). */
  fovResponse: number;
  /** Roll into turns: degrees of roll per degree/second of yaw rate, capped at bankingMaxDeg. 0 = off. */
  bankingGain: number;
  bankingMaxDeg: number;
  bankingResponse: number;
  /** Active-era switching hysteresis (progress units): the nearer station must win by this much. */
  activeEraHysteresis: number;
}

export const TRAVEL_CONFIG: TravelConfig = {
  scrollSensitivity: 0.03, // 100 px notch → 3 m/s → ≈2 m of travel after friction
  maxWheelPixels: 150,
  touchSensitivity: 0.02,
  keyImpulse: 3,
  keyRepeatInterval: 0.18,
  accelerationScale: 1,
  maxPendingImpulse: 6,
  impulseSmoothing: 0.12,
  maxVelocity: 6, // ≈2.5 s from station to station at full speed
  friction: 1.4,
  minVelocity: 0.01,
  slowdownStrength: 0.35,
  minApproachSpeedMultiplier: 0.6,
  approachFrictionBoost: 0.5,
  slowdownResponse: 3,
  lookAheadNear: 4,
  lookAheadFar: 10,
  stationLookWeight: 1,
  orientationResponse: 3,
  orientationSpeedBoost: 0.6,
  travelFov: 52,
  approachFov: 47.5,
  fovResponse: 2,
  bankingGain: 0.04,
  bankingMaxDeg: 1,
  bankingResponse: 2,
  activeEraHysteresis: 0.005, // ≈0.6 m
};

/**
 * prefers-reduced-motion: much less inertia, no banking, minimal FOV change, gentler
 * station turns. Navigation itself is unchanged.
 */
export const REDUCED_MOTION_OVERRIDES: Partial<TravelConfig> = {
  friction: 4,
  impulseSmoothing: 0.04,
  approachFrictionBoost: 0,
  stationLookWeight: 0.55,
  orientationResponse: 4,
  approachFov: 51,
  bankingGain: 0,
  bankingMaxDeg: 0,
};

export const resolveTravelConfig = (reducedMotion: boolean): TravelConfig =>
  reducedMotion ? { ...TRAVEL_CONFIG, ...REDUCED_MOTION_OVERRIDES } : { ...TRAVEL_CONFIG };

// ---------------------------------------------------------------------------
// Progress
// ---------------------------------------------------------------------------

/**
 * Loop position in [0, 1) for any absolute (unbounded) progress: the closed route is
 * evaluated with this. 1.05 → 0.05, −0.10 → 0.90. Same as wrapProgress in hallLayout.ts.
 */
export const loopProgress = (absoluteProgress: number): number => wrapProgress(absoluteProgress);

// ---------------------------------------------------------------------------
// Station influence
// ---------------------------------------------------------------------------

/** The part of a station layout the influence model needs (see StationLayout in hallLayout.ts). */
export interface InfluenceAnchor {
  /** Arc-length progress of the station's route view point. */
  progress: number;
  /** Approach window (may wrap across 0): influence rises from `start`, peaks at `progress`, ends at `end`. */
  approach: { start: number; end: number };
}

/** C2-smooth 0 → 1 ramp (smootherstep). */
const smoother = (x: number): number => {
  const t = Math.min(1, Math.max(0, x));
  return t * t * t * (t * (t * 6 - 15) + 10);
};

/**
 * Influence of one station at loop position `u`, in [0, 1]: 0 outside its approach window,
 * rising smoothly to 1 at its progress anchor, falling smoothly to 0 at the window end.
 * Circular: ROOTS (anchor 0) influences 0.95–0.99 as well as 0.00–0.02.
 */
export function stationInfluence(u: number, station: InfluenceAnchor): number {
  const d = progressDelta(station.progress, u); // signed: < 0 before the anchor
  if (d < 0) {
    const before = wrapProgress(station.progress - station.approach.start);
    return before > 0 && -d <= before ? smoother(1 + d / before) : 0;
  }
  const after = wrapProgress(station.approach.end - station.progress);
  return after > 0 && d <= after ? smoother(1 - d / after) : 0;
}

export interface StrongestStation {
  /** Station index, −1 = none. */
  index: number;
  influence: number;
}

/**
 * The most influential station at `u` (approach windows never overlap). Pass `out` to reuse
 * an object in per-frame code.
 */
export function strongestStation(
  u: number,
  stations: readonly InfluenceAnchor[],
  out: StrongestStation = { index: -1, influence: 0 },
): StrongestStation {
  out.index = -1;
  out.influence = 0;
  for (let i = 0; i < stations.length; i++) {
    const value = stationInfluence(u, stations[i]);
    if (value > out.influence) {
      out.influence = value;
      out.index = i;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Active era (station) selection
// ---------------------------------------------------------------------------

/** Circular distance (progress units, 0–0.5) from `u` to a station anchor. */
const anchorDistance = (u: number, station: InfluenceAnchor) => Math.abs(progressDelta(u, station.progress));

/**
 * Index of the station whose anchor is nearest to `u` along the loop (wrap-aware), keeping
 * `current` unless another station is nearer by more than `hysteresis` — so hovering at the
 * midpoint between two stations cannot flicker the active era.
 */
export function selectActiveStation(
  u: number,
  current: number,
  stations: readonly InfluenceAnchor[],
  hysteresis: number,
): number {
  let nearest = 0;
  for (let i = 1; i < stations.length; i++) {
    if (anchorDistance(u, stations[i]) < anchorDistance(u, stations[nearest])) nearest = i;
  }
  if (current < 0 || current >= stations.length || nearest === current) return nearest;
  return anchorDistance(u, stations[current]) - anchorDistance(u, stations[nearest]) > hysteresis ? nearest : current;
}

// ---------------------------------------------------------------------------
// Input normalization
// ---------------------------------------------------------------------------

/** WheelEvent.deltaMode values. */
export const WHEEL_DELTA_PIXEL = 0;
export const WHEEL_DELTA_LINE = 1;
export const WHEEL_DELTA_PAGE = 2;

/**
 * Wheel delta in pixels, clamped to ±maxPixels: lines × 16, pages × the page height. Mouse
 * notches (≈100 px) and trackpads (many small deltas) end up on the same scale; one huge
 * event cannot launch the visitor across several eras.
 */
export function normalizeWheelDelta(deltaY: number, deltaMode: number, pageHeight: number, maxPixels: number): number {
  const pixels = deltaMode === WHEEL_DELTA_LINE ? deltaY * 16 : deltaMode === WHEEL_DELTA_PAGE ? deltaY * pageHeight : deltaY;
  return Math.max(-maxPixels, Math.min(maxPixels, pixels));
}

// ---------------------------------------------------------------------------
// Travel controller (state + inertial physics)
// ---------------------------------------------------------------------------

/**
 * Owns absolute progress and velocity. Input adds velocity impulses; `step` integrates
 * them once per frame. Mutable by design (read and written from the render loop and DOM
 * listeners, never through React state).
 */
export class TravelController {
  /** Continuous travel since the start, in laps (unbounded, never reset). */
  absoluteProgress: number;
  /** m/s along the route, + = forward. */
  velocity = 0;
  paused = false;
  /** Focus mode (FOCUS_TRANSITION_IN / FOCUS / FOCUS_TRANSITION_OUT): progress frozen, input ignored. */
  locked = false;
  /** Influence and station of the latest frame (written by the camera rig, for readouts). */
  influence = 0;
  influenceStation = -1;
  /** Station index of the active era (written by the camera rig). */
  activeStation = -1;
  reducedMotion = false;
  config: TravelConfig;
  /** Route length in metres (converts m/s to progress per second). */
  readonly routeLength: number;
  private pending = 0;
  private lastKeyTime = -Infinity;

  constructor(config: TravelConfig, routeLength: number, startProgress = 0) {
    this.config = config;
    this.routeLength = routeLength;
    this.absoluteProgress = startProgress;
  }

  get loopProgress(): number {
    return loopProgress(this.absoluteProgress);
  }

  /** Adds a velocity impulse (m/s); applied smoothly over the next frames. */
  addImpulse(deltaVelocity: number) {
    if (this.paused || this.locked) return;
    const limit = this.config.maxPendingImpulse;
    this.pending = Math.max(-limit, Math.min(limit, this.pending + deltaVelocity * this.config.accelerationScale));
  }

  /** Wheel: positive deltaY (scrolling down) travels forward. */
  addWheel(deltaY: number, deltaMode: number, pageHeight: number) {
    this.addImpulse(normalizeWheelDelta(deltaY, deltaMode, pageHeight, this.config.maxWheelPixels) * this.config.scrollSensitivity);
  }

  /** Touch drag: `deltaY` in pixels since the last move; finger moving up (negative) travels forward. */
  addDrag(deltaY: number) {
    this.addImpulse(-deltaY * this.config.touchSensitivity);
  }

  /** Keyboard: one impulse per press, rate-limited while held (`now` in seconds). */
  addKey(direction: 1 | -1, now: number) {
    if (now - this.lastKeyTime < this.config.keyRepeatInterval) return;
    this.lastKeyTime = now;
    this.addImpulse(direction * this.config.keyImpulse);
  }

  /**
   * Integrates one frame. `influence` (0–1) of the nearest station adds a little friction and
   * lowers the speed limit softly — pacing, never a stop or a snap.
   */
  step(dt: number, influence: number) {
    const c = this.config;
    if (this.paused || this.locked) {
      this.velocity = 0;
      this.pending = 0;
      return;
    }
    const applied = this.pending * (1 - Math.exp(-dt / c.impulseSmoothing));
    this.pending -= applied;
    this.velocity += applied;
    this.velocity *= Math.exp(-c.friction * (1 + c.approachFrictionBoost * influence) * dt);
    this.velocity = Math.max(-c.maxVelocity, Math.min(c.maxVelocity, this.velocity));
    const limit = c.maxVelocity * Math.max(c.minApproachSpeedMultiplier, 1 - c.slowdownStrength * influence);
    const speed = Math.abs(this.velocity);
    if (speed > limit) this.velocity = Math.sign(this.velocity) * (limit + (speed - limit) * Math.exp(-c.slowdownResponse * dt));
    if (Math.abs(this.velocity) < c.minVelocity && Math.abs(this.pending) < c.minVelocity) {
      this.velocity = 0;
      this.pending = 0;
    }
    this.absoluteProgress += (this.velocity * dt) / this.routeLength;
  }

  /**
   * DEVELOPMENT ONLY: teleport to a loop position (the equivalent nearest to the current
   * absolute progress, so the lap count is kept) and stop. Production era navigation must
   * travel along the loop instead.
   */
  devJumpTo(loopTarget: number) {
    if (this.locked) return; // never move the frozen travel position during focus
    this.absoluteProgress += progressDelta(this.loopProgress, loopTarget);
    this.velocity = 0;
    this.pending = 0;
  }

  /**
   * Focus lock. Locking discards velocity and pending impulses (no hidden momentum). Unlocking
   * restores `restoreProgress` exactly when given and starts at velocity 0 — new input is needed.
   */
  setLocked(locked: boolean, restoreProgress?: number) {
    this.locked = locked;
    this.velocity = 0;
    this.pending = 0;
    if (!locked && restoreProgress !== undefined) this.absoluteProgress = restoreProgress;
  }

  setPaused(paused: boolean) {
    this.paused = paused;
    if (paused) {
      this.velocity = 0;
      this.pending = 0;
    }
  }

  /** Switches to (or from) the reduced-motion config, keeping dev-tuned input scaling. */
  setReducedMotion(reduced: boolean) {
    this.reducedMotion = reduced;
    this.config = { ...resolveTravelConfig(reduced), accelerationScale: this.config.accelerationScale };
  }

  /** Dev tuning of individual constants. */
  tune(partial: Partial<TravelConfig>) {
    this.config = { ...this.config, ...partial };
  }

  /** Written once per frame by the camera rig (readouts only). */
  setTelemetry(influence: number, influenceStation: number, activeStation: number) {
    this.influence = influence;
    this.influenceStation = influenceStation;
    this.activeStation = activeStation;
  }
}
