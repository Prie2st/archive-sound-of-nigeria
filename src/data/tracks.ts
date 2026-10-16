/**
 * THE PRODUCTION ARCHIVE — 8 eras × 5 entries = 40 (docs/ARCHIVE_CONTENT.md).
 *
 * The shortlist (entries, heroes, years / year labels, styles, ROOTS traditions) is the project
 * owner's curated selection. Rules kept here:
 *   - Order is explicit: each era's array IS its playlist; position n carries catalogue number
 *     "A<era>-0<n>"; the hero is position 1. Nothing is sorted at runtime.
 *   - Uncertainty is preserved: a year that is not confirmed is null; approximate dates go in
 *     `yearLabel` ("1930s"); nothing is rounded into an exact year.
 *   - ROOTS entries are TRADITION_REFERENCEs — listening references to traditions, with no artist and
 *     no release year — never presented as commercial records from 1900–1919.
 *   - `historicalNote` is the museum significance line (1–2 short sentences); `status: "draft"`
 *     until editorially verified. `location` / `musicalDNA` only where supported, otherwise absent.
 *   - Audio: owner-supplied local files are mapped explicitly in productionAudio.ts; entries without
 *     a supplied file stay "pending". Artwork: none supplied → generated museum fallback art
 *     (recordArtworkCatalog.ts). Never sourced from the internet (CLAUDE.md §4).
 *
 * Development fixtures live in devFixtures.ts; the active record set is chosen in recordSets.ts.
 */
import { ERA_IDS, type EraId, type Track } from "./types.ts";
import { PRODUCTION_AUDIO_URLS } from "./productionAudio.ts";

export const HERO_TRACK_IDS: Record<EraId, string> = {
  roots: "dundun-talking-drum",
  recording: "tunde-king-aronke-macaulay",
  highlife: "bobby-benson-taxi-driver",
  explosion: "fela-kuti-water-no-get-enemy",
  transition: "the-remedies-shakomo",
  naija: "2face-idibia-african-queen",
  afrobeats: "wizkid-ojuelegba",
  global: "wizkid-tems-essence",
};

type EntryFields = Pick<Track, "id" | "catalogueNumber" | "title" | "genre" | "historicalNote"> &
  Partial<Pick<Track, "artist" | "tradition" | "year" | "yearLabel" | "location" | "musicalDNA" | "contentType">>;

/** One archive entry with supplied audio when mapped, no supplied artwork, draft. */
const entry = (eraId: EraId, fields: EntryFields): Track => ({
  eraId,
  contentType: "RECORDING",
  hero: fields.id === HERO_TRACK_IDS[eraId],
  artist: null,
  year: null,
  status: "draft",
  audioUrl: PRODUCTION_AUDIO_URLS[fields.id] ?? null,
  audioAvailability: PRODUCTION_AUDIO_URLS[fields.id] ? "available" : "pending",
  coverUrl: null,
  vinylLabelUrl: null,
  ...fields,
});

/** A ROOTS listening reference to a tradition (no artist, no release year). */
const tradition = (fields: Omit<EntryFields, "artist" | "year" | "yearLabel" | "contentType"> & { tradition: string }): Track =>
  entry("roots", { ...fields, contentType: "TRADITION_REFERENCE" });

const ROOTS: readonly Track[] = [
  tradition({
    id: "dundun-talking-drum",
    catalogueNumber: "A01-01",
    title: "Dùndún / Talking Drum",
    tradition: "Yorùbá",
    genre: "Talking drum",
    location: "Southwest Nigeria",
    historicalNote: "The dùndún is the Yorùbá hourglass talking drum; squeezing its tension cords changes the pitch so it can imitate the tones of spoken Yorùbá.",
    musicalDNA: ["Talking drum → Jùjú, Fuji"],
  }),
  tradition({
    id: "bata-drumming",
    catalogueNumber: "A01-02",
    title: "Bàtá Drumming",
    tradition: "Yorùbá",
    genre: "Drum ensemble",
    location: "Southwest Nigeria",
    historicalNote: "Bàtá is a Yorùbá family of double-headed drums played in ensemble, historically associated with the worship of Ṣàngó.",
  }),
  tradition({
    id: "yoruba-oriki-praise-poetry",
    catalogueNumber: "A01-03",
    title: "Oríkì Praise Poetry",
    tradition: "Yorùbá",
    genre: "Praise poetry",
    location: "Southwest Nigeria",
    historicalNote: "Oríkì are Yorùbá praise poems that honour people, lineages, towns and deities through chanted epithets.",
    musicalDNA: ["Oríkì → praise singing in Jùjú and Fuji"],
  }),
  tradition({
    id: "hausa-kalangu-talking-drum",
    catalogueNumber: "A01-04",
    title: "Kalangu / Talking Drum",
    tradition: "Hausa",
    genre: "Talking drum",
    location: "Northern Nigeria",
    historicalNote: "The kalangu is the Hausa hourglass tension drum; like the dùndún, its pitch bends as the player squeezes it under the arm.",
  }),
  tradition({
    id: "kakaki-royal-trumpet-ensemble",
    catalogueNumber: "A01-05",
    title: "Kakaki Royal Trumpet Ensemble",
    tradition: "Hausa",
    genre: "Royal court music",
    location: "Northern Nigeria",
    historicalNote: "The kakaki is the long metal trumpet of the Hausa emirate courts, sounded to announce royalty at ceremonies and festivals.",
  }),
];

const RECORDING: readonly Track[] = [
  entry("recording", {
    id: "tunde-king-aronke-macaulay",
    catalogueNumber: "A02-01",
    artist: "Tunde King",
    title: "Aronke Macaulay",
    year: 1937,
    genre: "Jùjú",
    location: "Lagos",
    historicalNote: "This recording captures foundational jùjú as guitar and urban Lagos culture began reshaping Yorùbá popular music.",
    musicalDNA: ["Yorùbá percussion → Jùjú"],
  }),
  entry("recording", {
    id: "tunde-king-oba-oyinbo",
    catalogueNumber: "A02-02",
    artist: "Tunde King",
    title: "Oba Oyinbo",
    yearLabel: "1930s",
    genre: "Jùjú",
    location: "Lagos",
    historicalNote: "One of Tunde King's 1930s jùjú recordings, from the first generation of Nigerian music made to be sold on disc.",
  }),
  entry("recording", {
    id: "irewolede-denge-orin-asape-eko",
    catalogueNumber: "A02-03",
    artist: "Irewolede Denge",
    title: "Orin Asape Eko",
    genre: "Unconfirmed",
    historicalNote: "Historical context for this supplied recording is pending editorial verification.",
  }),
  entry("recording", {
    id: "ayinde-bakare-early-juju-recordings",
    catalogueNumber: "A02-04",
    contentType: "ARTIST_REFERENCE",
    artist: "Ayinde Bakare",
    title: "Early Jùjú Recordings",
    yearLabel: "1930s–40s",
    genre: "Jùjú",
    location: "Lagos",
    historicalNote: "A listening reference to Ayinde Bakare's early recordings, which carried jùjú forward from its first generation.",
  }),
  entry("recording", {
    id: "gt-onwuka-palm-wine-recordings",
    catalogueNumber: "A02-05",
    contentType: "ARTIST_REFERENCE",
    artist: "G.T. Onwuka",
    title: "Palm-wine Recordings",
    yearLabel: "1930s",
    genre: "Palm-wine",
    historicalNote: "Palm-wine guitar music — acoustic, informal and coastal — fed both jùjú and highlife; this reference represents G.T. Onwuka's recordings of the style.",
    musicalDNA: ["Palm-wine guitar → Highlife, Jùjú"],
  }),
];

const HIGHLIFE: readonly Track[] = [
  entry("highlife", {
    id: "bobby-benson-taxi-driver",
    catalogueNumber: "A03-01",
    artist: "Bobby Benson",
    title: "Taxi Driver",
    genre: "Highlife",
    location: "Lagos",
    historicalNote: "Bobby Benson was a central figure of Lagos highlife and dance-band music.",
    musicalDNA: ["Dance-band jazz + West African rhythm → Highlife"],
  }),
  entry("highlife", {
    id: "victor-olaiya-baby-jowo",
    catalogueNumber: "A03-02",
    artist: "Victor Olaiya",
    title: "Baby Jowo",
    genre: "Highlife",
    location: "Lagos",
    historicalNote: "Victor Olaiya's dance-band highlife was part of the soundtrack of Lagos nightlife around independence.",
  }),
  entry("highlife", {
    id: "rex-lawson-sawale",
    catalogueNumber: "A03-03",
    artist: "Cardinal Rex Lawson",
    title: "Sawale",
    genre: "Highlife",
    location: "Eastern Nigeria",
    historicalNote: "Rex Lawson's highlife carried the sound of Eastern Nigeria to a national audience.",
  }),
  entry("highlife", {
    id: "victor-uwaifo-joromi",
    catalogueNumber: "A03-04",
    artist: "Victor Uwaifo",
    title: "Joromi",
    year: 1965,
    genre: "Highlife / Edo",
    location: "Benin / Edo",
    historicalNote: "Victor Uwaifo built Joromi on Edo rhythm and folklore, showing that highlife could speak in a regional voice.",
    musicalDNA: ["Edo rhythm + guitar highlife"],
  }),
  entry("highlife", {
    id: "orlando-julius-jaguar-nana",
    catalogueNumber: "A03-05",
    artist: "Orlando Julius",
    title: "Jaguar Nana",
    genre: "Afro-highlife",
    historicalNote: "Orlando Julius blended highlife with soul and jazz horns — one of the bridges toward the Afrobeat of the next era.",
    musicalDNA: ["Highlife + Soul + Jazz"],
  }),
];

const EXPLOSION: readonly Track[] = [
  entry("explosion", {
    id: "fela-kuti-water-no-get-enemy",
    catalogueNumber: "A04-01",
    artist: "Fela Kuti",
    title: "Water No Get Enemy",
    year: 1975,
    genre: "Afrobeat",
    location: "Lagos",
    historicalNote: "From Fela Kuti's 1975 album Expensive Shit; Fela forged Afrobeat from highlife, jazz and funk.",
    musicalDNA: ["Highlife + Jazz + Funk → Afrobeat"],
  }),
  entry("explosion", {
    id: "king-sunny-ade-ja-funmi",
    catalogueNumber: "A04-02",
    artist: "King Sunny Adé",
    title: "Ja Funmi",
    year: 1982,
    yearLabel: "1982 international release",
    genre: "Jùjú",
    historicalNote: "From the 1982 album Juju Music, Ja Funmi demonstrates the layered guitars and percussion of modern Jùjú.",
    musicalDNA: ["Talking drum + electric guitars → modern Jùjú"],
  }),
  entry("explosion", {
    id: "haruna-ishola-oroki-social-club",
    catalogueNumber: "A04-03",
    artist: "Haruna Ishola",
    title: "Oroki Social Club",
    year: 1971,
    genre: "Apala",
    historicalNote: "Haruna Ishola was a leading voice of apala, a Yorùbá style built on talking drum and percussion.",
    musicalDNA: ["Yorùbá percussion → Apala"],
  }),
  entry("explosion", {
    id: "sikiru-ayinde-barrister-fuji-garbage",
    catalogueNumber: "A04-04",
    artist: "Sikiru Ayinde Barrister",
    title: "Fuji Garbage",
    year: 1988,
    genre: "Fuji",
    historicalNote: "Sikiru Ayinde Barrister is widely regarded as one of Fuji's foundational figures and is often described as the father of the genre. Fuji's roots run through wéré and ajisari, Yorùbá Muslim singing traditions.",
    musicalDNA: ["Wéré / ajisari singing + Yorùbá percussion → Fuji"],
  }),
  entry("explosion", {
    id: "majek-fashek-send-down-the-rain",
    catalogueNumber: "A04-05",
    artist: "Majek Fashek",
    title: "Send Down the Rain",
    year: 1988,
    genre: "Reggae",
    historicalNote: "Majek Fashek's breakthrough showed that reggae could carry a distinctly Nigerian voice.",
  }),
];

const TRANSITION: readonly Track[] = [
  entry("transition", {
    id: "the-remedies-shakomo",
    catalogueNumber: "A05-01",
    artist: "The Remedies",
    title: "Shakomo",
    genre: "Hip-Hop / Pop",
    historicalNote: "The Remedies were a late-1990s Nigerian group whose hits helped define a new youth pop sound.",
    musicalDNA: ["Hip-Hop + R&B + Nigerian languages → Naija Pop"],
  }),
  entry("transition", {
    id: "adewale-ayuba-bubble",
    catalogueNumber: "A05-02",
    artist: "Adewale Ayuba",
    title: "Bubble",
    genre: "Fuji",
    historicalNote: "Adewale Ayuba's Bubble carried fuji's percussion and Yorùbá vocal style onto 1990s dance floors.",
  }),
  entry("transition", {
    id: "daddy-showkey-diana",
    catalogueNumber: "A05-03",
    artist: "Daddy Showkey",
    title: "Diana",
    genre: "Ghetto / Dancehall",
    location: "Ajegunle",
    historicalNote: "Daddy Showkey's music came out of Ajegunle in Lagos, where dancehall was reworked into a Nigerian street sound.",
    musicalDNA: ["Dancehall + Ajegunle street culture"],
  }),
  entry("transition", {
    id: "junior-and-pretty-monika",
    catalogueNumber: "A05-04",
    artist: "Junior & Pretty",
    title: "Monika",
    genre: "Naija Hip-Hop",
    historicalNote: "One of the 1990s duos who helped bring rap into Nigerian popular music.",
  }),
  entry("transition", {
    id: "trybesmen-shake-bodi",
    catalogueNumber: "A05-05",
    artist: "Trybesmen",
    title: "Shake Bodi",
    year: 1998,
    genre: "Hip-Hop",
    historicalNote: "Trybesmen belonged to the generation that set hip-hop to Nigerian rhythm and language.",
  }),
];

const NAIJA: readonly Track[] = [
  entry("naija", {
    id: "2face-idibia-african-queen",
    catalogueNumber: "A06-01",
    artist: "2Face Idibia",
    title: "African Queen",
    year: 2004,
    genre: "Afropop / R&B",
    historicalNote: "From 2Face Idibia's 2004 debut album Face 2 Face — one of the records that helped turn Nigerian pop from a domestic youth culture into an international force.",
    musicalDNA: ["R&B + Afropop"],
  }),
  entry("naija", {
    id: "sound-sultan-mathematics",
    catalogueNumber: "A06-02",
    artist: "Sound Sultan",
    title: "Mathematics",
    genre: "Afropop",
    historicalNote: "Sound Sultan paired pop hooks with social commentary, a thread that runs through Nigerian music from Fela onward.",
  }),
  entry("naija", {
    id: "dbanj-why-me",
    catalogueNumber: "A06-03",
    artist: "D'banj",
    title: "Why Me",
    year: 2006,
    genre: "Afropop",
    historicalNote: "An early hit for D'banj and the Mo' Hits label, whose sound helped define 2000s Nigerian pop.",
  }),
  entry("naija", {
    id: "9ice-gongo-aso",
    catalogueNumber: "A06-04",
    artist: "9ice",
    title: "Gongo Aso",
    year: 2008,
    genre: "Afropop",
    historicalNote: "9ice set Yorùbá wordplay and proverb to a pop beat; Gongo Aso became a major Nigerian hit.",
    musicalDNA: ["Yorùbá vocal tradition → Afropop"],
  }),
  entry("naija", {
    id: "wande-coal-bumper-to-bumper",
    catalogueNumber: "A06-05",
    artist: "Wande Coal",
    title: "Bumper to Bumper",
    year: 2009,
    genre: "Afropop",
    historicalNote: "From Wande Coal's 2009 debut album Mushin 2 Mo'Hits, on the threshold of the Afrobeats decade.",
  }),
];

const AFROBEATS: readonly Track[] = [
  entry("afrobeats", {
    id: "wizkid-ojuelegba",
    catalogueNumber: "A07-01",
    artist: "Wizkid",
    title: "Ojuelegba",
    year: 2014,
    genre: "Afrobeats",
    location: "Lagos",
    historicalNote: "From Wizkid's 2014 album Ayo, named after the Lagos neighbourhood of Ojuelegba; a 2015 remix with Drake and Skepta carried it far beyond Nigeria.",
    musicalDNA: ["Lagos street life → Afrobeats"],
  }),
  entry("afrobeats", {
    id: "dbanj-oliver-twist",
    catalogueNumber: "A07-02",
    artist: "D'banj",
    title: "Oliver Twist",
    year: 2012,
    genre: "Afropop",
    historicalNote: "An important early international crossover for Nigerian pop, peaking at No. 9 on the UK Official Singles Chart in 2012.",
  }),
  entry("afrobeats", {
    id: "davido-fall",
    catalogueNumber: "A07-03",
    artist: "Davido",
    title: "Fall",
    year: 2017,
    genre: "Afrobeats",
    historicalNote: "A slow-burning hit whose international audience kept growing years after its release.",
  }),
  entry("afrobeats", {
    id: "burna-boy-ye",
    catalogueNumber: "A07-04",
    artist: "Burna Boy",
    title: "Ye",
    year: 2018,
    genre: "Afro-fusion",
    historicalNote: "From Burna Boy's 2018 album Outside; his Afro-fusion mixes Afrobeats with dancehall, reggae and hip-hop.",
    musicalDNA: ["Afrobeats + Dancehall + Hip-Hop → Afro-fusion"],
  }),
  entry("afrobeats", {
    id: "yemi-alade-johnny",
    catalogueNumber: "A07-05",
    artist: "Yemi Alade",
    title: "Johnny",
    yearLabel: "2013/14",
    genre: "Afropop",
    historicalNote: "Johnny became a hit across Africa and carried Yemi Alade's name well beyond Nigeria.",
  }),
];

const GLOBAL: readonly Track[] = [
  entry("global", {
    id: "wizkid-tems-essence",
    catalogueNumber: "A08-01",
    artist: "Wizkid ft. Tems",
    title: "Essence",
    year: 2020,
    genre: "Afro-R&B / Afrobeats",
    historicalNote: "One of the defining international Nigerian records of the era. With the Justin Bieber remix contributing to its chart run, Essence reached No. 9 on the US Billboard Hot 100.",
    musicalDNA: ["Afrobeats + R&B"],
  }),
  entry("global", {
    id: "tems-free-mind",
    catalogueNumber: "A08-02",
    artist: "Tems",
    title: "Free Mind",
    year: 2020,
    genre: "Alternative R&B",
    location: "Lagos",
    historicalNote: "From Tems's 2020 debut EP For Broken Ears — Lagos alternative R&B that found a worldwide audience.",
  }),
  entry("global", {
    id: "rema-calm-down",
    catalogueNumber: "A08-03",
    artist: "Rema",
    title: "Calm Down",
    year: 2022,
    genre: "Afropop",
    historicalNote: "The Selena Gomez remix became a major global hit, reaching No. 3 on the US Billboard Hot 100.",
  }),
  entry("global", {
    id: "asake-sungba",
    catalogueNumber: "A08-04",
    artist: "Asake",
    title: "Sungba",
    year: 2022,
    genre: "Street-pop / Afropiano",
    historicalNote: "Asake's street-pop draws on fuji and Yorùbá vocal traditions over the log-drum grooves of amapiano.",
    musicalDNA: ["Fuji / Yorùbá vocal traditions → Street-pop"],
  }),
  entry("global", {
    id: "ayra-starr-rush",
    catalogueNumber: "A08-05",
    artist: "Ayra Starr",
    title: "Rush",
    year: 2022,
    genre: "Afropop",
    historicalNote: "Rush brought Ayra Starr, one of a new generation of Nigerian pop voices, to a worldwide audience.",
  }),
];

/** The production archive per era: exactly five entries, hero first, in catalogue order. */
export const ARCHIVE_TRACKS_BY_ERA: Readonly<Record<EraId, readonly Track[]>> = {
  roots: ROOTS,
  recording: RECORDING,
  highlife: HIGHLIFE,
  explosion: EXPLOSION,
  transition: TRANSITION,
  naija: NAIJA,
  afrobeats: AFROBEATS,
  global: GLOBAL,
};

/** All 40 archive entries in era, then catalogue order. */
export const ARCHIVE_ENTRIES: readonly Track[] = ERA_IDS.flatMap((eraId) => ARCHIVE_TRACKS_BY_ERA[eraId]);
