# Final UI — the visitor-facing interface

The production interface for ARCHIVE — THE SOUND OF NIGERIA: an editorial, museum-like layer over the 3D
hall. The hall and the turntable stay the interface; the UI explains and labels, it never plays music itself.

Code: `src/ui/prologue/` (loading + prologue, docs/PROLOGUE.md) · `src/ui/TravelHud.tsx` · `src/ui/FocusOverlay.tsx` (caption) ·
`src/ui/SoundToggle.tsx` · `src/ui/ArchiveFallback.tsx` · `src/ui/captionModel.ts` (pure rules, tested) ·
`src/ui/eraAccent.ts` · `startArchiveSound` in `src/audio/browserAudio.ts` · wiring in
`src/scene/MuseumCanvas.tsx` · styles: the PRODUCTION INTERFACE section of `src/app/globals.css`.

## 1. Intro flow

> **Superseded by the scrollable prologue — [docs/PROLOGUE.md](PROLOGUE.md).** The static intro below
> (IntroScreen) was replaced by a loading moment and an editorial story 1900 → 2026, with ENTER ARCHIVE fixed
> throughout. The readiness rules (real loader state, scene probe, grace / maximum waits) and the audio unlock
> (§2) are unchanged and now live in `src/ui/prologue/Prologue.tsx`. The section is kept as history.

One continuous visit: **loading → ENTER ARCHIVE → museum**. The intro shows once per page load and never again
(focus exits, era changes and the GLOBAL → ROOTS wrap never bring it back; a reload does).

```
ARCHIVE
THE SOUND OF NIGERIA          (display serif)
1900 — 2026
126 years of rhythm, reinvention and influence.
TRADITION → ADAPTATION → LOCALISATION → EXPORTATION
[ LOADING ARCHIVE ───── ]  →  [ ENTER ARCHIVE ]  Best experienced with sound.
```

- **Loading is real.** The bar is the share of files finished in three's loading manager (drei `useProgress`:
  models and textures). No invented percentages; the accessible value reads "n of N assets loaded".
- **Ready means on screen.** ENTER ARCHIVE appears only when (a) every requested file has finished, held for
  450 ms because loaders start in waves; (b) the scene probe confirms the hall has loaded and all eight stations
  present their record artwork; (c) two more frames have rendered. Measured (dev server, cached): items load in
  waves 6 → 18 → 29 → 55, all eight stations are presented at ≈6.5 s, and ENTER ARCHIVE appears at ≈8.8 s.
- **Never trapped.** If all files have finished but the scene probe has not passed within 6 s, ENTER ARCHIVE is
  offered anyway; after 30 s it is offered whatever the state. The two-frame wait also has a timer fallback.
  Found in testing: a production tab opened in the background draws no frames, so the stations never presented and
  the first version waited forever. With the fail-safe, ENTER ARCHIVE appeared after 7.2 s in that situation.
- **Input is held back** until ENTER ARCHIVE. The museum's window-level keys (arrows, PageUp/PageDown, Enter-to-focus,
  M, Escape) are stopped in the capture phase, so nothing moves behind the intro. Tab and the button's own
  Enter / Space still work. The intro covers the canvas, so wheel / touch / clicks cannot reach the hall.
- **Exit** is a 0.9 s fade with the text lifting 14 px (reduced motion: a 0.2 s fade). The museum is already
  rendered underneath. Measured: intro removed 944 ms after the click.
- Keyboard: ENTER ARCHIVE receives focus when it appears, so Enter / Space activates it.

## 2. Audio unlock flow

ENTER ARCHIVE **is** the audio gesture. Its click handler calls `startArchiveSound(audio)`: the existing engine's
`unlock()` (creates THE AudioContext on the first call, resumes it later), then `unmute()` and `play()`. There is
no second AudioContext and no second unlock path — the sound control's ENABLE SOUND calls the same function.

- Unlock succeeded → the hero record of the current era plays as the museum appears. Measured: `contextState:
  running`, status PLAYING, "Sound on" — no extra SOUND click.
- Unlock failed (no Web Audio, refused) → the visitor enters anyway. The sound control shows **ENABLE SOUND** (a later
  gesture can unlock) or **SOUND UNAVAILABLE** (Web Audio unsupported, disabled).
- Browser suspensions are unchanged: the control shows **RESUME SOUND** (observed in testing when the page was
  hidden), and resume uses the engine's existing path.
- Development: `?intro=0` skips the intro (development builds only); sound then starts from ENABLE SOUND.

## 3. Production HUD

```
                                                [ ← EXIT ARCHIVE ] [ ▮▮▮ SOUND ON ]

ROOTS                                           ENTER OR CLICK THE TURNTABLE TO LISTEN
1900 — 1919                                                SCROLL VERTICALLY TO TRAVEL
```

Layout from the Figma file **ARCHIVE — Museum HUD**
([ztrhQUsF0o9SRNlgaoFzY0](https://www.figma.com/design/ztrhQUsF0o9SRNlgaoFzY0)), redesigned by the owner on
2026-10-19: four frames (desktop and phone, travel and listening). That redesign removed the archive name at the
top left, the loop position, thesis stage and accent rule above the era name, and the eight era marks at the
bottom centre.

- Top right: the exit and sound controls.
- Bottom left: the current era's name and years. It fades in on each era change.
- Bottom right: **ENTER OR CLICK THE TURNTABLE TO LISTEN** (only while the focus controller would accept focus
  for that station) and **SCROLL VERTICALLY TO TRAVEL**, which retires once the visitor reaches a second era. On
  touch devices (`pointer: coarse`) the hints read TAP THE TURNTABLE TO LISTEN / SWIPE TO TRAVEL.
- During focus the bottom HUD fades out (the caption takes over); the exit and sound controls stay. The caption
  still shows the loop position (e.g. 08 / 08) beside the era name and years.
- Era statements are **not** repeated: the Era Visual Worlds installations already carry each era's headline,
  number and title in the hall (docs/ERA_VISUAL_WORLDS.md).
- Every HUD region except real buttons has `pointer-events: none`, so wheel, touch and station clicks reach the
  canvas everywhere.

## 4. Active era

The HUD reads the **existing active-era store** written by the CameraRig: the nearest station anchor along the
loop, with hysteresis (`selectActiveStation`). This is the same value the station LOD, the Era Visual Worlds and
the audio engine follow. There are no equal 1/8 sectors. The HUD re-renders only when that value or the focus mode
changes, never per frame. The "listen" hint asks `focus.canFocus(active, active)` — the same check that the Enter
key and the station click use.

## 5. Sound states

| state | label | action |
|---|---|---|
| not unlocked | ENABLE SOUND | `startArchiveSound` (unlock, unmute, play) |
| suspended by the browser | RESUME SOUND | `unlock()` (resume) |
| playing | SOUND ON | mute |
| muted | MUTED | unmute |
| Web Audio unavailable / failed | SOUND UNAVAILABLE (disabled) | — |

Labels come only from the engine snapshot, so they cannot drift from what is heard. Three level bars beside the
label (flat when muted / off) are decorative. **M** toggles mute anywhere after entry.

## 6. Focus caption

An archival label plate for the record **mounted on the deck**:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  (era-accent top rule)
04 / 08   EXPLOSION   1967 — 1989
A04-02                         02 / 05
JA FUNMI
King Sunny Adé
1982 INTERNATIONAL RELEASE · JÙJÚ
From the 1982 album Juju Music, …        (significance — secondary, serif)
MUSICAL DNA  Talking drum + electric guitars → modern Jùjú
CHANGING RECORD                           (status line, when relevant)
[← PREVIOUS] [NEXT →]              [CLOSE]
← → change record · Esc close · M sound
```

- All wording comes from `describeTrack()`, keyed on `contentType`:
  - **TRADITION_REFERENCE** (ROOTS): `A01-01 · DÙNDÚN / TALKING DRUM · Yorùbá musical tradition · Listening
    reference · TALKING DRUM`. There is no artist, no release year and nothing like "Artist: Traditional / 1905".
  - **ARTIST_REFERENCE** (Ayinde Bakare, G.T. Onwuka): artist, then *Listening reference* and the date range only.
  - **RECORDING**: artist, then the date label (`yearLabel` ?? year) and style. No date is shown if none is confirmed.
- The catalogue number is underlined in the era accent. The position reads `02 / 05`.
- **Musical DNA** is one small line, shown only when the entry has one (hidden in compact layouts).
- Screen readers hear one short announcement per mounted record ("On the deck: A04-02 Ja Funmi, King Sunny Adé.
  Record 2 of 5."). The plate itself is not a live region.

## 7. Record-change UI

Driven by the existing record-change snapshot. The state machine is unchanged.

- **During a change:** the status line reads CHANGING RECORD and the record text dims slightly. PREVIOUS / NEXT stay
  enabled (the controller's one-slot queue still applies) but are visually muted. A queued direction is marked by a
  thin era-accent underline on its button — there is no "Queue: 1" text.
- **Metadata switches at the commit:** the caption follows the mounted selection, which changes at the record
  change's commit point (docs/RECORD_CHANGE.md §4). The record block fades in once per new record (`key` = track id).
- **Close during a change:** the exit is deferred by the existing exit guard. The status reads "Changing record ·
  closing after", PREVIOUS / NEXT are disabled, and focus exits once the deck is stable.
- **Records without playable audio** stay complete entries. The status reads "Archive audio pending" (development
  tone under an archive entry, or a pending recording that fails), "Not available for listening" (unavailable) or
  "Recording unavailable". Fixtures (`?records=dev`) read "Development audio placeholder". Rules and tests:
  `captionStatus` in `src/ui/captionModel.ts`.

## 8. Keyboard

| where | key | action |
|---|---|---|
| intro | Tab, Enter / Space on ENTER ARCHIVE | enter (all other museum keys are held back) |
| travel | ↑ / ↓, PageUp / PageDown, wheel, touch drag | travel (existing controls) |
| travel | Enter | focus the active station (ignored while a button has focus) |
| focus | ← / → | previous / next record (existing record input) |
| focus | Escape | close (deferred during a change) |
| anywhere after entry | M | mute / unmute |

A pointer click on any UI button hands keyboard focus back to the page, so a later Enter focuses the station
instead of pressing the button again (the SOUND / Enter fix, `src/input/pointerActivation.ts`). Keyboard activation
keeps focus on the button. On entering focus, keyboard focus moves to Close; Tab reaches Previous / Next.

## 9. Typography and tokens

One editorial serif (`--ui-font-display`: Iowan Old Style / Palatino Linotype / Georgia) and one functional sans
(`--ui-font-text`: Segoe UI / system-ui). Both are system stacks: nothing is downloaded. Sizes, colours, gutters, motion
and safe areas are CSS variables on `:root` (archive title, era name, era years, track, byline, note, micro
labels, controls). The UI keeps one ink-on-paper palette for every era. The only per-era touch is `--era-accent`
(`ERA_UI_ACCENT`, taken from the Era Visual Worlds palettes), used on the indicator, the era rule and the catalogue
underline.

Legibility over the changing hall: dark ink with a soft light halo on the edge HUD; faint light gradients at the top
and bottom edges; the caption on a 93 %-opaque paper plate. No blur or backdrop filters.

## 10. Responsive behaviour

Caption placement follows the locked focus framing. It was measured by projecting the record, sleeve and deck
bounds to screen space at each size.

| window | caption | record / sleeve covered |
|---|---|---|
| 1920×1080, 1440×900, 1366×768, 1280×720, 1024×768, 1024×600 | right column (≤ 372 px), vertically centred | 0 % / 0 % |
| 880×640 (narrow landscape) | compact right column (≤ 36 vw) | 0 % / 0 % |
| 758×960, 600×900 (portrait / square) | top band, ends at 41 % of the height | 0 % / 0 % |
| 390×844 (phone portrait) | compact top band; record text scrolls inside | 0 % / 0 % |

The controls never leave the plate: when space is short, only the record text scrolls. Safe-area insets
(`viewport-fit=cover`, `env(safe-area-inset-*)`) pad every edge element. Touch layouts get 44 px controls and no
keyboard hints. Full mobile optimisation is the next milestone.

## 11. Accessibility and reduced motion

- Real `<button>`s everywhere, with visible `:focus-visible` outlines, hover, active and disabled states.
  Accessible names: "Previous record", "Next record", "Close and return to the archive", "Sound on — mute (M)",
  "Enable sound".
- Semantic landmarks: the intro is a `section` with an `h1`; the caption is an `aside` with an `h2` title. The
  loading bar is a `progressbar` with real values.
- Polite live regions: the era on each change ("Era 04 of 8: EXPLOSION, 1967 to 1989") and the mounted record.
- `prefers-reduced-motion`: the intro exit becomes a 0.2 s fade; HUD, era and caption animations are off; the caption
  slide is removed. The camera already respects it (CameraRig / travel).
- The WebGL scene itself is not screen-reader navigable (out of scope).

## 12. Production / development separation

- **Production builds** mount only: the intro, HUD, sound control and caption. No inspector, helpers, markers, debug
  labels, focus volumes or development record controls (`config.inspector` and the platter marker are forced off
  outside development; Era Visual Worlds already removed the development placards). `?records=dev` and `?intro=0`
  are ignored.
- **Development** keeps the inspector (`?inspector=1`, default), `?inspector=0` for the clean production view, and
  `?intro=0` to skip the intro. Development window handles (`__archiveAudio`, `__archiveTravel`, `__archiveRecords`,
  `__archiveFocusExits`) exist only in development.
- **Fallback:** browsers without WebGL get a textual screen ("Your browser cannot display the 3D archive."). A failure
  while starting the 3D archive is caught by an error boundary, shown the same way, and still logged to the console.
- Missing sleeve / audio files keep the existing fallbacks (model placeholder art; "Archive audio pending").

## 13. Verification (browser, 15 October 2026)

Development server with `?inspector=0`, plus a production build (`next start`). In-app browser, 758 × 960 CSS px,
DPR 1, unless a size is listed.

- **Intro → audio:** a real click on ENTER ARCHIVE gave context `running`, status PLAYING and "Sound on". The intro was
  removed after 944 ms. There was no extra SOUND click.
- **HUD, all eight eras** (dev jump to each anchor, 20 rendered frames): era number, name, years, thesis stage,
  marker and accent matched the CameraRig's active station for 01–08. Probes where equal 1/8 sectors would be wrong
  followed the real logic: u 0.075 → RECORDING (sector: ROOTS), 0.22 → HIGH-LIFE, 0.36 → EXPLOSION, 0.94 → ROOTS.
- **Focus, all eight eras:** era line, catalogue number, position, title, byline and "Archive audio pending" were
  correct for each. The caption covered **0 %** of the projected record and sleeve at every era.
- **Record changes:** ROOTS Dùndún → Bàtá, RECORDING, EXPLOSION Fela → King Sunny Adé and GLOBAL Essence → Free Mind.
  Each time, the caption switched on the PREPARE_NEXT commit frame, together with the deck's presented record.
- **Queue:** a queued NEXT shows the accent underline. Escape during a change gave "Changing record · closing after"
  and disabled Previous / Next; focus exited once the deck was stable.
- **GLOBAL → ROOTS** (real wheel): the HUD went 08 / 08 GLOBAL → 01 / 08 ROOTS at absolute progress 2.941 and back,
  with no reset and no intro. Refocusing GLOBAL showed the persisted A08-02 Free Mind.
- **Sound:** M toggled muted. RESUME SOUND appeared whenever the browser suspended the context (hidden page).
- **Production build:** no inspector, helpers, markers, development handles or Next badge. `?inspector=1&records=dev&
  intro=0&marker=1` was ignored (intro shown, archive set 01 / 05).
- **Performance** (median frame / draw calls / triangles). Before = the Era Visual Worlds capture at the same viewport:

| view | before | after (final UI) |
|---|---|---|
| ROOTS route | 16.50 ms · 35 · 1,160,120 | 16.7 ms (59.9 fps) · 35 · 1,160,120 |
| ROOTS focus | 16.50 ms · 33 · 1,056,623 | 16.7 ms (59.9 fps) · 33 · 1,056,623 |
| ROOTS record change | — | 16.7 ms median (59.9 fps) · ≤ 33 · ≤ 1,056,623 |

  Draw calls and triangles are identical: the UI is DOM only and re-renders on semantic changes, never per frame.
  The record-change p95 could not be measured cleanly because the page was backgrounded mid-sample.

## 14. Known limitations

- Loading progress counts files (models, textures), not bytes. Audio is decoded after entry (it needs the gesture).
- The intro is skipped only by a development flag. It returns on reload by design.
- The narrow portrait caption covers the upper part of the era installation behind the deck (the headline is
  readable in travel, before focus).
- On phones the significance line can need a scroll inside the caption. Full mobile layout / GPU work is the next
  milestone.
- Next.js' development badge (bottom-left, dev server only) overlaps the era years in development screenshots. It
  does not exist in production.
