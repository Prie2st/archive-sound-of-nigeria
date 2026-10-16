# Record Change — the signature interaction

Status: **built** (2026-10-14). Changing the record inside one era while focused on its station:
duck → lift arm → swing away → stop platter → lift record → remove → commit identity → insert →
lower → spin up → arm over the groove → needle drop → fade in → PLAYING. Scaffolding UI only
(PREVIOUS / NEXT / Close); no final playlists, artwork, production UI or era navigation changes.

Files:

| File | Role |
|---|---|
| [`src/stations/recordChange.ts`](../src/stations/recordChange.ts) | **the one controller**: phases, queue, exit lock, vinyl / sleeve motion values, stable-state tonearm sync, invariants (pure TS) |
| [`src/stations/recordChange.test.ts`](../src/stations/recordChange.test.ts) | 22 orchestration tests (real tonearm + platter systems, engine-like fake audio) |
| [`src/audio/engine.ts`](../src/audio/engine.ts) | additions only: `holdEra`, `releaseEra`, `prepareTrack`, `trackLoadState`, `eraVoiceTrack`, `isPlaybackWanted`, `isEraHeld` |
| [`src/audio/audio.test.ts`](../src/audio/audio.test.ts) | + 5 record-change tests on the real engine (mock Web Audio) |
| [`src/scene/RecordChangeDriver.tsx`](../src/scene/RecordChangeDriver.tsx) | per frame: controller update, record offset / sleeve shift, identity presentation |
| [`src/stations/recordArtwork.ts`](../src/stations/recordArtwork.ts), [`recordArtworkCatalog.ts`](../src/stations/recordArtworkCatalog.ts) | per-station label / sleeve materials, texture loading, which art a record shows |
| [`src/stations/ListeningStation.tsx`](../src/stations/ListeningStation.tsx) | one `presentation` (cloned Label + SleeveFront materials) shared by a station's three tiers; `sleeveBase` |
| [`src/stations/tonearmMotion.ts`](../src/stations/tonearmMotion.ts) | addition: `snap(pose)` (arms not shown in full detail) |
| [`src/scene/TonearmMotionDriver.tsx`](../src/scene/TonearmMotionDriver.tsx), [`Exhibition.tsx`](../src/scene/Exhibition.tsx) | non-active arms show their era's pose; controllers registered for every tier; driver order |
| [`src/state/focus.ts`](../src/state/focus.ts) | addition: `setExitGuard` (the state machine itself is unchanged) |
| [`src/ui/FocusOverlay.tsx`](../src/ui/FocusOverlay.tsx), [`src/input/useRecordInput.ts`](../src/input/useRecordInput.ts) | PREVIOUS / NEXT / Close, ArrowLeft / ArrowRight |
| [`src/ui/dev/RecordChangeControls.tsx`](../src/ui/dev/RecordChangeControls.tsx) | DEV INSPECTOR → RECORD CHANGE |
| `scripts/build-dev-audio.mjs`, `scripts/build-dev-artwork.mjs` | development tones / art for the DEV PLACEHOLDER records (`npm run audio:dev`, `npm run artwork:dev`) |

---

## 1. One controller

`RecordChangeController` is the only thing that sequences a change. It does not re-implement anything:

| system | how the controller uses it |
|---|---|
| audio | `holdEra` (duck + no voice), `prepareTrack` (decode, no play), `selectTrack` (commit), `releaseEra` (start at needle contact) |
| platter | it only decides the changing era's **demand** (`platterDemand`); `PlatterMotionSystem` does the spin-down / spin-up |
| tonearm | `TonearmController.request(pose)` — the legal lift → swing → lower paths stay the tonearm's job |
| vinyl / sleeve | its own offset values; the scene applies them |
| identity | `TrackSelection` (the selected = mounted record), committed at one point (§4) |

No timers, no GSAP, no effects watching each other: one `update(dt)` per frame (clamped to 0.1 s) advances
the current phase, whose exit condition reads the real platter RPM / tonearm pose / load state.
Frame order: `RecordChangeDriver` → `PlatterMotionDriver` → `TonearmMotionDriver` (mounted in that order).

## 2. Phases

Stable (no change running; derived for the ACTIVE era):

| phase | meaning |
|---|---|
| `PLAYING` | **canonical**: selected record mounted, its voice live, arm in PLAY, platter ≥ 95 % of 33⅓ |
| `STARTING` | voice live, arm / platter still converging (e.g. right after SOUND ON) |
| `STOPPED` | no voice: audio locked or playback off |
| `UNAVAILABLE` | the mounted record has no playable audio (missing file or none at all) |

Change sequence (each waits for its own condition; values in `RECORD_CHANGE_CONFIG`):

| # | phase | exits when | before | **now** (60 fps) | what overlaps it |
|---|---|---|---|---|---|
| 1 | `DUCK_AUDIO` | `armLiftAfter` **0.20 s** into the 0.30 s duck — skipped if nothing was audible | 0.30 s | **0.23 s** | the last 0.1 s of the duck runs under the arm lift |
| 2 | `LIFT_ARM` | arm at LIFTED_PLAY (or already clear) | 0.35 s | 0.35 s | duck tail |
| 3 | `RETURN_ARM` | arm at LIFTED_REST (raised, off the record) | 0.87 s | 0.87 s | **platter coasts down** (stylus raised) |
| 4 | `STOP_PLATTER` | platter ≤ **1 RPM** AND destination audio resolved | 1.11 s | **0.25 s** | — |
| 5 | `LIFT_RECORD` | record 25 mm up (0.40 s) | 0.40 s | 0.42 s | — |
| 6 | `REMOVE_RECORD` | record at staging (0.55 s) → **COMMIT** | 0.62 s | 0.55 s | — |
| 7 | `PREPARE_NEXT` | dwell 0.35 s (storage dip) AND destination artwork loaded | 0.31 s | 0.35 s | — |
| 8 | `INSERT_RECORD` | record above the spindle again (0.55 s) | 0.61 s | 0.55 s | — |
| 9 | `LOWER_RECORD` | record seated (0.45 s), exact canonical transform | 0.40 s | 0.47 s | — |
| 10 | `SPIN_UP` | platter ≥ **95 %** of 33⅓ | 0.81 s | 0.82 s | **raised arm swings to the lead-in** |
| 11 | `MOVE_ARM_TO_PLAY` | arm at LIFTED_PLAY AND destination decoded | 0.87 s | **0.05 s** | — (the swing already happened) |
| 12 | `LOWER_NEEDLE` | arm at PLAY (voice released at 97 % of the travel) | 0.43 s | 0.40 s | fresh-voice swell begins |
| 13 | `FADE_IN_AUDIO` | `fadeInSeconds` **0.40 s** → PLAYING | 0.59 s | **0.42 s** | the swell's last ≈4 % continues in PLAYING |

Total NEXT, PLAYING → PLAYING: **5.81 s in the browser** (5.72 s simulated; before this pass **7.86 s** browser /
7.6 s at the record-change milestone); 4.5–7.5 s asserted in tests. A change started from input between frames does
not count the time before it began (the first browser run of the record-change milestone measured the duck short
because the click frame was counted).

### Pacing (why 5.8 s, and what was NOT shortened)

Only dead time was removed — each overlap is gated by the same physical condition as before, no phase got a timeout,
and no motion got faster (lift / remove / insert / lower / dwell / spring constants are unchanged):

1. **Duck → arm lift overlap.** The arm starts lifting 0.20 s into the 0.30 s duck. The lift starts slowly (eased),
   so when the duck completes the stylus has risen ≤ 20 % of its travel (≈ 2 mm, test) — the music is gone before the
   needle visibly leaves the groove.
2. **Coast-down from RETURN_ARM.** `platterDemand` stays on through DUCK_AUDIO and LIFT_ARM (the stylus may still
   touch) and drops when RETURN_ARM begins — i.e. only with the arm **at the raised lift**. Platter speed stays at
   33⅓ until then (test). The record still leaves only at ≤ 1 RPM with the arm at LIFTED_REST (unchanged gate).
3. **Spin-up ‖ arm swing.** SPIN_UP also requests LIFTED_PLAY: the **raised** arm swings over the lead-in while the
   platter accelerates. LOWER_NEEDLE is still gated on ≥ 95 % (test: the needle is never lowered below playback
   speed) and the arm is never lowered during SPIN_UP. Skipped when the destination cannot play (load error /
   unavailable / playback off) — then the arm stays parked.
4. **Shorter FADE_IN wait.** 0.40 s is ≈96 % of the engine's fresh-voice curve (τ 0.12 s); the swell itself is
   unchanged and finishes inside PLAYING. Input re-opens 0.2 s earlier.

Safety rules kept (each has a test and a live invariant): never swing with the stylus down · never slow the platter
under a lowered stylus (new invariant "platter slowing under a lowered stylus") · never lift the record above 1 RPM ·
never move the record while the arm is over it · never lower the needle before the record is seated and at speed.

Mounted again with no playable destination → `UNAVAILABLE` (arm to REST, platter stopped). Audio locked or
playback off → `STOPPED` (record still physically changed).

## 3. Requests and the queue

- A request names `{ eraId, fromTrackId, toTrackId, direction: next | previous | direct }`; the destination comes
  from `stepInPlaylist` over the era's playlist (any length ≥ 1; wrap inside the era: last → first, first → last; a
  one-record playlist rejects NEXT / PREVIOUS). The playlist comes from the era data, or from the optional `playlist` port
  (tests drive 1 / 3 / 10 / 20-record playlists through the real controller). A
  record of another era is unreachable (`TrackSelection.select` also refuses it). `requestTrack(id)` (direct) is
  available for later direct selection (dev RESET TO HERO uses it; stable only).
- Accepted only when focus is **exactly FOCUS**, the focused station is the **ACTIVE** era, and no exit is
  pending (TRAVEL / FOCUS_TRANSITION_IN / FOCUS_TRANSITION_OUT → rejected).
- **Queue: one slot.** While a change runs, NEXT / PREVIOUS store their direction in the single slot (replacing an
  earlier one). When the change completes, at most one queued change starts. There is never a second controller or
  a parallel change. Spam NEXT ×4 → two swaps; NEXT then PREVIOUS → two swaps, back to the first record.
- Keys: ArrowRight = NEXT, ArrowLeft = PREVIOUS (only while focused; auto-repeat of a held key is ignored; travel
  never uses Left / Right).

## 4. Identity model and the physical commit point

| term | where | changes when |
|---|---|---|
| requested / pending | `controller.request.toTrackId` / `pendingTrackId` | the request starts |
| selected = **mounted** | `TrackSelection` (engine) | **commit**: end of REMOVE_RECORD — the old record is 360 mm off the deck |
| presented (label / sleeve) | per-station materials | first frame after the commit (artwork preloaded at request time) |
| playing | the engine's live voice | needle contact (release) |

So the UI, the deck and the audio can never disagree: before the commit everything says the old record (label,
overlay title, selection); the destination is never audible before it is mounted (invariant). The overlay shows
"Changing record" during the change and switches title / artist / "record n of 3" exactly at the commit.

## 5. Audio: prepare ≠ play

- At the request: `prepareTrack(era, to)` starts fetch + decode **in parallel** with the duck, the arm and the
  platter (≈30–200 ms locally, so normally ready before the arm is even clear); `holdEra(era, 0.3)` ducks the
  current voice (linear ramp to 0 over 0.3 s, then `stop`) and blocks any voice for that era — so committing the
  selection never starts the destination.
- The record leaves the platter only once the destination audio has **resolved** (ready / unavailable; a load
  failure has already restored the original — §10). The arm hovers at LIFTED_PLAY if the destination is somehow
  still decoding; the physical sequence otherwise never waits for audio.
- **Needle contact**: during LOWER_NEEDLE, at 97 % of the lowering travel, `releaseEra` creates the destination
  voice at gain 0 rising with the engine's fresh-voice curve (τ 0.12 s). Measured (record-change milestone): voice
  started with the stylus **0.59 mm** above the vinyl (contact pose 0.50 mm), 84 ms before the arm settled; gain 0.28
  at 37 ms, 0.57 at 98 ms, 0.95 at 356 ms, ≥ 0.99 at ≈ 0.55 s. **After the pacing pass** (browser): release with the
  stylus at **0.52 mm**, platter at 33.15 RPM, **49 ms** before PLAY — inside the 50–150 ms "sound at visible contact"
  window's lower edge; the needle mechanics and the release rule are unchanged, only the arm now arrives earlier.
- Neighbour voices are untouched (focus already mixes them to 0); exactly one new source per change.
- Development: no stylus-contact sound yet (hook point: LOWER_NEEDLE release, via `uiGain`) — left out to keep
  the milestone safe.

## 6. Tonearm integration and the "arm parked while playing" contradiction

- During a change the controller requests PLAY → LIFTED_PLAY → LIFTED_REST (stays raised during the swap) →
  LIFTED_PLAY (from SPIN_UP) → PLAY (LOWER_NEEDLE); the tonearm controller enforces lift → swing → lower. Measured:
  swing starts only at the raised lift (12 mm); the arm parks 62 mm outside the record rim; after the pacing pass the
  return swing began at 3.9 RPM with the stylus at 12 mm.
- Stable eras (every frame, `syncTonearms`): an era whose selected record has a live voice holds its arm in **PLAY**,
  otherwise **REST**. The full-detail ACTIVE arm animates (`request`); every other arm is placed directly (`snap`) and
  written to its visible rig. The sync is **edge-triggered** (it acts when an era's playback state changes, or after a
  record change), so dev TONEARM commands persist; an arm left mid-move when its era stops being ACTIVE completes at
  once. Result in the browser after SOUND ON at ROOTS: ROOTS animated to PLAY, its playing
  neighbours RECORDING / GLOBAL showed PLAY, distant EXPLOSION REST. A NEARBY era that becomes ACTIVE already is in
  PLAY — no re-cueing. Controllers are registered for every era at mount (poses identical in all tiers).

## 7. Platter integration

`platters.isPlaying(i) = controller.platterDemand(i, audio.isEraPlaying(era))`: the normal audio rule, except for
the changing era: **kept spinning** through DUCK_AUDIO and LIFT_ARM (the stylus may still be down), **off** from
RETURN_ARM (stylus fully raised) until the record is seated, **on** from SPIN_UP. The existing spring does the motion
(spin-down ≈1.1 s to ≤ 1 RPM — now mostly hidden under the 0.87 s arm return; spin-up ≈0.8 s to 95 %).
Measured after the pacing pass: demand dropped at 0.571 s with the stylus at 12 mm (LIFTED_PLAY); record lifted at
**0.72 RPM**, arm LIFTED_REST; needle released at 33.15 RPM.

## 8. Vinyl motion

Measured geometry (runtime turntable GLB): spindle top **13.66 mm** above the mat; deck surface along the removal
corridor (−X, toward the sleeve, away from the tonearm) ≤ **5.38 mm**; deck half-width 227.5 mm.

- `LIFT_RECORD`: straight up to **25 mm** (≈11 mm over the spindle), flat.
- `REMOVE_RECORD`: lateral to the staging point **360 mm** toward −X (fully clear of the deck; the record's edge 27 mm
  past it), smootherstep with a **12 mm** arc (peak 37 mm). (Since the listening desk, docs/LISTENING_STATION_TABLE.md:
  the staging point lies above the era’s album stack, and the stack browses in step with these phases; the controller’s
  `sleeve` value is still computed but no longer rendered — the floor sleeve it moved was removed.)
- `PREPARE_NEXT`: a 10 mm "set-down" dip at the staging point (the handoff), identity committed, artwork ready.
- `INSERT_RECORD`: the reverse path back over the spindle, the sleeve settles back.
- `LOWER_RECORD`: straight down, smootherstep (zero velocity at contact — no bounce), then the **exact canonical
  mounted transform** (0, 0, 0).
- The record always stays a child of the platter's RecordAnchor; the offset (turntable space) is rotated by the
  stopped platter's angle into the anchor frame. Measured: record up-vector Y = 1.000000 on every frame (flat);
  6 consecutive swaps → world centre error **0 mm**, local (0, 0, 0) — nothing integrates, so nothing drifts.
- One vinyl mesh per tier, reused; no GLB loads, no new meshes.

## 9. Label / sleeve handoff and artwork

- Each station clones the vinyl's `Label`, `SleeveFront` and `SleeveBack` materials **once** and shares them across its
  three tiers; a record's identity is a map swap on those materials (also for remembered selections at NEARBY /
  DISTANT; the DISTANT sleeve has no back). The record-change controller is unaware of artwork beyond `prepare` / `ready`.
- Artwork kinds (`recordArtworkCatalog.ts`): licensed (`Track.vinylLabelUrl` / `coverUrl` / `sleeveBackUrl`, local
  `/textures/records/<era>/<track>/…` — docs/CONTENT_PIPELINE.md §4; each part falls back on its own) · **archive**
  (generated museum fallback art for every production entry — docs/ARCHIVE_CONTENT.md §8) · development (development
  fixtures only, keyed by fixture index) · model placeholder (records outside the archive with no art).
  Production content check (browser, RECORDING NEXT then PREVIOUS): label texture, sleeve texture, presented record,
  overlay title and catalogue line all switched on the commit frame (PREPARE_NEXT), never through a default texture.
- Development art: `npm run artwork:dev` → 32 WebP files (512², 9–20 KB, 560 KB total): record B vermilion, C teal,
  "DEVELOPMENT RECORD … not historical data". Loaded at request time; presentation waits for loaded textures (no blank
  flash). Cache: no eviction yet (≈1.4 MB decoded per texture) — licensed art will need an LRU policy.
- Sleeve back: the neutral placeholder unless a licensed `sleeveBackUrl` exists (development art has no back).

## 10. Failure recovery

| situation | result |
|---|---|
| destination fails to load (network / decode) **before** the record leaves | restore: the change becomes a return to the original record (arm back to PLAY, platter on, original voice restarts at needle contact); record never lifted; `lastOutcome = restored-after-load-failure`. Browser: 404 surfaced in LIFT_ARM → restored to PLAYING. |
| destination has **no audio at all** | the record is mounted and shown; `UNAVAILABLE` (arm REST, platter stopped, "Recording unavailable") |
| destination fails **after** the commit | finish `UNAVAILABLE` with the new record mounted — never the old audio under the new record |
| audio locked / playback off | record changes physically, ends `STOPPED` |

## 11. Focus exit, mute, LOD, frames

- **Focus exit: locked for the whole change.** Escape / Close during a change are remembered (`exitPending`, the
  queued record request is dropped, NEXT / PREVIOUS refused), and the exit happens automatically once the deck is
  stable. Close reads "Close after change". Implemented as a `FocusController` exit guard, so every exit path obeys it.
  Browser: Escape at DUCK_AUDIO and REMOVE_RECORD and Close at LOWER_NEEDLE kept FOCUS; the exit began in PLAYING;
  travel restored exactly. Every exit request names its source (`escape-key`, `close-button`, `dev-panel`,
  `record-change-deferred`) and is logged in development (docs/FOCUS_MODE.md §10) — e.g. Escape at REMOVE_RECORD logs
  `escape-key accepted=false`, then `record-change-deferred accepted=true` at PLAYING.
- **Mute** stays on masterGain: the change continues, the destination starts silently, unmute reveals it (same voice).
- **LOD**: travel is frozen in focus and exit is locked, so the station stays ACTIVE throughout (browser: ACTIVE tier on
  every changing frame).
- **Frames**: the controller clamps dt to 0.1 s; every motion is a time-based segment, every phase exit re-checks its
  physical condition — a 5 s stall moves the record ≤ 0.12 m and never skips a gate (test).

## 12. Persistence and spatial audio

Selections persist per era (TrackSelection) and drive every later voice — as ACTIVE or as a spatial neighbour.
Browser: after changing ROOTS → C, EXPLOSION → B, GLOBAL → B and touring the hall, each era kept its record; ROOTS was
heard as RECORDING's previous neighbour playing C; across GLOBAL → ROOTS the incoming ROOTS voice (#20, C) continued as
the same instance; travelling back, GLOBAL was recreated with B (#24) and became active without a restart. Playheads
are not persisted (a retired voice restarts from the beginning when recreated).

## 13. Development tools

DEV INSPECTOR → **RECORD CHANGE**: era, phase (restoring), mounted / pending / playing records, era held, queue, exit
pending, last outcome, completed count, platter RPM, tonearm pose, vinyl lift / lateral, sleeve shift, destination audio
state, input / exit locks, artwork textures, live invariant check. Actions: PREVIOUS, NEXT, RESET TO HERO (all through the
public API, FOCUS only). `window.__archiveRecords = { controller, rigs }` (dev).

## 14. Performance

Dev build, Intel UHD 620, 758 × 426 @ DPR 2, EXPLOSION focus, 3 live voices, inspector collapsed (drawn-frame capture):

| | fps (median) | frame ms med / p95 | draw calls | triangles | textures / geometries | audio nodes |
|---|---:|---|---|---|---|---|
| stable PLAYING | 51.5 | 19.4 / 25.8 | 32 / 32 / 32 | 1,157k | 51 / 110 | 15 |
| during a swap | 52.1 | 19.2 / 24.5 | 32 / 32 / 32 | 1,157k | 51 / 110 | 15 |
| after the swap | 52.6 | 19.0 / 23.5 | 32 / 32 / 32 | 1,157k | 51 / 110 | 15 |

No extra draw calls or triangles at any point (no new meshes; the record and sleeve are existing meshes). Controller
cost (Node benchmark, same code): **3.9 µs**/frame stable (incl. 8-era tonearm sync), **6.0 µs**/frame during changes;
no per-frame allocations (snapshots only on phase changes). Development artwork in memory after testing three eras:
10 textures ≈ 14 MB.

## 15. Known limitations

- No record rack yet: the staging point is a fixed hover position beside the deck; the identity changes there while the
  single reused record is momentarily set down. Reads clearly with the development art; a shelf / rack is future work.
- Playheads are not persisted; a recreated voice starts at the beginning.
- No stylus-contact sound (hook documented in §5).
- Focus exit is locked for the entire change (simplest safe policy); there is no "cancel" of a running change.
- Artwork texture cache has no eviction (fine for 32 dev files; needed for licensed art — docs/CONTENT_PIPELINE.md §7).
- Sampled, not exact, collision: the record path is checked against measured heights (spindle, deck corridor), not mesh
  collision; the tonearm's own clearance is from `npm run check:tonearm`.
- Needle release now lands at the low edge of the 50–150 ms contact window (49 ms before PLAY in the browser): a
  visual check of "sound at contact" is worth repeating on a faster machine.
- Stray focus exit (record-change milestone): **not reproduced** after exit sources were added. It happened while the
  deck was stable (so the lock did not apply). Most plausible path: in FOCUS the Close button holds keyboard focus (by
  design, for keyboard users), so any trusted Enter / Space from outside the page would press it. The trusted F2 stream
  seen in the pane targeted that button but F2 does not activate buttons. If it recurs, `window.__archiveFocusExits`
  names the source and event (FOCUS_MODE.md §10).
