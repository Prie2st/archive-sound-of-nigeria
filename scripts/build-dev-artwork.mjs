/**
 * Generates DEVELOPMENT RECORD artwork (docs/RECORD_CHANGE.md §9): a label and a sleeve front for
 * every clearly marked DEV PLACEHOLDER record, so a physical record change is obvious in testing.
 * Simple generated graphics (SVG rendered by sharp) — no third-party or album artwork, never
 * presented as archive content. Hero records keep the model's neutral placeholder art.
 *
 * Output: public/textures/dev-records/<eraId>/<trackId>--label.webp and --sleeve.webp (512², WebP).
 * Usage: npm run artwork:dev
 */
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { ERAS } from "../src/data/eras.ts";
import { DEV_RECORD_ARTWORK } from "../src/stations/recordArtworkCatalog.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const SIZE = 512;
/** Fixture index → colours, cycling (first fixture B warm vermilion, second C deep teal); text in dark ink / paper. */
const PALETTE = [
  { ground: "#c4512f", accent: "#f3d9a4", ink: "#1d1a16", paper: "#faf4e6" },
  { ground: "#1f6f6b", accent: "#e8c35a", ink: "#10201f", paper: "#f2efe4" },
];
const escape = (text) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;");
const FONT = "Arial, Helvetica, sans-serif";

/** Label: a square image whose centre is the spindle; the label circle fills it edge to edge. */
function label({ letter, eraTitle, eraNumber, colours }) {
  const c = SIZE / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}">
  <rect width="${SIZE}" height="${SIZE}" fill="${colours.ground}"/>
  <circle cx="${c}" cy="${c}" r="${c - 4}" fill="${colours.ground}"/>
  <circle cx="${c}" cy="${c}" r="${c - 22}" fill="none" stroke="${colours.accent}" stroke-width="6"/>
  <circle cx="${c}" cy="${c}" r="${c - 44}" fill="none" stroke="${colours.accent}" stroke-width="2"/>
  <text x="${c}" y="${c - 120}" font-family="${FONT}" font-size="22" font-weight="700" text-anchor="middle" fill="${colours.paper}" letter-spacing="2">DEVELOPMENT RECORD</text>
  <text x="${c - 82}" y="${c + 46}" font-family="${FONT}" font-size="130" font-weight="700" text-anchor="middle" fill="${colours.accent}">${letter}</text>
  <circle cx="${c}" cy="${c}" r="14" fill="${colours.ink}"/>
  <text x="${c + 82}" y="${c + 14}" font-family="${FONT}" font-size="40" font-weight="700" text-anchor="middle" fill="${colours.paper}">${eraNumber}</text>
  <text x="${c}" y="${c + 112}" font-family="${FONT}" font-size="30" font-weight="700" text-anchor="middle" fill="${colours.paper}" letter-spacing="3">${escape(eraTitle)}</text>
  <text x="${c}" y="${c + 146}" font-family="${FONT}" font-size="18" text-anchor="middle" fill="${colours.accent}">not historical data</text>
</svg>`;
}

/** Sleeve front: a plain block with the record letter, clearly marked as a placeholder. */
function sleeve({ letter, eraTitle, eraNumber, colours, fixtureIndex }) {
  const stripes = Array.from({ length: 2 + (fixtureIndex % 2) }, (_, i) => `<rect x="0" y="${380 + i * 26}" width="${SIZE}" height="12" fill="${colours.accent}"/>`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}">
  <rect width="${SIZE}" height="${SIZE}" fill="${colours.ground}"/>
  <rect x="20" y="20" width="${SIZE - 40}" height="${SIZE - 40}" fill="none" stroke="${colours.paper}" stroke-width="3"/>
  <text x="48" y="92" font-family="${FONT}" font-size="30" font-weight="700" fill="${colours.paper}" letter-spacing="3">${eraNumber} / ${escape(eraTitle)}</text>
  <text x="48" y="300" font-family="${FONT}" font-size="230" font-weight="700" fill="${colours.accent}">${letter}</text>
  <text x="260" y="220" font-family="${FONT}" font-size="30" font-weight="700" fill="${colours.paper}">DEV RECORD</text>
  <text x="260" y="258" font-family="${FONT}" font-size="22" fill="${colours.paper}">placeholder sleeve</text>
  <text x="260" y="290" font-family="${FONT}" font-size="22" fill="${colours.paper}">not archive content</text>
  ${stripes}
</svg>`;
}

for (const asset of DEV_RECORD_ARTWORK) {
  const era = ERAS[asset.eraIndex];
  const input = { letter: asset.letter, eraTitle: era.title, eraNumber: era.number, colours: PALETTE[asset.fixtureIndex % PALETTE.length], fixtureIndex: asset.fixtureIndex };
  for (const [part, url, svg] of [
    ["label", asset.labelUrl, label(input)],
    ["sleeve", asset.sleeveUrl, sleeve(input)],
  ]) {
    const file = join(root, "public", url);
    mkdirSync(dirname(file), { recursive: true });
    const info = await sharp(Buffer.from(svg)).webp({ quality: 82 }).toFile(file);
    console.log(`${url}  ${part}  ${info.width}×${info.height}  ${(info.size / 1024).toFixed(1)} KiB`);
  }
}
