# Marble Hall Layout — LOCKED

**Status: spatially approved (locked) — 2026-10-14.**

The physical layout of the marble hall experience is fixed. Later work — era visual design,
typography, lighting, station models, the camera rig, audio — **adapts to this layout**.
Stations, the route and the camera anchors are not moved casually. Changing any locked
value requires an explicit decision, a re-run of `npm run check:hall`, a visual pass in the
dev view, and an update to this document.

Source of truth: [`src/data/hallLayout.ts`](../src/data/hallLayout.ts) (this document mirrors
it; if they ever disagree, the code wins and this file must be corrected).

---

## 1. What is locked

- Camera route (closed loop, control points, floor, eye height)
- Eight station positions and headings
- Route view anchors and route look-at anchors
- Focus (listening-mode) camera anchors
- The GLOBAL → ROOTS seam

Not locked (tuning for later milestones): approach window fractions, camera field of view,
scroll speed and easing, focus-camera transition timing.

---

## 2. Spaces and levels

| Item | Value |
|---|---|
| World space | runtime `public/models/gallery/marble-gallery.glb`, metres, Y up, origin = hall centre on the central platform floor |
| Room centre | (0, 0, 0) |
| Central platform floor | y = 0 |
| Route floor (sunken ring) | **y = −0.79** |
| Outer walkway floor (stations) | y = 0 |
| Travel eye height | 1.65 m above the route floor → **eye y = 0.86** |
| Loop | closed centripetal Catmull-Rom, **121.81 m**, radius 17.8–20.4 m, clockwise seen from above |

### Route control points (eye y = 0.86)

| # | x, z | Role |
|---|---|---|
| 0 | 0.65, −18.49 | ROOTS view (progress 0) |
| 1 | 6.12, −16.82 | mid-band |
| 2 | 12.56, −16.08 | RECORDING view |
| 3 | 16.75, −8.54 | mid-band |
| 4 | 18.79, −0.66 | HIGH-LIFE view |
| 5 | 17.12, 7.27 | mid-band |
| 6 | 13.76, 15.06 | EXPLOSION view |
| 7 | 6.12, 16.82 | mid-band |
| 8 | −0.65, 18.49 | TRANSITION view |
| 9 | −6.12, 16.82 | mid-band |
| 10 | −12.56, 16.08 | NAIJA view |
| 11 | −16.75, 8.54 | mid-band |
| 12 | −18.79, 0.66 | AFROBEATS view |
| 13 | −17.12, −7.27 | mid-band |
| 14 | −13.76, −15.06 | GLOBAL view |
| 15 | −6.12, −16.82 | mid-band → back to ROOTS |

---

## 3. Stations

Station anchor = table bottom-centre on the outer walkway (y = 0). Heading = `rotation.y`
so the station front (+Z) faces its route view anchor (0° = facing +Z).

| Station | Position (x, y, z) | Heading | Progress | Along loop | Placement |
|---|---|---|---|---|---|
| 01 ROOTS | 3.60, 0, −23.90 | −28.6° | 0.0000 | 0.0 m | N wall, beside the doorway |
| 02 RECORDING | 16.54, 0, −19.56 | −48.9° | 0.1010 | 12.3 m | NE corner bay, between two wall pillars |
| 03 HIGH-LIFE | 24.00, 0, 1.50 | −112.5° | 0.2400 | 29.2 m | E wall, central bay |
| 04 EXPLOSION | 16.54, 0, 19.56 | −148.2° | 0.3775 | 46.0 m | SE corner bay |
| 05 TRANSITION | −3.60, 0, 23.90 | 151.4° | 0.5000 | 60.9 m | S wall, beside the doorway |
| 06 NAIJA | −16.54, 0, 19.56 | 131.1° | 0.6010 | 73.2 m | SW corner bay |
| 07 AFROBEATS | −24.00, 0, −1.50 | 67.5° | 0.7400 | 90.1 m | W wall, central bay |
| 08 GLOBAL | −16.54, 0, −19.56 | 31.8° | 0.8775 | 106.9 m | NW corner bay |

Station spacing along the loop: 12.3 · 16.9 · 16.8 · 14.9 · 12.3 · 16.9 · 16.8 · 14.9 m
(GLOBAL → ROOTS = 14.9 m).

---

## 4. Camera anchors

Three future camera states use this data (none implemented yet):

- **TRAVEL** — camera on the route at eye y 0.86, looking along it.
- **APPROACH** — still on the route; inside the station's approach window it turns toward
  the route look-at anchor and may slow slightly.
- **FOCUS** — listening mode: the camera leaves the route for the focus anchor, then returns.

### Route view anchors (TRAVEL / APPROACH)

| Station | Route view position | Route look-at | Approach window (progress) |
|---|---|---|---|
| 01 ROOTS | 0.65, 0.86, −18.49 | 3.60, 0.78, −23.90 | 0.9449 → 0.0202 (wraps) |
| 02 RECORDING | 12.56, 0.86, −16.08 | 16.54, 0.78, −19.56 | 0.0555 → 0.1288 |
| 03 HIGH-LIFE | 18.79, 0.86, −0.66 | 24.00, 0.78, 1.50 | 0.1774 → 0.2675 |
| 04 EXPLOSION | 13.75, 0.86, 15.07 | 16.54, 0.78, 19.56 | 0.3156 → 0.4020 |
| 05 TRANSITION | −0.65, 0.86, 18.49 | −3.60, 0.78, 23.90 | 0.4449 → 0.5202 |
| 06 NAIJA | −12.56, 0.86, 16.08 | −16.54, 0.78, 19.56 | 0.5555 → 0.6288 |
| 07 AFROBEATS | −18.79, 0.86, 0.66 | −24.00, 0.78, −1.50 | 0.6774 → 0.7675 |
| 08 GLOBAL | −13.75, 0.86, −15.07 | −16.54, 0.78, −19.56 | 0.8156 → 0.9020 |

Route look-at = station centre at 0.78 m (table 0.635 + deck). Approach window =
45 % of the gap to the previous station → 20 % of the gap to the next (`APPROACH_WINDOW`,
tunable, not locked).

### Focus camera anchors (FOCUS / listening mode)

Authored relative to each station (`DEFAULT_FOCUS`, overridable per station via
`focusAuthoring`): three-quarter view from the turntable's left (yaw −20° from the
station's forward), 1.8 m horizontal from the platter centre (≈2.02 m direct), eye 1.65 m
above the walkway, looking ≈27° down at the record. All eight currently use the default.

| Station | Focus camera position | Focus look-at (platter / record centre) |
|---|---|---|
| 01 ROOTS | 2.21, 1.65, −22.73 | 3.56, 0.74, −23.92 |
| 02 RECORDING | 14.83, 1.65, −18.95 | 16.51, 0.74, −19.59 |
| 03 HIGH-LIFE | 22.69, 1.65, 0.24 | 24.02, 0.74, 1.46 |
| 04 EXPLOSION | 16.21, 1.65, 17.77 | 16.58, 0.74, 19.54 |
| 05 TRANSITION | −2.21, 1.65, 22.73 | −3.56, 0.74, 23.92 |
| 06 NAIJA | −14.83, 1.65, 18.95 | −16.51, 0.74, 19.59 |
| 07 AFROBEATS | −22.69, 1.65, −0.24 | −24.02, 0.74, −1.46 |
| 08 GLOBAL | −16.21, 1.65, −17.77 | −16.58, 0.74, −19.54 |

Platter centre = station anchor + `PLATTER_OFFSET` (−0.046, 0.7375, −0.0004) rotated by the
heading (table top 0.635 + turntable platter origin + record thickness).

---

## 5. Validation at lock time

- `npm run check:hall`: no failures, no warnings.
  - Route: on the sunken floor everywhere (≤ 3 mm deviation); ≥ 1.14 m from step risers;
    ≥ 4.1 m from pillars; ≥ 5.9 m headroom.
  - Stations: flat floor; 1.29–1.50 m from the steps; 1.31–2.34 m from walls/pillars;
    route sightlines clear (5.3–6.2 m, pitch ≈ −0.8°).
  - Focus cameras: nothing within 1 m; 2.02 m to the platter; pitch −26.9°; sightlines clear.
- Visual pass (dev view, 16:9): all eight ROUTE and FOCUS views inspected; GLOBAL → ROOTS
  inspected at progress 0.90 / 0.95 / 0.98 / 0.00 / 0.02 / 0.05 / 0.10 in both look modes.
- Seam: position continuous; tangent change across the seam 0.12° (numerical sampling);
  curvature at the seam (10.9°/m) equals that of the mirrored point at progress 0.5.

---

## 6. Known, intentional compromises

1. **Edge-on deck during travel.** The route is 0.79 m below the walkway, so at eye y 0.86
   the deck (0.78) is seen almost edge-on. Accepted: during travel the installation is
   perceived spatially; the record is seen properly in FOCUS (listening mode).
2. **Uneven station spacing** (12.3–16.9 m) follows the architecture (corner bays vs wall
   centres). Scroll pacing must absorb it rather than move stations.
3. **Route undulation.** The route bulges toward each view point and pulls in between
   stations; the along-route direction swings up to ≈45° over ≈6 m near view points. The
   future camera rig must smooth its look direction rather than look strictly along the
   tangent.
4. **Doorways behind ROOTS and TRANSITION.** These stations stand beside the N/S doorways;
   looking back at them after passing (progress ≈ +0.02–0.05) lines them up against the
   doorway. The APPROACH window ends before that, so the production camera does not hold
   that view.
5. **Diagonal focus cameras hover past the walkway edge.** RECORDING and NAIJA focus
   cameras sit above the top step (floor below −0.20); EXPLOSION and GLOBAL at the edge.
   Harmless for a camera (no geometry within 1 m) and gives slightly more context.
6. **Asymmetric diagonal pairs.** The −20° focus yaw is applied the same way for every
   station, so mirror-image corner stations get slightly different focus framings
   (e.g. EXPLOSION/GLOBAL show the gold step trim at the frame edge; RECORDING/NAIJA don't).
7. **Debug "nearest station" look mode** snaps between targets at the midpoints between
   stations (e.g. GLOBAL → ROOTS at progress 0.939). This is a property of the dev tool,
   not of the layout; production APPROACH blends within its window.
8. **Clearance method limits.** The checker uses a 10 cm voxel grid and treats the camera as
   a point; results are screening, confirmed visually.

---

## 7. Changing a locked value

1. Discuss and record the reason here first.
2. Edit `src/data/hallLayout.ts` only (never hardcode positions in components).
3. `npm run check:hall` → no failures.
4. Dev view (`?gallery=marble`, HALL LAYOUT panel): inspect ROUTE VIEW and FOCUS VIEW of
   every affected station, and the seam if the route changed.
5. Update the tables in this document.

---

## 8. Additions since the lock

- **2026-10-18 — instrument exhibits** ([EXHIBITS.md](EXHIBITS.md)). At the owner's request, nine plinths stand beside
  the route (`EXHIBIT_SLOTS` in `src/data/hallLayout.ts`). They were first placed on the outer walkway, then the same
  day moved onto the sunken ring, 1.3–1.5 m outward of the route and enlarged, so they stand out. There is one in the
  stretch before each station and two at the GLOBAL → ROOTS seam. No locked value changed: the route, stations, view and focus anchors and the seam are
  untouched. `npm run check:hall` reports no failures (0 hall intersections, flat floor under every plinth).
  `npm run check:visuals`: route ≥ 0.60 m, focus flights ≥ 0.51 m (threshold 0.3 m), deck sightlines unchanged.
