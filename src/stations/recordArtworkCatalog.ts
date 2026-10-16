/**
 * Record artwork per track (docs/RECORD_CHANGE.md §9): which label / sleeve image a station shows
 * for its mounted record. Pure data resolution — textures are loaded by recordArtwork.ts.
 *
 *   licensed           — Track.vinylLabelUrl / coverUrl / sleeveBackUrl: local files supplied by the
 *                        project owner (/textures/records/<eraId>/<trackId>/…, docs/CONTENT_PIPELINE.md §4)
 *   archive            — museum fallback art generated for every production archive entry
 *                        (scripts/build-archive-artwork.mjs: catalogue number, artist / tradition, title,
 *                        year, era colour, pattern) — used for any part without supplied artwork
 *   development        — DEVELOPMENT RECORD art (scripts/build-dev-artwork.mjs) for the development
 *                        fixtures only (devFixtures.ts) — never presented as archive content
 *   model-placeholder  — none of these: the neutral placeholder textures baked into the vinyl GLB
 * Each part falls back on its own: supplied → generated archive art → model placeholder (the sleeve
 * back has no generated art: supplied or neutral).
 * Nothing here is era-specific — ListeningStation never decides artwork.
 *
 * Plain TypeScript (Node tests and the generator import it).
 */
import { DEV_TRACKS_BY_ERA, isDevFixture } from "../data/devFixtures.ts";
import { ARCHIVE_TRACKS_BY_ERA } from "../data/tracks.ts";
import { ERA_IDS, type EraId, type Track } from "../data/types.ts";

export type RecordArtworkKind = "licensed" | "archive" | "development" | "model-placeholder";

export interface RecordArtwork {
  kind: RecordArtworkKind;
  /** Square image with circular label art; null = the model's placeholder label. */
  labelUrl: string | null;
  /** Square album front; null = the model's placeholder sleeve. */
  sleeveUrl: string | null;
  /** Square album back; null = the model's placeholder back. */
  sleeveBackUrl: string | null;
}


export const archiveArtworkUrl = (eraId: EraId, trackId: string, part: "label" | "sleeve"): string =>
  `/textures/archive/${eraId}/${trackId}--${part}.webp`;

export interface ArchiveArtworkAsset {
  eraId: EraId;
  eraIndex: number;
  /** 0-based playlist position (catalogue position − 1). */
  position: number;
  track: Track;
  labelUrl: string;
  sleeveUrl: string;
}

/** Generated museum art for every production archive entry (independent of the active record set). */
export const ARCHIVE_ARTWORK: readonly ArchiveArtworkAsset[] = ERA_IDS.flatMap((eraId, eraIndex) =>
  ARCHIVE_TRACKS_BY_ERA[eraId].map((track, position) => ({
    eraId,
    eraIndex,
    position,
    track,
    labelUrl: archiveArtworkUrl(eraId, track.id, "label"),
    sleeveUrl: archiveArtworkUrl(eraId, track.id, "sleeve"),
  })),
);

const ARCHIVE_BY_TRACK = new Map(ARCHIVE_ARTWORK.map((asset) => [asset.track.id, asset]));

export const devRecordArtworkUrl = (eraId: EraId, trackId: string, part: "label" | "sleeve"): string =>
  `/textures/dev-records/${eraId}/${trackId}--${part}.webp`;

export interface DevRecordArtworkAsset {
  eraId: EraId;
  eraIndex: number;
  trackId: string;
  /** Fixture letter: B for an era's first fixture, then C, D … (the hero tone is A). */
  letter: string;
  /** 0-based index among the era's fixtures (drives the generator's palette, not playlist position). */
  fixtureIndex: number;
  labelUrl: string;
  sleeveUrl: string;
}

/** Development art for every development fixture (keyed by fixture index, not playlist position); none for archive records. */
export const DEV_RECORD_ARTWORK: readonly DevRecordArtworkAsset[] = ERA_IDS.flatMap((eraId, eraIndex) =>
  DEV_TRACKS_BY_ERA[eraId].filter(isDevFixture).map((track, fixtureIndex) => ({
    eraId,
    eraIndex,
    trackId: track.id,
    letter: String.fromCharCode(66 + (fixtureIndex % 25)),
    fixtureIndex,
    labelUrl: devRecordArtworkUrl(eraId, track.id, "label"),
    sleeveUrl: devRecordArtworkUrl(eraId, track.id, "sleeve"),
  })),
);

const DEV_BY_TRACK = new Map(DEV_RECORD_ARTWORK.map((asset) => [asset.trackId, asset]));

/** Only local application assets are ever loaded (same rule as audio). */
const isLocalTexture = (url: string | null): url is string => url !== null && /^\/textures\/[^?#]+$/.test(url) && !url.includes("..") && !url.includes("//");

export const MODEL_PLACEHOLDER_ARTWORK: RecordArtwork = { kind: "model-placeholder", labelUrl: null, sleeveUrl: null, sleeveBackUrl: null };

export function resolveRecordArtwork(track: Track): RecordArtwork {
  const local = (url: string | null | undefined): string | null => (url !== undefined && isLocalTexture(url) ? url : null);
  const label = local(track.vinylLabelUrl);
  const sleeve = local(track.coverUrl);
  const back = local(track.sleeveBackUrl);
  const archive = ARCHIVE_BY_TRACK.get(track.id);
  if (label || sleeve || back) return { kind: "licensed", labelUrl: label ?? archive?.labelUrl ?? null, sleeveUrl: sleeve ?? archive?.sleeveUrl ?? null, sleeveBackUrl: back };
  if (archive) return { kind: "archive", labelUrl: archive.labelUrl, sleeveUrl: archive.sleeveUrl, sleeveBackUrl: null };
  const dev = DEV_BY_TRACK.get(track.id);
  if (dev) return { kind: "development", labelUrl: dev.labelUrl, sleeveUrl: dev.sleeveUrl, sleeveBackUrl: null };
  return MODEL_PLACEHOLDER_ARTWORK;
}
