/**
 * Audio engine: context lifecycle, unlock gate, per-era selection, buffer cache, source
 * lifecycle, the previous / active / next voice set with panners, preloading, the per-frame
 * spatial mix, mute, active-era following (incl. GLOBAL ↔ ROOTS and endless loops), focus,
 * visibility / suspension and failures. The browser boundary (AudioContext, fetch) is mocked:
 * the mock keeps an audio clock, evaluates gain automation and fires `onended` on stop.
 *
 * Runs on the DEVELOPMENT record set (hero + fixtures with known tones): the failure, missing-audio and
 * neighbour tests deliberately break "record 2" / "record 3", which must be fixtures — never production
 * archive entries (docs/ARCHIVE_CONTENT.md §7). The production archive is covered by content.test.ts and
 * recordChange.test.ts.
 *
 * The shared voice / mix mechanics run with `decodeRecordings` (heroes decoded like tones). The
 * "production audio — streamed recordings" suite and the streamed record changes run the real
 * production path: recordings through a mock media element pool, never fetched whole or decoded.
 * Run with: npm test
 */
import "../data/useDevRecordSet.ts"; // FIRST: selects the fixture record set before the era data loads
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import * as THREE from "three";
import { isDevFixture } from "../data/devFixtures.ts";
import { ERAS, getEra } from "../data/eras.ts";
import { PRODUCTION_AUDIO_URLS } from "../data/productionAudio.ts";
import { ACTIVE_RECORD_SET } from "../data/recordSets.ts";
import { getHallLayout } from "../data/hallLayout.ts";
import { ARCHIVE_ENTRIES, HERO_TRACK_IDS } from "../data/tracks.ts";
import { ERA_IDS, type EraId, type Track } from "../data/types.ts";
import { FocusController } from "../state/focus.ts";
import { resolveTravelConfig, selectActiveStation, TRAVEL_CONFIG, TravelController } from "../state/travel.ts";
import { PLATTER_MOTION_CONFIG, PlatterMotionSystem } from "../stations/platterMotion.ts";
import { RECORD_CHANGE_CONFIG, RecordChangeController } from "../stations/recordChange.ts";
import { resolveTonearmPoses, TonearmMotionSystem } from "../stations/tonearmMotion.ts";
import { AUDIO_ASSET_POLICY, getAudioEntry, resolveAudioEntry, type AudioTrackEntry } from "./audioCatalog.ts";
import { AudioBufferCache, AudioLoadError } from "./bufferCache.ts";
import { DEV_AUDIO_SPEC } from "./devAudioAssets.ts";
import { AUDIO_CONFIG, AudioEngine, audioSourceStrategy, type AudioEngineOptions, type AudioFrame, type AudioVoiceInfo } from "./engine.ts";
import { adjacentEras, roleOf, SPATIAL_MIX_CONFIG } from "./spatialMix.ts";
import { TrackSelection } from "./trackSelection.ts";
import type {
  AudioBufferLike,
  AudioContextLike,
  AudioContextState,
  AudioListenerLike,
  AudioNodeLike,
  AudioParamLike,
  BufferSourceLike,
  DistanceModel,
  GainNodeLike,
  MediaElementEvent,
  MediaElementLike,
  MediaErrorLike,
  PannerNodeLike,
  PanningModel,
} from "./webAudio.ts";

// ---------------------------------------------------------------------------
// Mock Web Audio boundary
// ---------------------------------------------------------------------------

interface ParamEvent {
  kind: "set" | "linear" | "target";
  value: number;
  time: number;
  timeConstant: number;
}

class MockParam implements AudioParamLike {
  events: ParamEvent[] = [];
  private readonly context: MockContext;
  private initial: number;

  constructor(context: MockContext, initial: number) {
    this.context = context;
    this.initial = initial;
  }

  get value() {
    return this.valueAt(this.context.currentTime);
  }

  set value(value: number) {
    this.events = [];
    this.initial = value;
  }

  /** setValueAtTime / linearRampToValueAtTime / setTargetAtTime semantics (enough for the engine). */
  valueAt(time: number): number {
    let value = this.initial;
    let from = 0;
    let target: ParamEvent | null = null;
    const settle = (at: number) => (target ? target.value + (value - target.value) * Math.exp(-(at - from) / target.timeConstant) : value);
    for (const event of this.events) {
      if (event.time > time) {
        if (event.kind === "linear") return value + ((event.value - value) * (time - from)) / (event.time - from);
        break;
      }
      value = settle(event.time);
      from = event.time;
      if (event.kind === "target") target = event;
      else {
        value = event.value;
        target = null;
      }
    }
    return settle(time);
  }

  private add(event: ParamEvent) {
    this.events.push(event);
    this.events.sort((a, b) => a.time - b.time);
  }

  setValueAtTime(value: number, time: number) {
    this.add({ kind: "set", value, time, timeConstant: 0 });
  }

  linearRampToValueAtTime(value: number, time: number) {
    this.add({ kind: "linear", value, time, timeConstant: 0 });
  }

  setTargetAtTime(value: number, time: number, timeConstant: number) {
    // Collapse the past into one point so long simulations stay cheap (same values from `time` on).
    const current = this.valueAt(time);
    this.events = [{ kind: "set", value: current, time, timeConstant: 0 }, ...this.events.filter((event) => event.time > time)];
    this.add({ kind: "target", value, time, timeConstant });
  }

  cancelScheduledValues(time: number) {
    this.events = this.events.filter((event) => event.time < time);
  }
}

class MockNode implements AudioNodeLike {
  outputs: AudioNodeLike[] = [];
  connect(destination: AudioNodeLike) {
    this.outputs.push(destination);
    return destination;
  }
  disconnect() {
    this.outputs = [];
  }
}

class MockGain extends MockNode implements GainNodeLike {
  readonly gain: MockParam;
  constructor(context: MockContext) {
    super();
    this.gain = new MockParam(context, 1);
  }
}

class MockPanner extends MockNode implements PannerNodeLike {
  panningModel: PanningModel = "equalpower";
  distanceModel: DistanceModel = "inverse";
  refDistance = 1;
  maxDistance = 10000;
  rolloffFactor = 1;
  coneInnerAngle = 360;
  coneOuterAngle = 360;
  readonly positionX: MockParam;
  readonly positionY: MockParam;
  readonly positionZ: MockParam;
  constructor(context: MockContext) {
    super();
    this.positionX = new MockParam(context, 0);
    this.positionY = new MockParam(context, 0);
    this.positionZ = new MockParam(context, 0);
  }
}

class MockSource extends MockNode implements BufferSourceLike {
  buffer: AudioBufferLike | null = null;
  loop = false;
  onended: ((event: Event) => void) | null = null;
  startCount = 0;
  startedAt = 0;
  offset = 0;
  stopAt: number | null = null;
  ended = false;
  private readonly context: MockContext;

  constructor(context: MockContext) {
    super();
    this.context = context;
  }

  start(when = 0, offset = 0) {
    // Like the real API: a source plays ONCE.
    if (this.startCount > 0) throw new Error("InvalidStateError: start() called twice");
    this.startCount++;
    this.startedAt = Math.max(when, this.context.currentTime);
    this.offset = offset;
  }

  stop(when = 0) {
    if (this.startCount === 0) throw new Error("InvalidStateError: stop() before start()");
    this.stopAt = Math.max(when, this.context.currentTime);
  }
}

/**
 * A streaming <audio> element as a local server feeds it: setting `src` (or `load()`) restarts the load
 * algorithm; on the next tick it reports metadata, and — with preload "auto" — enough data to play
 * (loadeddata, canplay). URLs containing "missing" fail like a 404 (code 4); `slow` URLs keep buffering
 * until released. Nothing here ever holds decoded audio.
 */
class MockMediaElement implements MediaElementLike {
  preload = "";
  loop = false;
  currentTime = 0;
  paused = true;
  readyState = 0;
  error: MediaErrorLike | null = null;
  /** Load algorithm runs (src assignments + load()). */
  loads = 0;
  plays = 0;
  /** Every URL assigned to `src`. */
  readonly history: string[] = [];
  private source = "";
  private generation = 0;
  private readonly slow: Set<string>;
  private readonly listeners = new Map<MediaElementEvent, (() => void)[]>();

  constructor(slow: Set<string>) {
    this.slow = slow;
  }

  get src() {
    return this.source;
  }

  set src(url: string) {
    this.source = url;
    this.history.push(url);
    this.runLoad();
  }

  removeAttribute(name: string) {
    if (name === "src") this.source = "";
  }

  load() {
    this.runLoad();
  }

  play() {
    this.plays++;
    if (!this.source) return Promise.reject(new Error("NotSupportedError: no supported sources"));
    this.paused = false;
    return Promise.resolve();
  }

  pause() {
    this.paused = true;
  }

  addEventListener(type: MediaElementEvent, listener: () => void) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }

  /** Enough data buffered: HAVE_ENOUGH_DATA, loadeddata, canplay. */
  becomeReady() {
    this.readyState = 4;
    this.fire("loadeddata");
    this.fire("canplay");
  }

  private fire(type: MediaElementEvent) {
    for (const listener of this.listeners.get(type) ?? []) listener();
  }

  private runLoad() {
    this.loads++;
    this.paused = true;
    this.currentTime = 0;
    this.readyState = 0;
    this.error = null;
    const generation = ++this.generation;
    const url = this.source;
    if (!url) return;
    setImmediate(() => {
      if (generation !== this.generation) return; // superseded: the real element drops the old load's tasks
      if (url.includes("missing")) {
        this.error = { code: 4, message: "MEDIA_ELEMENT_ERROR: Format error" };
        this.fire("error");
        return;
      }
      this.readyState = 1;
      if (this.preload === "auto" && !this.slow.has(url)) this.becomeReady();
    });
  }
}

class MockMediaNode extends MockNode {
  readonly element: MockMediaElement;
  constructor(element: MockMediaElement) {
    super();
    this.element = element;
  }
}

const SECONDS = 8;

class MockContext implements AudioContextLike {
  currentTime = 0;
  readonly sampleRate = 48000;
  state: AudioContextState = "suspended";
  readonly destination = new MockNode();
  readonly listener: AudioListenerLike & Record<"positionX" | "positionY" | "positionZ" | "forwardX" | "forwardY" | "forwardZ" | "upX" | "upY" | "upZ", MockParam>;
  onstatechange: ((event: Event) => void) | null = null;
  readonly sources: MockSource[] = [];
  readonly gains: MockGain[] = [];
  readonly panners: MockPanner[] = [];
  readonly mediaNodes: MockMediaNode[] = [];
  decodes = 0;
  resumeCalls = 0;
  suspendCalls = 0;
  /** Next resume() is refused (autoplay policy without a gesture). */
  refuseResume = false;

  constructor() {
    const param = (value: number) => new MockParam(this, value);
    this.listener = {
      positionX: param(0),
      positionY: param(0),
      positionZ: param(0),
      forwardX: param(0),
      forwardY: param(0),
      forwardZ: param(-1),
      upX: param(0),
      upY: param(1),
      upZ: param(0),
    };
  }

  createGain() {
    const node = new MockGain(this);
    this.gains.push(node);
    return node;
  }

  createPanner() {
    const node = new MockPanner(this);
    this.panners.push(node);
    return node;
  }

  createBufferSource() {
    const source = new MockSource(this);
    this.sources.push(source);
    return source;
  }

  createBuffer(numberOfChannels: number, length: number, sampleRate: number): AudioBufferLike {
    return { numberOfChannels, length, sampleRate, duration: length / sampleRate };
  }

  decodeAudioData(data: ArrayBuffer): Promise<AudioBufferLike> {
    this.decodes++;
    if (data.byteLength === 0) return Promise.reject(new Error("EncodingError: unable to decode"));
    return Promise.resolve(this.createBuffer(1, SECONDS * this.sampleRate, this.sampleRate));
  }

  /** Like the real API: an element can be wired into a context only once. */
  createMediaElementSource(element: MediaElementLike) {
    if (this.mediaNodes.some((node) => node.element === element)) throw new Error("InvalidStateError: the element already has a source node");
    const node = new MockMediaNode(element as MockMediaElement);
    this.mediaNodes.push(node);
    return node;
  }

  resume() {
    this.resumeCalls++;
    if (this.refuseResume) {
      this.refuseResume = false;
      return Promise.reject(new Error("NotAllowedError"));
    }
    this.setState("running");
    return Promise.resolve();
  }

  suspend() {
    this.suspendCalls++;
    this.setState("suspended");
    return Promise.resolve();
  }

  setState(state: AudioContextState) {
    if (this.state === state) return;
    this.state = state;
    this.onstatechange?.(new Event("statechange"));
  }

  /** Advances the audio clock (and playing media elements); fires `ended` for stopped or finished sources. */
  advance(seconds: number) {
    if (this.state === "running") {
      this.currentTime += seconds;
      for (const node of this.mediaNodes) if (!node.element.paused) node.element.currentTime += seconds;
    }
    for (const source of this.sources) {
      if (source.startCount === 0 || source.ended) continue;
      const duration = source.buffer?.duration ?? 0;
      const natural = !source.loop && source.startedAt + duration - source.offset <= this.currentTime;
      if ((source.stopAt !== null && source.stopAt <= this.currentTime) || natural) {
        source.ended = true;
        source.onended?.(new Event("ended"));
      }
    }
  }

  /** Track voices: started sources with a real buffer (not the 1-frame unlock primer). */
  trackSources() {
    return this.sources.filter((source) => (source.buffer?.length ?? 0) > 1);
  }
}

const flush = async () => {
  for (let i = 0; i < 8; i++) await new Promise((resolve) => setImmediate(resolve));
};

const layout = getHallLayout();
const STATIONS = layout.stations.map((station) => ({ progress: station.progress, source: station.platter }));

interface Harness {
  engine: AudioEngine;
  context: MockContext;
  fetches: string[];
  contextsCreated: () => number;
  gesture: { active: boolean };
}

/**
 * URLs containing "missing" 404, "corrupt" return undecodable bytes. Recordings are decoded like tones here
 * (`decodeRecordings`): these suites test the shared voice / mix mechanics. createStreamingHarness runs the
 * production path.
 */
function createHarness(options: Partial<AudioEngineOptions> & { initialEra?: EraId } = {}): Harness {
  const context = new MockContext();
  const fetches: string[] = [];
  let created = 0;
  const gesture = { active: true };
  const engine = new AudioEngine({
    initialEra: "roots",
    stations: STATIONS,
    createContext: () => {
      created++;
      return context;
    },
    fetchAudio: async (url) => {
      fetches.push(url);
      if (url.includes("missing")) throw new AudioLoadError("network", "HTTP 404");
      return new ArrayBuffer(url.includes("corrupt") ? 0 : 64);
    },
    hasUserActivation: () => gesture.active,
    warn: () => {},
    decodeRecordings: true,
    ...options,
  });
  return { engine, context, fetches, contextsCreated: () => created, gesture };
}

interface StreamHarness extends Harness {
  /** Every media element the engine created. */
  elements: MockMediaElement[];
  /** URLs that keep buffering until `finishLoading`. */
  slow: Set<string>;
  finishLoading: (url: string) => void;
}

/** The production path: recordings stream through the media element pool; tones still decode. */
function createStreamingHarness(options: Partial<AudioEngineOptions> & { initialEra?: EraId } = {}): StreamHarness {
  const elements: MockMediaElement[] = [];
  const slow = new Set<string>();
  const h = createHarness({
    decodeRecordings: false,
    createMediaElement: () => {
      const element = new MockMediaElement(slow);
      elements.push(element);
      return element;
    },
    ...options,
  });
  const finishLoading = (url: string) => {
    slow.delete(url);
    for (const element of elements) if (element.src === url && element.readyState < 3) element.becomeReady();
  };
  return { ...h, elements, slow, finishLoading };
}

/** Catalog in which `trackId` has no playable audio (the dev records all have tones now). */
const withoutAudio =
  (trackId: string) =>
  (eraId: EraId, id: string): AudioTrackEntry =>
    id === trackId ? { trackId: id, eraId, url: null, kind: null, unavailable: "no-audio" } : getAudioEntry(eraId, id);

/** Unlock (as from a click) and turn playback on, then let loads settle. */
async function startPlayback(h: Harness) {
  assert.equal(h.engine.unlock(), true);
  h.engine.play();
  await flush();
}

const hero = (eraId: EraId) => HERO_TRACK_IDS[eraId];
const heroUrl = (eraId: EraId) => getAudioEntry(eraId, hero(eraId)).url;
/** master, music, ambient, ui, musicSpatial, musicDry. */
const BUS_NODES = 6;
/** source + voice gain + panner. */
const VOICE_NODES = 3;
const close = (a: number, b: number, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≉ ${b}`);
const liveVoices = (engine: AudioEngine) => engine.getDebugInfo().voices.filter((voice) => voice.role !== "fading");
const voiceOf = (engine: AudioEngine, eraId: EraId): AudioVoiceInfo | undefined => liveVoices(engine).find((voice) => voice.eraId === eraId);
const neighbourhood = (eraId: EraId) => Object.values(adjacentEras(eraId)).sort();

/** The live (not stopping) source of an era's voice, found through its panner's position. */
function sourceOf(h: Harness, eraId: EraId): MockSource | undefined {
  const x = layout.stations[getEra(eraId).index].platter[0];
  return h.context.trackSources().find((source) => {
    if (source.stopAt !== null || source.ended) return false;
    const gain = source.outputs[0] as MockGain | undefined;
    const panner = gain?.outputs.find((node): node is MockPanner => node instanceof MockPanner);
    return panner?.positionX.value === x;
  });
}

/** The media element of an era's live (not fading) stream voice, found through its voice chain. */
function streamOf(h: StreamHarness, eraId: EraId): MockMediaElement | undefined {
  const x = layout.stations[getEra(eraId).index].platter[0];
  return h.context.mediaNodes.find((node) => {
    const gain = node.outputs[0] as MockGain | undefined;
    if (!gain) return false;
    const clock = h.context.sources.find((source) => source.outputs[0] === gain);
    if (!clock || clock.stopAt !== null || clock.ended) return false;
    return gain.outputs.some((next) => next instanceof MockPanner && next.positionX.value === x);
  })?.element;
}

const mediaNodeOf = (h: StreamHarness, element: MockMediaElement) => h.context.mediaNodes.find((node) => node.element === element);
const JA_FUNMI = PRODUCTION_AUDIO_URLS["king-sunny-ade-ja-funmi"];
const BATA = PRODUCTION_AUDIO_URLS["bata-drumming"];
const FREE_MIND = PRODUCTION_AUDIO_URLS["tems-free-mind"];

/** Streaming tests: record `index` of `eraId` (a dev fixture) stands for a production recording — its real file and kind. */
const asRecording =
  (eraId: EraId, index: number, url: string) =>
  (era: EraId, trackId: string): AudioTrackEntry => {
    const entry = getAudioEntry(era, trackId);
    return era === eraId && trackId === getEra(eraId).tracks[index].id ? { ...entry, url, kind: "recording", unavailable: null } : entry;
  };

/** A frame as the listener bridge publishes it: the camera on the route at `loopProgress`. */
function routeFrame(loopProgress: number, focusAmount = 0, focusStation = -1, frame?: AudioFrame): AudioFrame {
  const out = frame ?? { position: [0, 0, 0], forward: [0, 0, -1], up: [0, 1, 0], loopProgress: 0, focusAmount: 0, focusStation: -1 };
  const point = layout.curve.getPointAt(((loopProgress % 1) + 1) % 1, new THREE.Vector3());
  out.position[0] = point.x;
  out.position[1] = point.y;
  out.position[2] = point.z;
  out.loopProgress = ((loopProgress % 1) + 1) % 1;
  out.focusAmount = focusAmount;
  out.focusStation = focusStation;
  return out;
}

// ---------------------------------------------------------------------------
// Catalog and selection (static)
// ---------------------------------------------------------------------------

describe("audio catalog", () => {
  it("runs on the development record set: records 2 and 3 of every era are fixtures, never archive entries", () => {
    assert.equal(ACTIVE_RECORD_SET, "dev");
    for (const era of ERAS) assert.deepEqual(era.tracks.map(isDevFixture), [false, true, true], era.id);
  });

  it("keeps development fixtures on their existing synthetic WAVs", () => {
    for (const era of ERAS) for (const track of era.tracks.filter(isDevFixture)) {
      const entry = getAudioEntry(era.id, track.id);
      assert.equal(entry.eraId, era.id);
      assert.equal(entry.kind, "development-placeholder", track.id);
      assert.equal(entry.url, `/audio/${era.id}/dev-placeholder--${track.id}.wav`);
      // The generated file exists and is the specified mono 16-bit WAV.
      const file = readFileSync(new URL(`../../public${entry.url}`, import.meta.url));
      assert.equal(file.toString("ascii", 0, 4), "RIFF");
      assert.equal(file.toString("ascii", 8, 12), "WAVE");
      assert.equal(file.readUInt16LE(22), 1, "mono");
      assert.equal(file.readUInt32LE(24), DEV_AUDIO_SPEC.sampleRate);
      assert.equal(file.readUInt16LE(34), 16);
      assert.equal(file.readUInt32LE(40), DEV_AUDIO_SPEC.sampleRate * DEV_AUDIO_SPEC.seconds * 2);
    }
  });

  it("uses real production heroes alongside development fixtures in the dev record set", () => {
    for (const era of ERAS) {
      assert.equal(getAudioEntry(era.id, era.heroTrackId).kind, "recording");
      for (const track of era.tracks.filter(isDevFixture)) assert.equal(track.audioUrl, null);
    }
  });

  it("marks a track without audio unavailable (development tones switched off)", () => {
    const placeholder = getEra("roots").tracks[1];
    assert.equal(placeholder.status, "placeholder");
    const policy = { ...AUDIO_ASSET_POLICY, allowDevelopmentPlaceholders: false };
    assert.deepEqual(getAudioEntry("roots", placeholder.id, policy), { trackId: placeholder.id, eraId: "roots", url: null, kind: null, unavailable: "no-audio" });
  });

  it("uses a licensed local file when the track declares it available, and refuses anything that is not a local /audio/ asset", () => {
    const base = getEra("explosion").tracks[0];
    const withUrl = (audioUrl: string): Track => ({ ...base, audioUrl, audioAvailability: "available" });
    assert.equal(resolveAudioEntry(withUrl("/audio/explosion/water-no-get-enemy.mp3")).kind, "recording");
    for (const url of ["https://www.youtube.com/watch?v=x", "//cdn.example.com/a.mp3", "/audio/../secret.mp3", "audio/x.mp3", "/textures/x.mp3"]) {
      const entry = resolveAudioEntry(withUrl(url));
      assert.equal(entry.url, null, url);
      assert.equal(entry.unavailable, "not-local-asset", url);
    }
  });

  it("resolves audio strictly from the declared availability", () => {
    const heroTrack = getEra("explosion").tracks[0];
    const as = (audioAvailability: Track["audioAvailability"], audioUrl: string | null = null): Track => ({ ...heroTrack, audioAvailability, audioUrl });
    const url = "/audio/explosion/fela-kuti-water-no-get-enemy.mp3";
    assert.deepEqual([resolveAudioEntry(as("available", url)).kind, resolveAudioEntry(as("available", url)).url], ["recording", url]);
    const preview = resolveAudioEntry(as("preview", "/audio/explosion/fela-kuti-water-no-get-enemy.preview.mp3"));
    assert.equal(preview.kind, "preview");
    // Declared available / preview without a file: a data error, never a tone.
    assert.deepEqual([resolveAudioEntry(as("available")).url, resolveAudioEntry(as("available")).unavailable], [null, "missing-url"]);
    // Unavailable: never a tone, never the URL — even though this hero HAS a development tone.
    for (const entry of [resolveAudioEntry(as("unavailable")), resolveAudioEntry(as("unavailable", url))]) {
      assert.equal(entry.url, null);
      assert.equal(entry.unavailable, "not-licensed");
    }
    // Pending: a URL alone is not permission — the tone stands in, the URL is ignored.
    const pending = resolveAudioEntry(as("pending", url));
    assert.equal(pending.kind, "development-placeholder");
    assert.notEqual(pending.url, url);
    // A pending archive record without a generated tone stays displayable with no audio.
    const unlisted = resolveAudioEntry({ ...heroTrack, id: "some-future-record", audioAvailability: "pending" });
    assert.deepEqual([unlisted.url, unlisted.unavailable], [null, "no-audio"]);
  });

  it("can switch the development tones off (policy)", () => {
    const entry = getAudioEntry("naija", getEra("naija").tracks[1].id, { ...AUDIO_ASSET_POLICY, allowDevelopmentPlaceholders: false });
    assert.equal(entry.url, null);
    assert.equal(entry.unavailable, "no-audio");
  });

  it("rejects a track from another era", () => {
    assert.throws(() => getAudioEntry("afrobeats", hero("highlife")));
  });
});

describe("track selection", () => {
  it("starts every era on its hero track", () => {
    const selection = new TrackSelection();
    for (const eraId of ERA_IDS) {
      assert.equal(selection.get(eraId), hero(eraId));
      assert.equal(selection.state(eraId).visited, false);
    }
  });

  it("only accepts tracks of the era's own playlist", () => {
    const selection = new TrackSelection();
    assert.equal(selection.select("afrobeats", hero("highlife")), false);
    assert.equal(selection.select("afrobeats", "made-up-track"), false);
    assert.equal(selection.get("afrobeats"), hero("afrobeats"));
    const other = getEra("afrobeats").tracks[2].id;
    assert.equal(selection.select("afrobeats", other), true);
    assert.equal(selection.get("afrobeats"), other);
  });

  it("reports the first visit once", () => {
    const selection = new TrackSelection();
    assert.equal(selection.markVisited("global"), true);
    assert.equal(selection.markVisited("global"), false);
    assert.equal(selection.get("global"), hero("global"));
  });
});

// ---------------------------------------------------------------------------
// Buffer cache
// ---------------------------------------------------------------------------

describe("audio buffer cache", () => {
  it("deduplicates simultaneous requests and reuses the decoded buffer", async () => {
    let calls = 0;
    let release: (value: string) => void = () => {};
    const cache = new AudioBufferCache<string>(
      () => {
        calls++;
        return new Promise<string>((resolve) => (release = resolve));
      },
      () => 10,
    );
    const requests = [cache.load("/audio/a.wav"), cache.load("/audio/a.wav"), cache.load("/audio/a.wav")];
    await flush();
    assert.equal(cache.state("/audio/a.wav"), "loading");
    release("buffer-a");
    assert.deepEqual(await Promise.all(requests), ["buffer-a", "buffer-a", "buffer-a"]);
    assert.equal(await cache.load("/audio/a.wav"), "buffer-a");
    assert.equal(calls, 1);
    assert.deepEqual(cache.stats(), { buffers: 1, loading: 0, errors: 0, bytes: 10, requests: 1 });
  });

  it("remembers failures (no refetch) until an explicit retry", async () => {
    let calls = 0;
    const cache = new AudioBufferCache<string>(
      async () => {
        calls++;
        throw new AudioLoadError("decode", "bad data");
      },
      () => 0,
    );
    await assert.rejects(cache.load("/audio/b.wav"), (error: AudioLoadError) => error.kind === "decode");
    assert.equal(cache.state("/audio/b.wav"), "error");
    await assert.rejects(cache.load("/audio/b.wav"));
    assert.equal(calls, 1);
    await assert.rejects(cache.load("/audio/b.wav", true));
    assert.equal(calls, 2);
  });

  it("classifies unknown loader failures as network errors", async () => {
    const cache = new AudioBufferCache<string>(
      async () => {
        throw new TypeError("Failed to fetch");
      },
      () => 0,
    );
    await assert.rejects(cache.load("/audio/c.wav"), (error: AudioLoadError) => error instanceof AudioLoadError && error.kind === "network");
  });

  it("drops loads that finish after clear()", async () => {
    let release: (value: string) => void = () => {};
    const cache = new AudioBufferCache<string>(() => new Promise<string>((resolve) => (release = resolve)), () => 1);
    const pending = cache.load("/audio/d.wav");
    await flush();
    cache.clear();
    release("late");
    assert.equal(await pending, "late");
    assert.equal(cache.state("/audio/d.wav"), "idle");
    assert.equal(cache.stats().buffers, 0);
  });
});

// ---------------------------------------------------------------------------
// Engine: context lifecycle and unlock
// ---------------------------------------------------------------------------

describe("audio engine — context and unlock", () => {
  it("creates nothing and loads nothing before unlock", async () => {
    const h = createHarness();
    h.engine.play();
    h.engine.setActiveEra("recording");
    h.engine.preloadEra("recording");
    h.engine.updateFrame(routeFrame(0.1));
    await flush();
    assert.equal(h.contextsCreated(), 0);
    assert.equal(h.fetches.length, 0);
    assert.equal(h.engine.getSnapshot().status, "LOCKED");
    assert.equal(h.engine.getSnapshot().unlocked, false);
  });

  it("refuses to unlock outside a user gesture", () => {
    const h = createHarness();
    h.gesture.active = false;
    assert.equal(h.engine.unlock(), false);
    assert.equal(h.contextsCreated(), 0);
    assert.equal(h.engine.getSnapshot().status, "LOCKED");
    h.gesture.active = true;
    assert.equal(h.engine.unlock(), true);
    assert.equal(h.contextsCreated(), 1);
  });

  it("creates exactly one AudioContext, builds the bus graph and preloads previous / active / next", async () => {
    const h = createHarness();
    h.engine.unlock();
    h.engine.unlock();
    await flush();
    h.engine.setPageVisible(false);
    h.engine.setPageVisible(true);
    h.engine.unlock();
    await flush();
    assert.equal(h.contextsCreated(), 1);
    assert.equal(h.engine.getDebugInfo().contextsCreated, 1);
    assert.equal(h.context.state, "running");
    // master, music, ambient, ui, spatial, dry: spatial + dry → music; music / ambient / ui → master → destination.
    const [master, music, ambient, ui, spatial, dry] = h.context.gains;
    assert.deepEqual(master.outputs, [h.context.destination]);
    for (const bus of [music, ambient, ui]) assert.deepEqual(bus.outputs, [master]);
    for (const bus of [spatial, dry]) assert.deepEqual(bus.outputs, [music]);
    const { spatial: config } = AUDIO_CONFIG;
    assert.deepEqual(h.engine.getDebugInfo().gains, { master: 1, music: 1, ambient: 1, ui: 1, spatial: config.wet, dry: config.dry });
    // Loaded, not played (no intent yet): exactly the three relevant eras, never all eight.
    assert.deepEqual([...h.fetches].sort(), (["global", "roots", "recording"] as EraId[]).map(heroUrl).sort());
    assert.equal(h.engine.getSnapshot().status, "READY");
    assert.equal(h.engine.getSnapshot().loadedTrackId, hero("roots"));
    assert.equal(h.context.trackSources().length, 0, "preloading creates no sources");
    assert.equal(h.engine.selection.get("recording"), hero("recording"), "preloading changes no selection");
  });

  it("plays a one-frame silent buffer inside the gesture (iOS unlock) and cleans it up", () => {
    const h = createHarness();
    h.engine.unlock();
    const primer = h.context.sources[0];
    assert.equal(primer.buffer?.length, 1);
    assert.equal(primer.startCount, 1);
    h.context.advance(0.01);
    assert.deepEqual(primer.outputs, []);
    assert.equal(h.engine.getDebugInfo().liveNodes, BUS_NODES);
  });

  it("enters ERROR without throwing when Web Audio is unavailable", () => {
    const h = createHarness({
      createContext: () => {
        throw new Error("no Web Audio");
      },
    });
    assert.equal(h.engine.unlock(), false);
    assert.equal(h.engine.getSnapshot().status, "ERROR");
    assert.deepEqual(h.engine.getSnapshot().error, { trackId: null, reason: "unsupported" });
    h.engine.setActiveEra("global"); // navigation continues
    h.engine.play();
    h.engine.updateFrame(routeFrame(0.9));
    assert.equal(h.engine.getSnapshot().activeEraId, "global");
  });
});

// ---------------------------------------------------------------------------
// Engine: voices, panners, preloading
// ---------------------------------------------------------------------------

describe("audio engine — voices", () => {
  it("a missing production MP3 fails safely without a tone or repeated fetch", async () => {
    const id = hero("roots");
    const url = "/audio/roots/missing.mp3";
    const h = createHarness({ resolveEntry: (era, track) => track === id ? { ...getAudioEntry(era, track), url } : getAudioEntry(era, track) });
    await startPlayback(h);
    h.engine.updateFrame(routeFrame(layout.stations[0].progress));
    await flush();
    assert.equal(h.engine.getSnapshot().status, "ERROR");
    assert.equal(h.engine.eraVoiceTrack("roots"), null);
    assert.equal(h.fetches.filter((file) => file === url).length, 1);
    assert.ok(!h.fetches.some((file) => file.includes("dev-placeholder")));
    assert.equal(h.contextsCreated(), 1);
  });

  it("each of the eight eras: active plays its hero, previous + next voices exist, the other five have none", async () => {
    for (const era of ERAS) {
      const h = createHarness({ initialEra: era.id });
      await startPlayback(h);
      h.engine.updateFrame(routeFrame(layout.stations[era.index].progress));
      const snapshot = h.engine.getSnapshot();
      assert.equal(snapshot.status, "PLAYING", era.id);
      assert.equal(snapshot.playingTrackId, era.heroTrackId);
      assert.equal(snapshot.selectedKind, "recording");
      assert.equal(snapshot.error, null);
      const voices = liveVoices(h.engine);
      assert.deepEqual(voices.map((voice) => voice.eraId).sort(), neighbourhood(era.id));
      for (const voice of voices) {
        assert.equal(voice.trackId, hero(voice.eraId));
        close(voice.target, voice.role === "active" ? 1 : SPATIAL_MIX_CONFIG.bleed);
      }
      assert.equal(h.fetches.length, 3);
      assert.equal(h.engine.getDebugInfo().liveNodes, BUS_NODES + 3 * VOICE_NODES + 1 /* primer until the clock moves */);
    }
  });

  it("places each panner at its station's platter centre (layout data, set once) and follows the listener", async () => {
    const h = createHarness();
    await startPlayback(h);
    for (const eraId of ["global", "roots", "recording"] as EraId[]) {
      const panner = h.context.panners.find((p) => p.positionX.value === layout.stations[getEra(eraId).index].platter[0]);
      assert.ok(panner, eraId);
      assert.deepEqual([panner.positionX.value, panner.positionY.value, panner.positionZ.value], [...layout.stations[getEra(eraId).index].platter]);
      assert.equal(panner.distanceModel, AUDIO_CONFIG.spatial.distanceModel);
      assert.equal(panner.panningModel, AUDIO_CONFIG.spatial.panningModel);
      assert.equal(panner.refDistance, AUDIO_CONFIG.spatial.refDistance);
      assert.equal(panner.maxDistance, AUDIO_CONFIG.spatial.maxDistance);
      assert.equal(panner.rolloffFactor, AUDIO_CONFIG.spatial.rolloffFactor);
    }
    const frame = routeFrame(0.02);
    frame.forward = [0.6, 0, -0.8];
    h.engine.updateFrame(frame);
    const l = h.context.listener;
    close(l.positionX.value, frame.position[0]);
    close(l.positionZ.value, frame.position[2]);
    close(l.forwardX.value, 0.6);
    close(l.forwardZ.value, -0.8);
    close(l.upY.value, 1);
    const voice = voiceOf(h.engine, "roots");
    const [x, y, z] = layout.stations[0].platter;
    close(voice?.distance ?? NaN, Math.hypot(x - frame.position[0], y - frame.position[1], z - frame.position[2]));
  });

  it("deduplicates the unlock preload and the play request (three fetches, three decodes)", async () => {
    const h = createHarness();
    h.engine.unlock();
    h.engine.play();
    h.engine.play();
    h.engine.preloadEra("roots");
    h.engine.preloadEra("global");
    await flush();
    assert.equal(h.fetches.length, 3);
    assert.equal(h.context.decodes, 3);
    assert.equal(h.context.trackSources().length, 3);
  });

  it("a new voice rises with an AudioParam curve (no JS timers)", async () => {
    const h = createHarness();
    await startPlayback(h);
    const source = sourceOf(h, "roots");
    assert.ok(source);
    const gain = (source.outputs[0] as MockGain).gain;
    const start = source.startedAt;
    assert.equal(gain.valueAt(start), 0);
    assert.ok(gain.valueAt(start + AUDIO_CONFIG.fadeIn) > 0.99);
    assert.ok(source.loop);
  });

  it("stop fades every voice out and stops each source once; play again uses NEW sources (never restarts a stopped one)", async () => {
    const h = createHarness();
    await startPlayback(h);
    const first = h.context.trackSources();
    h.engine.stop();
    assert.equal(h.engine.getSnapshot().status, "READY");
    assert.equal(h.engine.getSnapshot().playingTrackId, null);
    for (const source of first) close(source.stopAt ?? -1, h.context.currentTime + AUDIO_CONFIG.fadeOut + AUDIO_CONFIG.stopMargin);
    h.context.advance(1);
    for (const source of first) {
      assert.equal(source.ended, true);
      assert.deepEqual(source.outputs, [], "ended source disconnected");
    }
    assert.equal(h.engine.getDebugInfo().liveNodes, BUS_NODES);
    h.engine.play();
    assert.equal(h.context.trackSources().length, 6);
    for (const source of first) assert.equal(source.startCount, 1);
    assert.equal(h.fetches.length, 3, "buffers reused, not refetched");
  });

  it("an era change keeps the incoming neighbour's voice (no restart) and swaps only the far neighbour", async () => {
    const h = createHarness();
    await startPlayback(h);
    h.context.advance(2);
    const recording = sourceOf(h, "recording");
    const roots = sourceOf(h, "roots");
    const global = sourceOf(h, "global");
    h.engine.setActiveEra("recording");
    await flush();
    assert.equal(sourceOf(h, "recording"), recording, "RECORDING is the same playback instance");
    assert.equal(recording?.stopAt, null);
    assert.equal(sourceOf(h, "roots"), roots, "ROOTS stays as the previous voice");
    assert.ok(global?.stopAt !== null, "GLOBAL leaves the neighbourhood and fades out");
    assert.ok(sourceOf(h, "highlife"), "HIGH-LIFE joins as the next voice");
    assert.equal(h.engine.getSnapshot().playingTrackId, hero("recording"));
    h.context.advance(1);
    assert.equal(global?.ended, true);
    assert.equal(liveVoices(h.engine).length, 3);
    assert.equal(h.engine.getDebugInfo().liveNodes, BUS_NODES + 3 * VOICE_NODES);
  });

  it("returning to a record that is still fading out continues from its position", async () => {
    const h = createHarness();
    await startPlayback(h);
    h.context.advance(3.2);
    h.engine.setActiveEra("recording");
    await flush();
    h.engine.setActiveEra("highlife"); // ROOTS leaves the neighbourhood and fades
    await flush();
    h.context.advance(0.1);
    h.engine.setActiveEra("recording"); // ROOTS is the previous neighbour again
    await flush();
    const roots = sourceOf(h, "roots");
    close(roots?.offset ?? NaN, 3.3, 1e-9);
  });

  it("keeps the selection per era; another era's record is refused", async () => {
    const rootsOther = getEra("roots").tracks[1].id;
    const h = createHarness({ resolveEntry: withoutAudio(rootsOther) });
    await startPlayback(h);
    assert.equal(h.engine.selectTrack("roots", hero("recording")), false);
    assert.equal(h.engine.getSnapshot().selectedTrackId, hero("roots"));
    // A record of the same era is accepted (it has no audio: unavailable, museum unaffected).
    assert.equal(h.engine.selectTrack("roots", rootsOther), true);
    assert.equal(h.engine.getSnapshot().status, "ERROR");
    assert.deepEqual(h.engine.getSnapshot().error, { trackId: rootsOther, reason: "unavailable" });
    assert.equal(voiceOf(h.engine, "roots"), undefined);
    h.engine.setActiveEra("recording");
    await flush();
    assert.equal(h.engine.getSnapshot().playingTrackId, hero("recording"));
    h.engine.setActiveEra("roots");
    await flush();
    assert.equal(h.engine.getSnapshot().selectedTrackId, rootsOther);
    assert.equal(h.engine.selection.get("recording"), hero("recording"));
    h.engine.selectTrack("roots", hero("roots"));
    assert.equal(h.engine.getSnapshot().playingTrackId, hero("roots"));
  });

  it("preloads the era beyond the neighbour ahead once the visitor leaves the station plateau (both directions)", async () => {
    const forward = createHarness();
    await startPlayback(forward);
    forward.engine.updateFrame(routeFrame(0.0));
    await flush();
    assert.equal(forward.fetches.length, 3);
    forward.engine.updateFrame(routeFrame(0.05)); // ROOTS → RECORDING, past the plateau
    await flush();
    assert.deepEqual(forward.fetches.slice(3), [heroUrl("highlife")]);
    assert.equal(sourceOf(forward, "highlife"), undefined, "preloaded, not playing");

    const backward = createHarness();
    await startPlayback(backward);
    backward.engine.updateFrame(routeFrame(0.95)); // ROOTS ← GLOBAL side, past the plateau
    await flush();
    assert.deepEqual(backward.fetches.slice(3), [heroUrl("afrobeats")]);
  });

  it("caches each era's buffer once across eras", async () => {
    const h = createHarness();
    await startPlayback(h);
    for (const eraId of [...ERA_IDS, ...ERA_IDS]) {
      h.engine.setActiveEra(eraId);
      await flush();
      h.context.advance(1);
    }
    const info = h.engine.getDebugInfo();
    assert.equal(h.fetches.length, 8);
    assert.equal(info.cache.buffers, 8);
    assert.equal(info.cache.bytes, 8 * SECONDS * 48000 * 4);
    assert.equal(info.liveNodes, BUS_NODES + 3 * VOICE_NODES);
  });
});

// ---------------------------------------------------------------------------
// Engine: mix modes and mute
// ---------------------------------------------------------------------------

describe("audio engine — mix modes and mute", () => {
  it("mute ramps the master gain; voices, targets and the spatial mix keep running", async () => {
    const h = createHarness();
    await startPlayback(h);
    const master = h.context.gains[0];
    h.engine.updateFrame(routeFrame(0));
    h.engine.mute();
    const t = h.context.currentTime;
    close(master.gain.valueAt(t + AUDIO_CONFIG.muteRamp / 2), 0.5);
    close(master.gain.valueAt(t + AUDIO_CONFIG.muteRamp), 0);
    // Travel on while muted: the mix still follows the position.
    h.engine.updateFrame(routeFrame((layout.stations[0].progress + layout.stations[1].progress) / 2));
    const midway = voiceOf(h.engine, "recording")?.target ?? 0;
    assert.ok(midway > 0.5, `incoming target while muted ${midway}`);
    assert.equal(h.engine.getSnapshot().status, "PLAYING");
    for (const source of h.context.trackSources()) assert.equal(source.stopAt, null, "muting never stops a source");
    h.context.advance(1);
    h.engine.toggleMute();
    close(master.gain.valueAt(h.context.currentTime + AUDIO_CONFIG.muteRamp), 1);
    assert.equal(voiceOf(h.engine, "recording")?.target, midway, "unmuted into the current mix");
  });

  it("muted before unlock: the graph starts silent", () => {
    const h = createHarness();
    h.engine.mute();
    h.engine.unlock();
    assert.equal(h.context.gains[0].gain.value, 0);
    assert.equal(h.engine.getSnapshot().muted, true);
  });

  it("spatial bypass switches buses only; solo and bleed switches change the semantic targets", async () => {
    const h = createHarness();
    await startPlayback(h);
    h.engine.updateFrame(routeFrame(0));
    const [, , , , spatial, dry] = h.context.gains;
    h.engine.setDebugMix({ spatial: false });
    h.context.advance(0.2);
    close(spatial.gain.value, 0);
    close(dry.gain.value, 1);
    close(voiceOf(h.engine, "recording")?.target ?? NaN, SPATIAL_MIX_CONFIG.bleed);
    h.engine.setDebugMix({ bleed: false });
    close(voiceOf(h.engine, "recording")?.target ?? NaN, 0);
    h.engine.setDebugMix({ bleed: true, soloActive: true });
    close(voiceOf(h.engine, "global")?.target ?? NaN, 0);
    close(voiceOf(h.engine, "roots")?.target ?? NaN, 1);
    h.engine.setDebugMix({ soloActive: false, spatial: true });
    h.engine.setPanningModel("HRTF");
    assert.ok(h.context.panners.every((panner) => panner.panningModel === "HRTF"));
  });
});

// ---------------------------------------------------------------------------
// Engine following the travel position (as the CameraRig + listener bridge feed it)
// ---------------------------------------------------------------------------

const STEP = 1 / 60;

interface Boundary {
  from: EraId;
  to: EraId;
  /** Incoming era's voice id / target on the frame BEFORE the active-era switch. */
  incomingBefore: { id: number; target: number } | null;
  /** Incoming voice id after the switch (must be the same instance). */
  incomingAfterId: number | null;
  /** Outgoing era's target on the frame right after the switch. */
  outgoingAfter: number;
}

/**
 * Travels from `from` to `to` (absolute progress) at `speed` m/s. The active era is chosen as the
 * CameraRig does (selectActiveStation + hysteresis) and fed to the engine like the active-era
 * store; every frame the engine gets the listener frame. Checks the voice invariants per frame.
 */
async function travel(h: Harness, from: number, to: number, speed = 5, onFrame?: () => void) {
  const direction = Math.sign(to - from);
  const step = (speed * STEP) / layout.length;
  const frame = routeFrame(from);
  let station = selectActiveStation(frame.loopProgress, -1, layout.stations, TRAVEL_CONFIG.activeEraHysteresis);
  h.engine.setActiveEra(layout.stations[station].eraId);
  await flush();
  const played: string[] = [h.engine.getSnapshot().playingTrackId ?? "—"];
  const boundaries: Boundary[] = [];
  for (let progress = from; direction > 0 ? progress < to : progress > to; progress += direction * step) {
    routeFrame(progress, 0, -1, frame);
    const next = selectActiveStation(frame.loopProgress, station, layout.stations, TRAVEL_CONFIG.activeEraHysteresis);
    if (next !== station) {
      const outgoing = layout.stations[station].eraId;
      const incoming = layout.stations[next].eraId;
      const before = voiceOf(h.engine, incoming);
      station = next;
      h.engine.setActiveEra(incoming);
      h.engine.updateFrame(frame);
      await flush();
      played.push(h.engine.getSnapshot().playingTrackId ?? "—");
      boundaries.push({
        from: outgoing,
        to: incoming,
        incomingBefore: before ? { id: before.id, target: before.target } : null,
        incomingAfterId: voiceOf(h.engine, incoming)?.id ?? null,
        outgoingAfter: voiceOf(h.engine, outgoing)?.target ?? 0,
      });
    } else h.engine.updateFrame(frame);
    onFrame?.();
    h.context.advance(STEP);
    if (Math.round(progress / step) % 10 === 0) {
      const voices = liveVoices(h.engine);
      assert.ok(voices.length <= 3, `${voices.length} live voices`);
      for (const voice of voices) assert.notEqual(roleOf(getEra(voice.eraId).index, station), null, `${voice.eraId} live while ${layout.stations[station].eraId} is active`);
    }
  }
  h.context.advance(1);
  return { played, boundaries };
}

/** Every boundary: the incoming era was already audible, kept its voice, and the outgoing one fades rather than cuts. */
function assertSeamless(boundaries: Boundary[]) {
  for (const b of boundaries) {
    const label = `${b.from} → ${b.to}`;
    assert.ok(b.incomingBefore, `${label}: incoming voice missing before activation`);
    assert.ok(b.incomingBefore.target > 0.5, `${label}: incoming target ${b.incomingBefore.target} before activation`);
    assert.equal(b.incomingAfterId, b.incomingBefore.id, `${label}: incoming voice restarted at activation`);
    assert.ok(b.outgoingAfter > 0.5, `${label}: outgoing target ${b.outgoingAfter} right after the switch`);
  }
}

describe("audio engine — travel along the loop", () => {
  const global = getEra("global").index;

  it("GLOBAL → ROOTS forward across the seam: ROOTS rises first, same voice, GLOBAL fades behind", async () => {
    const h = createHarness({ initialEra: "global" });
    await startPlayback(h);
    const { played, boundaries } = await travel(h, layout.stations[global].progress, 1 + layout.stations[0].progress + 0.01);
    assert.deepEqual(played, [hero("global"), hero("roots")]);
    assertSeamless(boundaries);
    assert.equal(h.engine.getSnapshot().activeEraId, "roots");
    assert.deepEqual(liveVoices(h.engine).map((voice) => voice.eraId).sort(), neighbourhood("roots"));
  });

  it("ROOTS → GLOBAL backward across the seam", async () => {
    const h = createHarness({ initialEra: "roots" });
    await startPlayback(h);
    const { played, boundaries } = await travel(h, 1, layout.stations[global].progress - 0.01);
    assert.deepEqual(played, [hero("roots"), hero("global")]);
    assertSeamless(boundaries);
    assert.equal(h.engine.getSnapshot().playingTrackId, hero("global"));
  });

  it("three laps forward then two back: every boundary seamless, each file fetched once, nothing leaks", async () => {
    const h = createHarness();
    await startPlayback(h);
    const forward = await travel(h, 0, 3, 6);
    const order = ERA_IDS.map(hero);
    assert.deepEqual(forward.played, [...order, ...order, ...order, order[0]]);
    assertSeamless(forward.boundaries);
    const backward = await travel(h, 3, 1, 6);
    assert.deepEqual(backward.played, [order[0], ...[...order].reverse(), ...[...order].reverse()]);
    assertSeamless(backward.boundaries);
    const info = h.engine.getDebugInfo();
    assert.equal(h.fetches.length, 8);
    assert.equal(info.cache.buffers, 8);
    assert.equal(liveVoices(h.engine).length, 3);
    assert.equal(info.voices.length, 3, "fading voices released");
    assert.equal(info.liveNodes, BUS_NODES + 3 * VOICE_NODES);
    // One new voice per boundary (the far neighbour joining), plus the first three.
    assert.equal(info.sourcesCreated, 3 + forward.boundaries.length + backward.boundaries.length);
    const ended = h.context.trackSources().filter((source) => source.ended);
    assert.equal(ended.length, info.sourcesCreated - 3);
    for (const source of ended) assert.deepEqual(source.outputs, []);
  });
});

// ---------------------------------------------------------------------------
// Focus mode: same voices, neighbours pulled out
// ---------------------------------------------------------------------------

describe("audio engine — focus mode", () => {
  /** One frame as the CameraRig + listener bridge run it. */
  const frame = (h: Harness, focus: FocusController, travelController: TravelController, state: { station: number; frame: AudioFrame }) => {
    focus.step(STEP, travelController);
    travelController.step(STEP, 0);
    const next = selectActiveStation(travelController.loopProgress, state.station, layout.stations, TRAVEL_CONFIG.activeEraHysteresis);
    if (next !== state.station) {
      state.station = next;
      h.engine.setActiveEra(layout.stations[next].eraId);
    }
    travelController.setTelemetry(0, -1, state.station);
    routeFrame(travelController.loopProgress, focus.mode === "TRAVEL" ? 0 : focus.easedProgress, focus.station, state.frame);
    h.engine.updateFrame(state.frame);
    h.context.advance(STEP);
  };
  const run = (h: Harness, focus: FocusController, travelController: TravelController, state: { station: number; frame: AudioFrame }, seconds: number) => {
    for (let i = 0; i < seconds * 60; i++) frame(h, focus, travelController, state);
  };

  it("enter / exit / interrupt never restarts or changes the voices; focus pulls neighbours out and exit restores the mix", async () => {
    const h = createHarness();
    const start = 1 + layout.stations[0].progress + 0.02; // inside ROOTS, neighbours audible
    const travelController = new TravelController(resolveTravelConfig(false), layout.length, start);
    const focus = new FocusController();
    const state = { station: -1, frame: routeFrame(start) };
    frame(h, focus, travelController, state);
    await startPlayback(h);
    run(h, focus, travelController, state, 1);
    const sources = [...h.context.trackSources()];
    const travelMix = Object.fromEntries(liveVoices(h.engine).map((voice) => [voice.eraId, voice.target]));
    assert.equal(travelMix.roots, 1);
    assert.ok(travelMix.recording > 0 && travelMix.global > 0);

    assert.equal(focus.requestFocus(state.station, state.station, travelController), true);
    run(h, focus, travelController, state, 2);
    assert.equal(focus.mode, "FOCUS");
    assert.equal(voiceOf(h.engine, "roots")?.target, 1);
    assert.equal(voiceOf(h.engine, "recording")?.target, 0);
    assert.equal(voiceOf(h.engine, "global")?.target, 0);
    h.engine.mute(); // muted in focus
    focus.requestExit();
    run(h, focus, travelController, state, 2);
    assert.equal(focus.mode, "TRAVEL");
    assert.equal(h.engine.getSnapshot().muted, true, "focus never touches mute");
    for (const voice of liveVoices(h.engine)) close(voice.target, travelMix[voice.eraId], 1e-3);
    h.engine.unmute();

    focus.requestFocus(state.station, state.station, travelController); // Enter → Escape immediately
    run(h, focus, travelController, state, 0.1);
    focus.requestExit();
    run(h, focus, travelController, state, 2);

    assert.equal(h.engine.getSnapshot().playingTrackId, hero("roots"));
    assert.equal(h.engine.getSnapshot().status, "PLAYING");
    assert.deepEqual(h.context.trackSources(), sources, "no new source");
    for (const source of sources) assert.equal(source.stopAt, null, "never stopped");
  });
});

// ---------------------------------------------------------------------------
// Visibility, suspension and failures
// ---------------------------------------------------------------------------

describe("audio engine — suspension", () => {
  it("suspends while hidden and resumes the same three voices when visible", async () => {
    const h = createHarness();
    await startPlayback(h);
    const sources = [...h.context.trackSources()];
    h.engine.setPageVisible(false);
    await flush();
    assert.equal(h.context.state, "suspended");
    assert.equal(h.engine.getSnapshot().status, "SUSPENDED");
    h.engine.updateFrame(routeFrame(0.02)); // frames while suspended: no duplicates
    h.engine.setPageVisible(true);
    await flush();
    assert.equal(h.context.state, "running");
    assert.equal(h.engine.getSnapshot().status, "PLAYING");
    assert.equal(h.contextsCreated(), 1);
    assert.deepEqual(h.context.trackSources(), sources, "the same voices continue");
  });

  it("stays SUSPENDED when the browser refuses to resume, until the next gesture", async () => {
    const h = createHarness();
    await startPlayback(h);
    h.engine.setPageVisible(false);
    h.context.refuseResume = true;
    h.engine.setPageVisible(true);
    await flush();
    assert.equal(h.engine.getSnapshot().status, "SUSPENDED");
    assert.equal(h.engine.unlock(), true); // RESUME SOUND click
    await flush();
    assert.equal(h.engine.getSnapshot().status, "PLAYING");
    assert.equal(h.contextsCreated(), 1);
  });

  it("follows a browser / OS suspension (e.g. Safari 'interrupted')", async () => {
    const h = createHarness();
    await startPlayback(h);
    h.context.setState("interrupted");
    assert.equal(h.engine.getSnapshot().status, "SUSPENDED");
    h.engine.unlock();
    await flush();
    assert.equal(h.engine.getSnapshot().status, "PLAYING");
  });

  it("a closed context ends audio cleanly without creating another", async () => {
    const h = createHarness();
    await startPlayback(h);
    h.context.setState("closed");
    assert.equal(h.engine.getSnapshot().status, "ERROR");
    assert.equal(h.engine.unlock(), false);
    h.engine.updateFrame(routeFrame(0.1));
    assert.equal(h.contextsCreated(), 1);
    assert.equal(h.engine.getDebugInfo().voices.length, 0);
  });
});

describe("audio engine — failures", () => {
  const failing =
    (eraId: EraId, marker: "missing" | "corrupt") =>
    (era: EraId, trackId: string): AudioTrackEntry => {
      const entry = getAudioEntry(era, trackId);
      return era === eraId && entry.url ? { ...entry, url: `/audio/${era}/${marker}.wav` } : entry;
    };

  it("a broken NEXT era never disturbs the active music; entering it leaves that station silent, neighbours at their normal level", async () => {
    const h = createHarness({ resolveEntry: failing("recording", "missing") });
    await startPlayback(h);
    h.engine.updateFrame(routeFrame(0));
    assert.equal(h.engine.getSnapshot().status, "PLAYING");
    assert.equal(h.engine.getSnapshot().playingTrackId, hero("roots"));
    assert.equal(voiceOf(h.engine, "recording"), undefined);
    // Enter RECORDING: unavailable, no compensation from ROOTS / HIGH-LIFE.
    h.engine.setActiveEra("recording");
    h.engine.updateFrame(routeFrame(layout.stations[1].progress));
    await flush();
    const snapshot = h.engine.getSnapshot();
    assert.equal(snapshot.status, "ERROR");
    assert.deepEqual(snapshot.error, { trackId: hero("recording"), reason: "network" });
    assert.equal(snapshot.playingTrackId, null);
    for (const voice of liveVoices(h.engine)) assert.ok(voice.target <= SPATIAL_MIX_CONFIG.bleed + 1e-9, `${voice.eraId} at ${voice.target}`);
    assert.equal(h.fetches.filter((url) => url.includes("missing")).length, 1, "remembered, not refetched");
    // Moving on: HIGH-LIFE plays normally.
    h.engine.setActiveEra("highlife");
    await flush();
    assert.equal(h.engine.getSnapshot().status, "PLAYING");
    // An explicit play while at the broken era retries once.
    h.engine.setActiveEra("recording");
    h.engine.play();
    await flush();
    assert.equal(h.fetches.filter((url) => url.includes("missing")).length, 2);
  });

  it("an undecodable file is a decode error", async () => {
    const h = createHarness({ resolveEntry: failing("explosion", "corrupt"), initialEra: "explosion" });
    await startPlayback(h);
    assert.deepEqual(h.engine.getSnapshot().error, { trackId: hero("explosion"), reason: "decode" });
    assert.equal(h.engine.getSnapshot().status, "ERROR");
  });

  it("a load that finishes after the visitor moved on joins only as a neighbour", async () => {
    let release: () => void = () => {};
    const h = createHarness({
      fetchAudio: (url) =>
        url.includes("/roots/") ? new Promise<ArrayBuffer>((resolve) => (release = () => resolve(new ArrayBuffer(64)))) : Promise.resolve(new ArrayBuffer(64)),
    });
    await startPlayback(h);
    assert.equal(h.engine.getSnapshot().status, "LOADING");
    h.engine.setActiveEra("recording");
    await flush();
    release();
    await flush();
    assert.equal(h.engine.getSnapshot().playingTrackId, hero("recording"));
    assert.equal(voiceOf(h.engine, "roots")?.role, "previous");
    assert.equal(liveVoices(h.engine).length, 3);
  });
});

// ---------------------------------------------------------------------------
// Production audio: streamed recordings (docs/PRODUCTION_AUDIO.md)
// ---------------------------------------------------------------------------

describe("production audio — streamed recordings", () => {
  const MAX = AUDIO_CONFIG.maxMediaElements;

  it("every production archive recording streams; only development tones decode", () => {
    assert.equal(ARCHIVE_ENTRIES.length, 40);
    for (const track of ARCHIVE_ENTRIES) {
      const entry = resolveAudioEntry(track);
      assert.equal(entry.kind, "recording", track.id);
      assert.equal(audioSourceStrategy(entry.kind), "stream", track.id);
    }
    for (const era of ERAS) for (const track of era.tracks.filter(isDevFixture)) assert.equal(audioSourceStrategy(getAudioEntry(era.id, track.id).kind), "buffer");
    assert.equal(audioSourceStrategy("recording", true), "buffer", "only the engine-mechanics test switch decodes a recording");
  });

  it("one AudioContext; the bounded pool is created and primed inside the unlock gesture, each element wired once", async () => {
    const h = createStreamingHarness();
    await startPlayback(h);
    h.engine.unlock(); // later gestures create nothing
    h.engine.setPageVisible(false);
    h.engine.setPageVisible(true);
    await flush();
    assert.equal(h.contextsCreated(), 1);
    assert.equal(h.engine.getDebugInfo().contextsCreated, 1);
    assert.equal(h.elements.length, MAX);
    assert.deepEqual(
      h.context.mediaNodes.map((node) => node.element),
      h.elements,
      "one MediaElementAudioSourceNode per element, all on THE context",
    );
    for (const element of h.elements) assert.ok(element.plays >= 1, "started once inside the gesture (WebKit playback permission)");
    assert.equal(h.engine.getSnapshot().status, "PLAYING");
  });

  it("a stream enters the existing chain: media node → voice gain → panner → spatial, + dry → music → master", async () => {
    const h = createStreamingHarness();
    await startPlayback(h);
    assert.equal(h.context.mediaNodes.filter((media) => media.outputs.length).length, 3);
    for (const node of h.context.mediaNodes.filter((media) => media.outputs.length)) {
      const gain = node.outputs[0] as MockGain;
      const clock = h.context.sources.find((source) => source.outputs[0] === gain);
      assert.equal(gain.gain.valueAt(clock?.startedAt ?? NaN), 0, "a stream voice rises from silence");
    }
    h.context.advance(0.01); // the unlock primer ends
    h.engine.updateFrame(routeFrame(layout.stations[0].progress));
    const [master, music, , , spatial, dry] = h.context.gains;
    for (const eraId of ["roots", "recording", "global"] as EraId[]) {
      const element = streamOf(h, eraId);
      assert.ok(element, eraId);
      assert.equal(element.src, heroUrl(eraId));
      assert.equal(element.preload, "auto");
      assert.equal(element.paused, false);
      const node = mediaNodeOf(h, element);
      assert.equal(node?.outputs.length, 1);
      const gain = node?.outputs[0] as MockGain;
      const panner = gain.outputs.find((next): next is MockPanner => next instanceof MockPanner);
      assert.ok(panner && gain.outputs.includes(dry));
      assert.deepEqual(panner.outputs, [spatial]);
      assert.deepEqual([panner.positionX.value, panner.positionY.value, panner.positionZ.value], [...layout.stations[getEra(eraId).index].platter]);
      close(voiceOf(h.engine, eraId)?.target ?? NaN, eraId === "roots" ? 1 : SPATIAL_MIX_CONFIG.bleed);
    }
    for (const bus of [spatial, dry]) assert.deepEqual(bus.outputs, [music]);
    assert.deepEqual(music.outputs, [master]);
    assert.deepEqual(master.outputs, [h.context.destination]);
    assert.equal(h.context.decodes, 0, "no recording decoded");
    assert.deepEqual(h.fetches, [], "no recording fetched whole");
    assert.equal(h.context.trackSources().length, 0, "no decoded track source");
    assert.equal(h.engine.getDebugInfo().liveNodes, BUS_NODES + 3 * VOICE_NODES);
  });

  it("the long recording (Ja Funmi, 67 min) streams: never fetched whole, never decoded, plays and advances", async () => {
    const h = createStreamingHarness({ initialEra: "explosion", resolveEntry: asRecording("explosion", 1, JA_FUNMI) });
    await startPlayback(h);
    const jaFunmi = getEra("explosion").tracks[1].id;
    assert.equal(h.engine.selectTrack("explosion", jaFunmi), true);
    await flush();
    assert.equal(h.engine.getSnapshot().status, "PLAYING");
    assert.equal(h.engine.getSnapshot().playingTrackId, jaFunmi);
    const element = streamOf(h, "explosion");
    assert.equal(element?.src, JA_FUNMI);
    h.context.advance(30);
    close(element?.currentTime ?? NaN, 30);
    const info = h.engine.getDebugInfo();
    assert.equal(h.context.decodes, 0);
    assert.deepEqual(h.fetches, []);
    assert.deepEqual([info.cache.buffers, info.cache.bytes, info.cache.requests], [0, 0, 0], "no decoded audio held at all");
    assert.ok(info.streams && info.streams.prepared <= MAX && info.streams.owned === 3);
    assert.ok(!h.elements.some((other) => other !== element && other.src === heroUrl("explosion")), "the replaced hero's element was released");
  });

  it("development tones stay decoded buffers (deterministic) beside streamed neighbours", async () => {
    const h = createStreamingHarness();
    await startPlayback(h);
    const tone = getEra("roots").tracks[1].id;
    h.engine.selectTrack("roots", tone);
    await flush();
    h.context.advance(1);
    const source = sourceOf(h, "roots");
    assert.ok(source);
    assert.equal(source.buffer?.length, SECONDS * 48000);
    assert.ok(source.loop);
    assert.deepEqual(h.fetches, [getAudioEntry("roots", tone).url]);
    assert.equal(h.context.decodes, 1);
    assert.equal(streamOf(h, "roots"), undefined);
    assert.ok(streamOf(h, "recording") && streamOf(h, "global"), "the neighbours still stream");
    assert.ok(!h.elements.some((element) => element.src === heroUrl("roots")), "the hero's element was released after its fade");
    assert.equal(h.engine.getSnapshot().playingTrackId, tone);
  });

  it("a retired stream releases its element: paused, source detached, node disconnected — then reused", async () => {
    const h = createStreamingHarness();
    await startPlayback(h);
    h.context.advance(1);
    const global = streamOf(h, "global");
    assert.ok(global);
    const node = mediaNodeOf(h, global);
    h.engine.setActiveEra("recording"); // GLOBAL leaves the neighbourhood, HIGH-LIFE joins
    await flush();
    assert.equal(streamOf(h, "global"), undefined);
    assert.equal(global.paused, false, "still playing while it fades out");
    h.context.advance(1);
    await flush();
    assert.equal(global.paused, true);
    assert.equal(global.src, "");
    assert.deepEqual(node?.outputs, []);
    assert.ok(streamOf(h, "highlife"));
    const info = h.engine.getDebugInfo();
    assert.equal(info.voices.length, 3);
    assert.equal(info.streams?.owned, 3);
    assert.equal(info.liveNodes, BUS_NODES + 3 * VOICE_NODES);
    assert.equal(h.elements.length, MAX, "elements are reused, never added");
  });

  it("returning to a stream that is still fading out continues it: same element, same position, no reload", async () => {
    const h = createStreamingHarness();
    await startPlayback(h);
    h.context.advance(3.2);
    h.engine.setActiveEra("recording");
    await flush();
    const roots = streamOf(h, "roots");
    assert.ok(roots);
    const loads = roots.loads;
    h.engine.setActiveEra("highlife"); // ROOTS leaves the neighbourhood and fades
    await flush();
    h.context.advance(0.1);
    assert.equal(streamOf(h, "roots"), undefined);
    h.engine.setActiveEra("recording"); // ROOTS is the previous neighbour again
    await flush();
    assert.equal(streamOf(h, "roots"), roots);
    assert.equal(roots.loads, loads);
    close(roots.currentTime, 3.3, 1e-9);
    h.context.advance(1);
    assert.equal(streamOf(h, "roots"), roots, "its old scheduled stop no longer ends it");
    assert.equal(roots.paused, false);
    assert.equal(h.engine.getDebugInfo().liveNodes, BUS_NODES + 3 * VOICE_NODES);
  });

  it("an exhausted pool never grows: rapid moves end the oldest fading stream early to make room", async () => {
    const h = createStreamingHarness({ config: { maxMediaElements: 4 } });
    await startPlayback(h);
    h.engine.setActiveEra("recording"); // GLOBAL fades, HIGH-LIFE takes the last free element
    await flush();
    h.engine.setActiveEra("highlife"); // ROOTS fades too; EXPLOSION finds every element owned
    await flush();
    assert.equal(streamOf(h, "explosion"), undefined, "waiting for an element");
    h.context.advance(0.1); // the oldest fading stream (GLOBAL) ends early
    await flush();
    assert.ok(streamOf(h, "explosion"), "placed once an element was free");
    h.context.advance(1);
    await flush();
    assert.equal(h.elements.length, 4);
    assert.deepEqual(liveVoices(h.engine).map((voice) => voice.eraId).sort(), neighbourhood("highlife"));
    assert.equal(h.engine.getDebugInfo().liveNodes, BUS_NODES + 3 * VOICE_NODES);
  });

  it("three laps and back: the working set never exceeds the pool, every boundary seamless, nothing leaks", async () => {
    const h = createStreamingHarness();
    await startPlayback(h);
    let peakPrepared = 0;
    let peakOwned = 0;
    const sample = () => {
      const streams = h.engine.getDebugInfo().streams;
      peakPrepared = Math.max(peakPrepared, streams?.prepared ?? 0);
      peakOwned = Math.max(peakOwned, streams?.owned ?? 0);
    };
    const order = ERA_IDS.map(hero);
    const forward = await travel(h, 0, 3, 6, sample);
    assert.deepEqual(forward.played, [...order, ...order, ...order, order[0]]);
    assertSeamless(forward.boundaries);
    const backward = await travel(h, 3, 1, 6, sample);
    assertSeamless(backward.boundaries);
    await flush();
    const info = h.engine.getDebugInfo();
    assert.equal(h.elements.length, MAX);
    assert.ok(peakPrepared <= MAX && peakOwned <= MAX, `peak ${peakPrepared} prepared / ${peakOwned} owned`);
    assert.equal(info.voices.length, 3, "fading voices released");
    assert.equal(info.streams?.owned, 3);
    assert.ok((info.streams?.prepared ?? 0) <= 4, "the three voices + at most the lookahead");
    assert.equal(info.liveNodes, BUS_NODES + 3 * VOICE_NODES);
    for (const element of h.elements) if (!liveVoices(h.engine).some((voice) => element.src === heroUrl(voice.eraId))) assert.equal(element.paused, true);
    assert.equal(h.context.decodes, 0);
    assert.deepEqual(h.fetches, []);
  });

  it("GLOBAL ↔ ROOTS: ROOTS rises on its own element before the switch and keeps it (no restart, no reload)", async () => {
    const h = createStreamingHarness({ initialEra: "global" });
    await startPlayback(h);
    const global = getEra("global").index;
    const roots = streamOf(h, "roots");
    assert.ok(roots);
    const loads = roots.loads;
    const { played, boundaries } = await travel(h, layout.stations[global].progress, 1 + layout.stations[0].progress + 0.01);
    assert.deepEqual(played, [hero("global"), hero("roots")]);
    assertSeamless(boundaries);
    assert.equal(streamOf(h, "roots"), roots, "the same element plays on across the seam");
    assert.equal(roots.loads, loads, "never reloaded");
    assert.ok(roots.currentTime > 1);
    const back = await travel(h, 1 + layout.stations[0].progress + 0.01, layout.stations[global].progress - 0.01);
    assert.equal(back.played.at(-1), hero("global"));
    assertSeamless(back.boundaries);
    assert.equal(streamOf(h, "global")?.src, heroUrl("global"));
  });

  it("mute is state-safe: elements keep playing, nothing reloads, the position carries on", async () => {
    const h = createStreamingHarness();
    await startPlayback(h);
    h.context.advance(5);
    const element = streamOf(h, "roots");
    assert.ok(element);
    const loads = h.elements.map((e) => e.loads);
    const before = element.currentTime;
    const master = h.context.gains[0];
    h.engine.mute();
    h.context.advance(3);
    close(master.gain.value, 0);
    assert.equal(element.paused, false, "muting never pauses a stream");
    h.engine.unmute();
    h.context.advance(1);
    close(master.gain.value, 1);
    assert.equal(streamOf(h, "roots"), element);
    close(element.currentTime, before + 4);
    assert.deepEqual(
      h.elements.map((e) => e.loads),
      loads,
      "no element reloaded",
    );
  });

  it("a hidden page pauses the streams with the context; visible again resumes them where they were", async () => {
    const h = createStreamingHarness();
    await startPlayback(h);
    h.context.advance(2);
    const playing = h.elements.filter((element) => !element.paused);
    assert.equal(playing.length, 3);
    const loads = playing.map((element) => element.loads);
    h.engine.setPageVisible(false);
    await flush();
    assert.ok(playing.every((element) => element.paused));
    h.engine.setPageVisible(true);
    await flush();
    assert.equal(h.engine.getSnapshot().status, "PLAYING");
    assert.ok(playing.every((element) => !element.paused));
    for (const element of playing) close(element.currentTime, 2);
    assert.deepEqual(
      playing.map((element) => element.loads),
      loads,
    );
  });

  it("a missing streamed recording fails safely: ERROR, no tone, no fetch, element freed, neighbours play; play() retries once", async () => {
    const url = "/audio/roots/missing.mp3";
    const h = createStreamingHarness({ resolveEntry: (era, track) => (track === hero("roots") ? { ...getAudioEntry(era, track), url } : getAudioEntry(era, track)) });
    await startPlayback(h);
    const snapshot = h.engine.getSnapshot();
    assert.equal(snapshot.status, "ERROR");
    assert.deepEqual(snapshot.error, { trackId: hero("roots"), reason: "network" });
    assert.equal(h.engine.eraVoiceTrack("roots"), null);
    assert.equal(h.engine.isEraPlaying("roots"), false);
    assert.ok(!h.elements.some((element) => element.src === url), "the failed element was released");
    assert.ok(streamOf(h, "recording") && streamOf(h, "global"));
    assert.deepEqual(h.fetches, []);
    const attempts = () => h.elements.flatMap((element) => element.history).filter((src) => src === url).length;
    assert.equal(attempts(), 1);
    h.engine.setActiveEra("recording");
    await flush();
    h.engine.setActiveEra("roots");
    await flush();
    assert.equal(attempts(), 1, "remembered, not retried by travel");
    assert.equal(h.engine.getSnapshot().playingTrackId, null);
    h.engine.play();
    await flush();
    assert.equal(attempts(), 2, "an explicit play retries once");
    assert.equal(h.engine.getSnapshot().status, "ERROR");
    assert.equal(h.contextsCreated(), 1);
  });
});

// ---------------------------------------------------------------------------
// Platter motion through the semantic bridge (engine.isEraPlaying)
// ---------------------------------------------------------------------------

describe("platter motion — semantic audio bridge", () => {
  const RPM = PLATTER_MOTION_CONFIG.rpm;
  const TAU = Math.PI * 2;
  const MAX_STEP = (RPM / 60) * TAU * STEP + 1e-9;
  const stepAngle = (from: number, to: number) => {
    let d = (to - from) % TAU;
    if (d > Math.PI) d -= TAU;
    if (d < -Math.PI) d += TAU;
    return d;
  };
  const decks = (h: Harness) => {
    const system = new PlatterMotionSystem(ERAS.length);
    const isPlaying = (index: number) => h.engine.isEraPlaying(ERAS[index].id);
    return {
      system,
      isPlaying,
      rpm: (eraId: EraId) => system.states[getEra(eraId).index].currentRpm,
      /** Visual frames (the platter driver) with the audio clock advancing alongside. */
      run: (seconds: number) => {
        for (let i = 0; i < Math.round(seconds * 60); i++) {
          system.update(STEP, isPlaying);
          h.context.advance(STEP);
        }
      },
    };
  };

  it("locked: every platter at rest; unlock + play: the active deck and its live neighbours spin up", async () => {
    const h = createHarness();
    const d = decks(h);
    h.engine.play(); // intent before unlock plays nothing
    d.run(2);
    for (const state of d.system.states) assert.equal(state.currentRpm, 0);
    await startPlayback(h);
    h.engine.updateFrame(routeFrame(0));
    d.run(0.5);
    assert.ok(d.rpm("roots") > 0.3 * RPM && d.rpm("roots") < RPM, "spinning up, not jumping");
    d.run(1.5);
    for (const eraId of ["global", "roots", "recording"] as EraId[]) close(d.rpm(eraId), RPM, 0.01);
    for (const eraId of ["highlife", "explosion", "transition", "naija", "afrobeats"] as EraId[]) assert.equal(d.rpm(eraId), 0);
  });

  it("muted ≠ stopped: mute keeps every deck at speed; a suspended context stops them; resume spins up again", async () => {
    const h = createHarness();
    const d = decks(h);
    await startPlayback(h);
    d.run(2);
    h.engine.mute();
    d.run(1);
    close(d.rpm("roots"), RPM, 0.01);
    assert.equal(h.engine.isEraPlaying("roots"), true);
    h.engine.unmute();
    h.engine.setPageVisible(false);
    await flush();
    assert.equal(h.engine.isEraPlaying("roots"), false);
    d.run(2);
    assert.equal(d.rpm("roots"), 0);
    h.engine.setPageVisible(true);
    await flush();
    d.run(2);
    close(d.rpm("roots"), RPM, 0.01);
  });

  it("an unavailable or failed record never spins; dev STOP spins every deck down", async () => {
    const noAudio = withoutAudio(getEra("roots").tracks[1].id);
    const h = createHarness({
      resolveEntry: (era, trackId) => {
        const entry = noAudio(era, trackId);
        return era === "recording" && entry.url ? { ...entry, url: "/audio/recording/missing.wav" } : entry;
      },
    });
    const d = decks(h);
    await startPlayback(h);
    d.run(2);
    assert.equal(d.rpm("recording"), 0, "failed neighbour stays stopped");
    close(d.rpm("roots"), RPM, 0.01);
    h.engine.setActiveEra("recording");
    await flush();
    d.run(2);
    assert.equal(h.engine.getSnapshot().status, "ERROR");
    assert.equal(d.rpm("recording"), 0, "the broken station never pretends to play");
    h.engine.selectTrack("roots", getEra("roots").tracks[1].id); // a record without audio
    d.run(2);
    assert.equal(d.rpm("roots"), 0);
    h.engine.stop();
    d.run(2);
    for (const state of d.system.states) assert.equal(state.currentRpm, 0);
  });

  it("focus enter / exit / interrupt leaves the deck untouched (same RPM, continuous angle)", async () => {
    const h = createHarness();
    const d = decks(h);
    const start = 1 + layout.stations[0].progress;
    const travelController = new TravelController(resolveTravelConfig(false), layout.length, start);
    const focus = new FocusController();
    await startPlayback(h);
    d.run(3);
    const roots = d.system.states[0];
    let last = roots.angle;
    const frame = () => {
      focus.step(STEP, travelController);
      travelController.step(STEP, 0);
      travelController.setTelemetry(0, -1, 0);
      h.engine.updateFrame(routeFrame(travelController.loopProgress, focus.mode === "TRAVEL" ? 0 : focus.easedProgress, focus.station));
      d.run(STEP);
      close(roots.currentRpm, RPM, 0.01);
      close(stepAngle(last, roots.angle), -MAX_STEP, 1e-3);
      last = roots.angle;
    };
    focus.requestFocus(0, 0, travelController);
    for (let i = 0; i < 120; i++) frame();
    assert.equal(focus.mode, "FOCUS");
    focus.requestExit();
    for (let i = 0; i < 120; i++) frame();
    focus.requestFocus(0, 0, travelController);
    for (let i = 0; i < 6; i++) frame();
    focus.requestExit();
    for (let i = 0; i < 120; i++) frame();
    assert.equal(focus.mode, "TRAVEL");
  });

  for (const [label, from, to] of [
    ["forward lap from ROOTS through GLOBAL → ROOTS", 0, 1.06],
    ["backward lap from ROOTS through ROOTS → GLOBAL", 1, -0.07],
  ] as const) {
    it(`${label}: the incoming deck is already at speed and never reset; retired decks stop`, async () => {
      const h = createHarness();
      const d = decks(h);
      await startPlayback(h);
      d.run(2);
      const last = d.system.states.map((state) => state.angle);
      let active = h.engine.getSnapshot().activeEraId;
      let boundaries = 0;
      await travel(h, from, to, 6, () => {
        d.system.update(STEP, d.isPlaying);
        const now = h.engine.getSnapshot().activeEraId;
        if (now !== active) {
          boundaries++;
          assert.ok(d.rpm(now) > 0.98 * RPM, `${now} at ${d.rpm(now)} RPM when it became active`);
          active = now;
        }
        d.system.states.forEach((state, i) => {
          const step = stepAngle(last[i], state.angle);
          assert.ok(step <= 1e-12 && step >= -MAX_STEP, `era ${i}: angle step ${step}`); // clockwise, never a reset jump
          last[i] = state.angle;
          if (roleOf(i, getEra(now).index) === null && state.currentRpm > 0) assert.equal(state.targetRpm, 0, `distant era ${i} still targeted`);
        });
      });
      assert.equal(boundaries, 9);
      // After coasting to a stop: exactly the three neighbourhood decks spin, the rest are at rest.
      d.run(3);
      const spinning = ERAS.filter((era) => d.rpm(era.id) > 0).map((era) => era.id).sort();
      assert.deepEqual(spinning, neighbourhood(h.engine.getSnapshot().activeEraId));
    });
  }
});

// ---------------------------------------------------------------------------
// Record change through the REAL engine (hold / prepare / select / release)
// ---------------------------------------------------------------------------

describe("record change — real audio engine", () => {
  const POSES = resolveTonearmPoses(
    { restSwing: 0, leadInSwing: -0.3318, runOutSwing: -0.735, restLift: 0, playLift: 0.0227, raisedLift: -0.0295 },
    { tipY: -0.0119424984, tipZ: 0.2300315015, surfaceY: 0.1013 + 0.001479117781855166 - 0.1199034974 },
  );

  /** The deck as MuseumCanvas wires it, driven frame by frame with the mock audio clock. */
  function deckOn(h: Harness, era: EraId) {
    const platters = new PlatterMotionSystem(ERAS.length);
    const tonearms = new TonearmMotionSystem(ERAS.length);
    for (let i = 0; i < ERAS.length; i++) tonearms.register(i, POSES);
    const focus = { mode: "FOCUS" as const, exits: 0 };
    let active = era;
    const activeIndex = () => getEra(active).index;
    const e = h.engine;
    const controller = new RecordChangeController({
      audio: {
        unlocked: () => e.getSnapshot().unlocked,
        playbackWanted: () => e.isPlaybackWanted(),
        selected: (id) => e.selection.get(id),
        select: (id, track) => e.selectTrack(id, track),
        voiceTrack: (id) => e.eraVoiceTrack(id),
        hold: (id, seconds) => e.holdEra(id, seconds),
        release: (id) => e.releaseEra(id),
        prepare: (id, track) => e.prepareTrack(id, track),
        loadState: (id, track) => e.trackLoadState(id, track),
      },
      artwork: { prepare: () => {}, ready: () => true },
      platterRpm: (i) => platters.states[i].currentRpm,
      tonearm: (i) => tonearms.states[i],
      tonearmAnimated: (i) => i === activeIndex(),
      focus: { mode: () => focus.mode, station: () => activeIndex(), exit: () => void focus.exits++ },
      activeIndex,
    });
    const problems: string[] = [];
    const frame = () => {
      controller.update(STEP);
      platters.update(STEP, (i) => controller.platterDemand(i, e.isEraPlaying(ERAS[i].id)));
      tonearms.update(STEP, activeIndex());
      e.updateFrame(routeFrame(layout.stations[activeIndex()].progress, 1, activeIndex()));
      h.context.advance(STEP);
      for (const p of controller.checkInvariants()) problems.push(`${controller.phase}: ${p}`);
    };
    const run = async (seconds: number) => {
      for (let k = 0; k < Math.round(seconds / STEP); k++) {
        frame();
        if (k % 6 === 0) await flush(); // let fetch / decode promises resolve
      }
    };
    const settle = async () => {
      for (let k = 0; k < 900 && controller.changing; k++) {
        frame();
        if (k % 6 === 0) await flush();
      }
      await run(0.5);
    };
    return { controller, platters, tonearms, problems, frame, run, settle, setActive: (id: EraId) => (active = id), rpm: () => platters.states[activeIndex()].currentRpm };
  }

  it("engine hold / prepare / release: duck without a new voice, prepare without playing, release starts fresh from silence", async () => {
    const h = createHarness();
    await startPlayback(h);
    const [hero, b] = getEra("roots").tracks.map((t) => t.id);
    const neighbours = [sourceOf(h, "recording"), sourceOf(h, "global")];
    const old = sourceOf(h, "roots");
    h.engine.holdEra("roots", 0.3);
    close(old?.stopAt ?? NaN, h.context.currentTime + 0.3 + AUDIO_CONFIG.stopMargin);
    assert.equal(h.engine.eraVoiceTrack("roots"), null);
    assert.equal(h.engine.isEraPlaying("roots"), false);
    h.engine.prepareTrack("roots", b);
    await flush();
    assert.equal(h.engine.trackLoadState("roots", b), "ready");
    h.engine.selectTrack("roots", b);
    assert.equal(sourceOf(h, "roots"), undefined, "selected while held: still no voice");
    assert.deepEqual([sourceOf(h, "recording"), sourceOf(h, "global")], neighbours, "neighbours untouched");
    h.engine.releaseEra("roots");
    const fresh = sourceOf(h, "roots");
    assert.ok(fresh && fresh !== old);
    assert.equal((fresh.outputs[0] as MockGain).gain.valueAt(fresh.startedAt), 0, "starts at zero gain");
    assert.equal(h.engine.eraVoiceTrack("roots"), b);
    assert.notEqual(hero, b);
  });

  it("NEXT on the real engine: old record ducks first, the destination starts only at needle contact, identities agree", async () => {
    const h = createHarness();
    await startPlayback(h);
    const deck = deckOn(h, "roots");
    await deck.run(3);
    assert.equal(deck.controller.phase, "PLAYING");
    const [, b] = getEra("roots").tracks.map((t) => t.id);
    const old = sourceOf(h, "roots");
    const neighbours = [sourceOf(h, "recording"), sourceOf(h, "global")];
    const sourcesBefore = h.context.trackSources().length;
    const duckStart = h.context.currentTime;
    deck.controller.requestStep("next");
    await deck.run(0.05);
    close(old?.stopAt ?? NaN, duckStart + RECORD_CHANGE_CONFIG.duckSeconds + AUDIO_CONFIG.stopMargin, 1e-6);
    // Destination decoded early (prepared at request time), but no source until the needle drops.
    let releasedAt = -1;
    let releasePhase: string | null = null;
    while (deck.controller.changing) {
      deck.frame();
      await flush();
      if (releasedAt < 0 && h.engine.eraVoiceTrack("roots") === b) {
        releasedAt = h.context.currentTime;
        releasePhase = deck.controller.phase;
      }
      if ((deck.controller.phase as string) === "LIFT_RECORD") assert.equal(h.engine.trackLoadState("roots", b), "ready", "decoded before the record leaves");
    }
    await deck.run(0.5);
    assert.ok(releasePhase === "LOWER_NEEDLE" || releasePhase === "FADE_IN_AUDIO", `destination started in ${releasePhase}`);
    assert.equal(h.context.trackSources().length, sourcesBefore + 1, "exactly one new source");
    assert.deepEqual([sourceOf(h, "recording"), sourceOf(h, "global")], neighbours, "neighbour voices unchanged");
    assert.equal(h.engine.getSnapshot().playingTrackId, b);
    assert.equal(h.engine.selection.get("roots"), b);
    assert.equal(deck.controller.phase, "PLAYING");
    assert.equal(voiceOf(h.engine, "roots")?.target, 1, "focused station at full presence");
    assert.deepEqual(deck.problems, []);
    assert.ok(releasedAt > duckStart + 5, `destination started ${(releasedAt - duckStart).toFixed(2)} s after the request`);
  });

  it("mute during the change: the choreography completes silently, unmuting reveals the new record (no restart)", async () => {
    const h = createHarness();
    await startPlayback(h);
    const deck = deckOn(h, "roots");
    await deck.run(3);
    deck.controller.requestStep("next");
    await deck.run(1.5);
    h.engine.mute();
    await deck.settle();
    const b = getEra("roots").tracks[1].id;
    assert.equal(deck.controller.phase, "PLAYING");
    assert.equal(h.engine.eraVoiceTrack("roots"), b);
    assert.equal(h.context.gains[0].gain.value, 0, "still muted");
    const source = sourceOf(h, "roots");
    h.engine.unmute();
    await deck.run(0.5);
    assert.equal(sourceOf(h, "roots"), source, "unmute does not restart");
    assert.deepEqual(deck.problems, []);
  });

  it("the new selection is what the era plays later as a spatial neighbour, and GLOBAL → ROOTS stays seamless", async () => {
    const h = createHarness({ initialEra: "global" });
    await startPlayback(h);
    const deck = deckOn(h, "global");
    await deck.run(3);
    deck.controller.requestStep("next");
    await deck.settle();
    const b = getEra("global").tracks[1].id;
    assert.equal(h.engine.eraVoiceTrack("global"), b);
    // Leave: travel GLOBAL → ROOTS → RECORDING; GLOBAL is heard as ROOTS's previous neighbour with record B.
    const { played, boundaries } = await travel(h, layout.stations[getEra("global").index].progress, 1 + layout.stations[1].progress + 0.01);
    assert.deepEqual(played, [b, hero("roots"), hero("recording")]);
    assertSeamless(boundaries);
    // Travel back past ROOTS: GLOBAL's voice is recreated with B (selection persisted), never the hero.
    const back = await travel(h, 1 + layout.stations[1].progress + 0.01, layout.stations[getEra("global").index].progress);
    assert.equal(back.played.at(-1), b);
    assertSeamless(back.boundaries);
    assert.equal(h.engine.selection.get("global"), b);
  });

  it("a destination whose file is missing restores the original record and its audio (never lifted)", async () => {
    const b = getEra("roots").tracks[1].id;
    const h = createHarness({
      resolveEntry: (era, trackId) => {
        const entry = getAudioEntry(era, trackId);
        return trackId === b && entry.url ? { ...entry, url: "/audio/roots/missing.wav" } : entry;
      },
    });
    await startPlayback(h);
    const deck = deckOn(h, "roots");
    await deck.run(3);
    deck.controller.requestStep("next");
    let lifted = false;
    while (deck.controller.changing) {
      deck.frame();
      await flush();
      if (deck.controller.vinyl[1] > 0) lifted = true;
    }
    await deck.run(0.5);
    assert.equal(lifted, false);
    assert.equal(deck.controller.lastOutcome, "restored-after-load-failure");
    assert.equal(h.engine.selection.get("roots"), hero("roots"));
    assert.equal(h.engine.eraVoiceTrack("roots"), hero("roots"));
    assert.equal(deck.controller.phase, "PLAYING");
    assert.deepEqual(deck.problems, []);
  });

  it("streams: NEXT prepares the destination element early, starts it only at needle contact, and no stale record plays", async () => {
    const h = createStreamingHarness({ resolveEntry: asRecording("roots", 1, BATA) });
    await startPlayback(h);
    const deck = deckOn(h, "roots");
    await deck.run(3);
    assert.equal(deck.controller.phase, "PLAYING");
    const b = getEra("roots").tracks[1].id;
    const old = streamOf(h, "roots");
    const neighbours = [streamOf(h, "recording"), streamOf(h, "global")];
    deck.controller.requestStep("next");
    let destination: MockMediaElement | undefined;
    let releasePhase: string | null = null;
    let startedAt = NaN;
    while (deck.controller.changing) {
      deck.frame();
      await flush();
      destination ??= h.elements.find((element) => element.src === BATA);
      if ((deck.controller.phase as string) === "LIFT_RECORD") {
        assert.equal(h.engine.trackLoadState("roots", b), "ready", "playable before the record leaves");
        assert.equal(destination?.paused, true, "prepared, silent");
        assert.equal(streamOf(h, "roots"), undefined, "nothing plays while the record is off the platter");
      }
      if (releasePhase === null && h.engine.eraVoiceTrack("roots") === b) {
        releasePhase = deck.controller.phase;
        startedAt = destination?.currentTime ?? NaN;
      }
    }
    await deck.run(0.5);
    assert.ok(releasePhase === "LOWER_NEEDLE" || releasePhase === "FADE_IN_AUDIO", `destination started in ${releasePhase}`);
    assert.ok(startedAt <= STEP + 1e-9, `from the top, at needle contact (seen one frame later at ${startedAt} s)`);
    assert.ok(destination && streamOf(h, "roots") === destination);
    assert.equal(destination.paused, false);
    assert.equal(old?.paused, true);
    assert.ok(!h.elements.some((element) => element.src === heroUrl("roots")), "the old record's element was released");
    assert.deepEqual([streamOf(h, "recording"), streamOf(h, "global")], neighbours, "neighbour streams untouched");
    assert.equal(h.engine.getSnapshot().playingTrackId, b);
    assert.equal(h.engine.selection.get("roots"), b);
    assert.equal(deck.controller.phase, "PLAYING");
    assert.deepEqual(deck.problems, []);
    assert.equal(h.context.decodes, 0);
    assert.deepEqual(h.fetches, []);
  });

  it("streams: a destination still buffering keeps the arm hovering; it drops once the element can play", async () => {
    const h = createStreamingHarness({ resolveEntry: asRecording("roots", 1, BATA) });
    await startPlayback(h);
    const deck = deckOn(h, "roots");
    await deck.run(3);
    h.slow.add(BATA);
    deck.controller.requestStep("next");
    await deck.run(12);
    assert.equal(deck.controller.phase, "STOP_PLATTER", "the old record waits on the deck until the destination can play");
    assert.equal(h.engine.trackLoadState("roots", getEra("roots").tracks[1].id), "loading");
    h.finishLoading(BATA);
    await deck.settle();
    assert.equal(deck.controller.phase, "PLAYING");
    assert.equal(streamOf(h, "roots")?.src, BATA);
    assert.deepEqual(deck.problems, []);
  });

  it("streams: a destination that fails to load restores the original record and its stream (never lifted)", async () => {
    const h = createStreamingHarness({ resolveEntry: asRecording("roots", 1, "/audio/roots/missing.mp3") });
    await startPlayback(h);
    const deck = deckOn(h, "roots");
    await deck.run(3);
    deck.controller.requestStep("next");
    let lifted = false;
    while (deck.controller.changing) {
      deck.frame();
      await flush();
      if (deck.controller.vinyl[1] > 0) lifted = true;
    }
    await deck.run(0.5);
    assert.equal(lifted, false);
    assert.equal(deck.controller.lastOutcome, "restored-after-load-failure");
    assert.equal(h.engine.selection.get("roots"), hero("roots"));
    assert.equal(streamOf(h, "roots")?.src, heroUrl("roots"));
    assert.equal(deck.controller.phase, "PLAYING");
    assert.deepEqual(deck.problems, []);
  });

  it("streams: a changed GLOBAL record is what GLOBAL streams as ROOTS's neighbour, across the seam and back", async () => {
    const h = createStreamingHarness({ initialEra: "global", resolveEntry: asRecording("global", 1, FREE_MIND) });
    await startPlayback(h);
    const deck = deckOn(h, "global");
    await deck.run(3);
    deck.controller.requestStep("next");
    await deck.settle();
    const b = getEra("global").tracks[1].id;
    assert.equal(streamOf(h, "global")?.src, FREE_MIND);
    const { played, boundaries } = await travel(h, layout.stations[getEra("global").index].progress, 1 + layout.stations[1].progress + 0.01);
    assert.deepEqual(played, [b, hero("roots"), hero("recording")]);
    assertSeamless(boundaries);
    const back = await travel(h, 1 + layout.stations[1].progress + 0.01, layout.stations[getEra("global").index].progress);
    assert.equal(back.played.at(-1), b);
    assertSeamless(back.boundaries);
    assert.equal(streamOf(h, "global")?.src, FREE_MIND, "the persisted selection, never the hero");
    assert.ok(!h.elements.some((element) => element.src === heroUrl("global")));
  });
});
