/**
 * Album stack on the listening desk (docs/LISTENING_STATION_TABLE.md): order rule, resting poses, the browse
 * choreography and its gating by the record-change phase. The integration with the real record-change
 * controller (queue, failures, persistence) is in recordChange.test.ts. Run with: npm test
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ERAS } from "../data/eras.ts";
import { ALBUM_STACK, AlbumStackSystem, LISTENING_DESK, browseCap, browsePose, restPose, stackOrder, type SleevePose } from "./albumStack.ts";
import { CHANGE_PHASES, RECORD_CHANGE_CONFIG } from "./recordChange.ts";

const PLAYLIST = ["A", "B", "C", "D", "E"];
const pose = (): SleevePose => ({ x: 0, y: 0, z: 0, yaw: 0 });
const same = (a: SleevePose, b: SleevePose) => [a.x, a.y, a.z, a.yaw].every((v, i) => Math.abs(v - [b.x, b.y, b.z, b.yaw][i]) < 1e-12);

describe("album stack — order and rest", () => {
  it("puts the selected record on top, then continues the playlist circularly", () => {
    assert.deepEqual(stackOrder(PLAYLIST, "A"), ["A", "B", "C", "D", "E"]);
    assert.deepEqual(stackOrder(PLAYLIST, "C"), ["C", "D", "E", "A", "B"]);
    assert.deepEqual(stackOrder(PLAYLIST, "D"), ["D", "E", "A", "B", "C"]);
    assert.deepEqual(stackOrder(PLAYLIST, "E"), ["E", "A", "B", "C", "D"]);
    assert.throws(() => stackOrder(PLAYLIST, "Z"), /not in this playlist/);
  });

  it("every era holds exactly its five records, each once, and never another era's", () => {
    for (const era of ERAS) {
      const ids = era.tracks.map((t) => t.id);
      for (const selected of ids) {
        const order = stackOrder(ids, selected);
        assert.equal(order.length, 5, era.id);
        assert.deepEqual([...order].sort(), [...ids].sort(), `${era.id}: same five identities`);
        assert.equal(order[0], selected);
        for (const other of ERAS) if (other.id !== era.id) for (const t of other.tracks) assert.ok(!order.includes(t.id));
      }
    }
  });

  it("rests tidily: the top is highest and square, each lower sleeve one level down with a small step and rotation", () => {
    const poses = [0, 1, 2, 3, 4].map((d) => restPose(d, 5));
    for (let d = 1; d < 5; d++) {
      assert.ok(Math.abs(poses[d - 1].y - poses[d].y - ALBUM_STACK.pitch) < 1e-12, "one pitch per level");
      assert.ok(poses[d].x < poses[d - 1].x && poses[d].z < poses[d - 1].z, "lower sleeves step out (left / back) so an edge of each shows");
      assert.ok(Math.abs(poses[d].yaw) < (2 * Math.PI) / 180, "rotations stay under 2°");
    }
    assert.deepEqual([poses[0].x, poses[0].z, poses[0].yaw], [0, 0, 0]);
    assert.ok(poses[4].y - ALBUM_STACK.sleeve.thickness / 2 === 0, "bottom sleeve lies on the desk");
  });

  it("fits on the desk beside the turntable, ≥ 40 mm clear of it", () => {
    const { origin, yaw, sleeve } = ALBUM_STACK;
    const half = sleeve.size / 2;
    const corners = (p: SleevePose) =>
      [-1, 1].flatMap((sx) => [-1, 1].map((sz) => {
        const lx = p.x + half * (sx * Math.cos(p.yaw) + sz * Math.sin(p.yaw));
        const lz = p.z + half * (-sx * Math.sin(p.yaw) + sz * Math.cos(p.yaw));
        return [origin.x + lx * Math.cos(yaw) + lz * Math.sin(yaw), origin.z - lx * Math.sin(yaw) + lz * Math.cos(yaw)];
      }));
    for (let d = 0; d < 5; d++) {
      for (const [x, z] of corners(restPose(d, 5))) {
        const { slab, turntable } = LISTENING_DESK;
        assert.ok(x > slab.xMin && x < slab.xMax && z > slab.zMin && z < slab.zMax, `depth ${d} corner on the desk (${x.toFixed(3)}, ${z.toFixed(3)})`);
        assert.ok(x < turntable.xMin - 0.04, `depth ${d}: ≥ 40 mm from the turntable (${x.toFixed(3)})`);
      }
    }
  });
});

describe("album stack — browse choreography", () => {
  const run = (direction: "next" | "previous", from: string, to: string, p: number) => {
    const f = stackOrder(PLAYLIST, from);
    const t = stackOrder(PLAYLIST, to);
    return PLAYLIST.map((id) => browsePose(id, f, t, direction, p, pose()));
  };
  const restOf = (selected: string) => PLAYLIST.map((id) => restPose(stackOrder(PLAYLIST, selected).indexOf(id), 5));

  it("NEXT starts at the old order and ends exactly at the new order (old top at the bottom)", () => {
    run("next", "C", "D", 0).forEach((p, i) => assert.ok(same(p, restOf("C")[i])));
    run("next", "C", "D", 1).forEach((p, i) => assert.ok(same(p, restOf("D")[i])));
  });

  it("PREVIOUS starts at the old order and ends exactly at the new order (bottom sleeve brought to the top)", () => {
    run("previous", "C", "B", 0).forEach((p, i) => assert.ok(same(p, restOf("C")[i])));
    run("previous", "C", "B", 1).forEach((p, i) => assert.ok(same(p, restOf("B")[i])));
  });

  it("PREVIOUS is the exact time-reverse of the NEXT that undoes it", () => {
    for (const p of [0, 0.1, 0.33, 0.5, 0.71, 0.9, 1]) {
      const prev = run("previous", "D", "C", p);
      const next = run("next", "C", "D", 1 - p);
      prev.forEach((a, i) => assert.ok(same(a, next[i]), `p ${p} sleeve ${PLAYLIST[i]}`));
    }
  });

  it("NEXT visibly lifts and glides the old top out, and the destination is on top by mid-browse", () => {
    const mid = run("next", "A", "B", 0.45);
    assert.ok(mid[0].z > ALBUM_STACK.sleeve.size, "A has glided clear toward the visitor");
    assert.ok(mid[0].y > restPose(0, 5).y, "A is lifted");
    const afterReorder = run("next", "A", "B", 0.6);
    assert.ok(Math.abs(afterReorder[1].y - restPose(0, 5).y) < 1e-12, "B now rests at the top level");
  });

  it("never lets two sleeves pass through each other (sampled over the whole browse, both directions)", () => {
    const half = ALBUM_STACK.sleeve.size / 2;
    const extent = (p: SleevePose) => half * (Math.abs(Math.cos(p.yaw)) + Math.abs(Math.sin(p.yaw)));
    for (const [direction, from, to] of [["next", "A", "B"], ["previous", "A", "E"], ["next", "D", "E"], ["previous", "B", "A"]] as const) {
      for (let k = 0; k <= 400; k++) {
        const poses = run(direction, from, to, k / 400);
        for (let i = 0; i < 5; i++) {
          for (let j = i + 1; j < 5; j++) {
            const a = poses[i];
            const b = poses[j];
            const overlapX = Math.abs(a.x - b.x) < extent(a) + extent(b);
            const overlapZ = Math.abs(a.z - b.z) < extent(a) + extent(b);
            if (overlapX && overlapZ) {
              assert.ok(Math.abs(a.y - b.y) >= ALBUM_STACK.sleeve.thickness - 1e-9, `${direction} ${from}→${to} p ${k / 400}: ${PLAYLIST[i]} / ${PLAYLIST[j]} intersect (dy ${(Math.abs(a.y - b.y) * 1000).toFixed(2)} mm)`);
            }
          }
        }
      }
    }
  });

  it("is gated by the record-change phase: lift while the arm lifts, reorder up to the commit, settle after; a restore winds back", () => {
    const at = (phase: string) => browseCap(phase as never, false);
    const index = (phase: string) => CHANGE_PHASES.indexOf(phase as never);
    for (const phase of CHANGE_PHASES) {
      const expected = index(phase) <= index("RETURN_ARM") ? 0.25 : index(phase) <= index("REMOVE_RECORD") ? 0.75 : 1;
      assert.equal(at(phase), expected, phase);
    }
    assert.equal(browseCap("REMOVE_RECORD", true), 0, "restoring → back to the original top");
    assert.equal(at("PLAYING"), 1);
  });
});

describe("album stack — system", () => {
  it("rests exactly on the selection with zero drift, and re-poses only when the selection changes", () => {
    const stacks = new AlbumStackSystem(1);
    stacks.update(0, 1 / 60, PLAYLIST, "C", null);
    const version = stacks.eras[0].version;
    for (let k = 0; k < 1000; k++) stacks.update(0, 1 / 60, PLAYLIST, "C", null);
    assert.equal(stacks.eras[0].version, version, "no work at rest");
    stacks.eras[0].poses.forEach((p, i) => assert.ok(same(p, restPose(stackOrder(PLAYLIST, "C").indexOf(PLAYLIST[i]), 5))));
    assert.equal(stacks.topTrack(0), "C");
  });

  it("follows the phase timeline: lifted while the arm moves, reordered by the commit, settled after", () => {
    const stacks = new AlbumStackSystem(1);
    const change = { fromTrackId: "A", toTrackId: "B", direction: "next" as const };
    for (let k = 0; k < 120; k++) stacks.update(0, 1 / 60, PLAYLIST, "A", change, "LIFT_ARM");
    assert.equal(stacks.progress(0), 0.25, "holds at the lift until the platter stops");
    assert.equal(stacks.topTrack(0), "A");
    for (let k = 0; k < 120; k++) stacks.update(0, 1 / 60, PLAYLIST, "A", change, "REMOVE_RECORD");
    assert.equal(stacks.progress(0), 0.75);
    assert.equal(stacks.topTrack(0), "B", "the destination is the visible top at the commit");
    for (let k = 0; k < 60; k++) stacks.update(0, 1 / 60, PLAYLIST, "B", change, "PREPARE_NEXT");
    assert.equal(stacks.progress(0), 1);
    stacks.update(0, 1 / 60, PLAYLIST, "B", null);
    stacks.eras[0].poses.forEach((p, i) => assert.ok(same(p, restPose(stackOrder(PLAYLIST, "B").indexOf(PLAYLIST[i]), 5))));
  });

  it("keeps the browse inside the record-change budget: its motion (≈0.95 s) fits before the record returns", () => {
    const c = RECORD_CHANGE_CONFIG;
    assert.ok(0.25 / ALBUM_STACK.motion.rate < 0.3, "lift ≤ 0.3 s");
    assert.ok(0.5 / ALBUM_STACK.motion.rate <= c.liftSeconds + c.removeSeconds, "reorder completes during LIFT / REMOVE_RECORD");
    assert.ok(0.25 / ALBUM_STACK.motion.rate <= c.prepareSeconds, "settle completes during PREPARE_NEXT");
  });
});
