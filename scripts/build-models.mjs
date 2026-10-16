// Builds the runtime GLBs in /public/models from the source GLBs in the repo root.
//
//   npm run models
//
// Source files are never modified. For each model this script:
//   1. bakes the Sketchfab wrapper transforms into the geometry (Y-up, metres),
//   2. rebuilds a clean, named hierarchy with pivots placed for animation,
//   3. normalizes scale to real-world metres and puts the origin at the bottom-centre,
//   4. compresses (Meshopt geometry, WebP textures).
//
// The turntable and vinyl also carry NEARBY / DISTANT LOD copies of their geometry as extra
// scene roots / groups in the same file (src/data/stationLod.ts, docs/STATION_LOD.md).
//
// Station models (table, turntable, vinyl) are written once per texture profile
// (src/data/textureProfiles.ts), e.g. turntable-high.glb / -medium.glb / -low.glb:
// same geometry, per-texture resolutions from STATION_TEXTURE_RULES.
//
//   npm run models -- turntable --profiles=medium          only some profiles
//   npm run models -- table turntable --profiles=reference  dev A/B: pre-optimisation textures (2048 cap)
//
// The resulting node names / anchors / extras are documented in CLAUDE.md §9.

import { mkdirSync, statSync } from "node:fs";
import { dirname } from "node:path";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { cloneDocument, dedup, meshopt, prune, textureCompress, weld } from "@gltf-transform/functions";
import { MeshoptDecoder, MeshoptEncoder } from "meshoptimizer";
import sharp from "sharp";
import { TURNTABLE_LOD, VINYL_LOD, lodNodeName } from "../src/data/stationLod.ts";
import { TEXTURE_PROFILES, isStationModelVariant, stationTextureSize } from "../src/data/textureProfiles.ts";
import { simplifyPart, weldPart } from "./lib/lod.mjs";

await Promise.all([MeshoptDecoder.ready, MeshoptEncoder.ready]);

const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ "meshopt.decoder": MeshoptDecoder, "meshopt.encoder": MeshoptEncoder });

// Real-world reference sizes (metres).
const RECORD_DIAMETER = 0.302; // 12" LP
const LABEL_RADIUS = 0.05; // 100 mm label
const SLEEVE_WIDTH = 0.314; // 12" sleeve
const CM = 0.01;

// ---------------------------------------------------------------------------
// Small vector / matrix helpers (column vectors, row-major 3x3 arrays)
// ---------------------------------------------------------------------------

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const normalize = (a) => {
  const l = len(a);
  return [a[0] / l, a[1] / l, a[2] / l];
};
const IDENTITY3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];
const mul3 = (R, v) => [
  R[0] * v[0] + R[1] * v[1] + R[2] * v[2],
  R[3] * v[0] + R[4] * v[1] + R[5] * v[2],
  R[6] * v[0] + R[7] * v[1] + R[8] * v[2],
];
/** Rotation whose rows are the given orthonormal axes: maps world -> (x, y, z) basis. */
const basis = (x, y, z) => [...x, ...y, ...z];
/** Shortest-arc rotation taking unit vector a onto unit vector b. */
function rotationBetween(a, b) {
  const v = cross(a, b);
  const c = dot(a, b);
  const k = 1 / (1 + c);
  return [
    v[0] * v[0] * k + c, v[0] * v[1] * k - v[2], v[0] * v[2] * k + v[1],
    v[1] * v[0] * k + v[2], v[1] * v[1] * k + c, v[1] * v[2] * k - v[0],
    v[2] * v[0] * k - v[1], v[2] * v[1] * k + v[0], v[2] * v[2] * k + c,
  ];
}

// ---------------------------------------------------------------------------
// "Parts": triangle soups detached from the source document, in baked space
// ---------------------------------------------------------------------------

/**
 * @typedef {{ name: string, parent?: string | null, material: import('@gltf-transform/core').Material | null,
 *   attrs: Record<string, { size: number, data: Float32Array }>, indices: Uint32Array }} Part
 */

/** Extracts every primitive as a Part with its node's world transform baked in. */
function extractParts(doc) {
  const parts = [];
  for (const node of doc.getRoot().listNodes()) {
    const mesh = node.getMesh();
    if (!mesh) continue;
    const m = node.getWorldMatrix(); // column-major
    const L = [m[0], m[4], m[8], m[1], m[5], m[9], m[2], m[6], m[10]]; // linear part, row-major
    const t = [m[12], m[13], m[14]];
    const det = L[0] * (L[4] * L[8] - L[5] * L[7]) - L[1] * (L[3] * L[8] - L[5] * L[6]) + L[2] * (L[3] * L[7] - L[4] * L[6]);
    if (det <= 0) throw new Error(`${node.getName()}: mirrored transforms are not supported`);
    for (const prim of mesh.listPrimitives()) {
      const attrs = {};
      for (const semantic of prim.listSemantics()) {
        const acc = prim.getAttribute(semantic);
        if (acc.getNormalized() || !(acc.getArray() instanceof Float32Array)) {
          throw new Error(`${node.getName()}: expected float ${semantic}`);
        }
        const size = acc.getElementSize();
        const data = new Float32Array(acc.getArray());
        const count = acc.getCount();
        for (let i = 0; i < count; i++) {
          const o = i * size;
          if (semantic === "POSITION") {
            const p = mul3(L, [data[o], data[o + 1], data[o + 2]]);
            data.set([p[0] + t[0], p[1] + t[1], p[2] + t[2]], o);
          } else if (semantic === "NORMAL" || semantic === "TANGENT") {
            data.set(normalize(mul3(L, [data[o], data[o + 1], data[o + 2]])), o);
          }
        }
        attrs[semantic] = { size, data };
      }
      const indices = prim.getIndices()
        ? new Uint32Array(prim.getIndices().getArray())
        : Uint32Array.from({ length: prim.getAttribute("POSITION").getCount() }, (_, i) => i);
      parts.push({
        name: node.getName(),
        parent: node.getParentNode()?.getName() ?? null,
        material: prim.getMaterial(),
        attrs,
        indices,
      });
    }
  }
  // Detach: the document is rebuilt from scratch with these parts.
  for (const node of doc.getRoot().listNodes()) node.dispose();
  for (const mesh of doc.getRoot().listMeshes()) mesh.dispose();
  return parts;
}

const vertexCount = (part) => part.attrs.POSITION.data.length / 3;
const getPos = (part, i) => Array.from(part.attrs.POSITION.data.subarray(i * 3, i * 3 + 3));

function bounds(parts) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const part of [parts].flat()) {
    const d = part.attrs.POSITION.data;
    for (const i of part.indices) {
      for (let a = 0; a < 3; a++) {
        min[a] = Math.min(min[a], d[i * 3 + a]);
        max[a] = Math.max(max[a], d[i * 3 + a]);
      }
    }
  }
  return { min, max, center: min.map((v, a) => (v + max[a]) / 2), size: min.map((v, a) => max[a] - v) };
}

/** p' = s * R * p + t (normals and tangents rotated). Mutates the part. */
function transformPart(part, { R = IDENTITY3, s = 1, t = [0, 0, 0] }) {
  for (const [semantic, { size, data }] of Object.entries(part.attrs)) {
    if (semantic !== "POSITION" && semantic !== "NORMAL" && semantic !== "TANGENT") continue;
    for (let o = 0; o < data.length; o += size) {
      const v = mul3(R, [data[o], data[o + 1], data[o + 2]]);
      if (semantic === "POSITION") data.set([s * v[0] + t[0], s * v[1] + t[1], s * v[2] + t[2]], o);
      else data.set(v, o);
    }
  }
  return part;
}

/** Splits a part into connected components (vertices welded by position). */
function components(part) {
  const n = vertexCount(part);
  const parent = new Int32Array(n).map((_, i) => i);
  const find = (x) => {
    while (parent[x] !== x) x = parent[x] = parent[parent[x]];
    return x;
  };
  const union = (a, b) => {
    a = find(a);
    b = find(b);
    if (a !== b) parent[a] = b;
  };
  const byKey = new Map();
  for (let i = 0; i < n; i++) {
    const key = getPos(part, i).map((v) => Math.round(v * 1e5)).join(",");
    if (byKey.has(key)) union(i, byKey.get(key));
    else byKey.set(key, i);
  }
  const idx = part.indices;
  for (let t = 0; t < idx.length; t += 3) {
    union(idx[t], idx[t + 1]);
    union(idx[t], idx[t + 2]);
  }
  const groups = new Map();
  for (let t = 0; t < idx.length; t += 3) {
    const root = find(idx[t]);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(t / 3);
  }
  return [...groups.values()].map((tris) => subset(part, tris));
}

/** New part containing only the given triangles, with compacted vertices. */
function subset(part, tris) {
  const remap = new Map();
  const indices = new Uint32Array(tris.length * 3);
  tris.forEach((t, k) => {
    for (let j = 0; j < 3; j++) {
      const v = part.indices[t * 3 + j];
      if (!remap.has(v)) remap.set(v, remap.size);
      indices[k * 3 + j] = remap.get(v);
    }
  });
  const attrs = {};
  for (const [semantic, { size, data }] of Object.entries(part.attrs)) {
    const out = new Float32Array(remap.size * size);
    for (const [from, to] of remap) out.set(data.subarray(from * size, from * size + size), to * size);
    attrs[semantic] = { size, data: out };
  }
  return { name: part.name, material: part.material, attrs, indices };
}

/** Concatenates parts that share a material and attribute layout. */
function merge(parts, name) {
  const semantics = Object.keys(parts[0].attrs).sort();
  const attrs = {};
  for (const semantic of semantics) {
    const size = parts[0].attrs[semantic].size;
    const data = new Float32Array(parts.reduce((n, p) => n + p.attrs[semantic].data.length, 0));
    let o = 0;
    for (const p of parts) {
      data.set(p.attrs[semantic].data, o);
      o += p.attrs[semantic].data.length;
    }
    attrs[semantic] = { size, data };
  }
  const indices = new Uint32Array(parts.reduce((n, p) => n + p.indices.length, 0));
  let o = 0;
  let base = 0;
  for (const p of parts) {
    for (let i = 0; i < p.indices.length; i++) indices[o + i] = p.indices[i] + base;
    o += p.indices.length;
    base += vertexCount(p);
  }
  return { name, material: parts[0].material, attrs, indices };
}

const layoutKey = (part) =>
  `${part.material?.getName() ?? "none"}|${Object.keys(part.attrs).sort().join(",")}`;

/** Merges parts per material + attribute layout, to minimise draw calls. */
function mergeByMaterial(parts, name) {
  const groups = new Map();
  for (const p of parts) {
    const key = layoutKey(p);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(p);
  }
  return [...groups.values()].map((g) => merge(g, name));
}

// ---------------------------------------------------------------------------
// Writing nodes back into a document
// ---------------------------------------------------------------------------

function createPrimitive(doc, part) {
  const buffer = doc.getRoot().listBuffers()[0];
  const prim = doc.createPrimitive().setMaterial(part.material);
  for (const [semantic, { size, data }] of Object.entries(part.attrs)) {
    const type = { 2: "VEC2", 3: "VEC3", 4: "VEC4" }[size];
    prim.setAttribute(semantic, doc.createAccessor().setType(type).setArray(data).setBuffer(buffer));
  }
  prim.setIndices(doc.createAccessor().setType("SCALAR").setArray(part.indices).setBuffer(buffer));
  return prim;
}

/** Group node (pivot) — never holds a mesh, so it can be animated freely. */
function group(doc, parent, name, translation = [0, 0, 0], extras) {
  const node = doc.createNode(name).setTranslation(translation);
  if (extras) node.setExtras(extras);
  parent.addChild(node);
  return node;
}

/** Leaf node holding a mesh. Its transform belongs to the compressor — don't animate it. */
function meshNode(doc, parent, name, parts) {
  const mesh = doc.createMesh(name);
  for (const part of parts) mesh.addPrimitive(createPrimitive(doc, part));
  const node = doc.createNode(name).setMesh(mesh);
  parent.addChild(node);
  return node;
}

/** Another top-level node in the default scene (LOD tiers next to the ACTIVE root). */
function addRoot(doc, name) {
  const node = doc.createNode(name);
  doc.getRoot().getDefaultScene().addChild(node);
  return node;
}

function newRoot(doc, name) {
  const scene = doc.getRoot().listScenes()[0] ?? doc.createScene();
  scene.setName("Scene"); // distinct from the root node name, so three.js keeps "Turntable" etc. unsuffixed
  doc.getRoot().setDefaultScene(scene);
  const root = doc.createNode(name);
  scene.addChild(root);
  return root;
}

/** Moves parts so that the combined bounds sit bottom-centred on the origin. */
function groundAndCentre(parts) {
  const b = bounds(parts);
  const t = [-b.center[0], -b.min[1], -b.center[2]];
  for (const p of parts) transformPart(p, { t });
  return bounds(parts);
}

// ---------------------------------------------------------------------------
// Texture helpers
// ---------------------------------------------------------------------------

async function placeholderTexture(doc, name, svg) {
  const image = await sharp(Buffer.from(svg)).png().toBuffer();
  return doc.createTexture(name).setImage(image).setMimeType("image/png");
}

/**
 * Paints a filled circle into every texture of a material (e.g. to erase the
 * printed label from the vinyl). The colour of each texture is sampled at
 * `sampleUV`, so the patch blends with the surrounding dead wax.
 */
async function paintCircle(material, centerUV, radiusUV, sampleUVs) {
  const textures = [material.getBaseColorTexture(), material.getNormalTexture(), material.getMetallicRoughnessTexture()];
  for (const texture of textures.filter(Boolean)) {
    const img = sharp(texture.getImage());
    const { width, height } = await img.metadata();
    const { data, info } = await img.clone().raw().toBuffer({ resolveWithObject: true });
    const avg = [0, 0, 0];
    for (const [u, v] of sampleUVs) {
      const x = Math.round((((u % 1) + 1) % 1) * (width - 1));
      const y = Math.round((((v % 1) + 1) % 1) * (height - 1));
      for (let c = 0; c < 3; c++) avg[c] += data[(y * width + x) * info.channels + c] / sampleUVs.length;
    }
    const fill = `rgb(${avg.map(Math.round).join(",")})`;
    const cx = (((centerUV[0] % 1) + 1) % 1) * width;
    const cy = (((centerUV[1] % 1) + 1) % 1) * height;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
      <circle cx="${cx}" cy="${cy}" r="${radiusUV * width}" fill="${fill}"/></svg>`;
    const out = await img.composite([{ input: Buffer.from(svg) }]).png().toBuffer();
    texture.setImage(out).setMimeType("image/png");
  }
}

/** Removes an emissive texture that is pure black (it costs GPU memory and does nothing). */
async function dropBlackEmissive(material) {
  const texture = material.getEmissiveTexture();
  if (!texture) return false;
  const { channels } = await sharp(texture.getImage()).stats();
  if (channels.slice(0, 3).some((c) => c.max > 0)) return false;
  material.setEmissiveTexture(null).setEmissiveFactor([0, 0, 0]);
  return true;
}

/**
 * Splits a part into [opaque, translucent] by sampling its base-colour alpha at each
 * triangle's UV centroid. Translucent triangles are given `translucentMaterial`.
 */
async function splitByAlpha(part, translucentMaterial, threshold = 250) {
  const { data, info } = await sharp(part.material.getBaseColorTexture().getImage())
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const uv = part.attrs.TEXCOORD_0.data;
  const wrap = (v) => ((v % 1) + 1) % 1;
  const opaque = [];
  const translucent = [];
  for (let t = 0; t < part.indices.length / 3; t++) {
    let u = 0;
    let v = 0;
    for (let j = 0; j < 3; j++) {
      const i = part.indices[t * 3 + j];
      u += uv[i * 2] / 3;
      v += uv[i * 2 + 1] / 3;
    }
    const x = Math.min(info.width - 1, Math.floor(wrap(u) * info.width));
    const y = Math.min(info.height - 1, Math.floor(wrap(v) * info.height));
    (data[(y * info.width + x) * info.channels + 3] < threshold ? translucent : opaque).push(t);
  }
  const translucentPart = subset(part, translucent);
  translucentPart.material = translucentMaterial;
  return [subset(part, opaque), translucentPart];
}

// ---------------------------------------------------------------------------
// Models
// ---------------------------------------------------------------------------

/**
 * Marble gallery — the primary museum hall. Geometry stays at full detail
 * (≈2.3 M triangles, 99 % pillars; no simplification, same policy as the other models).
 * The main floor (where the pillars stand) becomes y = 0.
 */
async function buildMarbleGallery(doc) {
  const parts = extractParts(doc);
  const byParent = (...names) => parts.filter((p) => names.includes(p.parent));

  const all = bounds(parts);
  const sourceFloorY = bounds(byParent("Pillars")).min[1];
  for (const p of parts) transformPart(p, { t: [-all.center[0], -sourceFloorY, -all.center[2]] });

  // Every material was authored as alpha BLEND, but only the Room's skylight glass uses alpha.
  const materials = Object.fromEntries(doc.getRoot().listMaterials().map((m) => [m.getName(), m]));
  const droppedEmissive = [];
  for (const material of Object.values(materials)) {
    material.setAlphaMode("OPAQUE");
    if (await dropBlackEmissive(material)) droppedEmissive.push(material.getName());
  }
  const glassMaterial = materials.Room.clone().setName("RoomGlass").setAlphaMode("BLEND");
  const [roomOpaque, roomGlass] = await splitByAlpha(merge(byParent("Room"), "Room"), glassMaterial);

  const groups = {
    Doorways: byParent("Plane", "Plane.001", "Plane.002", "Plane.003"), // arched doorways in the ±Z walls
    InnerRing: byParent("Circle.001", "Circle.002", "Circle.003", "Circle.004"), // four curved segments around the centre
    Sculpture: byParent("Plane.004"), // central sculpture on its plinth
  };
  const pillarChunks = byParent("Pillars");
  const assigned = 1 + pillarChunks.length + Object.values(groups).flat().length;
  if (assigned !== parts.length) throw new Error(`Marble gallery: ${parts.length - assigned} unassigned parts`);

  const roomBounds = bounds([roomOpaque, roomGlass]);
  const root = newRoot(doc, "MarbleGallery");
  root.setExtras({ mainFloorY: 0, lowestFloorY: roomBounds.min[1], ceilingTopY: roomBounds.max[1] });

  meshNode(doc, group(doc, root, "Room"), "RoomMesh", [roomOpaque, roomGlass]);
  // Pillar chunks stay separate (spatially grouped) so off-screen ones can be frustum-culled.
  const pillars = group(doc, root, "Pillars");
  pillarChunks.forEach((p, i) => meshNode(doc, pillars, `PillarsMesh_${String(i + 1).padStart(2, "0")}`, [p]));
  for (const [name, members] of Object.entries(groups)) {
    meshNode(doc, group(doc, root, name), `${name}Mesh`, mergeByMaterial(members, `${name}Mesh`));
  }

  return {
    textureSize: 2048,
    info: {
      sourceFloorY,
      size: bounds(parts).size,
      lowestFloorY: roomBounds.min[1],
      glassTriangles: roomGlass.indices.length / 3,
      droppedEmissive,
    },
  };
}

async function buildGallery(doc) {
  const parts = extractParts(doc);
  groundAndCentre(parts);
  const root = newRoot(doc, "Gallery");
  meshNode(doc, root, "GalleryMesh", mergeByMaterial(parts, "GalleryMesh"));
  return { textureSize: 4096 };
}

async function buildTable(doc) {
  const parts = extractParts(doc);
  for (const p of parts) transformPart(p, { s: CM });
  const b = groundAndCentre(parts);
  const root = newRoot(doc, "Table");
  meshNode(doc, root, "TableMesh", mergeByMaterial(parts, "TableMesh"));
  // Where the turntable sits.
  group(doc, root, "TopAnchor", [0, b.max[1], 0]);
  return { info: { topY: b.max[1], size: b.size } };
}

async function buildVinyl(doc) {
  const parts = extractParts(doc);
  const find = (mat) => parts.filter((p) => p.material?.getName() === mat);
  const sleeve = merge(find("Album_tx"), "Sleeve");
  const sideA = merge(find("Vinyl1"), "SideA"); // "Side one" texture + rim + hole wall
  const sideB = merge(find("Vinyl2"), "SideB");

  // --- Record: lay flat (side A up), centre, scale to a 12" LP -------------
  const areaNormal = (part) => {
    let s = [0, 0, 0];
    let ref = null;
    for (let t = 0; t < part.indices.length; t += 3) {
      const [a, b, c] = [0, 1, 2].map((j) => getPos(part, part.indices[t + j]));
      const n = cross(sub(b, a), sub(c, a));
      ref ??= n;
      const sign = dot(n, ref) >= 0 ? 1 : -1;
      s = s.map((v, i) => v + sign * n[i]);
    }
    return normalize(s);
  };
  let normalA = areaNormal(sideB).map((v) => -v); // side B is a pure face; side A faces the other way
  const R = rotationBetween(normalA, [0, 1, 0]);
  for (const p of [sideA, sideB]) transformPart(p, { R });
  let b = bounds([sideA, sideB]);
  const s = RECORD_DIAMETER / Math.max(b.size[0], b.size[2]);
  for (const p of [sideA, sideB]) transformPart(p, { s, t: [-s * b.center[0], -s * b.min[1], -s * b.center[2]] });
  b = bounds([sideA, sideB]);
  const thickness = b.size[1];

  // Fit the planar UV mapping of each face so the printed label can be erased.
  async function eraseLabel(part, up) {
    const rows = [];
    const uv = part.attrs.TEXCOORD_0.data;
    const normals = part.attrs.NORMAL.data;
    for (let i = 0; i < vertexCount(part); i++) {
      const p = getPos(part, i);
      // Face vertices only (skip rim and spindle-hole walls, which use other UV islands).
      if (normals[i * 3 + 1] * up > 0.9) rows.push([p[0], p[2], uv[i * 2], uv[i * 2 + 1]]);
    }
    // Least squares uv = A * [x, z, 1]
    const fit = (k) => {
      const M = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
      const y = [0, 0, 0];
      for (const r of rows) {
        const x = [r[0], r[1], 1];
        for (let i = 0; i < 3; i++) {
          y[i] += x[i] * r[k];
          for (let j = 0; j < 3; j++) M[i][j] += x[i] * x[j];
        }
      }
      // Solve 3x3 (Cramer)
      const det3 = (m) => m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
      const d = det3(M);
      return [0, 1, 2].map((c) => det3(M.map((row, i) => row.map((v, j) => (j === c ? y[i] : v)))) / d);
    };
    const fu = fit(2);
    const fv = fit(3);
    const toUV = (x, z) => [fu[0] * x + fu[1] * z + fu[2], fv[0] * x + fv[1] * z + fv[2]];
    const residual = Math.sqrt(rows.reduce((s, r) => s + (toUV(r[0], r[1])[0] - r[2]) ** 2 + (toUV(r[0], r[1])[1] - r[3]) ** 2, 0) / rows.length);
    if (residual > 0.005) throw new Error(`${part.name}: face UVs are not planar (rms ${residual})`);
    const centerUV = toUV(0, 0);
    const scaleUV = Math.hypot(fu[0], fv[0]); // UV units per metre
    const samples = Array.from({ length: 16 }, (_, i) => {
      const a = (i / 16) * Math.PI * 2;
      return toUV(Math.cos(a) * 0.0735, Math.sin(a) * 0.0735);
    });
    await paintCircle(part.material, centerUV, 0.0715 * scaleUV, samples);
    return toUV;
  }
  const sideAUV = await eraseLabel(sideA, 1);
  await eraseLabel(sideB, -1);
  sideA.material.setName("VinylSideA");
  sideB.material.setName("VinylSideB");

  // Label: separate annulus on both faces, planar UVs (a square image maps onto the circle).
  let holeRadius = Infinity;
  for (let i = 0; i < vertexCount(sideB); i++) {
    const p = getPos(sideB, i);
    holeRadius = Math.min(holeRadius, Math.hypot(p[0], p[2]));
  }
  const labelMaterial = doc
    .createMaterial("Label")
    .setRoughnessFactor(0.85)
    .setMetallicFactor(0)
    .setBaseColorTexture(
      await placeholderTexture(doc, "LabelPlaceholder", `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512">
        <rect width="512" height="512" fill="#e9e2d0"/>
        <circle cx="256" cy="256" r="236" fill="none" stroke="#cfc6b0" stroke-width="4"/>
        <circle cx="256" cy="256" r="150" fill="none" stroke="#d8d0bb" stroke-width="2"/></svg>`),
    );
  const label = annulus({ inner: holeRadius, outer: LABEL_RADIUS, top: thickness + 0.0002, bottom: -0.0002, material: labelMaterial });

  // --- Sleeve: stand upright, front cover facing +Z, scaled to 12" ---------
  const frontTris = [];
  const uvS = sleeve.attrs.TEXCOORD_0.data;
  for (let t = 0; t < sleeve.indices.length / 3; t++) {
    const ids = [0, 1, 2].map((j) => sleeve.indices[t * 3 + j]);
    if (ids.every((i) => uvS[i * 2] < 0.5 && uvS[i * 2 + 1] < 0.5)) frontTris.push(ids);
  }
  if (frontTris.length !== 2) throw new Error(`Sleeve front face not found (${frontTris.length} tris)`);
  const [i0, i1, i2] = frontTris[0];
  const [p0, p1, p2] = [i0, i1, i2].map((i) => getPos(sleeve, i));
  const [w0, w1, w2] = [i0, i1, i2].map((i) => [uvS[i * 2], uvS[i * 2 + 1]]);
  const e1 = sub(p1, p0);
  const e2 = sub(p2, p0);
  const du1 = w1[0] - w0[0], dv1 = w1[1] - w0[1], du2 = w2[0] - w0[0], dv2 = w2[1] - w0[1];
  const r = 1 / (du1 * dv2 - du2 * dv1);
  const dPdu = e1.map((v, k) => (v * dv2 - e2[k] * dv1) * r); // image right
  const dPdv = e1.map((v, k) => (e2[k] * du1 - v * du2) * r); // image down
  const zAxis = normalize(cross(dPdu, dPdv.map((v) => -v))); // right × up = out of the cover
  const xAxis = normalize(sub(dPdu, zAxis.map((v) => v * dot(dPdu, zAxis))));
  const yAxis = cross(zAxis, xAxis);
  transformPart(sleeve, { R: basis(xAxis, yAxis, zAxis) });
  let sb = bounds(sleeve);
  const ss = SLEEVE_WIDTH / sb.size[0];
  transformPart(sleeve, { s: ss, t: [-ss * sb.center[0], -ss * sb.min[1], -ss * sb.center[2]] });
  sb = bounds(sleeve);

  const sleeveFront = doc.createMaterial("SleeveFront").setRoughnessFactor(0.8).setMetallicFactor(0);
  const sleeveBack = doc.createMaterial("SleeveBack").setRoughnessFactor(0.8).setMetallicFactor(0);
  const sleeveEdge = doc.createMaterial("SleeveEdge").setRoughnessFactor(0.9).setMetallicFactor(0).setBaseColorFactor([0.62, 0.6, 0.55, 1]);
  const boardSvg = (mark) => `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512">
    <rect width="512" height="512" fill="#d9d4c7"/>
    <rect x="24" y="24" width="464" height="464" fill="none" stroke="#c4bdab" stroke-width="3"/>
    <text x="256" y="276" font-family="sans-serif" font-size="56" text-anchor="middle" fill="#bdb5a1">${mark}</text></svg>`;
  sleeveFront.setBaseColorTexture(await placeholderTexture(doc, "SleeveFrontPlaceholder", boardSvg("FRONT")));
  sleeveBack.setBaseColorTexture(await placeholderTexture(doc, "SleeveBackPlaceholder", boardSvg("BACK")));

  // Rebuild the 12 sleeve triangles with clean per-face UVs and materials.
  // Faces are classified by position and re-wound to face outwards, since the
  // new materials are single-sided (the source material was double-sided).
  const sleeveCentre = [0, sb.size[1] / 2, 0];
  const faces = { front: [], back: [], edge: [] };
  for (let t = 0; t < sleeve.indices.length / 3; t++) {
    let pts = [0, 1, 2].map((j) => getPos(sleeve, sleeve.indices[t * 3 + j]));
    let n = normalize(cross(sub(pts[1], pts[0]), sub(pts[2], pts[0])));
    const centroid = [0, 1, 2].map((a) => (pts[0][a] + pts[1][a] + pts[2][a]) / 3);
    if (dot(n, sub(centroid, sleeveCentre)) < 0) {
      pts = [pts[0], pts[2], pts[1]];
      n = n.map((v) => -v);
    }
    const kind = n[2] > 0.9 ? "front" : n[2] < -0.9 ? "back" : "edge";
    faces[kind].push({ pts, n });
  }
  if (faces.front.length !== 2 || faces.back.length !== 2) throw new Error("Unexpected sleeve topology");
  const faceUV = {
    front: (p) => [(p[0] - sb.min[0]) / sb.size[0], (sb.max[1] - p[1]) / sb.size[1]],
    back: (p) => [(sb.max[0] - p[0]) / sb.size[0], (sb.max[1] - p[1]) / sb.size[1]],
    edge: () => [0, 0],
  };
  const sleeveParts = Object.entries({ front: sleeveFront, back: sleeveBack, edge: sleeveEdge }).map(([kind, material]) =>
    soup(faces[kind], material, faceUV[kind]),
  );

  // --- Hierarchy ------------------------------------------------------------
  const root = newRoot(doc, "Vinyl");
  const record = group(doc, root, "Record", [0, 0, 0], {
    diameter: RECORD_DIAMETER,
    thickness,
    labelRadius: LABEL_RADIUS,
    holeRadius,
  });
  meshNode(doc, record, "RecordMesh", [sideA, sideB]);
  meshNode(doc, record, "LabelMesh", [label]);
  const sleeveExtras = { width: sb.size[0], height: sb.size[1], thickness: sb.size[2] };
  const sleeveNode = group(doc, root, "Sleeve", [0, 0, -0.2], sleeveExtras);
  meshNode(doc, sleeveNode, "SleeveMesh", sleeveParts);

  // --- LOD tiers: proxy discs with the real Side-A / Label materials --------
  const recordExtras = { diameter: RECORD_DIAMETER, thickness, labelRadius: LABEL_RADIUS, holeRadius };
  for (const [quality, { segments, labelSegments }] of Object.entries(VINYL_LOD)) {
    const name = (base) => lodNodeName(base, quality);
    const tierRecord = group(doc, root, name("Record"), [0, 0, 0], recordExtras);
    const disc = recordDisc({ radius: RECORD_DIAMETER / 2, inner: holeRadius, thickness, segments, material: sideA.material, uvOf: sideAUV });
    meshNode(doc, tierRecord, name("RecordMesh"), [disc]);
    const tierLabel = annulus({ inner: holeRadius, outer: LABEL_RADIUS, top: thickness + 0.0002, bottom: 0, material: labelMaterial, segments: labelSegments, faces: ["top"] });
    meshNode(doc, tierRecord, name("LabelMesh"), [tierLabel]);
  }
  // DISTANT sleeve: the same 12 triangles in ONE draw call (front-cover material everywhere;
  // the edges sample a corner of the cover).
  const distantSleeve = soup([...faces.front, ...faces.back, ...faces.edge], sleeveFront, (p) => {
    const onFront = Math.abs(p[2] - sb.max[2]) < 1e-6;
    const onBack = Math.abs(p[2] - sb.min[2]) < 1e-6;
    return onFront ? faceUV.front(p) : onBack ? faceUV.back(p) : [0.02, 0.02];
  });
  const sleeveDistantNode = group(doc, root, lodNodeName("Sleeve", "distant"), [0, 0, -0.2], sleeveExtras);
  meshNode(doc, sleeveDistantNode, lodNodeName("SleeveMesh", "distant"), [distantSleeve]);

  return { info: { thickness, holeRadius, sleeve: sb.size } };
}

/**
 * Record proxy for LOD tiers: top face (annulus) + outer rim, one material. Top and rim
 * sample the Side-A texture through its fitted planar mapping `uvOf(x, z)`.
 */
function recordDisc({ radius, inner, thickness, segments, material, uvOf }) {
  const P = [];
  const N = [];
  const UV = [];
  const I = [];
  for (let i = 0; i <= segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    const c = Math.cos(a);
    const s = Math.sin(a);
    // Top face: inner and outer ring vertex.
    for (const r of [inner, radius]) {
      P.push(c * r, thickness, s * r);
      N.push(0, 1, 0);
      UV.push(...uvOf(c * r, s * r));
    }
    // Rim: top and bottom vertex, radial normal, sampling the record's outer edge.
    for (const y of [thickness, 0]) {
      P.push(c * radius, y, s * radius);
      N.push(c, 0, s);
      UV.push(...uvOf(c * radius * 0.995, s * radius * 0.995));
    }
  }
  for (let i = 0; i < segments; i++) {
    const a = i * 4;
    const b = a + 4;
    I.push(a, b, a + 1, a + 1, b, b + 1); // top (counter-clockwise seen from above)
    I.push(a + 2, b + 2, b + 3, a + 2, b + 3, a + 3); // rim (outward)
  }
  return {
    name: "RecordProxy",
    material,
    attrs: {
      POSITION: { size: 3, data: new Float32Array(P) },
      NORMAL: { size: 3, data: new Float32Array(N) },
      TEXCOORD_0: { size: 2, data: new Float32Array(UV) },
    },
    indices: new Uint32Array(I),
  };
}

/** Flat annulus on both faces of a disc with planar UVs over the outer radius. */
function annulus({ inner, outer, top, bottom, material, segments = 96, faces = ["top", "bottom"] }) {
  const P = [];
  const N = [];
  const UV = [];
  const I = [];
  const levels = [[top, 1, "top"], [bottom, -1, "bottom"]].filter(([, , face]) => faces.includes(face));
  for (const [y, up] of levels) {
    const base = P.length / 3;
    for (let i = 0; i <= segments; i++) {
      const a = (i / segments) * Math.PI * 2;
      for (const r of [inner, outer]) {
        const x = Math.cos(a) * r;
        const z = Math.sin(a) * r;
        P.push(x, y, z);
        N.push(0, up, 0);
        // Seen from above: +x right, +z down. Seen from below the image is mirrored on x.
        UV.push(0.5 + (up * x) / (2 * outer), 0.5 + z / (2 * outer));
      }
    }
    for (let i = 0; i < segments; i++) {
      const a = base + i * 2;
      const quad = up > 0 ? [a, a + 2, a + 1, a + 1, a + 2, a + 3] : [a, a + 1, a + 2, a + 1, a + 3, a + 2];
      I.push(...quad);
    }
  }
  return {
    name: "Label",
    material,
    attrs: {
      POSITION: { size: 3, data: new Float32Array(P) },
      NORMAL: { size: 3, data: new Float32Array(N) },
      TEXCOORD_0: { size: 2, data: new Float32Array(UV) },
    },
    indices: new Uint32Array(I),
  };
}

/** Builds a part from loose triangles with a flat normal and UVs from a function. */
function soup(tris, material, uvOf) {
  const P = [];
  const N = [];
  const UV = [];
  for (const { pts, n } of tris) {
    for (const p of pts) {
      P.push(...p);
      N.push(...n);
      UV.push(...uvOf(p));
    }
  }
  return {
    name: material.getName(),
    material,
    attrs: {
      POSITION: { size: 3, data: new Float32Array(P) },
      NORMAL: { size: 3, data: new Float32Array(N) },
      TEXCOORD_0: { size: 2, data: new Float32Array(UV) },
    },
    indices: Uint32Array.from({ length: P.length / 3 }, (_, i) => i),
  };
}

/**
 * Turntable (Pioneer-style, S-shaped tonearm). The source is one flat list of
 * material-merged meshes, so parts are classified by mesh + connected component
 * position. Coordinates below are in metres after baking (Y up, front = +Z).
 */
async function buildTurntable(doc, { recordThickness, recordDiameter }) {
  const parts = extractParts(doc);
  groundAndCentre(parts);

  const byName = (name) => parts.filter((p) => p.name === name);
  const platterBounds = bounds(byName("Object_17"));
  const platterCentre = [platterBounds.center[0], platterBounds.center[2]];
  const matTop = bounds(byName("Object_8")).max[1];
  // Tonearm base collar = the narrower ring in Object_11; its centre is the vertical pivot axis.
  const collar = components(merge(byName("Object_11"), "collar"))
    .map(bounds)
    .sort((a, b) => a.size[0] - b.size[0])[0];
  const tubeBounds = bounds(byName("Object_25"));
  const pivot = [collar.center[0], tubeBounds.center[1], collar.center[2]];

  const horizontalDistance = (b, c) => Math.hypot(b.center[0] - c[0], b.center[2] - c[1]);
  const inHeadshellZone = (b) =>
    b.center[0] > pivot[0] - 0.06 && b.center[0] < pivot[0] + 0.01 && b.center[2] > 0.07 && b.min[1] > matTop + 0.004;

  // Whole source meshes that belong to each moving assembly.
  const PLATTER = new Set(["Object_6", "Object_8", "Object_17"]);
  const TONEARM = new Set([
    "Object_2", "Object_3", "Object_4", "Object_5", // cartridge wires
    "Object_14", "Object_15", // gimbal housing
    "Object_19", "Object_20", "Object_21", // headshell screws, counterweight
    "Object_23", "Object_25", "Object_26", // headshell, arm tube, collar
  ]);
  // Mixed meshes: decide per connected component.
  const MIXED = new Set(["Object_22", "Object_34", "Object_36", "Object_37"]);

  const assemblies = { body: [], platter: [], tonearm: [] };
  for (const part of parts) {
    if (PLATTER.has(part.name)) assemblies.platter.push(part);
    else if (TONEARM.has(part.name)) assemblies.tonearm.push(part);
    else if (MIXED.has(part.name)) {
      for (const comp of components(part)) {
        const b = bounds(comp);
        if (part.name === "Object_22" && horizontalDistance(b, platterCentre) < 0.006) assemblies.platter.push(comp); // spindle
        else if (part.name === "Object_22" && horizontalDistance(b, [pivot[0], pivot[2]]) < 0.03 && b.min[1] > pivot[1] - 0.008)
          assemblies.tonearm.push(comp); // gimbal screws + cap
        else if (inHeadshellZone(b)) assemblies.tonearm.push(comp); // cartridge, stylus, clips
        else assemblies.body.push(comp);
      }
    } else assemblies.body.push(part);
  }

  // Stylus tip = lowest tonearm vertex in the headshell zone.
  let tip = null;
  for (const part of assemblies.tonearm) {
    for (let i = 0; i < vertexCount(part); i++) {
      const p = getPos(part, i);
      if (p[2] > 0.07 && (!tip || p[1] < tip[1])) tip = p;
    }
  }

  // Re-express each assembly relative to its pivot.
  const platterOrigin = [platterCentre[0], matTop, platterCentre[1]];
  for (const p of assemblies.platter) transformPart(p, { t: platterOrigin.map((v) => -v) });
  for (const p of assemblies.tonearm) transformPart(p, { t: pivot.map((v) => -v) });
  const tipLocal = sub(tip, pivot);

  // Tonearm angles (radians). Swing = rotation.y of TonearmSwing; lift = rotation.x of TonearmLift.
  const spindleLocal = [platterCentre[0] - pivot[0], platterCentre[1] - pivot[2]];
  const tipRadiusAt = (theta) => {
    const x = tipLocal[0] * Math.cos(theta) + tipLocal[2] * Math.sin(theta);
    const z = -tipLocal[0] * Math.sin(theta) + tipLocal[2] * Math.cos(theta);
    return Math.hypot(x - spindleLocal[0], z - spindleLocal[1]);
  };
  const direction = tipRadiusAt(0.01) < tipRadiusAt(0) ? 1 : -1;
  const swingTo = (radius) => {
    for (let theta = 0; Math.abs(theta) < Math.PI / 2; theta += direction * 0.0002) {
      if (tipRadiusAt(theta) <= radius) return +theta.toFixed(4);
    }
    throw new Error(`Tonearm cannot reach radius ${radius}`);
  };
  const recordTop = matTop + recordThickness - pivot[1];
  const liftFor = (targetY) => {
    // For rotation.x = phi: y' = y cos(phi) - z sin(phi) = r sin(alpha - phi), alpha = atan2(y, z)
    const { 1: y, 2: z } = tipLocal;
    const rr = Math.hypot(y, z);
    return +(Math.atan2(y, z) - Math.asin(targetY / rr)).toFixed(4);
  };
  const tonearmExtras = {
    restSwing: 0,
    leadInSwing: swingTo(recordDiameter / 2 - 0.005),
    runOutSwing: swingTo(0.06),
    playLift: liftFor(recordTop),
    raisedLift: liftFor(recordTop + 0.012),
    restLift: 0,
  };

  // --- Hierarchy ------------------------------------------------------------
  const root = newRoot(doc, "Turntable");
  const body = group(doc, root, "Body");
  meshNode(doc, body, "BodyMesh", mergeByMaterial(assemblies.body, "BodyMesh"));

  const platter = group(doc, root, "Platter", platterOrigin, { rpm33: 100 / 3, rpm45: 45, matRadius: bounds(byName("Object_8")).size[0] / 2 });
  meshNode(doc, platter, "PlatterMesh", mergeByMaterial(assemblies.platter, "PlatterMesh"));
  group(doc, platter, "RecordAnchor");

  const swing = group(doc, root, "TonearmSwing", pivot, tonearmExtras);
  const lift = group(doc, swing, "TonearmLift");
  meshNode(doc, lift, "TonearmMesh", mergeByMaterial(assemblies.tonearm, "TonearmMesh"));
  group(doc, lift, "StylusTip", tipLocal);

  // --- LOD tiers: same pivots and frame, simplified geometry ----------------
  const lodTriangles = {};
  for (const [quality, settings] of Object.entries(TURNTABLE_LOD)) {
    const name = (base) => lodNodeName(base, quality);
    const reduce = (parts, meshName) =>
      mergeByMaterial(parts, meshName)
        .filter((p) => !settings.dropMaterials.includes(p.material.getName()))
        .map((p) => simplifyPart(weldPart(p), settings))
        .filter((p) => p.indices.length > 0);
    const tierRoot = addRoot(doc, name("Turntable"));
    const meshes = {
      body: reduce(assemblies.body, name("BodyMesh")),
      platter: reduce(assemblies.platter, name("PlatterMesh")),
      tonearm: reduce(assemblies.tonearm, name("TonearmMesh")),
    };
    meshNode(doc, group(doc, tierRoot, name("Body")), name("BodyMesh"), meshes.body);
    const tierPlatter = group(doc, tierRoot, name("Platter"), platterOrigin, platter.getExtras());
    meshNode(doc, tierPlatter, name("PlatterMesh"), meshes.platter);
    group(doc, tierPlatter, name("RecordAnchor"));
    const tierSwing = group(doc, tierRoot, name("TonearmSwing"), pivot, tonearmExtras);
    const tierLift = group(doc, tierSwing, name("TonearmLift"));
    meshNode(doc, tierLift, name("TonearmMesh"), meshes.tonearm);
    group(doc, tierLift, name("StylusTip"), tipLocal);
    lodTriangles[quality] = Object.fromEntries(
      Object.entries(meshes).map(([k, parts]) => [k, parts.reduce((n, part) => n + part.indices.length / 3, 0)]),
    );
  }

  return {
    info: { platterOrigin, pivot, tip, tonearmExtras, lodTriangles, counts: Object.fromEntries(Object.entries(assemblies).map(([k, v]) => [k, v.length])) },
  };
}

// ---------------------------------------------------------------------------
// Pipeline
// ---------------------------------------------------------------------------

/** `textureSize` caps every texture; omit it when textures were already sized (station profiles). */
async function compress(doc, textureSize) {
  await doc.transform(
    dedup(),
    weld(),
    // No simplify(): even at error 1e-4 it visibly facets the turntable's brushed-metal shading.
    prune({ keepLeaves: true, keepSolidTextures: true }),
    textureCompress({ encoder: sharp, targetFormat: "webp", ...(textureSize && { resize: [textureSize, textureSize] }) }),
    meshopt({ encoder: MeshoptEncoder, level: "high" }),
  );
}

const mb = (path) => (statSync(path).size / 1024 / 1024).toFixed(2);

/** "<material>.<slot>" for every material slot (incl. extension slots) using a texture. */
function textureSlots(doc, texture) {
  const slots = [];
  for (const edge of doc.getGraph().listParentEdges(texture)) {
    const parent = edge.getParent();
    if (parent.propertyType === "Root") continue;
    const material =
      parent.propertyType === "Material" ? parent : doc.getRoot().listMaterials().find((m) => m.listExtensions().includes(parent));
    slots.push(`${material?.getName() ?? "?"}.${edge.getName()}`);
  }
  return [...new Set(slots)];
}

/** Scales each texture down to its profile size (lanczos3, lossless PNG until the WebP step). */
async function resizeStationTextures(doc, model, variant) {
  const log = [];
  for (const texture of doc.getRoot().listTextures()) {
    const slots = textureSlots(doc, texture);
    const target = stationTextureSize(model, slots, variant);
    const [width, height] = texture.getSize();
    const scale = Math.min(1, target / Math.max(width, height));
    const size = [Math.round(width * scale), Math.round(height * scale)];
    if (scale < 1) {
      const image = await sharp(texture.getImage()).resize(size[0], size[1], { fit: "fill", kernel: "lanczos3" }).png().toBuffer();
      texture.setImage(image).setMimeType("image/png");
    }
    log.push(`  ${`${width}→${size[0]}`.padEnd(10)} ${slots.join(", ")}`);
  }
  return log;
}

/** Station model: built once, then written once per texture profile (`<outBase>-<profile>.glb`). */
async function runStation(src, outBase, model, build, options) {
  const doc = await io.read(src);
  const { info } = await build(doc, options);
  // Drop what the rebuild left unused (e.g. the vinyl's original sleeve material), so every
  // remaining texture has a rule in textureProfiles.ts. keepAttributes: removing unused vertex
  // attributes before weld() would change the welded geometry (compress() prunes them later).
  await doc.transform(prune({ keepLeaves: true, keepSolidTextures: true, keepAttributes: true }));
  for (const variant of variants) {
    const variantDoc = cloneDocument(doc);
    const log = await resizeStationTextures(variantDoc, model, variant);
    await compress(variantDoc);
    const out = `${outBase}-${variant}.glb`;
    mkdirSync(dirname(out), { recursive: true });
    await io.write(out, variantDoc);
    console.log(`${src} (${mb(src)} MB) -> ${out} (${mb(out)} MB)`);
    console.log(log.join("\n"));
  }
  if (info) console.log(JSON.stringify(info, (_, v) => (typeof v === "number" ? +v.toFixed(4) : v)));
  return info;
}

async function run(src, out, build, options) {
  const doc = await io.read(src);
  const { textureSize, info } = await build(doc, options);
  await compress(doc, textureSize);
  mkdirSync(dirname(out), { recursive: true });
  await io.write(out, doc);
  console.log(`${src} (${mb(src)} MB) -> ${out} (${mb(out)} MB)`);
  if (info) console.log(JSON.stringify(info, (_, v) => (typeof v === "number" ? +v.toFixed(4) : v)));
  return info;
}

// Builds every model, or only the ones named: `npm run models -- marble turntable`
const args = process.argv.slice(2);
const only = new Set(args.filter((a) => !a.startsWith("--")));
const profilesArg = args.find((a) => a.startsWith("--profiles="));
const variants = profilesArg ? profilesArg.slice("--profiles=".length).split(",") : [...TEXTURE_PROFILES];
for (const v of variants) if (!isStationModelVariant(v)) throw new Error(`Unknown texture profile "${v}"`);
const wanted = (key) => only.size === 0 || only.has(key);

if (wanted("gallery")) await run("gallery.glb", "public/models/gallery/gallery.glb", buildGallery);
if (wanted("marble")) await run("marble-gallery.glb", "public/models/gallery/marble-gallery.glb", buildMarbleGallery);
if (wanted("table")) await runStation("table.glb", "public/models/furniture/table", "table", buildTable);
if (wanted("vinyl") || wanted("turntable")) {
  // The turntable's needle angles depend on the record thickness measured from the vinyl.
  const vinyl = await runStation("vinyl.glb", "public/models/vinyl/vinyl", "vinyl", buildVinyl);
  if (wanted("turntable")) {
    await runStation("turntable.glb", "public/models/turntable/turntable", "turntable", buildTurntable, {
      recordThickness: vinyl.thickness,
      recordDiameter: RECORD_DIAMETER,
    });
  }
}
