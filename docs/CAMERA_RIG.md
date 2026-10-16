# Camera Rig — continuous TRAVEL

Status: **TRAVEL mode built** (2026-10-14). APPROACH → FOCUS (station click, listening
mode) is the next milestone; the rig stays on the closed route.

Files: [`src/state/travel.ts`](../src/state/travel.ts) (config, physics, influence, active era —
pure, unit-tested in `travel.test.ts`), [`src/input/useTravelInput.ts`](../src/input/useTravelInput.ts)
(wheel / touch / keys), [`src/scene/CameraRig.tsx`](../src/scene/CameraRig.tsx) (per-frame camera).

---

## 1. Route source

There is **one** route: the closed centripetal Catmull-Rom curve built by
`getHallLayout()` from `PATH_CONTROL_POINTS` (`src/data/hallLayout.ts`, locked — see
HALL_LAYOUT_LOCK.md). The rig evaluates it with `curve.getPointAt(loopProgress)`
(arc-length parametrised, so speed is physical metres along the route; stations are at
their authored, unequal progress anchors — no 0.125 sections). The curve's own height (eye
y = 0.86) is used unchanged. Nothing is re-interpolated between stations.

## 2. Progress

- `absoluteProgress` — continuous travel in laps since the start; unbounded in both
  directions, never reset (owned by `TravelController`).
- `loopProgress = ((absoluteProgress % 1) + 1) % 1` (`loopProgress()` = `wrapProgress()`),
  used for everything spatial. 1.05 → 0.05, −0.10 → 0.90, 8.877 → 0.877.
- Forward past GLOBAL simply continues into ROOTS (0.99 → 1.01 absolute = 0.99 → 0.01 loop);
  backward likewise. There is no reset branch anywhere.

## 3. Input physics

All input becomes **velocity impulses** on the same controller; nothing moves the camera
directly:

```
wheel / touch drag / keys → impulse (m/s) → pending (eased in, τ = impulseSmoothing)
  → velocity (friction, hard clamp, soft approach limit) → absoluteProgress → loopProgress → camera
```

- **Wheel** (`passive: false`, native scroll prevented): `deltaY` normalized to pixels
  (lines × 16, pages × viewport height), clamped to ±`maxWheelPixels` per event, × `scrollSensitivity`.
  A mouse notch (≈100 px) gives 3 m/s → ≈2 m of travel; trackpads send many small deltas on
  the same scale.
- **Touch / pen**: vertical drag, impulse per move (`touchSensitivity` per px; finger up =
  forward). The pointer is captured; on release the velocity keeps coasting (the release
  speed is already in it). Mouse drags are ignored (reserved). `touch-action: none` on the
  canvas and `overscroll-behavior: none` on the page prevent browser panning and overscroll.
  Horizontal gestures are not handled (record changing comes with listening mode).
- **Keys**: ArrowDown / PageDown forward, ArrowUp / PageUp backward — one `keyImpulse` per
  press, held keys rate-limited to one impulse per `keyRepeatInterval`. Ignored while typing
  in form fields.
- **Velocity is clamped** (±`maxVelocity`), never the progress. Pending impulse is capped
  too, so no burst of events can launch the visitor across several eras.
- A frame longer than 0.1 s is integrated as 0.1 s.

## 4. Station influence

Each station's existing **approach window** (`StationLayout.approach`, from
`APPROACH_WINDOW` in hallLayout.ts: 45 % of the gap to the previous station before the
anchor, 20 % of the gap to the next after it — tunable, not locked) defines its influence:
0 at the window start, rising with a C2 smootherstep to **1 at the station's progress anchor**
(its route view point), falling back to 0 at the window end. Distances use `progressDelta`
(circular), so ROOTS (anchor 0) influences 0.945 → 0.999 and 0.000 → 0.020. Windows never
overlap; `strongestStation()` returns the one station in range (or none).

## 5. Orientation model

Per frame:

1. **Route direction** — average of the directions to the route points `lookAheadNear` (4 m)
   and `lookAheadFar` (10 m) ahead: smooths the route's bulges toward the view points (the
   raw tangent swings up to ≈45° near them) and naturally anticipates the next exhibit.
2. **Station direction** — toward the station's existing route look-at (`view.target`:
   station centre at deck height).
3. Target = slerp(route, station, influence × `stationLookWeight`), as quaternions built with
   `Matrix4.lookAt` — no Euler angles, so nothing flips at the seam.
4. The camera orientation follows the target with `1 − e^(−k·dt)`, k = `orientationResponse` ×
   (1 + `orientationSpeedBoost` × |v| / `maxVelocity`): smooth and slightly delayed at normal
   speeds; at top speed it catches up up to 1.6× faster. (Added 2026-10-14 after a visual check:
   at 6 m/s right after GLOBAL the view trailed the bend for ≈0.2 s onto a blank wall; with the
   boost the same frames show the pillars and the ROOTS doorway — a pan, not a stare.)
5. **Banking**: roll = yaw rate × `bankingGain`, capped at `bankingMaxDeg` (1°), eased.
   No vertical floating (left out: the route already undulates; floating added nothing).

The camera always faces the forward direction of the loop; travelling backward rewinds
along the route without turning around.

## 6. Active era

`selectActiveStation()`: the station whose anchor is nearest along the loop (circular
distance), with a hysteresis of `activeEraHysteresis` (0.005 ≈ 0.6 m) — the new station must
be nearer by more than that, so hovering at a midpoint cannot flicker. The switch points are
the midpoints between anchors (GLOBAL → ROOTS at ≈0.939). React state is updated only when
the era changes (`onActiveEraChange`), which drives the existing LOD assignment
(ACTIVE / NEARBY ×2 / DISTANT ×5, docs/STATION_LOD.md) automatically.

## 7. FOV

`travelFov` 52° while travelling → `approachFov` 47.5° at full station influence, eased with
`fovResponse`. Continuous across the seam (it depends only on influence).

## 8. Approach slowdown

Near a station the controller (a) adds friction: × (1 + `approachFrictionBoost` × influence),
and (b) softly lowers the speed limit to `maxVelocity` × max(`minApproachSpeedMultiplier`,
1 − `slowdownStrength` × influence), easing excess speed down at `slowdownResponse`. It never
stops or snaps; the visitor keeps control.

## 9. Reduced motion

`prefers-reduced-motion: reduce` (read at start and on change) switches to
`REDUCED_MOTION_OVERRIDES`: friction 4 (short coast), impulse smoothing 0.04 s, no approach
friction boost, station look weight 0.55, faster orientation settle, FOV 52 → 51°, no
banking. Navigation is unchanged.

## 10. Dev modes

DEV INSPECTOR → **CAMERA**: `TRAVEL` (the CameraRig owns the camera) or `INSPECT`
(OrbitControls + the static HALL LAYOUT previews). Only one is ever mounted, so they cannot
both update the camera. Also: pause travel, reset to ROOTS, **jump near 01–08** (dev
teleport 8 m before a station — sets `absoluteProgress`; production era navigation must
travel along the loop instead), input sensitivity (× `accelerationScale`). In TRAVEL the
STATIONS era buttons jump to that station's view point; the active era follows the camera.
The readout shows mode, absolute / loop progress, velocity, FOV, active era and influence.
Route, anchors and look targets stay available behind the HALL LAYOUT toggles.
URL: `?camera=travel|inspect` (default TRAVEL), `?era=` = start station. Production
(no inspector) is always TRAVEL, starting at ROOTS.

## 11. Tunable constants (`TRAVEL_CONFIG`)

| Constant | Value | Reduced motion |
|---|---:|---:|
| scrollSensitivity (m/s per wheel px) | 0.03 | |
| maxWheelPixels (per event) | 150 | |
| touchSensitivity (m/s per px) | 0.02 | |
| keyImpulse (m/s) · keyRepeatInterval (s) | 3 · 0.18 | |
| accelerationScale | 1 (dev slider) | |
| maxPendingImpulse (m/s) | 6 | |
| impulseSmoothing (s) | 0.12 | 0.04 |
| maxVelocity (m/s) | 6 | |
| friction (1/s) | 1.4 | 4 |
| minVelocity (m/s) | 0.01 | |
| slowdownStrength · minApproachSpeedMultiplier | 0.35 · 0.6 | |
| approachFrictionBoost | 0.5 | 0 |
| slowdownResponse (1/s) | 3 | |
| lookAheadNear · lookAheadFar (m) | 4 · 10 | |
| stationLookWeight | 1 | 0.55 |
| orientationResponse (1/s) | 3 | 4 |
| orientationSpeedBoost (× at max speed) | 0.6 | 0.6 |
| travelFov · approachFov (°) | 52 · 47.5 | 52 · 51 |
| fovResponse (1/s) | 2 | |
| bankingGain (° per °/s) · bankingMaxDeg | 0.04 · 1 | 0 · 0 |
| bankingResponse (1/s) | 2 | |
| activeEraHysteresis (progress) | 0.005 | |
| APPROACH_WINDOW (hallLayout.ts) | before 0.45 · after 0.2 of the gap | |

## 12. Verification and measurements (2026-10-14, Intel UHD 620, 758 × 426 @ DPR 2, overlays hidden, dev build)

- Seam (wheel-driven, 5–6 m/s, frame-by-frame): forward 0.9993 → 0.0015 moved 0.27 m in a 54 ms frame (exactly the
  travelled distance, no teleport); backward 0.0004 → 0.9986 likewise. Eye y constant 0.86, velocity carried
  across (5.26 → 5.39 m/s), FOV continuous (≤ 0.44°/frame). Active era: forward GLOBAL→ROOTS at 0.943,
  ROOTS→RECORDING at 0.053; backward RECORDING→ROOTS at 0.047, ROOTS→GLOBAL at 0.936 (hysteresis, no flicker);
  LOD tiers followed. Endless forward / backward covered by unit tests.
- Touch (synthetic pointer events): 200 px swipe up +2.16 m, down −2.17 m; mouse drag 0. Keys: ↓ +1.5 m,
  PageDown +2.05 m, ↑ −2.05 m, ↓ held 1 s +10.2 m (rate-limited). Wheel / PageDown default prevented.
- Era change cost: originally +50–80 ms per switch (whole-tree React re-render). Fixed by (a) an external
  active-era store (`src/state/valueStore.ts`, useSyncExternalStore — only readers re-render), (b) memoised
  ListeningStation with all three tier rigs prebuilt (a switch toggles visibility), (c) the dev alignment log
  made opt-in (`?stationLog=1`, it cost ≈25 ms). Remaining: ≈1 longer frame (≈40–50 ms) at a switch in the dev build.

| Pass | FPS (median) | frame ms med / p95 / max | draw calls min/med/max | triangles (k) min/med/max |
|---|---:|---|---|---|
| parked at ROOTS view point | 52.1 | 19.2 / 25.6 / 98 | 32 | 1,160 |
| parked at EXPLOSION | 53.2 | 18.8 / 26.4 / 75 | 33 | 1,260 |
| parked at GLOBAL | 54.1 | 18.5 / 23.0 / 73 | 33 | 1,262 |
| travel past ROOTS | 47.2 | 21.2 / 26.0 / 61 | 33/58/63 | 549/1,377/1,794 |
| travel past EXPLOSION | 50.0 | 20.0 / 26.7 / 72 | 9/35/63 | 536/1,467/1,866 |
| travel past GLOBAL | 51.3 | 19.5 / 29.9 / 66 | 7/33/64 | 332/1,262/1,898 |
| seam forward 0.89 → 0.05 | 47.4 | 21.1 / 42.1 / 92 | 7/57/63 | 332/1,083/1,894 |
| seam backward 0.05 → 0.89 | 46.5 | 21.5 / 45.3 / 167 | 34/58/80 | 654/1,377/1,898 |

Texture memory estimate 301 MB (tex 236) throughout; LOD distribution always 1 A · 2 N · 5 D. Previous static
route views: 44.9–46.7 fps, 33 calls, 1.19–1.26M tris. Between stations the travel camera looks across the hall and
draws up to 58–80 calls / 1.9M triangles (more pillar chunks and stations in view) — the main new cost.

Focus mode (FOCUS_TRANSITION_IN / FOCUS / FOCUS_TRANSITION_OUT) is documented in
[docs/FOCUS_MODE.md](FOCUS_MODE.md): the rig keeps the travel pose frozen and blends to the
authored focus camera.

## 13. Known limitations

- Influence windows are short after a station (20 % of the gap): the view turns back to the
  route ≈2.5–3.4 m after the view point. Tune `APPROACH_WINDOW.after` if it feels abrupt.
- The camera never turns around when travelling backward (by design).
- Keyboard focus: keys work anywhere except form fields; there is no on-screen focus
  handling yet.
- No collision / occlusion handling — the route is authored and clear (check:hall).
