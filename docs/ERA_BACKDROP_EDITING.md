# Editable era backdrops

[Open the Figma Design file](https://www.figma.com/design/Q55nzBIhmy3RI1JEyxVQLT/ARCHIVE--Editable-Era-Backdrops?node-id=14-91).

**Current backdrops (2026-10-18):** the redesigned set in the frame **BACKDROP** (node 14:91): eight 512 × 512 tiles, 01 ROOTS … 08 GLOBAL, each a gold instrument photograph with Ojuju lettering on ink or cream, in a copper border. The original geometric illustrations (node 2-2) are no longer used by the site. Figma edits do not automatically update the deployed website.

| Surface | Size |
|---|---|
| Physical backdrop in the 3D hall | 3.00 m wide × 3.00 m high (square, so the tiles do not stretch) |
| Individual digital tile | 512 × 512 px |
| Transparent tile gutter | 8 px on each edge; artwork scaled to 496 × 496 |
| Full runtime texture atlas | 2048 × 1024 px, four columns and two rows |
| Physical panel aspect | 1:1, matching the tiles |

The figures are original geometric illustrations, not archival photographs. Station placement, panel geometry and UV mapping remain in `src/data/eraVisuals.ts` and `src/scene/EraWorlds.tsx`.

## Export an edit

1. Keep each tile 512 × 512 and the era order: 01 ROOTS, 02 RECORDING, 03 HIGH-LIFE, 04 EXPLOSION, 05 TRANSITION, 06 NAIJA, 07 AFROBEATS, 08 GLOBAL.
2. Export the eight tile frames (01 … 08 inside **BACKDROP**) as PNG at **1×**.
3. Run `node scripts/import-era-backdrops.mjs 01.png 02.png 03.png 04.png 05.png 06.png 07.png 08.png` (in that order). The importer scales each tile to 496 × 496, packs it into its atlas cell inside the 8 px transparent gutter, encodes WebP (quality 82, smart subsampling) and checks the 256 KiB budget. A single 2048 × 1024 transparent atlas export is still accepted instead.
4. Review all eight eras in the hall, then deploy through the normal GitHub/Vercel flow. This is a local asset replacement, not a live Figma connection.

Beside each station, a narrow strip previews the next era: a 50 × 318 px slice through the centre of that era's tile (`createNextEdges` in `src/scene/EraWorlds.tsx`).

## Reproduce the code-authored originals

`npm run artwork:eras` rebuilds the **original geometric** atlas and `design/era-backdrops/figma-data.json` from the era content and existing geometric motifs. It **overwrites imported Figma edits**, so use it only when intentionally rebuilding the code-authored version. The JSON preserves separate illustration SVGs and text coordinates for a future editable Figma import.

The generator outlines the bundled Ojuju variable font at weights 400/700 using the fontkit bundled with the pinned Next.js dependency. The font and [SIL Open Font License](https://raw.githubusercontent.com/google/fonts/main/ofl/ojuju/OFL.txt) live in `scripts/fonts/`; generated lettering needs no installed OS fonts. The web UI continues to use its existing self-hosted `next/font` Ojuju.
