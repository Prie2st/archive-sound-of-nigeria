// Texture audit for GLB files: every texture with its size, format, alpha usage,
// the material slots that use it and its estimated decoded GPU memory.
//
//   npm run audit:textures                         station runtime models (every profile file present)
//   npm run audit:textures -- turntable.glb ...    any GLB files (e.g. the root source files)
//   npm run audit:textures -- --detail             + content spread, downscale error, texel density
//
// GPU memory is estimated the way three.js uploads these images: RGBA8 (4 bytes / px)
// plus a full mip chain (+⅓), whatever the file format (WebP / PNG / JPEG all decode to RGBA8).

import { existsSync } from "node:fs";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { MeshoptDecoder } from "meshoptimizer";
import sharp from "sharp";

await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.decoder": MeshoptDecoder });

const STATION_MODELS = ["public/models/furniture/table", "public/models/turntable/turntable", "public/models/vinyl/vinyl"];
const PROFILES = ["-reference", "-high", "-medium", "-low"];

const gpuBytes = (w, h) => w * h * 4 * (4 / 3);
const mb = (bytes) => (bytes / 1024 / 1024).toFixed(1);

/** Material slots (incl. extension slots) that reference a texture, e.g. "Body.normalTexture". */
function usage(doc, texture) {
  const uses = [];
  for (const edge of doc.getGraph().listParentEdges(texture)) {
    const parent = edge.getParent();
    if (parent.propertyType === "Root") continue;
    const owner = parent.propertyType === "Material" ? parent : doc.getRoot().listMaterials().find((m) => m.listExtensions().includes(parent));
    uses.push(`${owner?.getName() || "?"}.${edge.getName()}`);
  }
  return uses;
}

async function audit(path) {
  const doc = await io.read(path);
  const rows = [];
  for (const texture of doc.getRoot().listTextures()) {
    const image = texture.getImage();
    const meta = await sharp(image).metadata();
    let alpha = "none";
    if (meta.hasAlpha) {
      const stats = await sharp(image).stats();
      const a = stats.channels.at(-1); // alpha is the last channel (grey+alpha images have two)
      alpha = a.min === 255 ? "channel unused (all 255)" : `used (min ${a.min}, mean ${a.mean.toFixed(0)})`;
    }
    rows.push({
      name: texture.getName() || "(unnamed)",
      size: `${meta.width}×${meta.height}`,
      format: texture.getMimeType().replace("image/", ""),
      fileKB: Math.round(image.byteLength / 1024),
      alpha,
      gpuMB: gpuBytes(meta.width, meta.height),
      uses: usage(doc, texture).join(", "),
    });
  }
  const total = rows.reduce((s, r) => s + r.gpuMB, 0);
  console.log(`\n## ${path} — ${rows.length} textures, ≈${mb(total)} MB decoded (RGBA8 + mips)`);
  for (const r of rows) {
    console.log(`  ${r.name.padEnd(28)} ${r.size.padEnd(10)} ${r.format.padEnd(5)} ${String(r.fileKB).padStart(5)} KB  ${mb(r.gpuMB).padStart(5)} MB  alpha: ${r.alpha.padEnd(26)} ${r.uses}`);
  }
  if (detail) {
    await detailContent(doc);
    texelDensity(doc);
  }
  return total;
}

/**
 * How much detail each texture actually carries: per-channel spread, and the RMS error
 * (0–255 scale) of a round trip through half / quarter resolution. A low round-trip
 * error means the extra resolution holds almost nothing.
 */
async function detailContent(doc) {
  console.log("  content (stddev per channel · RMS error of a ½ / ¼ resolution round trip):");
  for (const texture of doc.getRoot().listTextures()) {
    const image = texture.getImage();
    const { width, height } = await sharp(image).metadata();
    const stats = await sharp(image).stats();
    const original = await sharp(image).removeAlpha().raw().toBuffer();
    const roundTrip = async (factor) => {
      const small = await sharp(image).removeAlpha().resize(Math.round(width / factor), Math.round(height / factor), { kernel: "lanczos3" }).toBuffer();
      const back = await sharp(small).resize(width, height, { kernel: "cubic" }).raw().toBuffer();
      let sum = 0;
      for (let i = 0; i < original.length; i++) sum += (original[i] - back[i]) ** 2;
      return Math.sqrt(sum / original.length).toFixed(2);
    };
    const spread = stats.channels.map((c) => c.stdev.toFixed(1)).join("/");
    console.log(`    ${usage(doc, texture).join(", ").padEnd(70)} σ ${spread.padEnd(18)} ½: ${await roundTrip(2)}  ¼: ${await roundTrip(4)}`);
  }
}

/**
 * Texel density per material on the actual mesh surfaces (texels per millimetre at the
 * texture's current size), area-weighted over all triangles. Compare with the screen
 * density in the closest view: above it, the GPU samples a smaller mip level anyway.
 */
function texelDensity(doc) {
  const perMaterial = new Map();
  for (const node of doc.getRoot().listNodes()) {
    const mesh = node.getMesh();
    if (!mesh) continue;
    const m = node.getWorldMatrix();
    const world = (p) => [m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12], m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13], m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14]];
    for (const prim of mesh.listPrimitives()) {
      const material = prim.getMaterial();
      const position = prim.getAttribute("POSITION");
      const uv = prim.getAttribute("TEXCOORD_0");
      if (!material || !uv) continue;
      const indices = prim.getIndices();
      const count = indices ? indices.getCount() : position.getCount();
      const index = (i) => (indices ? indices.getScalar(i) : i);
      const entry = perMaterial.get(material) ?? { world: 0, uv: 0, nodes: new Set() };
      entry.nodes.add(node.getName());
      const p = [[], [], []].map(() => [0, 0, 0]);
      const t = [[], [], []].map(() => [0, 0]);
      for (let i = 0; i < count; i += 3) {
        for (let j = 0; j < 3; j++) {
          p[j] = world(position.getElement(index(i + j), [0, 0, 0]));
          t[j] = uv.getElement(index(i + j), [0, 0]);
        }
        const a = [p[1][0] - p[0][0], p[1][1] - p[0][1], p[1][2] - p[0][2]];
        const b = [p[2][0] - p[0][0], p[2][1] - p[0][1], p[2][2] - p[0][2]];
        entry.world += Math.hypot(a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]) / 2;
        entry.uv += Math.abs((t[1][0] - t[0][0]) * (t[2][1] - t[0][1]) - (t[2][0] - t[0][0]) * (t[1][1] - t[0][1])) / 2;
      }
      perMaterial.set(material, entry);
    }
  }
  console.log("  texel density (texels / mm on the surface, at the texture's current size; UV area used):");
  for (const [material, { world, uv, nodes }] of perMaterial) {
    const texture = material.getNormalTexture() ?? material.getBaseColorTexture() ?? material.getMetallicRoughnessTexture();
    if (!texture) continue;
    const size = texture.getSize()?.[0] ?? 0;
    const perMm = (Math.sqrt(uv / world) * size) / 1000;
    console.log(`    ${material.getName().padEnd(20)} ${[...nodes].join("+").padEnd(36)} ${(world * 1e4).toFixed(0).padStart(6)} cm²  UV ${(uv * 100).toFixed(1).padStart(5)} %  ${perMm.toFixed(2)} texels/mm @ ${size}`);
  }
}

const detail = process.argv.includes("--detail");
const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const files = args.length
  ? args
  : PROFILES.flatMap((suffix) => STATION_MODELS.map((m) => `${m}${suffix}.glb`)).filter((f) => existsSync(f));
let grand = 0;
for (const file of files) grand += await audit(file);
if (files.length > 1) console.log(`\nTotal over the listed files: ≈${mb(grand)} MB`);
