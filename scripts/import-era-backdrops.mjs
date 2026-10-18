/**
 * Import era backdrops from Figma without changing the scene's UV layout. Accepts either
 *   - one transparent 1× atlas export (2048 × 1024, four columns, two rows, 8 px gutters), or
 *   - the eight 512 × 512 tile exports in era order (01 ROOTS … 08 GLOBAL), packed here into that atlas.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { ERA_ATLAS } from '../src/data/eraVisuals.ts';

const inputs = process.argv.slice(2);
if (inputs.length !== 1 && inputs.length !== 8) {
  throw new Error('Usage: node scripts/import-era-backdrops.mjs "atlas.png"  |  node scripts/import-era-backdrops.mjs 01.png … 08.png');
}

const { width, height, tile, padding } = ERA_ATLAS;
let atlas;
if (inputs.length === 1) {
  const image = sharp(inputs[0]);
  const metadata = await image.metadata();
  if (metadata.width !== width || metadata.height !== height) {
    throw new Error(`Expected ${width}×${height}px; received ${metadata.width}×${metadata.height}px. Export the atlas frame at 1×.`);
  }
  if (!metadata.hasAlpha) throw new Error('Export with transparency so the shaped backdrops keep their silhouettes.');
  atlas = await image.png().toBuffer();
} else {
  // Each tile fills its cell inside the transparent gutter, so mip levels never bleed between eras.
  const art = tile - padding * 2;
  const tiles = await Promise.all(
    inputs.map(async (file) => {
      const metadata = await sharp(file).metadata();
      if (metadata.width !== metadata.height) throw new Error(`${file}: tiles must be square (got ${metadata.width}×${metadata.height}).`);
      return sharp(file).resize(art, art, { kernel: 'lanczos3' }).png().toBuffer();
    }),
  );
  atlas = await sharp({ create: { width, height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite(tiles.map((input, i) => ({ input, left: (i % 4) * tile + padding, top: Math.floor(i / 4) * tile + padding })))
    .png()
    .toBuffer();
}

// Quality 82 with smart subsampling keeps photographic tiles inside the transfer budget.
const output = await sharp(atlas).webp({ quality: 82, alphaQuality: 100, smartSubsample: true, effort: 6 }).toBuffer();
if (output.length > 256 * 1024) throw new Error('The edited WebP exceeds the 256 KiB atlas budget. Simplify the artwork before importing.');
const target = path.resolve('public' + ERA_ATLAS.url);
await fs.writeFile(target, output);
console.log(`Imported ${width}×${height}px atlas from ${inputs.length === 1 ? 'one atlas export' : 'eight tiles'} (${(output.length / 1024).toFixed(1)} KiB) → ${target}`);
