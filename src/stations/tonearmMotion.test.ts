import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import * as THREE from "three";
import { getHallLayout } from "../data/hallLayout.ts";
import { resolveTonearmPoses, TonearmController, TonearmMotionSystem, TONEARM_MOTION_CONFIG, TONEARM_POSES, type TonearmPose } from "./tonearmMotion.ts";

// Actual runtime pivots/extras; no invented test-only arm geometry.
interface Node { name: string; translation?: number[]; children?: number[]; extras?: Record<string, number> }
const json = (path: string): { nodes: Node[] } => {
  const b = readFileSync(path);
  return JSON.parse(b.subarray(20, 20 + b.readUInt32LE(12)).toString());
};
const nodes = json("public/models/turntable/turntable-medium.glb").nodes;
const node = (name: string) => nodes.find(n => n.name === name)!;
const swing = node("TonearmSwing");
const tip = node("StylusTip");
const platter = node("Platter");
const record = json("public/models/vinyl/vinyl-medium.glb").nodes.find(n => n.name === "Record")!;
const angles = swing.extras as unknown as Parameters<typeof resolveTonearmPoses>[0];
const poses = resolveTonearmPoses(angles, { tipY: tip.translation![1], tipZ: tip.translation![2], surfaceY: platter.translation![1] + record.extras!.thickness - swing.translation![1] });
const close = (a: number, b: number, eps = 1e-9) => assert.ok(Math.abs(a-b) < eps, `${a} != ${b}`);
const run = (c: TonearmController, seconds: number, nextDelta = () => 1/60) => {
  let elapsed = 0;
  while (elapsed < seconds - 1e-10) { const dt = Math.min(nextDelta(), seconds - elapsed); c.update(dt); elapsed += dt; }
};

function checkSafe(c: TonearmController, previousSwing: number) {
  if (c.currentSwing !== previousSwing) {
    // One frame can finish the raised swing AND consume the beginning of lowering.
    // A lowered endpoint is legal only after the swing reached its exact target.
    if (Math.abs(c.currentLift - poses.LIFTED_REST.lift) > 1e-9) {
      close(c.currentSwing, c.targetSwing);
      assert.ok(c.phase === "LOWERING" || c.phase === "IDLE");
    } else close(c.currentLift, poses.LIFTED_REST.lift);
  }
  assert.ok(c.currentSwing >= poses.PLAY.swing - 1e-10 && c.currentSwing <= poses.REST.swing + 1e-10);
  assert.ok(c.currentLift >= poses.LIFTED_REST.lift - 1e-10 && c.currentLift <= poses.PLAY.lift + 1e-10);
}

describe("tonearm mechanics — runtime authoring", () => {
  it("uses the identical authored hierarchy and pivots in all tiers", () => {
    for (const suffix of ["", "_Nearby", "_Distant"]) {
      const s = node(`TonearmSwing${suffix}`); const l = node(`TonearmLift${suffix}`); const t = node(`StylusTip${suffix}`);
      assert.ok(s.children!.includes(nodes.indexOf(l)));
      assert.ok(l.children!.includes(nodes.indexOf(t)));
      assert.deepEqual(s.translation, swing.translation); assert.deepEqual(s.extras, swing.extras);
      assert.deepEqual(t.translation, tip.translation);
      assert.equal(l.translation, undefined);
    }
  });
  it("keeps authored REST, lead-in swing and raised lift; contact correction is under 0.01 rad", () => {
    assert.deepEqual(poses.REST, {swing: angles.restSwing, lift: angles.restLift});
    assert.equal(poses.PLAY.swing, angles.leadInSwing);
    assert.equal(poses.LIFTED_PLAY.lift, angles.raisedLift);
    assert.ok(Math.abs(poses.PLAY.lift - angles.playLift) < 0.01);
  });
  it("places PLAY at 0.5 mm above vinyl and at a groove radius inside the rim, away from the label", () => {
    const p = new THREE.Vector3(...tip.translation!).applyAxisAngle(new THREE.Vector3(1,0,0), poses.PLAY.lift).applyAxisAngle(new THREE.Vector3(0,1,0), poses.PLAY.swing).add(new THREE.Vector3(...swing.translation!));
    close(p.y - platter.translation![1] - record.extras!.thickness, TONEARM_MOTION_CONFIG.contactClearance);
    const r = Math.hypot(p.x-platter.translation![0], p.z-platter.translation![2]);
    assert.ok(r < record.extras!.diameter/2 - 0.004 && r > record.extras!.labelRadius + 0.02);
  });
  it("rejects unsafe contact correction or insufficient raised clearance", () => {
    assert.throws(() => resolveTonearmPoses(angles, {tipY:0,tipZ:0.23,surfaceY:0.1}), /correction/);
    assert.throws(() => resolveTonearmPoses({...angles,raisedLift:angles.playLift}, {tipY:tip.translation![1],tipZ:tip.translation![2],surfaceY:platter.translation![1]+record.extras!.thickness-swing.translation![1]}), /clearance/);
  });
  it("all eight world transforms preserve local target angles, radius and contact clearance", () => {
    for (const station of getHallLayout().stations) {
      const root = new THREE.Object3D(); root.position.set(...station.position); root.rotation.y = station.heading;
      const s = new THREE.Object3D(); s.position.fromArray(swing.translation!); s.rotation.y = poses.PLAY.swing;
      const l = new THREE.Object3D(); l.rotation.x = poses.PLAY.lift;
      const t = new THREE.Object3D(); t.position.fromArray(tip.translation!);
      root.add(s); s.add(l); l.add(t); root.updateMatrixWorld(true);
      const recordTop = root.localToWorld(new THREE.Vector3(platter.translation![0],platter.translation![1]+record.extras!.thickness,platter.translation![2]));
      const wp = t.getWorldPosition(new THREE.Vector3());
      close(wp.y-recordTop.y,TONEARM_MOTION_CONFIG.contactClearance);
      close(Math.hypot(wp.x-recordTop.x,wp.z-recordTop.z),0.14579187219357777);
      close(s.rotation.y,poses.PLAY.swing); close(l.rotation.x,poses.PLAY.lift);
    }
  });
});

describe("tonearm mechanics — legal motion and interruption", () => {
  for (const [from, to] of [["REST","PLAY"],["PLAY","REST"]] as const) {
    it(`${from} → ${to}: lift, swing, lower, settle`, () => {
      const c = new TonearmController(poses); c.request(from); run(c,3); c.request(to);
      const phases = [c.phase];
      for (let i=0;i<150;i++) {
        const old = c.currentSwing; c.update(1/60); checkSafe(c,old);
        if (phases.at(-1)!==c.phase) phases.push(c.phase);
      }
      assert.deepEqual(phases,["LIFTING","SWINGING","LOWERING","IDLE"]);
      assert.equal(c.currentPose,to); close(c.currentSwing,poses[to].swing); close(c.currentLift,poses[to].lift);
    });
  }
  for (const pose of TONEARM_POSES) {
    it(`reaches semantic pose ${pose} exactly`, () => {
      const c = new TonearmController(poses); c.request(pose); run(c,3);
      assert.equal(c.currentPose,pose); assert.equal(c.phase,"IDLE");
      close(c.currentSwing,poses[pose].swing); close(c.currentLift,poses[pose].lift);
    });
  }
  for (const from of ["REST","PLAY"] as const) {
    it(`reverses safely during lift from ${from}`, () => {
      const c = new TonearmController(poses); c.request(from); run(c,3);
      c.request(from === "REST" ? "PLAY" : "REST"); run(c,0.13);
      const before=[c.currentSwing,c.currentLift]; c.request(from);
      assert.deepEqual([c.currentSwing,c.currentLift],before);
      run(c,3); assert.equal(c.currentPose,from);
    });
  }
  it("reverses during swing with the arm raised, then lowers only at REST", () => {
    const c=new TonearmController(poses); c.request("LIFTED_REST");run(c,1);c.request("PLAY");run(c,0.3);
    assert.equal(c.phase,"SWINGING");const before=[c.currentSwing,c.currentLift];c.request("REST");assert.deepEqual([c.currentSwing,c.currentLift],before);
    for(let i=0;i<120;i++){const old=c.currentSwing;c.update(1/60);checkSafe(c,old);}assert.equal(c.currentPose,"REST");
  });
  it("reverses a lowering move by lifting before the next swing", () => {
    const c=new TonearmController(poses);c.request("PLAY");run(c,1.3);assert.equal(c.phase,"LOWERING");c.request("REST");assert.equal(c.phase,"LIFTING");
    for(let i=0;i<150;i++){const old=c.currentSwing;c.update(1/60);checkSafe(c,old);}assert.equal(c.currentPose,"REST");
  });
  it("rapid commands remain safe and repeated targets do not restart segments", () => {
    const c=new TonearmController(poses);
    for(let i=0;i<400;i++){c.request(TONEARM_POSES[(i*7)%4]);const old=c.currentSwing;c.update(0.011);checkSafe(c,old);}
    c.request("PLAY");for(let i=0;i<300;i++){c.request("PLAY");const old=c.currentSwing;c.update(1/144);checkSafe(c,old);}assert.equal(c.currentPose,"PLAY");
  });
});

describe("tonearm mechanics — time and era persistence", () => {
  it("matches at 30, 60, 144 fps and irregular deltas, including segment boundaries", () => {
    const sample=(next:()=>number)=>{const c=new TonearmController(poses);const values=[];for(const [target,time] of [["PLAY",0.47],["REST",0.31],["LIFTED_PLAY",0.72],["PLAY",2]] as [TonearmPose,number][]){c.request(target);run(c,time,next);values.push([c.currentSwing,c.currentLift,c.phase]);}return values;};
    const reference=sample(()=>1/60);let index=0;
    for(const next of [()=>1/30,()=>1/144,()=>[0.008,0.041,0.017][index++%3]]){const values=sample(next);for(let i=0;i<values.length;i++){close(values[i][0] as number,reference[i][0] as number);close(values[i][1] as number,reference[i][1] as number);assert.equal(values[i][2],reference[i][2]);}}
  });
  it("clamps huge deltas and ignores negative deltas", () => {
    const a=new TonearmController(poses);const b=new TonearmController(poses);a.request("PLAY");b.request("PLAY");a.update(80);b.update(TONEARM_MOTION_CONFIG.maxDelta);close(a.currentLift,b.currentLift);assert.equal(a.currentSwing,poses.REST.swing);
    const before=a.currentLift;a.update(-10);assert.equal(a.currentLift,before);
  });
  it("pauses inactive eras mid-motion and restores ACTIVE without reset; lower tiers need no controller updates", () => {
    const s=new TonearmMotionSystem(8);s.register(0,poses);s.register(7,poses);s.request(0,"PLAY");s.update(0.1,0);
    const controller=s.states[0]!;const before=[controller.currentSwing,controller.currentLift,controller.phase];
    for(let i=0;i<300;i++)s.update(1/60,7);s.register(0,poses);assert.equal(s.states[0],controller);assert.deepEqual([controller.currentSwing,controller.currentLift,controller.phase],before);
    for(let i=0;i<300;i++)s.update(1/60,0);assert.equal(controller.currentPose,"PLAY");
    for(let i=0;i<300;i++)s.update(1/60,7);s.register(0,poses);assert.equal(s.states[0]!.currentPose,"PLAY");
  });
});
