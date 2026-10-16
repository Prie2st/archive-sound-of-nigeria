/**
 * Content pipeline and the production archive (docs/CONTENT_PIPELINE.md, docs/ARCHIVE_CONTENT.md):
 * validation rules, the 8 × 5 production scope, ROOTS as tradition references, playlist scaling,
 * record-set separation, role-keyed development assets and artwork resolution. Synthetic eras /
 * tracks are test-only content. Run with: npm test
 */
import assert from "node:assert/strict";
import { existsSync, readdirSync } from "node:fs";
import { describe, it } from "node:test";
import { DEV_AUDIO_ASSETS, DEV_AUDIO_PLACEHOLDERS, archiveVariant, fixtureVariant } from "../audio/devAudioAssets.ts";
import { getAudioEntry } from "../audio/audioCatalog.ts";
import { ARCHIVE_ARTWORK, DEV_RECORD_ARTWORK, archiveArtworkUrl, resolveRecordArtwork } from "../stations/recordArtworkCatalog.ts";
import { recordArtworkPath, recordAudioPath } from "./contentPaths.ts";
import { DEV_FIXTURE_ARTIST, DEV_FIXTURE_ID_MARKER, DEV_FIXTURES_PER_ERA, DEV_TRACKS_BY_ERA, devFixtureTracks, isDevFixture } from "./devFixtures.ts";
import { ERAS, getHeroTrack, getNextTrack, getPreviousTrack, getTrack, stepInPlaylist } from "./eras.ts";
import { ACTIVE_RECORD_SET, RECORD_SETS, resolveRecordSet } from "./recordSets.ts";
import { PRODUCTION_AUDIO_URLS } from "./productionAudio.ts";
import { describeTrack } from "./trackDisplay.ts";
import { ARCHIVE_ENTRIES, ARCHIVE_TRACKS_BY_ERA, HERO_TRACK_IDS } from "./tracks.ts";
import { ARCHIVE_THESIS, ERA_IDS, type Track } from "./types.ts";
import {
  PRODUCTION_ENTRIES_PER_ERA,
  SIGNIFICANCE_MAX_CHARS,
  assertValidArchive,
  catalogueNumberFor,
  sentenceCount,
  validateArchive,
  validateProductionArchive,
  type ArchiveEra,
  type ArchiveIssueCode,
} from "./validateArchive.ts";

/** A synthetic archive record (test-only content; not historical data). Record 1 is the hero by default. */
const record = (n: number, overrides: Partial<Track> = {}): Track => ({
  id: `test-record-${n}`,
  eraId: "highlife",
  contentType: "RECORDING",
  hero: n === 1,
  artist: "Test Artist",
  title: `Test Record ${n}`,
  year: 1950,
  genre: "Test",
  historicalNote: "",
  audioUrl: null,
  audioAvailability: "pending",
  coverUrl: null,
  vinylLabelUrl: null,
  status: "draft",
  ...overrides,
});

const era = (tracks: Track[], overrides: Partial<ArchiveEra> = {}): ArchiveEra => ({
  id: "highlife",
  startYear: 1945,
  endYear: 1966,
  heroTrackId: tracks[0]?.id ?? "missing",
  tracks,
  ...overrides,
});

const codes = (eras: ArchiveEra[]): ArchiveIssueCode[] => validateArchive(eras).map((issue) => issue.code);
const productionCodes = (eras: readonly ArchiveEra[]): ArchiveIssueCode[] => validateProductionArchive(eras).map((issue) => issue.code);
const publicFile = (url: string) => new URL(`../../public${url}`, import.meta.url);

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

// ---------------------------------------------------------------------------
// The production archive
// ---------------------------------------------------------------------------

describe("production archive", () => {
  it("is the default record set (Node / production)", () => {
    assert.equal(ACTIVE_RECORD_SET, "archive");
    for (const e of ERAS) assert.equal(e.tracks, ARCHIVE_TRACKS_BY_ERA[e.id]);
  });

  it("passes every production rule: 8 eras, exactly 5 entries each, 40 in total", () => {
    assert.deepEqual(validateProductionArchive(ERAS), []);
    assert.equal(ERAS.length, 8);
    for (const e of ERAS) assert.equal(e.tracks.length, PRODUCTION_ENTRIES_PER_ERA, e.id);
    assert.equal(ARCHIVE_ENTRIES.length, 40);
    assert.equal(new Set(ARCHIVE_ENTRIES.map((t) => t.id)).size, 40, "unique ids");
  });

  it("keeps the canonical hero as entry 1 and the default selection of every era", () => {
    const heroes = Object.fromEntries(ERAS.map((e) => [e.id, `${getHeroTrack(e.id).artist ?? getHeroTrack(e.id).tradition} — ${getHeroTrack(e.id).title}`]));
    assert.deepEqual(heroes, {
      roots: "Yorùbá — Dùndún / Talking Drum",
      recording: "Tunde King — Aronke Macaulay",
      highlife: "Bobby Benson — Taxi Driver",
      explosion: "Fela Kuti — Water No Get Enemy",
      transition: "The Remedies — Shakomo",
      naija: "2Face Idibia — African Queen",
      afrobeats: "Wizkid — Ojuelegba",
      global: "Wizkid ft. Tems — Essence",
    });
    for (const e of ERAS) {
      assert.equal(e.tracks[0].id, HERO_TRACK_IDS[e.id]);
      assert.deepEqual(
        e.tracks.map((t) => t.hero),
        [true, false, false, false, false],
        `${e.id}: exactly one hero, first`,
      );
    }
  });

  it("numbers the catalogue A<era>-<position> in explicit playlist order", () => {
    for (const e of ERAS) {
      assert.deepEqual(
        e.tracks.map((t) => t.catalogueNumber),
        [1, 2, 3, 4, 5].map((n) => `A${e.number}-0${n}`),
      );
    }
    assert.equal(catalogueNumberFor("global", 4), "A08-05");
  });

  it("represents ROOTS honestly: tradition references, no artist, no release year", () => {
    for (const t of ARCHIVE_TRACKS_BY_ERA.roots) {
      assert.equal(t.contentType, "TRADITION_REFERENCE", t.id);
      assert.equal(t.artist, null, t.id);
      assert.equal(t.year, null, t.id);
      assert.equal(t.yearLabel, undefined, t.id);
      assert.ok(t.tradition && ["Yorùbá", "Hausa"].includes(t.tradition), t.id);
    }
    assert.deepEqual(describeTrack(getHeroTrack("roots")), {
      kicker: "Listening reference",
      title: "Dùndún / Talking Drum",
      byline: "Yorùbá musical tradition",
      date: null,
      genre: "Talking drum",
      catalogueNumber: "A01-01",
    });
  });

  it("preserves uncertain dates instead of inventing exact years", () => {
    const byId = (id: string) => ARCHIVE_ENTRIES.find((t) => t.id === id)!;
    assert.deepEqual([byId("tunde-king-oba-oyinbo").year, describeTrack(byId("tunde-king-oba-oyinbo")).date], [null, "1930s"]);
    assert.deepEqual([byId("yemi-alade-johnny").year, describeTrack(byId("yemi-alade-johnny")).date], [null, "2013/14"]);
    assert.equal(describeTrack(byId("king-sunny-ade-ja-funmi")).date, "1982 international release");
    assert.equal(describeTrack(byId("bobby-benson-taxi-driver")).date, null, "no year supplied → none shown");
    const bakare = describeTrack(byId("ayinde-bakare-early-juju-recordings"));
    assert.deepEqual([bakare.kicker, bakare.byline, bakare.date], ["Listening reference", "Ayinde Bakare", "1930s–40s"]);
    assert.equal(describeTrack(byId("victor-uwaifo-joromi")).kicker, null, "a single identified recording has no kicker");
  });

  it("gives every entry the museum metadata: significance (1–2 short sentences), genre, explicit audio availability", () => {
    for (const t of ARCHIVE_ENTRIES) {
      assert.ok(t.historicalNote.trim().length > 20 && t.historicalNote.length <= SIGNIFICANCE_MAX_CHARS, t.id);
      assert.ok(t.genre.trim(), t.id);
      assert.equal(t.audioAvailability, "available", t.id);
      assert.equal(t.audioUrl, PRODUCTION_AUDIO_URLS[t.id], t.id);
      assert.equal(t.status, "draft", `${t.id}: pending editorial verification`);
    }
  });

  it("contains no development fixtures, and keeps the eight era statements and the thesis", () => {
    for (const t of ARCHIVE_ENTRIES) {
      assert.ok(!isDevFixture(t) && !t.id.includes(DEV_FIXTURE_ID_MARKER) && t.artist !== DEV_FIXTURE_ARTIST && t.status !== "placeholder", t.id);
    }
    assert.deepEqual(
      ERAS.map((e) => e.headline),
      [
        "BEFORE RECORDS, NIGERIA ALREADY HAD HUNDREDS OF MUSICAL LANGUAGES.",
        "MUSIC BECOMES REPRODUCIBLE.",
        "THE SOUNDTRACK OF A COUNTRY BECOMING MODERN.",
        "EVERYTHING EXPLODES.",
        "A NEW GENERATION ASKS WHAT NIGERIAN YOUTH MUSIC SHOULD SOUND LIKE.",
        "NIGERIAN POP NO LONGER NEEDS SOMEBODY ELSE'S GENRE.",
        "THE WORLD STARTS LISTENING.",
        "NIGERIAN MUSIC DOESN'T NEED TO CROSS OVER ANYMORE.",
      ],
    );
    assert.deepEqual([...new Set(ERAS.map((e) => e.thesisStage))], [...ARCHIVE_THESIS], "thesis stages appear in order");
  });

  it("NEXT / PREVIOUS wrap within each 5-entry era and never cross eras", () => {
    for (const e of ERAS) {
      let id = e.heroTrackId;
      const seen: string[] = [];
      for (let i = 0; i < 5; i++) seen.push((id = getNextTrack(e.id, id).id));
      assert.deepEqual(seen, [...e.tracks.slice(1).map((t) => t.id), e.heroTrackId], e.id);
      assert.equal(getPreviousTrack(e.id, e.heroTrackId).id, e.tracks[4].id, `${e.id}: first ← last`);
      for (const other of ERAS) if (other.id !== e.id) assert.equal(getTrack(other.id, e.tracks[2].id), undefined);
    }
  });

  it("fails clearly (never repairs) when the production scope is broken", () => {
    const base = ERAS.map((e) => ({ ...e, tracks: [...e.tracks] }));
    const snapshot = JSON.stringify(base);
    const sixth = { ...record(9), eraId: "highlife" as const, hero: false, catalogueNumber: "A03-06", historicalNote: "Test entry." };
    const broken = base.map((e) => (e.id === "highlife" ? { ...e, tracks: [...e.tracks, sixth] } : e));
    assert.deepEqual(productionCodes(broken), ["production-playlist-size", "production-total"]);
    assert.equal(JSON.stringify(base), snapshot, "input untouched");

    const withFixture = base.map((e) => (e.id === "naija" ? { ...e, tracks: [...e.tracks.slice(0, 4), devFixtureTracks("naija", 1)[0]] } : e));
    assert.ok(productionCodes(withFixture).includes("production-fixture"));

    const rootsRecording = base.map((e) => (e.id === "roots" ? { ...e, tracks: [e.tracks[0], { ...e.tracks[1], contentType: "RECORDING" as const, artist: "Someone", tradition: undefined }, ...e.tracks.slice(2)] } : e));
    assert.deepEqual(productionCodes(rootsRecording), ["production-roots-reference"]);

    const noCatalogue = base.map((e) => (e.id === "global" ? { ...e, tracks: [...e.tracks.slice(0, 4), { ...e.tracks[4], catalogueNumber: undefined }] } : e));
    assert.deepEqual(productionCodes(noCatalogue), ["production-catalogue-missing"]);

    const reordered = base.map((e) => (e.id === "afrobeats" ? { ...e, tracks: [e.tracks[0], e.tracks[2], e.tracks[1], ...e.tracks.slice(3)] } : e));
    assert.deepEqual(productionCodes(reordered), ["catalogue-number", "catalogue-number"], "order is explicit, not accidental");

    assert.deepEqual(productionCodes(base.slice(0, 7)), ["production-era-count", "production-total"]);
  });
});

describe("editorial corrections (archive correction pass)", () => {
  const byId = (id: string) => ARCHIVE_ENTRIES.find((t) => t.id === id);

  it("TRANSITION: Ace (commonly dated 1989) removed; Adewale Ayuba — Bubble in its slot; still five, Shakomo first", () => {
    assert.deepEqual(
      ARCHIVE_TRACKS_BY_ERA.transition.map((t) => `${t.catalogueNumber} ${t.artist} — ${t.title}`),
      ["A05-01 The Remedies — Shakomo", "A05-02 Adewale Ayuba — Bubble", "A05-03 Daddy Showkey — Diana", "A05-04 Junior & Pretty — Monika", "A05-05 Trybesmen — Shake Bodi"],
    );
    assert.equal(ARCHIVE_TRACKS_BY_ERA.transition[0].hero, true);
    assert.ok(!ARCHIVE_ENTRIES.some((t) => t.title === "Ace" || t.id === "shina-peters-ace"), "Ace is in no production playlist");
    const bubble = byId("adewale-ayuba-bubble")!;
    assert.deepEqual([bubble.genre, bubble.year, bubble.yearLabel, bubble.eraId], ["Fuji", null, undefined, "transition"], "no invented year");
    assert.equal(ARCHIVE_ENTRIES.length, 40);
  });

  it("Shake Bodi is dated 1998 and stays in TRANSITION", () => {
    const shakeBodi = byId("trybesmen-shake-bodi")!;
    assert.deepEqual([shakeBodi.year, shakeBodi.eraId, describeTrack(shakeBodi).date], [1998, "transition", "1998"]);
  });

  it("era boundaries are unchanged", () => {
    assert.deepEqual(
      ERAS.map((e) => `${e.title} ${e.dateLabel}`),
      ["ROOTS 1900–1919", "RECORDING 1920–1944", "HIGH-LIFE 1945–1966", "EXPLOSION 1967–1989", "TRANSITION 1990–1999", "NAIJA 2000–2009", "AFROBEATS 2010–2019", "GLOBAL 2020–2026"],
    );
  });

  it("thesis-stage mapping is exactly the confirmed one", () => {
    assert.deepEqual(Object.fromEntries(ERAS.map((e) => [e.id, e.thesisStage])), {
      roots: "TRADITION",
      recording: "ADAPTATION",
      highlife: "LOCALISATION",
      explosion: "LOCALISATION",
      transition: "LOCALISATION",
      naija: "LOCALISATION",
      afrobeats: "EXPORTATION",
      global: "EXPORTATION",
    });
  });

  it("chart claims are the precise, conservative ones; the Essence peak is credited to the remix's chart run", () => {
    assert.match(byId("dbanj-oliver-twist")!.historicalNote, /No\. 9 on the UK Official Singles Chart in 2012/);
    assert.match(byId("wizkid-tems-essence")!.historicalNote, /Justin Bieber remix contributing to its chart run, Essence reached No\. 9 on the US Billboard Hot 100/);
    assert.match(byId("rema-calm-down")!.historicalNote, /^The Selena Gomez remix became a major global hit, reaching No\. 3 on the US Billboard Hot 100\.$/);
    assert.match(byId("sikiru-ayinde-barrister-fuji-garbage")!.historicalNote, /one of Fuji's foundational figures/);
    assert.match(byId("sikiru-ayinde-barrister-fuji-garbage")!.historicalNote, /wéré and ajisari/, "fuji's wider roots acknowledged");
    assert.match(byId("king-sunny-ade-ja-funmi")!.historicalNote, /^From the 1982 album Juju Music/);
  });

  it("no significance line uses unverified superlatives or origin claims", () => {
    const banned = /\b(first[- ]ever|biggest|invented|creator of|greatest|most successful|best[- ]selling)\b/i;
    for (const t of ARCHIVE_ENTRIES) assert.doesNotMatch(t.historicalNote, banned, t.id);
  });

  it("counts sentences without splitting at abbreviations or initials", () => {
    assert.equal(sentenceCount("Peaking at No. 9 on the chart in 2012."), 1);
    assert.equal(sentenceCount("A reference to G.T. Onwuka's recordings."), 1);
    assert.equal(sentenceCount("One. Two. Three."), 3);
  });
});

// ---------------------------------------------------------------------------
// Generic validation rules (synthetic data)
// ---------------------------------------------------------------------------

describe("archive validation", () => {
  it("accepts both record sets", () => {
    assert.doesNotThrow(() => assertValidArchive(ERAS));
    assert.deepEqual(validateArchive(ERAS.map((e) => ({ ...e, tracks: DEV_TRACKS_BY_ERA[e.id] }))), []);
  });

  it("never modifies the data and reports deterministically (era order, then playlist order)", () => {
    const input = deepFreeze([era([record(1), record(2, { eraId: "naija" }), record(3, { year: 1990 })]), era([], { id: "naija", startYear: 2000, endYear: 2009 })]);
    const snapshot = JSON.stringify(input);
    const first = validateArchive(input);
    assert.equal(JSON.stringify(input), snapshot);
    assert.deepEqual(validateArchive(input), first);
    assert.deepEqual(
      first.map((i) => [i.eraId, i.position ?? -1, i.code]),
      [
        ["highlife", 1, "era-mismatch"],
        ["highlife", 2, "year-outside-era"],
        ["naija", -1, "playlist-empty"],
      ],
    );
  });

  it("fails with messages naming the era, the record and its position", () => {
    const [issue] = validateArchive([era([record(1), record(1)])]);
    assert.equal(issue.code, "duplicate-track-id");
    assert.match(issue.message, /^highlife \/ test-record-1 \(#2\): id already used by highlife #1$/);
    assert.throws(() => assertValidArchive([era([record(1), record(1)])]), /1 issue\(s\):\n {2}\[duplicate-track-id\] highlife/);
  });

  it("requires unique ids across eras, a matching eraId and a path-safe id", () => {
    const naija = era([record(1, { eraId: "naija", year: 2001 })], { id: "naija", startYear: 2000, endYear: 2009 });
    assert.deepEqual(codes([era([record(1)]), naija]), ["duplicate-track-id"]);
    assert.deepEqual(codes([era([record(1), record(2, { eraId: "global" })])]), ["era-mismatch"]);
    assert.deepEqual(codes([era([record(1), record(2, { id: "Bad Id/../x" })])]), ["id-format"]);
    assert.deepEqual(codes([era([record(1), record(2, { title: "  " })])]), ["required-field"]);
    assert.deepEqual(codes([era([record(1)], { id: "disco" as ArchiveEra["id"] })]), ["unknown-era", "era-mismatch"]);
  });

  it("requires the hero to be in the playlist, first, flagged and real", () => {
    assert.deepEqual(codes([era([record(1, { hero: false })], { heroTrackId: "test-record-9" })]), ["hero-missing"]);
    assert.deepEqual(codes([era([record(1, { hero: false }), record(2, { hero: true })], { heroTrackId: "test-record-2" })]), ["hero-not-first"]);
    const [fixture] = devFixtureTracks("highlife", 1);
    assert.deepEqual(codes([era([{ ...fixture, hero: true }])]), ["hero-is-fixture"]);
    assert.deepEqual(codes([era([])]), ["playlist-empty"]);
    assert.deepEqual(codes([era([record(1), record(2, { hero: true })])]), ["hero-flag"], "exactly one hero");
    assert.deepEqual(codes([era([record(1, { hero: false })])]), ["hero-flag"]);
  });

  it("requires years inside the era unless a yearNote explains them", () => {
    assert.deepEqual(codes([era([record(1, { year: 1944 })])]), ["year-outside-era"]);
    assert.deepEqual(codes([era([record(1, { year: 1967 })])]), ["year-outside-era"]);
    assert.deepEqual(codes([era([record(1, { year: 1945 }), record(2, { year: 1966 }), record(3, { year: null })])]), []);
    assert.deepEqual(codes([era([record(1, { year: 1972, yearNote: "Later recording of a 1950s composition." })])]), []);
    assert.deepEqual(codes([era([record(1, { year: 1950.5 })])]), ["year-invalid"]);
    assert.deepEqual(codes([era([record(1, { year: null, yearLabel: "1950s" })])]), []);
    assert.deepEqual(codes([era([record(1, { yearLabel: " " })])]), ["year-label"]);
  });

  it("checks content types: tradition references have no artist / release year; others need an artist", () => {
    const ref = (overrides: Partial<Track> = {}) => record(1, { contentType: "TRADITION_REFERENCE", artist: null, tradition: "Yorùbá", year: null, ...overrides });
    assert.deepEqual(codes([era([ref()])]), []);
    assert.deepEqual(codes([era([ref({ artist: "Traditional" })])]), ["tradition-reference"], "no fake artist");
    assert.deepEqual(codes([era([ref({ year: 1950 })])]), ["tradition-reference"], "no fake release year");
    assert.deepEqual(codes([era([ref({ yearLabel: "1905" })])]), ["tradition-reference"]);
    assert.deepEqual(codes([era([ref({ tradition: undefined })])]), ["tradition-reference"]);
    assert.deepEqual(codes([era([record(1, { artist: null })])]), ["required-field"]);
    assert.deepEqual(codes([era([record(1, { contentType: "ARTIST_REFERENCE", year: null, yearLabel: "1930s" })])]), []);
    assert.deepEqual(codes([era([record(1, { tradition: "Hausa" })])]), ["tradition-reference"]);
    assert.deepEqual(codes([era([record(1, { contentType: "SINGLE" as Track["contentType"] })])]), ["content-type"]);
  });

  it("checks catalogue numbers against era and position, and keeps significance lines short", () => {
    assert.deepEqual(codes([era([record(1, { catalogueNumber: "A03-01" }), record(2, { catalogueNumber: "A03-02" })])]), []);
    assert.deepEqual(codes([era([record(1, { catalogueNumber: "A03-02" })])]), ["catalogue-number"]);
    assert.deepEqual(codes([era([record(1, { catalogueNumber: "A04-01" })])]), ["catalogue-number"]);
    assert.deepEqual(codes([era([record(1, { historicalNote: "One sentence. Two sentences." })])]), []);
    assert.deepEqual(codes([era([record(1, { historicalNote: "One. Two. Three sentences." })])]), ["significance"]);
    assert.deepEqual(codes([era([record(1, { historicalNote: `${"word ".repeat(60)}end.` })])]), ["significance"]);
  });

  it("requires development fixtures to be fully marked and to follow the archive records", () => {
    const fixtures = devFixtureTracks("highlife", 2);
    assert.deepEqual(codes([era([record(1), ...fixtures])]), []);
    assert.deepEqual(codes([era([record(1), fixtures[0], record(2)])]), ["fixture-before-archive"]);
    // Partially marked: looks like a fixture but plays as an archive record, or vice versa.
    assert.deepEqual(codes([era([record(1), { ...fixtures[0], audioAvailability: "pending" }])]), ["fixture-marking"]);
    assert.deepEqual(codes([era([record(1), record(2, { artist: DEV_FIXTURE_ARTIST })])]), ["fixture-marking"]);
    assert.deepEqual(codes([era([record(1), record(2, { status: "placeholder" })])]), ["fixture-marking"]);
    assert.deepEqual(codes([era([record(1), { ...fixtures[0], coverUrl: "/textures/records/highlife/x/sleeve-front.webp" }])]), ["fixture-artwork"]);
  });

  it("requires explicit, convention-following audio references", () => {
    const url = recordAudioPath("highlife", "test-record-1", "mp3");
    assert.deepEqual(codes([era([record(1, { audioAvailability: "available", audioUrl: url })])]), []);
    assert.deepEqual(codes([era([record(1, { audioAvailability: "preview", audioUrl: recordAudioPath("highlife", "test-record-1", "m4a", true) })])]), []);
    assert.deepEqual(codes([era([record(1, { audioAvailability: "available" })])]), ["audio-url-required"]);
    assert.deepEqual(codes([era([record(1, { audioAvailability: "preview" })])]), ["audio-url-required"]);
    for (const availability of ["pending", "unavailable"] as const) {
      assert.deepEqual(codes([era([record(1, { audioAvailability: availability, audioUrl: url })])]), ["audio-url-not-permitted"], availability);
    }
    for (const bad of [
      "/audio/naija/test-record-1.mp3", // wrong era folder
      "/audio/highlife/test-record-2.mp3", // another record's file
      "/audio/highlife/test-record-1.preview.mp3", // excerpt declared as the full recording
      "/audio/highlife/test-record-1.exe",
      "https://example.com/test-record-1.mp3",
    ]) {
      assert.deepEqual(codes([era([record(1, { audioAvailability: "available", audioUrl: bad })])]), ["audio-path"], bad);
    }
    assert.deepEqual(codes([era([record(1, { audioAvailability: "preview", audioUrl: url })])]), ["audio-path"], "preview needs the .preview file");
    assert.deepEqual(codes([era([record(1, { audioAvailability: "maybe" as Track["audioAvailability"] })])]), ["audio-availability"]);
  });

  it("keeps an unavailable record a valid museum entry (catalogue presence ≠ playable audio)", () => {
    assert.deepEqual(codes([era([record(1, { audioAvailability: "unavailable", historicalNote: "Shown, never played." })])]), []);
  });

  it("accepts optional duration, rights and sleeve back, and checks them", () => {
    const full = record(1, {
      durationSeconds: 245.3,
      rights: { holder: "Test Holder", licence: "TEST-1" },
      coverUrl: recordArtworkPath("highlife", "test-record-1", "sleeve-front"),
      vinylLabelUrl: recordArtworkPath("highlife", "test-record-1", "label", "png"),
      sleeveBackUrl: recordArtworkPath("highlife", "test-record-1", "sleeve-back", "jpg"),
    });
    assert.deepEqual(codes([era([full])]), []);
    assert.deepEqual(codes([era([record(1, { durationSeconds: null })])]), []);
    for (const bad of [0, -3, Number.NaN, Number.POSITIVE_INFINITY]) assert.deepEqual(codes([era([record(1, { durationSeconds: bad })])]), ["duration-invalid"], String(bad));
  });

  it("requires artwork at /textures/records/<era>/<track>/<part>.<ext>, the right part per field", () => {
    for (const [field, url] of [
      ["coverUrl", recordArtworkPath("highlife", "test-record-1", "label")], // label art on the sleeve
      ["vinylLabelUrl", recordArtworkPath("naija", "test-record-1", "label")], // wrong era
      ["sleeveBackUrl", "/textures/records/highlife/test-record-1/sleeve-back.gif"],
      ["coverUrl", "/textures/covers/highlife/test-record-1.webp"], // old layout
      ["coverUrl", "https://example.com/cover.jpg"],
    ] as const) {
      assert.deepEqual(codes([era([record(1, { [field]: url })])]), ["artwork-path"], `${field} ${url}`);
    }
  });
});

describe("playlists of any size (circular inside one era)", () => {
  for (const size of [1, 3, 5, 10, 20]) {
    it(`size ${size}: NEXT / PREVIOUS wrap through every record exactly once`, () => {
      const playlist = Array.from({ length: size }, (_, i) => record(i + 1));
      assert.deepEqual(validateArchive([era(playlist)]), []);
      for (const step of [1, -1] as const) {
        let id = playlist[0].id;
        const visited: string[] = [];
        for (let i = 0; i < size; i++) {
          id = stepInPlaylist(playlist, id, step).id;
          visited.push(id);
        }
        assert.equal(id, playlist[0].id, "back at the hero after one lap");
        assert.equal(new Set(visited).size, size);
      }
      assert.equal(stepInPlaylist(playlist, playlist[size - 1].id, 1).id, playlist[0].id, "last → first");
      assert.equal(stepInPlaylist(playlist, playlist[0].id, -1).id, playlist[size - 1].id, "first → last");
    });
  }

  it("cannot step from a record that is not in the playlist", () => {
    assert.throws(() => stepInPlaylist([record(1), record(2)], "test-record-3", 1), /not in this playlist/);
  });
});

// ---------------------------------------------------------------------------
// Record sets and development fixtures
// ---------------------------------------------------------------------------

describe("record sets: production archive vs development fixtures", () => {
  it("?records=dev selects the fixtures in development only; production always plays the archive", () => {
    assert.equal(resolveRecordSet("?records=dev", { NODE_ENV: "development" }), "dev");
    assert.equal(resolveRecordSet("?records=dev", { NODE_ENV: "production" }), "archive");
    assert.equal(resolveRecordSet("", { NODE_ENV: "development" }), "archive");
    assert.equal(resolveRecordSet("?records=archive", { NODE_ENV: "development" }), "archive");
    assert.equal(resolveRecordSet(undefined, { ARCHIVE_RECORDS: "dev" }), "dev");
    assert.equal(resolveRecordSet(undefined, { NODE_ENV: "production", ARCHIVE_RECORDS: "dev" }), "archive");
  });

  it("the development set is each era's hero + its fixtures; fixtures never leak into the archive", () => {
    for (const eraId of ERA_IDS) {
      assert.deepEqual(
        RECORD_SETS.dev[eraId].map((t) => t.id),
        [HERO_TRACK_IDS[eraId], ...devFixtureTracks(eraId).map((t) => t.id)],
      );
      assert.ok(RECORD_SETS.archive[eraId].every((t) => !isDevFixture(t)), eraId);
    }
  });

  it("fixtures carry every development marker and stable, numbered ids", () => {
    const fixtures = devFixtureTracks("roots", 5);
    assert.deepEqual(
      fixtures.map((t) => t.id),
      [1, 2, 3, 4, 5].map((n) => `roots${DEV_FIXTURE_ID_MARKER}${n}`),
    );
    for (const t of fixtures) assert.deepEqual([t.audioAvailability, t.status, t.artist, t.audioUrl, t.hero, t.catalogueNumber], ["development", "placeholder", DEV_FIXTURE_ARTIST, null, false, undefined]);
  });
});

// ---------------------------------------------------------------------------
// Development tones and artwork
// ---------------------------------------------------------------------------

describe("development tones and artwork are keyed by role, for both record sets", () => {
  it("archive entries A…E by catalogue position; fixture tones cycle B, C", () => {
    assert.deepEqual([0, 1, 2, 3, 4, 5].map(fixtureVariant), [1, 2, 1, 2, 1, 2]);
    assert.deepEqual([0, 1, 2, 3, 4, 5].map(archiveVariant), [0, 1, 2, 3, 4, 0]);
    for (const eraId of ERA_IDS) {
      assert.deepEqual(
        DEV_AUDIO_ASSETS.filter((a) => a.eraId === eraId).map((a) => [a.role, a.variant]),
        [...[0, 1, 2, 3, 4].map((v) => ["archive", v]), ...Array.from({ length: DEV_FIXTURES_PER_ERA }, (_, k) => ["fixture", fixtureVariant(k)])],
      );
    }
  });

  it("maps all 40 uploaded MP3s to production identities, without development tones", () => {
    const uploaded = ERA_IDS.flatMap((era) => readdirSync(publicFile(`/audio/${era}`)).filter((file) => file.endsWith(".mp3")).map((file) => `/audio/${era}/${file}`));
    assert.equal(uploaded.length, 40);
    assert.equal(new Set(Object.values(PRODUCTION_AUDIO_URLS)).size, 40);
    assert.deepEqual(new Set(ARCHIVE_ENTRIES.map((t) => t.audioUrl)), new Set(uploaded));
    for (const t of ARCHIVE_ENTRIES) {
      const entry = getAudioEntry(t.eraId, t.id);
      assert.equal(entry.kind, "recording", t.id);
      assert.equal(entry.url, PRODUCTION_AUDIO_URLS[t.id]);
      assert.notEqual(entry.url, DEV_AUDIO_PLACEHOLDERS[t.id]);
      assert.ok(entry.url?.startsWith(`/audio/${t.eraId}/${t.catalogueNumber!.slice(-2)}-`), t.id);
      assert.ok(existsSync(publicFile(entry.url!)), entry.url!);
    }
    const third = ARCHIVE_TRACKS_BY_ERA.recording[2];
    assert.deepEqual([third.id, third.artist, third.title, third.year, third.yearLabel], ["irewolede-denge-orin-asape-eko", "Irewolede Denge", "Orin Asape Eko", null, undefined]);
    assert.equal(third.audioUrl, "/audio/recording/03-irewolede-denge-orin-asape-eko.mp3");
    assert.ok(!ARCHIVE_ENTRIES.some((t) => t.id === "tunde-king-soja-idumota"));
  });

  it("validates supplied filenames only for their mapped identity", () => {
    const roots = ERAS[0];
    const swapped = roots.tracks.map((t, i) => i === 0 ? { ...t, audioUrl: roots.tracks[1].audioUrl } : t);
    assert.ok(validateArchive([{ ...roots, tracks: swapped }]).some((issue) => issue.code === "audio-path"));
  });

  it("every archive entry has generated museum artwork on disk; fixtures keep their development art", () => {
    assert.equal(ARCHIVE_ARTWORK.length, 40);
    for (const asset of ARCHIVE_ARTWORK) {
      assert.ok(existsSync(publicFile(asset.labelUrl)), asset.labelUrl);
      assert.ok(existsSync(publicFile(asset.sleeveUrl)), asset.sleeveUrl);
    }
    const fixtureIds = new Set(ERA_IDS.flatMap((eraId) => DEV_TRACKS_BY_ERA[eraId].filter(isDevFixture).map((t) => t.id)));
    assert.deepEqual(new Set(DEV_RECORD_ARTWORK.map((a) => a.trackId)), fixtureIds);
    for (const eraId of ERA_IDS) {
      assert.deepEqual(
        DEV_RECORD_ARTWORK.filter((a) => a.eraId === eraId).map((a) => [a.letter, a.fixtureIndex]),
        Array.from({ length: DEV_FIXTURES_PER_ERA }, (_, k) => [String.fromCharCode(66 + k), k]),
      );
    }
  });
});

describe("record artwork resolution", () => {
  it("production entries show their generated archive art; fixtures their development art", () => {
    for (const t of ARCHIVE_ENTRIES) {
      assert.deepEqual(resolveRecordArtwork(t), {
        kind: "archive",
        labelUrl: archiveArtworkUrl(t.eraId, t.id, "label"),
        sleeveUrl: archiveArtworkUrl(t.eraId, t.id, "sleeve"),
        sleeveBackUrl: null,
      });
    }
    for (const eraId of ERA_IDS) for (const t of DEV_TRACKS_BY_ERA[eraId].filter(isDevFixture)) assert.equal(resolveRecordArtwork(t).kind, "development", t.id);
  });

  it("supplied artwork wins per part; the generated art fills the rest; remote art is never loaded", () => {
    const hero = getHeroTrack("highlife");
    const front = recordArtworkPath("highlife", hero.id, "sleeve-front");
    assert.deepEqual(resolveRecordArtwork({ ...hero, coverUrl: front }), { kind: "licensed", labelUrl: archiveArtworkUrl("highlife", hero.id, "label"), sleeveUrl: front, sleeveBackUrl: null });
    assert.equal(resolveRecordArtwork({ ...hero, coverUrl: "https://example.com/x.jpg" }).sleeveUrl, archiveArtworkUrl("highlife", hero.id, "sleeve"));
    const synthetic = record(1, { coverUrl: recordArtworkPath("highlife", "test-record-1", "sleeve-front") });
    assert.equal(resolveRecordArtwork(synthetic).labelUrl, null, "no archive art for a record outside the archive");
    assert.equal(resolveRecordArtwork(record(1)).kind, "model-placeholder");
  });
});
