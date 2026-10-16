# Spatial Audio — music from the stations

Status: **built** (2026-10-14). Extends the audio engine ([AUDIO_ENGINE.md](AUDIO_ENGINE.md)); same single
AudioContext, lifecycle, cache, mute and suspension. No platter / tonearm / record animation; record
replacement and the final track UI are later milestones.

Files: [`src/audio/spatialMix.ts`](../src/audio/spatialMix.ts) (semantic mix, pure, 16 tests in
`spatialMix.test.ts`), [`src/audio/engine.ts`](../src/audio/engine.ts) (voices, panners, listener,
preloading), [`src/scene/AudioListenerBridge.tsx`](../src/scene/AudioListenerBridge.tsx) (per-frame bridge),
[`src/audio/browserAudio.ts`](../src/audio/browserAudio.ts) (station anchors from the hall layout).

---

## 1. Two concepts

1. **Semantic era relevance** (voice gain) — WHICH eras are heard and how much: the active station dominates,
   the previous / next eras bleed faintly, the incoming era rises before the active-era switch, the five
   distant eras have no voice at all. Driven by the travel position along the loop and the semantic
   active era — never by Euclidean distance, so a station across the open hall cannot leak in.
2. **Physical spatialization** (PannerNode) — WHERE the sound comes from: left / right direction and a mild
   distance character, from each station's platter relative to the camera.

## 2. Listener bridge

`AudioListenerBridge` (mounted in the Canvas right after the CameraRig, so its `useFrame` runs after the rig
has placed the camera) publishes one reused `AudioFrame` per frame to `engine.updateFrame()`:

- camera position, forward (−Z rotated by the camera quaternion), up (+Y rotated) — read from the camera the
  CameraRig drives; **no second camera calculation**;
- `travel.loopProgress`;
- focus: `focusAmount` = 0 in TRAVEL, `focus.easedProgress` otherwise; `focusStation` = `focus.station`.

No React state, no DOM, no allocations (one Vector3 + one frame object, reused). The engine writes the
listener AudioParams (`positionX/Y/Z`, `forwardX/Y/Z`, `upX/Y/Z`, set only when changed by > 1e-4; deprecated
`setPosition` / `setOrientation` only as a fallback where the params don't exist). Measured cost of
`updateFrame` (listener + mix + gain automation, 3 voices): **12 µs** per call in the dev build.

## 3. Station source positions

`browserAudio.ts` passes the hall layout's stations (era order) to the engine: `{ progress, source }` with
`source = station.platter` — the platter / record centre in world space, derived from the locked station
transform (`PLATTER_OFFSET` rotated by the heading). There is no second set of audio coordinates. Each voice's
panner is positioned once when the voice is created (static, never per frame) and is identical for the
ACTIVE / NEARBY / DISTANT visual tiers (it never touches the station meshes).

## 4. Audio graph

```
                      ┌─▶ PannerNode ─▶ musicSpatial (0.8) ─┐
source ─▶ voiceGain ──┤                                     ├─▶ musicGain ─▶ masterGain ─▶ destination
                      └───────────────▶ musicDry (0.2) ─────┘        ▲
(one voice each for previous / active / next era)      ambientGain ──┤
                                                         uiGain ──────┘
```

- **Per voice** (3 nodes): `AudioBufferSourceNode → voiceGain → PannerNode`; voiceGain also feeds the dry bus.
- **Buses** (6 nodes): master, music, ambient, ui, musicSpatial, musicDry.
- The dry share keeps every station partly centred, so nothing is ever hard-panned: fully to one side the
  far channel is still 0.2 vs 1.0 (≈14 dB), straight ahead 0.77 per channel.
- **SPATIAL OFF** (dev): musicSpatial → 0, musicDry → 1 — the PannerNodes are bypassed, the semantic
  crossfades are untouched (to tell bad panning from bad gain logic).
- Live nodes: 6 + 3 per voice → **15** with three voices (18 briefly while a far neighbour fades out).

## 5. Semantic adjacency

`adjacentEras(active)` uses the wrap-aware era helpers (`getPreviousEra` / `getNextEra`):
ROOTS → GLOBAL · ROOTS · RECORDING; GLOBAL → AFROBEATS · GLOBAL · ROOTS. Only these three eras can have a voice
(`reconcile()`), and `computeMixGains` forces every other era to 0 (`roleOf` = null). The active era is the
existing store written by the CameraRig (nearest station + hysteresis) — audio never computes its own.

## 6. Crossfade function

Station coordinate `s` (`stationCoordinate`): on the loop segment from station k's route view point to
station k+1's, `s = k + t` (t = 0…1 by progress); GLOBAL → ROOTS is the segment 7 → 8 ≡ 0, so the seam is an
ordinary segment. Each era's presence is a function of its circular offset `x = |s − index|` (stations):

| x (stations) | presence | meaning |
|---|---|---|
| 0 – 0.25 | 1 | plateau around the station |
| 0.25 – 0.75 | `bleed + (1 − bleed)·cos(smoothstep(w)·π/2)` | equal-power crossfade (0.736 at x = 0.5) |
| 0.75 – 1 | bleed = **0.10** (−20 dB) | faint neighbour |
| 1 – 1.5 | bleed → 0 (smoothstep) | tail |
| ≥ 1.5 | 0 | — |

At a station: active 1.0, previous / next 0.10. At a segment midpoint both eras are at 0.736 (the active-era
switch happens there, so the incoming era has already been rising for ≈4 m). The gate by adjacency makes at
most three eras non-zero; with the tail ending at 1.5 the far neighbour is already 0 when it leaves the set.
Smoothness: max change per 2.4 cm of travel < 0.02 over full laps in both directions (tests).

Voice gains follow the targets with `setTargetAtTime` (τ = 0.08 s; a new voice rises with τ = fadeIn / 5 =
0.12 s), set only when a target moves by ≥ 0.001 (always exactly at 0). Values: `SPATIAL_MIX_CONFIG`.

## 7. PannerNode configuration

| setting | value | why |
|---|---|---|
| `panningModel` | **equalpower** | clean on speakers and headphones, no HRTF colouration / comb filtering, consistent across browsers, half the CPU of HRTF (§12). HRTF is a dev toggle for comparison on headphones. |
| `distanceModel` | **linear** | predictable, bounded; relevance is decided semantically, distance only adds character |
| `refDistance` | 2 m | the focus camera distance → full level when focused |
| `maxDistance` | 30 m | beyond the far side of the hall |
| `rolloffFactor` | 0.6 | gain = 1 − 0.6·(d − 2)/28: 0.91 at 6 m (route view), 0.79 at 12 m, 0.66 at 18 m |
| cones | 360° | omnidirectional |

Net level of a neighbour at a station: 0.10 (semantic) × ≈0.7 (distance, wet part) ≈ −23 dB below the active
station — audible as "something is over there", never a second track.

## 8. Voice management

- Voices exist for the selected records of previous / active / next (when unlocked, playback wanted and the
  buffer is decoded). They are keyed by era: when the active era moves on, the incoming neighbour's voice
  becomes the active voice **as the same playback instance**, the outgoing active becomes previous, the far
  neighbour fades out over 0.45 s and is released, the new far neighbour starts at gain 0. One new source per
  era change.
- A distant era never has nodes. A record that comes back while it is still fading continues from its position.
- Track identity is the era's selection (`TrackSelection`); changing it replaces only that era's voice.

## 9. Preloading

- On unlock and on every active-era change: **active, next, previous** (`preloadNeighbourhood`), deduplicated
  by the cache (no sources created, selections untouched, never all eight).
- **Look-ahead**: once the visitor leaves the active station's plateau (|offset| > 0.25 station), the era
  beyond the neighbour they are heading to (active ± 2, from the position — forward or backward) is preloaded.
  That era joins as a voice only at the next active-era switch, by then decoded.
- Measured (cold decoded-audio cache, dev build, files from the HTTP cache): fetch 28–42 ms, decode
  105–189 ms; look-ahead fetch started ≈3–4 m after leaving the previous station; every era was decoded
  **0.3–0.57 s before its voice was needed** (when it joins at gain 0) and **2.75–3.41 s / 16–20 m before it
  became active** at full travel speed. The old ≈0.4 s first-visit silence is gone.
- Failure mode: a decode slower than that lead (very slow network / device) means the far neighbour joins late,
  then rises to its current mix level; if even the active record is late, that station is silent until it
  arrives (status LOADING). Travel is never blocked or slowed for audio.

## 10. Focus, mute, suspension, errors

- **Focus**: the same voices continue (no restart, no new source). With the eased focus progress p the focused
  (= active) station goes to `g + (1 − g)·p` (full presence even if focus began at the edge of its range) and
  the neighbours to `g·(1 − p)` → 0 in FOCUS. No boost above 1.0 (headroom); the focus camera is 2 m from the
  platter (vs ≈6.6 m on the route), so the panner's distance model adds ≈+0.7 dB of proximity. Exit blends back to the travel mix.
- **Mute** stays on masterGain; listener and mix keep updating while muted, so unmuting lands in the current mix.
- **Suspension**: voices persist through suspend / resume (no duplicates); frames during suspension only update
  targets.
- **Errors**: a broken neighbour simply has no voice; the active music is unaffected. Entering a broken era →
  status ERROR / "Recording unavailable"; that station is silent, its neighbours keep their normal curves
  (no compensation boost), navigation continues; the file is not refetched on later passes.

## 11. GLOBAL ↔ ROOTS and reverse travel

No special case anywhere: the seam is segment 7 → 0 of the station coordinate, adjacency wraps through the era
helpers, roles follow the position (not a travel direction). Measured through the production CameraRig (real
wheel input, dev build):

| boundary | incoming audible before switch | rising above bleed before | incoming voice | outgoing right after |
|---|---|---|---|---|
| GLOBAL → ROOTS (fwd) | 16.0 m / 2.7 s | 3.9 m | same instance | 0.56 target |
| ROOTS → GLOBAL (back) | 13.7 m / 2.3–2.5 s | 3.8 m | same instance | 0.59–0.64 |
| all 19 boundaries of a forward lap + a backward lap | 13.7–17.0 m | 3.2–4.4 m | same instance (19/19) | 0.52–0.64 |

Over both laps: the loudest voice never dropped below 0.73 (segment midpoints), 0 frames without an active
voice, max 3 live voices (4 incl. a fading one), 0 frames with a non-adjacent voice.

## 12. Performance

Same dev view and route (Intel UHD 620, 758 × 426 @ DPR 2, panel collapsed, wheel-driven travel), audio LOCKED
vs spatial audio playing:

| segment | fps (median) locked → spatial | frame ms median / p95 | draw calls (min/med/max) | triangles k (min/med/max) | voices |
|---|---|---|---|---|---|
| ROOTS → RECORDING | 59.2 → 59.9 | 16.9 / 50.0 → 16.7 / 33.6 | 55/102/105 → 55/102/105 | 874/1803/1906 → 883/1803/1910 | 3 |
| EXPLOSION → TRANSITION | 59.2 → 59.9 | 16.9 / 49.7 → 16.7 / 33.7 | 17/102/109 → 17/102/109 | 543/1267/1878 (same) | 3 |
| GLOBAL → ROOTS | 59.5 → 59.9 | 16.8 / 34.0 → 16.7 / 33.6 | 15/103/111 → 15/105/111 | 338/1269/1806 (same) | 3 |
| whole lap | 59.5 → 59.9 | 16.8 / 34.0 → 16.7 / 33.6 | 15/100/111 (same) | 338/1372/2191 (same) | 3 |

(60 fps vsync cap; audio creates no WebGL resources; GPU geometry / texture counts did not change across laps.)
Audio-thread cost (OfflineAudioContext, 3 voices, 60 s, static positions): no panner 1.3 % of one core,
equalpower 2.7 %, HRTF 4.8 %; with per-sample automated positions 14 % (equalpower) / 15–17 % (HRTF) — the engine avoids that path
(positions are set per frame via `.value`, not automated).

## 13. Development tools

DEV INSPECTOR → AUDIO: listener position + station coordinate; previous / ACTIVE / next eras with each selected
record's load state; per voice: role, era, target, actual gain, distance, panner position, playback position,
track; bus gains (master / music / spatial / dry); live nodes, voice count, buffers. Toggles: **SPATIAL ON/OFF**,
**SOLO ACTIVE**, **NEIGHBOR BLEED ON/OFF**, **panning: equalpower / HRTF**. Note: `AudioParam.value` is only
refreshed once the audio thread renders — immediately after unlock it can show defaults for a moment.

## 14. Limitations

- Equalpower cannot tell front from back: a station behind sounds like one in front (same side). Acceptable
  for an authored route that mostly faces its stations; HRTF can be compared on headphones via the dev toggle.
- No room acoustics / reverb; the dry path is identical for all stations.
- Bleed and distance levels are tuned by reasoning and measurement, not yet by ear on real recordings —
  re-check once the licensed music (very different loudness from the tones) arrives.
- Playheads are not persistent: a record starts when its era joins the neighbourhood (≈1.5 stations before it
  becomes active) and restarts on a later visit.
- All decoded buffers stay in memory (8 heroes = 12.29 MB). **Full-playlist cache eviction is a future
  requirement** (~80 tracks would be ≈120 MB+ decoded): keep previous / active / next (+ look-ahead), evict LRU.
- At the very first moment after unlock the neighbours' bleed may start a few hundred ms later than the active
  record (three parallel loads).
