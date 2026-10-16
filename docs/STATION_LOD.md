# Listening Station — Geometry LOD Tiers

Status: **approved; all eight stations instantiated** (2026-10-14). Tiers are assigned from
a dev-selected active era (1 ACTIVE · 2 NEARBY · 5 DISTANT, wrap-aware, see §5); the
production camera rig will drive the same assignment later.

Source of truth: [`src/data/stationLod.ts`](../src/data/stationLod.ts) (tier names, reduction
settings, intended distances). Build: [`scripts/build-models.mjs`](../scripts/build-models.mjs)
+ [`scripts/lib/lod.mjs`](../scripts/lib/lod.mjs). Audit: `npm run audit:geometry`.

---

## 1. How the tiers are stored

All tiers live **in the same runtime GLB** as the ACTIVE model (`turntable-<profile>.glb`,
`vinyl-<profile>.glb`). Nothing extra is downloaded, and every tier uses the **same materials
and textures**, so a tier adds geometry only (no duplicated texture memory).

| Model | ACTIVE nodes (unchanged) | NEARBY | DISTANT |
|---|---|---|---|
| Turntable | `Turntable` (scene root) | `Turntable_Nearby` (scene root) | `Turntable_Distant` (scene root) |
| Record | `Record` | `Record_Nearby` | `Record_Distant` |
| Sleeve | `Sleeve` | `Sleeve` (shared with ACTIVE) | `Sleeve_Distant` |
| Table | `Table` | `Table` | `Table` |

Every turntable tier has the **same pivot structure in the same frame**:
`Body · Platter → RecordAnchor · TonearmSwing → TonearmLift → StylusTip` (suffixed
`_Nearby` / `_Distant`; GLTFLoader renames duplicate node names, so suffixes keep them
unique). `Platter` and `TonearmSwing` carry the same `extras` (rpm, tonearm angles) in every
tier. `lodNodeName(base, quality)` maps a base name to the tier's node.

`ListeningStation` stays **one component**: `quality` selects which nodes it clones; the
station root transform, the table and the anchors it attaches to are identical in every tier.
Each tier exposes the same `StationRig` handles (platter, tonearm swing/lift, stylus, record,
sleeve, angles), plus `rig.quality`.

---

## 2. Geometry audit of the ACTIVE turntable (before reduction)

`npm run audit:geometry` (runtime `turntable-medium.glb`). 773,524 triangles, 17 primitives:
Body 395,942 · Platter 118,448 · Tonearm 259,134.

**Visibility test:** a software z-buffer renders triangle IDs from 144 directions (every 15°
of azimuth × elevations 2°, 10°, 25°, 40°, 60°, 80° — never below the table top) at 1024².
**Every connected component wins pixels in some view — there is no fully hidden geometry**
(no internal parts, no buried underside pieces) to delete for free. 92,607 triangles face
downward (normal·Y < −0.9: plinth lip, top-plate underside, feet) but belong to visible
components, so the ACTIVE model keeps them.

### Cost vs visual importance (most expensive components)

| Component | Triangles | Size (mm) | Visual importance | Note |
|---|---:|---|---|---|
| Gold top plate (`chrome.CHINCHE`, Body) | 88,072 | 448 × 347 × 10 | **high** (defines the deck) | flat plate, extremely over-tessellated |
| Headshell + cartridge (gold, Tonearm) | 75,088 | 51 × 56 × 14 | medium at focus, low beyond 6 m | |
| Arm tube (gold, Tonearm) | 61,984 | 254 long, 37 wide | **high** (tonearm silhouette) | |
| Slip mat (`rubber`, Platter) | 53,472 | Ø 283 | **none while a record is on** | always covered except mid-switch |
| Pitch fader track (black metal, Body) | 49,856 | 24 × 128 | medium | right front |
| Lift / arm-base parts (plastic, Body) | 37,712 | 21 × 27 × 11 | low | |
| Arm-base metal (Body) | 35,136 | 36 × 70 | medium | |
| Platter side (black metal) | 27,648 | Ø 327 | **high** (silhouette) | |
| Counterweight (Tonearm) | 25,344 | 38 × 42 | medium | |
| Platter strobe dots + chrome ring | 37,120 | 580 pieces | medium at focus, low beyond | |
| Four feet (plastic) | 4 × 8,049 | 66 × 33 | low (in the plinth's shadow) | |
| Stylus / cartridge details | 18,368 + 11,776 + 9,762 | ≤ 18 | low | |
| Plinth body (plastic) | 6,798 | 453 × 351 × 66 | **high** | cheap |

By size: 603 components are < 10 mm (screws, wires, dots, LEDs) = 67,218 triangles (8.7 %);
27 components ≥ 30 mm carry 72 %.

### Simplification sweep (meshoptimizer, absolute error)

| Error bound | 0.2 mm | 0.5 mm | 1 mm | 2 mm | 4 mm |
|---|---:|---:|---:|---:|---:|
| Seams kept | 88,252 | 72,238 | 66,325 | 62,810 | 60,991 |
| Permissive + prune | 54,670 | 29,967 | 11,011 | 4,350 | 2,119 |

With seams kept, reduction stalls at ≈60k: UV and hard-normal seams in the plastic controls
and the gold tonearm are locked. Permissive mode collapses across seams (UVs and
hard-edge normals may smear), which is only acceptable far away.

Screen size of one pixel at the test viewport (852 device px tall, 50° vertical FOV):
≈1.9 mm at 2 m, 6.6 mm at 6 m, 13 mm at 12 m, 22 mm at 20 m.

---

## 3. The tiers

| | ACTIVE | NEARBY | DISTANT |
|---|---|---|---|
| Intended distance | 0–12 m (focus 2 m, route 6.2 m) | ≈6–18 m | ≈15 m + |
| Turntable | original, untouched | meshopt, **0.2 mm**, seams kept | meshopt, **1 mm**, permissive + prune, slip mat dropped |
| Turntable triangles | 773,524 | **83,743** (Body 46,297 · Platter 12,824 · Tonearm 24,622) | **10,828** (Body 6,208 · Platter 2,998 · Tonearm 1,622) |
| Record | grooved record 53,760 + label 384 | disc (top + rim, 96 seg.) 384 + label 96 | disc (32 seg.) 128 + label 48 |
| Sleeve | 12 tris, 3 materials | same as ACTIVE | 12 tris, **1** material |
| Table | 162 | 162 | 162 |
| **Station triangles** | **827,842** | **84,397** | **11,178** |
| Station primitives (draw calls) | 24 | 23 | 18 |
| Geometry buffers (turntable + record) | 17.5 MB + 0.83 MB | 3.4 MB + 9 KB | 0.27 MB + 3 KB |
| Animation | full interactive rig (record switching) | same pivots: platter spin and tonearm pose can be set; no record switching | same pivots: pose can be set; no record switching |

(Primitive counts exclude the dev-only placard. Geometry buffer sizes are the quantized
vertex + index data uploaded to the GPU.)

Runtime file sizes (medium profile, MiB): turntable 5.40 → **6.88** (+1.48 for both tiers),
vinyl 0.40 → 0.41. Build time for all four profiles ≈ 4 min.

### NEARBY

- meshoptimizer with an absolute error of 0.2 mm (≈1/30 px at 6 m) and **every attribute
  seam preserved**: UVs and the brushed-metal / clearcoat normals stay intact; vertex normals
  are the original ones, so shading follows the full model.
- Keeps every piece (screws, wires, strobe dots), the slip mat and all 17 primitives — the
  saving comes from the over-tessellated surfaces (top plate, tonearm, mat).
- Below the 100–250k target range on purpose: the 0.2 mm bound is already far below a pixel,
  and keeping it at ≈84k costs nothing visually.
- Record: a 96-segment disc (top + rim) using the real `VinylSideA` material through the
  fitted planar UV mapping of the grooves, plus the `Label` material on top. The record
  underside is never visible on a platter, so it is omitted.

### DISTANT

- meshoptimizer with 1 mm error (≈1/20 px at 20 m), **permissive** (collapses across
  seams) and **prune** (removes pieces smaller than the error: wires, strobe dots, screws).
  The slip mat is dropped (always covered by the record). 14 turntable primitives.
- An automatic simplification of the real model was preferred over a hand-built proxy: it
  keeps the exact silhouette, materials and pivots at ≈11k triangles, inside the 5–30k target.
- Record: 32-segment disc + 24-segment label. Sleeve: the same 12 triangles drawn once with
  the front-cover material (edges sample a corner of the cover), so a future per-track cover
  swap applies to it too.

---

## 4. Alignment across tiers (no visible jump on a tier switch)

- Same scene-root origin (turntable bottom-centre), same pivot translations, same extras —
  verified by dumping all three node trees (pivots identical to 0.1 mm; the only differences
  are quantization offsets of the mesh nodes, ≤ 0.1 mm).
- Simplification bounds the surface deviation to 0.2 mm (NEARBY) / 1 mm (DISTANT), so the
  silhouette and visual centre cannot move by more than that.
- The dev view logs per tier: record centre, Δ to the hall-layout platter (1.2 mm in every
  tier, unchanged from before), stylus position and the station's bounding box
  (`[station roots · <tier>] …`).
- Known differences: DISTANT has no slip mat (hidden under the record) and no wires or
  strobe dots; the record proxies have no grooves in geometry (the groove texture remains).

---

## 5. Tier assignment and development controls

All eight stations are rendered by `Exhibition` (one `ListeningStation` per era). The tier
of each station comes from its **circular** distance to the active era:
`qualityForLoopDistance(getEraLoopDistance(activeEra, era))` (`src/data/stationLod.ts`,
`src/data/eras.ts`) — 0 = ACTIVE, 1 = NEARBY (previous / next, wrapping GLOBAL ↔ ROOTS),
≥ 2 = DISTANT. Never raw index subtraction. Covered by `npm test` (ROOTS active → GLOBAL +
RECORDING nearby; GLOBAL active → AFROBEATS + ROOTS nearby; 1 / 2 / 5 for every era).

Dev view (`npm run dev`), DEV INSPECTOR → **STATIONS**:

- **active era** buttons (also `?era=roots…global` on page load) — re-tiers all stations live.
- **tiers**: `AUTO (by active era)` or force `all ACTIVE / NEARBY / DISTANT`
  (also `?lod=auto|active|nearby|distant`).
- Cameras on the active station: `route view`, `focus view`, `focus 1 / 1.5 / 2.02 m`
  along the focus axis (1 m = worst-case close-up) and `route 6.16 / 12 / 20 / 28 m` along
  the route axis. Note: on ROOTS's axis, 20 m and beyond land behind the inner colonnade.
- Readout (2 Hz): per station tier, triangles, triangles / meshes inside the camera frustum,
  totals, and decoded texture memory of the station models vs the dev placards.

---

## 6. Visual results by distance (dev view, 758 × 426 @ DPR 2)

| Camera on ROOTS | ACTIVE vs NEARBY | ACTIVE vs DISTANT |
|---|---|---|
| focus axis 1 m (worst case) | no visible difference | DISTANT: strobe-dot ring smeared, flat record disc — not for close range |
| route view 6.16 m | no visible difference | DISTANT: deck edge slightly brighter (smeared hard-edge normals) |
| route axis 12 m | no visible difference | same position and silhouette; deck rim marginally brighter |

Acceptable: ACTIVE at focus / route distance, NEARBY from ≈6 m, DISTANT from ≈15 m (at 12 m
the difference is already a sub-detail of a ≈30 px tall station). With the active-era
assignment the station seen at route distance is always ACTIVE, its neighbours (≈12–17 m)
NEARBY, the rest (≥ ≈20 m) DISTANT. Positions, record centres (Δ 1.2 mm to the layout in every
tier and station) and stylus positions are identical across tiers (dev log).

## 7. Performance — eight stations (Intel UHD 620, 758 × 426 @ DPR 2, overlays hidden, 10 readings / ≈6 s)

Measured 2026-10-14 in the dev build (another project's dev server was running on the same
machine; occasional single-frame stalls are excluded by reporting the median).

| Scene | View | FPS (median) | Frame ms | Draw calls | Triangles | Station tris in frustum |
|---|---|---:|---:|---:|---:|---:|
| Hall only | overview | 34.1 | 29.3 | 29 | 2,337,962 | — |
| Hall only | ROOTS route view | 53.2 | 18.8 | 8 | 361,482 | — |
| Hall only | ROOTS focus view | 59.6 | 16.8 | 8 | 361,482 | — |
| 8 stations, ROOTS active | overview | 30.9 | 32.4 | 178 | 3,379,324 | 1,041,348 |
| 8 stations, ROOTS active | ROOTS route view | 46.7 (mean) | 22.0 | 33 | 1,189,326 | 827,842 |
| 8 stations, ROOTS active | ROOTS focus view | 48.6 (mean) | 20.6 | 33 | 1,189,326 | 827,842 |
| 8 stations, EXPLOSION active | overview | 33.2 | 30.1 | 172 | 2,562,660 | 224,684 |
| 8 stations, EXPLOSION active | EXPLOSION route view | 44.9 (mean) | 22.5 | 33 | 1,260,027 | 827,842 |
| 8 stations, EXPLOSION active | EXPLOSION focus view | 42.1 (mean) | 23.8 | 32 | 1,157,221 | 827,842 |
| 8 stations, GLOBAL active | overview | 30.0 | 33.3 | 178 | 3,379,324 | 1,041,348 |
| 8 stations, GLOBAL active | GLOBAL route view | 46.1 (mean) | 21.8 | 33 | 1,261,938 | 827,842 |
| 8 stations, GLOBAL active | GLOBAL focus view | 42.3 (mean) | 24.9 | 32 | 1,159,397 | 827,842 |

- All eight stations: 1,052,526 triangles in total (1 × 827,842 + 2 × 84,397 + 5 × 11,178),
  identical for every active era. In the overview the EXPLOSION station is below the camera
  frustum, hence fewer triangles.
- Draw calls: overview 178 ≈ hall (29 alone) + 142 station meshes in frustum + 8 dev placards
  (the station meshes alone would be 24 + 2 × 23 + 5 × 18 = 160 without culling). Route / focus views draw only the active station (24) + the hall chunks in view.
- Estimated renderer memory (unique geometry buffers + textures as RGBA8 with mips): hall only
  **207 MB** (geo 42 + tex 165); hall + 8 stations **301 MB** (geo 65 + tex 236) — station
  model textures **50.7 MB in 20 textures, shared by all eight stations**, dev placards
  20.1 MB (8 canvas textures, dev only). The same scene with the pre-optimisation
  `reference` textures: 618 MB (station model textures 366.7 MB).
- Renderer: 41 textures and 111 geometries uploaded with all eight stations (vs 13 / 43 hall only).

## 8. Open items and risks

- **Draw calls barely drop** (24 → 23 → 18 per station); triangles drop 10× / 74×. With five
  DISTANT stations that is ≈90 calls. The natural next step is to **instance** the DISTANT
  (and NEARBY) tier across stations — they share geometry and materials, so InstancedMesh /
  BatchedMesh can draw all distant stations in one call per material. Not done yet.
- The DISTANT tier at close range (≤ 2 m) visibly loses the strobe-dot ring and wires — it
  must never be shown close.
- ACTIVE is unchanged and remains 774k triangles; the full-detail model is only affordable for
  one station at a time.
- If the source turntable changes, re-run `npm run audit:geometry` and re-check the tiers.
