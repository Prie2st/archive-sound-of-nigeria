/**
 * Platter playback motion (docs/PLATTER_MOTION.md): one motion state per ERA — not per LOD
 * tier — so a station keeps its angle and speed when it changes tier, becomes active, or the
 * camera focuses it.
 *
 * Each frame the system asks one semantic question per era ("is this era's selected record
 * logically playing?", answered by the audio engine) and moves that era's RPM toward 33⅓ or 0
 * with a critically damped spring (exact solution: frame-rate independent), then integrates the
 * angle from the RPM and the clamped frame time. Eras at rest cost nothing.
 *
 * Plain TypeScript (Node tests import it). The scene applies `angle` to the platter pivot.
 */

export interface PlatterMotionConfig {
  /** Playback speed (record RPM). 33⅓ — also the model's Platter.userData.rpm33. */
  rpm: number;
  /** Seconds from rest to within `settleFraction` of playback speed. */
  spinUpTime: number;
  /** Seconds from playback speed to within `settleFraction` of rest. */
  spinDownTime: number;
  /** The spring counts as settled within this fraction of the change. */
  settleFraction: number;
  /** Longest frame integrated at once (s): a stall or a hidden tab never jumps the disc. */
  maxDelta: number;
  /** Below this RPM (spinning down) the platter snaps to rest — 0.05 RPM is 0.3°/s, invisible. */
  restRpm: number;
  /** rotation.y sign per playback revolution: −1 = clockwise seen from above (the real direction). */
  direction: 1 | -1;
}

export const PLATTER_MOTION_CONFIG: PlatterMotionConfig = {
  rpm: 100 / 3,
  spinUpTime: 1.0,
  spinDownTime: 1.2,
  settleFraction: 0.02,
  maxDelta: 0.1,
  restRpm: 0.05,
  direction: -1,
};

const TAU = Math.PI * 2;

/**
 * Natural frequency ω of a critically damped spring that settles (from rest) to within `fraction`
 * of the step in `seconds`: (1 + ωt)·e^(−ωt) = fraction.
 */
export function settleOmega(seconds: number, fraction: number): number {
  // Solve (1 + x)·e^(−x) = fraction for x = ωt (monotonic for x > 0) by Newton's method.
  let x = 4;
  for (let i = 0; i < 30; i++) {
    const f = (1 + x) * Math.exp(-x) - fraction;
    const df = -x * Math.exp(-x);
    x -= f / df;
  }
  return x / seconds;
}

/** Development override per era: force the platter on / off regardless of the audio. */
export type PlatterOverride = "play" | "stop" | null;

export interface PlatterState {
  /** RPM the spring is heading to (0 or config.rpm). */
  targetRpm: number;
  currentRpm: number;
  /** RPM per second (spring velocity). */
  rpmVelocity: number;
  /** Platter rotation.y offset (radians), kept in (−2π, 2π). */
  angle: number;
  /** Whether the audio layer reported this era's record as playing on the last update. */
  audioPlaying: boolean;
  override: PlatterOverride;
}

/**
 * Advances one platter state by `dt` seconds (already clamped). Exact critically damped step on the
 * RPM error, trapezoidal angle integration — the result does not depend on how `dt` is split.
 */
export function stepPlatter(state: PlatterState, dt: number, config: PlatterMotionConfig, omegaUp: number, omegaDown: number) {
  const startRpm = state.currentRpm;
  const omega = state.targetRpm > state.currentRpm ? omegaUp : omegaDown;
  const error = state.currentRpm - state.targetRpm;
  const decay = Math.exp(-omega * dt);
  const coupled = state.rpmVelocity + omega * error;
  state.currentRpm = state.targetRpm + (error + coupled * dt) * decay;
  state.rpmVelocity = (state.rpmVelocity - omega * coupled * dt) * decay;
  if (state.targetRpm === 0 && Math.abs(state.currentRpm) < config.restRpm) {
    state.currentRpm = 0;
    state.rpmVelocity = 0;
  }
  const averageRpm = (startRpm + state.currentRpm) / 2;
  state.angle = (state.angle + config.direction * (averageRpm / 60) * TAU * dt) % TAU; // periodic: no visible snap
}

/** One motion state per era (index = era index); updated once per frame by the scene. */
export class PlatterMotionSystem {
  readonly config: PlatterMotionConfig;
  readonly states: PlatterState[];
  private readonly omegaUp: number;
  private readonly omegaDown: number;

  constructor(count: number, config: PlatterMotionConfig = PLATTER_MOTION_CONFIG) {
    this.config = config;
    this.omegaUp = settleOmega(config.spinUpTime, config.settleFraction);
    this.omegaDown = settleOmega(config.spinDownTime, config.settleFraction);
    this.states = Array.from({ length: count }, () => ({ targetRpm: 0, currentRpm: 0, rpmVelocity: 0, angle: 0, audioPlaying: false, override: null }));
  }

  /**
   * One frame: `isPlaying(index)` = the era's selected record is logically playing (audio layer,
   * semantic — muted still counts as playing). `delta` is clamped to config.maxDelta.
   */
  update(delta: number, isPlaying: (index: number) => boolean) {
    const dt = Math.min(Math.max(delta, 0), this.config.maxDelta);
    for (let i = 0; i < this.states.length; i++) {
      const state = this.states[i];
      state.audioPlaying = isPlaying(i);
      const playing = state.override === null ? state.audioPlaying : state.override === "play";
      state.targetRpm = playing ? this.config.rpm : 0;
      if (state.targetRpm === 0 && state.currentRpm === 0 && state.rpmVelocity === 0) continue; // at rest: nothing to do
      stepPlatter(state, dt, this.config, this.omegaUp, this.omegaDown);
    }
  }

  /** Development: force an era's platter on / off (null = follow the audio). */
  setOverride(index: number, override: PlatterOverride) {
    this.states[index].override = override;
  }
}
