# Hall exhibits: instruments on plinths

Nine third-party instrument models stand on eight plinths around the marble hall (added 2026-10-18). They stand on
the sunken ring beside the camera route. Each era has one in the stretch of route just before its station, so it is
seen on the approach. ROOTS has two, the talking drum and the axatse, sharing one wider plinth at the GLOBAL → ROOTS
seam.

On 2026-10-19, at the owner's request, they were made smaller (about life size) and moved farther from the route. Each
plinth sits 2.2 m outward of the route (toward the walls) at the noted route progress `u`. The steps come closer on
the east and west sides, so the trumpet is 1.95 m out, the saxophone 1.65 m and the conga 1.5 m. The shared ROOTS
plinth is 2.1 m out. The trumpet and tambourines sit at the midpoints between stations, where focus flights clear them.
Each plinth is turned 40° from facing the hall centre, three-quarters toward the arriving camera. The shared ROOTS
plinth is turned 25°, so its long side faces the route.

One shared warm spotlight picks out the plinth nearest the camera: full within 8 m, faded out by 12 m. Like the
listening desk's light, it casts a tight soft shadow map. The map is rendered only when the light moves to another
plinth, because the exhibits never move. Shadow receivers on the floor around that plinth and on its top keep the
contact shadows readable under the bright image-based lighting, as under the listening desk.

| Era | Exhibit | Route `u` · slot (x, z) | Real size | Shown at | Plinth | Runtime file |
|---|---|---|---|---|---|---|
| 01 ROOTS | Talking drum | 0.9345 · −7.39, −18.71 (shared) | 0.60 m | ×1 | 0.90 m | `talking-drum.glb` 0.36 MB, 31.7k tris |
| 01 ROOTS | Axatse (gourd rattle) | (same plinth) | 0.32 m | ×1.4 | 0.90 m | `axatse.glb` 1.73 MB, 314k tris (not simplified, see licence) |
| 02 RECORDING | Gramophone | 0.059 · 7.58, −18.89 | 0.70 m | ×1 | 0.75 m | `gramophone.glb` 0.42 MB, 4.5k tris |
| 03 HIGH-LIFE | Trumpet | 0.170 · 18.44, −9.57 | 0.50 m | ×1.2 | 1.00 m | `trumpet.glb` 0.32 MB, 19.1k tris |
| 04 EXPLOSION | Alto saxophone | 0.289 · 19.35, 5.67 | 0.68 m | ×1 | 0.75 m | `saxophone.glb` 0.24 MB, 35.2k tris |
| 05 TRANSITION | Boombox | 0.431 · 7.78, 18.76 | 0.55 m | ×1.1 | 0.95 m | `boombox.glb` 0.07 MB, 193 tris |
| 06 NAIJA | Acoustic guitar | 0.559 · −7.58, 18.89 | 1.02 m | ×1 | 0.40 m | `guitar.glb` 0.08 MB, 6.3k tris |
| 07 AFROBEATS | Conga | 0.701 · −19.36, 5.76 | 0.76 m | ×1 | 0.45 m | `conga.glb` 0.27 MB, 24.4k tris |
| 08 GLOBAL | Tambourines (pair) | 0.810 · −19.11, −8.28 | 0.52 m | ×1.1 | 1.00 m | `tambourine.glb` 0.52 MB, 20.8k tris |

Plinths are 0.7 × 0.7 m and off-black; the shared ROOTS plinth is 1.25 × 0.7 m, with each instrument centred in its
half. Exhibits on a shared plinth stand on the tallest of their plinth heights. Heights put the small instruments at
about table-to-chest height, below the camera's eye height (1.65 m). The GLBs stay real-world size; `display` in
`src/data/exhibits.ts` scales them at runtime (×1 = life size).

About 4 MB in total, down from 58 MB of sources.

## Files

- `src/data/exhibits.ts`: what each exhibit is (era, label, real size, display scale, corrective rotation,
  simplification, plinth height, credit).
- `src/data/hallLayout.ts`: `EXHIBIT_SLOTS` (one per plinth, listing the exhibits on it), `EXHIBIT_PLINTH`,
  `exhibitHeading()`, `exhibitPlinthSize()` and `exhibitOffsets()`, i.e. where each stands.
- `exhibits-src/*.glb`: the untouched Sketchfab originals (Git LFS). Never edit them.
- `scripts/build-exhibits.mjs` → `public/models/exhibits/<id>.glb`, via `npm run exhibits` (or
  `npm run exhibits -- conga guitar`). The build applies the corrective rotation, scales to real-world size with the
  origin at the bottom-centre, optionally simplifies with Meshopt, converts textures to WebP at 1024 px or less, and
  applies Meshopt geometry compression. The credit is written into the file's `asset.extras`. The tambourine source
  has a separate vertex per face, so it is rewelded and its normals recomputed before simplifying.
- `src/scene/Exhibits.tsx`: one shared off-black plinth geometry and material (scaled per plinth), and each model
  loaded once with `useGLTF`. They mount only after the museum is ready, so they never hold up the loader. They then
  ask the hall key light for one more static shadow update. The shared `ExhibitSpot` spotlight follows the nearest
  plinth and casts a shadow map at the station shadow size of the current quality, rendered only when it moves. One
  pair of `ShadowMaterial` contact receivers (floor and plinth top) moves with it and fades with it. Exhibits more
  than 22 m from the camera are hidden, and none of them receive pointer raycasts.

## Checks

- `npm run check:hall` screens each plinth footprint plus 10 cm, up to the enlarged instrument's top, against the hall
  voxels, and checks floor flatness. Result: 0 intersections and ≤ 3 mm floor deviation for all eight plinths. (At
  2.2 m out on the east and west sides, the trumpet, saxophone and conga plinth corners reached the first step, so
  they stand 1.5–1.95 m out.)
- `npm run check:visuals` adds a conservative box per plinth (up to the top of its tallest instrument) to the
  clearance test: route ≥ 1.10 m (0.60 m before the 2026-10-19 move), focus flights ≥ 0.73 m (threshold 0.3), deck
  sightlines 1.21 m. The trumpet and tambourines first sat where HIGH-LIFE and AFROBEATS focus flights pass (0.12 and
  0.16 m), so they stay at the station midpoints, where flights diverge.

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
