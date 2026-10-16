/**
 * Content check (docs/ARCHIVE_CONTENT.md §10, docs/CONTENT_PIPELINE.md §10): validates the PRODUCTION
 * archive (validateProductionArchive: 8 eras × 5 entries, catalogue numbers, ROOTS as tradition
 * references, no fixtures, plus every generic rule) and the development record set, then checks that
 * every declared licensed file, every generated archive artwork file and every development asset exists
 * under /public. Reports per era; never modifies data or files. Exit code 1 on any problem.
 *
 * Usage: npm run check:content
 */
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DEV_AUDIO_ASSETS } from "../src/audio/devAudioAssets.ts";
import { DEV_TRACKS_BY_ERA } from "../src/data/devFixtures.ts";
import { ERAS } from "../src/data/eras.ts";
import { ACTIVE_RECORD_SET } from "../src/data/recordSets.ts";
import { describeTrack } from "../src/data/trackDisplay.ts";
import { validateArchive, validateProductionArchive } from "../src/data/validateArchive.ts";
import { ARCHIVE_ARTWORK, DEV_RECORD_ARTWORK } from "../src/stations/recordArtworkCatalog.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const publicFile = (url) => join(root, "public", ...url.split("/").filter(Boolean));

if (ACTIVE_RECORD_SET !== "archive") throw new Error("check:content must run on the production archive (unset ARCHIVE_RECORDS)");

const problems = [
  ...validateProductionArchive(ERAS).map((issue) => `[${issue.code}] ${issue.message}`),
  ...validateArchive(ERAS.map((era) => ({ ...era, tracks: DEV_TRACKS_BY_ERA[era.id] }))).map((issue) => `[dev set · ${issue.code}] ${issue.message}`),
];

for (const era of ERAS) {
  for (const track of era.tracks) {
    for (const field of ["audioUrl", "coverUrl", "vinylLabelUrl", "sleeveBackUrl"]) {
      const url = track[field];
      if (url && !existsSync(publicFile(url))) problems.push(`[missing-file] ${era.id} / ${track.id}: ${field} ${url} does not exist in /public`);
    }
  }
}
for (const asset of ARCHIVE_ARTWORK) {
  for (const url of [asset.labelUrl, asset.sleeveUrl]) if (!existsSync(publicFile(url))) problems.push(`[missing-archive-artwork] ${url} (run npm run artwork:archive)`);
}
for (const asset of DEV_AUDIO_ASSETS) if (!existsSync(publicFile(asset.url))) problems.push(`[missing-dev-audio] ${asset.url} (run npm run audio:dev)`);
for (const asset of DEV_RECORD_ARTWORK) {
  for (const url of [asset.labelUrl, asset.sleeveUrl]) if (!existsSync(publicFile(url))) problems.push(`[missing-dev-artwork] ${url} (run npm run artwork:dev)`);
}

console.log("production archive");
for (const era of ERAS) {
  console.log(`\n${era.number} ${era.title} · ${era.dateLabel} · ${era.thesisStage}`);
  for (const track of era.tracks) {
    const d = describeTrack(track);
    const date = d.date ?? "—";
    console.log(`  ${d.catalogueNumber}${track.hero ? " ★" : "  "} ${d.byline} — ${d.title}  ·  ${date}  ·  ${d.genre}  ·  audio ${track.audioAvailability}${d.kicker ? `  ·  ${d.kicker}` : ""}`);
  }
}
const total = ERAS.reduce((sum, era) => sum + era.tracks.length, 0);
console.log(`\n${total} entries · ${ARCHIVE_ARTWORK.length * 2} generated artwork files · ${DEV_AUDIO_ASSETS.length} development tones`);
if (problems.length) {
  console.error(`\n${problems.length} problem(s):\n${problems.map((p) => `  ${p}`).join("\n")}`);
  process.exit(1);
}
console.log("content OK");
