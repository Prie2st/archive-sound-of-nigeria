# Audio Engine — global playback

Status: **built** (2026-10-14). One AudioContext, unlock gate, per-era selected track, lazy
buffer cache, master mute, visibility handling, failure states. **Spatial since 2026-10-14**: one
voice each for the previous / active / next era, PannerNodes at the stations, a semantic crossfade
along the route, prev / active / next preloading — see [SPATIAL_AUDIO.md](SPATIAL_AUDIO.md). No
platter / tonearm / record-change animation, and audio is not wired to any animation.

Files:

| File | Role |
|---|---|
| [`src/audio/engine.ts`](../src/audio/engine.ts) | `AudioEngine`: context lifecycle, graph, voices, semantic state, fades (pure TS) |
| [`src/audio/bufferCache.ts`](../src/audio/bufferCache.ts) | URL-keyed fetch + decode cache with request deduplication and remembered failures |
| [`src/audio/trackSelection.ts`](../src/audio/trackSelection.ts) | each era's selected record (`EraAudioState`), era-locked |
| [`src/audio/audioCatalog.ts`](../src/audio/audioCatalog.ts) | `Track` → runtime `AudioTrackEntry` (which local file, what kind) |
| [`src/audio/devAudioAssets.ts`](../src/audio/devAudioAssets.ts) | development tone manifest + synthesis spec |
| [`src/audio/webAudio.ts`](../src/audio/webAudio.ts) | the structural slice of Web Audio the engine uses |
| [`src/audio/browserAudio.ts`](../src/audio/browserAudio.ts) | the page's singleton, real `AudioContext` / `fetch`, station anchors, React bridges |
| [`src/audio/spatialMix.ts`](../src/audio/spatialMix.ts) | semantic station mix: adjacency, station coordinate, presence curve, focus, preload targets (pure) |
| [`src/scene/AudioListenerBridge.tsx`](../src/scene/AudioListenerBridge.tsx) | per-frame listener + travel / focus input from the CameraRig's camera |
| [`src/input/useAudioInput.ts`](../src/input/useAudioInput.ts) | M = mute |
| [`src/ui/SoundToggle.tsx`](../src/ui/SoundToggle.tsx) | TEMPORARY sound control = unlock gate |
| [`scripts/build-dev-audio.mjs`](../scripts/build-dev-audio.mjs) | generates the development tones (`npm run audio:dev`) |
| [`src/audio/audio.test.ts`](../src/audio/audio.test.ts), [`spatialMix.test.ts`](../src/audio/spatialMix.test.ts) | 42 + 16 tests with a mocked Web Audio boundary |

---

## 1. AudioContext ownership

- **One engine per page**: `getAudioEngine()` (browserAudio.ts) creates it on first call and returns the
  same instance afterwards (MuseumCanvas calls it once; React strict-mode double renders reuse it).
- **One AudioContext**: created lazily by `AudioEngine.unlock()` — the only caller of
  `createContext` — and never again. The browser factory additionally refuses to construct a second
  context (`contextCreated` guard). A suspended or interrupted context is resumed, never replaced; a
  closed context puts the engine in a terminal `ERROR` (`context-closed`) instead of creating another.
- No component, station or R3F code touches Web Audio. The engine is plain TypeScript written against
  `webAudio.ts` interfaces; the real `AudioContext` is assignable to them (checked by `tsc`).

## 2. Audio graph

```
                      ┌─▶ PannerNode ─▶ musicSpatial (0.8) ─┐
source ─▶ voiceGain ──┤                                     ├─▶ musicGain ─▶ masterGain ─▶ destination
                      └───────────────▶ musicDry (0.2) ─────┘        ▲
(one voice each for previous / active / next era)      ambientGain ──┤
                                                         uiGain ──────┘
```

- `masterGain` — mute (and later global level). `musicGain` / `ambientGain` / `uiGain` — the three
  buses, all at 1.0; ambient and UI are wired but unused. `musicSpatial` / `musicDry` — panned and
  unpanned share of the music (dev SPATIAL OFF = 0 / 1).
- **voice** = one playback instance of one era's record: a new `AudioBufferSourceNode` + its own
  `GainNode` (the per-track gain, driven by the semantic mix) + its own `PannerNode` at the station.
- Live nodes: 6 buses + 3 per voice (15 with three voices). Details: SPATIAL_AUDIO.md §4.

## 3. Unlock

**ENTER ARCHIVE is the unlock gesture** (final UI milestone, docs/FINAL_UI.md §2). Its click handler calls
`startArchiveSound(audio)` (browserAudio.ts): `unlock()` (creates the context + graph, plays a one-frame silent
buffer for iOS, `resume()`), `unmute()`, `play()`. The production sound control (`SoundToggle`, top right) shows
`ENABLE SOUND` (not unlocked — same `startArchiveSound`) · `SOUND ON` · `MUTED` · `RESUME SOUND` (suspended) ·
`SOUND UNAVAILABLE` (no Web Audio). If unlock fails the visitor still enters; there is never a second context.

- (History: before the final UI, the first click on a temporary `SOUND OFF` button was the gesture.)
- `unlock()` refuses to run without **transient user activation** (`navigator.userActivation.isActive`):
  a script call without a gesture returns `false`, creates nothing and logs a warning. Nothing is
  fetched, decoded or played before unlock (`play()` before unlock only records intent).
- After unlock the active era's selected track is loaded immediately.
- Wheel / scroll is not a valid activation in browsers, so travelling alone never unlocks audio.

## 4. Tracks and assets (historical data stays clean)

`Track` (src/data/types.ts) carries an explicit **`audioAvailability`** (content pipeline milestone; contract in
docs/CONTENT_PIPELINE.md §5). The catalog decides from it alone — a title, a URL or a status never implies
permission:

| availability | kind | url |
|---|---|---|
| `available` | `recording` | `Track.audioUrl` (local `/audio/<era>/<track>.<ext>`) |
| `preview` | `preview` | `Track.audioUrl` (local `…/<track>.preview.<ext>`); label "Audio preview (excerpt)" |
| `pending` / `development` | `development-placeholder` | the record's dev tone, if one exists and `AUDIO_ASSET_POLICY.allowDevelopmentPlaceholders` |
| `unavailable` | — (`not-licensed`) | `null` — never a tone, never a URL |

No audio → `url: null` with a reason (`no-audio`, `not-licensed`, `missing-url`, `not-local-asset`: anything not a local
`/audio/` path — `https://…`, `//…`, `..` — is never fetched); the record is still shown and mounted. Today every
archive entry is `pending` with `audioUrl: null` (a test enforces it). Dev tones exist for all 40 archive entries (variants
A–E by catalogue position) and the development fixtures (B, C), keyed by role, not by the active record set. In the
archive set the visitor sees "Archive audio pending", never "development tone".

`AudioTrackEntry { trackId, eraId, url, kind, unavailable }` is plain data; buffers and nodes live only
inside the engine. The temporary focus label shows `DEVELOPMENT AUDIO PLACEHOLDER` for dev tones so they
are never presented as the recording.

Asset structure: `public/audio/<eraId>/…` for all eight eras (`roots`, `recording`, `highlife`,
`explosion`, `transition`, `naija`, `afrobeats`, `global`). Licensed files go next to the dev tones as
`/audio/<eraId>/<trackId>.<ext>` — set `audioUrl` **and** `audioAvailability: "available"` (or `preview`), nothing else changes.

## 5. Loading and cache

`AudioBufferCache` (keyed by URL):

- `load(url)` returns the cached buffer, the **in-flight promise** (simultaneous requests deduplicated)
  or starts one fetch + one `decodeAudioData`.
- Failures are classified (`network` = fetch failed / non-2xx, `decode` = undecodable) and
  **remembered**: a broken file is not refetched every time the visitor passes; an explicit `play()`
  (SOUND button, dev PLAY ACTIVE) retries it once.
- `clear()` (dev CLEAR AUDIO CACHE) drops buffers; loads already in flight finish but are not stored;
  playing voices keep their own buffer reference.
- Startup loads nothing. After unlock and on every active-era change: the **previous, active and next**
  eras' selected records (`preloadNeighbourhood` → `preloadEra`), plus a look-ahead era once the visitor
  leaves the active station's plateau (SPATIAL_AUDIO.md §9). Never all eight at once.
- Decoded size = frames × channels × 4 bytes (float32 at the context rate). A dev tone (8 s mono,
  resampled to 48 kHz): **1.536 MB**; all eight: **12.29 MB**.

## 6. Source lifecycle

- `reconcile()` is the single place that makes the voice set match the target (the previous / active /
  next eras' selected records while playback is wanted). It runs after every semantic change and after
  every load — never per frame. Per frame, `updateFrame()` only moves gains and the listener.
- **Start**: new `AudioBufferSourceNode` + `GainNode` + `PannerNode`, `loop = true`, gain from 0 toward
  the mix target (`setTargetAtTime`, τ = fadeIn / 5), `source.start(now, offset)`. Started exactly once.
- **Role change** (next → active → previous) keeps the same instance: an era boundary never restarts a voice.
- **Stop**: gain ramps to 0 over `fadeOut`, then `source.stop(now + fadeOut + stopMargin)` on the
  audio clock (no JS timers).
- **Cleanup**: `onended` → `onended = null`, `source.disconnect()`, `gain.disconnect()`, removed from
  the voice set (each voice released once; the panner is disconnected too). A stopped source is never restarted; replaying always
  creates a new one (unit test: the mock throws on a second `start`).
- Returning to a track that is **still fading out** starts a new voice at that voice's current
  position — continuous to the ear, still no reuse.
- At most three live voices (previous / active / next); fading voices are capped (`maxFadingVoices` 4,
  only reachable with rapid dev input). A load finishing after the visitor moved on joins only if its era
  is still in the neighbourhood.

## 7. Selected-track state

`TrackSelection` holds one `EraAudioState { eraId, selectedTrackId, visited }` per era (the existing
type and `createInitialEraAudioState`): initially the hero track; `markVisited` on each era change;
**never reset when the camera leaves**. `select(eraId, trackId)` accepts only tracks of that era's
playlist (`getTrack`), so another era's record is structurally unreachable — `selectTrack` returns
`false` and changes nothing. No NEXT / PREVIOUS controls are exposed (record changing comes later);
`selectTrack` is the hook for that milestone.

Visual bridge: `isEraPlaying(eraId)` — whether an era's selected record is logically playing (live voice in a
running context; muted still counts). Polled per frame by the platter motion (docs/PLATTER_MOTION.md §2);
it exposes no Web Audio objects.

Semantic snapshot (React via `useSyncExternalStore`, changes only on events, never per frame):
`status, unlocked, contextState, muted, wantsPlayback, activeEraId, selectedTrackId, selectedKind,
loadedTrackId, playingTrackId, error`.

| status | meaning |
|---|---|
| `LOCKED` | no gesture yet, no context |
| `READY` | unlocked, playback intent off (dev STOP) |
| `LOADING` | target being fetched / decoded |
| `PLAYING` | target voice running |
| `SUSPENDED` | context suspended / interrupted (hidden page, browser, OS) |
| `ERROR` | target unavailable (`unavailable` / `network` / `decode`) or Web Audio unusable (`unsupported` / `context-closed`, `trackId: null`) |

### Record change (docs/RECORD_CHANGE.md §5)

Additions for the record change — prepare ≠ play:

- `holdEra(era, seconds)`: the era's voice ducks to 0 over `seconds` and stops; no voice is created for a held era,
  even when its selection changes. `releaseEra(era)`: the era's selected record starts as a fresh voice rising from 0.
- `prepareTrack(era, track)`: fetch + decode without selecting or playing; `trackLoadState(era, track)` →
  idle / loading / ready / error / unavailable.
- `eraVoiceTrack(era)` (live voice's track, independent of suspension), `isPlaybackWanted()`, `isEraHeld(era)`.
- Every playlist record now has a development tone (the DEV PLACEHOLDER records B and C: a fifth / an octave above
  the era's hero tone); `Track.audioUrl` stays null.

## 8. Fades

| | value | AudioParam |
|---|---:|---|
| voice fade in | **0.6 s** (≈99 %) | `setValueAtTime(0)` + `setTargetAtTime(target, τ = 0.12 s)` |
| mix following | τ **0.08 s** | `setTargetAtTime` per frame, only when the target moves ≥ 0.001 |
| voice fade out | **0.45 s** (+0.05 s before `stop`) | linear ramp from current value to 0 |
| mute / unmute | **0.08 s** | master ramp from current value |

All in `AUDIO_CONFIG` (engine.ts). An interrupted ramp restarts from the param's current value
(`cancelScheduledValues` + `setValueAtTime(value)`), so nothing jumps. Exponential ramps are not used
(they cannot reach 0). Era transitions are the position-driven crossfade of SPATIAL_AUDIO.md §6.

## 9. Mute

`mute() / unmute() / toggleMute() / setMuted()` ramp **masterGain only**. Sources keep running,
selections, buffers, the intent and the spatial mix (listener, voice gains) are untouched and keep
updating, so unmuting lands in the current mix. Muting before unlock is remembered (the graph is built
silent). M key (ignored in form fields) and the temporary button.

## 10. Active-era relationship

Audio does **not** compute an active era. `useAudioLifecycle` subscribes the engine to the existing
`activeEra` value store, which the CameraRig writes (nearest station + hysteresis) — the same value
that drives station LOD. `setActiveEra` marks the era visited, preloads previous / active / next and
reconciles. GLOBAL → ROOTS and ROOTS → GLOBAL are just era changes; laps don't matter. The per-frame mix
uses the travel loop position from the listener bridge (SPATIAL_AUDIO.md §2).

## 11. Focus relationship

Focus freezes travel, so the active era — and track identity — cannot change while focused: no restart,
no new source, no selection change, mute state kept. Since the spatial milestone the listener bridge passes
the eased focus progress: the focused station rises to full presence and the neighbours fade to 0, and exit
blends back to the travel mix (SPATIAL_AUDIO.md §10).

## 12. Visibility and suspension

- `document.visibilitychange` → `setPageVisible`. Hidden: `context.suspend()` (`suspendWhenHidden`).
  Visible: `context.resume()` — allowed without a new gesture because the page was already unlocked.
- If the browser refuses (or suspends / interrupts on its own), status is `SUSPENDED` and the button
  shows `RESUME SOUND`; its click calls `unlock()`, which resumes the same context.
- `statechange` is followed; `closed` → `ERROR (context-closed)`, voices released, no new context.

## 13. Errors

Failures never throw into the museum. A failed / missing track → snapshot `error { trackId, reason }`,
status `ERROR` while that era is active, a single `console.warn('[audio] …')` per failure (no stack
traces in the UI); navigation, focus and other eras continue. The temporary focus label shows
`RECORDING UNAVAILABLE`. Web Audio missing → `SOUND UNAVAILABLE`.

## 14. Development tools and assets

- **Dev tones** (`npm run audio:dev`): synthetic, no third-party material — `<era number>` soft plucks per
  2 s bar over a quiet drone, pitch rising G3 → G4 from ROOTS to GLOBAL, 8 s seamless loop, mono
  22.05 kHz 16-bit WAV, 345 KiB each (2.76 MiB total), peaks −10.6 … −15.1 dBFS. Identify the era by
  counting plucks.
- DEV INSPECTOR → **AUDIO** (development builds only): readout (4 Hz, DOM, not React state) of status,
  context state / contexts created / sample rate, unlocked, mute, intent, era, selected / loaded / playing
  track, error, bus gains, voices (gain, position, fading), live nodes, sources created, buffers / decoded
  MB / requests. Actions: UNLOCK AUDIO (a real click), PLAY ACTIVE, STOP, MUTE/UNMUTE, CLEAR AUDIO CACHE,
  simulated page hidden / visible.
- `?audioFail=<eraId>` (dev) points that era's audio at a missing file.
- `window.__archiveAudio` (dev) = the engine, for browser tests.

## 15. Verification (2026-10-14, global playback milestone — before spatial audio)

The spatial milestone's verification (voices, boundaries, preloading, performance) is in
SPATIAL_AUDIO.md §9–§12; the unit tests below were updated to the three-voice model.

Unit tests (`npm test`, 39 audio tests at the time, mocked context with an audio clock and AudioParam automation):
one context / gesture gate / nothing before unlock; graph wiring; iOS primer cleaned up; each of the eight
heroes plays (entry, fetch URL, status); fade-in ramp; dedup (preload + play = 1 fetch, 1 decode);
stop → new source on replay; per-era selection persists and refuses other eras; crossfade + release;
fading-track continuation; 8 buffers for 16 era changes; mute ramp keeps playback; GLOBAL → ROOTS,
ROOTS → GLOBAL; 3 laps forward + 2 back with the real `selectActiveStation` (every era in order, 8
fetches, 41 sources created and all but one ended and disconnected, 6 live nodes at the end); focus
enter / exit / Enter-Escape / mute-in-focus with the real `FocusController` + `TravelController` (no new
source, no stop, same track); hide / show, refused resume, Safari `interrupted`, `closed`; missing file,
undecodable file, late load.

Browser (dev build, built-in browser pane, Intel UHD 620, 758 × 426):

- Script `unlock()` without a gesture → `false`, `LOCKED`, 0 contexts, 0 audio requests. Real click on
  SOUND OFF → context `running`, 1 context, ROOTS hero playing; 1 request (353 KB, 20 ms).
- Real wheel input, forward > 1 lap through every era and across the seam (GLOBAL → ROOTS at abs 0.9414),
  then backward across it (ROOTS → GLOBAL at 0.9358): every era played its own hero; max 1 non-fading voice,
  max 2 voices / 8 live nodes during crossfades, 6 at rest; 8 fetches total (20–68 ms each), 0 new
  requests on the second pass; 12.29 MB decoded; 1 context throughout.
- Focus (Enter, M, Escape; Enter → Escape immediately; unmute by clicking MUTED inside FOCUS): same voice
  id, no new source, abs progress restored exactly, mute kept across exit.
- Visibility (real `visibilitychange` event): hidden → `suspended` / SUSPENDED / "RESUME SOUND";
  visible → `running` / PLAYING, same voice, still 1 context.
- `?audioFail=roots`: ROOTS → ERROR (network, 404) with no voice; station still focusable, label
  "RECORDING UNAVAILABLE"; RECORDING plays; back at ROOTS no refetch (1 request for the missing file).
- WebGL at the same ROOTS view, audio LOCKED vs active: 59 → 59 draw calls, 1,169,758 → 1,169,758
  triangles, 59.5 → 59.2 fps median. (Geometries / textures rose 68 → 102 / 39 → 43 only because the test
  jumped to RECORDING, uploading that station's tiers to the GPU for the first time; audio creates no GL
  resources.)

## 16. Known limitations

- ~~Cold-load gap~~ — **solved** by previous / active / next + look-ahead preloading (SPATIAL_AUDIO.md §9):
  every era is decoded seconds before it becomes active during normal travel. A very slow decode can still
  leave a station silent until it arrives; travel is never blocked for audio.
- A record starts when its era joins the neighbourhood (≈1.5 stations before it becomes active) and
  restarts on a later visit (unless still fading out). No persistent per-era playheads yet.
- Tracks loop (`loopTracks`); end-of-record behaviour is for the record-changing milestone.
- Decoded audio is held for the session (8 heroes = 12.3 MB); no eviction policy yet. **Full-playlist
  cache eviction is a future requirement** (a real recording decodes to ≈ 23 MB per stereo minute at 48 kHz — a 4-minute track ≈ 92 MB; docs/CONTENT_PIPELINE.md §7): keep previous / active / next
  (+ look-ahead), evict least-recently-used.
- ENTER ARCHIVE (or ENABLE SOUND) is the only unlock path; a visitor whose browser refuses audio enters silently
  and can retry from ENABLE SOUND.
- Production also serves the dev tones while `allowDevelopmentPlaceholders` is on; switch it off once
  the licensed recordings are in place.
