/**
 * Keyboard-focus regression (docs/FOCUS_MODE.md §9): a POINTER click on an overlay button hands keyboard
 * focus back to the page, so a later Enter focuses a station instead of pressing SOUND again; a
 * KEYBOARD activation (Tab + Enter / Space, detail 0) keeps focus on the button. Run with: npm test
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isPointerActivation, releaseFocusAfterPointer } from "./pointerActivation.ts";

const button = () => {
  const target = { blurred: 0, blur() { target.blurred++; } };
  return target;
};

describe("pointer activation releases focus; keyboard activation keeps it", () => {
  it("a mouse / touch click (detail ≥ 1) blurs the button", () => {
    for (const detail of [1, 2, 3]) {
      const target = button();
      assert.equal(isPointerActivation({ detail }), true);
      releaseFocusAfterPointer({ detail, currentTarget: target });
      assert.equal(target.blurred, 1, `detail ${detail}`);
    }
  });

  it("Enter / Space on a focused button (detail 0) leaves focus where it is", () => {
    const target = button();
    assert.equal(isPointerActivation({ detail: 0 }), false);
    releaseFocusAfterPointer({ detail: 0, currentTarget: target });
    assert.equal(target.blurred, 0);
  });

  it("tolerates a missing currentTarget", () => {
    assert.doesNotThrow(() => releaseFocusAfterPointer({ detail: 1, currentTarget: null }));
  });
});
