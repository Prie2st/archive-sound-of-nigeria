import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { describe, it } from "node:test";
import { ARCHIVE_ENTRIES } from "../data/tracks.ts";
import { ARCHIVE_THESIS, ERA_IDS } from "../data/types.ts";
import { HOME_MEDIA, HOME_MEDIA_LIST, getHomeMedia } from "./homeMedia.ts";
import {
  AFROBEAT,
  BEATS,
  CHAPTERS,
  CITED_RECORDS,
  DISPLAY_LINES,
  FINALE,
  INDEPENDENCE,
  LINEAGE,
  MOBILE_BREAK,
  OPENING,
  PLACED_MEDIA,
  STORY_COPY,
  SYSTEMS,
  citesOwnEra,
  resolveRecord,
  type BeatId,
} from "./homeStory.ts";

const allCopy = JSON.stringify(STORY_COPY) + JSON.stringify(HOME_MEDIA_LIST);
const beatIndex = (id: BeatId) => BEATS.findIndex((beat) => beat.id === id);
const publicFile = (src: string) => new URL(`../../public${src}`, import.meta.url);

describe("homepage story structure", () => {
  it("opens sparse and ends with the lineage and the finale", () => {
    assert.equal(BEATS[0].id, "opening");
    assert.deepEqual(BEATS.slice(-2).map((beat) => beat.id), ["lineage", "finale"]);
    assert.equal(new Set(BEATS.map((beat) => beat.id)).size, BEATS.length);
    assert.equal(CHAPTERS.length, BEATS.length);
  });

  it("is driven by historical turning points, in order", () => {
    const order: BeatId[] = ["systems", "record1922", "city", "king1937", "highlife", "independence", "war1967", "explosion", "afrobeat", "modernities", "festac", "localsound", "youth", "kennis", "naija", "digital", "afrobeats", "onedance", "essence", "global"];
    const positions = order.map(beatIndex);
    assert.ok(positions.every((at) => at > 0), "every turning point has a beat");
    assert.deepEqual([...positions].sort((a, b) => a - b), positions, "in historical order");
    assert.deepEqual(
      BEATS.filter((beat) => beat.year).map((beat) => beat.year),
      ["1922", "1937", "1960", "1967", "1977", "1998", "2016", "2020"],
    );
  });

  it("follows the museum's eras in order, so the indicator never jumps back", () => {
    const eras = BEATS.filter((beat) => beat.era).map((beat) => ERA_IDS.indexOf(beat.era!));
    assert.deepEqual([...eras].sort((a, b) => a - b), eras);
    assert.deepEqual([...new Set(eras)], [0, 1, 2, 3, 4, 5, 6, 7], "all eight eras appear");
  });

  it("treats 1914 as context inside the systems beat, never as the beginning", () => {
    assert.equal(SYSTEMS.context.year, "1914");
    assert.ok(!BEATS.some((beat) => beat.year === "1914"));
    assert.match(SYSTEMS.context.turn, /no single Nigerian sound/);
  });

  it("keeps the thesis for the end", () => {
    assert.deepEqual([...LINEAGE.thesis], [...ARCHIVE_THESIS]);
    const earlier = Object.entries(STORY_COPY).filter(([name]) => name !== "LINEAGE" && name !== "FINALE");
    const earlierText = JSON.stringify(earlier).toUpperCase();
    // "tradition" and "localisation" occur in ordinary prose; the thesis itself (with ADAPTATION / EXPORTATION) waits for the end
    for (const stage of ["ADAPTATION", "EXPORTATION"]) assert.ok(!earlierText.includes(stage), `${stage} appears before the lineage`);
    assert.ok(!JSON.stringify(OPENING).toUpperCase().includes("EXPORTATION"));
  });

  it("states the archive's real totals", () => {
    assert.deepEqual(FINALE.figures.map((figure) => figure.value), [String(ERA_IDS.length), String(ARCHIVE_ENTRIES.length), "126"]);
  });

  it("authors every display line, including the phone breaks", () => {
    for (const lines of DISPLAY_LINES) {
      assert.ok(lines.length > 0);
      for (const line of lines) {
        assert.ok(line.trim().length > 0);
        assert.ok(line.split(MOBILE_BREAK).join(" ").length <= 24, `display line too long: "${line}"`);
        for (const part of line.split(MOBILE_BREAK)) assert.ok(part.length <= 20, `phone segment too long: "${part}"`);
      }
    }
  });

  it("uses correct diacritics and conservative wording", () => {
    assert.ok(!/\bYoruba\b/.test(allCopy), "Yorùbá");
    assert.ok(!/\b(Dundun|Juju|Bata|Oriki|Ade)\b/.test(allCopy), "Dùndún / Jùjú / Bàtá / Oríkì / Adé");
    assert.ok(!/(first ever|the first Nigerian|greatest|biggest|invented|single-handedly|most successful|created afrobeats)/i.test(allCopy));
  });
});

describe("homepage records", () => {
  it("cites only archive records, each inside its own era", () => {
    for (const era of ERA_IDS) for (const ref of CITED_RECORDS[era] ?? []) assert.ok(citesOwnEra(era, ref), `${ref.id} is not in ${era}`);
  });

  it("words records as the catalogue does", () => {
    assert.equal(resolveRecord({ id: "tunde-king-aronke-macaulay" }).date, "1937");
    assert.equal(resolveRecord({ id: "wizkid-tems-essence" }).date, "2020");
    assert.equal(resolveRecord({ id: "king-sunny-ade-ja-funmi", date: false }).date, null);
    assert.throws(() => resolveRecord({ id: "not-in-the-archive" }));
  });
});

describe("homepage media", () => {
  const placed = Object.values(PLACED_MEDIA).flat();

  it("places every media item, and every placed id exists", () => {
    for (const id of placed) assert.ok(HOME_MEDIA[id], id);
    for (const media of HOME_MEDIA_LIST) assert.ok(placed.includes(media.id), `${media.id} is never placed`);
    for (const fragment of LINEAGE.fragments) assert.ok(placed.includes(fragment.media), "the lineage reuses earlier evidence only");
  });

  it("gives every image a historical reason and complete fields", () => {
    for (const media of HOME_MEDIA_LIST) {
      for (const field of ["proves", "label", "alt", "caption", "credit", "objectPosition"] as const) assert.ok(media[field].trim().length > 0, `${media.id}.${field}`);
      assert.match(media.aspectRatio, /^\d+\/\d+$/);
    }
  });

  it("keeps placeholders replaceable through the mapping, and finals local with a credit", () => {
    for (const media of HOME_MEDIA_LIST) {
      if (media.status === "placeholder") {
        assert.equal(media.src, null, media.id);
        assert.ok(media.placeholder, `${media.id} needs its archive-card text`);
        assert.match(media.credit, /PLACEHOLDER/);
        continue;
      }
      assert.ok(media.src && /^\/(images\/home|textures\/archive)\//.test(media.src), `${media.id} must be a local file`);
      assert.ok(existsSync(publicFile(media.src)), `${media.src} is missing`);
      assert.ok(!/PLACEHOLDER/.test(media.credit));
    }
    assert.equal(getHomeMedia("sleeve-tunde-king-aronke-macaulay").status, "final");
    assert.throws(() => getHomeMedia("missing"));
  });

  it("uses Fela and Independence imagery only where they belong", () => {
    const where = (id: string) => (Object.entries(PLACED_MEDIA) as [BeatId, readonly string[]][]).filter(([, ids]) => ids.includes(id)).map(([beat]) => beat);
    assert.deepEqual(where(AFROBEAT.media), ["afrobeat"]);
    assert.deepEqual(where(INDEPENDENCE.media), ["independence"]);
    assert.deepEqual(where("sleeve-tunde-king-aronke-macaulay"), ["city", "king1937"], "the 1937 sleeve, not a random photograph");
  });
});
