# ARCHIVE — THE SOUND OF NIGERIA

Competition-quality, single-page, interactive WebGL museum about the history of Nigerian music (~1900–2026), built for the ARCHIVE digital museum challenge.

The visitor moves through one continuous 3D gallery by scroll or touch. Inside it are exactly **eight listening stations**, one per era. The underlying story is:

**TRADITION → ADAPTATION → LOCALISATION → EXPORTATION**

---

## 1. What this is — and is not

It must feel like **walking through a premium digital museum**: cinematic, spatial, continuous.

It must **not** feel like: Spotify · a landing page · a vertical scrolling website · a SaaS dashboard · a collection of cards · a videogame · a generic timeline.

**Reference:** https://www.magische-spiegelungen.de/ — used only for cinematic pacing, environmental storytelling, spatial navigation, smooth scrolling, museum atmosphere, minimal interface and continuous 3D movement. **Never copy its artwork, branding, code or assets.**

---

## 2. The eight eras (canonical order)

| # | Era | Dates | Hero track |
|---|------------|-----------|------------------------------------------|
| 01 | ROOTS | 1900–1919 | Dùndún / Talking Drum |
| 02 | RECORDING | 1920–1944 | Tunde King — Aronke Macaulay |
| 03 | HIGH-LIFE | 1945–1966 | Bobby Benson — Taxi Driver |
| 04 | EXPLOSION | 1967–1989 | Fela Kuti — Water No Get Enemy |
| 05 | TRANSITION | 1990–1999 | The Remedies — Shakomo |
| 06 | NAIJA | 2000–2009 | 2Face Idibia — African Queen |
| 07 | AFROBEATS | 2010–2019 | Wizkid — Ojuelegba |
| 08 | GLOBAL | 2020–2026 | Wizkid ft. Tems — Essence |

- Era names, numbers, dates and hero tracks above are fixed. Do not rename, reorder, merge or add eras.
- All era content lives in **centralized data files** (see §8). Components never hard-code era content.
- Use correct diacritics (e.g. **Dùndún**) everywhere, including data, UI and metadata.

---

## 3. Listening station

Every era uses the **same recurring physical installation**:

**TABLE + TURNTABLE + VINYL RECORD + RECORD COLLECTION**

The installation is the constant that connects all eight eras; **the world around it changes**.

Each station also presents:
- large era number
- era title
- date range
- one short historical statement
- album / vinyl collection
- current song information
- era-specific lighting
- era-specific graphic treatment

Implemented as **one data-driven `ListeningStation` component**. Never `Station1.tsx`, `Station2.tsx`, etc.

---

## 4. Music rules

- Every era has its own playlist and one **hero track**.
- The hero track is auto-selected the **first time** a visitor reaches that station. On later visits, keep whatever record that station last had (unless a milestone says otherwise).
- The visitor may change records, but **only within the current era's playlist**. It must be structurally impossible (not just hidden in UI) to select a song from another era — e.g. a visitor at AFROBEATS can never select a HIGH-LIFE track. Enforce this in the audio/record state layer, not only in components.
- Audio is **lazy-loaded** per track on demand. Never preload the whole archive. Preloading at most the current era's hero track / next likely track is acceptable.
- Browsers block autoplay: audio starts only after a user gesture. Design the first interaction so it unlocks the `AudioContext` gracefully.
- Audio files are supplied by the project owner. Do not download or source music from the internet.

---

## 5. Vinyl switching — required physical sequence

Changing a song is a **physical record change**, never just swapping text and audio. Required order:

1. current music ducks
2. tonearm lifts
3. tonearm rotates away
4. platter slows
5. vinyl stops
6. current vinyl rises
7. current vinyl exits
8. next vinyl enters
9. new label / cover becomes visible
10. new vinyl drops onto platter
11. platter accelerates
12. tonearm moves back
13. needle drops
14. new song fades in

Implementation rules:
- Model it as an **explicit state machine** (named states + allowed transitions), e.g. `playing → ducking → armLifting → armAway → spinningDown → stopped → vinylRising → vinylExiting → vinylEntering → revealing → vinylDropping → spinningUp → armReturning → needleDrop → fadingIn → playing`.
- Animate with GSAP timelines and/or refs in `useFrame`; the state machine owns sequencing, not ad-hoc `setTimeout`s.
- Define behaviour for input arriving mid-sequence (e.g. rapid left/right presses): queue the latest target or ignore — never corrupt state or desync audio from visuals.
- Leaving a station mid-switch must resolve cleanly.
- **Reuse the same vinyl mesh.** On change, swap only label texture, sleeve texture, metadata and audio source. Never reload vinyl geometry.

---

## 6. Infinite world

Scrolling is continuous and the sequence loops forever:

ROOTS → RECORDING → HIGH-LIFE → EXPLOSION → TRANSITION → NAIJA → AFROBEATS → GLOBAL → ROOTS → RECORDING → …

There must **never** be: a visible reset · a page reload · a hard camera cut · a fade-to-black reset · an obvious teleport.

- Treat scroll position as an unbounded value; derive the active era with modular arithmetic.
- Any re-centering (to avoid float precision drift or to recycle station instances) must happen invisibly — e.g. shifting world and camera together in the same frame so the rendered image is identical.
- The GLOBAL → ROOTS seam is a **narrative moment**, not a technical join: it should reinforce that old Nigerian musical DNA keeps reappearing in modern Nigerian music.

---

## 7. Camera & controls

No WASD / free-roam. The camera follows an authored path.

**Desktop**
| Input | Action |
|---|---|
| Scroll wheel | move through museum |
| Click station | enter listening mode |
| ← / → | change record |
| Escape | leave station |
| M | mute |

**Mobile**
| Input | Action |
|---|---|
| Vertical swipe | move |
| Tap station | focus |
| Horizontal swipe | change record |
| Tap close | exit |

Camera feel: **smooth, heavy, cinematic, slightly inertial, controlled.**
- Damped/inertial scroll (no raw 1:1 wheel mapping).
- Camera subtly **slows near stations** — stations attract the camera visually **without snapping**.
- Entering/leaving listening mode is an eased camera move, never a cut.
- Handle trackpads (high-frequency small deltas) and mouse wheels (large discrete deltas) so both feel equally smooth.
- Keyboard and touch controls must not fight the browser (prevent default scroll where appropriate; respect `prefers-reduced-motion` by reducing secondary motion).

---

## 8. Architecture & engineering principles

### Tech stack
Next.js · TypeScript · React · Three.js · React Three Fiber · Drei · GSAP · Zustand · Web Audio API · React Three Postprocessing (only where it earns its cost).

### Rules
- **Reusable, data-driven systems.** One `ListeningStation` driven by era data. Centralize era info (ids, titles, dates, statements, playlists, hero track, lighting, palette, graphic treatment, texture paths) in data files.
- **Load each GLB once.** Use `useGLTF` (with preload where sensible) and clone/instance for repeated stations. Never load the turntable GLB eight times. Share geometries, materials and textures across stations.
- **No per-frame React state.** Continuous animation (camera, platter spin, tonearm, scroll progress) uses refs + `useFrame` or GSAP. Zustand is for discrete state (active era, focused station, selected track, mute, switch-machine state); read it transiently (`getState()` / `subscribe`) inside frame loops.
- **Audio is separate from presentation.** A dedicated audio module (Web Audio graph: sources → per-track gain → master gain → destination) exposes a small API (load, play, duck, fadeIn, stop, mute). Components and 3D code never touch `AudioContext` directly.
- **Explicit state machines** for complex behaviour (record switching, listening-mode enter/exit).
- Strict TypeScript; no `any` without a comment explaining why.
- R3F/Three code is client-only — mark with `"use client"` and avoid SSR of the canvas.
- Dispose of textures/materials that are created dynamically (e.g. label textures) when no longer used.

### Suggested layout (adapt to what actually exists — inspect first)
```
src/
  app/                 Next.js app router entry (single page)
  data/                eras.ts, tracks.ts — single source of truth for content
  scene/               Canvas, World, CameraRig, Gallery, lighting, postprocessing
  stations/            ListeningStation, Turntable, Vinyl, RecordCollection
  audio/               audio engine (Web Audio), lazy loader
  state/               Zustand stores, state machines
  input/               scroll/touch/keyboard handling
  ui/                  minimal DOM overlay (era label, track info, close, mute)
public/
  models/              runtime GLBs — generated by scripts/build-models.mjs, see §9
  audio/               per-era track files
  textures/            labels, sleeves, era graphics
scripts/
  build-models.mjs     root source GLBs → /public/models (split, rescale, compress)
```

---

## 9. Assets

Foundational 3D assets — **use these; do not replace them unless explicitly instructed:**

- `/public/models/gallery/marble-gallery.glb` — **primary museum hall** (replaces the classic gallery)
- `/public/models/gallery/gallery.glb` — classic gallery, kept for comparison via the dev config (`src/config/dev.ts`)
- `/public/models/furniture/table-<profile>.glb`
- `/public/models/turntable/turntable-<profile>.glb`
- `/public/models/vinyl/vinyl-<profile>.glb`

Station models exist once per **texture profile** (`high` · `medium` · `low`, plus the dev-only `reference` = pre-optimisation 2048 px textures) — same geometry, different texture resolutions, defined in `src/data/textureProfiles.ts` (default `medium`; dev URL `?textures=`). The turntable and vinyl files also contain the **NEARBY / DISTANT geometry LOD tiers** (`src/data/stationLod.ts`, [docs/STATION_LOD.md](docs/STATION_LOD.md)); dev URL `?lod=`.

### Source vs. runtime files

- **Source GLBs** live in the **repository root** (`marble-gallery.glb`, `gallery.glb`, `table.glb`, `turntable.glb`, `vinyl.glb`, ≈264 MB total). They are the untouched Sketchfab originals. **Never edit, overwrite or delete them.** The app never loads them.
- **Runtime GLBs** in `/public/models/...` are **generated** from the sources by `scripts/build-models.mjs`. Never hand-edit them: change the script and regenerate.

```bash
npm run models                     # all models (station models in high, medium, low)
npm run models -- marble turntable  # only some: gallery, marble, table, vinyl, turntable
npm run models -- table turntable --profiles=reference   # dev A/B variant (old 2048 px textures)
npm run audit:textures             # per-texture size, alpha, detail, texel density (station models)
npm run audit:geometry             # turntable triangles per part, component sizes, visibility, simplification sweep
```
(`turntable` always rebuilds `vinyl` too — the needle angles depend on the record thickness.)

The pipeline (gltf-transform 4.5.1 scripting API + sharp + meshoptimizer, pinned in `package.json` devDependencies):
1. **Bakes** the Sketchfab wrapper transforms into geometry → glTF Y-up, **metres**, front of each object faces **+Z**.
2. **Rebuilds a clean, named hierarchy** (below), splitting moving parts out of the source meshes and merging static parts per material to cut draw calls.
3. **Rescales to real-world size** and puts each model's origin at its **bottom-centre**.
4. **Compresses**: Meshopt geometry + quantization (`EXT_meshopt_compression`, `KHR_mesh_quantization`), WebP textures (`EXT_texture_webp`) capped at 4096 px (classic gallery) / 2048 px (marble). Station textures are sized **per texture and profile** by `STATION_TEXTURE_RULES` in `src/data/textureProfiles.ts` (every station texture needs a rule; the build fails otherwise). Dedup, weld, prune.
   - **No simplification of the ACTIVE models** — even at error 1e-4 it visibly faceted the turntable's brushed-metal shading up close. Simplification is used **only** for the NEARBY / DISTANT LOD tiers (absolute error bounds far below a pixel at their distances, see docs/STATION_LOD.md).

### Runtime models — hierarchy & usage

All units are metres. **Group nodes** (pivots/anchors) are safe to animate. **`*Mesh` nodes** are leaf nodes whose transforms are owned by the compressor (quantization) — **never set their position/rotation/scale**; animate their parent group instead. Node `extras` arrive in three.js as `object.userData`.

**`/public/models/turntable/turntable-<profile>.glb`** — 6.9 MB medium (source 57 MB), incl. LOD tiers. 0.455 × 0.142 × 0.353 m.
```
Turntable
├─ Body                 static plinth, feet, controls, arm base, arm rest, cue lever
│  └─ BodyMesh
├─ Platter              pivot on the spindle axis, origin at the slip-mat top surface
│  ├─ PlatterMesh       platter, strobe dots, slip mat, spindle
│  └─ RecordAnchor      empty — parent the Record here so it spins with the platter
└─ TonearmSwing         pivot at the tonearm bearing — rotation.y swings the arm
   └─ TonearmLift       same pivot — rotation.x raises/lowers the arm (nested so lift follows swing)
      ├─ TonearmMesh    arm tube, gimbal, counterweight, headshell, cartridge, wires
      └─ StylusTip      empty at the needle point (useful for checks/effects)
```
- `Platter.userData`: `{ rpm33: 33.333, rpm45: 45, matRadius }`. Spin = `rotation.y`, negative = clockwise seen from above (real direction).
- `TonearmSwing.userData` (radians, computed geometrically by the script):
  - `restSwing: 0` — arm on its rest
  - `leadInSwing` (≈ −0.332) — needle over the first groove (r = 146 mm)
  - `runOutSwing` (≈ −0.735) — needle at the run-out (r = 60 mm)
  - `restLift: 0`, `playLift` (≈ +0.023) — needle exactly on the record surface, `raisedLift` (≈ −0.030) — needle 12 mm above the record. Apply lift values to `TonearmLift.rotation.x`.
- Verified in a viewer: at `leadInSwing` + `playLift` the stylus tip sits on the record top surface (error < 0.1 mm) at r ≈ 146 mm.
- The deck's finish (gold/chrome top plate) is the source asset's look; restyle via materials at runtime if the art direction needs it.
- **LOD tiers** (same file, same materials): extra scene roots `Turntable_Nearby` (≈84k triangles) and `Turntable_Distant` (≈11k) with the same pivot tree, every node suffixed (`Platter_Nearby`, `TonearmSwing_Distant`, …; use `lodNodeName()` from `src/data/stationLod.ts`). The ACTIVE `Turntable` tree above is unchanged (773,524 triangles).

**`/public/models/vinyl/vinyl-<profile>.glb`** — 0.41 MB medium (source 39 MB), incl. LOD tiers.
```
Vinyl
├─ Record               lying flat, side A up; origin at disc centre, bottom face at y = 0
│  ├─ RecordMesh        materials VinylSideA (top), VinylSideB (bottom) — grooved black vinyl
│  └─ LabelMesh         material Label — separate 100 mm label on both faces
└─ Sleeve               standing upright, front cover faces +Z; origin at bottom-centre
   └─ SleeveMesh        materials SleeveFront, SleeveBack, SleeveEdge
```
- `Record.userData`: `{ diameter: 0.302, thickness: 0.0015, labelRadius: 0.05, holeRadius }`. Sleeve is 0.314 × 0.314 × 0.0033 m; `Sleeve.userData` has `width/height/thickness`.
- **LOD tiers:** `Record_Nearby` / `Record_Distant` (proxy discs: top + rim with the `VinylSideA` material, label on top; same `userData`), `Sleeve_Distant` (the 12 sleeve triangles in one `SleeveFront` draw call). NEARBY uses the full `Sleeve`.
- The `Sleeve` node is offset to z = −0.2 only so the file previews sensibly — set positions at runtime.
- **Swapping artwork (per song, §5):** only change textures; never reload geometry.
  - `Label` material: UVs map a **square image onto the label circle** (centre of image = spindle). Supply circular label art on a square canvas. The underside label is mirrored on U so text reads correctly from below.
  - `SleeveFront` / `SleeveBack`: UVs cover the face **0–1, upright** — use album cover images directly (square).
  - Runtime-loaded textures must match glTF conventions: `texture.flipY = false` and `texture.colorSpace = THREE.SRGBColorSpace`.
  - Clone materials per station/record instance before swapping maps, otherwise every instance changes.
- **Copyright:** the source vinyl carried *Pink Floyd — The Dark Side of the Moon* label and sleeve art. The build **erases the printed label from the vinyl textures** and **replaces the sleeve art with neutral placeholders** (`LabelPlaceholder`, `SleeveFrontPlaceholder`, `SleeveBackPlaceholder`). Never ship the original artwork; only use artwork the project has rights to.

**`/public/models/furniture/table-<profile>.glb`** — 0.15 MB medium (source 21 MB). Same in every LOD tier. 0.457 × 0.635 × 0.457 m (inverted wooden pyramid in a black metal frame; source was in cm).
```
Table
├─ TableMesh
└─ TopAnchor            empty at the table-top surface centre (y = 0.635) — parent the Turntable here
```
The turntable footprint (0.455 × 0.353 m) fits the 0.457 m square top.

**`/public/models/gallery/marble-gallery.glb`** — 16.4 MB (source 128 MB). **Primary museum.** 51.96 × 13.62 × 51.35 m single marble hall; lit PBR (not baked), so scene lights and environment maps affect it.
```
MarbleGallery           extras: { mainFloorY: 0, lowestFloorY: −0.79, ceilingTopY: 12.83 }
├─ Room                 shell: floors, steps, walls, ceiling
│  └─ RoomMesh          materials Room (opaque) + RoomGlass (alpha-blended skylight, 96 triangles)
├─ Pillars              columns + entablature, 99 % of all triangles
│  └─ PillarsMesh_01…23 kept as 23 spatial chunks so off-screen chunks are frustum-culled
├─ Doorways             arched doorways in the ±Z walls
├─ InnerRing            four curved segments around the centre
└─ Sculpture            central gold sculpture on its plinth
```
- Origin = hall centre on the **main floor level (y = 0)** (source floor was y = −2.67; this is the exception to "bottom-centre": the lowest floor is a sunken area).
- Measured levels (radial profile from the centre): plinth top ≈ +0.91 (r < 2.5) → central platform **0** (r ≈ 3–12, where the inner colonnade stands) → steps down → **sunken ring −0.79 (r ≈ 14–20)** → steps up → outer walkway **0** (r ≈ 22 m to the walls). Main ceiling ≈ +6.91; glass skylight up to +12.83 in the centre.
- Walls at x = ±25.93, z = ±25.41. The ring-shaped circulation around the centre is the natural route for a closed-loop camera path.
- **Spatial layout lives in `src/data/hallLayout.ts`** (route control points, station slots, view/progress anchors, focus-camera anchors, loop helpers). Never hardcode positions in scene components. After changing it, run `npm run check:hall` (clearance, floor, headroom and sightline screening against the runtime GLB) and inspect it in the dev view (`?gallery=marble`, HALL LAYOUT panel).
- **The layout is LOCKED** — see [docs/HALL_LAYOUT_LOCK.md](docs/HALL_LAYOUT_LOCK.md). Visual design adapts to it; do not move stations, the route or camera anchors without an explicit decision recorded there.
- Build fixes: all three source materials were authored as alpha BLEND although only the skylight uses alpha → made OPAQUE and the glass split into `RoomGlass`; all-black emissive maps on Pillars and Arch_Doorway_Sculpture removed.
- **Still heavy:** full geometry is kept (2.34 M triangles, 1.5 M vertices; no simplification per the policy above). ≈170 MB of textures once decoded on the GPU. Reducing pillar geometry (simplification with a visual A/B check, or instancing repeated columns) is the main remaining optimization, especially for mobile.

**`/public/models/gallery/gallery.glb`** — classic gallery, kept for comparison. 0.6 MB (source 17 MB). ≈16.1 × 5.0 × 8.0 m room with arched wall niches; long axis = X.
```
Gallery
└─ GalleryMesh          single mesh, unlit baked material (KHR_materials_unlit), 4096² baked + emissive textures
```
Lighting is baked into the texture (unlit material) — scene lights won't affect it.

**`/public/models/exhibits/<id>.glb`**: nine instrument exhibits on plinths beside the route (enlarged at runtime), built by
`npm run exhibits` (`scripts/build-exhibits.mjs`) from the Sketchfab originals in `/exhibits-src` (Git LFS; never
edit them). Content and credits are in `src/data/exhibits.ts`, placement in `EXHIBIT_SLOTS` (`src/data/hallLayout.ts`),
and the rest in [docs/EXHIBITS.md](docs/EXHIBITS.md). All are third-party: keep the credits, and never simplify the
CC BY-ND axatse.

### Loading
- Files require **`EXT_meshopt_compression`**. Drei's `useGLTF` handles Meshopt by default; with plain `GLTFLoader` call `loader.setMeshoptDecoder(MeshoptDecoder)` (`three/examples/jsm/libs/meshopt_decoder.module.js`). Draco is not used.
- Load each GLB **once** and clone nodes per station (§8). Heaviest assets: the marble gallery (2.34 M triangles) and the ACTIVE turntable (774k triangles) — only one station should use the ACTIVE tier; the others use NEARBY / DISTANT (§10, docs/STATION_LOD.md).

### Things to visually re-check after regenerating
- WebP compression is lossy: check the gallery's baked texture and normal maps for banding/blockiness.
- The erased-label area on the vinyl reads as a slightly lighter dead-wax ring between the label (r = 50 mm) and the grooves (r ≈ 71 mm).
- If the turntable source changes, re-verify the part classification in `buildTurntable()` (it selects source meshes/components by name and position) by swinging the arm and spinning the platter in a viewer — nothing should be left behind or carried along.

### Version control
If the repo is put under git, keep the large root source GLBs out of normal history (Git LFS or `.gitignore`), ignore `node_modules/`, and commit the generated `/public/models` files plus the script.

---

## 10. Performance

Performance is critical.

- **Desktop:** smooth 60 fps where reasonable.
- **Mobile:** 30–60 fps with reduced effects (lower DPR, fewer/cheaper post effects, simpler shadows, smaller textures).
- Lazy-load audio; never preload the full music archive.
- Keep GPU-heavy effects restrained; prefer baked lighting/AO and cheap fakes over real-time cost.
- Cap device pixel ratio (e.g. `dpr={[1, 2]}` on desktop, lower on mobile); consider adaptive quality (Drei `PerformanceMonitor` / `AdaptiveDpr`).
- Minimise draw calls: instance/merge repeated geometry, share materials.
- Avoid allocations inside `useFrame` (reuse vectors/quaternions).
- Only render/animate what is near the camera; offscreen stations should be cheap or culled.

---

## 11. Art direction

Overall feeling: **premium · museum-like · editorial · cinematic · cultural · minimal · atmospheric.**

Avoid: excessive glowing neon · generic AI gradients · glassmorphism · excessive cards · gaming HUD · Spotify-style UI · futuristic UI for no reason.

- UI is a minimal editorial overlay (typography-led, museum-label feel), not a control panel.
- Each era has its own lighting and graphic treatment, but the whole must read as one coherent exhibition.
- Respect the cultural material: accurate names, dates and spellings; no caricature.

---

## 12. Workflow (every task)

1. Read this CLAUDE.md.
2. Inspect the existing architecture before changing anything.
3. Preserve working systems.
4. Implement **only the requested milestone**. Never jump ahead to future milestones unless explicitly instructed.
5. Avoid unrelated refactors.
6. Run lint (`npm run lint`) and the data tests (`npm test` — era/track content model; `npm run check:hall` too if the hall layout changed).
7. Run the production build (`npm run build`).
8. Fix errors from lint/build.
9. Report exactly what changed (files and behaviour).
10. Report anything the user should **visually inspect** (camera feel, animation timing, lighting, mobile layout, etc.), since much of this project can't be verified by build output alone.

If lint or build cannot be run (e.g. project not yet scaffolded), say so explicitly rather than implying success.
