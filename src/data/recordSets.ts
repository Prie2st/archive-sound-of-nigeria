/**
 * Which records the museum plays (docs/ARCHIVE_CONTENT.md §7).
 *
 *   archive  the production archive — 8 eras × 5 entries (tracks.ts). Default, and the only set in
 *            production builds.
 *   dev      the mechanical development set — each era's hero + two development fixtures with known
 *            tones and artwork (devFixtures.ts). Development builds only.
 *
 * Chosen ONCE when the data loads (the era data is static):
 *   browser  `?records=dev` (ignored when NODE_ENV is "production")
 *   Node     ARCHIVE_RECORDS=dev — tests that need fixtures import ./useDevRecordSet.ts first
 *
 * Plain TypeScript.
 */
import { DEV_TRACKS_BY_ERA } from "./devFixtures.ts";
import { ARCHIVE_TRACKS_BY_ERA } from "./tracks.ts";
import type { EraId, Track } from "./types.ts";

export type RecordSet = "archive" | "dev";

export const RECORD_SETS: Readonly<Record<RecordSet, Readonly<Record<EraId, readonly Track[]>>>> = {
  archive: ARCHIVE_TRACKS_BY_ERA,
  dev: DEV_TRACKS_BY_ERA,
};

/** Resolves the record set from a URL query and the environment (pure; exported for tests). */
export function resolveRecordSet(search: string | undefined, env: { NODE_ENV?: string; ARCHIVE_RECORDS?: string }): RecordSet {
  if (env.NODE_ENV === "production") return "archive";
  if (search !== undefined && new URLSearchParams(search).get("records") === "dev") return "dev";
  return env.ARCHIVE_RECORDS === "dev" ? "dev" : "archive";
}

const readEnv = () => {
  // NODE_ENV is inlined by Next in browser bundles; ARCHIVE_RECORDS only exists in Node (tests).
  const nodeEnv = process.env.NODE_ENV;
  const records = typeof process !== "undefined" ? process.env?.ARCHIVE_RECORDS : undefined;
  return { NODE_ENV: nodeEnv, ARCHIVE_RECORDS: records };
};

export const ACTIVE_RECORD_SET: RecordSet = resolveRecordSet((globalThis as { location?: { search?: string } }).location?.search, readEnv());

/** Each era's playlist in the active record set. */
export const TRACKS_BY_ERA: Readonly<Record<EraId, readonly Track[]>> = RECORD_SETS[ACTIVE_RECORD_SET];
