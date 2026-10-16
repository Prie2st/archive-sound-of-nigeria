/**
 * Focus mode state machine: eligibility, frozen travel, input lock, exact restore,
 * interrupts, and the GLOBAL ↔ ROOTS / arbitrary-lap cases. Run with: npm test
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getHallLayout } from "../data/hallLayout.ts";
import { bezierPoint, easeInOut, FOCUS_CONFIG, FocusController, transitionControlPoint, transitionDuration, type FocusExitRecord } from "./focus.ts";
import { resolveTravelConfig, selectActiveStation, TRAVEL_CONFIG, TravelController, WHEEL_DELTA_PIXEL } from "./travel.ts";

const layout = getHallLayout();
const ROOTS = 0;
const RECORDING = 1;
const GLOBAL = 7;
const active = (travel: TravelController) =>
  selectActiveStation(travel.loopProgress, -1, layout.stations, TRAVEL_CONFIG.activeEraHysteresis);
const newTravel = (start: number) => new TravelController(resolveTravelConfig(false), layout.length, start);
/** Runs `seconds` of frames: focus transition + travel physics (as the CameraRig does). */
const run = (focus: FocusController, travel: TravelController, seconds: number, fps = 60) => {
  for (let i = 0; i < seconds * fps; i++) {
    focus.step(1 / fps, travel);
    travel.step(1 / fps, 0);
  }
};

describe("focus eligibility", () => {
  it("only the ACTIVE station can be focused", () => {
    const travel = newTravel(layout.stations[RECORDING].progress);
    const focus = new FocusController();
    const current = active(travel);
    assert.equal(current, RECORDING);
    assert.equal(focus.requestFocus(ROOTS, current, travel), false, "nearby station");
    assert.equal(focus.requestFocus(5, current, travel), false, "distant station");
    assert.equal(focus.requestFocus(-1, current, travel), false);
    assert.equal(focus.mode, "TRAVEL");
    assert.equal(travel.locked, false);
    assert.equal(focus.requestFocus(RECORDING, current, travel), true);
    assert.equal(focus.mode, "FOCUS_TRANSITION_IN");
    assert.equal(focus.station, RECORDING);
  });
});

describe("travel is frozen during focus", () => {
  it("freezes absoluteProgress exactly, discards momentum and ignores all travel input", () => {
    const travel = newTravel(4.7362);
    travel.addImpulse(5);
    run(new FocusController(), travel, 0.5); // moving
    const before = travel.absoluteProgress;
    assert.ok(travel.velocity > 0);
    const focus = new FocusController();
    assert.ok(focus.requestFocus(active(travel), active(travel), travel));
    assert.equal(travel.velocity, 0, "no hidden momentum");
    for (let i = 0; i < 300; i++) {
      travel.addWheel(120, WHEEL_DELTA_PIXEL, 800);
      travel.addDrag(-40);
      travel.addKey(1, i);
      travel.devJumpTo(0.5);
      focus.step(1 / 60, travel);
      travel.step(1 / 60, 0);
      if (focus.mode === "TRAVEL") break;
      assert.equal(travel.absoluteProgress, before, `frozen in ${focus.mode}`);
      assert.equal(travel.velocity, 0);
    }
    assert.equal(focus.mode, "FOCUS");
    assert.equal(focus.savedAbsoluteProgress, before);
  });

  it("exit restores the exact saved progress, velocity 0, input active again", () => {
    const travel = newTravel(4.7362);
    const focus = new FocusController();
    focus.requestFocus(active(travel), active(travel), travel);
    run(focus, travel, FOCUS_CONFIG.enter.max + 0.1);
    assert.equal(focus.mode, "FOCUS");
    assert.ok(focus.requestExit());
    assert.equal(focus.mode, "FOCUS_TRANSITION_OUT");
    run(focus, travel, FOCUS_CONFIG.exit.max + 0.1);
    assert.equal(focus.mode, "TRAVEL");
    assert.equal(focus.station, -1);
    assert.equal(focus.savedAbsoluteProgress, null);
    assert.equal(travel.absoluteProgress, 4.7362);
    assert.equal(travel.velocity, 0);
    assert.equal(travel.locked, false);
    travel.addImpulse(2);
    run(focus, travel, 0.5);
    assert.ok(travel.absoluteProgress > 4.7362, "new input travels again");
  });
});

describe("GLOBAL ↔ ROOTS and arbitrary laps", () => {
  for (const [label, start, station] of [
    ["ROOTS focused on lap 2 (absolute > 1)", 1.003, ROOTS],
    ["ROOTS just before the seam (0.99 on lap 3)", 3.99, ROOTS],
    ["GLOBAL on a negative lap (backward travel)", -0.12, GLOBAL],
    ["GLOBAL far in the past", -7.12, GLOBAL],
  ] as const) {
    it(label, () => {
      const travel = newTravel(start);
      const focus = new FocusController();
      assert.equal(active(travel), station);
      assert.ok(focus.requestFocus(station, active(travel), travel));
      run(focus, travel, 2);
      focus.requestExit();
      run(focus, travel, 2);
      assert.equal(travel.absoluteProgress, start, "same lap, same position — never normalized");
      assert.equal(active(travel), station);
    });
  }
});

describe("interrupts never break the state", () => {
  it("Escape mid-entry reverses from the current progress", () => {
    const travel = newTravel(0);
    const focus = new FocusController();
    focus.requestFocus(ROOTS, ROOTS, travel);
    run(focus, travel, 0.4);
    const mid = focus.progress;
    assert.ok(mid > 0 && mid < 1);
    assert.ok(focus.requestExit());
    focus.step(1 / 60, travel);
    assert.ok(focus.progress < mid, "moves back from where it was");
    run(focus, travel, 2);
    assert.equal(focus.mode, "TRAVEL");
    assert.equal(travel.absoluteProgress, 0);
    assert.equal(travel.locked, false);
  });

  it("click during exit re-enters the same station; repeated clicks and double Escape are no-ops", () => {
    const travel = newTravel(0);
    const focus = new FocusController();
    assert.ok(focus.requestFocus(ROOTS, ROOTS, travel));
    assert.equal(focus.requestFocus(ROOTS, ROOTS, travel), false, "already entering");
    run(focus, travel, 2);
    assert.ok(focus.requestExit());
    assert.equal(focus.requestExit(), false, "Escape twice");
    run(focus, travel, 0.3);
    assert.ok(focus.requestFocus(ROOTS, ROOTS, travel), "re-enter during exit");
    assert.equal(focus.mode, "FOCUS_TRANSITION_IN");
    run(focus, travel, 2);
    assert.equal(focus.mode, "FOCUS");
    assert.equal(focus.savedAbsoluteProgress, 0, "saved position kept across the reversal");
  });

  it("focus immediately after returning to travel works", () => {
    const travel = newTravel(0);
    const focus = new FocusController();
    focus.requestFocus(ROOTS, ROOTS, travel);
    run(focus, travel, 2);
    focus.requestExit();
    run(focus, travel, 2);
    assert.equal(focus.mode, "TRAVEL");
    assert.ok(focus.requestFocus(ROOTS, ROOTS, travel));
    assert.equal(focus.mode, "FOCUS_TRANSITION_IN");
  });

  it("a huge frame (hidden tab) cannot skip past a valid state", () => {
    const travel = newTravel(0);
    const focus = new FocusController();
    focus.requestFocus(ROOTS, ROOTS, travel);
    focus.step(0.1, travel); // the rig clamps dt to 0.1 s
    assert.ok(focus.progress > 0 && focus.progress < 1);
    focus.step(100, travel); // even unclamped: ends exactly in FOCUS
    assert.equal(focus.mode, "FOCUS");
    assert.equal(focus.progress, 1);
  });

  it("notifies React only on semantic changes", () => {
    const travel = newTravel(0);
    const focus = new FocusController();
    const seen: string[] = [];
    focus.subscribe(() => seen.push(`${focus.getSnapshot().mode}:${focus.getSnapshot().station}`));
    focus.requestFocus(ROOTS, ROOTS, travel);
    run(focus, travel, 2);
    focus.requestExit();
    run(focus, travel, 2);
    assert.deepEqual(seen, ["FOCUS_TRANSITION_IN:0", "FOCUS:0", "FOCUS_TRANSITION_OUT:0", "TRAVEL:-1"]);
  });
});

describe("transition trajectory", () => {
  it("starts at the travel position, ends at the authored focus camera, rises above both", () => {
    for (const station of layout.stations) {
      const start = layout.curve.getPointAt(station.progress).toArray() as [number, number, number];
      const end = station.focusCamera.position;
      const control = transitionControlPoint(start, end);
      assert.deepEqual(bezierPoint(start, control, end, 0), start);
      const last = bezierPoint(start, control, end, 1);
      last.forEach((v, i) => assert.ok(Math.abs(v - end[i]) < 1e-12));
      for (let k = 0; k <= 20; k++) {
        const p = bezierPoint(start, control, end, easeInOut(k / 20));
        assert.ok(p[1] >= start[1] - 1e-9, "never dips below the travel eye height");
      }
    }
  });

  it("easing is restrained and monotonic", () => {
    assert.equal(easeInOut(0), 0);
    assert.equal(easeInOut(1), 1);
    for (let k = 1; k <= 100; k++) assert.ok(easeInOut(k / 100) >= easeInOut((k - 1) / 100));
  });
});

describe("transition durations", () => {
  it("scale with distance inside the configured ranges", () => {
    assert.equal(transitionDuration(FOCUS_CONFIG.enter, 0), FOCUS_CONFIG.enter.min);
    assert.equal(transitionDuration(FOCUS_CONFIG.enter, 50), FOCUS_CONFIG.enter.max);
    const atView = transitionDuration(FOCUS_CONFIG.enter, 5.5);
    assert.ok(atView > 1.2 && atView < 1.3, String(atView));
    assert.ok(transitionDuration(FOCUS_CONFIG.exit, 5.5) < atView);
  });

  it("are fixed when focus begins (from the flight distance)", () => {
    const travel = newTravel(0);
    const focus = new FocusController(FOCUS_CONFIG, () => 11);
    focus.requestFocus(ROOTS, ROOTS, travel);
    assert.equal(focus.enterDuration, transitionDuration(FOCUS_CONFIG.enter, 11));
    assert.equal(focus.exitDuration, transitionDuration(FOCUS_CONFIG.exit, 11));
  });
});

describe("exit sources are traceable", () => {
  it("reports every exit request with its source, the mode it arrived in, the event and whether it was accepted", () => {
    const travel = newTravel(0);
    const focus = new FocusController();
    const records: FocusExitRecord[] = [];
    focus.setExitObserver((record) => records.push(record));
    focus.requestExit("escape-key"); // in TRAVEL: refused
    focus.requestFocus(ROOTS, ROOTS, travel);
    run(focus, travel, 2);
    let changing = true;
    focus.setExitGuard(() => !changing);
    const click = { type: "click", isTrusted: true, target: "button.focus-label__close", detail: 1 };
    assert.equal(focus.requestExit("close-button", click), false, "vetoed during a record change");
    changing = false;
    assert.equal(focus.requestExit("record-change-deferred"), true);
    assert.deepEqual(records, [
      { source: "escape-key", accepted: false, mode: "TRAVEL", event: undefined },
      { source: "close-button", accepted: false, mode: "FOCUS", event: click },
      { source: "record-change-deferred", accepted: true, mode: "FOCUS", event: undefined },
    ]);
    focus.setExitObserver(null);
    focus.requestExit("dev-panel");
    assert.equal(records.length, 3, "observer removed");
  });
});
