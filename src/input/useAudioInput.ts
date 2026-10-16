"use client";

import { useEffect } from "react";
import type { AudioEngine } from "@/audio/engine";

const isEditable = (target: EventTarget | null) =>
  target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));

/** M toggles mute (CLAUDE.md §7). Mute never stops playback or changes any selection. */
export function useAudioInput(audio: AudioEngine) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey || event.repeat || isEditable(event.target)) return;
      if (event.key !== "m" && event.key !== "M") return;
      event.preventDefault();
      audio.toggleMute();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [audio]);
}
