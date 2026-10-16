/** Import the transparent 1× Figma atlas without changing the scene's UV layout. */
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { ERA_ATLAS } from '../src/data/eraVisuals.ts';

const input = process.argv[2];
if (!input) throw new Error('Usage: node scripts/import-era-backdrops.mjs "path/to/figma-export.png"');
const image = sharp(input);
const metadata = await image.metadata();
if (metadata.width !== ERA_ATLAS.width || metadata.height !== ERA_ATLAS.height) {
  throw new Error(`Expected ${ERA_ATLAS.width}×${ERA_ATLAS.height}px; received ${metadata.width}×${metadata.height}px. Export the atlas frame at 1×.`);
}
if (!metadata.hasAlpha) throw new Error('Export with transparency so the shaped backdrops keep their silhouettes.');
const output = await image.webp({ quality: 88, alphaQuality: 100 }).toBuffer();
if (output.length > 256 * 1024) throw new Error('The edited WebP exceeds the 256 KiB atlas budget. Simplify the artwork before importing.');
const target = path.resolve('public' + ERA_ATLAS.url);
await fs.writeFile(target, output);
console.log(`Imported ${metadata.width}×${metadata.height}px atlas (${(output.length / 1024).toFixed(1)} KiB) → ${target}`);
