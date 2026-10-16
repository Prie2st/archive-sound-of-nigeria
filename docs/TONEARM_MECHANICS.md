# Tonearm mechanics

Status: built and validated, 2026-10-14. Mechanical development controls only. Initial pose is
authored REST. Audio, platter playback, track selection, vinyl, sleeves, hall layout and camera
systems are unchanged. No record-change choreography or production controls were added.

## Runtime hierarchy and axes

```text
Turntable
├─ Body                         static
├─ Platter                      existing audio-driven rotation.y
│  └─ RecordAnchor → Record      unchanged
└─ TonearmSwing                 local rotation.y (horizontal yaw)
   └─ TonearmLift               local rotation.x (vertical lift)
      ├─ TonearmMesh            never transform this quantized leaf
      └─ StylusTip              follows both parent pivots naturally
```

All three tiers have this hierarchy, identical pivot translations, StylusTip and authored extras;
NEARBY/DISTANT names carry their existing suffixes. Node references are resolved once in
`ListeningStation`, never searched/traversed by the motion driver. Nothing translates the arm,
rotates the chassis, or changes platter/RecordAnchor alignment.

Measured from the runtime medium GLB, in turntable coordinates (metres):

- Swing pivot: `(0.1510855034, 0.1199034974, -0.0851654969)`.
- Lift pivot: identity transform relative to swing, so it shares the bearing.
- StylusTip relative to lift: `(-0.0407485068, -0.0119424984, 0.2300315015)`.
- Authored REST rotations: swing 0, lift 0. Negative lift raises the distal arm.
- Stored extras: `restSwing=0`, `leadInSwing=-0.3318`, `runOutSwing=-0.735`,
  `restLift=0`, `playLift=0.0227`, `raisedLift=-0.0295` radians. They remain unchanged.

## Semantic poses and contact

`resolveTonearmPoses()` centralizes the poses from those extras and the actual record thickness.
The fixed PLAY swing uses the authored lead-in angle. Its 145.792 mm stylus radius is 5.208 mm
inside the 151 mm record rim and 95.792 mm outside the 50 mm label radius. No groove-following drift.

The rounded authored `playLift` put the tip 0.0113 mm below the nominal record top. A small lift-only
correction resolves contact at **0.500 mm above** the surface: `0.02047422317` rad, about +1.173°.
This is computed once from StylusTip and the actual Record/Platter surface; no authored pivot or
model is replaced. A correction greater than 0.01 rad is refused.

| Pose | Swing radians | Lift radians | Tip above record plane | Tip radius |
|---|---:|---:|---:|---:|
| REST | 0 | 0 | 5.207 mm, outside disc | 213.591 mm |
| LIFTED_REST | 0 | -0.0295 | 11.997 mm, outside disc | 213.763 mm |
| LIFTED_PLAY | -0.3318 | -0.0295 | 11.997 mm | 146.112 mm |
| PLAY | -0.3318 (−19.010°) | 0.02047422317 | 0.500 mm | 145.792 mm |

Accepted PLAY contact tolerance is **0–3 mm above the nominal surface**. Raised poses must give
at least 10 mm. The authored raise moves the tip 6.790 mm upward from REST and 11.497 mm upward
from corrected PLAY. Lift range is −0.0295…+0.02047422317 rad. REST is 62.591 mm outside the vinyl
rim; the tip and cartridge do not sit over the record or platter.

## Controller, legal sequencing and timing

`TonearmController` owns one semantic target, current/target swing and lift, and one axis segment.
Phases are `IDLE`, `LIFTING`, `SWINGING`, `LOWERING`. No GSAP, timers, React frame state or dependencies.

Both REST → PLAY and PLAY → REST enforce **lift → swing → lower**. A change of swing target first
raises the arm fully. Swing cannot begin below the raised pose; lowering can begin only at the
requested swing endpoint. Intermediate LIFTED poses stop safely without lowering.

Configurable full-move timings in `TONEARM_MOTION_CONFIG`:

| Motion | Seconds |
|---|---:|
| Lift | 0.32 |
| Swing toward PLAY | 0.85 |
| Swing toward REST | 0.85 |
| Lower | 0.38 |
| Complete REST ↔ PLAY | 1.55 |

Interpolation is elapsed-time quintic smootherstep (zero velocity/acceleration at segment ends).
Partial reversals scale duration to distance remaining. Unused frame time carries into the next
legal segment, so a frame may finish swinging and begin lowering, in that order. Delta is clamped
to 0.1 s; negative deltas are ignored. Tests match angles at 30/60/144 fps and irregular deltas,
including segment crossings and interrupted moves.

New commands replace the single semantic target and replan from current angles. Reversing during
lift can return directly to the original down pose when no swing is needed. Reversing during
swing stays raised, swings back, then lowers. Reversing during lowering lifts again before swinging.
Repeated identical commands do not restart motion. There are no competing timelines or queued timers.
Position stays continuous; a reversal starts a new eased segment rather than preserving angular velocity.

## Era, focus, LOD, audio and platter behavior

> **Updated by the record-change milestone (docs/RECORD_CHANGE.md §6).** The mechanism itself is unchanged
> (same poses, legal lift → swing → lower, timings); what changed is who commands it and which rigs show it.

One controller is registered per era as soon as any of its tiers mounts (all tiers resolve identical poses).
Initial pose is REST. The record-change controller now commands the arms: an era whose selected record has a
live voice holds PLAY, otherwise REST (`syncTonearms`), and a record change runs its own PLAY → LIFTED_PLAY →
LIFTED_REST → LIFTED_PLAY → PLAY sequence. The full-detail ACTIVE arm moves through `request()` and is the only
controller updated per frame; every other era's arm is placed directly with the new `snap(pose)`.

The driver still animates only the semantic ACTIVE station's full rig; every other station's visible rig gets its
era's current angles written (two rotations, no update), so a playing NEARBY deck shows its arm in PLAY and an era
becoming ACTIVE is already in its pose; an arm left mid-move when its era stops being ACTIVE completes at once.
The sync is edge-triggered: it asserts the pose when an era's playback state changes (or after a record change),
so the dev TONEARM buttons and MEASURE MOTION keep working until the era's playback next changes.

Focus entry/exit never reads or resets tonearm state. Mute has no input to the mechanism.

## Deterministic clearance screening

Run `npm run check:tonearm`. It decodes the existing runtime GLBs with the already-installed pipeline
libraries. It checks tier hierarchy/pivots, semantic poses, the safe lift/swing/lower envelope and all
eight station world rotations.

Approximation: a **1 mm XZ height field** of the static Body (including chassis, controls and arm rest),
plus **1,725 critical underside columns** from the distal 12 cm of the arm/headshell/cartridge and the
authored StylusTip. The record is a nominal disc plane; the platter is screened with a conservative
327 mm footprint at the authored slip-mat surface. The hinge/bearing/counterweight near the pivot
is excluded from full-solid testing. Geometry screening allows 0.2 mm quantization error; PLAY's actual
measured tip is above the record, not inside that allowance.

Measured over four poses plus 243 safe-path samples (the same path in reverse):

- **426,075** sampled body clearance comparisons, no penetration.
- Minimum distal arm/cartridge clearance above the body/arm-rest height field: **19.022 mm**.
- Minimum raised underside/stylus clearance above vinyl during swing: **11.997 mm**.
- Minimum clearance over the conservative platter surface: **1.979 mm**.
- PLAY stylus contact: **0.500 mm**, all eight station transforms.

This is deterministic screening and visual confirmation, not exact mesh collision or a guarantee
for future record-removal trajectories. The present 12 mm lift proves clearance for this mechanism;
future vinyl motion must be validated against its actual path.

## Development inspector and browser verification

TONEARM provides **REST / LIFT REST / LIFT PLAY / PLAY**, the current era/tier, semantic pose and
phase, current/target angles, StylusTip world position, signed height above the record plane and radius.
MEASURE STILL / MEASURE MOTION capture four seconds after a 250 ms warm-up. Motion measurement repeats
legal REST ↔ PLAY transitions; the last requested move finishes normally afterward. Capture cancels
if its era is no longer ACTIVE. Collapse the inspector for comparable captures.

`window.__archiveTonearms = { system, rigs, diagnostics }` exists only in development. Optional
measurement wraps `gl.render` and samples AFTER drawing, so geometry counts and pose checks describe
the visible frame. Buffers are preallocated; the regular driver performs no per-frame allocation,
traversal, name lookup, geometry update, raycast or React render. No visual helpers or draw calls added.

Browser validation used the production CameraRig and FOCUS, medium textures, automatic LOD, with a
real SOUND gesture and three spatial voices:

- All eight stations reached REST, LIFTED_REST, LIFTED_PLAY, PLAY and returned to REST.
  Each gave 0.500 mm PLAY contact and 11.997 mm raised contact; local angles were identical.
- Visual focus checks at ROOTS, EXPLOSION and GLOBAL showed the parked/raised/playing poses.
- Focus entry/exit during GLOBAL motion and mute during lifting retained the target and reached the
  commanded pose. Voices #8/#9/#10 and the 10-source count stayed unchanged through that test;
  platters stayed at 33.33 RPM while muted.
- Browser reversal during a raised swing returned safely to REST; unit tests cover both lift directions,
  lowering reversal and rapid commands.
- Keyboard travel crossed GLOBAL → ROOTS through absolute zero, continued to RECORDING and returned
  through ROOTS → GLOBAL. ROOTS re-entered in PLAY at absolute progress +0.0013; GLOBAL re-entered in
  PLAY at −0.0670 after ACTIVE → NEARBY → DISTANT → NEARBY → ACTIVE. No special seam behavior.

## Measured performance

2026-10-14, development build, built-in browser **758 × 426, reported DPR 1**, medium textures,
hall helpers off, inspector collapsed, audio running and three spinning platters. Six paired captures;
**1,435 drawn frames, zero pivot/state mismatches**. Compare the pairs within this run.

| FOCUS | Still frames | Moving frames | Frame ms median still → moving | p95 still → moving | Draw calls both | Triangles both |
|---|---:|---:|---:|---:|---:|---:|
| ROOTS | 235 | 241 | 16.60 → 16.50 | 21.90 → 20.50 | 33 | 1,189,326 |
| EXPLOSION | 239 | 240 | 16.60 → 16.50 | 19.70 → 19.10 | 32 | 1,157,221 |
| GLOBAL | 241 | 239 | 16.60 → 16.60 | 21.30 → 20.30 | 32 | 1,159,397 |

All captures run at approximately 60 fps. Draw calls and triangles were exactly constant throughout
each still/moving pair. Renderer memory estimate stayed 301 MB.

Browser controller-update + two-pivot-write timing: median **below the 0.1 ms clock resolution**,
p95 0.1 ms in all six captures. This does not mean zero CPU cost. Optional
`npm run check:tonearm -- --benchmark` measures pure controller logic in Node with a warmed JIT:
five passes of 300,000 steps measured **0.040–0.057 µs/step** (median 0.045 µs); this excludes scene
writes and rendering and is not a browser-driver timing.

## Validation, changed files and remaining limits

- `npm run check`: TypeScript + ESLint + **147 tests** pass (128 existing, 19 added).
- `npm run check:tonearm`: geometry screening passes.
- `npm run check:hall`: passes with no problems.
- `npm run build`: passes.

Added: `src/stations/tonearmMotion.ts`, `src/stations/tonearmMotion.test.ts`,
`src/scene/TonearmMotionDriver.tsx`, `src/scene/dev/tonearmDiagnostics.ts`,
`src/ui/dev/TonearmControls.tsx`, `scripts/check-tonearm-mechanics.mjs`, this document.
Updated: `src/stations/ListeningStation.tsx` (once-resolved pose metadata), `src/scene/Exhibition.tsx`
(registration/driver), `src/scene/MuseumCanvas.tsx` (era-owned mechanics), `src/ui/dev/DevPanel.tsx`
(development section), `package.json` (test/check scripts). No dependency or GLB changes.

Remaining limits: sampled rather than exact collision; fixed outer lead-in groove; paused inactive
mechanics with static simplified arms; position-continuous but velocity-restarted reversals; no automatic
audio synchronization, groove drift or record changing. Existing dev era-change frame stalls, touch/device
validation and placeholder sleeve/UI limitations remain as previously documented.

Visually inspect ROOTS, EXPLOSION and GLOBAL in FOCUS: PLAY from REST must raise first, swing slowly
while raised, then settle the stylus just above the outer groove; REST must reverse that order. Try
LIFT REST and LIFT PLAY to compare clearance, reverse a command during lift/swing, close/re-enter focus
mid-move, mute mid-move, and travel away/return to confirm the full-detail pose survives LOD changes.
