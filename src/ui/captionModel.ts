/**
 * Pure presentation rules of the production UI (docs/FINAL_UI.md) — no React, relative imports, so Node
 * tests cover them: the caption's status line, the era year format and the loop position label.
 */
import { isDevFixture } from "../data/devFixtures.ts";
import type { Track } from "../data/types.ts";

/** The record-change facts the caption needs (RecordChangeSnapshot subset). */
export interface CaptionRecordState {
  changing: boolean;
  exitPending: boolean;
}

/** The audio facts the caption needs (AudioSnapshot subset). */
export interface CaptionAudioState {
  activeEraId: string;
  selectedKind: "recording" | "preview" | "development-placeholder" | null;
  error: { trackId: string | null } | null;
}

/**
 * The single quiet status line under the caption: the record change first (never a queue count), then the
 * mounted record's audio. Archive entries playing a development tone read "Archive audio pending" — the
 * visitor is never told about development tones; an entry without audio stays a complete museum entry.
 */
export function captionStatus(record: CaptionRecordState, audio: CaptionAudioState, eraId: string, track: Track): string | null {
  if (record.changing) return record.exitPending ? "Changing record · closing after" : "Changing record";
  if (audio.activeEraId !== eraId) return null;
  if (audio.error?.trackId === track.id) {
    if (track.audioAvailability === "unavailable") return "Not available for listening";
    if (track.audioAvailability === "pending") return "Archive audio pending";
    return "Recording unavailable";
  }
  if (audio.selectedKind === "development-placeholder") return isDevFixture(track) ? "Development audio placeholder" : "Archive audio pending";
  if (audio.selectedKind === "preview") return "Audio preview (excerpt)";
  return null;
}

/** "1900 — 1919" (display form of an era's years). */
export const eraYears = (era: { startYear: number; endYear: number }): string => `${era.startYear} — ${era.endYear}`;

/** "04 / 08" — position around the loop (GLOBAL is 08 / 08, ROOTS 01 / 08; no "end" anywhere). */
export const loopPosition = (index: number, count: number): string => `${String(index + 1).padStart(2, "0")} / ${String(count).padStart(2, "0")}`;
