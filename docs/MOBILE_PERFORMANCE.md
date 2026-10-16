# Mobile performance

Focused runtime/responsive pass, 15 October 2026. No asset rebuild, model reduction, new dependency, cache eviction or new camera/input/profiling architecture.

## Files

Added `src/config/quality.ts`, `src/config/quality.test.ts`, and this document. Updated `src/config/dev.ts`, `src/scene/MuseumCanvas.tsx`, `src/scene/EraWorlds.tsx`, `src/scene/dev/DevInspector.tsx`, the existing hint in `src/ui/dev/DevPanel.tsx`, `src/app/globals.css`, `src/state/travel.test.ts`, and the test list in `package.json`.

## Tiers

Updated 16 October 2026: selection happens once per page load, before the renderer mounts. Only an available device-memory hint ≤2 GB selects LOW. Otherwise a coarse pointer or width <1024 selects MEDIUM, including narrow phones and Safari without a memory hint. A wide fine-pointer desktop selects HIGH. Screen width alone no longer removes antialiasing or forces a 1× drawing buffer. Resizing/rotating preserves the selected tier and the visit; a reload selects again.

Development only: `?quality=high`, `?quality=medium`, `?quality=low`. Production ignores overrides. The existing camera/performance readout adds only QUALITY and actual DPR/cap.

| Tier | WebGL DPR cap | Secondary visuals | Antialiasing |
|---|---:|---|---|
| HIGH | 2.0 | Current ACTIVE props, neighbouring hints/fragments | Current multisample AA |
| MEDIUM | 2.0 | Full ACTIVE visuals; neighbouring decorative hints/fragments omitted | Retained |
| LOW | 1.0 | Core graphics/identity and active next-era fragment; standalone decorative props omitted | Multisample AA off |

All eight statements, primary palettes/core graphics and the active station light remain on every tier. The shared 2048×1024 atlas now uses outlined Ojuju lettering to match the home and archive UI, without a runtime font dependency for the texture. Station LOD remains **1 ACTIVE / 2 NEARBY / 5 DISTANT**, including GLOBAL↔ROOTS; the ACTIVE/focused turntable keeps its full geometry, materials and texture profile. Existing soft shadow maps, catchers and their per-tier budgets are preserved.

DPR affects the WebGL drawing buffer only, not DOM text/UI resolution. The renderer follows device DPR from 1 up to its cap of 2. A 390×844 CSS viewport at device DPR ≥2 therefore draws at 780×1688 instead of the previous 390×844 LOW buffer. This shades four times as many pixels; actual phone frame rate needs a device check. LOW retains its 1× cap for constrained-memory devices. The historical measurements below used a desktop host at DPR 1 and do not predict this cost.

## Returning home (16 October)

Exit archive is available beside sound in both travel and listening views, with 44px touch targets on narrow screens. Sound uses a compact icon on phones, retaining its full accessible state label and title, so both actions fit above the listening caption. Exit waits for an in-progress record change to finish before becoming enabled. Exiting stops playback through the existing engine, covers the mounted scene, pauses continuous drawing, resets home scroll and moves keyboard focus to the story. Re-entering skips the cold loader and starts the same engine from the Enter archive gesture. Camera position, current listening view and record selections survive; no new WebGL or AudioContext is created.

## Touch and responsive UI

Existing touch travel is unchanged: captured touch/pen pointer moves feed vertical deltas into the same inertial `TravelController` (up → forward, down → backward), with its existing speed clamp and focus lock. No independent mobile camera or record swipe was added. The canvas container's `touch-action: none`, page overflow/overscroll rules and existing R3F **8 px** tap/drag threshold remain in place. The canvas element itself reports `touch-action: auto`; the container's `none` still constrains browser gesture handling through the ancestor chain.

Added regression tests exercise upward/downward drag impulses, coasting/settling, velocity bounds and rejection of drag input while focus locks travel. A 160 px mouse drag over the station remained TRAVEL; a clean canvas click entered focus. These check the shared gesture guard/controller, not physical phone touch delivery.

At **390×844**, the established top-band caption ends at y≈346, above the visible record. Its record pane scrolls internally (ROOTS: 151 px viewport / 197 px content), exposing the full significance copy instead of permanently clamping it to two lines. Controls and sound are ≥44 CSS px tall at narrow widths and on coarse pointers. Portrait/landscape styling, semantic controls, queued/deferred-close behaviour and desktop layout remain intact. Hover treatments apply only to hovering fine pointers; focus-visible, pressed and disabled states remain.

The mobile intro uses `100dvh`, scrolls if short, and removes its desktop horizontal offset at ≤640 px. At 390×844 its title and ENTER ARCHIVE fit, with no page scroll. Existing safe-area variables/`viewport-fit=cover` are retained. ENTER ARCHIVE still calls the existing audio unlock path: observed one running AudioContext and PLAYING, with no second sound gesture. Existing reduced-motion CSS/camera behaviour and essential record choreography are unchanged.

## Representative simulated results

In-app browser, desktop GPU/host, **DPR 1**, medium station textures, helpers off, inspector collapsed. The existing 4.25 s drawn-frame capture supplies medians; the existing 2 Hz camera readout supplies texture counts/seam samples. No new profiler or repeated tuning sweep.

| Case | FPS | Frame ms | Draw calls | Triangles | Uploaded textures |
|---|---:|---:|---:|---:|---:|
| A: 1440×900 HIGH, ROOTS travel | 42.9 | 23.3 | 35 | 1,160,120 | 36 |
| B: 390×844 MEDIUM, ROOTS travel | 56.2 | 17.8 | 34 | 1,055,429 | 36 |
| B: 390×844 MEDIUM, ROOTS focus | 57.8 | 17.3 | 31 | 951,440 | 36 |
| C: 390×844 LOW, EXPLOSION focus (initially sound locked) | 60.2 | 16.6 | 32 | 1,157,221 | 36 |
| C: LOW, one EXPLOSION change with playback | 60.2 | 16.6 | 32 | 1,157,221 | 38 |
| D: 390×844 MEDIUM, GLOBAL→ROOTS (2 Hz samples) | 59.7–60.2 | 16.6–16.8 | 10–36 | 548,908–1,262,108 | 42 |

The desktop HIGH draw calls/triangles match the established ROOTS route numbers; its current larger viewport is not directly comparable to earlier 758 px-wide FPS captures. No desktop art/material/geometry was reduced. These are desktop simulations, **not mobile GPU predictions or real-device validation**. Resolution/camera framing also differ between cases, so cross-case triangle/FPS differences are not attributed solely to quality.

ROOTS Next completed Talking Drum→Bàtá, returned to PLAYING at 33.33 RPM with all invariants held, and Close returned to the saved route. LOW EXPLOSION Next committed Fela→King Sunny Adé / Ja Funmi, used the full ACTIVE rig, and completed the physical choreography without extra draw calls or pose mismatches. GLOBAL→ROOTS crossed absolute progress −0.1224→0.0301 continuously, with the same MEDIUM tier and no intro restart.

Narrow→1440×900→narrow retained MEDIUM, record selection and travel position. Background/resume was exercised through the **existing simulated visibility controls**: the same single context suspended/resumed; no travel jump or intro restart. Hiding the in-app browser did not change `document.visibilityState`, so actual OS/tab lifecycle remains a phone-check item.

Memory behaviour is unchanged: entry decoded the current/adjacent three audio files (3 requests / 4.39 MiB), a requested record adds its own label/sleeve and audio on demand, and no 40-file audio/archive preload was introduced. The renderer estimate remains ≈311 MiB, including ≈245 MiB textures. Cache eviction, gallery simplification/instancing and model/texture rebakes are deferred. The existing marble gallery and full ACTIVE deck remain the principal weaker-device risk.

## Validation / real-device status

16 October update: `npm run check` passes TypeScript, ESLint, **285 tests** and content validation; `npm run build` and `npm run check:visuals` pass. At a 390×844 production viewport, entering, focusing ROOTS, changing Talking Drum → Bàtá, returning home and re-entering preserved the selected record and listening view. Exit was disabled during the swap; returning home reset scroll, moved focus to the story and skipped the cold loader. The production console error log was empty. The final compact sound styling compiled successfully and still needs visual confirmation on a phone. The desktop test host remains DPR 1, so the new 2× phone drawing buffer is covered by policy tests rather than a physical high-DPI device test.

All required commands passed once after implementation: `npm run check` (TypeScript, ESLint, 247 tests), `npm run check:content`, `npm run check:tonearm`, `npm run check:hall`, and `npm run build`. No tests were weakened. Targeted quality/travel tests also passed while editing. A production preview at 390×844 ignored the DEV inspector/intro-skip/quality override parameters, displayed the intro, entered with Sound on, and focused ROOTS with enabled record controls. Its console error log was empty.

No real phone was available. Run the following **eight** checks on a phone against a production preview (use the computer's LAN address on the same network if serving locally):

1. Cold-load portrait with browser bars/notch visible: title and ENTER ARCHIVE fit inside safe areas.
2. Tap ENTER ARCHIVE: entry happens once and sound starts or offers a working enable/resume control; mute stays reachable.
3. Swipe up then down through the hall: correct direction, controlled inertia, no page scrolling or pull-to-refresh.
4. Swipe starting on a station, then tap it cleanly: swipe does not focus; tap does.
5. In ROOTS focus, read title/tradition/genre and scroll the significance pane: record stays clear and Previous/Next/Close remain reachable.
6. Change a ROOTS record, then an EXPLOSION record: physical sequence, sleeve/label/caption and audible selection agree; Previous also works.
7. Close during a change, rotate, then background/resume the tab: exit waits safely, layout recovers, visit/selection persist, intro does not restart.
8. With reduced motion enabled, travel GLOBAL→ROOTS: continuous loop and preserved era identity; essential record changes still complete.
