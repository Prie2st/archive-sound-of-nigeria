"use client";

import { startArchiveSound, useAudioSnapshot } from "@/audio/browserAudio";
import type { AudioEngine } from "@/audio/engine";
import { releaseFocusAfterPointer } from "@/input/pointerActivation";

/**
 * The production sound control (docs/FINAL_UI.md §5). Every label comes from the engine's own snapshot —
 * there is no separate UI audio state that could disagree with what is heard.
 *   ENABLE SOUND       not unlocked (ENTER ARCHIVE could not unlock, or the intro was skipped) → startArchiveSound
 *   RESUME SOUND       the browser / OS suspended the context → unlock (resume)
 *   SOUND ON           playing, audible → mute
 *   MUTED              muted → unmute
 *   SOUND UNAVAILABLE  Web Audio unsupported / failed (disabled; the archive works silently)
 * M toggles mute anywhere (useAudioInput). A pointer click hands keyboard focus back to the museum (so Enter
 * focuses a station instead of pressing this button again); Tab + Enter / Space keeps focus here.
 */
export function SoundToggle({ audio }: { audio: AudioEngine }) {
  const { unlocked, status, muted, error } = useAudioSnapshot(audio);

  if (status === "ERROR" && error?.trackId === null) {
    return (
      <button type="button" className="ui-sound" data-state="unavailable" disabled aria-label="Sound unavailable in this browser">
        <SoundGlyph />
        <span>Sound unavailable</span>
      </button>
    );
  }

  let label: string;
  let accessibleName: string;
  let state: "off" | "on" | "muted";
  let onClick: () => void;
  if (!unlocked) {
    label = "Enable sound";
    accessibleName = "Enable sound";
    state = "off";
    onClick = () => void startArchiveSound(audio);
  } else if (status === "SUSPENDED") {
    label = "Resume sound";
    accessibleName = "Resume sound";
    state = "off";
    onClick = () => void audio.unlock();
  } else if (muted) {
    label = "Muted";
    accessibleName = "Sound muted — unmute (M)";
    state = "muted";
    onClick = () => audio.unmute();
  } else {
    label = "Sound on";
    accessibleName = "Sound on — mute (M)";
    state = "on";
    onClick = () => audio.mute();
  }

  return (
    <button
      type="button"
      className="ui-sound"
      data-state={state}
      aria-label={accessibleName}
      title={accessibleName}
      onClick={(event) => {
        onClick();
        releaseFocusAfterPointer(event);
      }}
    >
      <SoundGlyph />
      <span>{label}</span>
    </button>
  );
}

/** Three small level bars; flat when muted / off (CSS: data-state). Decorative. */
function SoundGlyph() {
  return (
    <span className="ui-sound__glyph" aria-hidden="true">
      <i />
      <i />
      <i />
    </span>
  );
}
