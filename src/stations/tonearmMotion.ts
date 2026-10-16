/** Mechanical articulation only. No audio, platter, camera or record-selection inputs. */
export interface TonearmAngles {
  restSwing: number;
  leadInSwing: number;
  runOutSwing: number;
  restLift: number;
  playLift: number;
  raisedLift: number;
}

export const TONEARM_POSES = ["REST", "LIFTED_REST", "LIFTED_PLAY", "PLAY"] as const;
export type TonearmPose = (typeof TONEARM_POSES)[number];
export type TonearmPhase = "IDLE" | "LIFTING" | "SWINGING" | "LOWERING";
export interface TonearmPoseAngles { swing: number; lift: number }
export type TonearmPoses = Readonly<Record<TonearmPose, Readonly<TonearmPoseAngles>>>;

export const TONEARM_MOTION_CONFIG = {
  liftSeconds: 0.32,
  swingToPlaySeconds: 0.85,
  swingToRestSeconds: 0.85,
  lowerSeconds: 0.38,
  maxDelta: 0.1,
  contactClearance: 0.0005,
  contactTolerance: 0.003,
  minimumRaisedClearance: 0.010,
} as const;
export type TonearmMotionConfig = { [K in keyof typeof TONEARM_MOTION_CONFIG]: number };

/** Resolve once from the authored rig, in the swing pivot's frame (metres, radians). */
export function resolveTonearmPoses(
  angles: TonearmAngles,
  geometry: { tipY: number; tipZ: number; surfaceY: number },
): TonearmPoses {
  // Keep the authored lead-in swing. Correct only its rounded contact lift, to put the needle
  // 0.5 mm above the actual record top. No pivot, mesh, platter or anchor is changed.
  const radius = Math.hypot(geometry.tipY, geometry.tipZ);
  const playLift = Math.atan2(geometry.tipY, geometry.tipZ) - Math.asin((geometry.surfaceY + TONEARM_MOTION_CONFIG.contactClearance) / radius);
  if (!Number.isFinite(playLift) || Math.abs(playLift - angles.playLift) > 0.01) throw new Error("Tonearm contact correction exceeds the authored pose tolerance");
  const raisedY = geometry.tipY * Math.cos(angles.raisedLift) - geometry.tipZ * Math.sin(angles.raisedLift);
  if (raisedY - geometry.surfaceY < TONEARM_MOTION_CONFIG.minimumRaisedClearance) throw new Error("Tonearm raised pose has insufficient clearance");
  return Object.freeze({
    REST: Object.freeze({ swing: angles.restSwing, lift: angles.restLift }),
    LIFTED_REST: Object.freeze({ swing: angles.restSwing, lift: angles.raisedLift }),
    LIFTED_PLAY: Object.freeze({ swing: angles.leadInSwing, lift: angles.raisedLift }),
    PLAY: Object.freeze({ swing: angles.leadInSwing, lift: playLift }),
  });
}

const EPSILON = 1e-10;
const different = (a: number, b: number) => Math.abs(a - b) > EPSILON;
const ease = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);

/** One target and one axis segment. Swing is legal ONLY at the fully raised lift angle. */
export class TonearmController {
  readonly poses: TonearmPoses;
  readonly config: TonearmMotionConfig;
  targetPose: TonearmPose = "REST";
  currentPose: TonearmPose | null = "REST";
  phase: TonearmPhase = "IDLE";
  currentSwing: number;
  currentLift: number;
  targetSwing: number;
  targetLift: number;
  private from = 0;
  private to = 0;
  private elapsed = 0;
  private duration = 0;

  constructor(poses: TonearmPoses, config: TonearmMotionConfig = TONEARM_MOTION_CONFIG) {
    this.poses = poses;
    this.config = config;
    this.currentSwing = this.targetSwing = poses.REST.swing;
    this.currentLift = this.targetLift = poses.REST.lift;
  }

  request(pose: TonearmPose) {
    if (pose === this.targetPose) return;
    this.targetPose = pose;
    this.targetSwing = this.poses[pose].swing;
    this.targetLift = this.poses[pose].lift;
    // Replan from the CURRENT angles; no jump, competing timeline or pending timer.
    this.plan();
  }

  /**
   * Places the arm at a pose immediately (no motion): for arms that are not on screen in full detail
   * (a NEARBY / DISTANT era following its playback state, docs/RECORD_CHANGE.md). Never used for the
   * ACTIVE full-detail arm, which always moves through request().
   */
  snap(pose: TonearmPose) {
    this.targetPose = pose;
    this.targetSwing = this.currentSwing = this.poses[pose].swing;
    this.targetLift = this.currentLift = this.poses[pose].lift;
    this.phase = "IDLE";
    this.currentPose = pose;
  }

  update(delta: number) {
    let remaining = Math.min(Math.max(delta, 0), this.config.maxDelta);
    while (remaining > 0 && this.phase !== "IDLE") {
      const step = Math.min(remaining, this.duration - this.elapsed);
      this.elapsed = Math.min(this.duration, this.elapsed + step);
      remaining -= step;
      const value = this.from + (this.to - this.from) * ease(this.elapsed / this.duration);
      if (this.phase === "SWINGING") this.currentSwing = value;
      else this.currentLift = value;
      if (this.elapsed >= this.duration) {
        if (this.phase === "SWINGING") this.currentSwing = this.to;
        else this.currentLift = this.to;
        this.plan();
      }
    }
  }

  private plan() {
    const raised = this.poses.LIFTED_REST.lift;
    const needsSwing = different(this.currentSwing, this.targetSwing);
    if (needsSwing && different(this.currentLift, raised)) this.segment("LIFTING", raised);
    else if (needsSwing) this.segment("SWINGING", this.targetSwing);
    else if (different(this.currentLift, this.targetLift)) this.segment(different(this.targetLift, raised) ? "LOWERING" : "LIFTING", this.targetLift);
    else {
      this.phase = "IDLE";
      this.currentPose = this.targetPose;
    }
  }

  private segment(phase: Exclude<TonearmPhase, "IDLE">, to: number) {
    this.phase = phase;
    this.currentPose = null;
    this.from = phase === "SWINGING" ? this.currentSwing : this.currentLift;
    this.to = to;
    this.elapsed = 0;
    const p = this.poses;
    if (phase === "SWINGING") {
      const seconds = to === p.REST.swing ? this.config.swingToRestSeconds : this.config.swingToPlaySeconds;
      this.duration = seconds * Math.abs(to - this.from) / Math.abs(p.PLAY.swing - p.REST.swing);
    } else {
      const fraction = (this.currentSwing - p.REST.swing) / (p.PLAY.swing - p.REST.swing);
      const down = p.REST.lift + (p.PLAY.lift - p.REST.lift) * fraction;
      const seconds = phase === "LIFTING" ? this.config.liftSeconds : this.config.lowerSeconds;
      this.duration = seconds * Math.abs(to - this.from) / Math.abs(p.LIFTED_REST.lift - down);
    }
    this.duration = Math.max(0.001, this.duration);
  }
}

/** Controllers belong to eras. An inactive era pauses without losing its pose or target. */
export class TonearmMotionSystem {
  readonly states: (TonearmController | null)[];
  constructor(count: number) { this.states = Array.from({ length: count }, () => null); }
  register(index: number, poses: TonearmPoses) { this.states[index] ??= new TonearmController(poses); }
  request(index: number, pose: TonearmPose) { this.states[index]?.request(pose); }
  snap(index: number, pose: TonearmPose) { this.states[index]?.snap(pose); }
  update(delta: number, activeIndex: number) { this.states[activeIndex]?.update(delta); }
}
