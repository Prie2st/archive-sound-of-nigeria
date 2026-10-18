# Production audio — streamed recordings

Production recordings are **streamed** from media elements. They are never fetched whole or decoded into
`AudioBuffer`s. Development tones are still small decoded buffers. Both kinds play through the same single
`AudioContext` and the same spatial voice graph.

Code: `src/audio/streamPool.ts` (the pool) · `src/audio/engine.ts` (voices, working set) ·
`src/audio/browserAudio.ts` (`createMediaElement`) · tests in `src/audio/audio.test.ts`
("production audio — streamed recordings" and the "streams:" record-change tests).

## 1. Why full decoding is avoided

The engine used to `fetch()` each MP3, call `decodeAudioData()` on all of it, and keep the decoded buffer for the
whole visit with no eviction. Decoded audio is 32-bit float PCM, so at 48 kHz stereo:

| Recording | Length | Decoded size |
|---|---|---|
| King Sunny Adé — Ja Funmi | 67 min | ≈ 1.4 GB |
| Sikiru Ayinde Barrister — Fuji Garbage | 39 min | ≈ 850 MB |
| Haruna Ishola — Oroki Social Club | 15 min | ≈ 340 MB |
| A typical 3–5 min track | | 70–130 MB |

On a phone, a single long record could crash the tab. A media element instead streams the compressed file and
decodes only around its playhead. Memory use is the browser's media buffer, not the length of the song.

## 2. Sources

| Entry kind (`audioCatalog.ts`) | Plays as | Storage |
|---|---|---|
| `recording`, `preview` | **stream** — a pool element | the browser's media buffer, bounded per element |
| `development-placeholder` | **buffer** — decoded once, cached | 8 s mono tones, ≈ 1.5 MB decoded each |

`audioSourceStrategy()` in `engine.ts` makes this choice. The engine option `decodeRecordings` exists only for the
engine-mechanics tests and is never set in the browser. Without media element support, recordings report
`unsupported`; they are never decoded as a fallback.

## 3. One context, one graph

```
<audio> ─▶ MediaElementAudioSourceNode ─┐
silent 1-frame loop ("clock") ──────────┼─▶ voiceGain ─┬─▶ panner ─▶ musicSpatial ─┐
                                        │              └──────────▶ musicDry ─────┴─▶ music ─▶ master ─▶ destination
(development tone: AudioBufferSourceNode)┘
```

- **Single context.** The pool's nodes belong to THE `AudioContext`, which is created in the unlock gesture. A
  second context is still refused.
- **Clock source.** Each stream voice keeps a silent looping clock source. Its scheduled `stop()` ends the voice
  on the audio clock, exactly like a tone's source. Fades, `limitFadingVoices` and voice release work the same for
  both kinds.
- **Spatial mix.** Panner positions, the per-frame mix, crossfades, focus and mute are unchanged. No stream ever
  reaches the speakers directly.

## 4. The pool and its limits

- **Size.** `AUDIO_CONFIG.maxMediaElements` is **6**: 3 neighbourhood voices + a record-change destination + the
  lookahead + one voice fading out. That is the hard limit on media elements.
- **Created once.** All six elements are created inside the unlock gesture. Each one is started once, which gives
  WebKit playback permission, and paired once with its `MediaElementAudioSourceNode`. They are then reused by
  changing `src`, and no element is created later.
- **Release.** When a voice ends, its element is paused, its node is disconnected, and `src` is removed followed by
  `load()`. This aborts the download and frees the decoder buffers, and the element returns to the pool.
- **Full pool.** If every element is owned (only during rapid moves, while several voices fade out), the oldest
  fading stream is ended within 30 ms. Its release places whatever is still missing. The pool never grows.

## 5. Preparation ("preload")

The engine declares a working set, highest priority first (`streamDemand()`):

1. **Active era:** the selected record.
2. **Record-change destinations:** from `prepareTrack`, kept until the era is released.
3. **Next and previous eras:** their selected records.
4. **Lookahead:** the era beyond the neighbour ahead, once the visitor leaves a station plateau.

| Item | `preload` | Meaning |
|---|---|---|
| 1–3 while sound is on, and every destination | `auto` | the browser buffers enough to start; ready = `canplay` |
| 1 and 3 while sound is off (before ENTER, after Exit) | `metadata` | headers / duration only |
| lookahead | `metadata` | headers / duration only |

- **Sync.** An element whose URL leaves the list is freed, unless a voice owns it. A missing URL takes a free
  element or evicts a lower-priority one.
- **Upgrade.** Moving from `metadata` to `auto` sets the hint and reloads.
- **No whole-file preload.** Nothing outside this list is prepared, and no file is fetched whole.

## 6. Record change

The physical timeline (`recordChange.ts`) is unchanged; only the meaning of "ready" changed:

- `prepareTrack` at the request gives the destination an `auto` element right away.
- The controller already waits in `STOP_PLATTER` until the destination is `ready` (now `canplay`) or has failed.
  It waits again in `MOVE_ARM_TO_PLAY` before the needle drops.
- A destination that is still buffering keeps the old record on the deck until it can play (tested).
- At needle contact, `releaseEra` starts the destination from position 0, rising from silence (the fresh-voice
  fade). The old record's element is released when its duck ends.
- The selected record, the mounted record and the playing element always match, because a URL maps to exactly one
  element.

## 7. Mute, suspension, returning

- **Mute** ramps the master gain only. Elements keep playing; nothing is paused, reloaded or seeked.
- **Context suspended** (hidden page, OS interruption): owned elements pause. When the context runs again they
  resume where they were, so a stream behaves like a buffer source on the audio clock.
- **Era change.** A voice that changes role (next → active → previous) keeps its element.
- **Returning to a fading record.** The same element and position are revived; it does not restart.
- **Start position.** A new voice always starts at 0, as before.

## 8. Failures

| Case | Result |
|---|---|
| Element `error` before playing (a missing file reports code 4) | remembered per URL as `network` (code 3 → `decode`); the element is freed; travel does not retry it; an explicit `play()` retries once — same rules as the buffer cache |
| Destination fails before the commit point | the controller restores the original record (`restored-after-load-failure`) |
| Destination fails after the commit point | existing `unavailable` ending: the arm is parked and the station shows the error |
| Element fails while playing | the voice is released; the active era reports ERROR; the museum continues |
| Autoplay refused for an element | warned once; the next click / tap retries; mute and selection are untouched |

## 9. Verification (2026-10-18)

**Commands:** `npm test` (302), `npm run check` and `npm run build` all pass. There is no audio-specific check
script.

**Browser check** (dev server, desktop Chrome pane, real ENTER ARCHIVE click). `fetch` and `decodeAudioData` were
wrapped for logging only.

- **Entry.** One `AudioContext` and six pool elements; three streams played (ROOTS, RECORDING, GLOBAL), all as
  `206` range requests. A temporary analyser on the master bus measured RMS 0.08–0.34.
- **No decoding.** No recording fetch and no `decodeAudioData` call during the whole session; decoded cache stayed
  at 0 bytes.
- **Ja Funmi (67 min), via a real ArrowRight at EXPLOSION:**
  - Fela ducked in 0.3 s; the destination was `ready` about 0.2 s after the request.
  - Nothing played while the record was off the platter.
  - Ja Funmi started at 0:00 with the fresh fade at needle contact, about 10 s after the key press (unchanged
    choreography).
  - Chrome buffered only 0–134 s of the file. JS heap stayed flat (133 → 130 MB).
- **Mute:** the master gain went to 0 and back; the element never paused, had no reload events, and its position
  carried on.
- **GLOBAL → ROOTS by scrolling:**
  - ROOTS became active on the same voice and element that was rising as GLOBAL's neighbour.
  - Both were at about 0.73 at the switch; the position was continuous and there were 0 reload events.
  - EXPLOSION's selection (Ja Funmi) persisted after its element was released.
- **Console:** no errors or warnings.

## 10. Remaining risks

- **iOS / Safari.** This relies on WebKit lifting each element's restrictions when it is started inside the
  unlock gesture, and on `MediaElementAudioSourceNode` working with streamed media. Not verified on a device.
- **Network buffering.** Behaviour on a slow network is the browser's. A stalled stream does not stop the platter
  animation.
- **Download size.** On a fast connection, `auto` may still download a large part of a long file into the HTTP /
  media cache. That data is compressed (Ja Funmi is 96 MB on disk), not decoded.
