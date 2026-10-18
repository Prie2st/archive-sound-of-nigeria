/**
 * The application audio engine (docs/AUDIO_ENGINE.md, docs/SPATIAL_AUDIO.md).
 *
 * ONE instance for the whole experience (browserAudio.ts) owns ONE AudioContext, created
 * lazily inside the first user gesture (`unlock`). Graph:
 *
 *   source ─▶ voiceGain ─┬─▶ panner ─▶ musicSpatial ─┐
 *   (one voice per       └──────────▶ musicDry ─────┼─▶ musicGain ──┐
 *    relevant era: previous / active / next)          │              │
 *   (ambient sources, later) ───────────────────────────▶ ambientGain ┼─▶ masterGain ─▶ destination
 *   (UI sounds, later) ─────────────────────────────────▶ uiGain ─────┘
 *
 * Semantic model: the visitor's ACTIVE ERA (the existing active-era store, written by the
 * CameraRig) + each era's SELECTED TRACK (TrackSelection) + the playback intent (`play` / `stop`)
 * decide which voices exist: the selected records of the previous, active and next eras (wrap-aware).
 * `reconcile()` makes the voice set match (fade out what no longer belongs, start or load what is
 * missing) — it runs only on semantic changes. Every frame, `updateFrame()` (fed by the scene's
 * listener bridge) moves the listener and sets each voice's gain from the semantic mix
 * (spatialMix.ts): the active station dominates, neighbours bleed faintly, the incoming era rises
 * before the active-era switch, focus pulls the neighbours out. Distant eras have no voice at all.
 *
 * Two kinds of source feed the same voice chain (docs/PRODUCTION_AUDIO.md):
 *   - licensed recordings / previews are STREAMED: a media element of the bounded pool (streamPool.ts)
 *     → its MediaElementAudioSourceNode → voiceGain. Never fetched whole, never decoded into a buffer.
 *   - development tones are short decoded buffers: a NEW AudioBufferSourceNode per playback instance.
 * Either way each voice has one AudioBufferSourceNode that keeps its time on the audio clock (the tone
 * itself, or a silent one-frame loop for a stream); its scheduled stop ends the voice and everything is
 * disconnected (a stream's element is paused and detached). A voice that changes role (next → active →
 * previous) is the SAME instance — never restarted at an era boundary. Gain changes are AudioParam
 * automation on the audio clock — no JS volume timers.
 *
 * Plain TypeScript against the structural Web Audio types in webAudio.ts, so Node tests can drive
 * it with a mock context.
 */
import { getEra, getEraByIndex } from "../data/eras.ts";
import type { EraId } from "../data/types.ts";
import { getAudioEntry, type AudioAssetKind, type AudioTrackEntry } from "./audioCatalog.ts";
import { AudioBufferCache, AudioLoadError, type AudioLoadErrorKind, type BufferCacheStats, type BufferLoadState } from "./bufferCache.ts";
import { StreamPool, type MediaSlot, type StreamDemand, type StreamPoolStats, type StreamPreload } from "./streamPool.ts";
import {
  adjacentEras,
  computeMixGains,
  roleOf,
  SPATIAL_MIX_CONFIG,
  stationCoordinate,
  stationOffset,
  wrapIndex,
  type MixInput,
  type SpatialMixConfig,
  type VoiceRole,
} from "./spatialMix.ts";
import { TrackSelection } from "./trackSelection.ts";
import type {
  AudioBufferLike,
  AudioContextLike,
  AudioContextState,
  AudioParamLike,
  BufferSourceLike,
  DistanceModel,
  GainNodeLike,
  MediaElementLike,
  PannerNodeLike,
  PanningModel,
} from "./webAudio.ts";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface SpatialAudioConfig {
  /** Panner path level (direction + distance character). */
  wet: number;
  /** Unpanned path level: keeps every station partly centred, so nothing is ever hard-panned. */
  dry: number;
  panningModel: PanningModel;
  distanceModel: DistanceModel;
  /** Distance (m) below which the panner does not attenuate. */
  refDistance: number;
  /** Distance (m) where the linear model reaches 1 − rolloffFactor (and stays there). */
  maxDistance: number;
  rolloffFactor: number;
}

export interface AudioConfig {
  /** Seconds: a voice rises from silence when it starts (setTargetAtTime τ = fadeIn / 5). */
  fadeIn: number;
  /** Seconds: a voice falls to silence before its source is stopped. */
  fadeOut: number;
  /** Seconds (time constant): how closely voice gains follow the per-frame mix targets. */
  mixSmoothing: number;
  /** Seconds: master gain ramp for mute / unmute (fast, but no click). */
  muteRamp: number;
  /** Linear gain levels of the bus nodes and of a voice at full presence. */
  masterLevel: number;
  musicLevel: number;
  ambientLevel: number;
  uiLevel: number;
  trackLevel: number;
  /** Loop the record while its era is relevant (the installation keeps playing). */
  loopTracks: boolean;
  /** Suspend the AudioContext while the page is hidden; resume when it is visible again. */
  suspendWhenHidden: boolean;
  /** Fading-out voices kept at once; older ones are cut short (only reachable by rapid dev input). */
  maxFadingVoices: number;
  /** A fading voice's source is stopped this long after its ramp reaches 0 (s). */
  stopMargin: number;
  /**
   * Streamed recordings: media elements in the pool — the hard bound of the streaming working set
   * (3 neighbourhood voices + a record-change destination + the lookahead + one voice fading out).
   */
  maxMediaElements: number;
  /** Semantic mix shape (spatialMix.ts). */
  mix: SpatialMixConfig;
  spatial: SpatialAudioConfig;
}

export const AUDIO_CONFIG: AudioConfig = {
  fadeIn: 0.6,
  fadeOut: 0.45,
  mixSmoothing: 0.08,
  muteRamp: 0.08,
  masterLevel: 1,
  musicLevel: 1,
  ambientLevel: 1,
  uiLevel: 1,
  trackLevel: 1,
  loopTracks: true,
  suspendWhenHidden: true,
  maxFadingVoices: 4,
  stopMargin: 0.05,
  maxMediaElements: 6,
  mix: SPATIAL_MIX_CONFIG,
  spatial: {
    wet: 0.8,
    dry: 0.2,
    panningModel: "equalpower",
    distanceModel: "linear",
    refDistance: 2,
    maxDistance: 30,
    rolloffFactor: 0.6,
  },
};

// ---------------------------------------------------------------------------
// Semantic state
// ---------------------------------------------------------------------------

/**
 * LOCKED     no user gesture yet: no AudioContext exists, nothing loads or plays
 * READY      unlocked, nothing requested (playback intent off)
 * LOADING    the active era's record is being prepared (stream buffering to `canplay` / tone decoding)
 * PLAYING    the active era's voice is running
 * SUSPENDED  unlocked, but the context is suspended (hidden page, browser / OS); needs resume
 * ERROR      the active era's record is unavailable, or Web Audio itself failed — navigation unaffected
 */
export type AudioStatus = "LOCKED" | "READY" | "LOADING" | "PLAYING" | "SUSPENDED" | "ERROR";

export type AudioErrorReason = "unavailable" | AudioLoadErrorKind | "context-closed";

export interface AudioErrorInfo {
  /** The failed track (null when Web Audio itself is unavailable). */
  trackId: string | null;
  reason: AudioErrorReason;
}

/** Discrete state for React (useSyncExternalStore). Changes only on semantic events — never per frame. */
export interface AudioSnapshot {
  status: AudioStatus;
  unlocked: boolean;
  contextState: AudioContextState | "none";
  muted: boolean;
  /** Playback intent (SOUND ON / dev PLAY ACTIVE); off after dev STOP. */
  wantsPlayback: boolean;
  activeEraId: EraId;
  /** The active era's selected record. */
  selectedTrackId: string;
  selectedKind: AudioAssetKind | null;
  /** = selectedTrackId once it can play (stream ready / tone decoded), else null. */
  loadedTrackId: string | null;
  /** The ACTIVE era's voice (neighbour voices are not counted). */
  playingTrackId: string | null;
  /** Why the active era's record cannot play (or why audio as a whole cannot). */
  error: AudioErrorInfo | null;
}

/** One station position in the hall (era index order): its route anchor and its sound source. */
export interface StationAudioAnchor {
  /** Loop progress of the station's route view point (hallLayout.ts). */
  progress: number;
  /** World position the station's music comes from (the platter centre). */
  source: readonly [number, number, number];
}

/**
 * What the scene's listener bridge publishes every frame (one reused object): the production
 * camera's pose and the semantic travel / focus state. Never React state.
 */
export interface AudioFrame {
  /** Camera position and unit forward / up vectors (world space). */
  position: [number, number, number];
  forward: [number, number, number];
  up: [number, number, number];
  /** TravelController.loopProgress. */
  loopProgress: number;
  /** 0 in TRAVEL, the eased focus progress otherwise. */
  focusAmount: number;
  /** Focused station index (−1 = none). */
  focusStation: number;
}

/** Development mix switches (DEV INSPECTOR → AUDIO). */
export interface AudioDebugMix {
  /** Off = PannerNodes bypassed (dry path only); semantic crossfades unchanged. */
  spatial: boolean;
  /** Only the active era audible. */
  soloActive: boolean;
  /** Neighbour bleed at stations (off = crossfades only). */
  bleed: boolean;
}

export interface AudioVoiceInfo {
  id: number;
  eraId: EraId;
  trackId: string;
  /** Role relative to the active era; "fading" once released. */
  role: VoiceRole | "fading";
  /** Semantic gain target (0–1). */
  target: number;
  /** Current voice gain (AudioParam value). */
  gain: number;
  /** Playback position (s). */
  position: number;
  /** Listener → station source (m). */
  distance: number;
  source: readonly [number, number, number];
}

/** Polled by the dev panel (never React state). */
export interface AudioDebugInfo {
  contextState: AudioContextState | "none";
  contextsCreated: number;
  sampleRate: number | null;
  currentTime: number | null;
  gains: { master: number; music: number; ambient: number; ui: number; spatial: number; dry: number } | null;
  listener: readonly [number, number, number] | null;
  /** Station coordinate (0–8) of the last frame; null before the first frame. */
  stationCoordinate: number | null;
  eras: { previous: EraId; active: EraId; next: EraId };
  /** The three relevant eras: selected record, its load state, whether a live voice plays it. */
  neighbourhood: { role: VoiceRole; eraId: EraId; trackId: string; load: BufferLoadState | "unavailable"; playing: boolean }[];
  mix: AudioDebugMix;
  panningModel: PanningModel;
  voices: AudioVoiceInfo[];
  /** AudioNodes created by the engine and not yet disconnected (bus nodes included). */
  liveNodes: number;
  /** Buffer sources created since the start (one per playback instance; a stream's is its silent clock). */
  sourcesCreated: number;
  /** Decoded development tones. Recordings never appear here: they are streamed. */
  cache: BufferCacheStats;
  loadedUrls: string[];
  /** The streamed-recording pool (null before unlock or without media element support). */
  streams: StreamPoolStats | null;
}

export interface AudioEngineOptions {
  /** Creates THE AudioContext. Called at most once, inside the first user gesture. */
  createContext: () => AudioContextLike;
  /** Fetches the bytes of a local development tone (throw AudioLoadError("network") on failure). */
  fetchAudio: (url: string) => Promise<ArrayBuffer>;
  /**
   * Creates one media element for STREAMED recordings (the browser: `new Audio()`); called only inside the
   * unlock gesture, `maxMediaElements` times. Without it, recordings are unavailable — never decoded —
   * unless `decodeRecordings` is set.
   */
  createMediaElement?: () => MediaElementLike;
  /**
   * Tests of the shared voice / mix mechanics only: decode recordings like development tones. Never set in
   * the browser — a full-length recording decoded whole can take gigabytes (docs/PRODUCTION_AUDIO.md).
   */
  decodeRecordings?: boolean;
  initialEra: EraId;
  /** The eight stations in era order (hallLayout.ts): route anchors and sound sources. */
  stations: readonly StationAudioAnchor[];
  config?: Partial<AudioConfig>;
  /** Whether a user gesture is in progress (navigator.userActivation.isActive). Default: assume yes. */
  hasUserActivation?: () => boolean;
  /** Track → audio file (default: audioCatalog.ts). */
  resolveEntry?: (eraId: EraId, trackId: string) => AudioTrackEntry;
  warn?: (message: string) => void;
}

interface AudioGraph {
  master: GainNodeLike;
  music: GainNodeLike;
  ambient: GainNodeLike;
  ui: GainNodeLike;
  /** Panned music (wet) and unpanned music (dry), both into `music`. */
  spatial: GainNodeLike;
  dry: GainNodeLike;
}

/** One playback instance of one era's record: source → gain → panner (+ dry). */
interface Voice {
  id: number;
  eraId: EraId;
  eraIndex: number;
  trackId: string;
  /** The decoded development tone; null for a streamed recording. */
  buffer: AudioBufferLike | null;
  /**
   * Single-use buffer source: the tone itself, or — for a stream — a silent one-frame loop that only keeps
   * the voice's time on the audio clock. Its (scheduled) stop ends the voice either way.
   */
  source: BufferSourceLike;
  /** A streamed recording's pool element (with its MediaElementAudioSourceNode); null for a tone. */
  media: MediaSlot<Voice> | null;
  gain: GainNodeLike;
  panner: PannerNodeLike;
  /** Context time the source started, and the buffer offset it started at (tones). */
  startTime: number;
  offset: number;
  /** Last semantic gain target sent to `gain` (NaN = none yet). */
  target: number;
  stopping: boolean;
  /** Its stop was brought forward (cutShort): not cut again while it ends. */
  cut: boolean;
  released: boolean;
}

/** Ramps from the param's current value (so an interrupted ramp never jumps). Linear: safe through 0. */
function rampTo(param: AudioParamLike, target: number, now: number, duration: number) {
  const from = param.value;
  param.cancelScheduledValues(now);
  param.setValueAtTime(from, now);
  param.linearRampToValueAtTime(target, now + Math.max(duration, 0.001));
}

/** Sets a static / per-frame AudioParam only when it actually changes. */
function setParam(param: AudioParamLike, value: number) {
  if (Math.abs(param.value - value) > 1e-4) param.value = value;
}

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error));

const sameError = (a: AudioErrorInfo | null, b: AudioErrorInfo | null) =>
  a === b || (a !== null && b !== null && a.trackId === b.trackId && a.reason === b.reason);

const sameSnapshot = (a: AudioSnapshot, b: AudioSnapshot) =>
  a.status === b.status &&
  a.unlocked === b.unlocked &&
  a.contextState === b.contextState &&
  a.muted === b.muted &&
  a.wantsPlayback === b.wantsPlayback &&
  a.activeEraId === b.activeEraId &&
  a.selectedTrackId === b.selectedTrackId &&
  a.selectedKind === b.selectedKind &&
  a.loadedTrackId === b.loadedTrackId &&
  a.playingTrackId === b.playingTrackId &&
  sameError(a.error, b.error);

/** Decoded size of a buffer: 32-bit float per sample frame per channel. */
export const decodedBytes = (buffer: AudioBufferLike) => buffer.length * buffer.numberOfChannels * 4;

/**
 * How an entry's audio plays: licensed recordings and previews STREAM (any length, never decoded whole);
 * development tones are small decoded BUFFERS. `decodeRecordings` is the engine-mechanics test switch.
 */
export const audioSourceStrategy = (kind: AudioAssetKind | null, decodeRecordings = false): "stream" | "buffer" | null =>
  kind === null ? null : kind === "development-placeholder" || decodeRecordings ? "buffer" : "stream";

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

export class AudioEngine {
  readonly config: AudioConfig;
  /** Each era's selected record (hero first; kept when the visitor leaves). */
  readonly selection = new TrackSelection();
  private readonly options: AudioEngineOptions;
  private readonly cache: AudioBufferCache<AudioBufferLike>;
  /** Streamed recordings (created with the context, inside the unlock gesture). */
  private pool: StreamPool<Voice> | null = null;
  /** Why recordings cannot stream at all (no media element support); null when they can. */
  private streamFailure: AudioLoadError | null = null;
  /** Record-change destinations being prepared (era → track), until the era is released. */
  private readonly destinations = new Map<EraId, string>();
  private reconciling = false;
  private reconcileAgain = false;
  /** The one-frame silent buffer looped by a stream voice's clock source (created once). */
  private silence: AudioBufferLike | null = null;
  private readonly stations: readonly StationAudioAnchor[];
  private readonly anchors: readonly number[];
  private context: AudioContextLike | null = null;
  private graph: AudioGraph | null = null;
  private contextsCreated = 0;
  private activeEra: EraId;
  private activeIndex: number;
  private unlocked = false;
  private wantsPlayback = false;
  private muted = false;
  private suspendedForHiddenPage = false;
  private fatal: "unsupported" | "context-closed" | null = null;
  /** The live voice of each relevant era (previous / active / next). */
  private readonly eraVoices = new Map<EraId, Voice>();
  /** Every voice not yet released: the live ones plus those fading out. */
  private readonly voices = new Set<Voice>();
  /** URLs whose load completion will re-run reconcile (one subscription per URL). */
  private readonly awaiting = new Set<string>();
  /** `${eraId}|${trackId}` of non-looping records that ended by themselves (not restarted). */
  private readonly finished = new Set<string>();
  /** Eras held by a record change (era → duck seconds): no voice until released. */
  private readonly held = new Map<EraId, number>();
  // --- per-frame mix state (reused, never reallocated) ---
  private readonly mixInput: MixInput = { loopProgress: 0, activeIndex: 0, focusAmount: 0, focusStation: -1, soloActive: false };
  private readonly mixTargets: Float64Array;
  private hasFrame = false;
  private readonly listener = new Float64Array(9);
  private lookahead = -1;
  private readonly debugMix: AudioDebugMix = { spatial: true, soloActive: false, bleed: true };
  private readonly noBleedConfig: SpatialMixConfig;
  private panningModel: PanningModel;
  private nextVoiceId = 1;
  private liveNodes = 0;
  private sourcesCreated = 0;
  private snapshot: AudioSnapshot;
  private readonly listeners = new Set<() => void>();
  private readonly warned = new Set<string>();

  constructor(options: AudioEngineOptions) {
    this.options = options;
    this.config = { ...AUDIO_CONFIG, ...options.config };
    this.stations = options.stations;
    this.anchors = options.stations.map((station) => station.progress);
    this.mixTargets = new Float64Array(options.stations.length);
    this.noBleedConfig = { ...this.config.mix, bleed: 0 };
    this.panningModel = this.config.spatial.panningModel;
    this.activeEra = options.initialEra;
    this.activeIndex = getEra(options.initialEra).index;
    this.selection.markVisited(options.initialEra);
    this.cache = new AudioBufferCache<AudioBufferLike>((url) => this.fetchAndDecode(url), decodedBytes);
    this.snapshot = this.buildSnapshot();
  }

  // --- user-facing API -------------------------------------------------------

  /**
   * Call from a user gesture (click / tap / key). The first call creates THE AudioContext and
   * the gain graph; later calls resume a suspended context. Never creates a second context.
   * Returns false when no gesture is active (nothing is created) or Web Audio is unavailable.
   */
  unlock(): boolean {
    if (this.fatal) return false;
    if (!this.context) {
      if (!(this.options.hasUserActivation?.() ?? true)) {
        this.warnOnce("gesture", "unlock ignored: audio can only be unlocked inside a user gesture (click, tap, key)");
        return false;
      }
      let context: AudioContextLike;
      try {
        context = this.options.createContext();
      } catch (error) {
        this.fatal = "unsupported";
        this.warnOnce("unsupported", `Web Audio unavailable: ${errorMessage(error)}`);
        this.emit();
        return false;
      }
      this.contextsCreated++;
      this.context = context;
      this.graph = this.buildGraph(context);
      context.onstatechange = () => this.handleContextState();
      this.primeOutput(context);
      this.pool = this.createStreamPool(context);
      if (this.hasFrame) this.applyListener(context);
    }
    this.unlocked = true;
    this.resumeContext();
    this.syncMediaPlayback(); // inside the gesture: an element the browser refused earlier may start now
    this.preloadNeighbourhood();
    this.reconcile();
    this.emit();
    return true;
  }

  /** Playback intent on: the relevant eras' selected records play (after unlock). Retries a failed active record once. */
  play() {
    this.wantsPlayback = true;
    this.finished.clear();
    const entry = this.resolve(this.activeEra, this.selection.get(this.activeEra));
    if (this.context && entry.url && this.loadState(entry) === "error") {
      if (this.streamed(entry)) this.pool?.retry(entry.url);
      else this.requestLoad(entry.url, true);
    }
    this.reconcile();
    this.emit();
  }

  /** Playback intent off: every voice fades out. Selections and buffers are kept. */
  stop() {
    this.wantsPlayback = false;
    this.reconcile();
    this.emit();
  }

  /** Master mute (a short gain ramp). Playback, the spatial mix, selections and buffers are untouched. */
  setMuted(muted: boolean) {
    if (this.muted === muted) return;
    this.muted = muted;
    if (this.context && this.graph) rampTo(this.graph.master.gain, muted ? 0 : this.config.masterLevel, this.context.currentTime, this.config.muteRamp);
    this.emit();
  }

  mute() {
    this.setMuted(true);
  }

  unmute() {
    this.setMuted(false);
  }

  toggleMute() {
    this.setMuted(!this.muted);
  }

  // --- semantic inputs -------------------------------------------------------

  /**
   * The visitor's active era (from the existing active-era store). Its previous / active / next
   * records become the voice set and are preloaded. A neighbour that becomes active keeps its voice.
   */
  setActiveEra(eraId: EraId) {
    if (eraId === this.activeEra) return;
    this.activeEra = eraId;
    this.activeIndex = getEra(eraId).index;
    this.selection.markVisited(eraId);
    this.lookahead = -1;
    this.preloadNeighbourhood();
    this.reconcile();
    this.emit();
  }

  /**
   * Selects a record of `eraId` (only that era's playlist — anything else returns false). If the
   * era currently has a voice, the new record replaces it. (Physical record changing comes later.)
   */
  selectTrack(eraId: EraId, trackId: string): boolean {
    if (!this.selection.select(eraId, trackId)) return false;
    this.reconcile();
    this.emit();
    return true;
  }

  // --- record change (docs/RECORD_CHANGE.md): prepare ≠ play --------------------------------

  /**
   * Holds an era's music: its live voice ducks to silence over `fadeSeconds` and is released, and no
   * new voice is created for that era — not even when its selection changes — until `releaseEra`.
   * Used by the record-change controller from the first duck until needle contact.
   */
  holdEra(eraId: EraId, fadeSeconds: number) {
    this.held.set(eraId, Math.max(0.01, fadeSeconds));
    this.reconcile();
    this.emit();
  }

  /** Ends a hold: the era's SELECTED record starts as a fresh voice rising from 0 (if playable and relevant). */
  releaseEra(eraId: EraId) {
    this.destinations.delete(eraId); // prepared → it is the selection now (or the change was abandoned)
    if (!this.held.delete(eraId)) return;
    this.finished.clear();
    this.reconcile();
    this.emit();
  }

  isEraHeld(eraId: EraId): boolean {
    return this.held.has(eraId);
  }

  /**
   * Prepares a record of `eraId` without selecting or playing it: a recording gets a pool element buffering
   * to `canplay` (kept until the era is released), a tone is fetched and decoded. Idempotent; no-op before unlock.
   */
  prepareTrack(eraId: EraId, trackId: string) {
    if (!this.context || this.fatal) return;
    const entry = this.resolve(eraId, trackId);
    if (!entry.url) return;
    if (this.streamed(entry)) {
      this.destinations.set(eraId, trackId);
      this.syncStreams();
    } else if (this.cache.state(entry.url) === "idle") this.requestLoad(entry.url);
  }

  /** Load state of a record's audio: "unavailable" when it has no playable file at all. */
  trackLoadState(eraId: EraId, trackId: string): BufferLoadState | "unavailable" {
    const entry = this.resolve(eraId, trackId);
    return entry.url ? this.loadState(entry) : "unavailable";
  }

  /**
   * Track of the era's live (non-fading) voice, or null — independent of the context state, so a
   * suspended tab does not read as "stopped". Semantic only; no Web Audio objects leave the engine.
   */
  eraVoiceTrack(eraId: EraId): string | null {
    return this.eraVoices.get(eraId)?.trackId ?? null;
  }

  /** Whether audio has been unlocked and playback is wanted (SOUND on, not dev STOP). */
  isPlaybackWanted(): boolean {
    return this.unlocked && this.wantsPlayback && !this.fatal;
  }

  /**
   * Loads (does not play) an era's selected TONE. Needs the context (after unlock); no-op before. Deduplicated
   * by the cache. Recordings are never preloaded this way: the stream pool prepares only the working set
   * (neighbourhood, record-change destination, lookahead) — see streamDemand().
   */
  preloadEra(eraId: EraId) {
    if (!this.context || this.fatal) return;
    const entry = this.resolve(eraId, this.selection.get(eraId));
    if (entry.url && !this.streamed(entry) && this.cache.state(entry.url) === "idle") this.requestLoad(entry.url);
  }

  /**
   * Per-frame input from the scene's listener bridge: the production camera pose and the travel /
   * focus semantics. Moves the listener, updates every voice's gain toward the semantic mix and
   * preloads the era beyond the neighbour the visitor is heading to. Allocation-free.
   */
  updateFrame(frame: AudioFrame) {
    const l = this.listener;
    l[0] = frame.position[0];
    l[1] = frame.position[1];
    l[2] = frame.position[2];
    l[3] = frame.forward[0];
    l[4] = frame.forward[1];
    l[5] = frame.forward[2];
    l[6] = frame.up[0];
    l[7] = frame.up[1];
    l[8] = frame.up[2];
    const mix = this.mixInput;
    mix.loopProgress = frame.loopProgress;
    mix.focusAmount = frame.focusAmount;
    mix.focusStation = frame.focusStation;
    this.hasFrame = true;
    const context = this.context;
    if (!context || this.fatal) return;
    this.applyListener(context);
    this.applyMix(context);
    this.preloadLookahead();
  }

  /**
   * Page visibility (document.visibilitychange). Hidden: the context is suspended. Visible again:
   * resumed — allowed without a new gesture because the page was already unlocked; if the browser
   * refuses, the state stays SUSPENDED and the next gesture (`unlock`) resumes it. Voices persist.
   */
  setPageVisible(visible: boolean) {
    const context = this.context;
    if (context && this.unlocked) {
      if (!visible) {
        if (this.config.suspendWhenHidden && context.state === "running") {
          this.suspendedForHiddenPage = true;
          context.suspend().then(
            () => this.emit(),
            (error: unknown) => this.warnOnce("suspend", `AudioContext.suspend() failed: ${errorMessage(error)}`),
          );
        }
      } else if (this.suspendedForHiddenPage || context.state !== "running") {
        this.suspendedForHiddenPage = false;
        this.resumeContext();
      }
    }
    this.emit();
  }

  /** Development: drops every decoded tone and remembered failure (voices keep playing their buffer / stream). */
  clearCache() {
    this.cache.clear();
    this.pool?.clearErrors();
    this.awaiting.clear();
    this.preloadNeighbourhood();
    this.reconcile();
    this.emit();
  }

  /** Development: spatial bypass / solo active / neighbour bleed. Applied at the next frame (bus switch immediately). */
  setDebugMix(change: Partial<AudioDebugMix>) {
    Object.assign(this.debugMix, change);
    this.mixInput.soloActive = this.debugMix.soloActive;
    if (this.context && this.graph) this.applySpatialBus(this.context, this.graph);
    if (this.context) this.applyMix(this.context);
  }

  /** Development: compare panning models live (all voices and future ones). */
  setPanningModel(model: PanningModel) {
    this.panningModel = model;
    for (const voice of this.voices) voice.panner.panningModel = model;
  }

  /**
   * Semantic playback for the visual layer (platter motion, docs/PLATTER_MOTION.md): is this era's
   * SELECTED record logically playing right now? True while its live voice runs in a running context —
   * also when muted or mixed down to silence (a quiet neighbour, focus). False before unlock, while the
   * context is suspended, for an unavailable / failed record, and once its voice is retired (fading out).
   * Cheap (a map lookup): safe to call per era per frame. Never exposes Web Audio nodes.
   */
  isEraPlaying(eraId: EraId): boolean {
    const context = this.context;
    if (!context || !this.unlocked || this.fatal || context.state !== "running") return false;
    return this.eraVoices.get(eraId)?.trackId === this.selection.get(eraId);
  }

  // --- state for React and the dev panel -------------------------------------

  getSnapshot = (): AudioSnapshot => this.snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getDebugInfo(): AudioDebugInfo {
    const context = this.context;
    const graph = this.graph;
    const now = context?.currentTime ?? 0;
    const l = this.listener;
    return {
      contextState: context?.state ?? "none",
      contextsCreated: this.contextsCreated,
      sampleRate: context?.sampleRate ?? null,
      currentTime: context?.currentTime ?? null,
      gains: graph && {
        master: graph.master.gain.value,
        music: graph.music.gain.value,
        ambient: graph.ambient.gain.value,
        ui: graph.ui.gain.value,
        spatial: graph.spatial.gain.value,
        dry: graph.dry.gain.value,
      },
      listener: this.hasFrame ? [l[0], l[1], l[2]] : null,
      stationCoordinate: this.hasFrame ? stationCoordinate(this.mixInput.loopProgress, this.anchors) : null,
      eras: adjacentEras(this.activeEra),
      neighbourhood: (["previous", "active", "next"] as const).map((role) => {
        const eraId = adjacentEras(this.activeEra)[role];
        const trackId = this.selection.get(eraId);
        const entry = this.resolve(eraId, trackId);
        return { role, eraId, trackId, load: entry.url ? this.loadState(entry) : "unavailable", playing: this.eraVoices.get(eraId)?.trackId === trackId };
      }),
      mix: { ...this.debugMix },
      panningModel: this.panningModel,
      voices: [...this.voices].map((voice) => {
        const source = this.stations[voice.eraIndex].source;
        return {
          id: voice.id,
          eraId: voice.eraId,
          trackId: voice.trackId,
          role: voice.stopping ? "fading" : (roleOf(voice.eraIndex, this.activeIndex) ?? "fading"),
          target: voice.stopping ? 0 : Number.isNaN(voice.target) ? 0 : voice.target,
          gain: voice.gain.gain.value,
          position: this.position(voice, now),
          distance: this.hasFrame ? Math.hypot(source[0] - l[0], source[1] - l[1], source[2] - l[2]) : NaN,
          source,
        };
      }),
      liveNodes: this.liveNodes,
      sourcesCreated: this.sourcesCreated,
      cache: this.cache.stats(),
      loadedUrls: this.cache.readyUrls(),
      streams: this.pool?.stats() ?? null,
    };
  }

  // --- internals: loading ----------------------------------------------------

  private resolve(eraId: EraId, trackId: string): AudioTrackEntry {
    return (this.options.resolveEntry ?? getAudioEntry)(eraId, trackId);
  }

  /** Whether an entry plays as a stream (recordings / previews) rather than a decoded tone. */
  private streamed(entry: AudioTrackEntry): boolean {
    return entry.url !== null && audioSourceStrategy(entry.kind, this.options.decodeRecordings) === "stream";
  }

  /** An entry's load state, whichever way it plays (callers handle a null URL). */
  private loadState(entry: AudioTrackEntry): BufferLoadState {
    if (!entry.url) return "idle";
    if (!this.streamed(entry)) return this.cache.state(entry.url);
    if (this.streamFailure) return "error";
    return this.pool ? this.pool.state(entry.url) : "idle";
  }

  private loadError(entry: AudioTrackEntry): AudioLoadError | undefined {
    if (!entry.url) return undefined;
    if (!this.streamed(entry)) return this.cache.error(entry.url);
    return this.streamFailure ?? this.pool?.error(entry.url);
  }

  /**
   * The streaming working set, highest priority first: the active era's record, record-change destinations,
   * the next and previous eras' records (preload "auto" while playback is wanted, else "metadata"), and the
   * lookahead era's record ("metadata": headers only). Held eras are left out — their old record is leaving
   * the deck. Voices fading out keep their elements outside this list until they end.
   */
  private streamDemand(): StreamDemand[] {
    const demand: StreamDemand[] = [];
    const add = (eraId: EraId, trackId: string, preload: StreamPreload) => {
      const entry = this.resolve(eraId, trackId);
      if (entry.url && this.streamed(entry) && !demand.some((item) => item.url === entry.url)) demand.push({ url: entry.url, preload });
    };
    const neighbourhood = this.wantsPlayback ? "auto" : "metadata";
    const { previous, active, next } = adjacentEras(this.activeEra);
    if (!this.held.has(active)) add(active, this.selection.get(active), neighbourhood);
    for (const [eraId, trackId] of this.destinations) add(eraId, trackId, "auto");
    for (const eraId of [next, previous]) if (!this.held.has(eraId)) add(eraId, this.selection.get(eraId), neighbourhood);
    if (this.lookahead >= 0) {
      const eraId = getEraByIndex(this.lookahead).id;
      if (!this.held.has(eraId)) add(eraId, this.selection.get(eraId), "metadata");
    }
    return demand;
  }

  /** Prepares / frees pool elements for the current working set (never touches a playing voice). */
  private syncStreams() {
    const pool = this.pool;
    if (!pool || !this.context || this.fatal) return;
    if (pool.sync(this.streamDemand())) return;
    // Every element is owned (voices fading out after rapid moves): end the oldest fading stream quickly;
    // its release re-runs reconcile, which places what is still missing.
    let oldest: Voice | undefined;
    for (const voice of this.voices) if (voice.media && voice.stopping && !voice.cut && (!oldest || voice.id < oldest.id)) oldest = voice;
    if (oldest) this.cutShort(oldest, this.context.currentTime);
  }

  /** The bounded media element pool, created and primed inside the unlock gesture. */
  private createStreamPool(context: AudioContextLike): StreamPool<Voice> | null {
    const create = this.options.createMediaElement;
    if (!create) {
      this.streamFailure = new AudioLoadError("unsupported", "streamed playback is not available (no media elements)");
      return null;
    }
    const pool = new StreamPool<Voice>(this.config.maxMediaElements, this.config.loopTracks, {
      changed: () => {
        this.reconcile();
        this.emit();
      },
      ended: (voice) => this.releaseVoice(voice, true),
      failed: (voice) => {
        this.warnOnce(`stream:${voice.trackId}`, `streamed recording failed while playing: ${voice.trackId}`);
        this.releaseVoice(voice, false);
      },
    });
    try {
      pool.prime(context, create);
    } catch (error) {
      this.streamFailure = new AudioLoadError("unsupported", `streamed playback is not available: ${errorMessage(error)}`);
      this.warnOnce("stream-pool", this.streamFailure.message);
      return null;
    }
    return pool;
  }

  private async fetchAndDecode(url: string): Promise<AudioBufferLike> {
    const context = this.context;
    if (!context) throw new AudioLoadError("unsupported", "no AudioContext (audio is still locked)");
    let bytes: ArrayBuffer;
    try {
      bytes = await this.options.fetchAudio(url);
    } catch (error) {
      throw error instanceof AudioLoadError ? error : new AudioLoadError("network", errorMessage(error));
    }
    try {
      return await context.decodeAudioData(bytes);
    } catch (error) {
      throw new AudioLoadError("decode", errorMessage(error));
    }
  }

  /** Active era first, then next and previous (wrap-aware). Deduplicated by the cache. */
  private preloadNeighbourhood() {
    const { previous, active, next } = adjacentEras(this.activeEra);
    this.preloadEra(active);
    this.preloadEra(next);
    this.preloadEra(previous);
  }

  /**
   * Once the visitor leaves the active station's plateau, prepare the era beyond the neighbour ahead (either
   * direction): a tone is decoded, a recording only gets its metadata (streamDemand).
   */
  private preloadLookahead() {
    const config = this.config.mix;
    const offset = stationOffset(stationCoordinate(this.mixInput.loopProgress, this.anchors), this.activeIndex, this.anchors.length);
    const index = offset > config.plateau ? wrapIndex(this.activeIndex + 2) : offset < -config.plateau ? wrapIndex(this.activeIndex - 2) : -1;
    if (index === this.lookahead) return;
    this.lookahead = index;
    if (index >= 0) this.preloadEra(getEraByIndex(index).id);
    this.syncStreams();
  }

  private requestLoad(url: string, retry = false) {
    if (this.awaiting.has(url)) return;
    this.awaiting.add(url);
    this.cache.load(url, retry).then(
      () => {
        this.awaiting.delete(url);
        this.reconcile();
        this.emit();
      },
      (error: unknown) => {
        this.awaiting.delete(url);
        const failure = error instanceof AudioLoadError ? error : new AudioLoadError("network", errorMessage(error));
        this.warnOnce(`load:${url}:${failure.kind}`, `audio unavailable: ${url} — ${failure.kind}: ${failure.message}`);
        this.emit();
      },
    );
  }

  // --- internals: graph and context ------------------------------------------

  private buildGraph(context: AudioContextLike): AudioGraph {
    const now = context.currentTime;
    const bus = (level: number) => {
      const node = context.createGain();
      node.gain.setValueAtTime(level, now);
      this.liveNodes++;
      return node;
    };
    const spatial = this.config.spatial;
    const graph: AudioGraph = {
      master: bus(this.muted ? 0 : this.config.masterLevel),
      music: bus(this.config.musicLevel),
      ambient: bus(this.config.ambientLevel),
      ui: bus(this.config.uiLevel),
      spatial: bus(this.debugMix.spatial ? spatial.wet : 0),
      dry: bus(this.debugMix.spatial ? spatial.dry : 1),
    };
    graph.spatial.connect(graph.music);
    graph.dry.connect(graph.music);
    graph.music.connect(graph.master);
    graph.ambient.connect(graph.master);
    graph.ui.connect(graph.master);
    graph.master.connect(context.destination);
    return graph;
  }

  /** SPATIAL ON: wet/dry blend. OFF (dev bypass): panners silent, dry path at full level. */
  private applySpatialBus(context: AudioContextLike, graph: AudioGraph) {
    const spatial = this.config.spatial;
    const now = context.currentTime;
    rampTo(graph.spatial.gain, this.debugMix.spatial ? spatial.wet : 0, now, 0.1);
    rampTo(graph.dry.gain, this.debugMix.spatial ? spatial.dry : 1, now, 0.1);
  }

  /** iOS Safari only unlocks output once something starts inside the gesture: one silent frame. */
  private primeOutput(context: AudioContextLike) {
    try {
      const source = context.createBufferSource();
      source.buffer = context.createBuffer(1, 1, context.sampleRate);
      source.connect(context.destination);
      this.liveNodes++;
      source.onended = () => {
        source.onended = null;
        source.disconnect();
        this.liveNodes--;
      };
      source.start();
    } catch (error) {
      this.warnOnce("prime", `silent unlock buffer failed: ${errorMessage(error)}`);
    }
  }

  private resumeContext() {
    const context = this.context;
    if (!context || context.state === "running" || context.state === "closed") return;
    context.resume().then(
      () => this.emit(),
      (error: unknown) => {
        this.warnOnce("resume", `AudioContext.resume() was refused (${errorMessage(error)}); waiting for a user gesture`);
        this.emit();
      },
    );
  }

  private handleContextState() {
    const context = this.context;
    if (!context) return;
    if (context.state === "closed" && !this.fatal) {
      this.fatal = "context-closed";
      this.warnOnce("closed", "the AudioContext was closed; audio is unavailable until the page reloads");
      for (const voice of [...this.voices]) this.releaseVoice(voice, false);
    }
    this.syncMediaPlayback();
    this.emit();
  }

  /**
   * Streamed voices follow the context like buffer sources follow the audio clock: their elements play while
   * it runs and pause while it is suspended (hidden page, OS interruption), resuming where they were.
   */
  private syncMediaPlayback() {
    const pool = this.pool;
    const context = this.context;
    if (!pool || !context) return;
    const running = context.state === "running" && !this.fatal;
    for (const slot of pool.ownedSlots()) {
      if (!running) slot.element.pause();
      else if (slot.element.paused) this.playMedia(slot);
    }
  }

  private playMedia(slot: MediaSlot<Voice>) {
    slot.element.play().catch((error: unknown) => {
      // AbortError: paused or detached before it started (normal). Otherwise (autoplay refused) the next gesture retries.
      if (error instanceof Error && error.name === "AbortError") return;
      this.warnOnce("media-play", `streamed playback was refused (${errorMessage(error)}); the next click / tap resumes it`);
      this.emit();
    });
  }

  /** The listener = the production camera (AudioParams where supported, deprecated setters otherwise). */
  private applyListener(context: AudioContextLike) {
    const listener = context.listener;
    const l = this.listener;
    if (listener.positionX && listener.positionY && listener.positionZ && listener.forwardX && listener.forwardY && listener.forwardZ && listener.upX && listener.upY && listener.upZ) {
      setParam(listener.positionX, l[0]);
      setParam(listener.positionY, l[1]);
      setParam(listener.positionZ, l[2]);
      setParam(listener.forwardX, l[3]);
      setParam(listener.forwardY, l[4]);
      setParam(listener.forwardZ, l[5]);
      setParam(listener.upX, l[6]);
      setParam(listener.upY, l[7]);
      setParam(listener.upZ, l[8]);
    } else {
      listener.setPosition?.(l[0], l[1], l[2]);
      listener.setOrientation?.(l[3], l[4], l[5], l[6], l[7], l[8]);
    }
  }

  // --- internals: voices -----------------------------------------------------

  /**
   * Makes the voice set match the semantic target: the previous / active / next eras' selected records.
   * Re-entrant calls (a stream released while reconciling frees an element) run once more afterwards.
   */
  private reconcile() {
    const context = this.context;
    const graph = this.graph;
    if (!context || !graph || !this.unlocked || this.fatal) return;
    if (this.reconciling) {
      this.reconcileAgain = true;
      return;
    }
    this.reconciling = true;
    try {
      for (let pass = 0; pass < 4; pass++) {
        this.reconcileAgain = false;
        this.reconcileOnce(context, graph);
        if (!this.reconcileAgain || this.fatal) break;
      }
    } finally {
      this.reconciling = false;
    }
  }

  private reconcileOnce(context: AudioContextLike, graph: AudioGraph) {
    const relevant = this.wantsPlayback ? adjacentEras(this.activeEra) : null;
    // A held era (record change in progress) is never wanted: its voice ducks out and none is created.
    const wanted = relevant ? [relevant.active, relevant.next, relevant.previous].filter((eraId) => !this.held.has(eraId)) : [];
    for (const key of this.finished) if (!wanted.some((eraId) => key.startsWith(`${eraId}|`))) this.finished.delete(key);

    for (const [eraId, voice] of this.eraVoices) {
      if (!wanted.includes(eraId) || voice.trackId !== this.selection.get(eraId)) {
        this.fadeOut(voice, this.held.get(eraId) ?? this.config.fadeOut);
        this.eraVoices.delete(eraId);
      }
    }
    // Streams: prepare / free pool elements for the working set before starting voices from them.
    this.syncStreams();
    for (const eraId of wanted) {
      if (this.eraVoices.has(eraId)) continue;
      const trackId = this.selection.get(eraId);
      if (this.finished.has(`${eraId}|${trackId}`)) continue;
      const entry = this.resolve(eraId, trackId);
      if (!entry.url) {
        if (eraId === this.activeEra) this.warnOnce(`unavailable:${trackId}`, `no playable audio for "${trackId}" (${entry.unavailable})`);
        continue;
      }
      if (this.streamed(entry)) {
        // Ready → a voice now; loading → `canplay` reconciles again; failed / no element → nothing yet.
        const voice = this.startStream(context, graph, eraId, trackId, entry.url);
        if (voice) this.eraVoices.set(eraId, voice);
        continue;
      }
      const buffer = this.cache.peek(entry.url);
      if (buffer) {
        const voice = this.startVoice(context, graph, eraId, trackId, buffer);
        if (voice) this.eraVoices.set(eraId, voice);
      } else if (this.cache.state(entry.url) !== "error") this.requestLoad(entry.url);
    }
    this.applyMix(context);
  }

  /** Semantic gain targets → voice gains (only when a target moved; no allocation). */
  private applyMix(context: AudioContextLike) {
    const targets = this.mixTargets;
    const mix = this.mixInput;
    mix.activeIndex = this.activeIndex;
    if (this.hasFrame) computeMixGains(mix, this.anchors, targets, this.debugMix.bleed ? this.config.mix : this.noBleedConfig);
    else for (let i = 0; i < targets.length; i++) targets[i] = i === this.activeIndex ? 1 : 0; // no camera yet: active only
    const now = context.currentTime;
    for (const voice of this.eraVoices.values()) {
      const target = targets[voice.eraIndex] * this.config.trackLevel;
      // Skip sub-threshold changes, but always land exactly on silence.
      if (!Number.isNaN(voice.target) && Math.abs(target - voice.target) < 1e-3 && (target !== 0 || voice.target === 0)) continue;
      // A new voice rises over fadeIn; afterwards gains follow the mix closely.
      const fresh = now - voice.startTime < this.config.fadeIn;
      voice.gain.gain.setTargetAtTime(target, now, fresh ? this.config.fadeIn / 5 : this.config.mixSmoothing);
      voice.target = target;
    }
  }

  /**
   * A streamed record's voice: from its prepared element once it can play. Returning to a record whose
   * stream is still fading out revives that same playback (same element and position — no restart heard).
   */
  private startStream(context: AudioContextLike, graph: AudioGraph, eraId: EraId, trackId: string, url: string): Voice | null {
    const slot = this.pool?.slotFor(url);
    if (!slot) return null;
    if (slot.owner) return slot.owner.stopping && slot.owner.eraId === eraId ? this.revive(context, slot.owner) : null;
    if (slot.state !== "ready") return null;
    return this.startVoice(context, graph, eraId, trackId, null, slot);
  }

  /** Cancels a stream voice's fade-out: a new clock replaces the one whose stop was already scheduled. */
  private revive(context: AudioContextLike, voice: Voice): Voice | null {
    let clock: BufferSourceLike;
    try {
      clock = this.createClock(context);
    } catch (error) {
      this.warnOnce("voice", `could not create a playback voice: ${errorMessage(error)}`);
      return null;
    }
    const now = context.currentTime;
    const old = voice.source;
    old.onended = null;
    old.disconnect();
    this.sourcesCreated++;
    clock.connect(voice.gain);
    clock.onended = () => this.releaseVoice(voice, true);
    clock.start(now);
    voice.source = clock;
    voice.stopping = false;
    voice.cut = false;
    voice.startTime = now; // rises again from its current gain over fadeIn
    voice.target = Number.NaN;
    const gain = voice.gain.gain;
    const level = gain.value;
    gain.cancelScheduledValues(now);
    gain.setValueAtTime(level, now);
    return voice;
  }

  /** A stream voice's clock: a silent one-frame loop whose scheduled stop ends the voice on the audio clock. */
  private createClock(context: AudioContextLike): BufferSourceLike {
    this.silence ??= context.createBuffer(1, 1, context.sampleRate);
    const clock = context.createBufferSource();
    clock.buffer = this.silence;
    clock.loop = true;
    return clock;
  }

  /** A fresh source + gain + panner for one playback instance (a decoded tone, or a ready stream element), placed at its station. */
  private startVoice(context: AudioContextLike, graph: AudioGraph, eraId: EraId, trackId: string, buffer: AudioBufferLike | null, media: MediaSlot<Voice> | null = null): Voice | null {
    const now = context.currentTime;
    // Returning to a tone that is still fading out continues from where it is (no restart heard).
    let fading: Voice | undefined;
    if (buffer) for (const voice of this.voices) if (voice.stopping && voice.buffer && voice.eraId === eraId && voice.trackId === trackId) fading = voice;
    const offset = fading ? this.position(fading, now) : 0;

    let source: BufferSourceLike;
    let gain: GainNodeLike;
    let panner: PannerNodeLike;
    try {
      source = buffer ? context.createBufferSource() : this.createClock(context);
      gain = context.createGain();
      panner = context.createPanner();
    } catch (error) {
      this.warnOnce("voice", `could not create a playback voice: ${errorMessage(error)}`);
      return null;
    }
    this.sourcesCreated++;
    this.liveNodes += 3;
    const eraIndex = getEra(eraId).index;
    const voice: Voice = {
      id: this.nextVoiceId++,
      eraId,
      eraIndex,
      trackId,
      buffer,
      source,
      media,
      gain,
      panner,
      startTime: now,
      offset,
      target: Number.NaN,
      stopping: false,
      cut: false,
      released: false,
    };

    // Station source: fixed, from the hall layout (identical for every visual LOD tier).
    const spatial = this.config.spatial;
    const [x, y, z] = this.stations[eraIndex].source;
    panner.panningModel = this.panningModel;
    panner.distanceModel = spatial.distanceModel;
    panner.refDistance = spatial.refDistance;
    panner.maxDistance = spatial.maxDistance;
    panner.rolloffFactor = spatial.rolloffFactor;
    panner.coneInnerAngle = 360;
    panner.coneOuterAngle = 360;
    if (panner.positionX && panner.positionY && panner.positionZ) {
      panner.positionX.value = x;
      panner.positionY.value = y;
      panner.positionZ.value = z;
    } else panner.setPosition?.(x, y, z);

    if (buffer) {
      source.buffer = buffer;
      source.loop = this.config.loopTracks;
    }
    gain.gain.setValueAtTime(0, now);
    source.connect(gain);
    // A stream enters the SAME chain: element → MediaElementAudioSourceNode → voice gain.
    if (media) {
      media.node.connect(gain);
      this.pool?.claim(media, voice);
    }
    gain.connect(panner);
    panner.connect(graph.spatial);
    gain.connect(graph.dry);
    source.onended = () => this.releaseVoice(voice, true);
    this.voices.add(voice);
    try {
      source.start(now, offset);
    } catch (error) {
      this.warnOnce("start", `could not start "${trackId}": ${errorMessage(error)}`);
      this.releaseVoice(voice, false);
      return null;
    }
    if (media && context.state === "running") this.playMedia(media); // else it starts when the context runs
    this.limitFadingVoices(now);
    return voice;
  }

  /** Ramps a voice to silence and schedules its (single) stop on the audio clock. */
  private fadeOut(voice: Voice, duration: number) {
    const context = this.context;
    if (voice.stopping || voice.released || !context) return;
    voice.stopping = true;
    const now = context.currentTime;
    rampTo(voice.gain.gain, 0, now, duration);
    try {
      voice.source.stop(now + duration + this.config.stopMargin);
    } catch {
      this.releaseVoice(voice, false); // already stopped: just clean up
    }
  }

  /** Rapid dev input only: never keep more than maxFadingVoices fading at once. */
  private limitFadingVoices(now: number) {
    const fading = [...this.voices].filter((voice) => voice.stopping);
    while (fading.length > this.config.maxFadingVoices) {
      const voice = fading.shift();
      if (!voice) break;
      this.cutShort(voice, now);
    }
  }

  /** Ends a fading voice within 30 ms (no click): its source stop is rescheduled sooner. */
  private cutShort(voice: Voice, now: number) {
    voice.cut = true;
    rampTo(voice.gain.gain, 0, now, 0.03);
    try {
      voice.source.stop(now + 0.03 + this.config.stopMargin);
    } catch {
      this.releaseVoice(voice, false);
    }
  }

  /**
   * Called once per voice when its source ends (stopped or finished): disconnect and forget it. A stream's
   * element is paused and detached (download aborted, decoder buffers freed) and goes back to the pool.
   */
  private releaseVoice(voice: Voice, ended: boolean) {
    if (voice.released) return;
    voice.released = true;
    voice.source.onended = null;
    voice.source.disconnect();
    voice.gain.disconnect();
    voice.panner.disconnect();
    this.liveNodes -= 3;
    const media = voice.media;
    if (media) {
      voice.media = null;
      this.pool?.release(media);
    }
    this.voices.delete(voice);
    if (this.eraVoices.get(voice.eraId) === voice) {
      this.eraVoices.delete(voice.eraId);
      if (ended) this.finished.add(`${voice.eraId}|${voice.trackId}`); // a non-looping record reached its end
    }
    if (media) this.reconcile(); // an element is free: place what the working set still misses
    this.emit();
  }

  private position(voice: Voice, now: number): number {
    if (voice.media) return voice.media.element.currentTime;
    const duration = voice.buffer?.duration ?? 0;
    if (duration <= 0) return 0;
    const played = voice.offset + Math.max(0, now - voice.startTime);
    return this.config.loopTracks ? played % duration : Math.min(played, duration);
  }

  // --- internals: semantic state ---------------------------------------------

  private targetError(): AudioErrorInfo | null {
    const trackId = this.selection.get(this.activeEra);
    const entry = this.resolve(this.activeEra, trackId);
    if (!entry.url) return { trackId, reason: "unavailable" };
    const error = this.loadError(entry);
    return error ? { trackId, reason: error.kind } : null;
  }

  private status(): AudioStatus {
    if (this.fatal) return "ERROR";
    const context = this.context;
    if (!this.unlocked || !context) return "LOCKED";
    if (context.state === "suspended" || context.state === "interrupted") return "SUSPENDED";
    if (!this.wantsPlayback) return "READY";
    const selected = this.selection.get(this.activeEra);
    if (this.eraVoices.get(this.activeEra)?.trackId === selected) return "PLAYING";
    if (this.targetError()) return "ERROR";
    return this.finished.has(`${this.activeEra}|${selected}`) ? "READY" : "LOADING";
  }

  private buildSnapshot(): AudioSnapshot {
    const selectedTrackId = this.selection.get(this.activeEra);
    const entry = this.resolve(this.activeEra, selectedTrackId);
    return {
      status: this.status(),
      unlocked: this.unlocked,
      contextState: this.context?.state ?? "none",
      muted: this.muted,
      wantsPlayback: this.wantsPlayback,
      activeEraId: this.activeEra,
      selectedTrackId,
      selectedKind: entry.kind,
      loadedTrackId: this.loadState(entry) === "ready" ? selectedTrackId : null,
      playingTrackId: this.eraVoices.get(this.activeEra)?.trackId ?? null,
      error: this.fatal ? { trackId: null, reason: this.fatal } : this.targetError(),
    };
  }

  private emit() {
    const next = this.buildSnapshot();
    if (sameSnapshot(next, this.snapshot)) return;
    this.snapshot = next;
    for (const listener of this.listeners) listener();
  }

  private warnOnce(key: string, message: string) {
    if (this.warned.has(key)) return;
    this.warned.add(key);
    (this.options.warn ?? ((text: string) => console.warn(`[audio] ${text}`)))(message);
  }
}
