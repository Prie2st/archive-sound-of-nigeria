# ERA VISUAL WORLDS

Implemented 15 October 2026. This is the environmental milestone only; final UI, loading, mobile work and deployment remain outside its scope.

## Changed files and architecture

- `src/data/eraVisuals.ts`: presentation palettes, motif names, dimensions, derived panel poses, visual settings and wrap-aware quality policy.
- `src/scene/EraWorlds.tsx`: reusable installation renderer, one shared atlas material, cropped next-era fragments, cheap discrete detail tiers and one bounded light.
- `scripts/build-era-worlds.mjs`: reproducible original SVG artwork and optimized WebP atlas. Run `npm run artwork:eras`.
- `public/textures/environment/era-worlds.svg` and `era-worlds-v1.webp`: editable source and runtime atlas. These are geometric illustrations, never purported archival photographs.
- `src/scene/MuseumCanvas.tsx`: mounts the presentation layer independently of stations and hides inspector/markers in production.
- `src/scene/Exhibition.tsx`: removes the old development typography placards. Station rigs and drivers retain their existing order.
- `src/ui/dev/DevPanel.tsx`: ERA VISUALS ON/OFF and FORCE ACTIVE ERA visuals in the existing inspector.
- `scripts/check-era-visuals.mjs`: conservative visual bounds against route, focus flights, deck sightlines, interaction and moving-record envelopes. Run `npm run check:visuals`.
- `scripts/check-hall-layout.mjs`: adds visual-surface probes to the existing hall geometry screening, without changing any old thresholds.
- `package.json`: adds only `artwork:eras` and `check:visuals`; no dependency changes.
- This document records the design and verification.

The independent `EraWorlds` layer reads the existing semantic active-era store. It never writes to travel, focus, audio, selection, platter, tonearm or record-change controllers. A comparison of 36 protected source/test files against their pre-edit SHA-256 hashes found no changes. That includes the hall layout, camera rig, neutral lighting, archive/art tokens, audio/input/state modules, station implementation and mechanical systems. The 40-entry archive and five-entry playlists remain unchanged.

Each 3 × 3 m graphic sits behind its station, facing the hall centre. Its placement is derived from the locked station position/heading; there are no replacement rooms or new walls. Backdrop bottom is 0.7 m and top is 3.7 m. (Until 2026-10-18 it was 3 × 3.35 m; the redesigned square tiles, docs/ERA_BACKDROP_EDITING.md, made it square. The palettes and motifs below describe the original geometric set.) All visual meshes ignore pointer raycasts.

**Removed 2026-10-18:** the primitive era props beside each station (and their NEARBY box hints) and the cropped next-era edge strip. Each installation is now the backdrop panel alone, plus the shared desk light. The LOD, transition and verification notes below describe the original installations where they mention props or the next fragment.

## Palettes and motifs

| Era | Main / secondary / accent | Graphic and object reference |
| --- | --- | --- |
| ROOTS | earth `#3a2a1f`, wood `#754b2c`, amber `#c98f4e`, warm paper | Woven diamonds, fringed textile edge and a tension-cord hourglass drum. Rough dark wood and warm amber detail. |
| RECORDING | cream `#e3d6bb`, near-black sepia `#312b25`, brown `#9c754d` | Ruled catalogue paper, shellac grooves, 78 label, stacked shellac and a catalogue sleeve. |
| HIGH-LIFE | deep green `#114340`, cream `#ead8ac`, brass `#e1b24f` | Mid-century dance-hall arches and a horn silhouette, plus a small brass horn reference. |
| EXPLOSION | red `#7b2416`, dark green `#183c2b`, ochre `#f0c63a` | Radial psychedelic print, overlapping paper, JÙJÚ / AFROBEAT / FÚJÌ / FUNK lettering, layered print blocks and percussion. Multiple genres share the composition. |
| TRANSITION | CRT blue `#273758`, faded violet `#78658e`, pale blue `#86b9dc` | Rounded broadcast screen, static scanlines, cassette reels and a small CRT/cassette prop. No flashing or flickering. |
| NAIJA | silver `#ced4db`, digital green `#0c392d`, electric blue `#245df0` | Early computer/music-TV window, iridescent CD, digital bars, a chrome disc and compact screen reference. |
| AFROBEATS | plum `#3a1333`, teal `#176d70`, coral `#ff9f62` | Lagos night skyline, video/concert framing and a small architectural stage/city reference. Restrained colour, no neon wash. |
| GLOBAL | black `#111217`, steel `#333943`, warm gold `#cfa94f` | Sparse arena truss, LED dot field, screen and stage fins. Gold details carry a trace of the earlier woven rhythm. |

Existing sleeve palette tokens supply ROOTS, HIGH-LIFE, EXPLOSION, AFROBEATS and GLOBAL accents/paper where appropriate. RECORDING, TRANSITION and NAIJA add presentation colours suited to their media. Original content/token files are untouched.

## Statements, light and quality

Each installation uses its exact existing era headline, plus restrained era number/title. No historical paragraphs are added to the environment. Arial/sans-serif display typography is baked into the atlas; long statements wrap within the panel. HIGH-LIFE wrapping was corrected after the first browser review. Lower-half motifs remain visible behind the turntable in focus, while the headline stays above the deck. The focused camera and sleeve remain the main interaction.

One non-shadow-casting point light follows the visually active installation: intensity 1.4, range 3.2 m, inverse-square decay. Warm/neutral/cool era colours are small local accents. The hall's original neutral environment and illumination are unchanged. Graphic colours use sRGB and an unlit, non-tone-mapped material. There are no volumetrics, dynamic shadows, scanline animation or extra environmental animation, so reduced-motion visitors receive the same static identity.

| Quality | Rendering |
| --- | --- |
| ACTIVE | Core graphic, two merged primitive batches, cropped next-era fragment, one local light. |
| NEARBY | Core graphic, one simple object hint, cropped next-era fragment. |
| DISTANT | One core plane; normal frustum/back-face culling. No prop or light. |

Resources are built once per mount and reused; era changes only change visibility/light properties. No frame callback, texture creation or geometry rebuild is introduced. The visual preview override changes these tiers only. It does not change camera, station LOD, audio or the real active era.

## Transitions

The slim graphic fragment beside each installation is cropped from the *next* era's motif, without repeating its headline. It previews the next material/colour before the station's full installation appears around the existing route.

- ROOTS → RECORDING: woven amber yields to a black shellac fragment, then cream paper and reproducible concentric grooves.
- HIGH-LIFE → EXPLOSION: a red/ochre print edge interrupts the orderly green/brass arches; layered multi-genre print becomes dominant as the visitor moves.
- TRANSITION → NAIJA: blue/violet cassette language is followed by a silver CD/early-digital fragment, then the green/blue music-TV installation.
- AFROBEATS → GLOBAL: the warm city/concert frame introduces a dark LED fragment, then the restrained black arena installation.
- GLOBAL → ROOTS: the edge already carries ROOTS' amber woven pattern. Warm points in GLOBAL's LED rhythm echo that repeated geometry. As the unchanged route turns, digital material recedes and textile/drum forms enter. Both installations retain fixed colours and positions; there is no opacity blackout, portal, reset or loop-triggered replacement. This is a spatial handover, not an animated whole-room colour transition.

## Clearance

`check:visuals` screens all 24 conservative oriented boxes against the unchanged layout:

- 1,600 route samples: minimum visual clearance **5.445 m**.
- 8 eras × 9 start positions × 61 focus-flight samples: minimum **2.591 m**.
- Route and focus deck sightlines: minimum **1.209 m**.
- All interaction volumes and a conservative moving-record/sleeve/station envelope: no intersection.
- All eight semantic assignments: exactly 1 ACTIVE / 2 NEARBY / 5 DISTANT, including the wrap.

The extended `check:hall` uses the existing 10 cm hall voxel grid and 2,015 probes per installation (at the time: panel, prop bounding volume and next fragment; now the panel only): **zero hall intersections for all eight**. The locked route remains **121.81 m**. Existing route, station, focus and transition checks pass without threshold changes. The voxel check is screening at approximately ±5 cm, not a physics simulation; browser review is still necessary.

## Performance, before / after

Captured in the same in-app browser at the observed **758 × 964 CSS pixels, DPR 1**, medium station textures, automatic station LOD, sound playing, helpers off, inspector collapsed. Existing tonearm diagnostics sample drawn frames over 4.25 seconds (first 250 ms excluded). Values below are median draw calls / triangles / frame time / FPS, not a hardware guarantee.

| View | Before | After |
| --- | --- | --- |
| ROOTS route | 32 / 1,159,554 / 16.50 ms / 60.6 | 35 / 1,160,120 / 16.50 ms / 60.6 |
| EXPLOSION route | 33 / 1,260,027 / 16.50 ms / 60.6 | 37 / 1,364,786 / 16.50 ms / 60.6 |
| GLOBAL route | 33 / 1,261,938 / 16.60 ms / 60.2 | 36 / 1,262,108 / 16.50 ms / 60.6 |
| ROOTS focus | 31 / 1,056,059 / 16.70 ms / 59.9 | 33 / 1,056,623 / 16.50 ms / 60.6 |
| EXPLOSION focus | 32 / 1,157,221 / 16.80 ms / 59.5 | 34 / 1,157,377 / 16.70 ms / 59.9 |
| GLOBAL focus | 32 / 1,159,397 / 16.70 ms / 59.9 | 34 / 1,159,565 / 16.60 ms / 60.2 |

The original EXPLOSION route capture and the settled post-change view cull one existing hall mesh differently after the dev teleport. To separate that from asset cost, an additional **identical settled view** was measured with ERA VISUALS OFF/ON: **33 → 37 calls; 1,364,626 → 1,364,786 triangles (+160); 16.60 → 16.80 ms; 60.2 → 59.5 median FPS**. Station geometry is unchanged. Focus views and ROOTS/GLOBAL route views add only 156–566 drawn triangles net of the replaced placard. Frame-time variation and p95 are affected by the desktop host, inspector and capture overhead.

The runtime atlas is **171.8 KiB transferred**, **2048 × 1024 RGBA**, **10.67 MiB decoded including mipmaps**, shared across all artwork planes. The eight old 900 × 550 development placards used **20.14 MiB** including mipmaps and are no longer mounted: net presentation texture reduction **9.47 MiB**. The existing renderer's total estimate moves from about **320 MB to 311 MB** (rounded), with station textures still **69.3 MB / 34**. Visiting/changing records loads existing sleeve textures independently and must not be mistaken for environment texture growth.

## Validation and browser review

Passed: `npm run check` (TypeScript, ESLint, **234 tests**, content validation), explicit `npm run check:content` via that command, `npm run check:tonearm`, `npm run check:hall`, `npm run check:visuals`, and `npm run build`. No test was removed or weakened. No new package was installed.

A real canvas click entered ROOTS focus. The production focus-label NEXT control completed Talking Drum → Bàtá Drumming with the new visuals present: completed 1, mounted/playing selection identical, PLAY pose, platter 33.33 RPM, record/sleeve returned to zero displacement, focus exit free, all invariants held. Focus exit returned to the saved route. All eight eras were then checked at the 8 m approach, settled route anchor, real canvas-click focus and keyboard departure. All five named transitions were traversed. GLOBAL → ROOTS advanced continuously to absolute progress 1.0247 (loop 0.0247), with no reset. The visual preview override left the real ROOTS tonearm/active station unchanged. The production server at port 3001 was checked with ?inspector=1: no inspector, helpers, development placards or rotation marker appeared. Production canvas focus and Next reached Bàtá Drumming (2 / 5), then Close returned to travel; production console error log was empty. The ordinary development ?inspector=0 view was also checked. The temporary production server was stopped after review.

### Exact inspection steps

1. Open `http://localhost:3000/?inspector=0`. Check ROOTS' readable headline, warm textile and drum; click the deck to enter focus, then Next / Previous / Close. Scroll or press PageDown to travel. Desktop is the review target for this milestone.
2. Open `http://localhost:3000/?inspector=1`. In HALL LAYOUT turn off axes/grid/box, route, control pts, stations, route views, focus cams, references and labels. Collapse the inspector while judging visuals.
3. Use the **STATIONS** era buttons for each route anchor. Allow the existing camera orientation to settle. Click the canvas/deck for focus and Close to leave. The **CAMERA** numbered buttons start 8 m before each station for approach review.
4. Inspect all eight palette/motif combinations above, especially the CRT-to-CD and city-to-arena transitions. Use PageDown to leave each station; check the slim fragment of the next era.
5. At GLOBAL, keep moving forward through ROOTS. Look for the warm weave introduced beside the LED field, then the textile/drum installation. There should be no blank frame or reset.
6. Compare **ERA VISUALS ON/OFF** in the inspector. Try **FORCE ACTIVE ERA visuals** in INSPECT mode to compare detail tiers independently; restore AUTO afterwards. It intentionally does not teleport or change the audio era.
7. For comparable performance, use the same viewport and settled pose, switch off helpers, start TONEARM → MEASURE STILL, immediately collapse the inspector, wait for its 4.25-second capture, then reopen it. Compare the same camera with ERA VISUALS OFF and ON.

## Known limitations

These are intentionally original, stylized references built from planes and primitives; there are no licensed archival photographs or photoreal historic objects. The atlas prioritizes desktop route readability, so fine linework softens at distance. Headlines sit mostly above the locked focus framing; focus retains the lower era motif around the deck. The existing focus-label layout can overlap the sleeve in a narrow preview; final UI/mobile work remains outside this milestone. The marble hall itself remains very bright, and local lighting is deliberately subtle. The spatial seam uses material/graphic continuity rather than a whole-room animation.
