/**
 * Content-model validation (era + track data, and its join with the hall layout).
 * Run with: npm test   (Node's built-in test runner; Node strips the TypeScript types)
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ERAS,
  createInitialEraAudioState,
  getEra,
  getEraByIndex,
  getEraLoopDistance,
  getEraLoopOffset,
  getHeroTrack,
  getNextEra,
  getNextTrack,
  getPreviousEra,
  getPreviousTrack,
  getTrack,
} from "./eras.ts";
import { STATION_SLOTS } from "./hallLayout.ts";
import { qualityForLoopDistance } from "./stationLod.ts";
import { ERA_IDS, type EraId } from "./types.ts";

describe("eras", () => {
  it("has exactly eight eras in canonical order", () => {
    assert.equal(ERAS.length, 8);
    assert.deepEqual(
      ERAS.map((e) => e.id),
      [...ERA_IDS],
    );
    assert.deepEqual(
      ERAS.map((e) => e.title),
      ["ROOTS", "RECORDING", "HIGH-LIFE", "EXPLOSION", "TRANSITION", "NAIJA", "AFROBEATS", "GLOBAL"],
    );
  });

  it("has unique ids, slugs and indices 0–7 with matching display numbers", () => {
    assert.equal(new Set(ERAS.map((e) => e.id)).size, 8);
    assert.equal(new Set(ERAS.map((e) => e.slug)).size, 8);
    ERAS.forEach((era, i) => {
      assert.equal(era.index, i);
      assert.equal(era.number, String(i + 1).padStart(2, "0"));
    });
  });

  it("covers 1900–2026 with contiguous, correctly labelled date ranges", () => {
    assert.equal(ERAS[0].startYear, 1900);
    assert.equal(ERAS[7].endYear, 2026);
    ERAS.forEach((era, i) => {
      assert.ok(era.startYear < era.endYear, era.id);
      assert.equal(era.dateLabel, `${era.startYear}–${era.endYear}`);
      if (i > 0) assert.equal(era.startYear, ERAS[i - 1].endYear + 1, `${era.id} follows ${ERAS[i - 1].id}`);
    });
  });

  it("joins the hall layout by id and index", () => {
    assert.equal(STATION_SLOTS.length, ERAS.length);
    ERAS.forEach((era) => {
      assert.equal(STATION_SLOTS[era.index].eraId, era.id);
      assert.equal(STATION_SLOTS[era.index].index, era.index);
    });
  });
});

describe("tracks", () => {
  it("every era's hero track belongs to it, comes first and is not a placeholder", () => {
    for (const era of ERAS) {
      const hero = getHeroTrack(era.id);
      assert.equal(hero.id, era.heroTrackId);
      assert.equal(hero.eraId, era.id);
      assert.equal(era.tracks[0].id, era.heroTrackId);
      assert.notEqual(hero.status, "placeholder");
    }
  });

  it("every track's eraId matches its parent era, and track ids are globally unique", () => {
    const ids = new Set<string>();
    for (const era of ERAS) {
      for (const track of era.tracks) {
        assert.equal(track.eraId, era.id, `${track.id} in ${era.id}`);
        assert.ok(!ids.has(track.id), `duplicate track id ${track.id}`);
        ids.add(track.id);
      }
    }
  });

  it("marks every development placeholder as such", () => {
    for (const era of ERAS) {
      for (const track of era.tracks) {
        const looksPlaceholder = track.id.includes("dev-placeholder") || track.artist === "DEV PLACEHOLDER";
        assert.equal(looksPlaceholder, track.status === "placeholder", track.id);
      }
    }
  });
});

describe("era navigation (wraps across all eight)", () => {
  it("GLOBAL → ROOTS and ROOTS ← GLOBAL", () => {
    assert.equal(getNextEra("global").id, "roots");
    assert.equal(getPreviousEra("roots").id, "global");
  });

  it("steps in order and returns to the start after eight steps", () => {
    let id = ERAS[0].id;
    for (let i = 1; i <= 8; i++) {
      id = getNextEra(id).id;
      assert.equal(id, ERAS[i % 8].id);
    }
    for (let i = 1; i <= 8; i++) {
      id = getPreviousEra(id).id;
      assert.equal(id, ERAS[(8 - i) % 8].id);
    }
  });

  it("wraps any integer index", () => {
    assert.equal(getEraByIndex(-1).id, "global");
    assert.equal(getEraByIndex(8).id, "roots");
    assert.equal(getEraByIndex(19).id, getEra("explosion").id); // 19 mod 8 = 3
  });
});

describe("track navigation (wraps inside one era, never crosses eras)", () => {
  it("next/previous cycle through exactly this era's playlist and back", () => {
    for (const era of ERAS) {
      for (const step of [getNextTrack, getPreviousTrack]) {
        let trackId = era.heroTrackId;
        const visited = new Set<string>();
        for (let i = 0; i < era.tracks.length; i++) {
          const track = step(era.id, trackId);
          assert.equal(track.eraId, era.id);
          assert.ok(getTrack(era.id, track.id));
          visited.add(track.id);
          trackId = track.id;
        }
        assert.equal(trackId, era.heroTrackId, `${era.id} wraps back to its hero`);
        assert.equal(visited.size, era.tracks.length);
      }
    }
  });

  it("never resolves or steps from a track of another era", () => {
    const afrobeatsHero = getEra("afrobeats").heroTrackId;
    assert.equal(getTrack("highlife", afrobeatsHero), undefined);
    assert.throws(() => getNextTrack("highlife", afrobeatsHero));
    assert.throws(() => getPreviousTrack("highlife", afrobeatsHero));
  });

  it("the last track of GLOBAL wraps to GLOBAL's first track, not to ROOTS", () => {
    const global = getEra("global");
    const last = global.tracks[global.tracks.length - 1];
    assert.equal(getNextTrack("global", last.id).id, global.tracks[0].id);
  });
});

describe("listening state", () => {
  it("starts on the hero track, unvisited", () => {
    for (const era of ERAS) {
      assert.deepEqual(createInitialEraAudioState(era.id), { eraId: era.id, selectedTrackId: era.heroTrackId, visited: false });
    }
  });
});

describe("circular era distance and station quality tiers", () => {
  const tiersFor = (active: EraId) =>
    Object.fromEntries(ERAS.map((era) => [era.id, qualityForLoopDistance(getEraLoopDistance(active, era.id))]));

  it("measures loop offsets and distances with wrapping", () => {
    assert.equal(getEraLoopOffset("roots", "recording"), 1);
    assert.equal(getEraLoopOffset("global", "roots"), 1);
    assert.equal(getEraLoopOffset("roots", "global"), 7);
    assert.equal(getEraLoopDistance("roots", "global"), 1);
    assert.equal(getEraLoopDistance("global", "roots"), 1);
    assert.equal(getEraLoopDistance("roots", "transition"), 4);
    assert.equal(getEraLoopDistance("afrobeats", "recording"), 3);
    for (const a of ERAS) {
      for (const b of ERAS) {
        assert.equal(getEraLoopDistance(a.id, b.id), getEraLoopDistance(b.id, a.id));
        assert.ok(getEraLoopDistance(a.id, b.id) >= 0 && getEraLoopDistance(a.id, b.id) <= 4);
      }
    }
  });

  it("ROOTS active: GLOBAL and RECORDING are nearby", () => {
    const tiers = tiersFor("roots");
    assert.equal(tiers.roots, "active");
    assert.equal(tiers.global, "nearby");
    assert.equal(tiers.recording, "nearby");
  });

  it("GLOBAL active: AFROBEATS and ROOTS are nearby", () => {
    const tiers = tiersFor("global");
    assert.equal(tiers.global, "active");
    assert.equal(tiers.afrobeats, "nearby");
    assert.equal(tiers.roots, "nearby");
  });

  it("every active era gives 1 active, 2 nearby (previous / next) and 5 distant stations", () => {
    for (const active of ERAS) {
      const tiers = tiersFor(active.id);
      const count = (q: string) => Object.values(tiers).filter((t) => t === q).length;
      assert.deepEqual([count("active"), count("nearby"), count("distant")], [1, 2, 5]);
      assert.equal(tiers[getPreviousEra(active.id).id], "nearby");
      assert.equal(tiers[getNextEra(active.id).id], "nearby");
    }
  });
});
