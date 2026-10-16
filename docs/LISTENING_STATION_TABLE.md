# Listening Station Table — the listening desk and its album stack

Each station is now a physical record-browsing installation. A wider **listening desk** carries the turntable and,
beside it, the era's **five album sleeves as one stack**. The selected (mounted, playing) record's sleeve is always
on top. NEXT / PREVIOUS visibly browse the stack, in step with the existing physical record change.

Code: `src/stations/albumStack.ts` (pure: desk and stack layout, order rule, resting poses, choreography, phase
gating; Node-tested) · `src/stations/listeningDesk.ts` (desk geometry, stack meshes per LOD tier) ·
`src/stations/ListeningStation.tsx` (assembly) · `src/scene/RecordChangeDriver.tsx` (drives the stacks each frame) ·
`sleeveArtworkTexture` in `src/stations/recordArtwork.ts`. Tests: `src/stations/albumStack.test.ts`, the
"album stack" block of `src/stations/recordChange.test.ts`. Clearance: `npm run check:hall`.

## 1. Measured geometry (before)

Station space: metres, +Z = station front (visitor side), turntable centred on the station origin.

| part | bounds / position |
|---|---|
| table (table.glb) | 0.457 × 0.457 m, top (TopAnchor) at y 0.635 |
| turntable (turntable.glb, unscaled) | 0.455 (X) × 0.353 (Z) × 0.142 m, centred on the table top |
| platter / record | centre x −0.046, record ⌀ 0.302 (spans x −0.197 … 0.105), top at y ≈ 0.738 |
| tonearm | pivot at the turntable's right-back (+X), sweep stays within the plinth (+X side) |
| record removal path | lifts 25 mm (+12 mm arc), travels to the staging point 0.36 m toward **−X**: record spans x −0.557 … −0.255 at y ≥ 0.75 |
| old sleeve (the "floor card") | standing on the walkway at (−0.46, 0, 0.04), leaning on the table |
| focus camera (all 8 stations, identical locally) | (−0.662, 1.650, 1.691) looking at the platter (−0.046, 0.737, 0); ≈ 2.02 m, pitch −27°, vertical FOV 46° — front-left |

## 2. Design

```
              −X  (focus-camera side, record staging side)                  +X
   ┌───────────────────────────────────────────────────────────────────────────┐ z −0.32
   │   ┌─────────────┐                ┌─────────────────────────┐            │
   │   │  ALBUM       │   ~75 mm       │      TURNTABLE          │            │
   │   │  STACK (5)   │                │   (platter, tonearm +X)  │            │
   │   └─────────────┘                └─────────────────────────┘            │
   │   front zone: browse glide ↓                                              │
   └───────────────────────────────────────────────────────────────────────────┘ z +0.32
   x −0.725                         x −0.2275            0          +0.2275  x +0.255
```

- **The turntable does not move and is not scaled.** It sits on the same 0.635 m anchor as before, so the locked
  hall layout, platter offset, focus target, audio source and tonearm geometry are unchanged (1:1).
- **The desk grows toward −X.** That is the side the focus camera looks from, and the side the record already
  travels to during a change (the record now hovers over the record collection at its staging point, ≥ 84 mm above
  the stack). The tonearm (+X) side is untouched.
- **Desk construction:** two clones of the original table (the inverted wooden pyramid in its black-metal frame),
  centred at x 0 and x −0.47, under one continuous slab. The slab is textured from the table's own atlas: wood top
  (grain along the desk), black-metal edge band. Bases and slab are merged into one geometry with the table's
  original material, built once and shared by every station. The bases are only shortened by the slab thickness
  (3.8 %); nothing is stretched. The source GLBs are untouched.

| | old table | new listening desk |
|---|---|---|
| top | 0.457 × 0.457 m (0.21 m²) | **0.98 × 0.64 m** (0.63 m²), slab 24 mm |
| height | 0.635 | 0.635 (unchanged) |
| structure | one inverted-pyramid table | two original tables under one slab (same wood / black metal) |

Width split, left to right: margin ≈ 0.02 · stack ≈ 0.40 (fanned, including rotations) · gap ≈ 0.075 · turntable 0.455 ·
margin 0.03. The turntable takes ≈ 49 % of the occupied width and the stack ≈ 43 %, with the rest as breathing room. A real 12-inch sleeve
(0.314 m) next to a 0.455 m turntable cannot reach the 55–65 % target without shrinking the records or crowding the
deck, so the real geometry won.

## 3. Album stack

- **Sleeves:** 0.314 × 0.314 × 0.0033 m (the vinyl GLB's sleeve). Each is a thin card body plus a top art plane
  showing that record's own sleeve artwork (production archive art, or supplied art). No vinyl or turntable models
  are duplicated.
- **Stack centre** on the desk: (x −0.475, z −0.098), yaw −0.10 rad, so the top sleeve is square to the focus camera.
- **Resting poses** (stack-local; level pitch 3.6 mm = 3.3 mm sleeve + 0.3 mm air):

| depth | x | z | y (centre above desk) | rotation |
|---|---|---|---|---|
| 0 — top / selected | 0 | 0 | 16.05 mm | 0° |
| 1 | −14 mm | −9 mm | 12.45 mm | +1.6° |
| 2 | −28 mm | −18 mm | 8.85 mm | −1.2° |
| 3 | −42 mm | −27 mm | 5.25 mm | +1.9° |
| 4 — bottom | −56 mm | −36 mm | 1.65 mm | −1.4° |

  Lower sleeves step out to the left and back, so an edge of each is visible from the focus camera without clutter.
  (The first browser pass used 9.5 / 6.5 mm steps; the lower sleeves read only as hairlines, so the step was deepened.)
- **Order rule:** top = the selected (= mounted) record, then the playlist continuing circularly underneath. For A B
  C D E: selected C → C D E A B; selected D → D E A B C. The order is derived from the existing selection only —
  the stack owns no selection state — so per-era persistence controls it automatically.

## 4. Browse animation

Progress p ∈ [0, 1], about 0.95 s of motion, smootherstep everywhere: no bounce, flip or spin.

**NEXT** (old top → bottom; the second sleeve becomes the top):

| p | motion |
|---|---|
| 0.00–0.20 | LIFT: the top sleeve rises 14 mm |
| 0.20–0.45 | GLIDE: it slides 0.33 m toward the visitor, clear of the pile |
| 0.25–0.55 | REORDER: the others step up one level (the destination is now the visible top) |
| 0.45–0.60 | DESCEND: the glided sleeve lowers to the bottom level |
| 0.60–1.00 | SETTLE: it slides back underneath into the bottom resting pose |

**PREVIOUS** is the exact time-reverse of the NEXT that would undo it. The bottom sleeve slides out toward the
visitor, rises, glides back over the top and settles; the others step down one level. It is one gesture in two
directions. A sampled test (4 × 401 frames) proves no two sleeves ever pass through each other.

## 5. Record-change integration

No new timers and no independent animation: `RecordChangeDriver` feeds `AlbumStackSystem.update` every frame with
the era's playlist, its selected record and, for the changing era, the controller's request, phase and `restoring`
flag. The record-change state machine is unchanged. The browse may advance only as far as the deck allows:

| record-change phase | browse may reach | what the visitor sees |
|---|---|---|
| DUCK_AUDIO · LIFT_ARM · RETURN_ARM | 0.25 | the top sleeve lifts and starts to slide while the arm lifts |
| STOP_PLATTER · LIFT_RECORD · REMOVE_RECORD | 0.75 | the pile reorders; the destination is the visible top by the commit |
| PREPARE_NEXT (commit) → … → PLAYING | 1.0 | settles while the record is set down and inserted |
| restoring (destination failed before commit) | 0 | winds back: the original sleeve returns to the top |

- **Stable:** the stack rests exactly on the selection's order. When a browse ends, poses are rewritten from the
  exact resting values, so there is zero drift (tested over 20 changes).
- **Queue:** the stack follows the controller's request, so rapid input gives exactly what the controller does
  (NEXT ×10 → two changes, one top, correct order).
- **Failure semantics:** failure before the commit restores the original top (tested). A committed destination that
  ends UNAVAILABLE stays on top, because it is the mounted record (tested).
- **Invariant at completion:** mounted record = selected metadata = top sleeve = what plays.

## 6. LOD

| tier | stack | draw calls |
|---|---|---|
| ACTIVE | five sleeves: bodies in one InstancedMesh + one art plane per record (own artwork) | 6 |
| NEARBY | one merged resting pile + the selected record's art on top (the station's shared sleeve material) | 2 |
| DISTANT | one merged resting pile, bodies only | 1 |

Geometry is shared museum-wide (one sleeve box, one art plane, one merged pile per playlist length). Only the
ACTIVE station loads its five sleeve textures, lazily on first activation. They come from the same once-per-URL
cache as the deck artwork, so a sleeve the visitor later selects is already loaded.

The desk itself stays **one draw call** per station (bases + slab merged with the table's material), as the single
table was.

## 7. Floor card

The sleeve that stood on the walkway beside the table is **removed**. It duplicated the sleeve artwork now lying on
the desk, the focus caption and the era installation. Its clone is kept unmounted only as the source of the
station's shared sleeve material (the NEARBY stack top uses it).

## 8. Clearance

- **Hall** (`npm run check:hall`, extended): every station's desk zone is screened against the hall voxel grid. The
  zone is the slab plus the browse glide, with a 5 cm margin, up to 0.84 m high. Result: 2,992 probes per station,
  **0 intersections**; flat floor under all eight; nearest wall / pillar ≥ 0.71 m (ROOTS) from the desk zone. Focus
  flights stay ≥ **1.51 m** from the enlarged installation box (was 1.63 m with the old table).
- **Era visuals** (`npm run check:visuals`): the installations remain outside the record-change envelope; route
  5.445 m, focus flights 2.591 m, unchanged.
- **Deck:** the stack is ≥ 40 mm from the turntable plinth (tested); the tonearm (+X) side is untouched; the record
  at its staging point passes ≥ 98 mm above the resting stack (84 mm above a lifted sleeve). The interaction volume already covers the whole
  desk.
- **Known overhang:** at its furthest point the NEXT / PREVIOUS glide carries the moving sleeve about 7 cm past the
  desk's front edge for roughly 0.2 s. Full clearance of a 0.314 m sleeve needs that travel on a desk that stays
  elegant; see §10.

## 9. Performance

| | before | after |
|---|---|---|
| desk / table per station | 1 draw | 1 draw (merged) |
| stack: ACTIVE / NEARBY / DISTANT | — (one floor sleeve, 1–2 draws) | 6 / 2 / 1 draws |
| stack triangles: ACTIVE / NEARBY / DISTANT | — | 70 / 62 / 60 |
| stack textures | the selected sleeve per station | + up to 4 sleeves (512², ≈1.4 MB each) per station that has been ACTIVE |

Measured in the in-app browser (758 × 960, DPR 1, medium textures; before = the established captures in
docs/ERA_VISUAL_WORLDS.md / MOBILE_PERFORMANCE.md):

| view | before: calls / triangles | after: calls / triangles |
|---|---|---|
| ROOTS travel | 35 / 1,160,120 | 38 / 1,160,352 |
| ROOTS focus | 33 / 1,056,623 | 36 / 1,056,855 |
| EXPLOSION travel / focus | 37 / 1,364,786 · 34 / 1,157,377 | 40 / 1,365,018 · 37 / 1,157,609 |
| GLOBAL travel / focus | 36 / 1,262,108 · 34 / 1,159,565 | 39 / 1,262,340 · 37 / 1,159,797 |

**+3 draw calls and +232 triangles** in every view: the ACTIVE stack's 6 draws and the two NEARBY piles replace the
old floor sleeves; DISTANT piles are usually culled. Frame rate could not be compared reliably because the
browser window was repeatedly backgrounded during this session (see §11).

The per-frame driver work is a few multiply-adds per sleeve; nothing is written when a stack is at rest.

## 10. Verification (browser)

Real production CameraRig and focus, development server, `?inspector=0`, a self-running script driving the real
controllers (NEXT / PREVIOUS through `requestStep`, focus through `requestFocus`), plus real ArrowRight presses:

- **ROOTS, EXPLOSION, GLOBAL:** travel view, focus, NEXT, PREVIOUS, rapid NEXT ×4 (two changes, as the queue
  allows), Close and leave / return all passed. Every time the destination was the top sleeve at the physical commit,
  and at rest selection = top sleeve = presented record = caption. The selection persisted after leaving
  (Oríkì, Oroki Social Club, Calm Down). No invariant problems.
- **All eight stations:** identical framing (the layout is shared). The caption covers 0 % of the stack, and every
  focused station uses the ACTIVE tier.
- **Framing:** at 758 × 960 portrait, the five resting sleeves project to x 5–233 px and the browse glide to x 36–264 px:
  fully in view, tight at the left edge. Landscape windows have more room. **The focus camera was not changed.**
- **Mid-browse still** (controller frozen at PREPARE_NEXT for the capture, then released): the old top glided toward
  the visitor, the destination on top of the pile, the removed vinyl hovering over the collection, and the caption
  already switched at the commit.

## 11. Known limitations

- The browse glide briefly overhangs the desk front (§8); visible in the mid-browse still.
- In narrow portrait windows the stack sits within a few pixels of the left screen edge in focus (still fully in
  view); the mobile pass may want a small framing nudge there.
- Sleeve textures are kept for the visit (no eviction). After visiting all eight stations that is up to 32 extra
  512² textures (≈45 MB decoded), within the established artwork budget but worth an LRU later.
- The stack's resting fan is fixed; it does not vary per era beyond the artwork.
