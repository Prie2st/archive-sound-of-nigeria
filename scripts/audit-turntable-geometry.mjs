// Geometry audit of a runtime turntable GLB (default: the ACTIVE tier of the medium profile):
// triangles per node / material, connected components by size, the most expensive
// components, and which components are never visible from exhibition views.
//
//   npm run audit:geometry
//   npm run audit:geometry -- public/models/turntable/turntable-medium.glb [rootNodeName]

import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { MeshoptDecoder } from "meshoptimizer";
import { componentLabels, componentStats, exhibitionViews, simplifyPart, visibleTriangles } from "./lib/lod.mjs";

await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.decoder": MeshoptDecoder });

const [path = "public/models/turntable/turntable-medium.glb", rootName = "Turntable"] = process.argv.slice(2);
const doc = await io.read(path);
const root = doc.getRoot().listNodes().find((n) => n.getName() === rootName);
if (!root) throw new Error(`No node "${rootName}" in ${path}`);

/** Primitives under `root` as parts in the root's frame (dequantized, pivots at rest). */
function partsUnder(node) {
  const parts = [];
  node.traverse((child) => {
    const mesh = child.getMesh();
    if (!mesh) return;
    const m = child.getWorldMatrix();
    for (const prim of mesh.listPrimitives()) {
      const position = prim.getAttribute("POSITION");
      const data = new Float32Array(position.getCount() * 3);
      const p = [0, 0, 0];
      for (let i = 0; i < position.getCount(); i++) {
        position.getElement(i, p);
        data[i * 3] = m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12];
        data[i * 3 + 1] = m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13];
        data[i * 3 + 2] = m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14];
      }
      parts.push({
        name: child.getName(),
        material: prim.getMaterial(),
        attrs: { POSITION: { size: 3, data } },
        indices: new Uint32Array(prim.getIndices().getArray()),
      });
    }
  });
  return parts;
}

const parts = partsUnder(root);
const mm = (v) => (v * 1000).toFixed(0);
const total = parts.reduce((n, p) => n + p.indices.length / 3, 0);

console.log(`# ${path} → ${rootName}: ${total.toLocaleString()} triangles in ${parts.length} primitives\n`);

const started = performance.now();
const views = exhibitionViews();
const visible = visibleTriangles(parts, views, 1024);
console.log(`visibility: ${views.length} views at 1024², ${((performance.now() - started) / 1000).toFixed(1)} s\n`);

const components = [];
parts.forEach((part, k) => {
  const labels = componentLabels(part);
  const stats = componentStats(part, labels);
  const anyVisible = new Uint8Array(labels.count);
  for (let t = 0; t < labels.labels.length; t++) if (visible[k][t]) anyVisible[labels.labels[t]] = 1;
  // Downward-facing triangles (normal.y < −0.9): undersides.
  const position = part.attrs.POSITION.data;
  let down = 0;
  for (let t = 0; t < part.indices.length; t += 3) {
    const [a, b, c] = [0, 1, 2].map((j) => part.indices[t + j] * 3);
    const e1 = [0, 1, 2].map((i) => position[b + i] - position[a + i]);
    const e2 = [0, 1, 2].map((i) => position[c + i] - position[a + i]);
    const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    if (n[1] / (Math.hypot(...n) || 1) < -0.9) down++;
  }
  part.summary = { components: labels.count, down, hiddenTris: 0, hiddenComponents: 0 };
  for (const s of stats) {
    s.part = `${part.name} / ${part.material.getName()}`;
    s.visible = !!anyVisible[s.id];
    if (!s.visible) {
      part.summary.hiddenTris += s.triangles;
      part.summary.hiddenComponents++;
    }
    components.push(s);
  }
});

console.log("## Per node / material");
for (const part of parts) {
  const s = part.summary;
  const tris = part.indices.length / 3;
  console.log(
    `  ${part.name.padEnd(12)} ${part.material.getName().padEnd(18)} ${String(tris).padStart(7)} tris  ${String(s.components).padStart(5)} comps` +
      `  never visible: ${String(s.hiddenTris).padStart(6)} tris / ${String(s.hiddenComponents).padStart(4)} comps  down-facing ${s.down}`,
  );
}
const byNode = {};
for (const part of parts) byNode[part.name] = (byNode[part.name] ?? 0) + part.indices.length / 3;
console.log(`  totals: ${Object.entries(byNode).map(([k, v]) => `${k} ${v.toLocaleString()}`).join(" · ")}\n`);

console.log("## Components by size (largest bounding-box edge)");
const buckets = [[0, 0.003, "< 3 mm"], [0.003, 0.01, "3–10 mm"], [0.01, 0.03, "10–30 mm"], [0.03, 0.1, "30–100 mm"], [0.1, Infinity, "≥ 100 mm"]];
for (const [lo, hi, label] of buckets) {
  const inBucket = components.filter((c) => c.extent >= lo && c.extent < hi);
  const tris = inBucket.reduce((n, c) => n + c.triangles, 0);
  const hidden = inBucket.filter((c) => !c.visible);
  console.log(
    `  ${label.padEnd(10)} ${String(inBucket.length).padStart(5)} comps  ${String(tris).padStart(7)} tris (${((tris / total) * 100).toFixed(1).padStart(4)} %)` +
      `  never visible: ${hidden.length} comps / ${hidden.reduce((n, c) => n + c.triangles, 0)} tris`,
  );
}

console.log("\n## 30 most expensive components (size and centre in mm; x right, y up, z front)");
for (const c of [...components].sort((a, b) => b.triangles - a.triangles).slice(0, 30)) {
  console.log(
    `  ${String(c.triangles).padStart(7)} tris  ${c.part.padEnd(32)} size ${c.size.map(mm).join("×").padEnd(14)} centre (${c.center.map(mm).join(", ")})${c.visible ? "" : "  NEVER VISIBLE"}`,
  );
}

// Simplification sweep: triangles left at absolute error bounds (screen size of one pixel:
// ≈6.6 mm at 6 m, ≈13 mm at 12 m, ≈22 mm at 20 m for a 852 px tall, 50° view).
console.log("\n## Simplification sweep (meshoptimizer, absolute error; +prune removes pieces below the error, +permissive collapses across seams)");
const sweep = [0.0002, 0.0005, 0.001, 0.002, 0.004, 0.008];
console.log(`  ${"node / material".padEnd(32)} ${"source".padStart(7)} ${sweep.map((e) => `${e * 1000} mm`.padStart(9)).join("")}   (+prune +permissive)`);
const sums = sweep.map(() => [0, 0]);
for (const part of parts) {
  const counts = sweep.map((error, i) => {
    const plain = simplifyPart(part, { error }).indices.length / 3;
    const pruned = simplifyPart(part, { error, prune: true, permissive: true }).indices.length / 3;
    sums[i][0] += plain;
    sums[i][1] += pruned;
    return [plain, pruned];
  });
  console.log(`  ${`${part.name} / ${part.material.getName()}`.padEnd(32)} ${String(part.indices.length / 3).padStart(7)} ${counts.map(([a]) => String(a).padStart(9)).join("")}   ${counts.map(([, b]) => b).join(" / ")}`);
}
console.log(`  ${"TOTAL".padEnd(32)} ${String(total).padStart(7)} ${sums.map(([a]) => String(a).padStart(9)).join("")}   ${sums.map(([, b]) => b).join(" / ")}`);

const hidden = components.filter((c) => !c.visible);
console.log(`\n## Never visible: ${hidden.length} components, ${hidden.reduce((n, c) => n + c.triangles, 0).toLocaleString()} triangles; largest:`);
for (const c of hidden.sort((a, b) => b.triangles - a.triangles).slice(0, 15)) {
  console.log(`  ${String(c.triangles).padStart(7)} tris  ${c.part.padEnd(32)} size ${c.size.map(mm).join("×").padEnd(14)} centre (${c.center.map(mm).join(", ")})`);
}
