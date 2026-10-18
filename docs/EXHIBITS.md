# Hall exhibits: instruments on plinths

Nine third-party instrument models stand on plinths on the outer walkway of the marble hall (added 2026-10-18). Each era
has one in the walkway bay just before its station, so it is seen on the approach. ROOTS has two, in the GLOBAL → ROOTS
seam bay.

| Era | Exhibit | Slot (x, z) | Real size (largest dimension) | Plinth | Runtime file |
|---|---|---|---|---|---|
| 01 ROOTS | Talking drum | −11.2, −23.6 | 0.60 m | 0.90 m | `talking-drum.glb` 0.36 MB, 31.7k tris |
| 01 ROOTS | Axatse (gourd rattle) | −9.6, −23.6 | 0.32 m | 0.90 m | `axatse.glb` 1.73 MB, 314k tris (not simplified, see licence) |
| 02 RECORDING | Gramophone | 10.7, −23.6 | 0.70 m | 0.75 m | `gramophone.glb` 0.42 MB, 4.5k tris |
| 03 HIGH-LIFE | Trumpet | 23.8, −7.0 | 0.50 m | 0.90 m | `trumpet.glb` 0.32 MB, 19.1k tris |
| 04 EXPLOSION | Alto saxophone | 23.8, 7.0 | 0.68 m | 0.60 m | `saxophone.glb` 0.24 MB, 35.2k tris |
| 05 TRANSITION | Boombox | 10.7, 23.6 | 0.55 m | 0.90 m | `boombox.glb` 0.07 MB, 193 tris |
| 06 NAIJA | Acoustic guitar | −10.7, 23.6 | 1.02 m | 0.20 m | `guitar.glb` 0.08 MB, 6.3k tris |
| 07 AFROBEATS | Conga | −23.8, 7.0 | 0.76 m | 0.20 m | `conga.glb` 0.27 MB, 24.4k tris |
| 08 GLOBAL | Tambourines (pair) | −23.8, −7.0 | 0.52 m | 0.90 m | `tambourine.glb` 0.52 MB, 20.8k tris |

About 4 MB in total, down from 58 MB of sources.

## Files

- `src/data/exhibits.ts`: what each exhibit is (era, label, real size, corrective rotation, simplification, plinth
  height, credit).
- `src/data/hallLayout.ts`: `EXHIBIT_SLOTS`, `EXHIBIT_PLINTH` and `exhibitHeading()`, i.e. where each stands. Each faces
  the hall centre, and the gramophone is turned −30° into a three-quarter view.
- `exhibits-src/*.glb`: the untouched Sketchfab originals (Git LFS). Never edit them.
- `scripts/build-exhibits.mjs` → `public/models/exhibits/<id>.glb`, via `npm run exhibits` (or
  `npm run exhibits -- conga guitar`). The build applies the corrective rotation, scales to real-world size with the
  origin at the bottom-centre, optionally simplifies with Meshopt, converts textures to WebP at 1024 px or less, and
  applies Meshopt geometry compression. The credit is written into the file's `asset.extras`. The tambourine source
  has a separate vertex per face, so it is rewelded and its normals recomputed before simplifying.
- `src/scene/Exhibits.tsx`: one shared off-black plinth geometry and material, and each model loaded once with
  `useGLTF`. They mount only after the museum is ready, so they never hold up the loader. They then ask the hall key
  light for one more static shadow update. Exhibits more than 22 m from the camera are hidden, and none of them
  receive pointer raycasts.

## Checks

- `npm run check:hall` screens each plinth footprint plus 10 cm, up to the instrument's top, against the hall voxels,
  and checks floor flatness. Result: 0 intersections and ≤ 1 mm floor deviation for all nine. (The first east/west
  positions at z = ±10 stood on wall-pillar bases; the bays at z = ±7 are clear.)
- `npm run check:visuals` adds a conservative box per exhibit to the clearance test. Route ≥ 5.76 m, focus flights
  2.59 m, deck sightlines 1.21 m.

## Credits and licences

Every model is third-party. CC BY requires visible attribution; the site does not show it yet (see the flags).

| Exhibit | Title | Author | Licence | Source |
|---|---|---|---|---|
| Talking drum | Talking Drum v2 | techeverlasting | CC BY 4.0 | https://sketchfab.com/3d-models/talking-drum-v2-7e6a222bddbd41d1849aa036c17015b4 |
| Axatse | Axatse | Wesleyan University | CC BY-ND 4.0 | https://sketchfab.com/3d-models/axatse-38409d6703cb47fcb85fa4a9e60a6511 |
| Gramophone | Vintage Gramophone | Maxim Mavrichev | CC BY 4.0 | https://sketchfab.com/3d-models/vintage-gramophone-a7508a4233a344008029d21a2f0024bd |
| Trumpet | Trumpet | Charlie Tinley | CC BY 4.0 | https://sketchfab.com/3d-models/trumpet-3f2d4f5b962340b2933012e1bc634d88 |
| Alto saxophone | saxophone alto | ANDRIANIAINAToky | CC BY 4.0 | https://sketchfab.com/3d-models/saxophone-alto-08448f4bfbca474b80ba35a571648a27 |
| Boombox | [CC0] Free Low Poly Boombox | Viktor Sano | file says "Sketchfab Standard" | https://sketchfab.com/3d-models/cc0-free-low-poly-boombox-d5ea7e4de7664e3eb4f249836ff7a24b |
| Acoustic guitar | DD Acoustic Guitar | Igor Bistritski | CC BY 4.0 | https://sketchfab.com/3d-models/dd-acoustic-guitar-4eeb8f55c0de4521af948a343094baa4 |
| Conga | conga | alixor22 | CC BY 4.0 | https://sketchfab.com/3d-models/conga-f965fcb767b04d0eb85a3a0f485ef779 |
| Tambourines | Tambourine | arjunpramod1 | CC BY 4.0 | https://sketchfab.com/3d-models/tambourine-c0dd07bac757481f8d29404b001c482c |

## Flags (owner decisions, 2026-10-18)

- **Visible attribution.** CC BY 4.0 requires crediting the author, title, licence and source where the work is
  used. These credits are not yet shown on the site.
- **Boombox licence.** The title says CC0 but the file's metadata says "Sketchfab Standard". Confirm on Sketchfab.
  The owner chose to include it.
- **Axatse.** CC BY-ND forbids adapted versions, so it is only rescaled and compressed (a format change), never
  simplified, which is why it is the heaviest exhibit. The axatse is an Ewe instrument (Ghana/Togo) rather than a
  Nigerian one. The owner chose to include it beside the talking drum.
- **Talking drum shape.** The model is barrel-shaped. The Yorùbá dùndún is hourglass-shaped, so the exhibit is
  labelled "Talking drum", not "dùndún".
