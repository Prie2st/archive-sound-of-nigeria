/**
 * Runtime audio entries for tracks (docs/AUDIO_ENGINE.md §4).
 *
 * The historical content model (Track in src/data/types.ts) stays free of runtime audio
 * objects; this module only decides WHICH local file plays for a track and what kind of file it
 * is. AudioBuffers and nodes live in the engine, never here.
 *
 * The decision follows the track's EXPLICIT `audioAvailability` (docs/CONTENT_PIPELINE.md §5) — a
 * title, a URL or a status never implies permission on its own:
 *   available    → recording                Track.audioUrl, a licensed full-length local file
 *   preview      → preview                  Track.audioUrl, a licensed excerpt (local file)
 *   pending      → development-placeholder  the synthetic test tone (devAudioAssets.ts), if one exists
 *   development  → development-placeholder    and the policy allows it; never presented as the recording
 *   unavailable  → nothing ("not-licensed"); never a tone, never a URL
 * Anything else resolves to no audio (url null) with a reason; the record stays displayable.
 *
 * Plain TypeScript.
 */
import { getTrack } from "../data/eras.ts";
import type { EraId, Track } from "../data/types.ts";
import { DEV_AUDIO_PLACEHOLDERS } from "./devAudioAssets.ts";

export type AudioAssetKind = "recording" | "preview" | "development-placeholder";

/**
 *   no-audio         nothing to play yet (pending without a tone, or tones disabled)
 *   not-licensed     the archive marks the record unavailable for playback
 *   not-local-asset  the URL is not an application /audio/ file (never fetched)
 *   missing-url      available / preview declared without a URL (a data error; validateArchive.ts reports it)
 */
export type AudioUnavailableReason = "no-audio" | "not-licensed" | "not-local-asset" | "missing-url";

export interface AudioTrackEntry {
  trackId: string;
  eraId: EraId;
  /** Local application asset to load, or null when the track has no playable audio. */
  url: string | null;
  kind: AudioAssetKind | null;
  unavailable: AudioUnavailableReason | null;
}

export interface AudioAssetPolicy {
  /**
   * Keep synthetic tones for development fixtures and pending entries. Available recordings
   * always use their declared local URL, independently of this fallback policy.
   */
  allowDevelopmentPlaceholders: boolean;
}

export const AUDIO_ASSET_POLICY: AudioAssetPolicy = { allowDevelopmentPlaceholders: true };

/**
 * Audio is only ever loaded from the app's own /audio/ folder (CLAUDE.md §4: never source music
 * from the internet). A track URL pointing anywhere else is treated as unavailable, not fetched.
 */
export const isLocalAudioAsset = (url: string): boolean => /^\/audio\/[^?#]+$/.test(url) && !url.includes("..") && !url.includes("//");

export function resolveAudioEntry(track: Track, policy: AudioAssetPolicy = AUDIO_ASSET_POLICY): AudioTrackEntry {
  const base = { trackId: track.id, eraId: track.eraId };
  const none = (unavailable: AudioUnavailableReason): AudioTrackEntry => ({ ...base, url: null, kind: null, unavailable });
  switch (track.audioAvailability) {
    case "available":
    case "preview": {
      if (track.audioUrl === null) return none("missing-url");
      if (!isLocalAudioAsset(track.audioUrl)) return none("not-local-asset");
      return { ...base, url: track.audioUrl, kind: track.audioAvailability === "preview" ? "preview" : "recording", unavailable: null };
    }
    case "unavailable":
      return none("not-licensed");
    case "pending":
    case "development": {
      // Track.audioUrl is ignored here on purpose: a URL without "available" / "preview" is not permission.
      const placeholder = policy.allowDevelopmentPlaceholders ? DEV_AUDIO_PLACEHOLDERS[track.id] : undefined;
      return placeholder ? { ...base, url: placeholder, kind: "development-placeholder", unavailable: null } : none("no-audio");
    }
  }
}

/** Entry for a track of `eraId`. Throws for a track that is not in that era's playlist. */
export function getAudioEntry(eraId: EraId, trackId: string, policy: AudioAssetPolicy = AUDIO_ASSET_POLICY): AudioTrackEntry {
  const track = getTrack(eraId, trackId);
  if (!track) throw new Error(`Track "${trackId}" is not in era "${eraId}"`);
  return resolveAudioEntry(track, policy);
}
