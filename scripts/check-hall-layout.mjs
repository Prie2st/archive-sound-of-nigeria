// Clearance / sanity check of the marble hall route and station slots against
// the runtime gallery geometry.
//
//   npm run check:hall
//
// Method (deliberately simple, not a physics collision test):
//   - Every triangle of public/models/gallery/marble-gallery.glb is point-sampled
//     at ≤ 5 cm spacing into a 10 cm voxel grid, plus a top-down floor grid
//     (highest up-facing surface below 1.2 m) and an overhead grid (lowest geometry
//     above the route's eye height).
//   - Clearance = horizontal distance to the nearest occupied column within the band
//     0.2–2.4 m above the relevant floor (the route floor for the route, the station
//     floor for stations): anything a standing visitor could walk into, including
//     step risers up to a higher level.
//   - Sightlines are tested against the voxels at their actual height.
// Limitations: 10 cm resolution (≈ ±5 cm) and the camera is treated as a point.
// Treat results as screening, then confirm visually.
//
// Imports the TypeScript layout module directly (Node ≥ 22.18 strips types).

import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { MeshoptDecoder } from "meshoptimizer";
import * as THREE from "three";
import { EXHIBIT_SLOTS, HALL, PATH_CONTROL_POINTS, exhibitHeading, exhibitPlinthSize, getHallLayout, progressDelta } from "../src/data/hallLayout.ts";
import { EXHIBITS } from "../src/data/exhibits.ts";
import { FOCUS_CONFIG, bezierPoint, transitionControlPoint } from "../src/state/focus.ts";

import { ERA_WORLD_LAYOUT, eraPanelPose } from "../src/data/eraVisuals.ts";
import { ALBUM_STACK, LISTENING_DESK } from "../src/stations/albumStack.ts";

const MODEL = "public/models/gallery/marble-gallery.glb";
const CELL = 0.1;
const HALF = 27;
const N = Math.round((2 * HALF) / CELL);
const Y_MIN = -1.2;
const Y_STEP = 0.1;
const NY = 150; // y from −1.2 to 13.8
const ROUTE_FLOOR = HALL.routeFloorY;
const EYE = ROUTE_FLOOR + HALL.cameraEyeHeight;
const BAND = [0.2, 2.4]; // obstacle band above a floor

const THRESHOLDS = {
  pillarComfort: 1.0, // warn below: camera feels too close to a column
  obstacleMin: 0.5, // fail below
  floorEdgeMin: 0.75, // warn below: route too close to the steps
  headroomMin: 0.5, // fail below: geometry within this distance above the eye
  stationStepMin: 0.6, // warn below: table too close to the steps
  stationObstacleMin: 0.7, // warn below: table too close to a wall or pillar
  focusClearanceMin: 0.3, // fail below: focus camera (near plane) clips geometry
  focusClearanceComfort: 0.6, // warn below
  focusDistance: [1.5, 2.3], // warn outside: focus camera → platter distance (m)
  transitionClearanceMin: 0.3, // fail below: focus transition passes this close to hall geometry
  transitionClearanceComfort: 0.5, // warn below
  transitionStationMin: 0.25, // fail below: transition passes this close to the station installation
  transitionFloorMin: 0.5, // fail below: camera this close above the floor under it
};

// ---------------------------------------------------------------------------
// Rasterize the hall
// ---------------------------------------------------------------------------

await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.decoder": MeshoptDecoder });
const doc = await io.read(MODEL);

const GROUPS = [];
const voxels = new Uint8Array(N * N * NY); // 0 = empty, else 1 + index into GROUPS
const floor = new Float32Array(N * N).fill(NaN);
const overhead = new Float32Array(N * N).fill(Infinity);
const cellOf = (x, z) => {
  const i = Math.floor((x + HALF) / CELL);
  const j = Math.floor((z + HALF) / CELL);
  return i < 0 || j < 0 || i >= N || j >= N ? -1 : j * N + i;
};
const binOf = (y) => Math.floor((y - Y_MIN) / Y_STEP);
const cellCentre = (k) => [((k % N) + 0.5) * CELL - HALF, (Math.floor(k / N) + 0.5) * CELL - HALF];

const topGroup = (node) => {
  let n = node;
  while (n.getParentNode() && n.getParentNode().getName() !== "MarbleGallery") n = n.getParentNode();
  return n.getName();
};

for (const node of doc.getRoot().listNodes()) {
  const mesh = node.getMesh();
  if (!mesh) continue;
  const name = topGroup(node);
  if (!GROUPS.includes(name)) GROUPS.push(name);
  const group = GROUPS.indexOf(name) + 1;
  const m = new THREE.Matrix4().fromArray(node.getWorldMatrix());
  for (const prim of mesh.listPrimitives()) {
    const position = prim.getAttribute("POSITION");
    const world = new Float32Array(position.getCount() * 3);
    const v = new THREE.Vector3();
    for (let i = 0; i < position.getCount(); i++) {
      v.fromArray(position.getElement(i, [])).applyMatrix4(m);
      world.set([v.x, v.y, v.z], i * 3);
    }
    const index = prim.getIndices().getArray();
    for (let t = 0; t < index.length; t += 3) {
      const [a, b, c] = [index[t] * 3, index[t + 1] * 3, index[t + 2] * 3];
      const e1 = [world[b] - world[a], world[b + 1] - world[a + 1], world[b + 2] - world[a + 2]];
      const e2 = [world[c] - world[a], world[c + 1] - world[a + 1], world[c + 2] - world[a + 2]];
      const ny = e1[2] * e2[0] - e1[0] * e2[2];
      const area2 = Math.hypot(e1[1] * e2[2] - e1[2] * e2[1], ny, e1[0] * e2[1] - e1[1] * e2[0]);
      if (!area2) continue;
      const upFacing = ny / area2 > 0.7;
      const longest = Math.max(Math.hypot(...e1), Math.hypot(...e2), Math.hypot(e1[0] - e2[0], e1[1] - e2[1], e1[2] - e2[2]));
      const steps = Math.max(1, Math.ceil(longest / (CELL / 2)));
      for (let u = 0; u <= steps; u++) {
        for (let w = 0; w <= steps - u; w++) {
          const l1 = u / steps;
          const l2 = w / steps;
          const l0 = 1 - l1 - l2;
          const x = l0 * world[a] + l1 * world[b] + l2 * world[c];
          const y = l0 * world[a + 1] + l1 * world[b + 1] + l2 * world[c + 1];
          const z = l0 * world[a + 2] + l1 * world[b + 2] + l2 * world[c + 2];
          const k = cellOf(x, z);
          if (k < 0) continue;
          const bin = binOf(y);
          if (bin >= 0 && bin < NY && !voxels[k * NY + bin]) voxels[k * NY + bin] = group;
          if (upFacing && y < 1.2 && !(y <= floor[k])) floor[k] = y;
          if (y > EYE && y < overhead[k]) overhead[k] = y;
        }
      }
    }
  }
}

/** Occupied columns in the obstacle band above `floorY`, as [x, z, group]. Cached per floor level. */
const bandCache = new Map();
function obstacleColumns(floorY) {
  if (bandCache.has(floorY)) return bandCache.get(floorY);
  const lo = Math.max(0, binOf(floorY + BAND[0]));
  const hi = Math.min(NY - 1, binOf(floorY + BAND[1]));
  const columns = [];
  for (let k = 0; k < N * N; k++) {
    for (let bin = lo; bin <= hi; bin++) {
      const g = voxels[k * NY + bin];
      if (g) {
        columns.push([...cellCentre(k), GROUPS[g - 1]]);
        break;
      }
    }
  }
  bandCache.set(floorY, columns);
  return columns;
}

/** Nearest obstacle (horizontal) above `floorY`, optionally restricted to one group. */
function nearestObstacle(x, z, floorY, group) {
  let best = Infinity;
  let bestGroup = "";
  for (const [ox, oz, g] of obstacleColumns(floorY)) {
    if (group && g !== group) continue;
    const d = Math.hypot(ox - x, oz - z);
    if (d < best) {
      best = d;
      bestGroup = g;
    }
  }
  // Distance to the cell centre minus half a cell ≈ distance to the obstacle surface.
  return { distance: Math.max(0, best - CELL / 2), group: bestGroup };
}

/** Group occupying the voxel at a 3D point, or null. */
function voxelAt(x, y, z) {
  const k = cellOf(x, z);
  const bin = binOf(y);
  if (k < 0 || bin < 0 || bin >= NY) return null;
  const g = voxels[k * NY + bin];
  return g ? GROUPS[g - 1] : null;
}

/** Nearest occupied voxel to a 3D point (searched within `radius`). */
function nearestVoxel3D(x, y, z, radius) {
  let best = Infinity;
  let bestGroup = "";
  const r = Math.ceil(radius / CELL);
  const ry = Math.ceil(radius / Y_STEP);
  const ci = Math.floor((x + HALF) / CELL);
  const cj = Math.floor((z + HALF) / CELL);
  const cb = binOf(y);
  for (let dj = -r; dj <= r; dj++) {
    for (let di = -r; di <= r; di++) {
      const k = (cj + dj) * N + (ci + di);
      if (k < 0 || k >= N * N) continue;
      const [cx, cz] = cellCentre(k);
      for (let db = -ry; db <= ry; db++) {
        const bin = cb + db;
        if (bin < 0 || bin >= NY) continue;
        const g = voxels[k * NY + bin];
        if (!g) continue;
        const cy = Y_MIN + (bin + 0.5) * Y_STEP;
        const d = Math.hypot(cx - x, cy - y, cz - z) - CELL / 2;
        if (d < best) {
          best = d;
          bestGroup = GROUPS[g - 1];
        }
      }
    }
  }
  return { distance: Math.max(0, best), group: bestGroup };
}

/** Distance to the nearest cell whose floor deviates from `level` (steps, edges, holes). */
function distanceToFloorChange(x, z, level, tolerance = 0.05, searchRadius = 6) {
  let best = Infinity;
  const r = Math.ceil(searchRadius / CELL);
  const ci = Math.floor((x + HALF) / CELL);
  const cj = Math.floor((z + HALF) / CELL);
  for (let dj = -r; dj <= r; dj++) {
    for (let di = -r; di <= r; di++) {
      const k = (cj + dj) * N + (ci + di);
      const f = floor[k];
      if (!Number.isNaN(f) && Math.abs(f - level) <= tolerance) continue;
      const [cx, cz] = cellCentre(k);
      best = Math.min(best, Math.hypot(cx - x, cz - z) - CELL / 2);
    }
  }
  return best;
}

function minOverheadNear(x, z, radius = 0.4) {
  let best = Infinity;
  const r = Math.ceil(radius / CELL);
  const ci = Math.floor((x + HALF) / CELL);
  const cj = Math.floor((z + HALF) / CELL);
  for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) best = Math.min(best, overhead[(cj + dj) * N + (ci + di)]);
  return best;
}

// ---------------------------------------------------------------------------
// Checks
// ---------------------------------------------------------------------------

const layout = getHallLayout();
const fmt = (n, d = 2) => (Number.isFinite(n) ? n.toFixed(d) : String(n));
const v3 = (p) => `(${fmt(p[0])}, ${fmt(p[1])}, ${fmt(p[2])})`;
const problems = { fail: [], warn: [] };

console.log(`Marble hall layout check — ${MODEL}`);
console.log(`voxels ${CELL} m, obstacle band ${BAND[0]}–${BAND[1]} m above each floor, route floor y ${ROUTE_FLOOR}, eye y ${fmt(EYE)}\n`);

// Control points
console.log("Control points (radius from centre):");
PATH_CONTROL_POINTS.forEach((p, i) => console.log(`  ${String(i).padStart(2)} ${v3(p)}  r ${fmt(Math.hypot(p[0], p[2]))}`));

// Path samples
const SAMPLES = 1000;
const groups = ["Pillars", "InnerRing", "Room", "Doorways", "Sculpture"];
const minByGroup = Object.fromEntries(groups.map((g) => [g, { distance: Infinity, u: 0, at: null }]));
let minRadius = Infinity;
let maxRadius = 0;
let worstFloor = { delta: 0, u: 0 };
let edge = { distance: Infinity, u: 0 };
let headroom = { distance: Infinity, u: 0 };
const point = new THREE.Vector3();
const segmentWarnings = [];

for (let s = 0; s < SAMPLES; s++) {
  const u = s / SAMPLES;
  layout.curve.getPointAt(u, point);
  const r = Math.hypot(point.x, point.z);
  minRadius = Math.min(minRadius, r);
  maxRadius = Math.max(maxRadius, r);
  for (const g of groups) {
    const { distance } = nearestObstacle(point.x, point.z, ROUTE_FLOOR, g);
    if (distance < minByGroup[g].distance) minByGroup[g] = { distance, u, at: [point.x, point.y, point.z] };
  }
  const f = floor[cellOf(point.x, point.z)];
  const delta = Number.isNaN(f) ? Infinity : Math.abs(f - ROUTE_FLOOR);
  if (delta > worstFloor.delta) worstFloor = { delta, u };
  const e = distanceToFloorChange(point.x, point.z, ROUTE_FLOOR, 0.05, 4);
  if (e < edge.distance) edge = { distance: e, u };
  const h = minOverheadNear(point.x, point.z) - point.y;
  if (h < headroom.distance) headroom = { distance: h, u };
  const nearest = nearestObstacle(point.x, point.z, ROUTE_FLOOR);
  if (nearest.distance < THRESHOLDS.pillarComfort) segmentWarnings.push({ u, ...nearest });
}

console.log(`\nRoute: length ${fmt(layout.length)} m, radius ${fmt(minRadius)}–${fmt(maxRadius)} m, ${SAMPLES} samples`);
console.log("  minimum horizontal clearance by group:");
for (const g of groups) {
  const m = minByGroup[g];
  console.log(`    ${g.padEnd(10)} ${fmt(m.distance)} m  at progress ${fmt(m.u, 3)} ${m.at ? v3(m.at) : ""}`);
}
console.log(`  floor under route: max deviation from route floor ${fmt(worstFloor.delta, 3)} m (progress ${fmt(worstFloor.u, 3)})`);
console.log(`  nearest floor change (steps): ${fmt(edge.distance)} m (progress ${fmt(edge.u, 3)})`);
console.log(`  headroom above eye: ${fmt(headroom.distance)} m (progress ${fmt(headroom.u, 3)})`);

const minObstacle = Math.min(...groups.map((g) => minByGroup[g].distance));
if (minObstacle < THRESHOLDS.obstacleMin) problems.fail.push(`route within ${fmt(minObstacle)} m of geometry`);
else if (minByGroup.Pillars.distance < THRESHOLDS.pillarComfort) problems.warn.push(`route ${fmt(minByGroup.Pillars.distance)} m from a pillar (comfort ${THRESHOLDS.pillarComfort} m)`);
if (worstFloor.delta > 0.02) problems.fail.push(`route leaves its floor level (deviation ${fmt(worstFloor.delta, 3)} m)`);
if (edge.distance < THRESHOLDS.floorEdgeMin) problems.warn.push(`route ${fmt(edge.distance)} m from the steps`);
if (headroom.distance < THRESHOLDS.headroomMin) problems.fail.push(`only ${fmt(headroom.distance)} m headroom above the eye`);
if (segmentWarnings.length) {
  const from = segmentWarnings[0].u;
  const to = segmentWarnings[segmentWarnings.length - 1].u;
  console.log(`  ⚠ ${segmentWarnings.length} samples closer than ${THRESHOLDS.pillarComfort} m (progress ${fmt(from, 3)}–${fmt(to, 3)})`);
}

// Stations
// Presentation surfaces are screened against the same untouched hall voxel grid.
console.log("\nEra visual surfaces (10 cm grid; backdrop panel):");
for (const station of layout.stations) {
  const pose=eraPanelPose(station), panel=ERA_WORLD_LAYOUT.panel;
  let hits=0, samples=0;
  const probe=(x,y,z,origin,yaw)=>{
    const wx=origin[0]+x*Math.cos(yaw)+z*Math.sin(yaw), wz=origin[2]-x*Math.sin(yaw)+z*Math.cos(yaw);
    samples++; if(voxelAt(wx,y,wz)) hits++;
  };
  for(let x=-panel.width/2;x<=panel.width/2+.001;x+=.1) for(let y=pose.position[1]-panel.height/2;y<=pose.position[1]+panel.height/2;y+=.1) probe(x,y,0,pose.position,pose.heading);
  console.log(`  ${station.debugLabel.padEnd(14)} ${samples} probes, ${hits} hall intersections`);
  if(hits) problems.fail.push(`${station.debugLabel}: era visual surfaces intersect hall (${hits} probes)`);
}

// Instrument exhibits (EXHIBIT_SLOTS): the plinth footprint grown by 10 cm, up to the top of the instrument (its
// largest dimension at display scale, stood upright: a conservative bound). Floor flat under it, no hall voxels inside it.
console.log("\nExhibits (10 cm margin around plinth + instrument):");
for (const slot of EXHIBIT_SLOTS) {
  const members = slot.exhibitIds.map((id) => EXHIBITS.find((e) => e.id === id));
  const name = slot.exhibitIds.join(" + ");
  if (members.some((e) => !e)) { problems.fail.push(`exhibit slot ${name}: no such exhibit`); continue; }
  const yaw = exhibitHeading(slot), plinthSize = exhibitPlinthSize(slot);
  const top = Math.max(...members.map((e) => e.plinth)) + Math.max(...members.map((e) => e.size * e.display));
  const hw = plinthSize.width / 2 + 0.1, hd = plinthSize.depth / 2 + 0.1;
  let hits = 0, samples = 0, worstFloor = 0;
  for (let lx = -hw; lx <= hw + 1e-6; lx += 0.05) for (let lz = -hd; lz <= hd + 1e-6; lz += 0.05) {
    const wx = slot.position[0] + lx * Math.cos(yaw) + lz * Math.sin(yaw), wz = slot.position[2] - lx * Math.sin(yaw) + lz * Math.cos(yaw);
    const f = floor[cellOf(wx, wz)];
    worstFloor = Math.max(worstFloor, Number.isNaN(f) ? Infinity : Math.abs(f - slot.position[1]));
    for (let y = slot.position[1] + 0.1; y <= slot.position[1] + top + 0.05; y += 0.1) { samples++; if (voxelAt(wx, y, wz)) hits++; }
  }
  console.log(`  ${name.padEnd(20)} ${samples} probes, ${hits} hall intersections, floor deviation ${fmt(worstFloor, 3)} m`);
  if (hits) problems.fail.push(`exhibit ${name}: intersects hall (${hits} probes)`);
  if (worstFloor > 0.03) problems.fail.push(`exhibit ${name}: floor not flat under the plinth (${fmt(worstFloor, 3)} m)`);
}

// The listening desk (docs/LISTENING_STATION_TABLE.md) in station space, grown by the album-stack browse glide
// toward the visitor and a 5 cm margin: floor flatness under it and hall-voxel screening of its volume.
const DESK_ZONE = {
  xMin: LISTENING_DESK.slab.xMin - 0.05,
  xMax: LISTENING_DESK.slab.xMax + 0.05,
  zMin: LISTENING_DESK.slab.zMin - 0.05,
  zMax: Math.max(LISTENING_DESK.slab.zMax, ALBUM_STACK.origin.z + ALBUM_STACK.motion.glide + ALBUM_STACK.sleeve.size * 0.6) + 0.05,
  height: LISTENING_DESK.top + LISTENING_DESK.turntable.height + 0.06,
};
const toWorld = (station, lx, lz) => [
  station.position[0] + lx * Math.cos(station.heading) + lz * Math.sin(station.heading),
  station.position[2] - lx * Math.sin(station.heading) + lz * Math.cos(station.heading),
];

console.log("\nStations (listening desk " + (LISTENING_DESK.slab.xMax - LISTENING_DESK.slab.xMin).toFixed(2) + " × " + (LISTENING_DESK.slab.zMax - LISTENING_DESK.slab.zMin).toFixed(2) + " m + album-stack glide):");
for (const station of layout.stations) {
  const [x, y, z] = station.position;
  // Footprint flatness under the whole desk zone, and the desk volume against the hall voxels.
  let fMin = Infinity;
  let fMax = -Infinity;
  let deskHits = 0;
  let deskProbes = 0;
  let deskObstacle = Infinity;
  for (let lx = DESK_ZONE.xMin; lx <= DESK_ZONE.xMax + 1e-9; lx += CELL / 2) {
    for (let lz = DESK_ZONE.zMin; lz <= DESK_ZONE.zMax + 1e-9; lz += CELL / 2) {
      const [wx, wz] = toWorld(station, lx, lz);
      const f = floor[cellOf(wx, wz)];
      fMin = Math.min(fMin, f);
      fMax = Math.max(fMax, f);
      for (let ly = 0.1; ly <= DESK_ZONE.height; ly += 0.1) {
        deskProbes++;
        if (voxelAt(wx, y + ly, wz)) deskHits++;
      }
      deskObstacle = Math.min(deskObstacle, nearestObstacle(wx, wz, y).distance);
    }
  }
  if (deskHits) problems.fail.push(`${station.debugLabel}: listening desk intersects the hall (${deskHits} of ${deskProbes} probes)`);
  const steps = distanceToFloorChange(x, z, y);
  const obstacleNear = nearestObstacle(x, z, y);
  // Line of sight from the view anchor to the turntable deck.
  const from = new THREE.Vector3(...station.view.position);
  const to = new THREE.Vector3(...station.lookAt);
  const distance = from.distanceTo(to);
  const pitch = THREE.MathUtils.radToDeg(Math.asin((to.y - from.y) / distance));
  let blocked = null;
  for (let i = 1; i < 200 && !blocked; i++) {
    const p = from.clone().lerp(to, i / 200);
    if (p.distanceTo(to) < 0.4) break; // the table itself
    const hit = voxelAt(p.x, p.y, p.z);
    if (hit) blocked = `${hit} at ${v3([p.x, p.y, p.z])}`;
    else if (p.y < floor[cellOf(p.x, p.z)] + 0.02) blocked = `floor/step at ${v3([p.x, p.y, p.z])}`;
  }
  console.log(
    `  ${station.debugLabel.padEnd(14)} pos ${v3(station.position)}  heading ${fmt(THREE.MathUtils.radToDeg(station.heading), 1)}°` +
      `  progress ${fmt(station.progress, 4)} (${fmt(station.distanceAlongLoop, 1)} m)`,
  );
  console.log(
    `                 floor ${fmt(fMin)}…${fmt(fMax)}  steps ${fmt(steps)} m  nearest obstacle ${fmt(obstacleNear.distance)} m (${obstacleNear.group})  desk zone ${deskProbes} probes, ${deskHits} hits, obstacle ≥ ${fmt(deskObstacle)} m` +
      `  view ${fmt(distance)} m, pitch ${fmt(pitch, 1)}°  sightline ${blocked ? `BLOCKED by ${blocked}` : "clear"}`,
  );
  if (Math.abs(fMin - y) > 0.03 || Math.abs(fMax - y) > 0.03) problems.fail.push(`${station.debugLabel}: floor not flat at ${y}`);
  if (obstacleNear.distance < THRESHOLDS.stationObstacleMin) problems.warn.push(`${station.debugLabel}: ${fmt(obstacleNear.distance)} m from ${obstacleNear.group}`);
  if (steps < THRESHOLDS.stationStepMin) problems.warn.push(`${station.debugLabel}: ${fmt(steps)} m from the steps`);
  if (blocked) problems.fail.push(`${station.debugLabel}: sightline blocked`);
}

// Focus (listening-mode) cameras
console.log("\nFocus cameras:");
for (const station of layout.stations) {
  const { position, target, authoring } = station.focusCamera;
  const from = new THREE.Vector3(...position);
  const to = new THREE.Vector3(...target);
  const distance = from.distanceTo(to);
  const pitch = THREE.MathUtils.radToDeg(Math.asin((to.y - from.y) / distance));
  const clearance = nearestVoxel3D(...position, 1.0);
  const floorBelow = floor[cellOf(position[0], position[2])];
  let blocked = null;
  for (let i = 1; i < 200 && !blocked; i++) {
    const p = from.clone().lerp(to, i / 200);
    if (p.distanceTo(to) < 0.35) break; // the turntable itself
    const hit = voxelAt(p.x, p.y, p.z);
    if (hit) blocked = `${hit} at ${v3([p.x, p.y, p.z])}`;
  }
  console.log(
    `  ${station.debugLabel.padEnd(14)} cam ${v3(position)} → ${v3(target)}  yaw ${authoring.yawOffsetDeg}°` +
      `  dist ${fmt(distance)} m  pitch ${fmt(pitch, 1)}°  clearance ${fmt(clearance.distance)} m (${clearance.group || "none within 1 m"})` +
      `  floor below ${fmt(floorBelow)}  sightline ${blocked ? `BLOCKED by ${blocked}` : "clear"}`,
  );
  if (clearance.distance < THRESHOLDS.focusClearanceMin) problems.fail.push(`${station.debugLabel}: focus camera ${fmt(clearance.distance)} m from ${clearance.group}`);
  else if (clearance.distance < THRESHOLDS.focusClearanceComfort) problems.warn.push(`${station.debugLabel}: focus camera ${fmt(clearance.distance)} m from ${clearance.group}`);
  if (distance < THRESHOLDS.focusDistance[0] || distance > THRESHOLDS.focusDistance[1]) problems.warn.push(`${station.debugLabel}: focus distance ${fmt(distance)} m`);
  if (blocked) problems.fail.push(`${station.debugLabel}: focus sightline blocked`);
}

// Focus transitions (CameraRig): quadratic Bézier from the travel position to the focus camera,
// from start points spread over each station's whole ACTIVE range (focus is possible there).
console.log("\nFocus transitions (9 start points across each station's active range, 60 samples each):");
// Installation box in station space: listening desk + turntable + record (incl. staging) + album stack and its glide.
const INSTALLATION = { min: [DESK_ZONE.xMin + 0.03, 0, DESK_ZONE.zMin + 0.03], max: [DESK_ZONE.xMax - 0.03, 0.82, DESK_ZONE.zMax - 0.03] };
const boxDistance = (p) => {
  const d = [0, 1, 2].map((a) => Math.max(INSTALLATION.min[a] - p[a], 0, p[a] - INSTALLATION.max[a]));
  return Math.hypot(...d);
};
layout.stations.forEach((station, i) => {
  const count = layout.stations.length;
  const previous = layout.stations[(i - 1 + count) % count].progress;
  const next = layout.stations[(i + 1) % count].progress;
  const from = station.progress + progressDelta(station.progress, previous) / 2;
  const to = station.progress + progressDelta(station.progress, next) / 2;
  const cos = Math.cos(-station.heading);
  const sin = Math.sin(-station.heading);
  let hall = { distance: Infinity, group: "", start: 0 };
  let install = { distance: Infinity, start: 0 };
  let aboveFloor = { distance: Infinity, start: 0 };
  let longest = 0;
  for (let k = 0; k <= 8; k++) {
    const startU = ((from + ((to - from) * k) / 8) % 1 + 1) % 1;
    const start = layout.curve.getPointAt(startU).toArray();
    const end = station.focusCamera.position;
    const control = transitionControlPoint(start, end);
    longest = Math.max(longest, Math.hypot(end[0] - start[0], end[1] - start[1], end[2] - start[2]));
    for (let j = 1; j <= 60; j++) {
      const q = bezierPoint(start, control, end, j / 60);
      const h = nearestVoxel3D(q[0], q[1], q[2], 1.0);
      if (h.distance < hall.distance) hall = { distance: h.distance, group: h.group, start: startU };
      const f = floor[cellOf(q[0], q[2])];
      const above = Number.isNaN(f) ? Infinity : q[1] - f;
      if (above < aboveFloor.distance) aboveFloor = { distance: above, start: startU };
      const lx = q[0] - station.position[0];
      const lz = q[2] - station.position[2];
      const local = [lx * cos + lz * sin, q[1] - station.position[1], -lx * sin + lz * cos];
      const b = boxDistance(local);
      if (b < install.distance) install = { distance: b, start: startU };
    }
  }
  console.log(
    `  ${station.debugLabel.padEnd(14)} starts ${fmt(from, 3)}…${fmt(((to % 1) + 1) % 1, 3)}  longest ${fmt(longest)} m` +
      `  hall clearance ${fmt(hall.distance)} m (${hall.group || "none within 1 m"}, start ${fmt(hall.start, 3)})` +
      `  installation ${fmt(install.distance)} m  above floor ≥ ${fmt(aboveFloor.distance)} m`,
  );
  if (hall.distance < THRESHOLDS.transitionClearanceMin) problems.fail.push(`${station.debugLabel}: focus transition ${fmt(hall.distance)} m from ${hall.group}`);
  else if (hall.distance < THRESHOLDS.transitionClearanceComfort) problems.warn.push(`${station.debugLabel}: focus transition ${fmt(hall.distance)} m from ${hall.group}`);
  if (install.distance < THRESHOLDS.transitionStationMin) problems.fail.push(`${station.debugLabel}: focus transition ${fmt(install.distance)} m from the installation`);
  if (aboveFloor.distance < THRESHOLDS.transitionFloorMin) problems.fail.push(`${station.debugLabel}: focus transition ${fmt(aboveFloor.distance)} m above the floor`);
});
void FOCUS_CONFIG;

console.log("");
for (const f of problems.fail) console.log(`✗ FAIL  ${f}`);
for (const w of problems.warn) console.log(`⚠ WARN  ${w}`);
if (!problems.fail.length && !problems.warn.length) console.log("✓ No problems found within the limits of this check.");
process.exitCode = problems.fail.length ? 1 : 0;
