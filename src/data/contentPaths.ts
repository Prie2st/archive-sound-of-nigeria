/**
 * File layout for licensed record assets (docs/CONTENT_PIPELINE.md §4–§5). Single source for the path
 * conventions: the validator (validateArchive.ts) enforces them and the catalogs resolve them.
 *
 *   audio      /audio/<eraId>/<trackId>.<ext>            full licensed recording ("available")
 *              /audio/<eraId>/<trackId>.preview.<ext>    licensed excerpt ("preview")
 *   artwork    /textures/records/<eraId>/<trackId>/label.<ext>
 *              /textures/records/<eraId>/<trackId>/sleeve-front.<ext>
 *              /textures/records/<eraId>/<trackId>/sleeve-back.<ext>
 *
 * Development assets live elsewhere on purpose (/audio/<eraId>/dev-placeholder--…, /textures/dev-records/…),
 * so a development file can never be mistaken for a licensed one. Plain TypeScript.
 */
import type { EraId } from "./types.ts";

/** Formats every target browser decodes with decodeAudioData. */
export const AUDIO_EXTENSIONS = ["mp3", "m4a", "aac", "ogg", "opus", "webm", "wav", "flac"] as const;
export type AudioExtension = (typeof AUDIO_EXTENSIONS)[number];

export const RECORD_ARTWORK_PARTS = ["label", "sleeve-front", "sleeve-back"] as const;
export type RecordArtworkPart = (typeof RECORD_ARTWORK_PARTS)[number];
export const RECORD_ARTWORK_EXTENSIONS = ["webp", "png", "jpg", "jpeg"] as const;
export type RecordArtworkExtension = (typeof RECORD_ARTWORK_EXTENSIONS)[number];

/** Track id → the field that carries each artwork part. */
export const ARTWORK_FIELD_PART = { vinylLabelUrl: "label", coverUrl: "sleeve-front", sleeveBackUrl: "sleeve-back" } as const satisfies Record<string, RecordArtworkPart>;

/** Track ids are used in file paths: lower-case letters / digits joined by single or double hyphens. */
export const TRACK_ID_PATTERN = /^[a-z0-9]+(?:--?[a-z0-9]+)*$/;

export const recordAudioPath = (eraId: EraId, trackId: string, extension: AudioExtension, preview = false): string =>
  `/audio/${eraId}/${trackId}${preview ? ".preview" : ""}.${extension}`;

export const recordArtworkPath = (eraId: EraId, trackId: string, part: RecordArtworkPart, extension: RecordArtworkExtension = "webp"): string =>
  `/textures/records/${eraId}/${trackId}/${part}.${extension}`;

export interface ParsedAudioPath {
  eraId: string;
  trackId: string;
  preview: boolean;
  extension: string;
}

/** Splits a licensed audio path (null when it does not follow the convention). */
export function parseRecordAudioPath(url: string): ParsedAudioPath | null {
  const match = /^\/audio\/([^/]+)\/([^/]+?)(\.preview)?\.([a-z0-9]+)$/.exec(url);
  if (!match || !(AUDIO_EXTENSIONS as readonly string[]).includes(match[4])) return null;
  return { eraId: match[1], trackId: match[2], preview: match[3] !== undefined, extension: match[4] };
}

export interface ParsedArtworkPath {
  eraId: string;
  trackId: string;
  part: string;
  extension: string;
}

/** Splits a licensed artwork path (null when it does not follow the convention). */
export function parseRecordArtworkPath(url: string): ParsedArtworkPath | null {
  const match = /^\/textures\/records\/([^/]+)\/([^/]+)\/([a-z-]+)\.([a-z]+)$/.exec(url);
  if (!match || !(RECORD_ARTWORK_PARTS as readonly string[]).includes(match[3]) || !(RECORD_ARTWORK_EXTENSIONS as readonly string[]).includes(match[4])) return null;
  return { eraId: match[1], trackId: match[2], part: match[3], extension: match[4] };
}
