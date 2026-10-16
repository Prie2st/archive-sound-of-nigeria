# Platter Motion — the decks play

Status: **built** (2026-10-14). The platter and record of a station spin at 33⅓ RPM while that era's
selected record is logically playing, with a smooth spin-up and spin-down. No tonearm / stylus motion,
no record replacement, no NEXT / PREVIOUS — the hero record stays mounted (later milestones).

Files: [`src/stations/platterMotion.ts`](../src/stations/platterMotion.ts) (per-era motion states and
spring, pure; 11 tests in `platterMotion.test.ts`), `PlatterMotionDriver` in
[`src/scene/Exhibition.tsx`](../src/scene/Exhibition.tsx) (applies angles), `AudioEngine.isEraPlaying`
in [`src/audio/engine.ts`](../src/audio/engine.ts) (semantic bridge; 6 integration tests in `audio.test.ts`),
system created in [`src/scene/MuseumCanvas.tsx`](../src/scene/MuseumCanvas.tsx).

---

## 1. What rotates

Runtime hierarchy (every tier, verified in the GLB and at runtime):

```
Turntable
├─ Body                       static
├─ Platter                    pivot on the spindle, authored rotation = identity   ◀ rotation.y = angle
│  ├─ PlatterMesh
│  └─ RecordAnchor            (not touched)
│     └─ Record               cloned by ListeningStation, rides on the anchor  → follows, never rotated itself
└─ TonearmSwing → TonearmLift  sibling of Platter → unaffected (tonearm stays at rest)
Sleeve                         on the station root → stationary
```

Only `StationRig.platter.rotation.y` is written — one rotation, so platter and record cannot drift
apart, and the record cannot be rotated twice. Measured: record centre offset from the platter axis 0 mm,
record up-vector Y = 1.00000 while spinning (no wobble).

## 2. Semantic playback bridge

The visual layer asks one question per era: **`audio.isEraPlaying(eraId)`** — "is this era's selected
record logically playing?" True while its live voice runs in a running context; that includes **muted**
playback and voices mixed down to silence (quiet neighbours, neighbours during focus). False before unlock,
while the context is suspended, for an unavailable / failed record, after dev STOP, and once a voice is
retired (fading out of the neighbourhood). A map lookup — no Web Audio nodes leave the engine, no React state.

Consequence of the three-voice spatial mix: the decks of the previous / active / next eras spin (they are the
ones with live voices); a retired neighbour spins down; the five distant decks are at rest.

**Record change (docs/RECORD_CHANGE.md §7):** the predicate is now composed —
`platterDemand(i, audio.isEraPlaying(era))`: the audio rule above, except on the era whose record is being
changed, where the change decides (unchanged until the arm is clear, off while the record is off or travelling,
on again once the destination is seated). The spring, timings and angle integration are unchanged.

## 3. Per-era motion state

`PlatterMotionSystem` holds **one state per era** (not per LOD tier): `targetRpm`, `currentRpm`,
`rpmVelocity`, `angle`, plus `audioPlaying` and a dev `override`. One system, updated once per frame by
`PlatterMotionDriver` (no React state, no allocations); eras at rest skip all math.

Per frame: `targetRpm = playing ? 33⅓ : 0` → critically damped spring step → angle integration → the driver
sets the station's **current tier** rig platter: `rig.platter.rotation.y = state.angle`.

## 4. Values

All in `PLATTER_MOTION_CONFIG`:

| constant | value |
|---|---|
| `rpm` | **33⅓** (100 / 3; the model's `Platter.userData.rpm33`) — one speed for now |
| `spinUpTime` | **1.0 s** from rest to within 2 % of 33⅓ |
| `spinDownTime` | **1.2 s** from 33⅓ to within 2 % of rest |
| `settleFraction` | 0.02 |
| `restRpm` | 0.05 (snap to rest while spinning down; 0.3°/s, invisible) |
| `maxDelta` | 0.1 s (longest frame integrated) |
| `direction` | −1 → clockwise seen from above |

Measured spin-up in the browser (real unlock click, ROOTS): 17.8 RPM at 0.25 s, 27.4 at 0.5 s, 31.5 at 0.75 s,
32.8 at 1.0 s, 33.33 at 2 s; monotonic, max change 1.9 RPM per frame.

## 5. Rotation math

- Spring (exact critically damped solution, ω from the settle time: (1 + ωt)·e^(−ωt) = 0.02 → ω ≈ 5.83 / t):
  `e = rpm − target; c = v + ω·e; rpm' = target + (e + c·dt)·e^(−ω·dt); v' = (v − ω·c·dt)·e^(−ω·dt)`.
  ω_up (5.83 s⁻¹) while below target, ω_down (4.86 s⁻¹) while above. No overshoot from rest.
- Angle: `angle += direction · (rpm_avg / 60) · 2π · dt` (trapezoid of the RPM before / after the step).
- Time-based, not frame-based: RPM identical (1e-6) and angle within 0.01 rad after 5 s at 30, 60, 144 fps and
  irregular frames (test).
- Wrapping: `angle %= 2π` every step — rotation is periodic, so nothing snaps (test: a wrapped angle draws the
  same as the unwrapped one). Bounded after a 10-minute session (test).
- Direction: rotation.y < 0 is clockwise seen from above (north → east). Verified in a test (three.js) and in the
  browser (world-space record point, cross product −0.0095 → clockwise; 29° in 0.14 s ≈ 33⅓ RPM).

## 6. Tab / frame behaviour

`delta` is clamped to 0.1 s (and negative deltas ignored). While the tab is hidden the render loop stops, so
nothing integrates; on return the deck continues from its stored angle — no simulation of missed rotations, no
jump (the largest possible step is 0.1 s × 200°/s = 20°, the same clamp the CameraRig uses). Meanwhile the audio
context is suspended → `isEraPlaying` false → for the first frames after return the target is 0 until the
context has resumed (a few frames; the spring barely moves), then it holds 33⅓ again. In the dev build the
era-switch stalls (≥ 100 ms) are visible as 20° steps — the clamp at work.

## 7. LOD continuity

The angle belongs to the era. `ListeningStation` keeps all three tier rigs and exposes the current one; the
driver writes the era's angle to whichever rig is current every frame. A tier switch is committed by React
between frames, and the next frame's driver sets the new tier's platter before it is first drawn. Verified with a
hook on `gl.render`: on every rendered frame the visible tier's platter equalled its era's state (0 mismatches
in 3,177 frames), and every tier switch continued the rotation (e.g. ROOTS NEARBY → ACTIVE −38.9° → −46.4° in one
37 ms frame; RECORDING ACTIVE → NEARBY −46.3° → −53.8°). DISTANT decks get the same angle (normally 0 RPM: a
DISTANT era has no voice); a retired neighbour spinning down while already DISTANT keeps turning down smoothly.
No extra machinery for the proxies — just the same scalar.

## 8. Era changes, focus, mute, failure

- **Incoming neighbour**: its voice has been live since it became `next` (≈1.5 stations earlier), so its deck is
  already at speed. At every one of 10 browser-measured era boundaries (forward lap incl. GLOBAL → ROOTS, backward
  incl. ROOTS → GLOBAL) the incoming deck was at 33.33 RPM, angle continuing (e.g. GLOBAL → ROOTS: −297° → −301°).
  No reset, no new spin-up. The outgoing active simply becomes `previous` and keeps spinning.
- **Retired voice** (the far neighbour leaving): `isEraPlaying` false → spins down over ≈1.2 s.
- **Focus**: nothing changes — focus never touches audio voices, so target / current RPM / angle continue. Browser:
  RECORDING held 33.3333 RPM through Enter → FOCUS → M → Escape → unmute (1,186 rendered frames, 0 counter-clockwise
  steps, max step 11.8°).
- **Mute**: muted ≠ stopped — the voices keep running, `isEraPlaying` stays true, the deck keeps spinning.
- **Failure / unavailable**: no voice → target 0. A broken neighbour never spins; entering it leaves the deck
  stopped (status ERROR / "Recording unavailable" in the label), focus still works. A selected record without
  audio (e.g. a dev placeholder track) stops its deck.
- **Before unlock**: every deck at rest (457 locked frames measured at 0 RPM); the SOUND click spins up the active
  deck and its two live neighbours together.

## 9. Development tools

- DEV INSPECTOR → **PLATTERS** (development builds only): previous / active / next with tier, audio playing, override,
  target RPM, current RPM, angle; number of spinning decks. **FORCE PLAY ACTIVE**, **FORCE STOP ACTIVE**, **AUTO**
  (clear overrides).
- **Rotation marker** `?marker=1` (dev only, also a link in the panel): a thin red radial line on every record
  (one shared geometry / material, child of the Record so it rides with it). Off by default; adds one draw call per
  visible record, so leave it off for measurements. No production artwork changes.
- `window.__archivePlatters = { system, rigs }` (dev) for browser tests.

## 10. Performance

Intel UHD 620, 758 × 426 @ DPR 2, dev build, panel collapsed, audio playing, marker off (60 fps vsync cap):

| scene | fps median | frame ms med / p95 | draw calls min/med/max | triangles k min/med/max | spinning decks |
|---|---:|---|---|---|---:|
| ROOTS travel (ROOTS → RECORDING) | 59.9 | 16.7 / 33.5 | 16/64/107 | 471/1195/1906 | 3 |
| ROOTS focus | 59.9 | 16.7 / 33.5 | 47/47/47 | 1191 | 3 |
| ROOTS focus, all decks forced stopped | 59.9 | 16.7 / 33.5 | 47/47/47 | 1191 | 0 |
| EXPLOSION travel (→ TRANSITION) | 59.9 | 16.7 / 49.6 | 16/101/109 | 543/1165/1878 | 3 |
| GLOBAL → ROOTS | 59.9 | 16.7 / 33.5 | 15/101/111 | 338/1095/1806 | 3 |

Spatial-audio milestone, same segments: 59.9 fps, EXPLOSION → TRANSITION 17/102/109 calls, 543…1878k triangles;
GLOBAL → ROOTS 15/103–105/111 calls, 338…1806k — unchanged (min / max identical; medians depend on where the
segment samples). The motion driver (spring update for 8 eras + 8 rotation writes) costs **8.7 µs per frame**.
No allocations, no React renders, no geometry / texture changes, no raycasts.

## 11. Remaining limitations

- One speed (33⅓). 45 RPM singles are a later data / record-changing decision.
- The angle is visual only — it does not track the audio playhead or a groove position.
- The record spins with the platter rigidly (no slip-mat slip during spin-up / -down).
- On tab return the first few frames may target 0 until the audio context reports `running` again — a barely
  visible dip at most.
- The tonearm stays on its arm rest (off the record) while the deck spins; tonearm / stylus motion and the record
  change choreography (which will reuse the spin-down / spin-up behaviour) are the next milestones.
