/**
 * The eight eras — canonical order, titles, years and headlines (CLAUDE.md §2).
 * Single source of truth for era content. Station placement lives in hallLayout.ts,
 * joined by `Era.id` (= StationSlot.eraId) and `Era.index` (= StationSlot.index).
 *
 * `shortDescription` is DRAFT copy pending editorial review (`copyStatus`), and every
 * `theme` is provisional until the era visual design milestone.
 */
import { TRACKS_BY_ERA } from "./recordSets.ts";
import { HERO_TRACK_IDS } from "./tracks.ts";
import { ERA_IDS, type ArchiveThesisStage, type Era, type EraAudioState, type EraId, type EraVisualTheme, type Track } from "./types.ts";

/** Neutral stand-in until the era visual design milestone. */
const PROVISIONAL_THEME: EraVisualTheme = {
  accent: "#c9a24a",
  light: { color: "#fff1dc", intensity: 1 },
  graphicTreatment: "provisional",
  status: "placeholder",
};

type EraContent = Pick<Era, "id" | "slug" | "title" | "startYear" | "endYear" | "headline" | "shortDescription">;

/**
 * The archive thesis TRADITION → ADAPTATION → LOCALISATION → EXPORTATION across the eight eras
 * (docs/ARCHIVE_CONTENT.md §1; confirmed mapping — stages span several eras by design). Content only,
 * no UI uses it yet.
 */
const THESIS_STAGE: Record<EraId, ArchiveThesisStage> = {
  roots: "TRADITION",
  recording: "ADAPTATION",
  highlife: "LOCALISATION",
  explosion: "LOCALISATION",
  transition: "LOCALISATION",
  naija: "LOCALISATION",
  afrobeats: "EXPORTATION",
  global: "EXPORTATION",
};

const ERA_CONTENT: readonly EraContent[] = [
  {
    id: "roots",
    slug: "roots",
    title: "ROOTS",
    startYear: 1900,
    endYear: 1919,
    headline: "BEFORE RECORDS, NIGERIA ALREADY HAD HUNDREDS OF MUSICAL LANGUAGES.",
    shortDescription: "Drums, praise poetry and work songs across Nigeria's many peoples — music made for ceremony, labour and community, long before it could be recorded.",
  },
  {
    id: "recording",
    slug: "recording",
    title: "RECORDING",
    startYear: 1920,
    endYear: 1944,
    headline: "MUSIC BECOMES REPRODUCIBLE.",
    shortDescription: "Gramophones and the first commercial recordings carry Nigerian voices onto shellac, while new urban styles such as jùjú take shape.",
  },
  {
    id: "highlife",
    slug: "high-life",
    title: "HIGH-LIFE",
    startYear: 1945,
    endYear: 1966,
    headline: "THE SOUNDTRACK OF A COUNTRY BECOMING MODERN.",
    shortDescription: "Dance bands, horns and guitars fill city nightlife as highlife scores the years around independence in 1960.",
  },
  {
    id: "explosion",
    slug: "explosion",
    title: "EXPLOSION",
    startYear: 1967,
    endYear: 1989,
    headline: "EVERYTHING EXPLODES.",
    shortDescription: "Afrobeat, jùjú, fújì and funk collide as big bands, political songs and a booming record industry reach their peak.",
  },
  {
    id: "transition",
    slug: "transition",
    title: "TRANSITION",
    startYear: 1990,
    endYear: 1999,
    headline: "A NEW GENERATION ASKS WHAT NIGERIAN YOUTH MUSIC SHOULD SOUND LIKE.",
    shortDescription: "Hip hop and R&B influences meet Nigerian languages and street slang as young artists search for a pop sound of their own.",
  },
  {
    id: "naija",
    slug: "naija",
    title: "NAIJA",
    startYear: 2000,
    endYear: 2009,
    headline: "NIGERIAN POP NO LONGER NEEDS SOMEBODY ELSE'S GENRE.",
    shortDescription: "Homegrown stars, labels and music videos give Nigerian pop its own identity and a mass audience at home.",
  },
  {
    id: "afrobeats",
    slug: "afrobeats",
    title: "AFROBEATS",
    startYear: 2010,
    endYear: 2019,
    headline: "THE WORLD STARTS LISTENING.",
    shortDescription: "Afrobeats from Lagos reaches international charts, playlists and stages.",
  },
  {
    id: "global",
    slug: "global",
    title: "GLOBAL",
    startYear: 2020,
    endYear: 2026,
    headline: "NIGERIAN MUSIC DOESN'T NEED TO CROSS OVER ANYMORE.",
    shortDescription: "Nigerian artists collaborate and chart worldwide on their own terms.",
  },
];

export const ERAS: readonly Era[] = ERA_CONTENT.map(
  (content, index): Era => ({
    ...content,
    index,
    number: String(index + 1).padStart(2, "0"),
    dateLabel: `${content.startYear}–${content.endYear}`,
    thesisStage: THESIS_STAGE[content.id],
    copyStatus: "draft",
    heroTrackId: HERO_TRACK_IDS[content.id],
    tracks: TRACKS_BY_ERA[content.id],
    theme: PROVISIONAL_THEME,
  }),
);

const ERA_BY_ID = new Map<EraId, Era>(ERAS.map((era) => [era.id, era]));

// ---------------------------------------------------------------------------
// Era helpers — navigation wraps across all eight eras (GLOBAL → ROOTS, ROOTS ← GLOBAL)
// ---------------------------------------------------------------------------

export const isEraId = (value: unknown): value is EraId => typeof value === "string" && (ERA_IDS as readonly string[]).includes(value);

export function getEra(id: EraId): Era {
  const era = ERA_BY_ID.get(id);
  if (!era) throw new Error(`Unknown era "${id}"`);
  return era;
}

/** Era at a loop index. Any integer is accepted and wrapped (…, −1 = GLOBAL, 8 = ROOTS, …). */
export function getEraByIndex(index: number): Era {
  const count = ERAS.length;
  return ERAS[((Math.trunc(index) % count) + count) % count];
}

export const getNextEra = (id: EraId): Era => getEraByIndex(getEra(id).index + 1);
export const getPreviousEra = (id: EraId): Era => getEraByIndex(getEra(id).index - 1);

/**
 * Steps from `from` to `to` going forward around the loop, in [0, 7]
 * (ROOTS → RECORDING = 1, GLOBAL → ROOTS = 1, ROOTS → GLOBAL = 7).
 */
export function getEraLoopOffset(from: EraId, to: EraId): number {
  const count = ERAS.length;
  return (((getEra(to).index - getEra(from).index) % count) + count) % count;
}

/**
 * Shortest number of stations between two eras around the loop, in either direction,
 * in [0, 4] (ROOTS ↔ GLOBAL = 1, ROOTS ↔ TRANSITION = 4). Never use raw index subtraction.
 */
export function getEraLoopDistance(a: EraId, b: EraId): number {
  const forward = getEraLoopOffset(a, b);
  return Math.min(forward, ERAS.length - forward);
}

// ---------------------------------------------------------------------------
// Track helpers — navigation wraps INSIDE one era and can never reach another era
// ---------------------------------------------------------------------------

export const getHeroTrack = (eraId: EraId): Track => requireTrack(eraId, getEra(eraId).heroTrackId);

/** A track of this era, or undefined — tracks of other eras are never returned. */
export function getTrack(eraId: EraId, trackId: string): Track | undefined {
  return getEra(eraId).tracks.find((track) => track.id === trackId);
}

function requireTrack(eraId: EraId, trackId: string): Track {
  const track = getTrack(eraId, trackId);
  if (!track) throw new Error(`Track "${trackId}" is not in era "${eraId}"`);
  return track;
}

/**
 * Circular step inside ONE playlist, of any length (1 → itself; the last wraps to the first and back).
 * Throws when `trackId` is not in the playlist — a step can never start from, or reach, another era.
 */
export function stepInPlaylist<T extends { id: string }>(playlist: readonly T[], trackId: string, step: 1 | -1): T {
  const index = playlist.findIndex((track) => track.id === trackId);
  if (index < 0) throw new Error(`Track "${trackId}" is not in this playlist`);
  return playlist[(index + step + playlist.length) % playlist.length];
}

function stepTrack(eraId: EraId, trackId: string, step: 1 | -1): Track {
  requireTrack(eraId, trackId);
  return stepInPlaylist(getEra(eraId).tracks, trackId, step);
}

/** Next record in this era's playlist (wraps to the first). Throws for a track from another era. */
export const getNextTrack = (eraId: EraId, trackId: string): Track => stepTrack(eraId, trackId, 1);

/** Previous record in this era's playlist (wraps to the last). Throws for a track from another era. */
export const getPreviousTrack = (eraId: EraId, trackId: string): Track => stepTrack(eraId, trackId, -1);

/** Initial listening state for an era: hero track selected, not yet visited (CLAUDE.md §4). */
export const createInitialEraAudioState = (eraId: EraId): EraAudioState => ({
  eraId,
  selectedTrackId: getEra(eraId).heroTrackId,
  visited: false,
});
