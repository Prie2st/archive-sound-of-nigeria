# Homepage / prologue: the history of Nigerian music, 1900 → 2026

The page before the museum: a deliberate loading moment, then a scroll-led editorial history of **what changed
Nigerian music, when it changed, and why it mattered**. It ends by inviting the visitor in: ENTER ARCHIVE.
ENTER ARCHIVE stays fixed and available the whole time. The museum systems (camera, hall, stations, desk,
decks, record change, audio engine, focus, era worlds, quality tiers) are untouched; this layer only sits in front
of them. (Replaced the static intro, FINAL_UI.md §1; redesigned 2026-10-16 from an era summary into the turning
points below; laid out 2026-10-18 to the Figma homepage frame "ARCHIVE — Intro / Home" → "02 · Homepage story — 1440",
node 46:60, with every earlier animation kept.)

## 1. Files

| file | role |
|---|---|
| `src/content/homeStory.ts` | all copy, the beat sequence (`BEATS`), indicator labels (`CHAPTERS`), cited archive records, media placement (pure TS) |
| `src/content/homeMedia.ts` | the image mapping, one entry per image: what it proves, its source, its placeholder card (pure TS) |
| `src/content/homeStory.test.ts` | 14 tests (see §10) |
| `src/ui/prologue/chapters.tsx` | 23 compositions, one component per beat |
| `src/ui/prologue/parts.tsx` | `Display` (authored lines, optional flush-right `end`), `Accents` (`*word*` → accent), `Media` (image, designed image + overlay words, or archive card), `RecordIndex`, `WordList`, `Reveal`, `Micro` |
| `src/ui/prologue/prologue.css` | the shell: tokens, grid, type system, archive card, ENTER ARCHIVE, loader, reveals, exit |
| `src/ui/prologue/home.css` | grounds (themes), the 23 compositions, scroll-driven detail, phone and mid-width recompositions |
| `src/ui/prologue/Prologue.tsx` | orchestrator: readiness, phases, observers, ENTER ARCHIVE |
| `src/ui/prologue/Loader.tsx` | the loading screen: count, rising panel, cycling icons, letter outro (§2) |
| `src/app/fonts.ts`, `src/app/layout.tsx` | OJUJU through `next/font/google` (`--font-ojuju`) |
| `src/scene/MuseumCanvas.tsx`, `src/app/globals.css` | (earlier milestone) Prologue mount, fixed `museum-stage`, `frameloop` on demand while covered |
| removed | `src/content/introStory.ts`, `introMedia.ts`, `introStory.test.ts` (the era-summary story) |

## 2. Phases, loading, the shell (unchanged by the redesign)

- **Phases.** `loading → opening → story → leaving`, derived from state.
  - **loading**: the museum loads behind the loader.
  - **opening**: the archive is ready and OJUJU has loaded. `html.archive-prologue` switches on native document
    scroll, the loader lifts like a shutter (0.95 s clip-path) and the title rises.
  - **story**: the museum underneath draws only on demand.
  - **leaving**: ENTER ARCHIVE → `startArchiveSound(audio)` → the museum draws again and the HUD appears → the
    story fades (0.95 s; 0.25 s with reduced motion) → unmount.
- **Loading screen** (`Loader.tsx`; Figma "ARCHIVE — Intro / Home", node 46:39; redesigned 2026-10-18):
  - **Layout.** Cream `#efe7da` screen. The ARCHIVE wordmark (`public/brand/archive-wordmark.svg`) sits
    top-left. An instrument icon cycles in the centre: trumpet, guitar, shaker, djembe, conga, crossfading every 0.6 s, from
    `design/icons` → `public/icons/loader/` at native sizes. A large OJUJU 650 counter sits bottom-right, 150 px
    at 1440.
  - **Count.** The counter runs 00 → 100 and an ink `#0d0c0b` panel rises with it. Whatever the panel covers
    turns cream: a second copy of the layout is clipped to the panel, and the graphics are the SVGs used as CSS
    masks.
  - **What drives it.** Loading the museum blocks the main thread for seconds at a time, so nothing in the
    loader moves on it; everything runs on the compositor:
    - The panel is moved by Web Animations on `transform`: the panel slides up while its content slides down.
    - Each digit is an odometer strip (fixed 0.59 em cells, because OJUJU has no tabular figures). Stepped
      `transform` animations move the strips, with change times taken from the panel's own easing curve.
    - The icons and letters are CSS opacity animations.
  - **Timing.** Phase A runs 0 → 94 over 4.2 s and waits there. Once the archive is ready, phase B goes from
    wherever A is to 100, never finishing before 2.8 s in total. JavaScript only starts the runs and notices the
    end; a slow timer covers hidden pages.
  - **Outro.** At 100 the count holds, it and the icon fade, and THE SOUND OF NIGERIA arrives letter by letter
    (55 ms stagger) on the full ink screen. Then the existing shutter lift opens the story (about 2.2 s after
    100). The motion reference was the owner's loader video.
  - **Readiness.** Unchanged from the old intro: files done + scene probe + two frames, a 6 s grace, a 30 s
    maximum, plus OJUJU.
  - **Reduced motion.** Icons change every 1.2 s with no scale, and the letters appear together.
- **Favicon.** The same five instruments as tab-icon frames: cream on an ink tile, generated by
  `npm run favicons` (`scripts/build-favicons.mjs` → `public/icons/favicon/`, 64 px PNG + SVG, plus a 180 px
  `apple-touch-icon.png`). The metadata declares the trumpet; `src/ui/AnimatedFavicon.tsx` (mounted in the root layout)
  swaps the icon every 1.2 s, site-wide, and stays still with reduced motion.
- **No per-frame JS.** IntersectionObservers toggle `.is-in` (reveals), the chapter tone and GLOBAL's steps.

## 3. OJUJU and the type system

- **The face.** OJUJU (variable 200–800, latin + latin-ext) is self-hosted by next/font at build time. It is used
  for display only: titles, statements, years, lineages, the thesis, figures. Body, captions, credits, buttons and
  labels use the existing sans.
- **Measured glyphs.** Cap height 0.70 em, accented caps 0.87 em, average capital 0.60 em wide.
- **Weight carries the history.** 200–300 for archival and reflective beats; 700–800 only where it gets loud
  (EVERYTHING EXPLODES, FESTAC, KENNIS MUSIC, NAIJA., AFROBEAT).
- **Scale and spacing.** Tokens `--t-title / mega / display / headline / statement / sub / body / micro`, with
  their own phone values. Tracking runs from −0.06em (giant years) to +0.14em (micro capitals), with leading 0.78–0.95
  on display type and kerning on throughout.
- **Authored line breaks.** Every display line is one data entry; ` | ` marks the extra break phones take. Each
  line sits in a vertical-only mask taller than its box, so accents and the rise are never clipped.

## 4. The story: 23 beats, about 10 movements

Each beat answers *what changed Nigerian music here?* Order, years and eras are tested.

| # | beat | ground | what changed | composition / evidence | motion |
|---|---|---|---|---|---|
| 0 | Opening | night | — | ARCHIVE wordmark top-left, ENTER ARCHIVE top-right · 1900 — 2026 · 126 YEARS OF / *RHYTHM,* / REINVENTION / AND INFLUENCE. · THE SOUND / OF NIGERIA low | shutter, title rise, hand-over drift |
| 1 | Systems | earth | systems before an industry | headline across 11 cols; **talking drum pinned** (sticky) beside scrolling evidence (Yorùbá / Yorùbá / Hausa / Igbo · Edo · Efik · Ibibio); narrow **kakaki** slice; **1914 as a margin note** + "still no single Nigerian sound" | list stagger, kakaki parallax ±5vh |
| 2 | 1922 | paper | sound leaves the performance space | oversized 1922 · **shellac / 78 rpm** disc · Ransome-Kuti line (conservative) · RECORDED / REPRODUCED / SOLD / REPLAYED / CIRCULATED · PERFORMANCE → RECORD → STAR → POPULAR SONG → AUDIENCE across the full width | year fade, chain stagger |
| 3 | The city | paper | Lagos localises outside influences → jùjú | archival strip **CITY → MEDIUM → RECORD** (Lagos / Royal Cinema → shellac → Tunde King sleeve) | mask reveals |
| 4 | 1937 | sepia | a recognisable urban popular music | the **Tunde King cover** large (artist and title set on it) · 1937 · TUNDE KING / ARONKE MACAULAY · key line | — |
| 5 | Highlife | green | urban, professional, cosmopolitan | names (archive records) · GUITARS / HORNS / JAZZ / DANCE-BAND ARRANGEMENTS / LOCAL LANGUAGES | — |
| 6 | 1960 | green | independence; highlife tied to its optimism | **near full-screen independence image** (only here) · 1960 / 1 OCTOBER · NIGERIA / BECOMES / INDEPENDENT. · A NEW COUNTRY / FINDS A MODERN SOUND. | slow settle 1.06 → 1 |
| 7 | 1967 | night | war fractures the market | 1967 · THE COUNTRY / FRACTURES. … · regions LAGOS → JÙJÚ · EASTERN NIGERIA → HIGHLIFE · MIDWEST → HIGHLIFE / REGIONAL FORMS (typographic, no war imagery) | regions **move apart** |
| 8 | Explosion | red | no single dominant sound | NIGERIA STOPS / HAVING ONE / DOMINANT / POPULAR SOUND. · EVERYTHING / EXPLODES. above an authored field of 8 genres (Figma positions; the field scales with the width) | genre drift |
| 9 | Afrobeat | red | one branch: Afrobeat | **Fela image here only** · FELA / KUTI · HIGHLIFE + JAZZ + FUNK + AFRICAN POLYRHYTHM + POLITICAL RESISTANCE → AFROBEAT · "one branch … not the whole of it" | — |
| 10 | Modernities | forest | many modernities at once | three columns: **JÙJÚ** (King Sunny Adé image · KSA, Ebenezer Obey · traits) · **FUJI** (WÉRÉ / AJISARI ↓ FUJI · Barrister, Kollington) · **APALA** (Oroki Social Club sleeve · Haruna Ishola) · THERE WAS / NO SINGLE SOUND / OF NIGERIA. / THAT WAS / THE POINT. | — |
| 11 | FESTAC ’77 | night | Lagos as a stage for the Black world | 1977 / FESTAC · headline · **large festival image** | clip opens 30 % → full |
| 12 | Local sound | paper | local sound could be popular sound | **sleeves, not later photos**: Ja Funmi · Fuji Garbage · Send Down the Rain | — |
| 13 | Youth | CRT | rap becomes Nigerian | question headline · **cassette + VHS** (circulation) · imports (HIP-HOP, R&B, NEW JACK SWING, DANCEHALL, GLOBAL POP) · localisation vocabulary · THE QUESTION WAS NO LONGER: CAN NIGERIANS RAP? / IT WAS: WHAT DOES NIGERIAN RAP SOUND LIKE? · 5 archive records | — |
| 14 | 1998 | violet | an industrial machine for youth music | 1998 / KENNIS MUSIC · headline · approved body · "the late-1990s youth-pop generation included …" (typography, no forced imagery) | — |
| 15 | Naija | chrome | hybridisation as the innovation | NAIJA. edge to edge · equation HIP-HOP + R&B + … · PERMISSION TO COMBINE EVERYTHING · **Nokia 3310 + CD** (circulation) · 5 sleeves · key line | — |
| 16 | Digital | plum | distribution shrinks distance | channels · body · route **LAGOS → YOUTUBE / STREAMING / SOCIAL → LONDON / ACCRA / NEW YORK / GLOBAL AUDIENCES**, spread across the width with arrows | — |
| 17 | Afrobeats | plum | Afrobeat ≠ Afrobeats; global reach, Lagos roots | AFROBEAT ≠ AFROBEATS + definitions · **Wizkid 2013** · 5 archive records · **Nativeland, Lagos 2016** | — |
| 18 | 2016 | black | (short) deeper mainstream visibility | THE WORLD / STARTS LISTENING. · **One Dance cover** · 2016 · WIZKID + DRAKE · ONE DANCE · conservative line | — |
| 19 | 2020 | black | crossover stops looking accidental | 2020 · **Essence sleeve** · key line | — |
| 20 | Global | steel | already part of global pop; an ecosystem | **sticky stage** (Tems, international) with the headline arriving line by line · 11 names · genre field · "ecosystem" line · **Ayra Starr in Lagos** · GLOBAL / DOES NOT MEAN / ROOTLESS. | step sequence, stage settle |
| 21 | The thread | night | the past keeps returning | THE NEW SOUND / IS NEVER / ENTIRELY NEW. · 4 lineages · the sentence in 3 lines with accents · **only now** TRADITION ↓ ADAPTATION ↓ LOCALISATION ↓ EXPORTATION, on a diagonal | thesis words 320 ms apart |
| 22 | Finale | night | — | 8 ERAS · 40 RECORDS · 126 YEARS (from data) · THE STORY IS / NOT FINISHED. · LISTEN TO IT. · the outlined ARCHIVE wordmark, cropped by the end of the page | — |

**Length:** about 32 screens at 1440 × 900 (the Figma frame is 30,144 px) and about 34 at 390 × 844. That is about 60–70 s to skim and 2–3 min to
read. Section rhythm tokens: `--space-section` clamp(64px, 8vh, 110px), `--space-2xl` clamp(56px, 6.2vw, 104px).

## 5. Images: the central mapping (`src/content/homeMedia.ts`)

`{ id, era, role, proves, src, placeholderSrc, label, placeholder, alt, caption, credit, source, license,
objectPosition, aspectRatio, status: "placeholder" | "final" }`

- **`role`** is what the image does in the story: `evidence | object | archive | context | performance`.
- **`proves`** is the sentence the image supports (required by the tests).
- **`label`** is the internal slot name, e.g. `FESTAC ’77 DURBAR / FESTIVAL — ARCHIVE IMAGE`. It is a data
  attribute on the figure.
- **`placeholder`** is the archive card's text.

**Designed images (2026-10-18).** Every slot now has the image the Figma design shows, exported to
`public/images/home/<id>.webp` and set as `placeholderSrc`. Their credits and licences are unknown, so every entry
stays `status: "placeholder"` with the pending credit: they are shown, but they are not cleared for release.
- **Overlay words.** Where the design sets words on a photograph, `overlay: { ink, scrim? }` in the data gives their
  colour (and an optional scrim) and the card's title / place / year / kind are drawn over the image
  (`.pro-media__over`, the card's type with no inner frame). The 1922 disc keeps a round inner ring.
- **Sleeves** show the supplied cover art; the 1937 cover carries TUNDE KING / Aronke Macaulay in OJUJU (`SleeveType`).

**Placeholder treatment (no file).** Nothing is a grey box: a pending image without a file renders as an
**archive card** in its final aspect ratio and crop.
- The card carries: IMAGE PENDING · a large title in OJUJU · place · year · kind (e.g. LAGOS · 1977 · ARCHIVE
  PHOTOGRAPH).
- A small crosshair marks the `objectPosition`, so the crop is already composed.
- Paper cards sit on dark grounds and ink cards on light grounds.
- Such captions read "Archive image pending". The internal "PLACEHOLDER — replace…" credit appears only in the data.

**Replacing an image (data only).**
1. Put the licensed file at `public/images/home/<id>.webp`, about 2× the largest rendered width: full-bleed
   (independence, FESTAC, Tems stage) ≈ 2800 px wide; column images ≈ 1400 px.
2. Set `src: "/images/home/<id>.webp"`, `status: "final"`, the true `alt` / `caption`, and `credit` / `source` /
   `license` (unknown fields stay ""; nothing is invented).
3. Adjust `objectPosition` to the subject.
4. Run `npm test`; the tests require final images to be local, to exist on disk, and to carry a real credit.

Final images render through `next/image` (lazy, `sizes` per slot, object-fit cover). Nothing is preloaded.

The homepage no longer lists image credits (removed 2026-10-18 at the owner's request). Credits stay in the data
(`credit` / `source` / `license`) for whatever surface publishes them.

## 6. ENTER ARCHIVE and the bottom blur

- **Bottom blur.** A band fixed to the bottom of the screen for the whole story: a 13.25 px backdrop blur, no tint,
  122 px on a 900 px screen (`clamp(72px, 13.6svh, 140px)`), masked so it fades in from its top edge. It sits under
  ENTER ARCHIVE, takes no pointer events, and fades out with the story when the visitor enters. (It replaces the
  darker Figma gradient band, which was removed.)

- **Placement.** Fixed top-right, on the page margin (64 px at 1440, as in the Figma), safe-area aware, 44 px
  minimum, the same size throughout. Its colours still follow each chapter's tone.
- **Keyboard.** It is the first Tab stop.
- **On click.** It uses the existing `startArchiveSound` (one AudioContext, unmute, play; failure still enters),
  and a second press is ignored.
- **Verified.** A real click from FESTAC gave: context running, `contextsCreated` 1, the prologue unmounted, scroll
  released, SOUND ON (status LOADING → the hero record decoding).

## 7. Motion

Restrained and varied: line rises on display type, list staggers, clip-mask reveals on images, and one idea per
beat where it carries meaning:
- the pinned talking drum;
- the kakaki parallax (±5vh);
- the 1960 settle;
- the regions separating in 1967;
- the genre drift;
- the FESTAC clip opening;
- the GLOBAL line-by-line stage;
- the thesis arriving word by word.

Scroll-driven effects are progressive (`@supports (animation-timeline: view())`) and run off the main thread.
**Reduced motion:** only opacity fades remain; no translations, masks, drift, parallax or separation. GLOBAL shows
all its lines and the thesis appears whole. All content and hierarchy are kept.

## 8. Phones (≤ 760 px) and mid widths

Six columns, recomposed rather than shrunk. Since 2026-10-19 the phone layout follows the mobile Figma
("ARCHIVE — Mobile Homepage", frame "FULL PAGE / Mobile homepage / 390 px", node 3:2). Section heights match it,
except GLOBAL, which keeps the scroll runway its line-by-line headline needs.
- the opening premise and years sit lower, in a 183 px column starting just left of centre;
- 1922: 44 px under the year, the caption right-aligned under the disc, each chain step ending with its ↓;
- the talking drum stops pinning, and the kakaki sits beside the lead;
- the city strip turns vertical with ↓, flush left (each item four columns);
- the independence headline is flush left;
- EXPLODES. is set flush right and each row of the genre cloud spreads across the width;
- THAT WAS / THE POINT. gets 40 px more space (the section keeps its height);
- the third local-sound sleeve returns to the left edge;
- in the digital route, the arrows sit under the middle of LAGOS;
- the Nativeland caption keeps the page margin;
- Essence: the sleeve sits under the year (no overlap), the key line 44 px after the credit, the section 830 px tall;
- the GLOBAL stage crops to Tems (object-position 20% 35%), with the answer line in cream over her;
- the thesis arrows follow the diagonal and LOCALISATION steps further across;
- the regions stack;
- the genre field becomes an in-flow cloud (no drift);
- EVERYTHING EXPLODES. comes before the genre cloud;
- the 1922 chain and the digital route stack, with ↓ arrows;
- the One Dance cover, credit and note stack;
- the footer wordmark shows whole, with room below it for the bottom blur (cropped under it, it would be smeared);
- the thesis steps diagonally;
- display shifts are capped at one column;
- the authored phone breaks apply.

0 overflowing elements at 390 × 844 and 1440 × 900. Between 761 and 1100 px the twelve columns stay, with the
tightest placements eased.

## 9. Content rules applied

- The supplied copy is used conservatively ("one of the early landmarks", "helped create", "one of the clearest
  signs").
- No dates, firsts or chart claims were added. Records are worded by the catalogue (`resolveRecord` →
  `describeTrack`).
- Artists outside the archive (Ebenezer Obey, Kollington Ayinla, the Kennis-era and current names) appear as
  names only.
- The Kennis beat says "the late-1990s youth-pop generation included …" and does not assert label signings.
- 1914 is context inside the systems beat, never a starting point.
- Fela imagery appears only in the Afrobeat beat; independence imagery only in 1960.
- **Open editorial checks:**
  - the Kennis-era names list (especially Plantashun Boiz);
  - "Eedris Abdulkareem" (the brief said "Eedris");
  - Burna Boy / Nativeland 2016 as captioned;
  - the 1922 Ransome-Kuti line;
  - "ajisari" diacritics.

## 10. Validation

`npm run check` (TypeScript, ESLint with no warnings, **302 tests**, content) · `npm run check:content` ·
`npm run build`: all pass.

The 14 homepage tests check:
- the turning points in historical order, with years 1922 / 1937 / 1960 / 1967 / 1977 / 1998 / 2016 / 2020;
- museum eras that never jump back;
- 1914 as context only;
- the thesis (ADAPTATION / EXPORTATION) appearing only at the end;
- the totals 8 / 40 / 126;
- display line limits (46 characters desktop, 20 per phone segment, accent markers balanced);
- diacritics, and forbidden claims ("first ever", "single-handedly", …);
- cited records belonging to their own era;
- every image placed, with complete fields;
- placeholders being null-src, with any designed file local and on disk;
- final images being local and existing, with a credit;
- Fela, independence and the 1937 sleeve used only where they belong.

Browser checks (fresh dev server with the real OJUJU, 1440 × 900 and 390 × 844): every beat inspected in
screenshots, overflow scans, and ENTER ARCHIVE from mid-story.

## 11. Images still to clear

All 27 slots are placeholders until their rights are confirmed (`status: "placeholder"` in `homeMedia.ts`). The 15
photographs:

- `roots-talking-drum`
- `roots-kakaki`
- `record-shellac`
- `lagos-city`
- `independence-1960`
- `fela-live`
- `sunny-ade-live`
- `festac-77`
- `cassette-vhs`
- `nokia-3310`
- `cd-disc`
- `wizkid-2013`
- `nativeland-2016`
- `tems-international`
- `ayra-starr-lagos`

…plus `one-dance-cover` and 11 record covers (A02-01, A04-02…05, A06-01…05, A08-01). The generated ARCHIVE
sleeves remain the museum's own artwork; the homepage no longer uses them.

**Flags from the design import:**
- No credits or licences came with the Figma images.
- `record-shellac` is a German Telefunken 78; its overlay still says "Early Nigerian recording", as designed. Replace
  the image or change the words.
- Low resolution for their slots: `tunde-king-cover` (303 × 400), `independence-1960` (1220 × 1638, shown
  full-bleed) and `festac-77` (1300 px wide).
