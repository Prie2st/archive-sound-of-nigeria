/**
 * The narrow slice of the Web Audio API the audio engine uses (docs/AUDIO_ENGINE.md).
 *
 * The engine is written against these structural interfaces instead of the DOM types so it
 * stays plain TypeScript: Node tests drive it with a mock context, the browser adapter
 * (browserAudio.ts) passes the real AudioContext. Nothing else in the app touches Web Audio.
 */

export interface AudioParamLike {
  /** Current (automated) value; assigning sets it immediately (used for the listener / static panner positions). */
  value: number;
  setValueAtTime(value: number, startTime: number): unknown;
  linearRampToValueAtTime(value: number, endTime: number): unknown;
  /** Exponential approach toward `target` (time constant in s): smooth per-frame gain following. */
  setTargetAtTime(target: number, startTime: number, timeConstant: number): unknown;
  cancelScheduledValues(cancelTime: number): unknown;
}

export interface AudioNodeLike {
  connect(destination: AudioNodeLike): unknown;
  disconnect(): void;
}

export interface GainNodeLike extends AudioNodeLike {
  readonly gain: AudioParamLike;
}

export interface AudioBufferLike {
  /** Seconds. */
  readonly duration: number;
  /** Sample frames per channel. */
  readonly length: number;
  readonly numberOfChannels: number;
  readonly sampleRate: number;
}

/** One playback instance. A buffer source can be started ONCE; it is never reused after stop(). */
export interface BufferSourceLike extends AudioNodeLike {
  buffer: AudioBufferLike | null;
  loop: boolean;
  onended: ((event: Event) => void) | null;
  start(when?: number, offset?: number): void;
  stop(when?: number): void;
}

export type PanningModel = "equalpower" | "HRTF";
export type DistanceModel = "linear" | "inverse" | "exponential";

/** Per-voice spatializer. Position via AudioParams (`positionX…`) where supported, else `setPosition`. */
export interface PannerNodeLike extends AudioNodeLike {
  panningModel: PanningModel;
  distanceModel: DistanceModel;
  refDistance: number;
  maxDistance: number;
  rolloffFactor: number;
  coneInnerAngle: number;
  coneOuterAngle: number;
  readonly positionX?: AudioParamLike;
  readonly positionY?: AudioParamLike;
  readonly positionZ?: AudioParamLike;
  setPosition?(x: number, y: number, z: number): void;
}

/** The context's listener (= the production camera). AudioParams where supported, deprecated setters otherwise. */
export interface AudioListenerLike {
  readonly positionX?: AudioParamLike;
  readonly positionY?: AudioParamLike;
  readonly positionZ?: AudioParamLike;
  readonly forwardX?: AudioParamLike;
  readonly forwardY?: AudioParamLike;
  readonly forwardZ?: AudioParamLike;
  readonly upX?: AudioParamLike;
  readonly upY?: AudioParamLike;
  readonly upZ?: AudioParamLike;
  setPosition?(x: number, y: number, z: number): void;
  setOrientation?(x: number, y: number, z: number, xUp: number, yUp: number, zUp: number): void;
}

/** "interrupted" is Safari's state when the OS takes the audio session (calls, Siri…). */
export type AudioContextState = "suspended" | "running" | "closed" | "interrupted";

export interface AudioContextLike {
  readonly currentTime: number;
  readonly sampleRate: number;
  readonly state: AudioContextState | AudioContextStateDom;
  readonly destination: AudioNodeLike;
  readonly listener: AudioListenerLike;
  onstatechange: ((event: Event) => void) | null;
  createGain(): GainNodeLike;
  createPanner(): PannerNodeLike;
  createBufferSource(): BufferSourceLike;
  createBuffer(numberOfChannels: number, length: number, sampleRate: number): AudioBufferLike;
  decodeAudioData(data: ArrayBuffer): Promise<AudioBufferLike>;
  resume(): Promise<void>;
  suspend(): Promise<void>;
}

/** The DOM lib's own state union (kept separate so the real AudioContext stays assignable). */
type AudioContextStateDom = "suspended" | "running" | "closed";
