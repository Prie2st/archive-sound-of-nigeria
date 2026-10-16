/**
 * Record change orchestration: phase order, gating between the real tonearm / platter systems,
 * queue policy, focus-exit lock, identity commit, failures, persistence and frame-time safety.
 * Audio is a small fake with the engine's semantics (held eras have no voice; prepare ≠ play);
 * the real engine path is covered in src/audio/audio.test.ts. Runs on the PRODUCTION archive (5 entries per
 * era); the failure cases use the development fixtures (a fixture playlist through the controller's
 * playlist port), so a production record is never the one made to fail. Run with: npm test
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { TrackSelection } from "../audio/trackSelection.ts";
import { DEV_TRACKS_BY_ERA } from "../data/devFixtures.ts";
import { ERAS, getEra, getNextEra, getPreviousEra } from "../data/eras.ts";
import type { EraId } from "../data/types.ts";
import type { InteractionMode } from "../state/focus.ts";
import { AlbumStackSystem, restPose, stackOrder } from "./albumStack.ts";
import { PLATTER_MOTION_CONFIG, PlatterMotionSystem } from "./platterMotion.ts";
import { CHANGE_PHASES, RECORD_CHANGE_CONFIG, RecordChangeController, type RecordPhase, type TrackLoadState } from "./recordChange.ts";
import { resolveTonearmPoses, TonearmMotionSystem } from "./tonearmMotion.ts";

// The authored tonearm extras and measured runtime geometry (docs/TONEARM_MECHANICS.md).
const POSES = resolveTonearmPoses(
  { restSwing: 0, leadInSwing: -0.3318, runOutSwing: -0.735, restLift: 0, playLift: 0.0227, raisedLift: -0.0295 },
  { tipY: -0.0119424984, tipZ: 0.2300315015, surfaceY: 0.1013 + 0.001479117781855166 - 0.1199034974 },
);
const RPM = PLATTER_MOTION_CONFIG.rpm;
const STEP = 1 / 60;
const tracksOf = (eraId: EraId) => getEra(eraId).tracks.map((track) => track.id);
/** The development fixture playlist of an era (hero + two fixtures) — for deliberately failing records. */
const fixturesOf = (eraId: EraId) => DEV_TRACKS_BY_ERA[eraId].map((track) => track.id);

interface SelectionLike {
  get(eraId: EraId): string;
  select(eraId: EraId, trackId: string): boolean;
}

/** Era-locked selection over a synthetic playlist for one era (same rule as TrackSelection: only that era's records). */
class PlaylistSelection implements SelectionLike {
  private readonly base = new TrackSelection();
  private readonly eraId: EraId;
  private readonly ids: readonly string[];
  private current: string;
  constructor(eraId: EraId, ids: readonly string[]) {
    this.eraId = eraId;
    this.ids = ids;
    this.current = ids[0];
  }
  get(eraId: EraId) {
    return eraId === this.eraId ? this.current : this.base.get(eraId);
  }
  select(eraId: EraId, trackId: string) {
    if (eraId !== this.eraId) return this.base.select(eraId, trackId);
    if (!this.ids.includes(trackId)) return false;
    this.current = trackId;
    return true;
  }
}

/** Engine-like audio: voices for the active era and its neighbours, none for held eras; loads take `latency`. */
class FakeAudio {
  selection: SelectionLike = new TrackSelection();
  unlocked = true;
  wanted = true;
  active: EraId = "roots";
  latency = 0.25;
  time = 0;
  readonly voices = new Map<EraId, string>();
  readonly held = new Set<EraId>();
  readonly loads = new Map<string, { state: TrackLoadState; readyAt: number }>();
  readonly failing = new Set<string>();
  readonly unavailable = new Set<string>();
  readonly log: string[] = [];

  constructor() {
    for (const era of ERAS) this.loads.set(`${era.id}|${era.heroTrackId}`, { state: "ready", readyAt: 0 });
  }
  loadState(eraId: EraId, trackId: string): TrackLoadState {
    if (this.unavailable.has(trackId)) return "unavailable";
    return this.loads.get(`${eraId}|${trackId}`)?.state ?? "idle";
  }
  prepare(eraId: EraId, trackId: string) {
    if (!this.unlocked || this.unavailable.has(trackId) || this.loads.has(`${eraId}|${trackId}`)) return;
    this.loads.set(`${eraId}|${trackId}`, { state: "loading", readyAt: this.time + this.latency });
    this.log.push(`${this.time.toFixed(3)} prepare ${trackId}`);
  }
  hold(eraId: EraId) {
    this.held.add(eraId);
    this.log.push(`${this.time.toFixed(3)} hold ${eraId}`);
    this.reconcile();
  }
  release(eraId: EraId) {
    this.held.delete(eraId);
    this.log.push(`${this.time.toFixed(3)} release ${eraId}`);
    this.reconcile();
  }
  select(eraId: EraId, trackId: string) {
    const ok = this.selection.select(eraId, trackId);
    if (ok) this.log.push(`${this.time.toFixed(3)} select ${trackId}`);
    this.reconcile();
    return ok;
  }
  isPlaying(eraId: EraId) {
    return this.unlocked && this.voices.get(eraId) === this.selection.get(eraId);
  }
  tick(dt: number) {
    this.time += dt;
    for (const [key, load] of this.loads) {
      if (load.state === "loading" && this.time >= load.readyAt) load.state = this.failing.has(key.split("|")[1]) ? "error" : "ready";
    }
    this.reconcile();
  }
  reconcile() {
    const wanted = this.unlocked && this.wanted ? [this.active, getNextEra(this.active).id, getPreviousEra(this.active).id] : [];
    for (const [era, track] of this.voices) if (!wanted.includes(era) || this.held.has(era) || track !== this.selection.get(era)) this.voices.delete(era);
    for (const era of wanted) {
      const track = this.selection.get(era);
      if (this.held.has(era) || this.voices.has(era)) continue;
      if (this.loadState(era, track) === "ready") this.voices.set(era, track);
      else this.prepare(era, track);
    }
  }
}

interface Trace {
  t: number;
  phase: RecordPhase;
  rpm: number;
  swing: number;
  lift: number;
  pose: string | null;
  vinyl: [number, number, number];
  voice: string | null;
  selected: string;
  demand: boolean;
}

function createDeck(options: { era?: EraId; mode?: InteractionMode; playlist?: readonly string[] } = {}) {
  const audio = new FakeAudio();
  audio.active = options.era ?? "roots";
  const playlist = options.playlist?.map((id) => ({ id }));
  if (options.playlist) audio.selection = new PlaylistSelection(audio.active, options.playlist);
  const platters = new PlatterMotionSystem(ERAS.length);
  const tonearms = new TonearmMotionSystem(ERAS.length);
  for (let i = 0; i < ERAS.length; i++) tonearms.register(i, POSES);
  const focus = { mode: options.mode ?? ("FOCUS" as InteractionMode), exits: 0 };
  const activeIndex = () => getEra(audio.active).index;
  const artwork = { ready: true, prepared: [] as string[] };
  const controller = new RecordChangeController({
    audio: {
      unlocked: () => audio.unlocked,
      playbackWanted: () => audio.unlocked && audio.wanted,
      selected: (era) => audio.selection.get(era),
      select: (era, track) => audio.select(era, track),
      voiceTrack: (era) => audio.voices.get(era) ?? null,
      hold: (era) => audio.hold(era),
      release: (era) => audio.release(era),
      prepare: (era, track) => audio.prepare(era, track),
      loadState: (era, track) => audio.loadState(era, track),
    },
    artwork: { prepare: (_era, track) => void artwork.prepared.push(track), ready: () => artwork.ready },
    platterRpm: (i) => platters.states[i].currentRpm,
    tonearm: (i) => tonearms.states[i],
    tonearmAnimated: (i) => i === activeIndex(),
    focus: {
      mode: () => focus.mode,
      station: () => activeIndex(),
      exit: () => {
        focus.exits++;
        focus.mode = "FOCUS_TRANSITION_OUT";
      },
    },
    activeIndex,
    playlist: playlist ? (era) => (era === audio.active ? playlist : getEra(era).tracks) : undefined,
  });
  const trace: Trace[] = [];
  const problems: string[] = [];
  let time = 0;
  /** One frame in the scene's order: controller → platter → tonearm (ACTIVE only), then the audio clock. */
  const frame = (dt = STEP) => {
    controller.update(dt);
    platters.update(dt, (i) => controller.platterDemand(i, audio.isPlaying(ERAS[i].id)));
    tonearms.update(dt, activeIndex());
    audio.tick(Math.min(dt, 0.1));
    time += Math.min(dt, 0.1);
    const i = getEra(audio.active).index;
    const arm = tonearms.states[i];
    if (!arm) throw new Error("no arm");
    trace.push({
      t: time,
      phase: controller.phase,
      rpm: platters.states[i].currentRpm,
      swing: arm.currentSwing,
      lift: arm.currentLift,
      pose: arm.currentPose,
      vinyl: [...controller.vinyl],
      voice: audio.voices.get(audio.active) ?? null,
      selected: audio.selection.get(audio.active),
      demand: controller.platterDemand(i, audio.isPlaying(audio.active)),
    });
    for (const problem of controller.checkInvariants()) problems.push(`${time.toFixed(3)} ${controller.phase}: ${problem}`);
  };
  const run = (seconds: number, dt = STEP) => {
    for (let k = 0; k < Math.round(seconds / dt); k++) frame(dt);
  };
  /** Runs until the change is over (or a limit), returns the seconds it took. */
  const settle = (limit = 30) => {
    const start = time;
    while (controller.changing && time - start < limit) frame();
    run(0.3);
    return time - start;
  };
  return { audio, platters, tonearms, focus, controller, artwork, trace, problems, frame, run, settle, arm: () => tonearms.states[activeIndex()]!, rpm: () => platters.states[activeIndex()].currentRpm };
}

/** A deck that has reached the canonical PLAYING state (arm PLAY, 33⅓ RPM, voice = selection). */
function playingDeck(era: EraId = "roots", playlist?: readonly string[]) {
  const deck = createDeck({ era, playlist });
  deck.run(3);
  assert.equal(deck.controller.phase, "PLAYING");
  deck.trace.length = 0;
  return deck;
}

const phasesVisited = (trace: Trace[]) => trace.map((f) => f.phase).filter((phase, i, all) => i === 0 || all[i - 1] !== phase);

describe("record change — the canonical sequence", () => {
  it("reaches PLAYING from SOUND ON: arm PLAY, 33⅓ RPM, the selected record audible", () => {
    const deck = playingDeck();
    assert.equal(deck.arm().currentPose, "PLAY");
    assert.ok(deck.rpm() > RPM * 0.99);
    assert.equal(deck.audio.voices.get("roots"), getEra("roots").heroTrackId);
    assert.deepEqual(deck.problems, []);
  });

  it("NEXT runs every phase in order and ends in PLAYING with all identities agreeing", () => {
    const deck = playingDeck();
    const [hero, b] = tracksOf("roots");
    assert.equal(deck.controller.requestStep("next"), "started");
    const seconds = deck.settle();
    assert.deepEqual(phasesVisited(deck.trace), [...CHANGE_PHASES, "PLAYING"]);
    assert.equal(deck.audio.selection.get("roots"), b);
    assert.equal(deck.audio.voices.get("roots"), b);
    assert.equal(deck.arm().currentPose, "PLAY");
    assert.ok(deck.rpm() > RPM * 0.95);
    assert.deepEqual(deck.controller.vinyl, [0, 0, 0]);
    assert.equal(deck.controller.lastOutcome, "played");
    assert.deepEqual(deck.problems, []);
    assert.notEqual(hero, b);
    assert.ok(seconds > 4.5 && seconds < 7.5, `${seconds.toFixed(2)} s`);
  });

  it("PREVIOUS and NEXT wrap inside the era and never reach another era", () => {
    const deck = playingDeck("afrobeats");
    const ids = tracksOf("afrobeats");
    const [hero, b] = ids;
    deck.controller.requestStep("previous");
    deck.settle();
    assert.equal(deck.audio.selection.get("afrobeats"), ids[ids.length - 1], "PREVIOUS from the first record → the last");
    deck.controller.requestStep("next");
    deck.settle();
    assert.equal(deck.audio.selection.get("afrobeats"), hero, "NEXT from the last record → the first");
    deck.controller.requestStep("next");
    deck.settle();
    assert.equal(deck.audio.selection.get("afrobeats"), b);
    for (const era of ERAS) if (era.id !== "afrobeats") assert.equal(deck.audio.selection.get(era.id), era.heroTrackId);
    for (const frame of deck.trace) assert.ok(tracksOf("afrobeats").includes(frame.selected));
    assert.deepEqual(deck.problems, []);
  });
});

describe("record change — playlists of any size", () => {
  for (const size of [1, 3, 5, 10, 20]) {
    it(size === 1 ? "1 record: NEXT / PREVIOUS are rejected, the deck keeps playing" : `${size} records: NEXT walks the whole playlist and wraps, PREVIOUS wraps back, every change completes`, () => {
      const ids = Array.from({ length: size }, (_, i) => `scale-test-${i + 1}`);
      const deck = createDeck({ era: "highlife", playlist: ids });
      deck.run(3);
      assert.equal(deck.controller.phase, "PLAYING");
      assert.equal(deck.audio.voices.get("highlife"), ids[0]);
      if (size === 1) {
        assert.equal(deck.controller.requestStep("next"), "rejected", "nothing to change to");
        assert.equal(deck.controller.requestStep("previous"), "rejected");
        assert.equal(deck.controller.phase, "PLAYING");
        return;
      }
      const visited: string[] = [];
      for (let k = 0; k < size; k++) {
        assert.equal(deck.controller.requestStep("next"), "started");
        deck.settle();
        assert.equal(deck.controller.phase, "PLAYING");
        visited.push(deck.audio.selection.get("highlife"));
        assert.equal(deck.audio.voices.get("highlife"), visited[k], "the audible record is the mounted one");
      }
      assert.deepEqual(visited, [...ids.slice(1), ids[0]], "every record once, then back to the first");
      deck.controller.requestStep("previous");
      deck.settle();
      assert.equal(deck.audio.selection.get("highlife"), ids[size - 1], "PREVIOUS from the first → the last");
      for (const era of ERAS) if (era.id !== "highlife") assert.equal(deck.audio.selection.get(era.id), era.heroTrackId);
      assert.deepEqual(deck.problems, []);
    });
  }
});

describe("record change — production archive (5 entries per era)", () => {
  /** Runs one change and checks the canonical end state: mounted = selected = audible, record seated. */
  const change = (deck: ReturnType<typeof playingDeck>, eraId: EraId, direction: "next" | "previous") => {
    assert.equal(deck.controller.requestStep(direction), "started");
    deck.settle();
    assert.equal(deck.controller.phase, "PLAYING");
    const selected = deck.audio.selection.get(eraId);
    assert.equal(deck.audio.voices.get(eraId), selected, "the audible record is the mounted one");
    assert.deepEqual(deck.controller.vinyl, [0, 0, 0], "no centring drift");
    assert.equal(deck.controller.sleeve, 0);
    return selected;
  };

  it("ROOTS: NEXT through all five tradition references and back to the Dùndún", () => {
    const deck = playingDeck("roots");
    const ids = tracksOf("roots");
    const visited = [0, 1, 2, 3, 4].map(() => change(deck, "roots", "next"));
    assert.deepEqual(visited, [...ids.slice(1), ids[0]]);
    assert.deepEqual(deck.artwork.prepared, visited, "each destination's artwork prepared at request time");
    assert.deepEqual(deck.problems, []);
  });

  it("RECORDING: NEXT then PREVIOUS returns to Aronke Macaulay; PREVIOUS from it reaches entry 5", () => {
    const deck = playingDeck("recording");
    const ids = tracksOf("recording");
    assert.equal(change(deck, "recording", "next"), ids[1]);
    assert.equal(change(deck, "recording", "previous"), ids[0]);
    assert.equal(change(deck, "recording", "previous"), ids[4]);
    assert.deepEqual(deck.problems, []);
  });

  it("EXPLOSION: several changes in a row, including a queued burst, land on the expected entries", () => {
    const deck = playingDeck("explosion");
    const ids = tracksOf("explosion");
    assert.equal(change(deck, "explosion", "next"), ids[1]);
    assert.equal(change(deck, "explosion", "next"), ids[2]);
    assert.equal(change(deck, "explosion", "previous"), ids[1]);
    deck.controller.requestStep("next");
    assert.equal(deck.controller.requestStep("next"), "queued");
    assert.equal(deck.controller.requestStep("next"), "queued", "the slot keeps the latest");
    deck.settle();
    assert.equal(deck.audio.selection.get("explosion"), ids[3], "one change + one queued");
    assert.deepEqual(deck.problems, []);
  });

  it("GLOBAL: the changed selection persists across GLOBAL → ROOTS and back, and plays as ROOTS' neighbour", () => {
    const deck = playingDeck("global");
    const freeMind = change(deck, "global", "next");
    assert.equal(freeMind, tracksOf("global")[1]);
    deck.audio.active = "roots"; // leave: across the seam
    deck.audio.reconcile();
    deck.run(0.5);
    assert.equal(deck.audio.voices.get("global"), freeMind, "GLOBAL is ROOTS' previous neighbour — it plays the selected record");
    assert.equal(deck.audio.voices.get("roots"), tracksOf("roots")[0]);
    for (const era of ["recording", "roots", "global"] as EraId[]) {
      deck.audio.active = era;
      deck.audio.reconcile();
      deck.run(0.5);
    }
    assert.equal(deck.audio.selection.get("global"), freeMind, "persisted");
    assert.equal(deck.audio.voices.get("global"), freeMind);
    assert.equal(deck.controller.phase, "PLAYING");
    for (const era of ERAS) if (era.id !== "global") assert.equal(deck.audio.selection.get(era.id), era.heroTrackId);
    assert.deepEqual(deck.problems, []);
  });
});

describe("record change — physical ordering", () => {
  const deck = playingDeck();
  deck.controller.requestStep("next");
  deck.settle();
  const trace = deck.trace;
  const raised = POSES.LIFTED_PLAY.lift;
  const firstIndex = (test: (f: Trace) => boolean) => trace.findIndex(test);
  const c = RECORD_CHANGE_CONFIG;

  it("ducks the audio before the stylus leaves the groove, and lifts the arm before it swings", () => {
    const silent = firstIndex((f) => f.voice === null);
    const armMoves = firstIndex((f) => f.lift !== POSES.PLAY.lift);
    const swings = firstIndex((f) => f.swing !== POSES.PLAY.swing);
    assert.ok(silent >= 0 && silent <= armMoves, `silent ${silent}, arm ${armMoves}`);
    assert.ok(trace[armMoves].t - trace[0].t >= c.armLiftAfter - 1e-9, "the arm waits for most of the duck");
    // When the duck completes, the stylus has barely begun to rise (≤ 20 % of its lift travel ≈ 2.3 mm).
    const duckDone = firstIndex((f) => f.t - trace[0].t >= c.duckSeconds - 1e-9);
    const risen = (trace[duckDone].lift - POSES.PLAY.lift) / (raised - POSES.PLAY.lift);
    assert.ok(risen <= 0.2, `stylus ${(risen * 100).toFixed(0)} % up when the duck completes`);
    assert.ok(Math.abs(trace[swings].lift - raised) < 1e-9, "swing begins only at the raised lift");
  });

  it("lets the platter coast down only with the stylus fully raised, and lifts the record only when the platter is safe", () => {
    const demandOff = firstIndex((f) => !f.demand);
    assert.ok(Math.abs(trace[demandOff].lift - raised) < 1e-9, `stylus not raised when the platter demand dropped (${trace[demandOff].pose})`);
    for (const f of trace.slice(0, demandOff)) assert.ok(f.rpm > RPM * 0.999, `${f.rpm} RPM while the stylus may be down`);
    for (const f of trace) if (f.vinyl[1] > 0) assert.ok(f.rpm <= c.removalRpm, `record lifted at ${f.rpm} RPM`);
    for (const f of trace) if (f.vinyl[1] > 0 || f.vinyl[0] !== 0) assert.equal(f.pose, "LIFTED_REST", "record moves only while the arm is parked raised");
  });

  it("moves laterally only once clear of the spindle, and lowers only when centred over it", () => {
    for (const f of trace) {
      if (f.vinyl[0] !== 0) assert.ok(f.vinyl[1] >= c.liftHeight - c.storageDip - 1e-9, `lateral at ${f.vinyl[1]} m`);
      if (f.phase === "LOWER_RECORD") assert.deepEqual([f.vinyl[0], f.vinyl[2]], [0, 0]);
    }
    const out = Math.min(...trace.map((f) => f.vinyl[0]));
    assert.ok(Math.abs(out - c.staging[0]) < 1e-9, `staging reached (${out})`);
  });

  it("spins up only with the record mounted, lowers the needle only at playback speed, starts audio at contact", () => {
    for (const f of trace) if (f.demand && (f.phase === "SPIN_UP" || f.phase === "MOVE_ARM_TO_PLAY")) assert.deepEqual(f.vinyl, [0, 0, 0]);
    for (const f of trace) if (f.phase === "LOWER_NEEDLE") assert.ok(f.rpm >= RPM * c.playbackReadyFraction);
    const audible = firstIndex((f) => f.voice === tracksOf("roots")[1]);
    const fraction = (trace[audible].lift - raised) / (POSES.PLAY.lift - raised);
    assert.ok(fraction >= c.contactFraction - 1e-9, `destination audible at ${(fraction * 100).toFixed(1)} % of the needle travel`);
    const atPlay = firstIndex((f) => f.phase === "FADE_IN_AUDIO");
    const lead = trace[atPlay].t - trace[audible].t;
    assert.ok(lead >= 0 && lead < 0.1, `voice starts ${(lead * 1000).toFixed(0)} ms before the arm settles`);
  });

  it("overlaps spin-up with the raised arm's swing, but the needle waits for playback speed", () => {
    const spinUp = trace.filter((f) => f.phase === "SPIN_UP");
    assert.ok(spinUp.some((f) => f.swing !== POSES.REST.swing && Math.abs(f.lift - raised) < 1e-9), "the raised arm swings during spin-up");
    for (const f of spinUp) assert.ok(Math.abs(f.lift - raised) < 1e-9 || f.lift === POSES.REST.lift, "never lowered during spin-up");
    const lowering = trace.filter((f) => f.lift > raised + 1e-9 && f.swing === POSES.PLAY.swing && f.phase !== "PLAYING");
    for (const f of lowering) assert.ok(f.rpm >= RPM * c.playbackReadyFraction, `needle lowering at ${f.rpm.toFixed(2)} RPM`);
  });

  it("commits the identity only with the old record off the deck, at the staging point", () => {
    const committed = firstIndex((f) => f.selected === tracksOf("roots")[1]);
    assert.equal(trace[committed].phase, "PREPARE_NEXT");
    assert.ok(Math.abs(trace[committed].vinyl[0] - c.staging[0]) < 1e-9);
    for (const f of trace.slice(0, committed)) assert.equal(f.selected, tracksOf("roots")[0]);
  });

  it("keeps every invariant on every frame", () => {
    assert.deepEqual(deck.problems, []);
  });
});

describe("record change — input policy", () => {
  it("rapid NEXT spam: one change at a time, at most one queued, ends exactly two records on", () => {
    const deck = playingDeck();
    const results = Array.from({ length: 10 }, () => deck.controller.requestStep("next"));
    assert.deepEqual(results, ["started", ...Array(9).fill("queued")]);
    const firstRequest = deck.controller.request;
    deck.settle();
    assert.equal(deck.controller.completed, 2);
    assert.equal(deck.audio.selection.get("roots"), tracksOf("roots")[2]);
    assert.notEqual(deck.controller.request, firstRequest);
    assert.deepEqual(deck.problems, []);
  });

  it("NEXT then PREVIOUS mid-transition: the queued PREVIOUS runs after, returning to the first record", () => {
    const deck = playingDeck();
    deck.controller.requestStep("next");
    deck.run(2);
    assert.equal(deck.controller.requestStep("previous"), "queued");
    deck.settle();
    assert.equal(deck.audio.selection.get("roots"), tracksOf("roots")[0]);
    assert.equal(deck.controller.completed, 2);
  });

  it("accepts input only in FOCUS on the ACTIVE station", () => {
    for (const mode of ["TRAVEL", "FOCUS_TRANSITION_IN", "FOCUS_TRANSITION_OUT"] as InteractionMode[]) {
      const deck = createDeck({ mode });
      deck.run(3);
      assert.equal(deck.controller.requestStep("next"), "rejected", mode);
      assert.equal(deck.controller.changing, false);
    }
  });

  it("locks focus exit during a change, remembers it, and exits once stable (queued NEXT dropped)", () => {
    const deck = playingDeck();
    assert.equal(deck.controller.allowFocusExit(), true, "stable: exit allowed");
    deck.controller.requestStep("next");
    deck.run(1);
    deck.controller.requestStep("next");
    assert.equal(deck.controller.allowFocusExit(), false);
    assert.equal(deck.controller.exitPending, true);
    assert.equal(deck.controller.queued, null, "an exit drops the queued change");
    assert.equal(deck.controller.requestStep("next"), "rejected", "no new input once leaving");
    deck.run(4);
    assert.equal(deck.focus.exits, 0, "never mid-change");
    deck.settle();
    assert.equal(deck.focus.exits, 1);
    assert.equal(deck.controller.completed, 1);
    assert.equal(deck.controller.phase, "PLAYING");
  });
});

describe("record change — failures and states", () => {
  it("a destination that fails to load before removal restores the original record (never lifted)", () => {
    const deck = playingDeck("roots", fixturesOf("roots"));
    deck.audio.failing.add(fixturesOf("roots")[1]);
    deck.controller.requestStep("next");
    deck.settle();
    assert.equal(deck.controller.lastOutcome, "restored-after-load-failure");
    for (const f of deck.trace) assert.deepEqual(f.vinyl, [0, 0, 0]);
    assert.equal(deck.audio.selection.get("roots"), fixturesOf("roots")[0]);
    assert.equal(deck.audio.voices.get("roots"), fixturesOf("roots")[0]);
    assert.equal(deck.controller.phase, "PLAYING");
    assert.deepEqual(deck.problems, []);
  });

  it("an audio failure after the visual commit ends in a valid UNAVAILABLE state (new record mounted, arm REST, platter stopped)", () => {
    const deck = playingDeck("roots", fixturesOf("roots"));
    const b = fixturesOf("roots")[1];
    deck.controller.requestStep("next");
    while (!deck.controller.committed) deck.frame();
    deck.audio.loads.set(`roots|${b}`, { state: "error", readyAt: 0 }); // e.g. evicted, then failed to reload
    deck.settle();
    deck.run(3);
    assert.equal(deck.controller.lastOutcome, "unavailable");
    assert.equal(deck.controller.phase, "UNAVAILABLE");
    assert.equal(deck.audio.selection.get("roots"), b, "the new record stays mounted");
    assert.equal(deck.audio.voices.get("roots"), undefined, "never the old audio under the new record");
    assert.equal(deck.arm().currentPose, "REST");
    assert.equal(deck.rpm(), 0);
    assert.deepEqual(deck.problems, []);
  });

  it("a record without audio is mounted and shown unavailable; NEXT still works from there", () => {
    const deck = playingDeck("roots", fixturesOf("roots"));
    deck.audio.unavailable.add(fixturesOf("roots")[1]);
    deck.controller.requestStep("next");
    deck.settle();
    deck.run(3);
    assert.equal(deck.controller.phase, "UNAVAILABLE");
    assert.equal(deck.arm().currentPose, "REST");
    assert.equal(deck.rpm(), 0);
    deck.controller.requestStep("next");
    deck.settle();
    assert.equal(deck.controller.phase, "PLAYING");
    assert.equal(deck.audio.voices.get("roots"), fixturesOf("roots")[2]);
    assert.deepEqual(deck.problems, []);
  });

  it("before SOUND (audio locked) the record still changes physically and the deck stays stopped", () => {
    const deck = createDeck();
    deck.audio.unlocked = false;
    deck.audio.reconcile();
    deck.run(1);
    assert.equal(deck.controller.phase, "STOPPED");
    deck.controller.requestStep("next");
    deck.settle();
    assert.equal(deck.audio.selection.get("roots"), tracksOf("roots")[1]);
    assert.equal(deck.controller.phase, "STOPPED");
    assert.equal(deck.rpm(), 0);
    assert.equal(deck.arm().currentPose, "REST");
    assert.ok(deck.trace.some((f) => f.vinyl[0] < 0), "the record still physically left and returned");
  });
});

describe("record change — time, drift and persistence", () => {
  it("survives huge frames (clamped): no skipped safety, no teleport", () => {
    const deck = playingDeck();
    deck.controller.requestStep("next");
    let previous = [...deck.controller.vinyl];
    let maxJump = 0;
    for (let k = 0; k < 200 && deck.controller.changing; k++) {
      deck.frame(k % 7 === 0 ? 5 : 0.04); // stalls of 5 s are integrated as 0.1 s
      maxJump = Math.max(maxJump, Math.hypot(...deck.controller.vinyl.map((v, i) => v - previous[i])));
      previous = [...deck.controller.vinyl];
    }
    deck.run(1);
    assert.equal(deck.controller.phase, "PLAYING");
    assert.ok(maxJump < 0.12, `record moved ${(maxJump * 1000).toFixed(1)} mm in one frame`);
    assert.deepEqual(deck.problems, []);
  });

  it("20 consecutive swaps: the record always returns to exactly the canonical mounted offset", () => {
    const deck = playingDeck();
    for (let k = 0; k < 20; k++) {
      deck.controller.requestStep(k % 3 === 2 ? "previous" : "next");
      deck.settle();
      assert.deepEqual(deck.controller.vinyl, [0, 0, 0]);
      assert.equal(deck.controller.sleeve, 0);
      assert.equal(deck.controller.phase, "PLAYING");
    }
    assert.equal(deck.controller.completed, 20);
    assert.deepEqual(deck.problems, []);
  });

  it("the selection persists per era while the visitor travels away and back", () => {
    const deck = playingDeck("explosion");
    deck.controller.requestStep("next");
    deck.settle();
    const b = tracksOf("explosion")[1];
    for (const era of ["transition", "naija", "global", "roots", "highlife", "explosion"] as EraId[]) {
      deck.audio.active = era;
      deck.audio.reconcile();
      deck.run(0.5);
    }
    assert.equal(deck.audio.selection.get("explosion"), b);
    assert.equal(deck.audio.voices.get("explosion"), b);
  });

  it("a manual (dev) tonearm command persists until the era's playback state changes", () => {
    const deck = playingDeck();
    deck.arm().request("REST");
    deck.run(3);
    assert.equal(deck.arm().currentPose, "REST", "not overridden every frame");
    deck.audio.wanted = false; // playback stops → semantic REST (already there)
    deck.audio.reconcile();
    deck.run(1);
    deck.audio.wanted = true; // playback resumes → the sync asserts PLAY again
    deck.audio.reconcile();
    deck.run(3);
    assert.equal(deck.arm().currentPose, "PLAY");
    assert.equal(deck.controller.phase, "PLAYING");
  });

  it("a neighbour's arm follows its playback state directly; the ACTIVE arm animates", () => {
    const deck = playingDeck("global");
    const roots = deck.tonearms.states[getEra("roots").index]!;
    const highlife = deck.tonearms.states[getEra("highlife").index]!;
    assert.equal(roots.currentPose, "PLAY", "ROOTS is GLOBAL's playing neighbour");
    assert.equal(highlife.currentPose, "REST", "distant: no voice");
    deck.audio.active = "roots";
    deck.audio.reconcile();
    deck.frame();
    assert.equal(roots.currentPose, "PLAY", "becoming ACTIVE keeps PLAY — no re-cueing");
    assert.equal(deck.controller.phase, "PLAYING");
  });
});

// ---------------------------------------------------------------------------
// The album stack on the listening desk follows the SAME record change (docs/LISTENING_STATION_TABLE.md)
// ---------------------------------------------------------------------------

/** A playing deck plus the album stacks, advanced exactly as RecordChangeDriver does each frame. */
function stackedDeck(era: EraId = "roots", playlist?: readonly string[]) {
  const deck = playingDeck(era, playlist);
  const stacks = new AlbumStackSystem(ERAS.length);
  const playlistOf = (eraId: EraId) => (playlist && eraId === era ? [...playlist] : tracksOf(eraId));
  const tops: string[] = [];
  let maxProgress = 0;
  const sync = (dt: number) => {
    for (const e of ERAS) {
      const request = deck.controller.request;
      const change = request && request.eraId === e.id ? request : null;
      stacks.update(e.index, dt, playlistOf(e.id), deck.audio.selection.get(e.id), change, deck.controller.phase, deck.controller.restoring);
    }
    const i = getEra(era).index;
    tops.push(stacks.topTrack(i)!);
    maxProgress = Math.max(maxProgress, stacks.progress(i) ?? 0);
  };
  const frame = (dt = STEP) => {
    deck.frame(dt);
    sync(dt);
  };
  sync(STEP);
  const settle = () => {
    for (let k = 0; k < 2000 && deck.controller.changing; k++) frame();
    for (let k = 0; k < 20; k++) frame();
  };
  /** The stable invariant: mounted = selected = top sleeve, and every sleeve exactly at its resting pose. */
  const assertStable = (eraId: EraId, ids = playlistOf(eraId)) => {
    const i = getEra(eraId).index;
    const mounted = deck.audio.selection.get(eraId);
    assert.equal(stacks.topTrack(i), mounted, `${eraId}: top sleeve = mounted record`);
    const order = stackOrder(ids, mounted);
    assert.deepEqual(stacks.eras[i].order, order);
    stacks.eras[i].poses.forEach((p, k) => {
      const rest = restPose(order.indexOf(ids[k]), ids.length);
      assert.deepEqual([p.x, p.y, p.z, p.yaw], [rest.x, rest.y, rest.z, rest.yaw], `${eraId} ${ids[k]}: exact resting pose (no drift)`);
    });
    const heights = stacks.eras[i].poses.map((p) => p.y);
    assert.equal(heights.filter((h) => h === Math.max(...heights)).length, 1, "exactly one sleeve on top");
  };
  return { deck, stacks, frame, settle, assertStable, tops, maxProgress: () => maxProgress };
}

describe("album stack — follows the physical record change", () => {
  it("NEXT: the old top lifts while the arm lifts, the destination is the top by the commit, all agree when stable", () => {
    const s = stackedDeck("roots");
    const [hero, b] = tracksOf("roots");
    s.deck.controller.requestStep("next");
    let topAtCommit = "";
    for (let k = 0; k < 2000 && s.deck.controller.changing; k++) {
      const wasCommitted = s.deck.controller.committed;
      s.frame();
      if (!wasCommitted && s.deck.controller.committed) topAtCommit = s.stacks.topTrack(0)!;
      if (s.deck.controller.phase === "LIFT_ARM") assert.ok((s.stacks.progress(0) ?? 0) <= 0.25, "only the lift while the arm lifts");
    }
    assert.equal(topAtCommit, b, "destination sleeve on top at the physical commit");
    s.settle();
    s.assertStable("roots");
    assert.equal(s.deck.audio.voices.get("roots"), b, "and it is what plays");
    assert.ok(s.tops.includes(hero) && s.tops.at(-1) === b);
  });

  it("PREVIOUS: the bottom sleeve comes to the top; stack, deck and audio agree", () => {
    const s = stackedDeck("explosion");
    const ids = tracksOf("explosion");
    s.deck.controller.requestStep("previous");
    s.settle();
    assert.equal(s.deck.audio.selection.get("explosion"), ids[4]);
    s.assertStable("explosion");
    assert.deepEqual(s.stacks.eras[getEra("explosion").index].order, [ids[4], ids[0], ids[1], ids[2], ids[3]]);
  });

  it("rapid NEXT ×10 obeys the same queue result: two swaps, one top, correct order", () => {
    const s = stackedDeck("global");
    for (let k = 0; k < 10; k++) s.deck.controller.requestStep("next");
    s.settle();
    assert.equal(s.deck.controller.completed, 2);
    assert.equal(s.deck.audio.selection.get("global"), tracksOf("global")[2]);
    s.assertStable("global");
  });

  it("a destination failing before the commit restores the original top sleeve", () => {
    const ids = fixturesOf("roots");
    const s = stackedDeck("roots", ids);
    s.deck.audio.failing.add(ids[1]);
    s.deck.controller.requestStep("next");
    s.settle();
    assert.equal(s.deck.controller.lastOutcome, "restored-after-load-failure");
    assert.ok(s.maxProgress() > 0, "the browse had started (the top sleeve lifted)");
    s.assertStable("roots", ids);
    assert.equal(s.stacks.topTrack(0), ids[0]);
  });

  it("a destination committed but UNAVAILABLE stays on top (it is the mounted record)", () => {
    const ids = fixturesOf("roots");
    const s = stackedDeck("roots", ids);
    s.deck.controller.requestStep("next");
    while (!s.deck.controller.committed) s.frame();
    s.deck.audio.loads.set(`roots|${ids[1]}`, { state: "error", readyAt: 0 });
    s.settle();
    assert.equal(s.deck.controller.lastOutcome, "unavailable");
    s.assertStable("roots", ids);
    assert.equal(s.stacks.topTrack(0), ids[1]);
  });

  it("the selection persists while travelling away and back — mounted, selected and top of the stack", () => {
    const s = stackedDeck("afrobeats");
    for (let k = 0; k < 3; k++) {
      s.deck.controller.requestStep("next");
      s.settle();
    }
    const fourth = tracksOf("afrobeats")[3];
    for (const era of ["global", "roots", "highlife", "afrobeats"] as EraId[]) {
      s.deck.audio.active = era;
      s.deck.audio.reconcile();
      for (let k = 0; k < 30; k++) s.frame();
    }
    assert.equal(s.deck.audio.selection.get("afrobeats"), fourth);
    s.assertStable("afrobeats");
  });

  it("works for all eight eras, and no record identity crosses eras", () => {
    for (const era of ERAS) {
      const s = stackedDeck(era.id);
      s.deck.controller.requestStep("next");
      s.settle();
      s.assertStable(era.id);
      for (const other of ERAS) {
        const order = s.stacks.eras[other.index].order;
        assert.ok(order.every((id) => tracksOf(other.id).includes(id)), `${other.id}: only its own records`);
      }
    }
  });

  it("20 consecutive changes leave zero transform drift", () => {
    const s = stackedDeck("transition");
    for (let k = 0; k < 20; k++) {
      s.deck.controller.requestStep(k % 3 === 2 ? "previous" : "next");
      s.settle();
      s.assertStable("transition");
    }
    assert.equal(s.deck.controller.completed, 20);
    assert.deepEqual(s.deck.problems, []);
  });
});
