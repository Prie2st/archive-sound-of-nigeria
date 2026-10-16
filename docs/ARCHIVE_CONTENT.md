# Archive Content — the production archive

The museum's records: eight eras × five entries = **40 archive entries**, curated by the project owner.
This document covers the content itself; the file / audio / artwork contract is in
[CONTENT_PIPELINE.md](CONTENT_PIPELINE.md).

Code: `src/data/tracks.ts` (the archive) · `src/data/types.ts` (schema) · `src/data/eras.ts` (eras, statements,
thesis) · `src/data/trackDisplay.ts` (visitor wording) · `src/data/devFixtures.ts` + `src/data/recordSets.ts`
(development fixtures) · `src/data/validateArchive.ts` (rules) · `scripts/build-archive-artwork.mjs` +
`src/data/archiveArtTokens.ts` (fallback artwork) · tests: `src/data/content.test.ts`,
`src/stations/recordChange.test.ts`.

## 1. Eras, statements and thesis

| # | era | dates | statement | thesis stage |
|---|---|---|---|---|
| 01 | ROOTS | 1900–1919 | BEFORE RECORDS, NIGERIA ALREADY HAD HUNDREDS OF MUSICAL LANGUAGES. | TRADITION |
| 02 | RECORDING | 1920–1944 | MUSIC BECOMES REPRODUCIBLE. | ADAPTATION |
| 03 | HIGH-LIFE | 1945–1966 | THE SOUNDTRACK OF A COUNTRY BECOMING MODERN. | LOCALISATION |
| 04 | EXPLOSION | 1967–1989 | EVERYTHING EXPLODES. | LOCALISATION |
| 05 | TRANSITION | 1990–1999 | A NEW GENERATION ASKS WHAT NIGERIAN YOUTH MUSIC SHOULD SOUND LIKE. | LOCALISATION |
| 06 | NAIJA | 2000–2009 | NIGERIAN POP NO LONGER NEEDS SOMEBODY ELSE'S GENRE. | LOCALISATION |
| 07 | AFROBEATS | 2010–2019 | THE WORLD STARTS LISTENING. | EXPORTATION |
| 08 | GLOBAL | 2020–2026 | NIGERIAN MUSIC DOESN'T NEED TO CROSS OVER ANYMORE. | EXPORTATION |

`Era.headline` holds the statement; `Era.thesisStage` places the era in **TRADITION → ADAPTATION → LOCALISATION →
EXPORTATION** (`ARCHIVE_THESIS`). The mapping above is **confirmed** (editorial correction pass). Stages span several
eras by design — it expresses the larger thesis, not one era per stage. Nothing renders it yet (the visual-world
milestone will); a test locks the exact mapping.

## 2. Scope: five entries per era

Exactly 5 per era, 40 in total, enforced by `validateProductionArchive` (test + `npm run check:content`). Order is
explicit: each era's array in `tracks.ts` *is* its playlist, entry 1 is the hero (default record), and the catalogue
number encodes the position. NEXT / PREVIOUS wrap inside the era's five (5 → 1, 1 → 5) and never reach another era.

## 3. The 40 entries

★ = hero / default record. "—" = no confirmed date (none invented).

**01 ROOTS** — listening references to traditions (§5)

| no. | tradition | entry | style |
|---|---|---|---|
| A01-01 ★ | Yorùbá | Dùndún / Talking Drum | Talking drum |
| A01-02 | Yorùbá | Bàtá Drumming | Drum ensemble |
| A01-03 | Yorùbá | Oríkì Praise Poetry | Praise poetry |
| A01-04 | Hausa | Kalangu / Talking Drum | Talking drum |
| A01-05 | Hausa | Kakaki Royal Trumpet Ensemble | Royal court music |

**02 RECORDING**

| no. | artist | title | date | style |
|---|---|---|---|---|
| A02-01 ★ | Tunde King | Aronke Macaulay | 1937 | Jùjú |
| A02-02 | Tunde King | Oba Oyinbo | 1930s | Jùjú |
| A02-03 | Tunde King | Soja Idumota | 1930s | Jùjú |
| A02-04 | Ayinde Bakare | Early Jùjú Recordings *(artist reference)* | 1930s–40s | Jùjú |
| A02-05 | G.T. Onwuka | Palm-wine Recordings *(artist reference)* | 1930s | Palm-wine |

**03 HIGH-LIFE**

| no. | artist | title | date | style |
|---|---|---|---|---|
| A03-01 ★ | Bobby Benson | Taxi Driver | — | Highlife |
| A03-02 | Victor Olaiya | Baby Jowo | — | Highlife |
| A03-03 | Cardinal Rex Lawson | Sawale | — | Highlife |
| A03-04 | Victor Uwaifo | Joromi | 1965 | Highlife / Edo |
| A03-05 | Orlando Julius | Jaguar Nana | — | Afro-highlife |

**04 EXPLOSION** — deliberately not only Afrobeat: jùjú, apala, fuji and reggae

| no. | artist | title | date | style |
|---|---|---|---|---|
| A04-01 ★ | Fela Kuti | Water No Get Enemy | 1975 | Afrobeat |
| A04-02 | King Sunny Adé | Ja Funmi | 1982 international release | Jùjú |
| A04-03 | Haruna Ishola | Oroki Social Club | 1971 | Apala |
| A04-04 | Sikiru Ayinde Barrister | Fuji Garbage | 1988 | Fuji |
| A04-05 | Majek Fashek | Send Down the Rain | 1988 | Reggae |

**05 TRANSITION**

| no. | artist | title | date | style |
|---|---|---|---|---|
| A05-01 ★ | The Remedies | Shakomo | — | Hip-Hop / Pop |
| A05-02 | Adewale Ayuba | Bubble | — | Fuji |
| A05-03 | Daddy Showkey | Diana | — | Ghetto / Dancehall |
| A05-04 | Junior & Pretty | Monika | — | Naija Hip-Hop |
| A05-05 | Trybesmen | Shake Bodi | 1998 | Hip-Hop |

Excluded from TRANSITION because their dates fall outside 1990–1999: Plantashun Boiz — Knock Me Off (2000) and
Sir Shina Peters — Ace (commonly dated 1989; replaced at A05-02 by Adewale Ayuba — Bubble in the editorial correction
pass). Neither is in any production playlist.

**06 NAIJA**

| no. | artist | title | date | style |
|---|---|---|---|---|
| A06-01 ★ | 2Face Idibia | African Queen | 2004 | Afropop / R&B |
| A06-02 | Sound Sultan | Mathematics | — | Afropop |
| A06-03 | D'banj | Why Me | 2006 | Afropop |
| A06-04 | 9ice | Gongo Aso | 2008 | Afropop |
| A06-05 | Wande Coal | Bumper to Bumper | 2009 | Afropop |

**07 AFROBEATS**

| no. | artist | title | date | style |
|---|---|---|---|---|
| A07-01 ★ | Wizkid | Ojuelegba | 2014 | Afrobeats |
| A07-02 | D'banj | Oliver Twist | 2012 | Afropop |
| A07-03 | Davido | Fall | 2017 | Afrobeats |
| A07-04 | Burna Boy | Ye | 2018 | Afro-fusion |
| A07-05 | Yemi Alade | Johnny | 2013/14 | Afropop |

**08 GLOBAL**

| no. | artist | title | date | style |
|---|---|---|---|---|
| A08-01 ★ | Wizkid ft. Tems | Essence | 2020 | Afro-R&B / Afrobeats |
| A08-02 | Tems | Free Mind | 2020 | Alternative R&B |
| A08-03 | Rema | Calm Down | 2022 | Afropop |
| A08-04 | Asake | Sungba | 2022 | Street-pop / Afropiano |
| A08-05 | Ayra Starr | Rush | 2022 | Afropop |

## 4. Track content schema

The existing `Track` was extended (no second model). Runtime objects (Web Audio nodes, three.js textures) never
live in track data.

| field | meaning |
|---|---|
| `id` | stable, path-safe, unique |
| `eraId` | the era whose playlist holds it |
| `contentType` | `RECORDING` · `ARTIST_REFERENCE` · `TRADITION_REFERENCE` (§5) |
| `hero` | `true` only for the era's default record (exactly one, first) |
| `catalogueNumber` | `A<era>-<position>` (§9) |
| `artist` | performer; `null` for a tradition reference |
| `tradition` | tradition references only: e.g. `Yorùbá` |
| `title` | recording title / reference name |
| `year` | confirmed year or `null` — never guessed |
| `yearLabel` | approximate / qualified date wording: `1930s`, `2013/14`, `1982 international release` |
| `genre` | style |
| `historicalNote` | the **significance line**: 1–2 short sentences, ≤ 240 characters |
| `location` | scene / region, only where supported (Lagos, Ajegunle, Eastern Nigeria, Benin / Edo, Southwest / Northern Nigeria) |
| `musicalDNA` | one short continuity line where useful, e.g. `Highlife + Jazz + Funk → Afrobeat` |
| `audioAvailability`, `audioUrl` | explicit playback state (§6) |
| `coverUrl`, `vinylLabelUrl`, `sleeveBackUrl` | supplied artwork; `null` until supplied (§8) |
| `status` | `draft` for every entry until editorially verified |
| `sources`, `rights`, `durationSeconds` | optional; none supplied yet |

## 5. ROOTS — tradition references

ROOTS predates commercial recording in Nigeria, so its five entries are **listening references to traditions**,
not records: `contentType: "TRADITION_REFERENCE"`, `artist: null`, `tradition: "Yorùbá" | "Hausa"`, no `year`,
no `yearLabel` (the validator rejects a release year or an artist on a tradition). The visitor sees:

> DÙNDÚN / TALKING DRUM · *Yorùbá musical tradition* · *Listening reference* · TALKING DRUM

— never "Artist: Traditional" or "1905". `ARTIST_REFERENCE` applies the same honesty to RECORDING-era entries whose
single title / date is not confirmed (Ayinde Bakare — Early Jùjú Recordings; G.T. Onwuka — Palm-wine Recordings):
shown as a listening reference with the date range only. All wording comes from `describeTrack()`.

## 6. Audio availability

Catalogue presence and playable audio are separate: every entry is a valid museum entry whatever its audio state.
No licensed recordings are supplied yet, so all 40 entries are **`pending`** with `audioUrl: null`. A local
**development tone** stands in for each (`npm run audio:dev`; variants A–E by catalogue position, so each entry
sounds different), which keeps the turntables, the spatial mix and the record change running with real buffers.
The visitor sees "Archive audio pending" — never "development tone". When a licensed file arrives: set `audioUrl`
and `audioAvailability: "available"` (or `preview`). `unavailable` entries stay in the archive and never play.
Nothing is downloaded or fetched from streaming services (CLAUDE.md §4).

## 7. Development fixtures

`devFixtures.ts` keeps the mechanical test records (two per era, `DEV PLACEHOLDER`, known tones and artwork). They are
**never in the production archive** (validator: `production-fixture`). Record sets (`recordSets.ts`):

| set | playlists | where |
|---|---|---|
| `archive` | the 40 entries (5 per era) | default; the only set in production builds |
| `dev` | each era's hero + its two fixtures (the 3-record set the mechanics were tuned with) | development: `?records=dev`; Node: `ARCHIVE_RECORDS=dev` |

Tests that deliberately break or remove audio use fixtures: `audio.test.ts` runs on the `dev` set (it imports
`useDevRecordSet.ts` first and asserts it); `recordChange.test.ts` runs on the archive and feeds fixture playlists
through the controller's `playlist` port for its failure cases.

## 8. Artwork fallback

No album artwork is supplied, and none is fetched. Every entry gets **generated museum fallback art**
(`npm run artwork:archive` → `public/textures/archive/<era>/<track>--{sleeve,label}.webp`, 80 files, ≈1.9 MB):

- one composition for all 40: ARCHIVE header, era line, large catalogue number, title (serif), artist / tradition,
  date · style, position "n / 5";
- variation from data only: era → palette (`ERA_ART_TOKENS`), genre → background pattern (rings, bands, dots,
  diagonals, arcs, waves; tradition cards use drum-head rings or sound waves), track id → pattern parameters;
- labels: circular, catalogue number, artist / tradition, title, date · style, era — no paragraphs;
- 512 × 512 WebP each (≈1.4 MB decoded per texture with mipmaps).

Resolution per part (`recordArtworkCatalog.ts`): supplied file → generated archive art → the model's neutral
placeholder. The sleeve back has no generated art (supplied or neutral). Fixtures keep their "DEVELOPMENT RECORD" art.

## 9. Catalogue numbers

`A<era 01–08>-<position 01–05>`: `A01-01` … `A08-05`. Stored explicitly on each entry and checked against era and
position (`catalogue-number` rule), so a reordering is caught rather than silently renumbered. Shown to the visitor
(focus label, sleeve, label); internal ids are never shown.

## 10. Validation

`validateArchive` (generic rules — CONTENT_PIPELINE.md §10, plus `content-type`, `tradition-reference`, `hero-flag`,
`catalogue-number`, `significance`, `year-label`) and `validateProductionArchive` (8 eras in order, 5 per era, 40 total,
no fixtures, catalogue number + significance on every entry, ROOTS = tradition references). Both report and never
repair. Run by `npm test` and `npm run check:content` (which also checks that every artwork and tone file exists and
prints the catalogue).

## 11. How to add or change an archive entry

1. Edit the entry in `src/data/tracks.ts` (keep 5 per era; the hero stays entry 1 — `HERO_TRACK_IDS`). Changing the
   order means updating the catalogue numbers of the moved entries.
2. Content rules: confirmed facts only; unknown year → `null`; approximate → `yearLabel`; significance 1–2 sentences;
   `location` / `musicalDNA` only when supported; `status: "draft"` until verified (`verified` after review).
3. Assets: licensed audio → `audioUrl` + `audioAvailability` (CONTENT_PIPELINE.md §5); supplied artwork →
   `coverUrl` / `vinylLabelUrl` / `sleeveBackUrl` (CONTENT_PIPELINE.md §4).
4. Regenerate derived files when titles / ids / dates / order change: `npm run artwork:archive -- <trackId> …` (only
   the affected entries' fallback art; without ids it rebuilds all 80, deterministically) and, for a new id,
   `npm run audio:dev` (its development tone). Delete the art and tone files of a removed id.
5. `npm run check` (types, lint, tests, content). Then look at the entry in focus view (label, sleeve, overlay text).

## 12. Editorial policy and open notes

**Policy for significance lines** (all 40 remain `draft` until verified against sources):

- describe what is historically supported and what can reasonably be heard in the music;
- no unsupported superlatives — no "first ever", "invented", "creator of", "biggest", "greatest", "most successful"
  unless separately verified (a test rejects these words);
- exact chart claims only where confirmed, and credited to the right version (Essence's No. 9 is credited to the chart
  run with the Justin Bieber remix; Calm Down's No. 3 to the Selena Gomez remix);
- genres are not credited to one person alone (Fuji: Barrister as a foundational figure; its roots in wéré / ajisari
  Yorùbá Muslim singing traditions);
- uncertainty is kept: approximate dates stay labels (1930s, 1930s–40s, 2013/14, 1982 international release); undated
  entries stay undated; ROOTS entries stay tradition references.
- An uncertain but not clearly wrong line is left as written, marked `draft`.

**Corrections applied (editorial correction pass):** Ace → Adewale Ayuba — Bubble (A05-02); Shake Bodi dated 1998;
Oliver Twist, Essence, Calm Down, Fuji Garbage and Ja Funmi reworded to the conservative wording above; light audit
softened four superlatives (Haruna Ishola "the leading voice" → "a leading voice"; Gongo Aso "one of the era's biggest
hits" → "a major Nigerian hit"; Johnny "one of the continent's most widely heard Nigerian voices" → "carried Yemi
Alade's name well beyond Nigeria"; Rush "one of the leading voices" → "one of a new generation of Nigerian pop voices").

**Open:**

- Dates still open (no reliable exact year supplied): Taxi Driver, Baby Jowo, Sawale, Jaguar Nana, Shakomo, Bubble,
  Diana, Monika, Mathematics. Approximate labels kept: Oba Oyinbo and Soja Idumota (1930s), Early Jùjú Recordings
  (1930s–40s), Palm-wine Recordings (1930s), Johnny (2013/14), Ja Funmi (1982 international release).
- Bubble's significance line is new and `draft`.
- Spelling / diacritics of "ajisari" (Fuji's roots) to confirm; written without tone marks rather than guessed.
