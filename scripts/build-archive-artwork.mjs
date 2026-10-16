/**
 * Generates the MUSEUM FALLBACK ARTWORK for every production archive entry (docs/ARCHIVE_CONTENT.md §8):
 * one sleeve front and one circular label per entry, as small static WebP files in
 * public/textures/archive/<eraId>/<trackId>--{sleeve,label}.webp (paths from recordArtworkCatalog.ts).
 *
 * One reusable composition, not 40 hand-made ones. Variation comes only from data:
 *   era        → palette (src/data/archiveArtTokens.ts) and era line
 *   genre      → background pattern family (rings · bands · dots · diagonals · arcs · waves)
 *   track id   → pattern parameters (offset, spacing, scale) — deterministic hash
 *   metadata   → catalogue number, title, artist / tradition, date, style (src/data/trackDisplay.ts wording)
 * Tradition references (ROOTS) become "listening reference" cards: no artist, no release date.
 *
 * Contains no third-party artwork: typography and geometry only. Supplied artwork, when it exists,
 * takes precedence at runtime (recordArtworkCatalog.ts) — nothing here is fetched from anywhere.
 *
 * Usage: npm run artwork:archive                       (all entries)
 *        npm run artwork:archive -- <trackId> [...]     (only those entries, e.g. after an editorial change)
 */
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { ERA_ART_TOKENS, artHash, artPatternFor } from "../src/data/archiveArtTokens.ts";
import { ERAS } from "../src/data/eras.ts";
import { describeTrack } from "../src/data/trackDisplay.ts";
import { ARCHIVE_ARTWORK } from "../src/stations/recordArtworkCatalog.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const SIZE = 512;
const SANS = "Arial, Helvetica, sans-serif";
const SERIF = "Georgia, 'Times New Roman', serif";
const escape = (text) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Greedy word wrap by an approximate character budget; at most `maxLines` (the last line is ellipsised). */
function wrap(text, maxChars, maxLines) {
  const lines = [];
  let line = "";
  for (const word of text.split(/\s+/)) {
    const next = line ? `${line} ${word}` : word;
    if (next.length > maxChars && line) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    lines.length = maxLines;
    lines[maxLines - 1] = `${lines[maxLines - 1].replace(/\s+\S*$/, "")}…`;
  }
  return lines;
}

/** Background pattern in the accent colour (an SVG group), parameterised by the entry's hash. */
function pattern(kind, seed, colour) {
  const r = (n, min, max) => min + (((seed >>> (n * 4)) & 0xff) / 255) * (max - min);
  const parts = [];
  if (kind === "rings") {
    const cx = r(0, 300, 470), cy = r(1, 300, 470), step = r(2, 16, 26);
    for (let radius = step; radius < 720; radius += step) parts.push(`<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${radius.toFixed(1)}" fill="none" stroke="${colour}" stroke-width="1.6"/>`);
  } else if (kind === "bands") {
    let y = r(0, 0, 14);
    let i = 0;
    while (y < SIZE) {
      const h = 2 + ((seed >>> (i % 28)) & 3) * 2;
      parts.push(`<rect x="0" y="${y.toFixed(1)}" width="${SIZE}" height="${h}" fill="${colour}"/>`);
      y += h + r(1, 8, 16);
      i++;
    }
  } else if (kind === "dots") {
    const step = r(0, 16, 24), radius = r(1, 1.6, 3.2), dx = r(2, 0, step);
    for (let y = step / 2; y < SIZE; y += step) for (let x = (dx % step); x < SIZE; x += step) parts.push(`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${radius.toFixed(2)}" fill="${colour}"/>`);
  } else if (kind === "diagonals") {
    const step = r(0, 14, 24), offset = r(1, 0, step);
    for (let x = -SIZE + offset; x < SIZE * 2; x += step) parts.push(`<line x1="${x.toFixed(1)}" y1="0" x2="${(x + SIZE).toFixed(1)}" y2="${SIZE}" stroke="${colour}" stroke-width="1.8"/>`);
  } else if (kind === "arcs") {
    const step = r(0, 18, 30);
    const corners = [[0, SIZE], [SIZE, 0]];
    for (const [cx, cy] of corners) for (let radius = step; radius < SIZE * 0.9; radius += step) parts.push(`<circle cx="${cx}" cy="${cy}" r="${radius.toFixed(1)}" fill="none" stroke="${colour}" stroke-width="1.6"/>`);
  } else {
    const amplitude = r(0, 5, 12), period = r(1, 70, 130), step = r(2, 18, 28), phase = r(3, 0, period);
    for (let y = step / 2; y < SIZE + amplitude; y += step) {
      let d = `M 0 ${y.toFixed(1)}`;
      for (let x = 8; x <= SIZE; x += 8) d += ` L ${x} ${(y + amplitude * Math.sin(((x + phase) / period) * Math.PI * 2)).toFixed(1)}`;
      parts.push(`<path d="${d}" fill="none" stroke="${colour}" stroke-width="1.6"/>`);
    }
  }
  return parts.join("");
}

function sleeve({ era, display, tokens, kind, seed, position, count }) {
  const titleLines = wrap(display.title, 20, 3);
  const titleSize = titleLines.length > 2 ? 34 : 40;
  const titleTop = 300 - (titleLines.length - 1) * titleSize * 0.55;
  const title = titleLines
    .map((line, i) => `<text x="40" y="${(titleTop + i * titleSize * 1.12).toFixed(1)}" font-family="${SERIF}" font-size="${titleSize}" fill="${tokens.paper}">${escape(line)}</text>`)
    .join("");
  const bylineY = titleTop + titleLines.length * titleSize * 1.12 + 6;
  // Dates keep their own case ("1930s"); only the style is set in capitals.
  const footer = [display.date, display.genre.toUpperCase()].filter(Boolean).join("  ·  ");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}">
  <rect width="${SIZE}" height="${SIZE}" fill="${tokens.ground}"/>
  <g opacity="0.16">${pattern(kind, seed, tokens.accent)}</g>
  <rect x="18" y="18" width="${SIZE - 36}" height="${SIZE - 36}" fill="none" stroke="${tokens.paper}" stroke-opacity="0.35" stroke-width="1.5"/>
  <text x="40" y="60" font-family="${SANS}" font-size="15" font-weight="700" letter-spacing="6" fill="${tokens.paper}">ARCHIVE</text>
  <text x="472" y="60" font-family="${SANS}" font-size="11" letter-spacing="3" text-anchor="end" fill="${tokens.paper}" fill-opacity="0.75">THE SOUND OF NIGERIA</text>
  <line x1="40" y1="74" x2="472" y2="74" stroke="${tokens.accent}" stroke-width="1.5"/>
  <text x="40" y="100" font-family="${SANS}" font-size="13" letter-spacing="3" fill="${tokens.accent}">${era.number} · ${escape(era.title)} · ${era.dateLabel}</text>
  <text x="34" y="${display.kicker ? 196 : 210}" font-family="${SANS}" font-size="88" font-weight="700" letter-spacing="-2" fill="${tokens.accent}">${display.catalogueNumber}</text>
  ${display.kicker ? `<text x="40" y="236" font-family="${SERIF}" font-size="16" font-style="italic" fill="${tokens.paper}" fill-opacity="0.85">${escape(display.kicker)}</text>` : ""}
  ${title}
  <text x="40" y="${bylineY.toFixed(1)}" font-family="${SANS}" font-size="16" letter-spacing="3" fill="${tokens.paper}" fill-opacity="0.9">${escape(display.byline.toUpperCase())}</text>
  <line x1="40" y1="440" x2="472" y2="440" stroke="${tokens.paper}" stroke-opacity="0.4" stroke-width="1"/>
  <text x="40" y="466" font-family="${SANS}" font-size="12" letter-spacing="2.5" fill="${tokens.paper}" fill-opacity="0.85">${escape(footer)}</text>
  <text x="472" y="466" font-family="${SANS}" font-size="12" letter-spacing="2.5" text-anchor="end" fill="${tokens.accent}">${position} / ${count}</text>
</svg>`;
}

/**
 * Text along the top of a circle, one rotated glyph at a time (librsvg — used by sharp — does not
 * render <textPath>). Advance is approximated per character; good enough for capitals and spaces.
 */
function arcText(text, cx, cy, radius, { size, spacing, colour, weight = 400 }) {
  const advance = (ch) => (ch === " " ? size * 0.32 : ch === "·" ? size * 0.4 : size * 0.68) + spacing;
  const total = [...text].reduce((sum, ch) => sum + advance(ch), 0) - spacing;
  let angle = -total / radius / 2;
  const glyphs = [];
  for (const ch of text) {
    const step = advance(ch) / radius;
    const middle = angle + (step - spacing / radius) / 2;
    glyphs.push(`<text x="${cx}" y="${cy - radius}" transform="rotate(${((middle * 180) / Math.PI).toFixed(2)} ${cx} ${cy})" font-family="${SANS}" font-size="${size}" font-weight="${weight}" text-anchor="middle" fill="${colour}">${escape(ch)}</text>`);
    angle += step;
  }
  return glyphs.join("");
}

/** Label: the square maps onto the label disc (centre = spindle); text stays clear of the centre. */
function label({ era, display, tokens, kind, seed }) {
  const c = SIZE / 2;
  const titleLines = wrap(display.title, 22, 2);
  const title = titleLines
    .map((line, i) => `<text x="${c}" y="${330 + i * 30}" font-family="${SERIF}" font-size="27" text-anchor="middle" fill="${tokens.paper}">${escape(line)}</text>`)
    .join("");
  const meta = [display.date, display.genre.toUpperCase()].filter(Boolean).join(" · ");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}">
  <defs>
    <clipPath id="disc"><circle cx="${c}" cy="${c}" r="${c}"/></clipPath>
  </defs>
  <rect width="${SIZE}" height="${SIZE}" fill="${tokens.ground}"/>
  <g clip-path="url(#disc)" opacity="0.14">${pattern(kind, seed, tokens.accent)}</g>
  <circle cx="${c}" cy="${c}" r="${c - 14}" fill="none" stroke="${tokens.accent}" stroke-width="4"/>
  <circle cx="${c}" cy="${c}" r="${c - 26}" fill="none" stroke="${tokens.accent}" stroke-opacity="0.6" stroke-width="1.2"/>
  ${arcText("ARCHIVE · THE SOUND OF NIGERIA", c, c, 202, { size: 14, spacing: 1.6, colour: tokens.paper, weight: 700 })}
  <text x="${c}" y="158" font-family="${SANS}" font-size="46" font-weight="700" text-anchor="middle" fill="${tokens.accent}">${display.catalogueNumber}</text>
  <text x="${c}" y="192" font-family="${SANS}" font-size="16" letter-spacing="3" text-anchor="middle" fill="${tokens.paper}" fill-opacity="0.9">${escape(display.byline.toUpperCase())}</text>
  <circle cx="${c}" cy="${c}" r="40" fill="none" stroke="${tokens.paper}" stroke-opacity="0.35" stroke-width="1.2"/>
  <circle cx="${c}" cy="${c}" r="9" fill="${tokens.deep}"/>
  ${title}
  <text x="${c}" y="${titleLines.length > 1 ? 404 : 380}" font-family="${SANS}" font-size="13" letter-spacing="2.5" text-anchor="middle" fill="${tokens.paper}" fill-opacity="0.8">${escape(meta)}</text>
  <text x="${c}" y="${titleLines.length > 1 ? 430 : 406}" font-family="${SANS}" font-size="12" letter-spacing="3" text-anchor="middle" fill="${tokens.accent}">${era.number} · ${escape(era.title)}</text>
</svg>`;
}

const only = process.argv.slice(2);
const unknown = only.filter((id) => !ARCHIVE_ARTWORK.some((asset) => asset.track.id === id));
if (unknown.length) throw new Error(`not in the production archive: ${unknown.join(", ")}`);
let bytes = 0;
let files = 0;
for (const asset of ARCHIVE_ARTWORK) {
  if (only.length && !only.includes(asset.track.id)) continue;
  const era = ERAS[asset.eraIndex];
  const display = describeTrack(asset.track);
  const input = {
    era,
    display,
    tokens: ERA_ART_TOKENS[asset.eraId],
    kind: artPatternFor(asset.track.genre, asset.track.contentType === "TRADITION_REFERENCE"),
    seed: artHash(asset.track.id),
    position: asset.position + 1,
    count: ARCHIVE_ARTWORK.filter((a) => a.eraId === asset.eraId).length,
  };
  for (const [part, url, svg] of [
    ["sleeve", asset.sleeveUrl, sleeve(input)],
    ["label", asset.labelUrl, label(input)],
  ]) {
    const file = join(root, "public", url);
    mkdirSync(dirname(file), { recursive: true });
    const info = await sharp(Buffer.from(svg)).webp({ quality: 84 }).toFile(file);
    bytes += info.size;
    files++;
    console.log(`${url}  ${part}  ${info.width}×${info.height}  ${(info.size / 1024).toFixed(1)} KiB  ${input.kind}`);
  }
}
console.log(`\n${files} files, ${(bytes / 1024).toFixed(0)} KiB total`);
