/**
 * Homepage media — the ONE place that says which image fills which slot (docs/PROLOGUE.md §8).
 *
 * Every entry names the historical point it proves (`proves`). An image that only "looks Nigerian" does not belong
 * here. Historical photographs are not supplied yet: those entries are `placeholder` and render as designed archive
 * cards (title / place / year / kind) with the final aspect ratio and crop. Replacing one is a data change only:
 * set `src`, `status: "final"`, the real `alt` / `caption` and the credit fields — no component changes.
 *
 * Credits are never invented: unknown creator / source / license stay "" until supplied.
 *
 * Plain TypeScript (imported by Node tests): relative imports with ".ts", no enums.
 */
import type { EraId } from "../data/types.ts";

export type HomeMediaStatus = "placeholder" | "final";

/** What the image is doing in the story. */
export type HomeMediaRole = "evidence" | "object" | "archive" | "context" | "performance";

/** width / height */
export type HomeAspect = "1/1" | "4/5" | "3/4" | "1/3" | "3/2" | "4/3" | "16/9" | "21/9";

export interface HomePlaceholder {
  /** Large title on the archive card, e.g. "FESTAC ’77". */
  title: string;
  place: string;
  year: string;
  /** e.g. "Archive photograph", "Object photograph". */
  kind: string;
}

export interface HomeMedia {
  id: string;
  era: EraId;
  role: HomeMediaRole;
  /** The exact historical point this image supports. */
  proves: string;
  /** Final local file (/images/home/… or /textures/archive/…), or null while the asset is pending. */
  src: string | null;
  /** Optional low-res / designed placeholder file; null → the CSS archive card renders. */
  placeholderSrc: string | null;
  /** Internal label of what belongs in the slot (shown small on the card, and in the credits). */
  label: string;
  placeholder: HomePlaceholder | null;
  alt: string;
  caption: string;
  credit: string;
  source: string;
  license: string;
  objectPosition: string;
  aspectRatio: HomeAspect;
  status: HomeMediaStatus;
}

const PENDING = "PLACEHOLDER — replace with licensed archive image";

const photo = (fields: Omit<HomeMedia, "src" | "placeholderSrc" | "credit" | "source" | "license" | "status">): HomeMedia => ({
  ...fields,
  src: null,
  placeholderSrc: null,
  credit: PENDING,
  source: "",
  license: "",
  status: "placeholder",
});

/** Generated ARCHIVE catalogue sleeves already in the project (museum fallback art, not original releases). */
const sleeve = (era: EraId, trackId: string, catalogue: string, record: string, proves: string): HomeMedia => ({
  id: `sleeve-${trackId}`,
  era,
  role: "archive",
  proves,
  src: `/textures/archive/${era}/${trackId}--sleeve.webp`,
  placeholderSrc: null,
  label: `${catalogue} — ARCHIVE SLEEVE`,
  placeholder: null,
  alt: `ARCHIVE catalogue sleeve ${catalogue}: ${record}.`,
  caption: `${catalogue} · ${record}. Museum catalogue art, not the original release.`,
  credit: "ARCHIVE — The Sound of Nigeria (generated catalogue artwork)",
  source: "Project archive",
  license: "",
  objectPosition: "50% 50%",
  aspectRatio: "1/1",
  status: "final",
});

const MEDIA: readonly HomeMedia[] = [
  photo({
    id: "roots-talking-drum", era: "roots", role: "performance",
    proves: "Yorùbá dùndún and bàtá drums could imitate speech patterns — a musical system long before commercial recording.",
    label: "TALKING DRUM — ARCHIVE IMAGE",
    placeholder: { title: "Talking drum", place: "Yorùbá dùndún", year: "Pre-recording", kind: "Archive photograph" },
    alt: "A Yorùbá dùndún talking-drum player in performance, the drum held under the arm.",
    caption: "Yorùbá dùndún — a drum whose pitch can follow the tones of speech.",
    objectPosition: "50% 40%", aspectRatio: "4/5",
  }),
  photo({
    id: "roots-kakaki", era: "roots", role: "performance",
    proves: "Hausa kakaki trumpets served court, ceremony and public communication — a distinct musical system.",
    label: "KAKAKI PERFORMANCE — ARCHIVE IMAGE",
    placeholder: { title: "Kakaki", place: "Hausa court", year: "Pre-recording", kind: "Archive photograph" },
    alt: "Musicians raising long kakaki trumpets at a northern Nigerian court ceremony.",
    caption: "Kakaki — long trumpets of Hausa court and ceremony.",
    objectPosition: "50% 20%", aspectRatio: "1/3",
  }),
  photo({
    id: "record-shellac", era: "recording", role: "object",
    proves: "Recording turned a performance into an object that could be reproduced, sold, replayed and circulated.",
    label: "SHELLAC / 78 RPM — EARLY NIGERIAN RECORDING",
    placeholder: { title: "Shellac / 78 rpm", place: "Early Nigerian recording", year: "1920s", kind: "Object photograph" },
    alt: "A shellac 78 rpm record of early Nigerian music, label and grooves seen close.",
    caption: "Shellac, 78 rpm — the medium that let sound leave the performance space.",
    objectPosition: "50% 50%", aspectRatio: "1/1",
  }),
  photo({
    id: "lagos-city", era: "recording", role: "context",
    proves: "As Lagos expanded, Yorùbá musical forms met guitars, banjos, church music and drinking-house music.",
    label: "1930s LAGOS / ROYAL CINEMA — ARCHIVE IMAGE",
    placeholder: { title: "Lagos", place: "Street / Royal Cinema", year: "1930s", kind: "Archive photograph" },
    alt: "A Lagos street in the 1930s, with the Royal Cinema frontage.",
    caption: "Lagos in the 1930s — the city where new urban sounds took shape.",
    objectPosition: "50% 55%", aspectRatio: "3/2",
  }),
  sleeve("recording", "tunde-king-aronke-macaulay", "A02-01", "Tunde King — Aronke Macaulay, 1937", "Tunde King, one of the foundational figures of jùjú: a recognisable Nigerian urban popular music."),
  sleeve("highlife", "bobby-benson-taxi-driver", "A03-01", "Bobby Benson — Taxi Driver", "Nigerian highlife bandleaders of the post-war city."),
  sleeve("highlife", "victor-olaiya-baby-jowo", "A03-02", "Victor Olaiya — Baby Jowo", "Nigerian highlife bandleaders of the post-war city."),
  sleeve("highlife", "rex-lawson-sawale", "A03-03", "Cardinal Rex Lawson — Sawale", "Nigerian highlife bandleaders of the post-war city."),
  sleeve("highlife", "victor-uwaifo-joromi", "A03-04", "Victor Uwaifo — Joromi", "Nigerian highlife bandleaders of the post-war city."),
  sleeve("highlife", "orlando-julius-jaguar-nana", "A03-05", "Orlando Julius — Jaguar Nana", "Nigerian highlife bandleaders of the post-war city."),
  photo({
    id: "independence-1960", era: "highlife", role: "context",
    proves: "1 October 1960 — Nigeria becomes independent; highlife is tied to the optimism of the independence period.",
    label: "1960 NIGERIAN INDEPENDENCE, LAGOS — ARCHIVE IMAGE",
    placeholder: { title: "Independence", place: "Lagos", year: "1960", kind: "Archive photograph" },
    alt: "Crowds in Lagos celebrating Nigerian independence, October 1960.",
    caption: "Lagos, October 1960 — independence.",
    objectPosition: "50% 40%", aspectRatio: "16/9",
  }),
  photo({
    id: "fela-live", era: "explosion", role: "performance",
    proves: "Afrobeat — highlife, jazz, funk, African polyrhythm and political resistance — through Fela Kuti in performance.",
    label: "FELA KUTI LIVE PERFORMANCE — ARCHIVE IMAGE",
    placeholder: { title: "Fela Kuti", place: "Live performance", year: "1970s", kind: "Archive photograph" },
    alt: "Fela Kuti performing on stage with his band.",
    caption: "Fela Kuti in performance — Afrobeat, one branch of the post-war expansion.",
    objectPosition: "45% 30%", aspectRatio: "4/5",
  }),
  photo({
    id: "sunny-ade-live", era: "explosion", role: "performance",
    proves: "Jùjú modernised with electric guitars, talking drums, layered percussion and studio production.",
    label: "KING SUNNY ADÉ — ARCHIVE IMAGE",
    placeholder: { title: "King Sunny Adé", place: "Jùjú", year: "1970s–80s", kind: "Archive photograph" },
    alt: "King Sunny Adé performing with his guitar.",
    caption: "King Sunny Adé — modern jùjú.",
    objectPosition: "50% 30%", aspectRatio: "3/4",
  }),
  sleeve("explosion", "haruna-ishola-oroki-social-club", "A04-03", "Haruna Ishola — Oroki Social Club, 1971", "Apala remained a strong popular form alongside Afrobeat, jùjú and fuji."),
  photo({
    id: "festac-77", era: "explosion", role: "context",
    proves: "FESTAC ’77 brought performers and artists from Africa and the diaspora to Lagos.",
    label: "FESTAC ’77 DURBAR / FESTIVAL — ARCHIVE IMAGE",
    placeholder: { title: "FESTAC ’77", place: "Lagos", year: "1977", kind: "Archive photograph" },
    alt: "The FESTAC ’77 festival in Lagos.",
    caption: "FESTAC ’77, Lagos — the Second World Black and African Festival of Arts and Culture.",
    objectPosition: "50% 45%", aspectRatio: "21/9",
  }),
  sleeve("explosion", "king-sunny-ade-ja-funmi", "A04-02", "King Sunny Adé — Ja Funmi", "Local sound could be popular sound."),
  sleeve("explosion", "sikiru-ayinde-barrister-fuji-garbage", "A04-04", "Sikiru Ayinde Barrister — Fuji Garbage, 1988", "Local sound could be popular sound."),
  sleeve("explosion", "majek-fashek-send-down-the-rain", "A04-05", "Majek Fashek — Send Down the Rain, 1988", "Local sound could be popular sound."),
  photo({
    id: "cassette-vhs", era: "transition", role: "object",
    proves: "Cassettes and VHS carried hip-hop, R&B and dancehall into Nigerian youth culture — media circulation.",
    label: "CASSETTE + VHS — OBJECT PHOTOGRAPH",
    placeholder: { title: "Cassette + VHS", place: "Media circulation", year: "1990s", kind: "Object photograph" },
    alt: "Audio cassettes and a VHS tape of the 1990s.",
    caption: "Cassette and VHS — how outside influences reached Nigerian youth, and local music moved too.",
    objectPosition: "50% 50%", aspectRatio: "4/3",
  }),
  sleeve("naija", "2face-idibia-african-queen", "A06-01", "2Face Idibia — African Queen, 2004", "Naija pop: hybrid records built at home."),
  sleeve("naija", "sound-sultan-mathematics", "A06-02", "Sound Sultan — Mathematics", "Naija pop: hybrid records built at home."),
  sleeve("naija", "dbanj-why-me", "A06-03", "D'banj — Why Me, 2006", "Naija pop: hybrid records built at home."),
  sleeve("naija", "9ice-gongo-aso", "A06-04", "9ice — Gongo Aso, 2008", "Naija pop: hybrid records built at home."),
  sleeve("naija", "wande-coal-bumper-to-bumper", "A06-05", "Wande Coal — Bumper to Bumper, 2009", "Naija pop: hybrid records built at home."),
  photo({
    id: "nokia-3310", era: "naija", role: "object",
    proves: "Mobile phones were part of how 2000s Nigerian pop circulated.",
    label: "NOKIA 3310 — OBJECT PHOTOGRAPH",
    placeholder: { title: "Nokia 3310", place: "Mobile circulation", year: "2000s", kind: "Object photograph" },
    alt: "A Nokia 3310 mobile phone.",
    caption: "The phone in every pocket — part of how music moved in the 2000s.",
    objectPosition: "50% 50%", aspectRatio: "3/4",
  }),
  photo({
    id: "cd-disc", era: "naija", role: "object",
    proves: "CDs were part of the 2000s domestic pop infrastructure.",
    label: "CD — OBJECT PHOTOGRAPH",
    placeholder: { title: "CD", place: "Domestic pop", year: "2000s", kind: "Object photograph" },
    alt: "A compact disc of 2000s Nigerian pop.",
    caption: "The CD — the disc of the 2000s home market.",
    objectPosition: "50% 50%", aspectRatio: "1/1",
  }),
  photo({
    id: "wizkid-2013", era: "afrobeats", role: "performance",
    proves: "A new generation of Nigerian pop stars performing as digital distribution scaled their reach.",
    label: "WIZKID 2013 PERFORMANCE — ARCHIVE IMAGE",
    placeholder: { title: "Wizkid", place: "Live performance", year: "2013", kind: "Archive photograph" },
    alt: "Wizkid performing on stage in 2013.",
    caption: "Wizkid, 2013.",
    objectPosition: "50% 30%", aspectRatio: "4/5",
  }),
  photo({
    id: "nativeland-2016", era: "afrobeats", role: "context",
    proves: "International expansion was grounded in a strong Lagos youth culture.",
    label: "BURNA BOY, NATIVELAND, LAGOS 2016 — ARCHIVE IMAGE",
    placeholder: { title: "Nativeland", place: "Lagos", year: "2016", kind: "Archive photograph" },
    alt: "Burna Boy performing at Nativeland in Lagos, 2016.",
    caption: "Burna Boy at Nativeland, Lagos, 2016 — the local scene behind the global reach.",
    objectPosition: "50% 55%", aspectRatio: "16/9",
  }),
  sleeve("global", "wizkid-tems-essence", "A08-01", "Wizkid ft. Tems — Essence, 2020", "Essence became one of the defining Nigerian crossover records of the period."),
  photo({
    id: "tems-international", era: "global", role: "performance",
    proves: "Nigerian artists already perform as part of global pop.",
    label: "TEMS INTERNATIONAL PERFORMANCE — ARCHIVE IMAGE",
    placeholder: { title: "Tems", place: "International stage", year: "2020s", kind: "Archive photograph" },
    alt: "Tems performing on an international stage.",
    caption: "Tems on an international stage.",
    objectPosition: "50% 35%", aspectRatio: "16/9",
  }),
  photo({
    id: "ayra-starr-lagos", era: "global", role: "performance",
    proves: "Global does not mean rootless: the same generation performs at home in Lagos.",
    label: "AYRA STARR IN LAGOS — ARCHIVE IMAGE",
    placeholder: { title: "Ayra Starr", place: "Lagos", year: "2020s", kind: "Archive photograph" },
    alt: "Ayra Starr performing in Lagos.",
    caption: "Ayra Starr in Lagos.",
    objectPosition: "50% 35%", aspectRatio: "4/5",
  }),
];

export const HOME_MEDIA: Readonly<Record<string, HomeMedia>> = Object.fromEntries(MEDIA.map((media) => [media.id, media]));
export const HOME_MEDIA_LIST: readonly HomeMedia[] = MEDIA;

export function getHomeMedia(id: string): HomeMedia {
  const media = HOME_MEDIA[id];
  if (!media) throw new Error(`Unknown homepage media "${id}"`);
  return media;
}
