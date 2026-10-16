// Geometry helpers for station LOD tiers (see docs/STATION_LOD.md), shared by
// scripts/build-models.mjs and scripts/audit-turntable-geometry.mjs.
//
// A "part" is the build script's triangle soup:
//   { name, material, attrs: { POSITION: { size: 3, data: Float32Array }, ... }, indices: Uint32Array }
// with positions in the model's own frame (metres, Y up, front = +Z).

import { MeshoptSimplifier } from "meshoptimizer";

await MeshoptSimplifier.ready;

const triangleCount = (part) => part.indices.length / 3;

// ---------------------------------------------------------------------------
// Connected components (vertices welded by position), per triangle
// ---------------------------------------------------------------------------

/** Labels every triangle with its connected component: { labels: Int32Array, count }. */
export function componentLabels(part) {
  const position = part.attrs.POSITION.data;
  const n = position.length / 3;
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
    const key = `${Math.round(position[i * 3] * 1e5)},${Math.round(position[i * 3 + 1] * 1e5)},${Math.round(position[i * 3 + 2] * 1e5)}`;
    const other = byKey.get(key);
    if (other === undefined) byKey.set(key, i);
    else union(i, other);
  }
  const idx = part.indices;
  for (let t = 0; t < idx.length; t += 3) {
    union(idx[t], idx[t + 1]);
    union(idx[t], idx[t + 2]);
  }
  const ids = new Map();
  const labels = new Int32Array(idx.length / 3);
  for (let t = 0; t < labels.length; t++) {
    const root = find(idx[t * 3]);
    if (!ids.has(root)) ids.set(root, ids.size);
    labels[t] = ids.get(root);
  }
  return { labels, count: ids.size };
}

/** Bounds and triangle count of each component. */
export function componentStats(part, { labels, count }) {
  const position = part.attrs.POSITION.data;
  const stats = Array.from({ length: count }, (_, id) => ({
    id,
    triangles: 0,
    min: [Infinity, Infinity, Infinity],
    max: [-Infinity, -Infinity, -Infinity],
  }));
  for (let t = 0; t < labels.length; t++) {
    const s = stats[labels[t]];
    s.triangles++;
    for (let j = 0; j < 3; j++) {
      const v = part.indices[t * 3 + j] * 3;
      for (let a = 0; a < 3; a++) {
        s.min[a] = Math.min(s.min[a], position[v + a]);
        s.max[a] = Math.max(s.max[a], position[v + a]);
      }
    }
  }
  for (const s of stats) {
    s.size = s.min.map((v, a) => s.max[a] - v);
    s.extent = Math.max(...s.size);
    s.center = s.min.map((v, a) => (v + s.max[a]) / 2);
  }
  return stats;
}

// ---------------------------------------------------------------------------
// Visibility: software z-buffer of triangle IDs from many directions
// ---------------------------------------------------------------------------

/**
 * Exhibition view directions (unit vectors from the model toward the camera): every
 * azimuth, elevations from just above the table top (the route eye is ≈0.1 m above the
 * deck, seen from ≈6 m: ≈1–2°) up to steeply from above. Never from below the table top.
 */
export function exhibitionViews({ azimuthStepDeg = 15, elevationsDeg = [2, 10, 25, 40, 60, 80] } = {}) {
  const views = [];
  for (const e of elevationsDeg) {
    for (let a = 0; a < 360; a += azimuthStepDeg) {
      const el = (e * Math.PI) / 180;
      const az = (a * Math.PI) / 180;
      views.push([Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az)]);
    }
  }
  return views;
}

/**
 * Renders all parts together (orthographic, `resolution`² pixels fitted to the model) from
 * every view and returns, per part, a Uint8Array flag per triangle: 1 = won at least one
 * pixel in some view. Single-sided materials are back-face culled, like the renderer.
 * Sub-pixel triangles may be missed, so use it per component (any visible triangle).
 */
export function visibleTriangles(parts, views, resolution = 1024) {
  const offsets = [];
  let total = 0;
  for (const part of parts) {
    offsets.push(total);
    total += triangleCount(part);
  }
  const visible = new Uint8Array(total);
  const depth = new Float32Array(resolution * resolution);
  const ids = new Int32Array(resolution * resolution);
  const projected = parts.map((p) => new Float32Array(p.attrs.POSITION.data.length));

  for (const d of views) {
    // Right-handed view basis (r, u, d), looking along −d.
    const helper = Math.abs(d[1]) > 0.99 ? [1, 0, 0] : [0, 1, 0];
    let r = [helper[1] * d[2] - helper[2] * d[1], helper[2] * d[0] - helper[0] * d[2], helper[0] * d[1] - helper[1] * d[0]];
    const rl = Math.hypot(...r);
    r = r.map((v) => v / rl);
    const u = [d[1] * r[2] - d[2] * r[1], d[2] * r[0] - d[0] * r[2], d[0] * r[1] - d[1] * r[0]];

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    parts.forEach((part, k) => {
      const p = part.attrs.POSITION.data;
      const out = projected[k];
      for (let i = 0; i < p.length; i += 3) {
        const x = p[i] * r[0] + p[i + 1] * r[1] + p[i + 2] * r[2];
        const y = p[i] * u[0] + p[i + 1] * u[1] + p[i + 2] * u[2];
        out[i] = x;
        out[i + 1] = y;
        out[i + 2] = p[i] * d[0] + p[i + 1] * d[1] + p[i + 2] * d[2];
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    });
    const scale = (resolution - 2) / Math.max(maxX - minX, maxY - minY);
    depth.fill(-Infinity);
    ids.fill(-1);

    parts.forEach((part, k) => {
      const q = projected[k];
      const idx = part.indices;
      const cull = part.material ? !part.material.getDoubleSided() : false;
      for (let t = 0; t < idx.length; t += 3) {
        const a = idx[t] * 3, b = idx[t + 1] * 3, c = idx[t + 2] * 3;
        const ax = (q[a] - minX) * scale + 1, ay = (q[a + 1] - minY) * scale + 1;
        const bx = (q[b] - minX) * scale + 1, by = (q[b + 1] - minY) * scale + 1;
        const cx = (q[c] - minX) * scale + 1, cy = (q[c + 1] - minY) * scale + 1;
        const area = (bx - ax) * (cy - ay) - (cx - ax) * (by - ay);
        if (area === 0 || (cull && area < 0)) continue;
        const x0 = Math.max(0, Math.ceil(Math.min(ax, bx, cx) - 0.5));
        const x1 = Math.min(resolution - 1, Math.floor(Math.max(ax, bx, cx) - 0.5));
        const y0 = Math.max(0, Math.ceil(Math.min(ay, by, cy) - 0.5));
        const y1 = Math.min(resolution - 1, Math.floor(Math.max(ay, by, cy) - 0.5));
        const id = offsets[k] + t / 3;
        for (let y = y0; y <= y1; y++) {
          const py = y + 0.5;
          for (let x = x0; x <= x1; x++) {
            const px = x + 0.5;
            const w0 = ((bx - px) * (cy - py) - (cx - px) * (by - py)) / area;
            const w1 = ((cx - px) * (ay - py) - (ax - px) * (cy - py)) / area;
            const w2 = 1 - w0 - w1;
            if (w0 < 0 || w1 < 0 || w2 < 0) continue;
            const z = w0 * q[a + 2] + w1 * q[b + 2] + w2 * q[c + 2];
            const o = y * resolution + x;
            if (z > depth[o]) {
              depth[o] = z;
              ids[o] = id;
            }
          }
        }
      }
    });
    for (let o = 0; o < ids.length; o++) if (ids[o] >= 0) visible[ids[o]] = 1;
  }
  return parts.map((part, k) => visible.subarray(offsets[k], offsets[k] + triangleCount(part)));
}

// ---------------------------------------------------------------------------
// Reduction
// ---------------------------------------------------------------------------

/** New part with only the triangles for which keep(t) is true (vertices compacted). */
export function filterTriangles(part, keep) {
  const tris = [];
  for (let t = 0; t < triangleCount(part); t++) if (keep(t)) tris.push(t);
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
  return { ...part, attrs, indices };
}

/**
 * Merges vertices whose attributes are all bit-identical (like gltf-transform's weld), so
 * the simplifier sees connected surfaces instead of separate source pieces.
 */
export function weldPart(part) {
  const semantics = Object.keys(part.attrs).sort();
  const count = part.attrs.POSITION.data.length / 3;
  const remap = new Uint32Array(count);
  const firstOf = new Map();
  const unique = [];
  for (let i = 0; i < count; i++) {
    const key = semantics
      .map((s) => {
        const { size, data } = part.attrs[s];
        return Array.from(data.subarray(i * size, i * size + size)).join(",");
      })
      .join("|");
    let target = firstOf.get(key);
    if (target === undefined) {
      target = unique.length;
      firstOf.set(key, target);
      unique.push(i);
    }
    remap[i] = target;
  }
  const attrs = {};
  for (const s of semantics) {
    const { size, data } = part.attrs[s];
    const out = new Float32Array(unique.length * size);
    unique.forEach((from, to) => out.set(data.subarray(from * size, from * size + size), to * size));
    attrs[s] = { size, data: out };
  }
  return { ...part, attrs, indices: part.indices.map((v) => remap[v]) };
}

/**
 * meshoptimizer simplification with an absolute error bound (metres): the surface moves
 * at most ≈`error`. Attribute seams (UV / hard-normal splits) are preserved by the
 * simplifier unless `permissive` (lets it collapse across seams: fewer triangles, but UVs and
 * hard normals may smear — only for distant views). `prune` lets it delete small
 * disconnected pieces below the error.
 */
export function simplifyPart(part, { error, ratio = 0, prune = false, permissive = false }) {
  const target = Math.max(3, Math.floor((part.indices.length * ratio) / 3) * 3);
  const flags = ["ErrorAbsolute", ...(prune ? ["Prune"] : []), ...(permissive ? ["Permissive"] : [])];
  const [indices] = MeshoptSimplifier.simplify(part.indices, part.attrs.POSITION.data, 3, target, error, flags);
  const reduced = { ...part, indices };
  return filterTriangles(reduced, () => true);
}
