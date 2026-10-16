/**
 * Production UI presentation rules (docs/FINAL_UI.md): caption status line, ROOTS / artist-reference
 * wording through describeTrack, year and loop labels. Run with: npm test
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { devFixtureTracks } from "../data/devFixtures.ts";
import { ERAS, getHeroTrack } from "../data/eras.ts";
import { describeTrack } from "../data/trackDisplay.ts";
import { ARCHIVE_ENTRIES } from "../data/tracks.ts";
import { captionStatus, eraYears, loopPosition, type CaptionAudioState } from "./captionModel.ts";

const stable = { changing: false, exitPending: false };
const audio = (overrides: Partial<CaptionAudioState> = {}): CaptionAudioState => ({ activeEraId: "roots", selectedKind: "development-placeholder", error: null, ...overrides });
const roots = getHeroTrack("roots");

describe("caption status line", () => {
  it("acknowledges a record change without a queue count, and a deferred close", () => {
    assert.equal(captionStatus({ changing: true, exitPending: false }, audio(), "roots", roots), "Changing record");
    assert.equal(captionStatus({ changing: true, exitPending: true }, audio(), "roots", roots), "Changing record · closing after");
  });

  it("calls a development tone under an archive entry 'Archive audio pending' (never 'development tone')", () => {
    assert.equal(captionStatus(stable, audio(), "roots", roots), "Archive audio pending");
    const [fixture] = devFixtureTracks("roots", 1);
    assert.equal(captionStatus(stable, audio(), "roots", fixture), "Development audio placeholder");
  });

  it("keeps a record without audio a complete entry with a restrained note", () => {
    const failed = audio({ selectedKind: null, error: { trackId: roots.id } });
    assert.equal(captionStatus(stable, failed, "roots", { ...roots, audioAvailability: "pending", audioUrl: null }), "Archive audio pending");
    assert.equal(captionStatus(stable, failed, "roots", { ...roots, audioAvailability: "unavailable" }), "Not available for listening");
    assert.equal(captionStatus(stable, failed, "roots", { ...roots, audioAvailability: "available", audioUrl: "/audio/roots/x.mp3" }), "Recording unavailable");
  });

  it("names a licensed excerpt, says nothing for a full recording or another era", () => {
    assert.equal(captionStatus(stable, audio({ selectedKind: "preview" }), "roots", roots), "Audio preview (excerpt)");
    assert.equal(captionStatus(stable, audio({ selectedKind: "recording" }), "roots", roots), null);
    assert.equal(captionStatus(stable, audio({ activeEraId: "global" }), "roots", roots), null);
  });
});

describe("caption wording per content type", () => {
  it("ROOTS: tradition, listening reference, no artist, no date", () => {
    const d = describeTrack(roots);
    assert.deepEqual([d.catalogueNumber, d.title, d.byline, d.kicker, d.date], ["A01-01", "Dùndún / Talking Drum", "Yorùbá musical tradition", "Listening reference", null]);
  });

  it("early artist references are listening references with their date range", () => {
    const bakare = describeTrack(ARCHIVE_ENTRIES.find((t) => t.id === "ayinde-bakare-early-juju-recordings")!);
    assert.deepEqual([bakare.byline, bakare.kicker, bakare.date], ["Ayinde Bakare", "Listening reference", "1930s–40s"]);
  });
});

describe("era labels", () => {
  it("formats years and the loop position; GLOBAL → ROOTS reads 08 / 08 → 01 / 08", () => {
    assert.equal(eraYears(ERAS[3]), "1967 — 1989");
    assert.deepEqual(
      ERAS.map((e) => loopPosition(e.index, ERAS.length)),
      ["01 / 08", "02 / 08", "03 / 08", "04 / 08", "05 / 08", "06 / 08", "07 / 08", "08 / 08"],
    );
  });
});
