/**
 * Streamed production recordings (docs/PRODUCTION_AUDIO.md): a BOUNDED pool of media elements.
 *
 * Full-length recordings are never fetched whole or decoded into AudioBuffers (Ja Funmi runs 67 min —
 * about 1.4 GB as decoded float PCM). Each recording plays from an HTMLMediaElement, which streams and
 * decodes only around its playhead. Its output enters THE AudioContext through the element's
 * MediaElementAudioSourceNode and from there the engine's usual voice gain → panner / dry → music → master
 * chain, so spatial mix, crossfades and mute are unchanged.
 *
 * - At most `max` elements exist. All are created inside the unlock gesture, each paired once with its
 *   MediaElementAudioSourceNode (the API allows one per element), and reused afterwards by changing `src`.
 * - `sync(demand)` is declarative: the engine lists the URLs it needs prepared, highest priority first.
 *   Unlisted URLs lose their (unowned) element; missing ones take a free element or evict a lower-priority
 *   unowned one. Elements OWNED by a voice (playing or fading out) are never touched by sync.
 * - Prepared = `src` set with preload "metadata" (headers / duration only) or "auto" (the browser buffers
 *   enough to start). Ready = HAVE_FUTURE_DATA (`canplay`). Nothing else is downloaded ahead.
 * - Releasing pauses the element, disconnects its node and detaches the source (`removeAttribute("src")`
 *   + `load()`), which aborts the download and frees the browser's decoder buffers.
 * - Failures are remembered per URL (like the buffer cache) until an explicit retry.
 *
 * Plain TypeScript against webAudio.ts, so Node tests drive it with mock elements.
 */
import { AudioLoadError, type BufferLoadState } from "./bufferCache.ts";
import type { AudioContextLike, AudioNodeLike, MediaElementLike, MediaErrorLike } from "./webAudio.ts";

export type StreamPreload = "metadata" | "auto";

/** One URL the engine wants prepared. Earlier entries have priority. */
export interface StreamDemand {
  url: string;
  preload: StreamPreload;
}

/** HAVE_FUTURE_DATA: playback can start now (the `canplay` threshold). */
export const HAVE_FUTURE_DATA = 3;

export interface MediaSlot<V> {
  readonly element: MediaElementLike;
  /** The element's MediaElementAudioSourceNode: connected to a voice gain only while owned. */
  readonly node: AudioNodeLike;
  url: string | null;
  preload: StreamPreload | null;
  state: "idle" | "loading" | "ready";
  /** The voice playing this element (live or fading out); null while it is only prepared. */
  owner: V | null;
}

export interface StreamPoolStats {
  /** Elements created (all inside the unlock gesture) and the hard bound. */
  elements: number;
  max: number;
  /** Elements with a source, ready to play, and owned by a voice. */
  prepared: number;
  ready: number;
  owned: number;
  errors: number;
  /** `src` assignments since the start (≈ media loads started). */
  assignments: number;
  urls: string[];
}

export interface StreamPoolEvents<V> {
  /** An element became ready, failed or was freed: the engine reconciles. */
  changed(): void;
  /** An owned element reached its end (only when it does not loop). */
  ended(owner: V): void;
  /** An owned element failed while playing (e.g. the connection dropped): the engine releases the voice. */
  failed(owner: V): void;
}

/** A missing local file reports "source not supported" (code 4): it reads as a network failure, like an HTTP 404. */
const mediaFailure = (error: MediaErrorLike): AudioLoadError =>
  new AudioLoadError(error.code === 3 ? "decode" : "network", error.message || `media error ${error.code}`);

export class StreamPool<V> {
  readonly max: number;
  private readonly slots: MediaSlot<V>[] = [];
  private readonly errors = new Map<string, AudioLoadError>();
  private readonly loop: boolean;
  private readonly events: StreamPoolEvents<V>;
  private assignments = 0;

  constructor(max: number, loop: boolean, events: StreamPoolEvents<V>) {
    this.max = max;
    this.loop = loop;
    this.events = events;
  }

  /**
   * Call inside the unlock gesture: creates every element with its node and starts each once. WebKit lifts
   * an element's playback / loading restrictions when it is started inside a gesture, and later `src`
   * changes keep that permission. With no source yet the start simply rejects (ignored).
   */
  prime(context: AudioContextLike, createElement: () => MediaElementLike) {
    while (this.slots.length < this.max) {
      const element = createElement();
      element.preload = "none";
      const node = context.createMediaElementSource(element);
      const slot: MediaSlot<V> = { element, node, url: null, preload: null, state: "idle", owner: null };
      element.addEventListener("loadeddata", () => this.onData(slot));
      element.addEventListener("canplay", () => this.onData(slot));
      element.addEventListener("error", () => this.onError(slot));
      element.addEventListener("ended", () => {
        if (slot.owner) this.events.ended(slot.owner);
      });
      this.slots.push(slot);
      element.play().catch(() => {});
      element.pause();
    }
  }

  state(url: string): BufferLoadState {
    if (this.errors.has(url)) return "error";
    const slot = this.slotFor(url);
    return !slot ? "idle" : slot.state === "ready" ? "ready" : "loading";
  }

  error(url: string): AudioLoadError | undefined {
    return this.errors.get(url);
  }

  slotFor(url: string): MediaSlot<V> | undefined {
    return this.slots.find((slot) => slot.url === url);
  }

  /** Elements currently playing for a voice (live or fading). */
  ownedSlots(): MediaSlot<V>[] {
    return this.slots.filter((slot) => slot.owner !== null);
  }

  /**
   * Makes the prepared set match `demand` (priority order). Returns false when an "auto" entry found no
   * element: every element is owned — voices fading out after rapid moves — and the engine frees one.
   */
  sync(demand: readonly StreamDemand[]): boolean {
    const rank = (url: string) => demand.findIndex((item) => item.url === url);
    for (const slot of this.slots) if (!slot.owner && slot.url !== null && rank(slot.url) < 0) this.release(slot);
    let satisfied = true;
    demand.forEach((item, index) => {
      if (this.errors.has(item.url)) return;
      const held = this.slotFor(item.url);
      if (held) {
        if (item.preload === "auto" && held.preload !== "auto") this.upgrade(held);
        return;
      }
      const slot = this.slots.find((candidate) => candidate.url === null && !candidate.owner) ?? this.evictBelow(index, rank);
      if (slot) this.assign(slot, item);
      else if (item.preload === "auto") satisfied = false;
    });
    return satisfied;
  }

  /** A voice takes a ready element. */
  claim(slot: MediaSlot<V>, owner: V) {
    slot.owner = owner;
  }

  /** Pauses, disconnects and detaches the source: the download stops and the decoder's buffers are freed. */
  release(slot: MediaSlot<V>) {
    const element = slot.element;
    slot.owner = null;
    slot.node.disconnect();
    element.pause();
    if (slot.url !== null) {
      element.removeAttribute("src");
      element.load();
    }
    slot.url = null;
    slot.preload = null;
    slot.state = "idle";
  }

  /** Forgets a remembered failure so the next sync tries the URL again. */
  retry(url: string) {
    this.errors.delete(url);
  }

  clearErrors() {
    this.errors.clear();
  }

  stats(): StreamPoolStats {
    const prepared = this.slots.filter((slot) => slot.url !== null);
    return {
      elements: this.slots.length,
      max: this.max,
      prepared: prepared.length,
      ready: prepared.filter((slot) => slot.state === "ready").length,
      owned: this.slots.filter((slot) => slot.owner !== null).length,
      errors: this.errors.size,
      assignments: this.assignments,
      urls: prepared.map((slot) => `${slot.url}${slot.owner ? " ▶" : ` (${slot.preload}, ${slot.state})`}`),
    };
  }

  private assign(slot: MediaSlot<V>, item: StreamDemand) {
    slot.url = item.url;
    slot.preload = item.preload;
    slot.state = "loading";
    slot.element.loop = this.loop;
    slot.element.preload = item.preload;
    slot.element.src = item.url; // starts the browser's load: headers and the first data only
    this.assignments++;
  }

  /** "metadata" → "auto": an element that stopped after its metadata loads again with the new hint. */
  private upgrade(slot: MediaSlot<V>) {
    slot.preload = "auto";
    slot.element.preload = "auto";
    if (slot.state !== "ready" && slot.element.readyState < HAVE_FUTURE_DATA) slot.element.load();
  }

  /** Frees the unowned element whose URL ranks lowest, if it ranks below `index`. */
  private evictBelow(index: number, rank: (url: string) => number): MediaSlot<V> | undefined {
    let victim: MediaSlot<V> | undefined;
    let lowest = index;
    for (const slot of this.slots) {
      if (slot.owner || slot.url === null) continue;
      const r = rank(slot.url);
      if (r > lowest) {
        lowest = r;
        victim = slot;
      }
    }
    if (victim) this.release(victim);
    return victim;
  }

  private onData(slot: MediaSlot<V>) {
    if (slot.url === null || slot.state !== "loading" || slot.element.readyState < HAVE_FUTURE_DATA) return;
    slot.state = "ready";
    this.events.changed();
  }

  private onError(slot: MediaSlot<V>) {
    const url = slot.url;
    const error = slot.element.error;
    if (url === null || !error || error.code === 1) return; // our own abort (source detached / replaced)
    this.errors.set(url, mediaFailure(error));
    if (slot.owner) this.events.failed(slot.owner); // the engine releases the voice, and with it this element
    else this.release(slot);
    this.events.changed();
  }
}
