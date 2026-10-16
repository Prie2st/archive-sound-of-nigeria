import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { chooseExperienceQuality, isExperienceQuality, QUALITY_SETTINGS } from "./quality.ts";

describe("experience quality policy", () => {
  it("keeps a wide fine-pointer desktop HIGH", () => {
    assert.equal(chooseExperienceQuality({ width: 1440, coarsePointer: false }), "high");
  });
  it("uses MEDIUM for tablets/touch and compact desktop windows", () => {
    assert.equal(chooseExperienceQuality({ width: 1024, coarsePointer: true }), "medium");
    assert.equal(chooseExperienceQuality({ width: 800, coarsePointer: false }), "medium");
  });
  it("keeps phones on MEDIUM, including browsers without memory hints", () => {
    assert.equal(chooseExperienceQuality({ width: 390, coarsePointer: true }), "medium");
    assert.equal(chooseExperienceQuality({ width: 320, coarsePointer: false }), "medium");
    assert.equal(chooseExperienceQuality({ width: 430, coarsePointer: true, deviceMemory: 4 }), "medium");
  });
  it("reserves LOW for an explicit constrained-memory hint", () => {
    assert.equal(chooseExperienceQuality({ width: 390, coarsePointer: true, deviceMemory: 2 }), "low");
    assert.equal(chooseExperienceQuality({ width: 1440, coarsePointer: false, deviceMemory: 2 }), "low");
    assert.equal(chooseExperienceQuality({ width: 1440, coarsePointer: false, deviceMemory: 4 }), "high");
  });
  it("accepts only the three DEV override values and keeps the requested DPR caps", () => {
    for (const tier of ["high", "medium", "low"]) assert(isExperienceQuality(tier));
    for (const tier of [null, "auto", "HIGH", "ultra"]) assert(!isExperienceQuality(tier));
    assert.deepEqual(Object.values(QUALITY_SETTINGS).map(settings => settings.maxDpr), [2, 2, 1]);
    assert.equal(QUALITY_SETTINGS.medium.antialias, true);
    assert.equal(QUALITY_SETTINGS.medium.activeProps, true);
  });
});
