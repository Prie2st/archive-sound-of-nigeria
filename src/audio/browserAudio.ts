"use client";

import { useEffect, useSyncExternalStore } from "react";
import { getAudioEntry } from "@/audio/audioCatalog";
import { AudioLoadError } from "@/audio/bufferCache";
import { AudioEngine, type AudioSnapshot } from "@/audio/engine";
import { getHallLayout } from "@/data/hallLayout";
import type { EraId } from "@/data/types";
import type { ValueStore } from "@/state/valueStore";

/**
 * Browser side of the audio engine (docs/AUDIO_ENGINE.md §1): the ONE engine instance for the
 * page, the real AudioContext / fetch, and the React bridges. Components never touch Web Audio.
 */

let engine: AudioEngine | null = null;
let contextCreated = false;

export interface BrowserAudioOptions {
  initialEra: EraId;
  /** Development: this era's audio points at a missing file (tests the unavailable path). */
  failEra?: EraId | null;
}

/** The page's audio engine (created on first call; later calls return the same instance). */
export function getAudioEngine({ initialEra, failEra = null }: BrowserAudioOptions): AudioEngine {
  if (engine) return engine;
  engine = new AudioEngine({
    initialEra,
    // Station sound sources = the platter centres of the locked hall layout (one per era, LOD-independent).
    stations: getHallLayout().stations.map((station) => ({ progress: station.progress, source: station.platter })),
    // Only ever called by AudioEngine.unlock(), inside a user gesture. A second context is refused outright.
    createContext: () => {
      if (contextCreated) throw new Error("an AudioContext already exists for this page");
      const Context = window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Context) throw new Error("this browser has no Web Audio API");
      contextCreated = true;
      return new Context();
    },
    // Development tones only (a few hundred KiB). Local application assets only (audioCatalog.ts rejects anything outside /audio/).
    fetchAudio: async (url) => {
      const response = await fetch(url);
      if (!response.ok) throw new AudioLoadError("network", `HTTP ${response.status}`);
      return response.arrayBuffer();
    },
    // Recordings stream through a bounded pool of these, created inside the unlock gesture (docs/PRODUCTION_AUDIO.md).
    createMediaElement: () => {
      const element = new Audio();
      element.preload = "none";
      return element;
    },
    // Transient user activation (inside a click / tap / key handler). Browsers without the API: trust the caller.
    hasUserActivation: () => (typeof navigator.userActivation === "undefined" ? true : navigator.userActivation.isActive),
    resolveEntry: failEra
      ? (eraId, trackId) => {
          const entry = getAudioEntry(eraId, trackId);
          return eraId === failEra && entry.url ? { ...entry, url: `/audio/${eraId}/dev-missing-file-test.wav` } : entry;
        }
      : undefined,
  });
  return engine;
}

/**
 * THE visitor gesture that turns the archive's sound on (ENTER ARCHIVE, ENABLE SOUND — docs/FINAL_UI.md §2):
 * unlock (creates THE AudioContext on the first call, resumes it later), unmute, play. Call it inside a
 * click / tap / key handler. Returns false when audio could not be unlocked (no Web Audio, no gesture) —
 * the caller carries on without sound; it never throws.
 */
export function startArchiveSound(audio: AudioEngine): boolean {
  if (!audio.unlock()) return false;
  audio.unmute();
  audio.play();
  return true;
}

/** Discrete audio state for React (re-renders on semantic changes only). */
export const useAudioSnapshot = (audio: AudioEngine): AudioSnapshot => useSyncExternalStore(audio.subscribe, audio.getSnapshot, audio.getSnapshot);

/**
 * Connects the engine to the app: it follows the EXISTING active-era store (written by the
 * CameraRig — audio never computes its own active era) and the page visibility.
 */
export function useAudioLifecycle(audio: AudioEngine, activeEra: ValueStore<EraId>) {
  useEffect(() => {
    const sync = () => audio.setActiveEra(activeEra.get());
    sync();
    return activeEra.subscribe(sync);
  }, [audio, activeEra]);

  useEffect(() => {
    const onVisibility = () => audio.setPageVisible(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [audio]);

  // Development: expose the engine for automated browser tests.
  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
    const devWindow = window as Window & { __archiveAudio?: AudioEngine };
    devWindow.__archiveAudio = audio;
    return () => {
      delete devWindow.__archiveAudio;
    };
  }, [audio]);
}
