/**
 * The homepage story, 1900 → 2026 (docs/PROLOGUE.md): what changed Nigerian music, when, and why it mattered.
 * Words only — each beat's composition is art-directed in src/ui/prologue/chapters.tsx.
 *
 * Rules: conservative wording ("one of the early landmarks", "helped"); no invented dates, firsts or chart claims;
 * records are referenced by archive id and worded by `describeTrack`; artists outside the archive appear as names
 * only. Display lines are authored line by line (" | " = the extra break phones take; *…* = an accent run).
 *
 * Plain TypeScript (imported by Node tests): relative imports with ".ts", no enums.
 */
import { getEra } from "../data/eras.ts";
import { ARCHIVE_ENTRIES, ARCHIVE_TRACKS_BY_ERA } from "../data/tracks.ts";
import { describeTrack } from "../data/trackDisplay.ts";
import { ARCHIVE_THESIS, ERA_IDS, type EraId } from "../data/types.ts";

/** Display text, one entry per line as it breaks on screen; " | " marks the extra phone break, *…* an accent run. */
export type Lines = readonly string[];
export const MOBILE_BREAK = " | ";

export interface RecordRef {
  id: string;
  /** false leaves a long or qualified date out. */
  date?: boolean;
}

export interface ResolvedRecord {
  id: string;
  catalogueNumber: string | null;
  artist: string;
  title: string;
  date: string | null;
  genre: string;
}

export function resolveRecord(ref: RecordRef): ResolvedRecord {
  const track = ARCHIVE_ENTRIES.find((entry) => entry.id === ref.id);
  if (!track) throw new Error(`Homepage cites unknown archive record "${ref.id}"`);
  const display = describeTrack(track);
  return { id: track.id, catalogueNumber: display.catalogueNumber, artist: display.byline, title: display.title, date: ref.date === false ? null : display.date, genre: display.genre };
}

export const citesOwnEra = (era: EraId, ref: RecordRef): boolean => ARCHIVE_TRACKS_BY_ERA[era].some((track) => track.id === ref.id);
const refs = (...ids: readonly (string | RecordRef)[]): readonly RecordRef[] => ids.map((id) => (typeof id === "string" ? { id } : id));

// ---------------------------------------------------------------------------------------------------------------
// Beats, in story order. `era` ties a beat to the museum era it leads into (palette + indicator); `theme` is the
// ground the composition sits on.

export type BeatId =
  | "opening" | "systems" | "record1922" | "city" | "king1937" | "highlife" | "independence" | "war1967" | "explosion"
  | "afrobeat" | "modernities" | "festac" | "localsound" | "youth" | "kennis" | "naija" | "digital" | "afrobeats"
  | "onedance" | "essence" | "global" | "lineage" | "finale";

export type BeatTheme = "night" | "earth" | "paper" | "sepia" | "green" | "red" | "forest" | "crt" | "violet" | "chrome" | "plum" | "black" | "steel";

const LIGHT_THEMES: readonly BeatTheme[] = ["paper", "chrome"];

export interface BeatMeta {
  id: BeatId;
  era: EraId | null;
  theme: BeatTheme;
  /** Shown beside ENTER ARCHIVE with the era; null for the opening, the lineage and the finale. */
  year: string | null;
}

export const BEATS: readonly BeatMeta[] = [
  { id: "opening", era: null, theme: "night", year: null },
  { id: "systems", era: "roots", theme: "earth", year: null },
  { id: "record1922", era: "recording", theme: "paper", year: "1922" },
  { id: "city", era: "recording", theme: "paper", year: null },
  { id: "king1937", era: "recording", theme: "sepia", year: "1937" },
  { id: "highlife", era: "highlife", theme: "green", year: null },
  { id: "independence", era: "highlife", theme: "green", year: "1960" },
  { id: "war1967", era: "explosion", theme: "night", year: "1967" },
  { id: "explosion", era: "explosion", theme: "red", year: null },
  { id: "afrobeat", era: "explosion", theme: "red", year: null },
  { id: "modernities", era: "explosion", theme: "forest", year: null },
  { id: "festac", era: "explosion", theme: "night", year: "1977" },
  { id: "localsound", era: "explosion", theme: "paper", year: null },
  { id: "youth", era: "transition", theme: "crt", year: null },
  { id: "kennis", era: "transition", theme: "violet", year: "1998" },
  { id: "naija", era: "naija", theme: "chrome", year: null },
  { id: "digital", era: "afrobeats", theme: "plum", year: null },
  { id: "afrobeats", era: "afrobeats", theme: "plum", year: null },
  { id: "onedance", era: "afrobeats", theme: "black", year: "2016" },
  { id: "essence", era: "global", theme: "black", year: "2020" },
  { id: "global", era: "global", theme: "steel", year: null },
  { id: "lineage", era: null, theme: "night", year: null },
  { id: "finale", era: null, theme: "night", year: null },
];

/** The quiet indicator beside ENTER ARCHIVE. */
export interface ChapterMeta {
  id: BeatId;
  number: string | null;
  label: string;
  tone: "dark" | "light";
}

export const CHAPTERS: readonly ChapterMeta[] = BEATS.map((beat) => ({
  id: beat.id,
  number: beat.era ? String(getEra(beat.era).index + 1).padStart(2, "0") : null,
  label: beat.era ? [getEra(beat.era).title, beat.year].filter(Boolean).join(" · ") : beat.id === "lineage" ? "The thread" : "",
  tone: LIGHT_THEMES.includes(beat.theme) ? "light" : "dark",
}));

// ---------------------------------------------------------------------------------------------------------------
// Copy

export const OPENING = {
  title: ["The sound", "of Nigeria"] as Lines,
  years: "1900 — 2026",
  premise: ["126 years of", "*rhythm,*", "reinvention", "and influence."] as Lines,
} as const;

export const SYSTEMS = {
  headline: ["Before Nigeria", "had a music | industry,", "it already had", "musical systems."] as Lines,
  lead: "Long before commercial recording, communities across the territory that would become Nigeria already had complex musical systems.",
  systems: [
    { people: "Yorùbá", text: "Dùndún and bàtá drums could imitate speech patterns." },
    { people: "Yorùbá", text: "Oríkì praise poetry carried lineage, memory and praise." },
    { people: "Hausa", text: "Kalangu talking drums and kakaki trumpets served court, ceremony and public communication." },
    { people: "Igbo · Edo · Efik · Ibibio · and many more", text: "Music was embedded in ritual, labour, storytelling and community life." },
  ],
  context: {
    year: "1914",
    text: "The Northern and Southern Protectorates were amalgamated into the political entity that became modern Nigeria.",
    turn: "But there was still no single Nigerian sound.",
  },
  statement: ["Nigeria began", "the twentieth | century", "with many distinct", "musical traditions."] as Lines,
  media: { drum: "roots-talking-drum", kakaki: "roots-kakaki" },
} as const;

export const RECORD_1922 = {
  year: "1922",
  headline: ["Sound leaves", "the performance | space."] as Lines,
  body: [
    "One of the early landmarks of commercially recorded Nigerian music came when Rev. Josiah J. Ransome-Kuti recorded Yorùbá-language compositions in London.",
    "Recording changed the nature of music.",
  ] as Lines,
  verbsLead: "A performance could now be:",
  verbs: ["Recorded", "Reproduced", "Sold", "Replayed", "Circulated"] as Lines,
  chain: ["Performance", "Record", "Star", "Popular song", "Audience"] as Lines,
  media: "record-shellac",
} as const;

export const CITY = {
  headline: ["The city creates", "a new sound."] as Lines,
  body: [
    "As Lagos expanded, traditional Yorùbá musical forms encountered guitars, banjos, church music, drinking-house music and other urban influences.",
    "Palm-wine guitar styles circulated across West Africa.",
    "Jùjú emerged in Lagos through the localisation of those influences.",
    "Tunde King became one of its foundational figures.",
  ] as Lines,
  sequence: [
    { label: "City", media: "lagos-city" },
    { label: "Medium", media: "record-shellac" },
    { label: "Record", media: "sleeve-tunde-king-aronke-macaulay" },
  ],
} as const;

export const KING_1937 = {
  year: "1937",
  record: { id: "tunde-king-aronke-macaulay" } as RecordRef,
  keyLine: ["A recognisable | Nigerian urban", "popular music | was taking shape."] as Lines,
  media: "sleeve-tunde-king-aronke-macaulay",
} as const;

export const HIGHLIFE = {
  headline: ["Popular music", "becomes urban,", "professional", "and | cosmopolitan."] as Lines,
  body: ["After the Second World War, Nigerian cities expanded rapidly.", "Highlife became one of the dominant sounds of urban nightlife."] as Lines,
  records: refs("bobby-benson-taxi-driver", "victor-olaiya-baby-jowo", "rex-lawson-sawale", "victor-uwaifo-joromi", "orlando-julius-jaguar-nana"),
  ingredientsLead: "They combined African rhythms with",
  ingredients: ["Guitars", "Horns", "Jazz", "Dance-band arrangements", "Local languages"] as Lines,
} as const;

export const INDEPENDENCE = {
  year: "1960",
  date: "1 October",
  headline: ["Nigeria", "becomes", "independent."] as Lines,
  follow: ["A new country", "finds a | modern sound."] as Lines,
  body: "Highlife became closely associated with the optimism, nightlife and cosmopolitan identity of the independence period.",
  media: "independence-1960",
} as const;

export const WAR_1967 = {
  year: "1967",
  headline: ["The country", "fractures.", "So does its", "popular music."] as Lines,
  body: [
    "The Nigerian Civil War disrupted the popular-music landscape.",
    "Many eastern highlife musicians left Lagos during the conflict.",
    "Highlife lost its earlier position as something close to a shared national popular music.",
    "Jùjú expanded within the western market. Highlife remained strong in eastern and midwestern Nigeria.",
  ] as Lines,
  regions: [
    { place: "Lagos", sound: "Jùjú" },
    { place: "Eastern Nigeria", sound: "Highlife" },
    { place: "Midwest", sound: "Highlife / regional forms" },
  ],
} as const;

export const EXPLOSION = {
  headline: ["Nigeria stops", "having one", "dominant", "popular sound."] as Lines,
  burst: ["Everything", "explodes."] as Lines,
  body: ["Post-war Nigerian music diversified rapidly.", "Multiple strong genres existed simultaneously."] as Lines,
  genres: ["Afrobeat", "Jùjú", "Fuji", "Highlife", "Apala", "Reggae", "Funk", "Pop"] as Lines,
} as const;

export const AFROBEAT = {
  name: ["Fela Kuti"] as Lines,
  record: { id: "fela-kuti-water-no-get-enemy" } as RecordRef,
  dna: { inputs: ["Highlife", "Jazz", "Funk", "African polyrhythm", "Political resistance"] as Lines, result: "Afrobeat" },
  note: "Afrobeat was one branch of the expansion, not the whole of it.",
  media: "fela-live",
} as const;

export const MODERNITIES = {
  juju: {
    name: "Jùjú",
    artists: ["King Sunny Adé", "Ebenezer Obey"] as Lines,
    traits: ["Electric guitars.", "Talking drums.", "Layered percussion.", "Modern studio production."] as Lines,
    media: "sunny-ade-live",
  },
  fuji: { name: "Fuji", lineage: ["Wéré / ajisari", "Fuji"] as Lines, artists: ["Sikiru Ayinde Barrister", "Kollington Ayinla"] as Lines },
  apala: { name: "Apala", artists: ["Haruna Ishola"] as Lines, media: "sleeve-haruna-ishola-oroki-social-club" },
  keyLine: ["There was", "no single sound", "of Nigeria.", "That was", "the point."] as Lines,
} as const;

export const FESTAC = {
  year: "1977",
  name: "FESTAC",
  headline: ["Lagos becomes", "a stage for", "the Black world."] as Lines,
  body: [
    "The Second World Black and African Festival of Arts and Culture brought performers, artists and cultural figures from Africa and the African diaspora to Lagos.",
    "Lagos had become not only a Nigerian music centre but part of a much larger global Black cultural network.",
  ] as Lines,
  media: "festac-77",
} as const;

export const LOCAL_SOUND = {
  headline: ["Local sound | could be", "popular sound."] as Lines,
  records: refs({ id: "king-sunny-ade-ja-funmi", date: false }, "sikiru-ayinde-barrister-fuji-garbage", "majek-fashek-send-down-the-rain"),
  sleeves: ["sleeve-king-sunny-ade-ja-funmi", "sleeve-sikiru-ayinde-barrister-fuji-garbage", "sleeve-majek-fashek-send-down-the-rain"],
} as const;

export const YOUTH = {
  headline: ["What should", "Nigerian", "youth music", "sound like?"] as Lines,
  body: ["Fuji remained huge.", "Reggae and dancehall influenced urban music."] as Lines,
  consumingLead: "But younger Nigerian musicians were increasingly consuming",
  consuming: ["Hip-hop", "R&B", "New jack swing", "Dancehall", "Global pop"] as Lines,
  turn: "Instead of simply copying those forms, Nigerian musicians began localising them.",
  vocabulary: ["Pidgin", "Local accents", "Street language", "Nigerian stories", "Indigenous rhythms"] as Lines,
  question: ["The question was", "no longer:", "Can Nigerians rap?"] as Lines,
  answer: ["It was:", "What does | Nigerian", "rap sound like?"] as Lines,
  records: refs("the-remedies-shakomo", "junior-and-pretty-monika", "trybesmen-shake-bodi", "daddy-showkey-diana", "adewale-ayuba-bubble"),
  media: "cassette-vhs",
} as const;

export const KENNIS = {
  year: "1998",
  name: ["Kennis", "Music"] as Lines,
  headline: ["Nigerian | youth music", "gets an", "industrial machine."] as Lines,
  body: "The rise of Kennis and related late-1990s structures helped create a stronger commercial platform for Nigeria’s new youth-oriented pop and hip-hop generation.",
  generationLabel: "The late-1990s youth-pop generation included",
  generation: ["The Remedies", "Tony Tetuila", "Eedris Abdulkareem", "Plantashun Boiz"] as Lines,
} as const;

export const NAIJA = {
  word: "Naija.",
  headline: ["Nigerian pop", "no longer needed", "somebody | else’s genre."] as Lines,
  lead: "Artists increasingly mixed",
  mix: ["Hip-hop", "R&B", "Dancehall", "Highlife", "Pidgin", "Yorùbá / Igbo / local languages", "Nigerian rhythms"] as Lines,
  point: ["The innovation was not one new genre.", "It was permission to combine everything."] as Lines,
  records: refs("2face-idibia-african-queen", "sound-sultan-mathematics", "dbanj-why-me", "9ice-gongo-aso", "wande-coal-bumper-to-bumper"),
  sleeves: ["sleeve-2face-idibia-african-queen", "sleeve-sound-sultan-mathematics", "sleeve-dbanj-why-me", "sleeve-9ice-gongo-aso", "sleeve-wande-coal-bumper-to-bumper"],
  objects: ["nokia-3310", "cd-disc"],
  keyLine: ["The sound that | would later travel", "the world was being | built at home."] as Lines,
} as const;

export const DIGITAL = {
  headline: ["The distance | between", "Lagos and | the world", "shrinks."] as Lines,
  channels: ["YouTube.", "Blogs.", "Smartphones.", "Social media.", "Streaming."] as Lines,
  body: [
    "Nigerian music no longer depended only on physical distribution and traditional broadcast systems.",
    "Local labels, artist-led companies and digital platforms helped music move much faster.",
  ] as Lines,
  route: { from: "Lagos", via: ["YouTube", "Streaming", "Social"] as Lines, to: ["London", "Accra", "New York", "Global audiences"] as Lines },
} as const;

export const AFROBEATS = {
  distinction: {
    left: { term: "Afrobeat", text: "The specific musical tradition associated with Fela Kuti and related artists." },
    right: { term: "Afrobeats", text: "A broader international umbrella term increasingly used for contemporary West African pop." },
  },
  records: refs("dbanj-oliver-twist", "wizkid-ojuelegba", "davido-fall", "burna-boy-ye", "yemi-alade-johnny"),
  media: { performance: "wizkid-2013", nativeland: "nativeland-2016" },
  nativelandLine: ["Global reach,", "Lagos roots."] as Lines,
  nativelandText: "The international expansion was grounded in a strong Lagos youth culture.",
} as const;

export const ONE_DANCE = {
  headline: ["The world", "starts listening."] as Lines,
  year: "2016",
  credit: ["Wizkid", "+ Drake"] as Lines,
  title: "One Dance",
  body: "One of the clearest signs that Nigerian pop was moving deeper into global mainstream visibility.",
  media: "one-dance-cover",
} as const;

export const ESSENCE = {
  year: "2020",
  record: { id: "wizkid-tems-essence" } as RecordRef,
  body: "Essence became one of the defining Nigerian crossover records of the period.",
  keyLine: ["Global success stops", "looking like | an accident."] as Lines,
  media: "sleeve-wizkid-tems-essence",
} as const;

export const GLOBAL = {
  headline: ["Nigerian music", "doesn’t need", "to cross over", "anymore."] as Lines,
  answer: ["It is already part", "of global pop."] as Lines,
  names: ["Tems", "Rema", "Ayra Starr", "Asake", "Burna Boy", "Wizkid", "Davido", "Omah Lay", "Fireboy", "Seyi Vibez", "Shallipopi"] as Lines,
  genres: ["Afropop", "Afro-R&B", "Afro-fusion", "Street-pop", "Afropiano", "Alté", "Hip-hop", "Fuji-influenced pop"] as Lines,
  fragmentation: "What gets called “Afrobeats” is increasingly an ecosystem rather than one sound.",
  contrast: ["Global", "does not mean", "rootless."] as Lines,
  media: { stage: "tems-international", home: "ayra-starr-lagos" },
} as const;

export const LINEAGE = {
  headline: ["The new sound", "is never", "entirely new."] as Lines,
  lineages: [
    { from: ["Dùndún"], steps: ["Jùjú", "Modern Yorùbá pop"] },
    { from: ["Wéré / ajisari"], steps: ["Fuji", "Street-pop", "Afropiano"] },
    { from: ["Highlife", "Jazz", "Funk"], steps: ["Afrobeat"] },
    { from: ["Hip-hop", "R&B", "Pidgin", "Local rhythms"], steps: ["Naija pop", "Afrobeats"] },
  ] as readonly { from: Lines; steps: Lines }[],
  statement: ["Nigeria repeatedly | *absorbs*", "outside influence, | *transforms it* | locally,", "and sends | *something new* | back into the world."] as Lines,
  thesis: ARCHIVE_THESIS,
} as const;

export const FINALE = {
  figures: [
    { value: String(ERA_IDS.length), label: "Eras" },
    { value: String(ARCHIVE_ENTRIES.length), label: "Records" },
    { value: String(2026 - 1900), label: "Years" },
  ],
  unfinished: ["The story is", "not finished."] as Lines,
  invitation: ["Listen to it."] as Lines,
} as const;

/** Every archive record the homepage cites, per era — checked by the tests. */
export const CITED_RECORDS: Readonly<Partial<Record<EraId, readonly RecordRef[]>>> = {
  recording: [KING_1937.record],
  highlife: HIGHLIFE.records,
  explosion: [AFROBEAT.record, ...LOCAL_SOUND.records],
  transition: YOUTH.records,
  naija: NAIJA.records,
  afrobeats: AFROBEATS.records,
  global: [ESSENCE.record],
};

/** Where each media id is placed (beat → ids), excluding the lineage's reused fragments. */
export const PLACED_MEDIA: Readonly<Partial<Record<BeatId, readonly string[]>>> = {
  systems: [SYSTEMS.media.drum, SYSTEMS.media.kakaki],
  record1922: [RECORD_1922.media],
  city: CITY.sequence.map((step) => step.media),
  king1937: [KING_1937.media],
  independence: [INDEPENDENCE.media],
  afrobeat: [AFROBEAT.media],
  modernities: [MODERNITIES.juju.media, MODERNITIES.apala.media],
  festac: [FESTAC.media],
  localsound: LOCAL_SOUND.sleeves,
  youth: [YOUTH.media],
  naija: [...NAIJA.sleeves, ...NAIJA.objects],
  afrobeats: [AFROBEATS.media.performance, AFROBEATS.media.nativeland],
  onedance: [ONE_DANCE.media],
  essence: [ESSENCE.media],
  global: [GLOBAL.media.stage, GLOBAL.media.home],
};

/** All display line groups (for the line-length guards in the tests). */
export const DISPLAY_LINES: readonly Lines[] = [
  OPENING.title, OPENING.premise, SYSTEMS.headline, SYSTEMS.statement, RECORD_1922.headline, CITY.headline, KING_1937.keyLine,
  HIGHLIFE.headline, INDEPENDENCE.headline, INDEPENDENCE.follow, WAR_1967.headline, EXPLOSION.headline, EXPLOSION.burst,
  AFROBEAT.name, MODERNITIES.keyLine, FESTAC.headline, LOCAL_SOUND.headline, YOUTH.headline, YOUTH.question, YOUTH.answer,
  KENNIS.name, KENNIS.headline, NAIJA.headline, NAIJA.keyLine, DIGITAL.headline, AFROBEATS.nativelandLine, ONE_DANCE.headline,
  ONE_DANCE.credit, ESSENCE.keyLine, GLOBAL.headline, GLOBAL.answer, GLOBAL.contrast, LINEAGE.headline, LINEAGE.statement,
  FINALE.unfinished, FINALE.invitation,
];

/** Every copy object, for text-wide guards (diacritics, forbidden claims, the thesis appearing only at the end). */
export const STORY_COPY = {
  OPENING, SYSTEMS, RECORD_1922, CITY, KING_1937, HIGHLIFE, INDEPENDENCE, WAR_1967, EXPLOSION, AFROBEAT, MODERNITIES, FESTAC,
  LOCAL_SOUND, YOUTH, KENNIS, NAIJA, DIGITAL, AFROBEATS, ONE_DANCE, ESSENCE, GLOBAL, LINEAGE, FINALE,
} as const;
