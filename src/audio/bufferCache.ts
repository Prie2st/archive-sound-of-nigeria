/**
 * Audio buffer loader / cache (docs/AUDIO_ENGINE.md §5).
 *
 * - One entry per URL: a file is fetched and decoded once, then reused for every playback.
 * - Simultaneous requests for the same URL share one in-flight promise (deduplicated).
 * - Failures are remembered (state "error") so a broken file is not refetched on every era
 *   change; an explicit `retry` (or `clear`) tries again.
 * - Nothing is loaded unless asked: the engine requests the active era's selected track only.
 *
 * Generic over the buffer type so Node tests can use plain objects. Plain TypeScript.
 */

export type AudioLoadErrorKind = "network" | "decode" | "unsupported";

/** A failed load, classified for the UI ("RECORDING UNAVAILABLE") and the dev panel. */
export class AudioLoadError extends Error {
  readonly kind: AudioLoadErrorKind;

  constructor(kind: AudioLoadErrorKind, message: string) {
    super(message);
    this.name = "AudioLoadError";
    this.kind = kind;
  }
}

export const toAudioLoadError = (error: unknown, fallback: AudioLoadErrorKind = "network"): AudioLoadError =>
  error instanceof AudioLoadError ? error : new AudioLoadError(fallback, error instanceof Error ? error.message : String(error));

export type BufferLoadState = "idle" | "loading" | "ready" | "error";

interface CacheEntry<B> {
  state: Exclude<BufferLoadState, "idle">;
  promise: Promise<B> | null;
  value: B | null;
  error: AudioLoadError | null;
}

export interface BufferCacheStats {
  /** Decoded buffers held. */
  buffers: number;
  loading: number;
  errors: number;
  /** Decoded size of the held buffers (bytes, 32-bit float PCM). */
  bytes: number;
  /** Loader invocations since the start (≈ network fetches). */
  requests: number;
}

export class AudioBufferCache<B> {
  private readonly entries = new Map<string, CacheEntry<B>>();
  private readonly loader: (url: string) => Promise<B>;
  private readonly sizeOf: (buffer: B) => number;
  /** Bumped by clear(): results of loads started before it are dropped. */
  private generation = 0;
  private requests = 0;

  constructor(loader: (url: string) => Promise<B>, sizeOf: (buffer: B) => number) {
    this.loader = loader;
    this.sizeOf = sizeOf;
  }

  state(url: string): BufferLoadState {
    return this.entries.get(url)?.state ?? "idle";
  }

  /** The decoded buffer, if ready. */
  peek(url: string): B | undefined {
    return this.entries.get(url)?.value ?? undefined;
  }

  error(url: string): AudioLoadError | undefined {
    return this.entries.get(url)?.error ?? undefined;
  }

  /**
   * The decoded buffer for `url`: cached, the in-flight request, or a new load. A remembered
   * failure rejects immediately unless `retry` is set.
   */
  load(url: string, retry = false): Promise<B> {
    const existing = this.entries.get(url);
    if (existing?.state === "ready" && existing.value !== null) return Promise.resolve(existing.value);
    if (existing?.state === "loading" && existing.promise) return existing.promise;
    if (existing?.state === "error" && existing.error && !retry) return Promise.reject(existing.error);

    const generation = this.generation;
    const entry: CacheEntry<B> = { state: "loading", promise: null, value: null, error: null };
    this.requests++;
    const current = () => generation === this.generation && this.entries.get(url) === entry;
    entry.promise = Promise.resolve()
      .then(() => this.loader(url))
      .then(
        (value) => {
          if (current()) {
            entry.state = "ready";
            entry.value = value;
            entry.promise = null;
          }
          return value;
        },
        (reason: unknown) => {
          const error = toAudioLoadError(reason);
          if (current()) {
            entry.state = "error";
            entry.error = error;
            entry.promise = null;
          }
          throw error;
        },
      );
    this.entries.set(url, entry);
    return entry.promise;
  }

  /** Drops every buffer and remembered error. In-flight loads finish but are not stored. */
  clear() {
    this.entries.clear();
    this.generation++;
  }

  stats(): BufferCacheStats {
    const stats: BufferCacheStats = { buffers: 0, loading: 0, errors: 0, bytes: 0, requests: this.requests };
    for (const entry of this.entries.values()) {
      if (entry.state === "ready" && entry.value !== null) {
        stats.buffers++;
        stats.bytes += this.sizeOf(entry.value);
      } else if (entry.state === "loading") stats.loading++;
      else stats.errors++;
    }
    return stats;
  }

  /** URLs with a decoded buffer (dev readout). */
  readyUrls(): string[] {
    return [...this.entries].filter(([, entry]) => entry.state === "ready").map(([url]) => url);
  }
}
