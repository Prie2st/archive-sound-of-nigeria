/**
 * Content validation for the archive (docs/CONTENT_PIPELINE.md §10, docs/ARCHIVE_CONTENT.md §10).
 *
 * `validateArchive` inspects era playlists and returns every problem it finds, in a deterministic
 * order (era order, then playlist order, then rule order). It never modifies, sorts or repairs the
 * data — fixing content is an editorial decision. `assertValidArchive` throws one error listing them.
 * `validateProductionArchive` adds the production scope rules (8 eras × 5 entries, no fixtures,
 * catalogue numbers, ROOTS as tradition references).
 *
 * Plain TypeScript (Node tests and scripts/check-content.mjs import it).
 */
import { ARTWORK_FIELD_PART, TRACK_ID_PATTERN, parseRecordArtworkPath, parseRecordAudioPath } from "./contentPaths.ts";
import { DEV_FIXTURE_ARTIST, DEV_FIXTURE_ID_MARKER } from "./devFixtures.ts";
import { PRODUCTION_AUDIO_URLS } from "./productionAudio.ts";
import { ERA_IDS, type Era, type EraId, type Track } from "./types.ts";

export type ArchiveIssueCode =
  | "playlist-empty"
  | "required-field"
  | "id-format"
  | "duplicate-track-id"
  | "unknown-era"
  | "era-mismatch"
  | "hero-missing"
  | "hero-not-first"
  | "hero-is-fixture"
  | "year-invalid"
  | "year-outside-era"
  | "fixture-marking"
  | "fixture-before-archive"
  | "fixture-artwork"
  | "audio-availability"
  | "audio-url-required"
  | "audio-url-not-permitted"
  | "audio-path"
  | "artwork-path"
  | "duration-invalid"
  | "content-type"
  | "tradition-reference"
  | "hero-flag"
  | "catalogue-number"
  | "significance"
  | "year-label"
  | "production-era-count"
  | "production-playlist-size"
  | "production-total"
  | "production-fixture"
  | "production-catalogue-missing"
  | "production-roots-reference";

export interface ArchiveIssue {
  code: ArchiveIssueCode;
  eraId: string;
  /** Offending track (absent for era-level issues). */
  trackId?: string;
  /** 0-based playlist position of the track. */
  position?: number;
  message: string;
}

/** The era fields validation needs (synthetic test eras supply just these). */
export type ArchiveEra = Pick<Era, "id" | "startYear" | "endYear" | "heroTrackId" | "tracks">;

const AVAILABILITIES = ["available", "preview", "pending", "unavailable", "development"] as const;
const CONTENT_TYPES = ["RECORDING", "ARTIST_REFERENCE", "TRADITION_REFERENCE"] as const;

/** Significance lines stay short: at most two sentences and this many characters. */
export const SIGNIFICANCE_MAX_CHARS = 240;
/** Sentences in a significance line. Abbreviations ("No. 9", "ft.", "St.") and initials ("G.T.") do not end one. */
export const sentenceCount = (text: string) =>
  text.split(/(?<!\b(?:No|ft|St|Mr|Dr|vs|[A-Z]))[.!?](?=\s+[A-Z0-9]|\s*$)/).filter((part) => part.trim() !== "").length;

/** Catalogue number for an era (by canonical order) and 0-based playlist position: "A03-04". */
export const catalogueNumberFor = (eraId: EraId, position: number): string =>
  `A${String(ERA_IDS.indexOf(eraId) + 1).padStart(2, "0")}-${String(position + 1).padStart(2, "0")}`;

/** Every development marker a track carries; a fixture carries all four, an archive record none. */
function fixtureMarkers(track: Track) {
  return {
    availability: track.audioAvailability === "development",
    status: track.status === "placeholder",
    id: track.id.includes(DEV_FIXTURE_ID_MARKER),
    artist: track.artist === DEV_FIXTURE_ARTIST,
  };
}

export function validateArchive(eras: readonly ArchiveEra[]): ArchiveIssue[] {
  const issues: ArchiveIssue[] = [];
  const seen = new Map<string, string>();

  for (const era of eras) {
    const report = (code: ArchiveIssueCode, message: string, track?: Track, position?: number) =>
      issues.push({ code, eraId: era.id, ...(track ? { trackId: track.id, position } : {}), message: `${era.id}${track ? ` / ${track.id} (#${(position ?? 0) + 1})` : ""}: ${message}` });

    if (!(ERA_IDS as readonly string[]).includes(era.id)) report("unknown-era", `"${era.id}" is not a canonical era id`);
    if (era.tracks.length === 0) {
      report("playlist-empty", "the playlist has no records (every era needs at least its hero record)");
      continue;
    }

    // --- hero ---
    const heroIndex = era.tracks.findIndex((track) => track.id === era.heroTrackId);
    if (heroIndex < 0) report("hero-missing", `hero record "${era.heroTrackId}" is not in this era's playlist`);
    else {
      if (heroIndex !== 0) report("hero-not-first", `the hero record must be first (found at #${heroIndex + 1})`, era.tracks[heroIndex], heroIndex);
      if (fixtureMarkers(era.tracks[heroIndex]).availability) report("hero-is-fixture", "the hero record is a development fixture", era.tracks[heroIndex], heroIndex);
    }

    let fixtureSeen = false;
    era.tracks.forEach((track, position) => {
      const issue = (code: ArchiveIssueCode, message: string) => report(code, message, track, position);

      // --- identity ---
      for (const field of ["id", "title", "genre"] as const) {
        if (typeof track[field] !== "string" || track[field].trim() === "") issue("required-field", `"${field}" is empty`);
      }
      if (!(CONTENT_TYPES as readonly string[]).includes(track.contentType)) {
        issue("content-type", `contentType "${String(track.contentType)}" is not one of ${CONTENT_TYPES.join(" / ")}`);
      } else if (track.contentType === "TRADITION_REFERENCE") {
        // A tradition is not a commercial record: no performer, no release year, but a named tradition.
        if (track.artist !== null) issue("tradition-reference", `a tradition reference has no artist (found "${track.artist}")`);
        if (!track.tradition?.trim()) issue("tradition-reference", `a tradition reference names its tradition (e.g. "Yorùbá")`);
        if ((track.year !== null || track.yearLabel !== undefined) && !track.yearNote?.trim()) issue("tradition-reference", "a tradition reference carries no release year (explain any date in yearNote)");
      } else {
        if (typeof track.artist !== "string" || track.artist.trim() === "") issue("required-field", `"artist" is empty (only a TRADITION_REFERENCE has no artist)`);
        if (track.tradition !== undefined) issue("tradition-reference", `"tradition" is only for TRADITION_REFERENCE entries`);
      }
      if (typeof track.hero !== "boolean" || track.hero !== (track.id === era.heroTrackId)) {
        issue("hero-flag", track.id === era.heroTrackId ? "the era's hero record must have hero: true" : "only the era's hero record has hero: true");
      }
      if (track.yearLabel !== undefined && track.yearLabel.trim() === "") issue("year-label", "yearLabel is empty (omit it instead)");
      if (track.catalogueNumber !== undefined && (ERA_IDS as readonly string[]).includes(era.id)) {
        const expected = catalogueNumberFor(era.id, position);
        if (track.catalogueNumber !== expected) issue("catalogue-number", `catalogue number "${track.catalogueNumber}" must be "${expected}" (era number + playlist position)`);
      }
      if (typeof track.historicalNote === "string" && track.historicalNote.trim() !== "" && track.status !== "placeholder") {
        const note = track.historicalNote.trim();
        if (note.length > SIGNIFICANCE_MAX_CHARS || sentenceCount(note) > 2) {
          issue("significance", `significance line is ${note.length} characters / ${sentenceCount(note)} sentences; keep it to 1–2 short sentences (≤ ${SIGNIFICANCE_MAX_CHARS} characters)`);
        }
      }
      if (typeof track.historicalNote !== "string") issue("required-field", `"historicalNote" must be a string`);
      if (!TRACK_ID_PATTERN.test(track.id)) issue("id-format", `id must be lower-case letters / digits joined by hyphens (used in file paths)`);
      const first = seen.get(track.id);
      if (first) issue("duplicate-track-id", `id already used by ${first}`);
      else seen.set(track.id, `${era.id} #${position + 1}`);
      if (track.eraId !== era.id) issue("era-mismatch", `eraId is "${track.eraId}" but the record is in the ${era.id} playlist`);

      // --- year ---
      if (track.year !== null) {
        if (!Number.isInteger(track.year)) issue("year-invalid", `year ${track.year} is not a whole year`);
        else if ((track.year < era.startYear || track.year > era.endYear) && !track.yearNote?.trim()) {
          issue("year-outside-era", `year ${track.year} lies outside ${era.startYear}–${era.endYear}; correct it or explain it in "yearNote"`);
        }
      }

      // --- development fixtures ---
      const markers = fixtureMarkers(track);
      const isFixture = markers.availability;
      const marked = Object.entries(markers).filter(([, on]) => on).map(([name]) => name);
      if (marked.length > 0 && marked.length < 4) {
        issue("fixture-marking", `inconsistent development markers (${marked.join(", ")}); a fixture needs audioAvailability "development", status "placeholder", the "${DEV_FIXTURE_ID_MARKER}" id marker and artist "${DEV_FIXTURE_ARTIST}" — an archive record none of them`);
      }
      if (isFixture) fixtureSeen = true;
      else if (fixtureSeen) issue("fixture-before-archive", "archive records must come before the development fixtures");
      if (isFixture && (track.coverUrl !== null || track.vinylLabelUrl !== null || (track.sleeveBackUrl ?? null) !== null)) {
        issue("fixture-artwork", "development fixtures use generated development artwork; their artwork URLs must stay null");
      }

      // --- audio ---
      if (!(AVAILABILITIES as readonly string[]).includes(track.audioAvailability)) {
        issue("audio-availability", `audioAvailability "${String(track.audioAvailability)}" is not one of ${AVAILABILITIES.join(" / ")}`);
      } else if (track.audioAvailability === "available" || track.audioAvailability === "preview") {
        if (track.audioUrl === null) issue("audio-url-required", `audioAvailability "${track.audioAvailability}" needs an audioUrl`);
        else {
          const parsed = parseRecordAudioPath(track.audioUrl);
          const preview = track.audioAvailability === "preview";
          const supplied = !preview && PRODUCTION_AUDIO_URLS[track.id] === track.audioUrl;
          if (!parsed || parsed.eraId !== era.id || (!supplied && parsed.trackId !== track.id) || parsed.preview !== preview) {
            issue("audio-path", `audioUrl "${track.audioUrl}" must match its supplied production mapping or /audio/${era.id}/${track.id}${preview ? ".preview" : ""}.<mp3|m4a|aac|ogg|opus|webm|wav|flac>`);
          }
        }
      } else if (track.audioUrl !== null) {
        issue("audio-url-not-permitted", `audioUrl is set but audioAvailability is "${track.audioAvailability}"; a file plays only when it is declared "available" or "preview"`);
      }
      if (track.durationSeconds !== undefined && track.durationSeconds !== null && !(Number.isFinite(track.durationSeconds) && track.durationSeconds > 0)) {
        issue("duration-invalid", `durationSeconds ${track.durationSeconds} must be a positive number of seconds (or null)`);
      }

      // --- artwork ---
      for (const [field, part] of Object.entries(ARTWORK_FIELD_PART) as [keyof typeof ARTWORK_FIELD_PART, string][]) {
        const url = track[field];
        if (url === null || url === undefined || isFixture) continue;
        const parsed = parseRecordArtworkPath(url);
        if (!parsed || parsed.eraId !== era.id || parsed.trackId !== track.id || parsed.part !== part) {
          issue("artwork-path", `${field} "${url}" must be /textures/records/${era.id}/${track.id}/${part}.<webp|png|jpg|jpeg>`);
        }
      }
    });
  }
  return issues;
}

/** Production scope (docs/ARCHIVE_CONTENT.md §2). */
export const PRODUCTION_ENTRIES_PER_ERA = 5;

/**
 * The production archive rules on top of validateArchive: exactly the eight canonical eras in order,
 * exactly five entries each (40 in total), no development fixtures, a catalogue number on every entry,
 * a non-empty significance line, and ROOTS made only of tradition references.
 */
export function validateProductionArchive(eras: readonly ArchiveEra[]): ArchiveIssue[] {
  const issues = validateArchive(eras);
  const add = (code: ArchiveIssueCode, eraId: string, message: string, track?: Track, position?: number) =>
    issues.push({ code, eraId, ...(track ? { trackId: track.id, position } : {}), message: `${eraId}${track ? ` / ${track.id} (#${(position ?? 0) + 1})` : ""}: ${message}` });

  const ids = eras.map((era) => era.id);
  if (ids.length !== ERA_IDS.length || ids.some((id, i) => id !== ERA_IDS[i])) add("production-era-count", "archive", `expected the eight eras in canonical order (${ERA_IDS.join(", ")}), found ${ids.join(", ")}`);
  let total = 0;
  for (const era of eras) {
    total += era.tracks.length;
    if (era.tracks.length !== PRODUCTION_ENTRIES_PER_ERA) add("production-playlist-size", era.id, `has ${era.tracks.length} entries; the production archive has exactly ${PRODUCTION_ENTRIES_PER_ERA} per era`);
    era.tracks.forEach((track, position) => {
      const markers = fixtureMarkers(track);
      if (markers.availability || markers.status || markers.id || markers.artist) add("production-fixture", era.id, "a development fixture (or fixture marker) is in the production archive", track, position);
      if (!track.catalogueNumber) add("production-catalogue-missing", era.id, `needs catalogue number "${catalogueNumberFor(era.id, position)}"`, track, position);
      if (track.historicalNote.trim() === "") add("production-catalogue-missing", era.id, "needs its significance line (historicalNote)", track, position);
      if (era.id === "roots" && track.contentType !== "TRADITION_REFERENCE") add("production-roots-reference", era.id, "ROOTS entries are listening references to traditions (contentType TRADITION_REFERENCE)", track, position);
    });
  }
  const expectedTotal = ERA_IDS.length * PRODUCTION_ENTRIES_PER_ERA;
  if (total !== expectedTotal) add("production-total", "archive", `has ${total} entries; expected ${expectedTotal}`);
  return issues;
}

/** Throws one error listing every issue (no-op for a valid archive). */
export function assertValidArchive(eras: readonly ArchiveEra[]): void {
  const issues = validateArchive(eras);
  if (issues.length > 0) throw new Error(`Archive content has ${issues.length} issue(s):\n${issues.map((i) => `  [${i.code}] ${i.message}`).join("\n")}`);
}
