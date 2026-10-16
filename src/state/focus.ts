/**
 * Listening-station FOCUS mode: interaction state machine and transition trajectory
 * (docs/FOCUS_MODE.md).
 *
 * Pure TypeScript (no React, no three objects) so Node tests and scripts/check-hall-layout.mjs
 * can import it. The CameraRig owns the camera and evaluates the pose; this module only owns
 * the mode, the transition progress and the saved travel position.
 */
import type { Vec3 } from "../data/hallLayout.ts";
import type { TravelController } from "./travel.ts";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export const FOCUS_CONFIG = {
  /**
   * Transition durations (s) scale gently with the flight distance (≈5.5 m from a route view
   * point, up to ≈11 m from the edge of a station's active range): base + perMetre × distance,
   * clamped to [min, max]. Fixed at max without a distance function (tests).
   */
  enter: { min: 1.1, max: 1.5, base: 1.0, perMetre: 0.045 },
  exit: { min: 0.9, max: 1.3, base: 0.8, perMetre: 0.045 },
  /** Vertical FOV at the focus pose (travel FOV is TravelConfig.travelFov / approachFov). */
  focusFov: 46,
  /**
   * Transition control point (quadratic Bézier): horizontally `controlBias` of the way from the
   * travel position to the focus position, `controlLift` m above the higher of the two — the
   * camera rises from the sunken ring early and settles onto the focus eye height.
   */
  controlBias: 0.5,
  controlLift: 0.2,
  /**
   * Invisible click / tap volume of the ACTIVE station, in station space (+Z = station front,
   * origin = table bottom-centre): covers table, turntable and the sleeve at local −X.
   */
  volume: { size: [2.4, 1.8, 1.8] as Vec3, center: [-0.2, 0.9, 0.15] as Vec3 },
  /** A pointer that moved more than this (px) between down and up is a drag, not a tap. */
  maxTapMovement: 8,
} as const;

export type FocusConfig = typeof FOCUS_CONFIG;

export interface TransitionTiming {
  min: number;
  max: number;
  base: number;
  perMetre: number;
}

/** Duration of a transition over `distance` metres. */
export const transitionDuration = (timing: TransitionTiming, distance: number): number =>
  Math.min(timing.max, Math.max(timing.min, timing.base + timing.perMetre * distance));

// ---------------------------------------------------------------------------
// Easing and trajectory
// ---------------------------------------------------------------------------

/** Restrained ease-in-out (sine): gentle start and landing, no overshoot. */
export const easeInOut = (t: number): number => 0.5 - 0.5 * Math.cos(Math.PI * Math.min(1, Math.max(0, t)));

/** Control point of the travel → focus Bézier (one rule for every station). */
export function transitionControlPoint(
  start: Vec3,
  end: Vec3,
  config: Pick<FocusConfig, "controlBias" | "controlLift"> = FOCUS_CONFIG,
  out: [number, number, number] = [0, 0, 0],
): [number, number, number] {
  const b = config.controlBias;
  out[0] = start[0] + (end[0] - start[0]) * b;
  out[1] = Math.max(start[1], end[1]) + config.controlLift;
  out[2] = start[2] + (end[2] - start[2]) * b;
  return out;
}

/** Point on the quadratic Bézier start → control → end at t ∈ [0, 1] (writes into `out`). */
export function bezierPoint(start: Vec3, control: Vec3, end: Vec3, t: number, out: [number, number, number] = [0, 0, 0]) {
  const a = (1 - t) * (1 - t);
  const b = 2 * (1 - t) * t;
  const c = t * t;
  out[0] = a * start[0] + b * control[0] + c * end[0];
  out[1] = a * start[1] + b * control[1] + c * end[1];
  out[2] = a * start[2] + b * control[2] + c * end[2];
  return out;
}

// ---------------------------------------------------------------------------
// State machine
// ---------------------------------------------------------------------------

/**
 * TRAVEL                 the route camera; travel input active.
 * FOCUS_TRANSITION_IN    leaving the route for the focus pose (travel locked).
 * FOCUS                  at the focus pose (travel locked).
 * FOCUS_TRANSITION_OUT   returning to the saved travel pose (travel locked).
 * (APPROACH is part of TRAVEL: station influence in the CameraRig.)
 */
export type InteractionMode = "TRAVEL" | "FOCUS_TRANSITION_IN" | "FOCUS" | "FOCUS_TRANSITION_OUT";

/**
 * Who asked to leave focus (docs/FOCUS_MODE.md §6). Every exit path names itself, so a stray exit can
 * be traced: the Escape key, the Close button, the dev inspector, or the record change honouring an
 * exit that was requested during a change. "unspecified" = a caller that did not say (should not occur).
 */
export type FocusExitSource = "escape-key" | "close-button" | "dev-panel" | "record-change-deferred" | "unspecified";

/** The input event behind an exit request (development diagnostics only). */
export interface FocusExitEvent {
  type: string;
  key?: string;
  isTrusted: boolean;
  /** Short description of the event target (tag / class). */
  target?: string;
  /** Pointer clicks report detail ≥ 1; keyboard-triggered clicks 0. */
  detail?: number;
}

/** One exit request as seen by the (optional) observer. */
export interface FocusExitRecord {
  source: FocusExitSource;
  /** Whether focus actually began to exit (false: wrong mode, or vetoed by the exit guard). */
  accepted: boolean;
  /** Mode when the request arrived. */
  mode: InteractionMode;
  event?: FocusExitEvent;
}

export interface FocusSnapshot {
  mode: InteractionMode;
  /** Focused station index (−1 in TRAVEL). */
  station: number;
}

/**
 * One transition controller: the mode, the focused station, a single linear progress scalar
 * (0 = travel pose, 1 = focus pose) and the frozen travel position. Requests made mid-
 * transition reverse it from wherever it is — there is never more than one transition.
 */
export class FocusController {
  mode: InteractionMode = "TRAVEL";
  station = -1;
  /** Linear transition progress; the camera uses easeInOut(progress). */
  progress = 0;
  /** absoluteProgress frozen when focus began (null in TRAVEL). */
  savedAbsoluteProgress: number | null = null;
  readonly config: FocusConfig;
  /** Durations of the current focus (set when focus begins). */
  enterDuration: number;
  exitDuration: number;
  /** Flight distance (m) from the travel position at `loopProgress` to a station's focus camera. */
  private flightDistance?: (station: number, loopProgress: number) => number;
  private snapshot: FocusSnapshot = { mode: "TRAVEL", station: -1 };
  private listeners = new Set<() => void>();
  /** Optional veto on leaving focus (the record change locks exit while a record is being changed). */
  private exitGuard: (() => boolean) | null = null;
  /** Optional observer of every exit request (development diagnostics). */
  private exitObserver: ((record: FocusExitRecord) => void) | null = null;

  constructor(config: FocusConfig = FOCUS_CONFIG, flightDistance?: (station: number, loopProgress: number) => number) {
    this.config = config;
    this.flightDistance = flightDistance;
    this.enterDuration = config.enter.max;
    this.exitDuration = config.exit.max;
  }

  get easedProgress(): number {
    return easeInOut(this.progress);
  }

  /** Whether `target` may be focused now: only the ACTIVE station, and only from TRAVEL (or re-entering the station being left). */
  canFocus(target: number, activeStation: number): boolean {
    if (target < 0 || target !== activeStation) return false;
    return this.mode === "TRAVEL" || (this.mode === "FOCUS_TRANSITION_OUT" && target === this.station);
  }

  /**
   * Starts (or resumes) focusing `target`. From TRAVEL it freezes travel exactly where it is:
   * absoluteProgress saved, velocity and pending impulses discarded, input ignored until exit.
   */
  requestFocus(target: number, activeStation: number, travel: TravelController): boolean {
    if (!this.canFocus(target, activeStation)) return false;
    if (this.mode === "TRAVEL") {
      this.station = target;
      this.progress = 0;
      this.savedAbsoluteProgress = travel.absoluteProgress;
      const distance = this.flightDistance?.(target, travel.loopProgress);
      this.enterDuration = distance === undefined ? this.config.enter.max : transitionDuration(this.config.enter, distance);
      this.exitDuration = distance === undefined ? this.config.exit.max : transitionDuration(this.config.exit, distance);
      travel.setLocked(true);
    }
    this.setMode("FOCUS_TRANSITION_IN");
    return true;
  }

  /**
   * Leaves focus (from FOCUS or mid-entry, reversing). No-op in TRAVEL or while already leaving, or when
   * the exit guard vetoes it. `source` / `event` only feed the optional observer (diagnostics).
   */
  requestExit(source: FocusExitSource = "unspecified", event?: FocusExitEvent): boolean {
    const mode = this.mode;
    const accepted = (mode === "FOCUS_TRANSITION_IN" || mode === "FOCUS") && (!this.exitGuard || this.exitGuard());
    if (accepted) this.setMode("FOCUS_TRANSITION_OUT");
    this.exitObserver?.({ source, accepted, mode, event });
    return accepted;
  }

  /** Development: observe every exit request (null removes the observer). */
  setExitObserver(observer: ((record: FocusExitRecord) => void) | null) {
    this.exitObserver = observer;
  }

  /** Advances the transition (dt already clamped by the caller). Completing an exit unlocks travel at the saved position, velocity 0. */
  step(dt: number, travel: TravelController) {
    if (this.mode === "FOCUS_TRANSITION_IN") {
      this.progress = Math.min(1, this.progress + dt / this.enterDuration);
      if (this.progress >= 1) this.setMode("FOCUS");
    } else if (this.mode === "FOCUS_TRANSITION_OUT") {
      this.progress = Math.max(0, this.progress - dt / this.exitDuration);
      if (this.progress <= 0) {
        travel.setLocked(false, this.savedAbsoluteProgress ?? undefined);
        this.station = -1;
        this.savedAbsoluteProgress = null;
        this.setMode("TRAVEL");
      }
    }
  }

  /** Installs (or removes, with null) the exit guard. Every exit path — Escape, Close, dev — goes through it. */
  setExitGuard(guard: (() => boolean) | null) {
    this.exitGuard = guard;
  }

  /**
   * Immediate return to TRAVEL at the saved position (no transition). Used when the camera rig
   * unmounts mid-focus (e.g. switching the dev camera to INSPECT) so travel can never stay locked.
   */
  reset(travel: TravelController) {
    if (this.mode === "TRAVEL") return;
    travel.setLocked(false, this.savedAbsoluteProgress ?? undefined);
    this.progress = 0;
    this.station = -1;
    this.savedAbsoluteProgress = null;
    this.setMode("TRAVEL");
  }

  // --- semantic state for React (useSyncExternalStore) ---
  getSnapshot = (): FocusSnapshot => this.snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private setMode(mode: InteractionMode) {
    this.mode = mode;
    if (this.snapshot.mode === mode && this.snapshot.station === this.station) return;
    this.snapshot = { mode, station: this.station };
    for (const listener of this.listeners) listener();
  }
}
