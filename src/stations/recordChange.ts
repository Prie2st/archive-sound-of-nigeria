/**
 * Record change — the ONE authoritative controller for changing the record on the focused
 * station (docs/RECORD_CHANGE.md). It sequences the existing systems; it re-implements none:
 *
 *   audio     AudioEngine.holdEra / prepareTrack / selectTrack / releaseEra (Web Audio stays there)
 *   platter   PlatterMotionSystem — this controller only decides the era's platter DEMAND
 *   tonearm   TonearmController.request (legal lift → swing → lower paths stay its job)
 *   vinyl     this controller's record offset (turntable space) + sleeve shift, applied by the scene
 *   identity  TrackSelection (= the mounted record) is committed at ONE point: the old record is
 *             off the deck, at the staging position; the scene then shows the new label / sleeve
 *
 * Explicit phases, one at a time, advanced by elapsed (clamped) frame time — no timers, no
 * competing timelines. One request runs; one more may wait in the queue. While a change runs,
 * focus exit is locked (an exit request is remembered and honoured once the deck is stable).
 *
 * Track identity terms: request = {era, from, to}; pending = `to` until it plays; selected =
 * mounted = TrackSelection (committed at the staging point); playing = the engine's live voice.
 *
 * Also owns the stable-state tonearm sync for every era: an era whose selected record has a live
 * voice holds its arm in PLAY, otherwise REST — animated for the full-detail ACTIVE rig, placed
 * directly for arms not shown in full detail (so a playing deck never shows a parked arm).
 *
 * Plain TypeScript (Node tests drive it with fakes and the real tonearm / platter systems).
 */
import { ERAS, getEra, getEraByIndex, stepInPlaylist } from "../data/eras.ts";
import type { EraId } from "../data/types.ts";
import type { InteractionMode } from "../state/focus.ts";
import type { TonearmController, TonearmPose } from "./tonearmMotion.ts";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface RecordChangeConfig {
  /** Seconds: the playing record ducks to silence (engine hold fade). */
  duckSeconds: number;
  /**
   * Seconds into the duck at which the arm starts lifting. The stylus visibly leaves the groove ≈0.09 s
   * into the lift (quintic ease, 0.32 s), so with 0.2 s it parts from the record as the duck completes.
   */
  armLiftAfter: number;
  /** The record may only leave the platter at or below this RPM. */
  removalRpm: number;
  /** Playback speed (RPM) and the fraction of it at which the needle may drop. */
  playbackRpm: number;
  playbackReadyFraction: number;
  /** Metres the record rises above its mounted position (spindle top is 13.66 mm above the mat). */
  liftHeight: number;
  /** Off-deck staging position (turntable space, relative to the mounted record): toward the sleeve, −X. */
  staging: readonly [number, number, number];
  /** How far the sleeve slides toward storage (station −X, metres) while the records are swapped. */
  sleeveShift: number;
  /** Extra height at the middle of a lateral move (a slight arc), and the "set down" at the staging point. */
  arcHeight: number;
  storageDip: number;
  liftSeconds: number;
  removeSeconds: number;
  prepareSeconds: number;
  insertSeconds: number;
  lowerSeconds: number;
  /** The destination record's artwork may delay INSERT at most this long (s) after the staging dwell. */
  artworkTimeout: number;
  /** Fraction of the needle's lowering travel at which the destination voice starts (≈ apparent contact). */
  contactFraction: number;
  /**
   * Seconds after needle contact before PLAYING is declared. The engine's fresh-voice fade keeps rising on its
   * own (τ 0.12 s): 0.4 s ≈ 96 % of full level, 0.6 s ≈ 99 %.
   */
  fadeInSeconds: number;
  /** Longest frame integrated at once (s). */
  maxDelta: number;
}

export const RECORD_CHANGE_CONFIG: RecordChangeConfig = {
  duckSeconds: 0.3,
  armLiftAfter: 0.2,
  removalRpm: 1,
  playbackRpm: 100 / 3,
  playbackReadyFraction: 0.95,
  liftHeight: 0.025,
  staging: [-0.36, 0, 0],
  sleeveShift: 0.06,
  arcHeight: 0.012,
  storageDip: 0.01,
  liftSeconds: 0.4,
  removeSeconds: 0.55,
  prepareSeconds: 0.35,
  insertSeconds: 0.55,
  lowerSeconds: 0.45,
  artworkTimeout: 2,
  contactFraction: 0.97,
  fadeInSeconds: 0.4,
  maxDelta: 0.1,
};

// ---------------------------------------------------------------------------
// Phases
// ---------------------------------------------------------------------------

/** Stable phases (no change running), derived for the ACTIVE era. PLAYING is the canonical one. */
export const STABLE_PHASES = ["PLAYING", "STARTING", "STOPPED", "UNAVAILABLE"] as const;
/** The record-change sequence, in order. */
export const CHANGE_PHASES = [
  "DUCK_AUDIO",
  "LIFT_ARM",
  "RETURN_ARM",
  "STOP_PLATTER",
  "LIFT_RECORD",
  "REMOVE_RECORD",
  "PREPARE_NEXT",
  "INSERT_RECORD",
  "LOWER_RECORD",
  "SPIN_UP",
  "MOVE_ARM_TO_PLAY",
  "LOWER_NEEDLE",
  "FADE_IN_AUDIO",
] as const;
export type StablePhase = (typeof STABLE_PHASES)[number];
export type ChangePhase = (typeof CHANGE_PHASES)[number];
export type RecordPhase = StablePhase | ChangePhase;

const ORDER: Record<ChangePhase, number> = Object.fromEntries(CHANGE_PHASES.map((phase, index) => [phase, index])) as Record<ChangePhase, number>;
/** Phases in which the record is off its mounted position (or travelling). */
const RECORD_MOVING = new Set<RecordPhase>(["LIFT_RECORD", "REMOVE_RECORD", "PREPARE_NEXT", "INSERT_RECORD", "LOWER_RECORD"]);

export type RecordDirection = "next" | "previous";
export type TrackLoadState = "idle" | "loading" | "ready" | "error" | "unavailable";
export type RecordRequestResult = "started" | "queued" | "rejected";
export type RecordChangeOutcome = "played" | "restored-after-load-failure" | "unavailable" | "stopped";

export interface RecordChangeRequest {
  eraId: EraId;
  fromTrackId: string;
  toTrackId: string;
  direction: RecordDirection | "direct";
}

/** The existing systems, seen through the smallest surface the controller needs. */
export interface RecordChangePorts {
  audio: {
    unlocked(): boolean;
    playbackWanted(): boolean;
    /** The era's selected (= mounted) record. */
    selected(eraId: EraId): string;
    /** Era-locked selection commit (false for a record of another era). */
    select(eraId: EraId, trackId: string): boolean;
    /** Track of the era's live voice, or null. */
    voiceTrack(eraId: EraId): string | null;
    hold(eraId: EraId, fadeSeconds: number): void;
    release(eraId: EraId): void;
    prepare(eraId: EraId, trackId: string): void;
    loadState(eraId: EraId, trackId: string): TrackLoadState;
  };
  artwork: { prepare(eraId: EraId, trackId: string): void; ready(eraId: EraId, trackId: string): boolean };
  platterRpm(index: number): number;
  /** The era's tonearm controller (null until its rig exists). */
  tonearm(index: number): TonearmController | null;
  /** Whether the era's FULL-DETAIL rig is on screen: its arm animates; other arms are placed directly. */
  tonearmAnimated(index: number): boolean;
  focus: { mode(): InteractionMode; station(): number; exit(): void };
  activeIndex(): number;
  /** The era's playlist, in display order (default: the era data). Any length ≥ 1; steps wrap inside it. */
  playlist?(eraId: EraId): readonly { id: string }[];
}

/** Discrete state for React (changes only on semantic events). */
export interface RecordChangeSnapshot {
  phase: RecordPhase;
  eraId: EraId | null;
  changing: boolean;
  fromTrackId: string | null;
  pendingTrackId: string | null;
  queued: RecordDirection | null;
  exitPending: boolean;
  lastOutcome: RecordChangeOutcome | null;
}

const ease = (t: number) => {
  const x = Math.min(1, Math.max(0, t));
  return x * x * x * (x * (x * 6 - 15) + 10);
};
const armClear = (arm: TonearmController) => arm.currentPose === "REST" || arm.currentPose === "LIFTED_REST";

// ---------------------------------------------------------------------------
// Controller
// ---------------------------------------------------------------------------

export class RecordChangeController {
  readonly config: RecordChangeConfig;
  phase: RecordPhase = "STOPPED";
  /** Era index of the running change, or of the ACTIVE era while stable. */
  eraIndex = 0;
  request: RecordChangeRequest | null = null;
  queued: RecordDirection | null = null;
  exitPending = false;
  /** The destination selection has been committed (old record off the deck). */
  committed = false;
  /** A pre-commit load failure turned the change into a restore of the original record. */
  restoring = false;
  /** The destination voice has been released (started) at needle contact. */
  audioReleased = false;
  lastOutcome: RecordChangeOutcome | null = null;
  /** Seconds in the current phase. */
  elapsed = 0;
  /** Record offset from its mounted position, turntable space (metres). */
  readonly vinyl: [number, number, number] = [0, 0, 0];
  /** Sleeve shift toward storage, 0 (display) … 1 (out). */
  sleeve = 0;
  /** Completed changes (for tests / dev readout). */
  completed = 0;
  private readonly ports: RecordChangePorts;
  private keepSpinning = false;
  /** A change started from input between frames: the next frame's delta predates it and is not counted. */
  private startedBetweenFrames = false;
  /** Last semantic arm pose asserted per era (edge-triggered: manual / dev commands persist until playback changes). */
  private readonly armIntent: (TonearmPose | null)[] = Array.from({ length: ERAS.length }, () => null);
  private wasAudible = false;
  private snapshot: RecordChangeSnapshot;
  private readonly listeners = new Set<() => void>();

  constructor(ports: RecordChangePorts, config: RecordChangeConfig = RECORD_CHANGE_CONFIG) {
    this.ports = ports;
    this.config = config;
    this.snapshot = this.buildSnapshot();
  }

  get changing(): boolean {
    return this.request !== null;
  }

  /** Destination of the running change (the original record while restoring). */
  get targetTrackId(): string | null {
    if (!this.request) return null;
    return this.restoring ? this.request.fromTrackId : this.request.toTrackId;
  }

  /** pendingTrack: requested, not yet playing (null once played / restored / stable). */
  get pendingTrackId(): string | null {
    return this.request && !this.restoring ? this.request.toTrackId : null;
  }

  // --- input -----------------------------------------------------------------

  /** Whether NEXT / PREVIOUS may be accepted (start or queue): exactly FOCUS on the ACTIVE station, no exit pending. */
  inputOpen(): boolean {
    const { focus } = this.ports;
    return focus.mode() === "FOCUS" && focus.station() === this.ports.activeIndex() && !this.exitPending;
  }

  /**
   * NEXT / PREVIOUS inside the focused era. Starts a change, or — while one runs — stores this
   * direction as the single queued request (replacing an earlier one).
   */
  requestStep(direction: RecordDirection): RecordRequestResult {
    if (!this.inputOpen()) return "rejected";
    if (this.request) {
      this.queued = direction;
      this.emit();
      return "queued";
    }
    return this.start(direction, null) ? "started" : "rejected";
  }

  /** Direct selection of a record of the focused era (e.g. dev "reset to hero"); only while stable. */
  requestTrack(trackId: string): RecordRequestResult {
    if (!this.inputOpen() || this.request) return "rejected";
    return this.start("direct", trackId) ? "started" : "rejected";
  }

  /**
   * Focus-exit guard (FocusController): allowed while stable. During a change the exit is
   * remembered (queued NEXT/PREVIOUS dropped) and performed once the deck is stable again.
   */
  allowFocusExit(): boolean {
    if (!this.request) return true;
    this.exitPending = true;
    this.queued = null;
    this.emit();
    return false;
  }

  // --- semantic outputs ------------------------------------------------------

  /**
   * Platter demand for an era: `audioPlaying` (the normal rule) unless that era is changing records —
   * then the phase decides: keep the deck as it was until the arm is clear, stopped while the record
   * is off or travelling, spinning again once the destination is mounted.
   */
  platterDemand(index: number, audioPlaying: boolean): boolean {
    if (!this.request || index !== this.eraIndex) return audioPlaying;
    const phase = this.phase as ChangePhase;
    if (phase === "DUCK_AUDIO" || phase === "LIFT_ARM") return this.keepSpinning; // stylus may still be down
    return ORDER[phase] >= ORDER.SPIN_UP; // raised arm swinging home → coast down; record seated → spin up
  }

  // --- frame -----------------------------------------------------------------

  update(delta: number) {
    const dt = Math.min(Math.max(delta, 0), this.config.maxDelta);
    if (this.request) {
      if (this.startedBetweenFrames) this.startedBetweenFrames = false;
      else this.elapsed += dt;
      this.step();
    }
    if (!this.request) this.settleStable();
    this.syncTonearms();
  }

  /** Development invariants: an empty list means no impossible combination right now. */
  checkInvariants(): string[] {
    const problems: string[] = [];
    const { audio } = this.ports;
    const i = this.eraIndex;
    const era = getEraByIndex(i).id;
    const arm = this.ports.tonearm(i);
    const rpm = this.ports.platterRpm(i);
    const offset = Math.hypot(this.vinyl[0], this.vinyl[1], this.vinyl[2]);
    if (this.phase === "PLAYING") {
      if (arm && arm.currentPose !== "PLAY") problems.push(`PLAYING but tonearm ${arm.currentPose ?? arm.phase}`);
      if (rpm < this.config.playbackRpm * this.config.playbackReadyFraction) problems.push(`PLAYING but platter at ${rpm.toFixed(2)} RPM`);
      if (audio.voiceTrack(era) !== audio.selected(era)) problems.push("PLAYING but the playing record is not the mounted one");
      if (offset > 0) problems.push("PLAYING but the record is not mounted");
    }
    if (offset > 0) {
      if (arm && !armClear(arm)) problems.push("record off its mount while the tonearm is not clear");
      if (rpm > this.config.removalRpm) problems.push(`record off its mount at ${rpm.toFixed(2)} RPM`);
    }
    if (this.phase === "LOWER_NEEDLE") {
      if (offset > 0) problems.push("needle lowering onto a record that is not mounted");
      if (rpm < this.config.playbackRpm * this.config.playbackReadyFraction) problems.push("needle lowering before playback speed");
    }
    const pending = this.pendingTrackId;
    if (pending && audio.voiceTrack(era) === pending && !this.committed) problems.push("destination audible before the record was committed");
    if (this.request && audio.voiceTrack(era) !== null && RECORD_MOVING.has(this.phase)) problems.push("music playing while the record is off the platter");
    if (this.request && this.platterDemand(i, false) && offset > 0) problems.push("platter driven while the record is off its mount");
    if (this.request && arm && arm.currentPose === "PLAY" && !this.platterDemand(i, true) && rpm > 0) problems.push("platter slowing under a lowered stylus");
    return problems;
  }

  getSnapshot = (): RecordChangeSnapshot => this.snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  // --- internals -------------------------------------------------------------

  private start(direction: RecordDirection | "direct", trackId: string | null): boolean {
    const { audio, artwork } = this.ports;
    const index = this.ports.activeIndex();
    const eraId = getEraByIndex(index).id;
    const from = audio.selected(eraId);
    const playlist = this.ports.playlist?.(eraId) ?? getEra(eraId).tracks;
    if (!playlist.some((track) => track.id === from)) return false;
    const to =
      direction === "next"
        ? stepInPlaylist(playlist, from, 1).id
        : direction === "previous"
          ? stepInPlaylist(playlist, from, -1).id
          : trackId && playlist.some((track) => track.id === trackId)
            ? trackId
            : null;
    if (!to || to === from) return false;
    this.request = { eraId, fromTrackId: from, toTrackId: to, direction };
    this.eraIndex = index;
    this.committed = false;
    this.restoring = false;
    this.audioReleased = false;
    this.lastOutcome = null;
    this.wasAudible = audio.voiceTrack(eraId) === from;
    this.keepSpinning = this.wasAudible || this.ports.platterRpm(index) > 0;
    // Destination preparation starts NOW, in parallel with the duck, arm and platter.
    audio.prepare(eraId, to);
    artwork.prepare(eraId, to);
    audio.hold(eraId, this.config.duckSeconds);
    this.enter("DUCK_AUDIO");
    this.startedBetweenFrames = true;
    return true;
  }

  private enter(phase: RecordPhase) {
    this.phase = phase;
    this.elapsed = 0;
    this.emit();
  }

  /** One frame of the running change. Each phase waits for its own exit condition. */
  private step() {
    const request = this.request;
    if (!request) return;
    const c = this.config;
    const { audio } = this.ports;
    const i = this.eraIndex;
    const era = request.eraId;
    const arm = this.ports.tonearm(i);
    const rpm = this.ports.platterRpm(i);
    const target = this.targetTrackId ?? request.toTrackId;
    const load = audio.loadState(era, target);
    const phase = this.phase as ChangePhase;

    // A destination that fails to load before the old record leaves the platter: restore the original.
    if (!this.committed && !this.restoring && load === "error" && ORDER[phase] <= ORDER.STOP_PLATTER) {
      this.restoring = true;
      this.lastOutcome = "restored-after-load-failure";
      this.afterMount();
      return;
    }

    switch (phase) {
      case "DUCK_AUDIO":
        if (!this.wasAudible || this.elapsed >= c.armLiftAfter) this.enter("LIFT_ARM");
        break;
      case "LIFT_ARM":
        if (!arm || armClear(arm) || arm.currentPose === "LIFTED_PLAY") this.enter("RETURN_ARM");
        else arm.request("LIFTED_PLAY");
        break;
      case "RETURN_ARM":
        if (!arm || armClear(arm)) this.enter("STOP_PLATTER");
        else arm.request("LIFTED_REST");
        break;
      case "STOP_PLATTER": {
        // Platter demand is now off. The record may leave once the deck is safe AND the destination audio
        // has resolved (ready / unavailable; a failure was handled above) — normally long before.
        const resolved = !audio.unlocked() || load === "ready" || load === "unavailable";
        if (rpm <= c.removalRpm && resolved) this.enter("LIFT_RECORD");
        break;
      }
      case "LIFT_RECORD": {
        const t = this.elapsed / c.liftSeconds;
        this.setVinyl(0, c.liftHeight * ease(t), 0);
        if (t >= 1) this.enter("REMOVE_RECORD");
        break;
      }
      case "REMOVE_RECORD": {
        const t = Math.min(1, this.elapsed / c.removeSeconds);
        this.travel(ease(t), t);
        this.sleeve = ease(t);
        if (t >= 1) {
          this.commit(request);
          this.enter("PREPARE_NEXT");
        }
        break;
      }
      case "PREPARE_NEXT": {
        const t = Math.min(1, this.elapsed / c.prepareSeconds);
        const [sx, , sz] = c.staging;
        this.setVinyl(sx, c.liftHeight - c.storageDip * Math.sin(Math.PI * t), sz);
        const artworkReady = this.ports.artwork.ready(era, target) || this.elapsed >= c.prepareSeconds + c.artworkTimeout;
        if (t >= 1 && artworkReady) this.enter("INSERT_RECORD");
        break;
      }
      case "INSERT_RECORD": {
        const t = Math.min(1, this.elapsed / c.insertSeconds);
        this.travel(1 - ease(t), t);
        this.sleeve = 1 - ease(t);
        if (t >= 1) this.enter("LOWER_RECORD");
        break;
      }
      case "LOWER_RECORD": {
        const t = Math.min(1, this.elapsed / c.lowerSeconds);
        this.setVinyl(0, c.liftHeight * (1 - ease(t)), 0);
        if (t >= 1) {
          this.setVinyl(0, 0, 0); // canonical mounted transform: no accumulated error
          this.sleeve = 0;
          this.afterMount();
        }
        break;
      }
      case "SPIN_UP":
        audio.prepare(era, target); // idempotent (covers audio unlocked mid-change)
        // The record is seated: the RAISED arm may already swing over the groove while the platter spins up.
        // The needle still waits (LOWER_NEEDLE only after ≥ 95 % speed).
        if (arm && load !== "error" && load !== "unavailable" && audio.playbackWanted()) arm.request("LIFTED_PLAY");
        if (load === "error" || load === "unavailable") this.finish("unavailable");
        else if (!audio.playbackWanted()) this.finish("stopped");
        else if (rpm >= c.playbackRpm * c.playbackReadyFraction) this.enter("MOVE_ARM_TO_PLAY");
        break;
      case "MOVE_ARM_TO_PLAY":
        if (load === "error" || load === "unavailable") this.finish("unavailable");
        else if (!audio.playbackWanted()) this.finish("stopped");
        else if (!arm) this.enter("LOWER_NEEDLE");
        else {
          arm.request("LIFTED_PLAY");
          // Hover over the groove until the destination is decoded (normally already true).
          if (arm.currentPose === "LIFTED_PLAY" && load === "ready") this.enter("LOWER_NEEDLE");
        }
        break;
      case "LOWER_NEEDLE": {
        if (arm) arm.request("PLAY");
        const down = !arm || arm.currentPose === "PLAY";
        if (!this.audioReleased && (down || (arm && this.loweredFraction(arm) >= c.contactFraction))) {
          audio.release(era); // the destination starts at zero gain and rises (engine fresh-voice fade)
          this.audioReleased = true;
        }
        if (down) this.enter("FADE_IN_AUDIO");
        break;
      }
      case "FADE_IN_AUDIO":
        if (this.elapsed >= c.fadeInSeconds) {
          if (load === "error") this.finish("unavailable");
          else this.finish(this.restoring ? "restored-after-load-failure" : "played");
        }
        break;
    }
  }

  /** Record mounted again: unavailable / stopped endings, or spin up for playback. */
  private afterMount() {
    const request = this.request;
    if (!request) return;
    const target = this.targetTrackId ?? request.toTrackId;
    const load = this.ports.audio.loadState(request.eraId, target);
    if (load === "unavailable" || (load === "error" && !this.restoring)) this.finish("unavailable");
    else if (!this.ports.audio.playbackWanted()) this.finish("stopped");
    else this.enter("SPIN_UP");
  }

  /** The physical commit point: the old record is off the deck — the selection (= mounted record) changes. */
  private commit(request: RecordChangeRequest) {
    if (this.committed) return;
    this.ports.audio.select(request.eraId, request.toTrackId); // era-locked; the era is held → no voice yet
    this.committed = true;
    this.emit();
  }

  private finish(outcome: RecordChangeOutcome) {
    const request = this.request;
    if (!request) return;
    const arm = this.ports.tonearm(this.eraIndex);
    if (outcome === "unavailable" || outcome === "stopped") arm?.request("REST"); // park the arm off the record
    if (!this.audioReleased) this.ports.audio.release(request.eraId);
    this.lastOutcome = outcome;
    this.request = null;
    this.restoring = false;
    this.committed = false;
    this.audioReleased = false;
    this.setVinyl(0, 0, 0);
    this.sleeve = 0;
    this.armIntent[this.eraIndex] = null; // re-assert the semantic pose from the new playback state
    this.completed++;
    this.settleStable();
  }

  /** Stable bookkeeping: derived phase of the ACTIVE era, then a pending exit or the queued request. */
  private settleStable() {
    const index = this.ports.activeIndex();
    this.eraIndex = index;
    const derived = this.derivePhase(index);
    if (derived !== this.phase) this.enter(derived);
    if (this.exitPending) {
      this.exitPending = false;
      this.emit();
      this.ports.focus.exit();
      return;
    }
    if (this.queued) {
      const direction = this.queued;
      this.queued = null;
      if (!this.inputOpen() || !this.start(direction, null)) this.emit();
      else this.startedBetweenFrames = false; // started inside a frame: its next delta is real
    }
  }

  private derivePhase(index: number): StablePhase {
    const { audio } = this.ports;
    const era = getEraByIndex(index).id;
    const selected = audio.selected(era);
    if (audio.voiceTrack(era) === selected) {
      const arm = this.ports.tonearm(index);
      const ready = this.ports.platterRpm(index) >= this.config.playbackRpm * this.config.playbackReadyFraction;
      return ready && (!arm || arm.currentPose === "PLAY") ? "PLAYING" : "STARTING";
    }
    const load = audio.loadState(era, selected);
    if (load === "unavailable" || (audio.unlocked() && load === "error")) return "UNAVAILABLE";
    return "STOPPED";
  }

  /**
   * Stable eras: arm in PLAY while the selected record has a live voice, else REST. Edge-triggered — the
   * pose is asserted when that playback state changes (or after a change), so a manual / dev tonearm
   * command persists until then. Arms not shown in full detail never stay mid-move: they complete at once.
   */
  private syncTonearms() {
    const { audio } = this.ports;
    for (let i = 0; i < ERAS.length; i++) {
      if (this.request && i === this.eraIndex) continue; // the change owns this arm
      const arm = this.ports.tonearm(i);
      if (!arm) continue;
      const animated = this.ports.tonearmAnimated(i);
      if (!animated && arm.phase !== "IDLE") arm.snap(arm.targetPose);
      const era = getEraByIndex(i).id;
      const voice = audio.voiceTrack(era);
      const desired: TonearmPose = voice !== null && voice === audio.selected(era) ? "PLAY" : "REST";
      if (desired === this.armIntent[i]) continue;
      this.armIntent[i] = desired;
      if (animated) arm.request(desired);
      else arm.snap(desired);
    }
  }

  /** 0 at the raised pose … 1 at the playing contact pose. */
  private loweredFraction(arm: TonearmController): number {
    const raised = arm.poses.LIFTED_PLAY.lift;
    const play = arm.poses.PLAY.lift;
    return (arm.currentLift - raised) / (play - raised);
  }

  /** Lateral travel between "above the spindle" (s = 0) and the staging point (s = 1), with a slight arc. */
  private travel(s: number, t: number) {
    const c = this.config;
    this.setVinyl(c.staging[0] * s, c.liftHeight + c.arcHeight * Math.sin(Math.PI * t), c.staging[2] * s);
  }

  private setVinyl(x: number, y: number, z: number) {
    // + 0 normalises −0 (e.g. staging × 0), so "mounted" is exactly [0, 0, 0].
    this.vinyl[0] = x + 0;
    this.vinyl[1] = y + 0;
    this.vinyl[2] = z + 0;
  }

  private buildSnapshot(): RecordChangeSnapshot {
    return {
      phase: this.phase,
      eraId: this.request?.eraId ?? null,
      changing: this.request !== null,
      fromTrackId: this.request?.fromTrackId ?? null,
      pendingTrackId: this.pendingTrackId,
      queued: this.queued,
      exitPending: this.exitPending,
      lastOutcome: this.lastOutcome,
    };
  }

  private emit() {
    const next = this.buildSnapshot();
    const s = this.snapshot;
    if (
      s.phase === next.phase &&
      s.eraId === next.eraId &&
      s.changing === next.changing &&
      s.fromTrackId === next.fromTrackId &&
      s.pendingTrackId === next.pendingTrackId &&
      s.queued === next.queued &&
      s.exitPending === next.exitPending &&
      s.lastOutcome === next.lastOutcome
    )
      return;
    this.snapshot = next;
    for (const listener of this.listeners) listener();
  }
}
