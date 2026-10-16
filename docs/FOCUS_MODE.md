# Focus Mode — listening-station close inspection

Status: **built** (2026-10-14). TRAVEL → FOCUS → TRAVEL through the production CameraRig.
No audio, record changing, tonearm movement or final UI yet.

Files: [`src/state/focus.ts`](../src/state/focus.ts) (state machine, trajectory math, config —
unit-tested in `focus.test.ts`), [`src/scene/CameraRig.tsx`](../src/scene/CameraRig.tsx) (camera pose),
[`src/stations/StationInteraction.tsx`](../src/stations/StationInteraction.tsx) (click / tap volume),
[`src/input/useFocusInput.ts`](../src/input/useFocusInput.ts) (Enter / Escape),
[`src/ui/FocusOverlay.tsx`](../src/ui/FocusOverlay.tsx) (temporary label + Close), travel lock in
[`src/state/travel.ts`](../src/state/travel.ts).

---

## 1. Interaction states

One explicit enum, `InteractionMode`, owned by `FocusController` (no boolean soup):

```
TRAVEL ──focus(active)──▶ FOCUS_TRANSITION_IN ──progress = 1──▶ FOCUS
   ▲                          │ Escape / Close (reverses)          │ Escape / Close
   │                          ▼                                    ▼
   └──progress = 0── FOCUS_TRANSITION_OUT ◀────────────────────────┘
                              │ focus(same station) (reverses back to IN)
```

APPROACH is not a mode: it is the station influence inside TRAVEL (docs/CAMERA_RIG.md).
One scalar `progress` (0 = travel pose, 1 = focus pose) drives every transition; a request
mid-transition simply reverses its direction from the current value, so two transitions can
never fight. React hears only semantic changes (mode, station) via `subscribe` /
`getSnapshot` (useSyncExternalStore).

## 2. Focus eligibility

Only the **ACTIVE** station (the one `selectActiveStation` picks from the travel position —
the same value that drives LOD) can be focused: `canFocus(target, activeStation)` requires
`target === activeStation`, and TRAVEL (or FOCUS_TRANSITION_OUT of the same station, which
re-enters). NEARBY / DISTANT stations cannot be selected; the interaction volume is mounted
for the ACTIVE station only, and the controller re-checks eligibility anyway.

## 3. Saved travel state and input locking

When focus begins (from TRAVEL):

- `savedAbsoluteProgress = travel.absoluteProgress` — exact, on whatever lap (> 1, negative…);
  never snapped to the station anchor or normalized.
- `travel.setLocked(true)`: velocity and pending impulses are **discarded** (no hidden
  momentum); while locked, wheel, vertical touch drags, Arrow/Page keys and dev jumps are
  ignored, and `step()` does not integrate — `absoluteProgress` cannot change.
- The CameraRig stops updating the travel orientation / roll / FOV: the **travel pose is
  frozen** exactly as it was on the frame focus began.

When the exit completes: `travel.setLocked(false, savedAbsoluteProgress)` restores the exact
value, velocity 0, input active again; the camera is back on the frozen travel pose and
travel smoothing resumes from it. New input is needed to move.

(Interpretation: the camera does not keep drifting along the route after the click. The
momentum is dropped at the click and the transition's ease-in provides the deceleration —
this is what keeps the saved position exact.)

## 4. Trajectory

Quadratic Bézier, one rule for every station (no per-station overrides were needed):

- start = the frozen travel position (sunken ring, eye y 0.86),
- end = the station's authored focus camera (`station.focusCamera.position`, walkway eye y 1.65),
- control = horizontally `controlBias` (0.5) of the way, `controlLift` (0.2 m) above the higher
  end → the camera rises from the ring early and settles onto the focus eye height.

Orientation: slerp from the frozen travel orientation to the look-at from the **current**
Bézier point toward `focusCamera.target` (the platter / record centre), weight = eased
progress — the view increasingly turns to the record as the camera arrives, and equals the
authored focus view exactly at the end. Quaternions only.

`npm run check:hall` → **Focus transitions**: for every station, 9 start points across its whole
active range × 60 samples per trajectory, against the hall voxels, the floor and the station's
installation box. Result: no hall geometry within 1 m, ≥ 1.63 m from the installation, ≥ 1.65 m
above the floor; flights 5.5–10.9 m.

## 5. FOV and durations

- FOV: frozen travel FOV (47.5–52°) → `focusFov` **46°** (eased with the same progress).
- Easing: ease-in-out sine (restrained, no overshoot), on both entry and exit.
- Durations scale gently with the flight distance (base + 0.045 s/m, clamped):
  enter **1.1–1.5 s** (≈1.25 s from a route view point, 1.49 s from the edge of the active range),
  exit **0.9–1.3 s** (≈1.05 s / 1.29 s). Fixed when focus begins.

All values: `FOCUS_CONFIG` in `src/state/focus.ts`.

## 6. Interrupts and robustness

| Action | Result |
|---|---|
| click station, immediately Escape | reverses from the current progress back to the saved pose |
| Close / Escape during entry | same |
| click during exit | re-enters the same station from the current progress |
| rapid repeated clicks, Enter during entry | ignored (already entering) |
| Escape twice | second is a no-op |
| focus right after returning | allowed (TRAVEL) |
| hidden tab / long frame | dt clamped to 0.1 s per frame; progress is clamped to [0, 1] and ends in a valid mode |
| rig unmounts mid-focus (dev switch to INSPECT) | `focus.reset()` returns to TRAVEL at the saved position, unlocked |

Cursor: the pointer cursor is reset whenever the mode or the active station changes.

## 7. LOD

Travel progress is frozen, so the active era cannot change during focus: the focused station
stays ACTIVE, its neighbours NEARBY, the rest DISTANT — no background popping. The
transitions stay inside the station bay (see §4), so they add no wide views.

## 8. Input

- Pointer / tap on the ACTIVE station's interaction volume (`FOCUS_CONFIG.volume`: 2.4 × 1.8 ×
  1.8 m around table, turntable and sleeve, invisible) → focus. A pointer that moved more than
  8 px between down and up is a drag (travel), not a tap.
- **Enter** → focus the ACTIVE station (ignored when a button / link / field has keyboard focus,
  so Close keeps its own Enter). **Escape** → leave focus.
- While not in TRAVEL: wheel / vertical touch / Page / Arrow keys are swallowed (no travel,
  no accumulation, page still does not scroll). Horizontal gestures: not handled yet.
- Desktop: cursor becomes a pointer over the volume while focusable. No outline, glow or
  tooltip.
- **Overlay buttons and keyboard focus** (`src/input/pointerActivation.ts`, regression test
  `pointerActivation.test.ts`). A *pointer* click on SOUND, PREVIOUS, NEXT or Close (`event.detail ≥ 1`)
  blurs the button afterwards, handing keyboard focus back to the page — so a later Enter focuses the
  station instead of pressing SOUND again (the bug: click SOUND, press Enter → sound toggled off). A
  *keyboard* activation (Tab to the button, Enter / Space → `detail 0`) keeps focus on the button, so
  keyboard users can press it repeatedly and Tab order is untouched. Buttons stay real `<button>`s with
  visible focus styles; nothing is removed from the tab order. Browser check: after a real SOUND click
  `document.activeElement` = BODY and Enter focused ROOTS (sound stayed on); Tab-focused SOUND + Enter →
  Muted, Space → Sound on, focus still on SOUND.

## 9. Temporary UI (superseded)

**Superseded by the production focus caption — docs/FINAL_UI.md §6–§7** (right column in landscape, top band in
portrait; it never covers the record or sleeve). The history below documents the scaffolding it replaced.

`FocusOverlay` (bottom-left, fades in on entry, out on exit): `01 / ROOTS`, the record title
(hero track, uppercase: DÙNDÚN / TALKING DRUM), the artist, and an accessible **Close**
`<button>` (keyboard focus moves to it in FOCUS). Not the final music UI. Since the audio milestone it
shows the station's selected record and one small audio line when relevant — `DEVELOPMENT AUDIO
PLACEHOLDER` or `RECORDING UNAVAILABLE` (docs/AUDIO_ENGINE.md). Focus itself never affects audio.

**Archive label (docs/ARCHIVE_CONTENT.md):** since the archive-content milestone the label reads `02 / RECORDING ·
1920–1944`, `A02-01 · 1 / 5`, "Listening reference" (traditions / artist references only), the title, the artist or
"Yorùbá musical tradition", date · style (only confirmed / labelled dates), the significance line, and an audio note
("Archive audio pending" for development tones in the archive set; "Development audio placeholder" for fixtures).
Wording comes from `describeTrack()`; no player controls.

**Record change (docs/RECORD_CHANGE.md §3, §11):** in FOCUS the temporary label also shows "record n of 3" and
PREVIOUS / NEXT (ArrowLeft / ArrowRight). `FocusController.setExitGuard` (new; the state machine is unchanged) lets
the record change lock focus exit for the whole duration of a change: Escape / Close are remembered and honoured
once the deck is stable ("Close after change").

## 10. Dev tools

DEV INSPECTOR → CAMERA: **FOCUS ACTIVE** / **EXIT FOCUS** (through the real CameraRig, TRAVEL
only). HALL LAYOUT toggles: **focus volumes** (all eight, dim; the live ACTIVE one is drawn
brighter by the station itself), **focus paths** (each station's Bézier from its route view
point, with the control point), plus the existing **focus cams** (anchors and look-ats).
Readout: `focus  MODE · station · progress · saved abs · travel LOCKED`.

**Exit diagnostics.** `requestExit(source, event?)` names every caller — `escape-key` (useFocusInput),
`close-button` (FocusOverlay), `dev-panel` (EXIT FOCUS), `record-change-deferred` (an exit remembered during a
record change, performed once stable); `unspecified` should never appear. An optional observer
(`setExitObserver`) sees each request: `{ source, accepted, mode, event }`, where `event` is
`{ type, key, isTrusted, target, detail }` from the DOM event (`src/input/exitDiagnostics.ts`). In development
MuseumCanvas installs it: every request is logged once (`console.info("[focus-exit]", …)`, no per-frame logs) and
kept in `window.__archiveFocusExits` (last 50) together with the record-change phase, `changing` and
`exitPending` and a timestamp. Production installs no observer.

## 11. Verification (2026-10-14, dev build, Intel UHD 620, 758 × 426 @ DPR 2, overlays hidden)

Through the production CameraRig (`window.__archiveTravel` dev hook, real input events):

- **All eight stations** (approached 3 m before each view point on lap 3; click for odd, Enter for
  even): correct station focused, FOCUS reached in 1.22–1.36 s, camera within 2–4 mm of the
  authored focus anchor (last-frame residual), FOV 46°, LOD tiers unchanged during focus; exit in
  0.95–1.02 s back to the exact absoluteProgress, position error 0 mm, orientation ≤ 0.06°,
  velocity 0, unlocked. Visual: every focus view shows record, label, platter, tonearm, gold deck,
  table, the sleeve and marble context; no wall, pillar or table clipping.
- **Seam / laps**: forward GLOBAL → seam → ROOTS by wheel, focus ROOTS at absoluteProgress 1.02593 →
  restored exactly (lap kept). Backward RECORDING → ROOTS → GLOBAL, focus GLOBAL at −0.13879 →
  restored exactly.
- **Interrupts**: Enter → Escape after 0.1 s (exact return, 0 mm); Escape at 54 % then Enter during
  the exit (ends in FOCUS, saved progress unchanged); wheel ×20 + touch swipe + Page/Arrow keys
  in FOCUS (no movement, velocity 0); Escape twice; immediate re-focus with 10 rapid Enters; new
  wheel input after exit starts from velocity 0.
- **Touch / pointer (simulated)**: tap on the ACTIVE station → focus; a 120 px drag that starts on the
  station travels (1.13 m) instead; NEARBY station rejected; pointer cursor only over the focusable
  station, default during focus and after.

| Focus view | FPS (median) | frame ms | draw calls | triangles | memory |
|---|---:|---:|---:|---:|---|
| ROOTS | 50.2 | 20.0 | 33 | 1,189,326 | 301 MB (tex 236) |
| EXPLOSION | 53.2 | 18.8 | 32 | 1,157,221 | 301 MB |
| GLOBAL | 53.3 | 18.8 | 32 | 1,159,397 | 301 MB |

Draw calls and triangles are identical to the earlier static focus-view measurements (docs/STATION_LOD.md
§7); entry transitions peak at 33 calls / 1.26M triangles (route-view level — no extra stations come
into view). One 50–94 ms frame at the start of an entry (dev build: overlay mount + React updates);
transition median 17 ms.

## 12. Known limitations

- Momentum is dropped at the click (see §3).
- The focus pose is the authored anchor; no orbiting / zoom inside FOCUS yet.
- No record controls, audio or horizontal swipe yet (later milestones).
- Real-device touch not validated (simulated pointer events only).
- One longer frame (50–94 ms, dev build) when focus begins.
- In FOCUS the Close button holds keyboard focus (for keyboard users); any trusted Enter / Space the page receives
  from outside would press it. This is the most plausible cause of the one unexplained exit seen during the
  record-change milestone, which has not been reproduced since exit sources were logged.
- In the GLOBAL / AFROBEATS focus views the neutral placeholder sleeve is low-contrast against the
  marble (known since the eight-station milestone; real cover art will fix it).
- The dev-only Next.js badge can overlap the bottom-left label in development (`devIndicators`
  is set to bottom-right; a saved local badge position may override it).
