# Content Pipeline — records, playlists, audio and artwork

How the archive's records are described, where their files go, when audio may play, and how content is checked.
The architecture is ready for the real playlists. **The playlists themselves are not populated**: the authoritative
dataset comes from the project owner. Nothing here invents songs, years, artists or historical notes.

Code: `src/data/types.ts` (contract) · `src/data/tracks.ts` (canonical archive) · `src/data/devFixtures.ts`
(development fixtures) · `src/data/contentPaths.ts` (file layout) · `src/data/validateArchive.ts` (rules) ·
`src/audio/audioCatalog.ts` (audio resolution) · `src/stations/recordArtworkCatalog.ts` (artwork resolution) ·
`scripts/check-content.mjs` (`npm run check:content`) · tests in `src/data/content.test.ts`.

## 1. Status today

The production archive is populated: **8 eras × 5 entries = 40** (docs/ARCHIVE_CONTENT.md), all `draft`, audio
`pending` (development tones stand in), artwork generated (museum fallback art). The development fixtures (two per era)
live apart and are only played with `?records=dev`. `npm run check:content` prints the catalogue and fails on any problem.

## 2. Track data contract

| field | type | required | meaning |
|---|---|---|---|
| `id` | string | yes | globally unique, stable, path-safe: lower-case letters / digits joined by `-` (`--` allowed). Used in file paths. Never reuse or rename a published id. |
| `eraId` | EraId | yes | the era whose playlist contains it. A record is only ever playable inside its own era. |
| `artist`, `title`, `genre` | string | yes, non-empty | as supplied, with correct diacritics (e.g. **Dùndún**). |
| `year` | number \| null | yes | release / recording year; `null` while unconfirmed — never guessed. |
| `yearNote` | string | when the year lies outside the era | why (e.g. a later recording of a tradition). |
| `historicalNote` | string | yes (may be empty) | one short, sourced statement. |
| `status` | `verified` \| `draft` \| `placeholder` | yes | editorial status; `placeholder` only for development fixtures. |
| `audioAvailability` | see §5 | yes | explicit playback permission. |
| `audioUrl` | string \| null | when `available` / `preview` | local file (§5); otherwise `null`. |
| `durationSeconds` | number \| null | optional | length of the supplied file (> 0). Metadata only for now. |
| `coverUrl` | string \| null | yes (null until supplied) | sleeve front (§4). |
| `vinylLabelUrl` | string \| null | yes (null until supplied) | label (§4). |
| `sleeveBackUrl` | string \| null | optional | sleeve back (§4). |
| `rights` | `{ holder?, licence?, note? }` | optional | provenance / permission reference, as supplied. Never fetched or inferred. |
| `sources` | `{ label, url? }[]` | optional | editorial references (the URL is a citation, never loaded). |
| `location`, `musicalDNA` | string, string[] | optional | place; musical elements carried forward (GLOBAL → ROOTS narrative). |

A record is **always displayable** with only the identity fields: no audio and no artwork are needed to show it,
mount it on the deck, or step past it.

## 3. Playlist structure, development vs real content

- `ARCHIVE_TRACKS_BY_ERA[era]` (tracks.ts) — the **production archive**: five entries per era, hero first, explicit
  catalogue order (docs/ARCHIVE_CONTENT.md).
- `DEV_TRACKS_BY_ERA[era]` (devFixtures.ts) — the **development set**: the era's hero, then two fixtures.
- `TRACKS_BY_ERA` (recordSets.ts) — the **active** set, chosen once at load: the archive by default and always in
  production builds; the development set with `?records=dev` (development builds) or `ARCHIVE_RECORDS=dev` (Node tests).
  `Era.tracks` is this list.
- **Any length ≥ 1.** Nothing assumes a fixed size: NEXT / PREVIOUS use `stepInPlaylist` (circular inside the era —
  last → first, first → last; a one-record playlist rejects both). Tested with 1 / 3 / 5 / 10 / 20 records, as a pure
  function and through the real record-change controller. The overlay shows "n / N".
- **Era-locked.** `getTrack(era, id)` never returns another era's record; `TrackSelection.select` refuses it; the
  record controller steps only inside the playlist of the focused era.
- **Deterministic order.** Playlists are arrays in display order; nothing sorts them at runtime; catalogue numbers are
  checked against positions.

**Development fixtures** (`devFixtures.ts`) are mechanical test records, not historical data. Each carries all four
markers, which the validator requires to agree: `audioAvailability: "development"`, `status: "placeholder"`, the
`--dev-placeholder-` id marker and artist `DEV PLACEHOLDER`. Their tones and artwork are generated locally
(`npm run audio:dev`, `npm run artwork:dev`) and keyed by **role**: archive entries get tones A–E by catalogue
position, fixtures cycle B, C — never by position in whichever set is active. Tests that deliberately break audio use
fixtures (docs/ARCHIVE_CONTENT.md §7).

## 4. Artwork paths

```
public/textures/records/<eraId>/<trackId>/label.<webp|png|jpg|jpeg>          → vinylLabelUrl
public/textures/records/<eraId>/<trackId>/sleeve-front.<webp|png|jpg|jpeg>   → coverUrl
public/textures/records/<eraId>/<trackId>/sleeve-back.<webp|png|jpg|jpeg>    → sleeveBackUrl
```
URLs are written without `public` (`/textures/records/highlife/<trackId>/sleeve-front.webp`); `recordArtworkPath()`
builds them. Image rules (vinyl GLB UVs, CLAUDE.md §9): **square** images; the label is circular art on a square
canvas with the spindle at the centre; sleeve front / back upright, 0–1. Suggested sizes: sleeve front 1024²,
label and back 512² (WebP). Runtime: `flipY = false`, sRGB (done by `recordArtwork.ts`).

Each part falls back on its own — supplied file → generated museum art (archive entries, docs/ARCHIVE_CONTENT.md §8) →
the model's neutral placeholder; a missing or failing file never blanks the deck. The station clones the Label / SleeveFront / SleeveBack materials once and swaps only their maps — no
era-specific artwork logic exists in `ListeningStation`, and the record-change controller only sees
`prepare` / `ready`. Development art lives apart, in `/textures/dev-records/…`, so it can never pass for licensed art.

## 5. Audio availability rules

| `audioAvailability` | `audioUrl` | plays | label |
|---|---|---|---|
| `available` | **required**: `/audio/<eraId>/<trackId>.<ext>` | the licensed recording | — |
| `preview` | **required**: `/audio/<eraId>/<trackId>.preview.<ext>` | the licensed excerpt | "Audio preview (excerpt)" |
| `pending` | must be `null` | the development tone if one exists (each era's hero), else nothing | "Development audio placeholder" / "Recording not yet supplied" |
| `unavailable` | must be `null` | **nothing, ever** (no tone either) | "Not available for listening" |
| `development` | must be `null` | the fixture's development tone | "Development audio placeholder" |

`<ext>`: mp3 · m4a · aac · ogg · opus · webm · wav · flac. Permission is never inferred: a title, a status, or even a
URL on a `pending` record plays nothing (the catalog ignores the URL; the validator reports it). Only local `/audio/`
files are ever loaded — no YouTube, Spotify, Apple Music, SoundCloud or third-party URLs (CLAUDE.md §4).
`AUDIO_ASSET_POLICY.allowDevelopmentPlaceholders` switches all development tones off at once.

## 6. Copyright-safe asset policy

- Audio and artwork are **supplied by the project owner** with the rights to use them. Nothing is downloaded,
  scraped, or fetched from streaming services or arbitrary URLs; nothing is generated to imitate a recording.
- Record the permission in `rights` (holder / licence reference) when it is supplied; mark records that may be
  shown but not heard as `unavailable`; use `preview` when only an excerpt is licensed.
- The vinyl GLB's original third-party artwork is erased by the model build (CLAUDE.md §9); never ship it.
- Development tones are pure synthesis and development artwork is generated text / shapes — both are clearly
  labelled "development" / "not historical data" in the UI and in the files themselves.

## 7. Loading and cache assumptions (limitations)

- **No eager loading.** The catalogs are plain data; importing them loads nothing. Audio: after unlock only the
  previous / active / next eras' **selected** records (+ one look-ahead era) are fetched and decoded; a record
  change prepares exactly its destination. Artwork: a station loads only its presented record's images, and a
  change preloads only the destination's. No playlist is ever loaded or decoded as a whole.
- **Audio buffers are not evicted** (session lifetime). Decoded PCM is float32: ≈ **23 MB per stereo minute** at
  48 kHz — a 4-minute recording ≈ 92 MB. Browsing many full-length records will grow memory without bound; before
  full playlists ship, add LRU eviction around the neighbourhood (AUDIO_ENGINE.md §16), and consider streaming long
  recordings (media-element source) or shorter `preview` files for mobile.
- **Artwork textures are not evicted** either. Decoded RGBA + mipmaps: 1024² ≈ 5.6 MB, 512² ≈ 1.4 MB, so a record
  with the suggested sizes ≈ 8.4 MB of GPU memory. Fine for today's 32 development files; licensed art needs an LRU
  policy (dispose textures not presented by any station and not a pending destination).
- Failed loads are remembered (not retried on every pass); a record with failed audio stays shown, "unavailable".
- `durationSeconds` is metadata only; recordings loop (`loopTracks`) until end-of-record behaviour is designed.

## 8. How to add a record

1. Put the files in place (licensed, supplied by the owner): `public/audio/<era>/<trackId>.<ext>` (or
   `.preview.<ext>`) and any of `public/textures/records/<era>/<trackId>/{label,sleeve-front,sleeve-back}.<ext>`.
2. Add or change the `Track` in `ARCHIVE_TRACKS_BY_ERA[era]` in `src/data/tracks.ts` (production scope: five per era —
   docs/ARCHIVE_CONTENT.md §11) at its display position (after the hero), with its catalogue number:
   all required fields, `audioAvailability` set explicitly, `audioUrl` / artwork URLs pointing at the files, `status`
   `draft` until verified, `year` or `null`, `rights` if known.
3. `npm run check:content` (rules + file existence), then `npm test`.
4. In the browser: focus the era's station, step to the record, check label orientation (text upright, centred on
   the spindle), sleeve front / back, the overlay line and the audio.

No component, scene or controller changes are needed.

## 9. How to add a full era playlist

1. Prepare the playlist in display order with the hero first; one id per record (stable, path-safe, unique across
   the archive).
2. Lay the files out per §4 / §5 (one folder per record for artwork).
3. Replace the era's archive list (`ARCHIVE_TRACKS_BY_ERA`). Keep `HERO_TRACK_IDS[era]` pointing at the hero; the hero
   must stay first and must not be a fixture. Records without permission yet: `pending`; never playable: `unavailable`.
4. Leave the fixtures alone: they live in the development set only (`?records=dev`).
5. `npm run check` (types, lint, tests, content). Then inspect the era in the browser (focus, NEXT through the whole
   list and wrap, PREVIOUS wrap, a record without audio, the overlay "record n of N").
6. Watch memory with many full-length recordings (§7) before shipping.

## 10. Validation rules (`validateArchive`)

Reports every issue — never modifies, sorts or repairs data — in deterministic order (era, then playlist position,
then rule). Each message names era, record id and position, e.g.
`highlife / test-record-1 (#2): id already used by highlife #1`.

| code | rule |
|---|---|
| `playlist-empty` | every era has at least one record |
| `unknown-era` | the era id is canonical |
| `required-field` | `id`, `artist`, `title`, `genre` non-empty; `historicalNote` is a string |
| `id-format` | id is path-safe (§2) |
| `duplicate-track-id` | ids unique across the whole archive |
| `era-mismatch` | `track.eraId` equals the playlist's era |
| `hero-missing` / `hero-not-first` / `hero-is-fixture` | the hero is in its era's playlist, first, and real |
| `year-invalid` / `year-outside-era` | whole year inside the era's range, unless `yearNote` explains it (`null` is fine) |
| `fixture-marking` | the four development markers agree (all or none) |
| `fixture-before-archive` | fixtures come after every archive record |
| `fixture-artwork` | fixtures keep artwork URLs null (generated development art) |
| `audio-availability` | one of the five values |
| `audio-url-required` | `available` / `preview` have an `audioUrl` |
| `audio-url-not-permitted` | `pending` / `unavailable` / `development` have none |
| `audio-path` | `/audio/<era>/<id>.<ext>`, or `.preview.<ext>` for previews — own era, own id, known format |
| `artwork-path` | `/textures/records/<era>/<id>/<part>.<ext>` with the right part for the field |
| `duration-invalid` | `durationSeconds` positive and finite, or null / absent |

`npm run check:content` adds file existence for every declared URL and every development asset. `npm run check`
runs it after the tests.
