// Builds the hall's instrument exhibits (src/data/exhibits.ts) from the Sketchfab originals in /exhibits-src
// into /public/models/exhibits. Sources are never modified.
//
//   npm run exhibits                 all
//   npm run exhibits -- conga guitar only some
//
// For each model: an optional corrective rotation, real-world size (largest dimension) with the origin at the
// bottom-centre, optional Meshopt simplification, WebP textures capped at 1024 px, Meshopt geometry compression.
// The credit travels in the file's asset extras.

import { mkdirSync, statSync } from "node:fs";
import { NodeIO, getBounds } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { dedup, meshopt, normals, prune, simplify, textureCompress, weld } from "@gltf-transform/functions";
import { MeshoptDecoder, MeshoptEncoder, MeshoptSimplifier } from "meshoptimizer";
import sharp from "sharp";
import { EXHIBITS } from "../src/data/exhibits.ts";

await Promise.all([MeshoptDecoder.ready, MeshoptEncoder.ready, MeshoptSimplifier.ready]);
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ "meshopt.decoder": MeshoptDecoder, "meshopt.encoder": MeshoptEncoder });

const OUT = "public/models/exhibits";
const TEXTURE_MAX = 1024;
mkdirSync(OUT, { recursive: true });

const only = process.argv.slice(2);
const deg = (d) => (d * Math.PI) / 180;
/** XYZ Euler (degrees) → quaternion [x, y, z, w]. */
function quat([x, y, z]) {
  const [cx, sx, cy, sy, cz, sz] = [Math.cos(deg(x) / 2), Math.sin(deg(x) / 2), Math.cos(deg(y) / 2), Math.sin(deg(y) / 2), Math.cos(deg(z) / 2), Math.sin(deg(z) / 2)];
  return [sx * cy * cz + cx * sy * sz, cx * sy * cz - sx * cy * sz, cx * cy * sz + sx * sy * cz, cx * cy * cz - sx * sy * sz];
}
const triangles = (doc) =>
  doc.getRoot().listMeshes().flatMap((m) => m.listPrimitives()).reduce((n, p) => n + (p.getIndices()?.getCount() ?? p.getAttribute("POSITION").getCount()) / 3, 0);

for (const exhibit of EXHIBITS) {
  if (only.length && !only.includes(exhibit.id)) continue;
  const doc = await io.read(`exhibits-src/${exhibit.source}`);
  const root = doc.getRoot();
  const scene = root.getDefaultScene() ?? root.listScenes()[0];
  const before = triangles(doc);

  // Orient → size → place: two wrapper nodes around the source hierarchy (leaf transforms stay as authored).
  const orient = doc.createNode("Orient");
  for (const child of scene.listChildren()) {
    scene.removeChild(child);
    orient.addChild(child);
  }
  if (exhibit.rotate) orient.setRotation(quat(exhibit.rotate));
  const node = doc.createNode(`Exhibit_${exhibit.id}`).addChild(orient);
  scene.addChild(node);
  const raw = getBounds(scene);
  const extent = raw.max.map((v, i) => v - raw.min[i]);
  const scale = exhibit.size / Math.max(...extent);
  node.setScale([scale, scale, scale]);
  node.setTranslation([-((raw.min[0] + raw.max[0]) / 2) * scale, -raw.min[1] * scale, -((raw.min[2] + raw.max[2]) / 2) * scale]);

  const asset = root.getAsset();
  asset.extras = { ...(asset.extras ?? {}), exhibit: exhibit.id, credit: exhibit.credit };

  // Per-face vertices (flat normals) defeat welding, so the simplifier would see only loose triangles.
  if (exhibit.reweld) for (const mesh of root.listMeshes()) for (const prim of mesh.listPrimitives()) prim.setAttribute("NORMAL", null);

  await doc.transform(
    dedup(),
    ...(exhibit.keep ? [weld(), simplify({ simplifier: MeshoptSimplifier, ratio: exhibit.keep, error: exhibit.error ?? 0.002 })] : []),
    ...(exhibit.reweld ? [normals({ overwrite: true })] : []),
    prune(),
    textureCompress({ encoder: sharp, targetFormat: "webp", resize: [TEXTURE_MAX, TEXTURE_MAX] }),
    meshopt({ encoder: MeshoptEncoder, level: "high" }),
  );

  const out = `${OUT}/${exhibit.id}.glb`;
  await io.write(out, doc);
  const placed = getBounds(scene);
  const size = placed.max.map((v, i) => (v - placed.min[i]).toFixed(2)).join(" × ");
  console.log(`${exhibit.id.padEnd(13)} ${Math.round(before).toLocaleString().padStart(8)} → ${Math.round(triangles(doc)).toLocaleString().padStart(7)} tris   ${size} m   ${(statSync(out).size / 1048576).toFixed(2)} MB`);
}
