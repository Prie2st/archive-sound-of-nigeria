/**
 * Homepage media — the ONE place that says which image fills which slot (docs/PROLOGUE.md §8).
 *
 * Every entry names the historical point it proves (`proves`). An image that only "looks Nigerian" does not belong
 * here. The homepage design (Figma "ARCHIVE — Intro / Home", 2026-10-18) supplies an image for every slot
 * (`placeholderSrc`); their sources, credits and licences are not recorded yet, so every entry stays `placeholder`
 * and the credits list says so. Photographs carry the archive-card words over the image (`overlay`). Confirming an
 * image is a data change only: set `src`, `status: "final"`, the real `alt` / `caption` and the credit fields.
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

/** How the archive-card words sit on a designed image: their colour, and an optional scrim behind them. */
export interface HomeOverlay {
  ink: string;
  /** CSS background over the image, under the words (e.g. a gradient for legibility). */
  scrim?: string;
}

export interface HomeMedia {
  id: string;
  era: EraId;
  role: HomeMediaRole;
  /** The exact historical point this image supports. */
  proves: string;
  /** Final local file (/images/home/… or /textures/archive/…), or null while the asset is pending. */
  src: string | null;
  /**
   * The image the design uses in the slot while the licensed archive file and its credit are pending
   * (/images/home/…); null → the CSS archive card renders.
   */
  placeholderSrc: string | null;
  /** Colour of the card words over `placeholderSrc` (photographs; sleeves show no words). */
  overlay?: HomeOverlay;
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
/** The image the homepage design (Figma "ARCHIVE — Intro / Home") puts in a slot; its credit is still pending. */
const designed = (id: string) => `/images/home/${id}.webp`;

const photo = (fields: Omit<HomeMedia, "src" | "placeholderSrc" | "credit" | "source" | "license" | "status">): HomeMedia => ({
  ...fields,
  src: null,
  placeholderSrc: designed(fields.id),
  credit: PENDING,
  source: "",
  license: "",
  status: "placeholder",
});

/**
 * A record's sleeve. The design shows the supplied cover art (`cover`, in /images/home); its credit and licence are
 * pending, so the entry stays a placeholder (the generated ARCHIVE catalogue sleeves remain the museum's artwork).
 */
const sleeve = (era: EraId, trackId: string, catalogue: string, record: string, proves: string, cover: string): HomeMedia => ({
  id: `sleeve-${trackId}`,
  era,
  role: "archive",
  proves,
  src: null,
  placeholderSrc: designed(cover),
  label: `${catalogue} — RECORD SLEEVE`,
  placeholder: { title: record, place: catalogue, year: "", kind: "Record sleeve" },
  alt: `Sleeve of ${record} (${catalogue}).`,
  caption: `${catalogue} · ${record}.`,
  credit: PENDING,
  source: "",
  license: "",
  objectPosition: "50% 50%",
  aspectRatio: "1/1",
  status: "placeholder",
});

const CREAM = "#ece5d6";
const INK = "#1b1813";

const MEDIA: readonly HomeMedia[] = [
  photo({
    id: "roots-talking-drum", era: "roots", role: "performance",
    proves: "Yorùbá dùndún and bàtá drums could imitate speech patterns — a musical system long before commercial recording.",
    label: "TALKING DRUM — ARCHIVE IMAGE",
    placeholder: { title: "Talking drum", place: "Yorùbá dùndún", year: "Pre-recording", kind: "Archive photograph" },
    overlay: { ink: "#ffd4a6" },
    alt: "A Yorùbá dùndún talking-drum player in performance, the drum held under the arm.",
    caption: "Yorùbá dùndún — a drum whose pitch can follow the tones of speech.",
    objectPosition: "50% 40%", aspectRatio: "4/5",
  }),
  photo({
    id: "roots-kakaki", era: "roots", role: "performance",
    proves: "Hausa kakaki trumpets served court, ceremony and public communication — a distinct musical system.",
    label: "KAKAKI — ARCHIVE IMAGE",
    placeholder: { title: "Kakaki", place: "Hausa court", year: "Pre-recording", kind: "Archive photograph" },
    overlay: { ink: INK },
    alt: "A long kakaki trumpet, the instrument of Hausa court ceremony.",
    caption: "Kakaki — long trumpets of Hausa court and ceremony.",
    objectPosition: "50% 50%", aspectRatio: "1/3",
  }),
  photo({
    id: "record-shellac", era: "recording", role: "object",
    proves: "Recording turned a performance into an object that could be reproduced, sold, replayed and circulated.",
    label: "SHELLAC / 78 RPM — OBJECT PHOTOGRAPH",
    placeholder: { title: "Shellac / 78 rpm", place: "Early Nigerian recording", year: "1920s", kind: "Object photograph" },
    overlay: { ink: "#efe8d8", scrim: "rgba(0, 0, 0, 0.18)" },
    alt: "A shellac 78 rpm record, label and grooves seen close.",
    caption: "Shellac, 78 rpm — the medium that let sound leave the performance space.",
    objectPosition: "50% 50%", aspectRatio: "1/1",
  }),
  photo({
    id: "lagos-city", era: "recording", role: "context",
    proves: "As Lagos expanded, Yorùbá musical forms met guitars, banjos, church music and drinking-house music.",
    label: "1930s LAGOS / ROYAL CINEMA — ARCHIVE IMAGE",
    placeholder: { title: "Lagos", place: "Street / Royal Cinema", year: "1930s", kind: "Archive photograph" },
    overlay: { ink: CREAM, scrim: "linear-gradient(to top, rgba(0, 0, 0, 0.45), transparent 55%)" },
    alt: "A Lagos street in the 1930s, with the Royal Cinema frontage.",
    caption: "Lagos in the 1930s — the city where new urban sounds took shape.",
    objectPosition: "50% 55%", aspectRatio: "3/2",
  }),
  sleeve("recording", "tunde-king-aronke-macaulay", "A02-01", "Tunde King — Aronke Macaulay, 1937", "Tunde King, one of the foundational figures of jùjú: a recognisable Nigerian urban popular music.", "tunde-king-cover"),
  photo({
    id: "independence-1960", era: "highlife", role: "context",
    proves: "1 October 1960 — Nigeria becomes independent; highlife is tied to the optimism of the independence period.",
    label: "1960 NIGERIAN INDEPENDENCE, LAGOS — ARCHIVE IMAGE",
    placeholder: { title: "Independence", place: "Lagos", year: "1960", kind: "Archive photograph" },
    alt: "Nigerian dignitaries at the independence celebrations in Lagos, October 1960.",
    caption: "Lagos, October 1960 — independence.",
    objectPosition: "50% 30%", aspectRatio: "16/9",
  }),
  photo({
    id: "fela-live", era: "explosion", role: "performance",
    proves: "Afrobeat — highlife, jazz, funk, African polyrhythm and political resistance — through Fela Kuti in performance.",
    label: "FELA KUTI LIVE PERFORMANCE — ARCHIVE IMAGE",
    placeholder: { title: "Fela Kuti", place: "Live performance", year: "1970s", kind: "Archive photograph" },
    overlay: { ink: "#f7ead6" },
    alt: "Fela Kuti performing on stage, arms raised.",
    caption: "Fela Kuti in performance — Afrobeat, one branch of the post-war expansion.",
    objectPosition: "50% 30%", aspectRatio: "4/5",
  }),
  photo({
    id: "sunny-ade-live", era: "explosion", role: "performance",
    proves: "Jùjú modernised with electric guitars, talking drums, layered percussion and studio production.",
    label: "KING SUNNY ADÉ — ARCHIVE IMAGE",
    placeholder: { title: "King Sunny Adé", place: "Jùjú", year: "1970s–80s", kind: "Archive photograph" },
    overlay: { ink: "#eee6cf", scrim: "linear-gradient(to top, rgba(0, 0, 0, 0.65), transparent)" },
    alt: "King Sunny Adé performing with his guitar.",
    caption: "King Sunny Adé — modern jùjú.",
    objectPosition: "35% 30%", aspectRatio: "3/4",
  }),
  sleeve("explosion", "haruna-ishola-oroki-social-club", "A04-03", "Haruna Ishola — Oroki Social Club, 1971", "Apala remained a strong popular form alongside Afrobeat, jùjú and fuji.", "oroki-cover"),
  photo({
    id: "festac-77", era: "explosion", role: "context",
    proves: "FESTAC ’77 brought performers and artists from Africa and the diaspora to Lagos.",
    label: "FESTAC ’77 DURBAR / FESTIVAL — ARCHIVE IMAGE",
    placeholder: { title: "FESTAC ’77", place: "Lagos", year: "1977", kind: "Archive photograph" },
    overlay: { ink: INK },
    alt: "The FESTAC ’77 festival in Lagos: a decorated grandstand and its audience.",
    caption: "FESTAC ’77, Lagos. The Second World Black and African Festival of Arts and Culture.",
    objectPosition: "50% 55%", aspectRatio: "21/9",
  }),
  sleeve("explosion", "king-sunny-ade-ja-funmi", "A04-02", "King Sunny Adé — Ja Funmi", "Local sound could be popular sound.", "ja-funmi-cover"),
  sleeve("explosion", "sikiru-ayinde-barrister-fuji-garbage", "A04-04", "Sikiru Ayinde Barrister — Fuji Garbage, 1988", "Local sound could be popular sound.", "fuji-garbage-cover"),
  sleeve("explosion", "majek-fashek-send-down-the-rain", "A04-05", "Majek Fashek — Send Down the Rain, 1988", "Local sound could be popular sound.", "send-down-the-rain-cover"),
  photo({
    id: "cassette-vhs", era: "transition", role: "object",
    proves: "Cassettes and VHS carried hip-hop, R&B and dancehall into Nigerian youth culture — media circulation.",
    label: "CASSETTE + VHS — OBJECT PHOTOGRAPH",
    placeholder: { title: "Cassette + VHS", place: "Media circulation", year: "1990s", kind: "Object photograph" },
    overlay: { ink: INK },
    alt: "An audio cassette of the 1990s.",
    caption: "Cassette and VHS — how outside influences reached Nigerian youth, and local music moved too.",
    objectPosition: "50% 20%", aspectRatio: "4/3",
  }),
  sleeve("naija", "2face-idibia-african-queen", "A06-01", "2Face Idibia — African Queen, 2004", "Naija pop: hybrid records built at home.", "african-queen-cover"),
  sleeve("naija", "sound-sultan-mathematics", "A06-02", "Sound Sultan — Mathematics", "Naija pop: hybrid records built at home.", "mathematics-cover"),
  sleeve("naija", "dbanj-why-me", "A06-03", "D'banj — Why Me, 2006", "Naija pop: hybrid records built at home.", "why-me-cover"),
  sleeve("naija", "9ice-gongo-aso", "A06-04", "9ice — Gongo Aso, 2008", "Naija pop: hybrid records built at home.", "gongo-aso-cover"),
  sleeve("naija", "wande-coal-bumper-to-bumper", "A06-05", "Wande Coal — Bumper to Bumper, 2009", "Naija pop: hybrid records built at home.", "bumper-to-bumper-cover"),
  photo({
    id: "nokia-3310", era: "naija", role: "object",
    proves: "Mobile phones were part of how 2000s Nigerian pop circulated.",
    label: "NOKIA 3310 — OBJECT PHOTOGRAPH",
    placeholder: { title: "Nokia 3310", place: "Mobile circulation", year: "2000s", kind: "Object photograph" },
    overlay: { ink: CREAM, scrim: "rgba(0, 0, 0, 0.26)" },
    alt: "A Nokia 3310 mobile phone.",
    caption: "The phone in every pocket — part of how music moved in the 2000s.",
    objectPosition: "50% 0%", aspectRatio: "3/4",
  }),
  photo({
    id: "cd-disc", era: "naija", role: "object",
    proves: "CDs were part of the 2000s domestic pop infrastructure.",
    label: "CD — OBJECT PHOTOGRAPH",
    placeholder: { title: "CD", place: "Domestic pop", year: "2000s", kind: "Object photograph" },
    overlay: { ink: CREAM, scrim: "linear-gradient(to top, rgba(0, 0, 0, 0.94), rgba(102, 102, 102, 0))" },
    alt: "A compact disc.",
    caption: "The CD — the disc of the 2000s home market.",
    objectPosition: "50% 50%", aspectRatio: "1/1",
  }),
  photo({
    id: "wizkid-2013", era: "afrobeats", role: "performance",
    proves: "A new generation of Nigerian pop stars performing as digital distribution scaled their reach.",
    label: "WIZKID 2013 PERFORMANCE — ARCHIVE IMAGE",
    placeholder: { title: "Wizkid", place: "Live performance", year: "2013", kind: "Archive photograph" },
    overlay: { ink: INK },
    alt: "Wizkid performing on stage in 2013.",
    caption: "Wizkid, 2013.",
    objectPosition: "50% 30%", aspectRatio: "4/5",
  }),
  photo({
    id: "nativeland-2016", era: "afrobeats", role: "context",
    proves: "International expansion was grounded in a strong Lagos youth culture.",
    label: "BURNA BOY, NATIVELAND, LAGOS 2016 — ARCHIVE IMAGE",
    placeholder: { title: "Nativeland", place: "Lagos", year: "2016", kind: "Archive photograph" },
    overlay: { ink: "#fbece4" },
    alt: "Burna Boy performing at Nativeland in Lagos, 2016.",
    caption: "Burna Boy at Nativeland, Lagos, 2016 — the local scene behind the global reach.",
    objectPosition: "50% 55%", aspectRatio: "16/9",
  }),
  photo({
    id: "one-dance-cover", era: "afrobeats", role: "context",
    proves: "In 2016 a record featuring Wizkid reached deep into global mainstream visibility.",
    label: "ONE DANCE (2016) — RECORD SLEEVE",
    placeholder: { title: "One Dance", place: "Wizkid + Drake", year: "2016", kind: "Record sleeve" },
    alt: "Album sleeve of Views (2016), the album that includes One Dance.",
    caption: "One Dance, 2016.",
    objectPosition: "50% 50%", aspectRatio: "1/1",
  }),
  sleeve("global", "wizkid-tems-essence", "A08-01", "Wizkid ft. Tems — Essence, 2020", "Essence became one of the defining Nigerian crossover records of the period.", "essence-cover"),
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
    overlay: { ink: "#efe7da" },
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
