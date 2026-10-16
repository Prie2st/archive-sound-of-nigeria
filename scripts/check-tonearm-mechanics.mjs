// Offline runtime-geometry screening, not an exact mesh collision solver.
// A 1 mm XZ height field of Body screens the distal arm / cartridge; the vinyl is a disc plane.
import assert from "node:assert/strict";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { MeshoptDecoder } from "meshoptimizer";
import * as THREE from "three";
import { getHallLayout } from "../src/data/hallLayout.ts";
import { resolveTonearmPoses, TonearmController, TONEARM_MOTION_CONFIG } from "../src/stations/tonearmMotion.ts";

await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.decoder": MeshoptDecoder });
const deck = await io.read("public/models/turntable/turntable-medium.glb");
const vinyl = await io.read("public/models/vinyl/vinyl-medium.glb");
const find = (doc, name) => { const n=doc.getRoot().listNodes().find(n=>n.getName()===name); assert.ok(n, name); return n; };
const swing = find(deck,"TonearmSwing");
const lift = find(deck,"TonearmLift");
const tip = find(deck,"StylusTip");
const platter = find(deck,"Platter");
const record = find(vinyl,"Record");
const pivot = new THREE.Vector3(...swing.getTranslation());
const spindle = new THREE.Vector3(...platter.getTranslation());
const tipLocal = new THREE.Vector3(...tip.getTranslation());
const recordExtras = record.getExtras();
const top = spindle.y + recordExtras.thickness;
const poses = resolveTonearmPoses(swing.getExtras(), {tipY:tipLocal.y,tipZ:tipLocal.z,surfaceY:top-pivot.y});

for(const suffix of ["", "_Nearby", "_Distant"]) {
  const s=find(deck,`TonearmSwing${suffix}`); const l=find(deck,`TonearmLift${suffix}`); const t=find(deck,`StylusTip${suffix}`);
  assert.ok(s.listChildren().includes(l)); assert.ok(l.listChildren().includes(t));
  assert.deepEqual(s.getTranslation(),swing.getTranslation()); assert.deepEqual(s.getExtras(),swing.getExtras());
  assert.deepEqual(t.getTranslation(),tip.getTranslation());
}

function parts(node) {
  const result=[];
  node.traverse(n=>{const mesh=n.getMesh();if(!mesh)return;const matrix=new THREE.Matrix4().fromArray(n.getWorldMatrix());
    for(const prim of mesh.listPrimitives()) {const attr=prim.getAttribute("POSITION");const positions=[];const v=[];
      for(let i=0;i<attr.getCount();i++){attr.getElement(i,v);positions.push(new THREE.Vector3(...v).applyMatrix4(matrix));}
      result.push({positions,indices:prim.getIndices().getArray()});
    }
  });
  return result;
}

// Raster static body tops at 1 mm cell centres, retaining authored arm rest / controls.
const cell=0.001;
const height=new Map();
const key=(x,z)=>`${x},${z}`;
for(const {positions,indices} of parts(find(deck,"Body"))) {
  for(let i=0;i<indices.length;i+=3) {
    const a=positions[indices[i]],b=positions[indices[i+1]],c=positions[indices[i+2]];
    const denominator=(b.z-c.z)*(a.x-c.x)+(c.x-b.x)*(a.z-c.z);
    if(Math.abs(denominator)<1e-14)continue;
    for(let x=Math.floor(Math.min(a.x,b.x,c.x)/cell);x<=Math.floor(Math.max(a.x,b.x,c.x)/cell);x++) {
      for(let z=Math.floor(Math.min(a.z,b.z,c.z)/cell);z<=Math.floor(Math.max(a.z,b.z,c.z)/cell);z++) {
        const px=(x+0.5)*cell,pz=(z+0.5)*cell;
        const u=((b.z-c.z)*(px-c.x)+(c.x-b.x)*(pz-c.z))/denominator;
        const v=((c.z-a.z)*(px-c.x)+(a.x-c.x)*(pz-c.z))/denominator;
        if(u < -1e-8 || v < -1e-8 || u+v > 1+1e-8)continue;
        const y=u*a.y+v*b.y+(1-u-v)*c.y;const k=key(x,z);
        if(y>(height.get(k)??-Infinity))height.set(k,y);
      }
    }
  }
}

// Distal 12 cm: arm tube, headshell, cartridge, stylus. The bearing/counterweight and its
// intentional pivot contacts are excluded. Retain lowest point per 1 mm local XZ column.
const critical=new Map();
for(const {positions} of parts(lift))for(const world of positions){const p=world.clone().sub(pivot);if(p.z<0.11)continue;
  const k=key(Math.floor(p.x/cell),Math.floor(p.z/cell));if(p.y<(critical.get(k)?.y??Infinity))critical.set(k,p);
}
critical.set("StylusTip",tipLocal);
const points=[...critical.values()];
assert.ok(points.length>100,"critical geometry missing");
const xAxis=new THREE.Vector3(1,0,0),yAxis=new THREE.Vector3(0,1,0);
const probe=new THREE.Vector3();
let bodyMinimum=Infinity,vinylLiftMinimum=Infinity,platterMinimum=Infinity,bodyChecks=0;
function screen(s,l,raised) {
  for(const point of points){probe.copy(point).applyAxisAngle(xAxis,l).applyAxisAngle(yAxis,s).add(pivot);
    const body=height.get(key(Math.floor(probe.x/cell),Math.floor(probe.z/cell)));
    if(body!==undefined){bodyChecks++;bodyMinimum=Math.min(bodyMinimum,probe.y-body);assert.ok(probe.y-body>=-0.0002,`distal arm/body penetration ${(probe.y-body)*1000} mm at ${s}, ${l}`);}
    const radius=Math.hypot(probe.x-spindle.x,probe.z-spindle.z);
    // Conservative 327 mm platter footprint, top at the authored slip-mat surface. The spindle
    // is excluded by the lead-in radius; no checked point approaches the central label/spindle.
    if(radius<0.327/2){platterMinimum=Math.min(platterMinimum,probe.y-spindle.y);assert.ok(probe.y>=spindle.y-0.0002,"platter penetration");}
    if(radius<recordExtras.diameter/2){assert.ok(probe.y>=top-0.0002,`vinyl penetration ${(probe.y-top)*1000} mm`);if(raised)vinylLiftMinimum=Math.min(vinylLiftMinimum,probe.y-top);}
  }
}
const measurements={};
for(const [name,p] of Object.entries(poses)){
  probe.copy(tipLocal).applyAxisAngle(xAxis,p.lift).applyAxisAngle(yAxis,p.swing).add(pivot);
  const radius=Math.hypot(probe.x-spindle.x,probe.z-spindle.z);
  const gap=probe.y-top;
  measurements[name]={swingRad:p.swing,liftRad:p.lift,stylusMm:gap*1000,radiusMm:radius*1000};
  screen(p.swing,p.lift,name.startsWith("LIFTED"));
  if(name==="REST")assert.ok(radius>recordExtras.diameter/2+0.01);
  if(name==="PLAY"){assert.ok(gap>=0 && gap<=TONEARM_MOTION_CONFIG.contactTolerance);assert.ok(radius>recordExtras.labelRadius+0.02 && radius<recordExtras.diameter/2-0.004);}
}
// Entire safe lift→swing→lower envelope, in both directions (243 samples).
for(let i=0;i<=80;i++){const t=i/80;screen(poses.REST.swing,poses.REST.lift+(poses.LIFTED_REST.lift-poses.REST.lift)*t,false);screen(poses.REST.swing+(poses.PLAY.swing-poses.REST.swing)*t,poses.LIFTED_PLAY.lift,true);screen(poses.PLAY.swing,poses.LIFTED_PLAY.lift+(poses.PLAY.lift-poses.LIFTED_PLAY.lift)*t,false);}
assert.ok(bodyChecks>0);assert.ok(vinylLiftMinimum>=TONEARM_MOTION_CONFIG.minimumRaisedClearance);
// World transforms, including the seam pair: the same local mechanism and signed contact height.
for(const station of getHallLayout().stations){const p=new THREE.Vector3(...tip.getTranslation()).applyAxisAngle(xAxis,poses.PLAY.lift).applyAxisAngle(yAxis,poses.PLAY.swing).add(pivot).add(new THREE.Vector3(0,0.635,0));p.applyAxisAngle(yAxis,station.heading).add(new THREE.Vector3(...station.position));assert.ok(Math.abs(p.y-(top+0.635+station.position[1])-TONEARM_MOTION_CONFIG.contactClearance)<1e-9);}
console.log(JSON.stringify({poses:measurements,criticalColumns:points.length,bodyChecks,minimumDistalBodyClearanceMm:bodyMinimum*1000,minimumRaisedVinylClearanceMm:vinylLiftMinimum*1000,minimumPlatterClearanceMm:platterMinimum*1000,stations:8,screen:"1 mm body height field; distal 12 cm underside columns; 243 safe-path samples; 0.2 mm quantization allowance"},null,2));

if(process.argv.includes("--benchmark")) {
  const controller=new TonearmController(poses);
  const steps=300000;
  const run=()=>{for(let i=0;i<steps;i++){if(controller.phase==="IDLE")controller.request(controller.targetPose==="PLAY"?"REST":"PLAY");controller.update(1/60);}};
  run(); // warm the JIT before measuring
  const timings=[];
  for(let i=0;i<5;i++){const start=process.hrtime.bigint();run();timings.push(Number(process.hrtime.bigint()-start)/steps/1000);}
  console.log(JSON.stringify({controllerUpdateUsPerStep:timings,stepsPerPass:steps,note:"Node CPU only: includes semantic requests at endpoints; excludes scene writes and rendering"},null,2));
}
