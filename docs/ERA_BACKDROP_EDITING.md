# Editable era backdrops

[Open the Figma Design file](https://www.figma.com/design/Q55nzBIhmy3RI1JEyxVQLT/ARCHIVE--Editable-Era-Backdrops?node-id=2-2).

The file contains all eight current illustrations as editable vectors and the lettering as native Ojuju text. Expand an era frame to change its wording, colours or illustration. It is an editing handoff; Figma edits do not automatically update the deployed website.

| Surface | Size |
|---|---|
| Physical backdrop in the 3D hall | 3.00 m wide × 3.35 m high |
| Individual digital tile | 512 × 512 px |
| Transparent tile gutter | 8 px on each edge; artwork scaled to 496 × 496 |
| Full runtime texture atlas | 2048 × 1024 px, four columns and two rows |
| Physical panel aspect | 60:67; the square texture stretches onto the panel |

The figures are original geometric illustrations, not archival photographs. Station placement, panel geometry and UV mapping remain in `src/data/eraVisuals.ts` and `src/scene/EraWorlds.tsx`.

## Export an edit

1. Preserve the frame dimensions, gutter and tile order. Top row: ROOTS, RECORDING, HIGH-LIFE, EXPLOSION. Bottom row: TRANSITION, NAIJA, AFROBEATS, GLOBAL.
2. Select **EXPORT — era-worlds-v1 (2048 × 1024)** and export PNG at **1×**, retaining transparency. Do not include the dimensions guide.
3. Run `node scripts/import-era-backdrops.mjs "C:/path/to/export.png"`. The importer checks dimensions and transparency, then updates the runtime WebP. Review all eight eras before committing the changed asset.
4. Deploy through the normal GitHub/Vercel flow. This is a local asset replacement, not a live Figma connection.

For a panel-proportioned preview in Figma, scale a copy of an individual tile to **600 × 670 px**. Export the square originals for the existing atlas mapping.

## Reproduce the code-authored originals

`npm run artwork:eras` rebuilds the original atlas and `design/era-backdrops/figma-data.json` from the era content and existing geometric motifs. It **overwrites imported Figma edits**, so use it only when intentionally rebuilding the code-authored version. The JSON preserves separate illustration SVGs and text coordinates for a future editable Figma import.

The generator outlines the bundled Ojuju variable font at weights 400/700 using the fontkit bundled with the pinned Next.js dependency. The font and [SIL Open Font License](https://raw.githubusercontent.com/google/fonts/main/ofl/ojuju/OFL.txt) live in `scripts/fonts/`; generated lettering needs no installed OS fonts. The web UI continues to use its existing self-hosted `next/font` Ojuju.
