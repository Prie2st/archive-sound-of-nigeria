// Presentation clearance against the unchanged route, all focus flights, interaction and record envelopes.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import * as THREE from 'three';
import { OBB } from 'three/examples/jsm/math/OBB.js';
import { EXHIBIT_SLOTS, exhibitHeading, exhibitPlinthSize, getHallLayout, progressDelta } from '../src/data/hallLayout.ts';
import { EXHIBITS } from '../src/data/exhibits.ts';
import { ERA_ATLAS, ERA_WORLD_LAYOUT, eraPanelPose, eraVisualTier } from '../src/data/eraVisuals.ts';
import { FOCUS_CONFIG, bezierPoint, transitionControlPoint } from '../src/state/focus.ts';
const layout=getHallLayout(), p=ERA_WORLD_LAYOUT.panel;
const matrix=(position,yaw)=>new THREE.Matrix4().compose(new THREE.Vector3(...position),new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),yaw),new THREE.Vector3(1,1,1));
const box=(center,size,transform)=>new OBB(new THREE.Vector3(...center).applyMatrix4(transform),new THREE.Vector3(...size).multiplyScalar(.5),new THREE.Matrix3().setFromMatrix4(transform));
const boxes=layout.stations.flatMap(station=>{
  const pose=eraPanelPose(station), stationMatrix=matrix(station.position,station.heading);
  const result=[box([0,0,0],[p.width,p.height,p.thickness],matrix(pose.position,pose.heading))];
  const interaction=box(FOCUS_CONFIG.volume.center,FOCUS_CONFIG.volume.size,stationMatrix);
  const movingRecord=box([-.2,.65,0],[1.5,1.3,1.2],stationMatrix); // includes staged record and sleeve at -X
  for(const b of result) {
    assert(!b.intersectsOBB(interaction),`${station.eraId}: visual intersects interaction volume`);
    assert(!b.intersectsOBB(movingRecord),`${station.eraId}: visual intersects record-change/station envelope`);
  }
  return result;
});
// Instrument exhibits: plinth footprint up to the top of the instrument stood upright (conservative).
for(const slot of EXHIBIT_SLOTS){
  const members=slot.exhibitIds.map(id=>EXHIBITS.find(e=>e.id===id)); assert(members.every(Boolean),`exhibit slot ${slot.exhibitIds} has no exhibit`);
  const top=Math.max(...members.map(e=>e.plinth))+Math.max(...members.map(e=>e.size*e.display)), plinth=exhibitPlinthSize(slot);
  boxes.push(box([0,top/2,0],[plinth.width,top,plinth.depth],matrix(slot.position,exhibitHeading(slot))));
}
const distance=point=>Math.min(...boxes.map(b=>b.clampPoint(point,new THREE.Vector3()).distanceTo(point)));
let route=Infinity,flight=Infinity,sight=Infinity;
for(let k=0;k<1600;k++) route=Math.min(route,distance(layout.curve.getPointAt(k/1600)));
for(const station of layout.stations) {
  const previous=layout.stations[(station.index+7)%8].progress,next=layout.stations[(station.index+1)%8].progress;
  const from=station.progress+progressDelta(station.progress,previous)/2,to=station.progress+progressDelta(station.progress,next)/2;
  for(let k=0;k<=8;k++) {
    const u=((from+(to-from)*k/8)%1+1)%1,start=layout.curve.getPointAt(u).toArray(),end=station.focusCamera.position,control=transitionControlPoint(start,end);
    for(let j=0;j<=60;j++) flight=Math.min(flight,distance(new THREE.Vector3(...bezierPoint(start,control,end,j/60))));
  }
  for(const anchor of [station.view,station.focusCamera]) for(let j=0;j<=60;j++) sight=Math.min(sight,distance(new THREE.Vector3(...anchor.position).lerp(new THREE.Vector3(...anchor.target),j/60)));
}
assert(route>.5,`route visual clearance ${route}`); assert(flight>.3,`focus flight visual clearance ${flight}`); assert(sight>.25,`deck sightline visual clearance ${sight}`);
for(let i=0;i<8;i++) {
  const tiers=layout.stations.map(s=>eraVisualTier(s.index,i));
  assert.equal(tiers.filter(t=>t==='active').length,1); assert.equal(tiers.filter(t=>t==='nearby').length,2); assert.equal(tiers.filter(t=>t==='distant').length,5);
}
const stat=await fs.stat('public'+ERA_ATLAS.url); assert(stat.size<256*1024,'atlas over 256 KiB transfer budget');
console.log(`Era visuals: ${boxes.length} conservative OBBs (8 backdrop panels, ${EXHIBIT_SLOTS.length} exhibit plinths); interaction and moving-record envelopes clear.\nRoute: ${route.toFixed(3)} m (1,600 samples). Focus flights: ${flight.toFixed(3)} m (8 × 9 × 61). Deck sightlines: ${sight.toFixed(3)} m.\nAll eight LOD assignments: 1 ACTIVE / 2 NEARBY / 5 DISTANT, including GLOBAL ↔ ROOTS.\nAtlas: ${(stat.size/1024).toFixed(1)} KiB, 10.67 MiB with mipmaps. Hall geometry screening: npm run check:hall.`);

