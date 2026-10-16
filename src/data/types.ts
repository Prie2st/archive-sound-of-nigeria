/**
 * Content model for the eight eras and their tracks (CLAUDE.md §2–§4).
 * Spatial data (station positions, camera anchors) lives in hallLayout.ts and is
 * joined to eras only through the stable `EraId`.
 */

/** Canonical era IDs, in historical (and loop) order. */
export const ERA_IDS = ["roots", "recording", "highlife", "explosion", "transition", "naija", "afrobeats", "global"] as const;

export type EraId = (typeof ERA_IDS)[number];

/**
 * Editorial status of a piece of content.
 *   verified    — checked against the authoritative dataset
 *   draft       — believed correct, pending editorial / source review
 *   placeholder — development-only stand-in, NOT historical data; never ship it
 */
export type ContentStatus = "verified" | "draft" | "placeholder";

/**
 * Art for a record. URLs are null until licensed assets are supplied (CLAUDE.md §4, §9); paths follow
 * /textures/records/<eraId>/<trackId>/{sleeve-front|label|sleeve-back}.<webp|png|jpg> (docs/CONTENT_PIPELINE.md §4).
 */
export interface TrackArtwork {
  /** Square album sleeve front (SleeveFront). */
  coverUrl: string | null;
  /** Square image with circular label art, centre = spindle (Label). */
  vinylLabelUrl: string | null;
  /** Square sleeve back (SleeveBack); optional — omitted / null keeps the neutral back. */
  sleeveBackUrl?: string | null;
}

/**
 * Whether — and how — a record can be heard. Always explicit: the existence of a title never implies
 * permission to play anything (docs/CONTENT_PIPELINE.md §5).
 *   available    licensed full-length local file; `audioUrl` required
 *   preview      licensed excerpt only; `audioUrl` required (…/<trackId>.preview.<ext>)
 *   pending      expected from the project owner, not supplied yet; `audioUrl` null
 *   unavailable  shown in the archive but never played (no rights / no recording); `audioUrl` null
 *   development  mechanical test fixture (synthetic development tone); `audioUrl` null
 */
export type AudioAvailability = "available" | "preview" | "pending" | "unavailable" | "development";

/** Optional rights / provenance notes for a record's audio and artwork (never fetched, never inferred). */
export interface TrackRights {
  /** Rights holder or licensor, as supplied by the project owner. */
  holder?: string;
  /** Licence / permission reference (e.g. agreement id). */
  licence?: string;
  note?: string;
}

/**
 * What an archive entry IS (docs/ARCHIVE_CONTENT.md §5):
 *   RECORDING            one identified recording (artist + title)
 *   ARTIST_REFERENCE     a listening reference to an artist's recordings where no single title / date is
 *                        confirmed (e.g. "Early Jùjú Recordings") — never presented as one dated single
 *   TRADITION_REFERENCE  a living musical tradition (ROOTS): no artist, no release year — never presented as
 *                        a commercial record
 */
export type TrackContentType = "RECORDING" | "ARTIST_REFERENCE" | "TRADITION_REFERENCE";

export interface TrackSource {
  label: string;
  url?: string;
}

export interface Track extends TrackArtwork {
  /** Globally unique, stable. */
  id: string;
  /** The era this track belongs to. A track is only ever playable inside its own era. */
  eraId: EraId;
  contentType: TrackContentType;
  /** The era's default record (exactly one per era, first in the playlist). */
  hero: boolean;
  /** Museum catalogue number "A<era>-<position>", e.g. "A03-04" (archive entries only; fixtures have none). */
  catalogueNumber?: string;
  /** Performer; null for a TRADITION_REFERENCE (a tradition has no artist). */
  artist: string | null;
  /** TRADITION_REFERENCE only: the people / culture carrying it, e.g. "Yorùbá" (shown as "Yorùbá musical tradition"). */
  tradition?: string;
  /** Recording / title, or the tradition's name for a TRADITION_REFERENCE. */
  title: string;
  /** Release / recording year; null when not confirmed or not applicable. Must fall inside the era unless `yearNote` explains why. */
  year: number | null;
  /** Display wording when the date is approximate or qualified, e.g. "1930s", "2013/14", "1982 international release". */
  yearLabel?: string;
  /** Why a year lies outside its era's date range (e.g. a later field recording of a tradition). */
  yearNote?: string;
  /** Genre / style. */
  genre: string;
  /** The museum significance line: 1–2 short sentences, grounded in the archive research. */
  historicalNote: string;
  /** Lazy-loaded local audio file (/audio/<eraId>/<trackId>[.preview].<ext>); null unless `audioAvailability` is available / preview. */
  audioUrl: string | null;
  /** Explicit playback availability (see AudioAvailability). */
  audioAvailability: AudioAvailability;
  /** Length of the supplied audio file in seconds, if known. */
  durationSeconds?: number | null;
  rights?: TrackRights;
  status: ContentStatus;
  location?: string;
  /** Musical elements this record carries forward (supports the GLOBAL → ROOTS narrative). */
  musicalDNA?: readonly string[];
  sources?: readonly TrackSource[];
}

/**
 * Era look. Provisional values until the era visual design milestone; kept small on
 * purpose — extend when that milestone defines what it needs.
 */
export interface EraVisualTheme {
  /** Accent colour for typography / graphics (CSS colour). */
  accent: string;
  /** Key light for the station zone. */
  light: { color: string; intensity: number };
  /** Keyword describing the graphic treatment. */
  graphicTreatment: string;
  status: ContentStatus;
}

/** The archive thesis (docs/ARCHIVE_CONTENT.md §1). Content only — no UI uses it yet. */
export const ARCHIVE_THESIS = ["TRADITION", "ADAPTATION", "LOCALISATION", "EXPORTATION"] as const;
export type ArchiveThesisStage = (typeof ARCHIVE_THESIS)[number];

export interface Era {
  id: EraId;
  /** 0-based position in the loop; matches STATION_SLOTS[index] in hallLayout.ts. */
  index: number;
  /** Display number, e.g. "01". */
  number: string;
  /** URL-safe name. */
  slug: string;
  title: string;
  startYear: number;
  endYear: number;
  /** e.g. "1900–1919" (en dash). */
  dateLabel: string;
  /** The era statement (canonical). */
  headline: string;
  /** Where the era sits in TRADITION → ADAPTATION → LOCALISATION → EXPORTATION (eras.ts THESIS_STAGE). */
  thesisStage: ArchiveThesisStage;
  shortDescription: string;
  /** Status of `shortDescription` (title, years and headline are canonical). */
  copyStatus: ContentStatus;
  /** Initially selected record (CLAUDE.md §4). Must be one of `tracks`. */
  heroTrackId: string;
  /** This era's playlist, in display order. Hero first. */
  tracks: readonly Track[];
  theme: EraVisualTheme;
}

/**
 * Per-era listening state for the future audio/record layer (CLAUDE.md §4):
 * the hero track is selected on the first visit; later visits keep the last record.
 */
export interface EraAudioState {
  eraId: EraId;
  selectedTrackId: string;
  visited: boolean;
}
