/**
 * DEVELOPMENT FIXTURES — mechanical test records, NOT historical data (docs/ARCHIVE_CONTENT.md §7).
 *
 * They exist so the record change, the audio engine and the artwork pipeline can be exercised with
 * KNOWN tones and artwork, and so tests that need broken / missing audio never borrow a production
 * record. They never appear in the production archive (tracks.ts). The development record set
 * (`?records=dev`, recordSets.ts) is each era's production hero followed by its fixtures — the
 * three-record playlist the mechanics were built and tuned with.
 *
 * Every fixture carries all four markers (validateArchive.ts checks that they agree):
 * audioAvailability "development", status "placeholder", the id marker and the artist.
 */
import { ARCHIVE_TRACKS_BY_ERA } from "./tracks.ts";
import type { EraId, Track } from "./types.ts";

/** Fixtures per era (each gets a development tone and development artwork). */
export const DEV_FIXTURES_PER_ERA = 2;

/** Every fixture id contains this marker; no archive id may. */
export const DEV_FIXTURE_ID_MARKER = "--dev-placeholder-";
export const DEV_FIXTURE_ARTIST = "DEV PLACEHOLDER";

export const devFixtureId = (eraId: EraId, n: number): string => `${eraId}${DEV_FIXTURE_ID_MARKER}${n}`;

/** `count` development fixtures for an era (1-based numbering; ids are stable). */
export function devFixtureTracks(eraId: EraId, count: number = DEV_FIXTURES_PER_ERA): Track[] {
  return Array.from({ length: count }, (_, i) => ({
    id: devFixtureId(eraId, i + 1),
    eraId,
    contentType: "RECORDING",
    hero: false,
    artist: DEV_FIXTURE_ARTIST,
    title: `Placeholder record ${i + 1} — not historical data`,
    year: null,
    genre: "—",
    historicalNote: "Development-only placeholder for mechanical testing. Not part of the archive.",
    status: "placeholder",
    audioUrl: null,
    audioAvailability: "development",
    coverUrl: null,
    vinylLabelUrl: null,
  }));
}

/** Whether a track is a development fixture (availability is the authoritative marker). */
export const isDevFixture = (track: Pick<Track, "audioAvailability">): boolean => track.audioAvailability === "development";

/** The development record set: each era's production hero, then its fixtures (hero, B, C). */
export const DEV_TRACKS_BY_ERA: Readonly<Record<EraId, readonly Track[]>> = {
  roots: [ARCHIVE_TRACKS_BY_ERA.roots[0], ...devFixtureTracks("roots")],
  recording: [ARCHIVE_TRACKS_BY_ERA.recording[0], ...devFixtureTracks("recording")],
  highlife: [ARCHIVE_TRACKS_BY_ERA.highlife[0], ...devFixtureTracks("highlife")],
  explosion: [ARCHIVE_TRACKS_BY_ERA.explosion[0], ...devFixtureTracks("explosion")],
  transition: [ARCHIVE_TRACKS_BY_ERA.transition[0], ...devFixtureTracks("transition")],
  naija: [ARCHIVE_TRACKS_BY_ERA.naija[0], ...devFixtureTracks("naija")],
  afrobeats: [ARCHIVE_TRACKS_BY_ERA.afrobeats[0], ...devFixtureTracks("afrobeats")],
  global: [ARCHIVE_TRACKS_BY_ERA.global[0], ...devFixtureTracks("global")],
};
