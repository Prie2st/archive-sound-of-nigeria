/**
 * How an archive entry is worded for the visitor (overlay, generated artwork) — docs/ARCHIVE_CONTENT.md §6.
 * One place decides the honest phrasing per content type, so a tradition is never dressed up as a
 * commercial single and an uncertain date is never shown as an exact one.
 *
 * Plain TypeScript.
 */
import type { Track } from "./types.ts";

export interface TrackDisplay {
  /** "Listening reference" for traditions and artist references; null for a single identified recording. */
  kicker: string | null;
  /** The record / reference title. */
  title: string;
  /** Artist, or "<tradition> musical tradition". */
  byline: string;
  /** Year wording (yearLabel ?? year), or null when no date is confirmed / applicable. */
  date: string | null;
  genre: string;
  /** "A03-04" — null for development fixtures. */
  catalogueNumber: string | null;
}

export function describeTrack(track: Track): TrackDisplay {
  const isTradition = track.contentType === "TRADITION_REFERENCE";
  return {
    kicker: track.contentType === "RECORDING" ? null : "Listening reference",
    title: track.title,
    byline: isTradition ? `${track.tradition ?? ""} musical tradition`.trim() : (track.artist ?? ""),
    date: isTradition ? null : (track.yearLabel ?? (track.year !== null ? String(track.year) : null)),
    genre: track.genre,
    catalogueNumber: track.catalogueNumber ?? null,
  };
}
