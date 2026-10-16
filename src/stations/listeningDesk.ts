/**
 * Listening-desk and album-stack geometry (docs/LISTENING_STATION_TABLE.md). Built once and shared by every
 * station and tier; only the five sleeve-art materials are per station (each shows its own record's artwork).
 *
 * DESK — two clones of the original table (the inverted wooden pyramid in its black frame, table.glb) under one
 * continuous slab, merged into ONE geometry that keeps the table's own material: the slab top samples the
 * atlas's wood panel (grain along the desk), its edges the black-metal frame strips. No stretching of the
 * authored table; the bases are only shortened by the slab thickness (3.8 %) so the surface stays at 0.635 m —
 * the turntable sits exactly where it always did.
 *
 * STACK (ALBUM_STACK in albumStack.ts):
 *   ACTIVE   one instanced draw for the sleeve bodies + one art plane per record (its sleeve artwork)
 *   NEARBY   one merged resting pile + the selected record's art on top (the station's shared sleeve material)
 *   DISTANT  one merged resting pile (bodies only)
 */
import * as THREE from "three";
import { ALBUM_STACK, LISTENING_DESK, restPose, type SleevePose } from "@/stations/albumStack";
import type { StationQuality } from "@/data/stationLod";

// ---------------------------------------------------------------------------
// Desk
// ---------------------------------------------------------------------------

/** Atlas regions of table.glb's End_Table texture (measured: docs/LISTENING_STATION_TABLE.md §2). */
const WOOD_UV = { u0: 0.035, v0: 0.54, u1: 0.43, v1: 0.935 };
const METAL_UV = { u0: 0.63, v0: 0.75, u1: 0.76, v1: 0.94 };

interface Parts {
  position: number[];
  normal: number[];
  uv: number[];
  index: number[];
}

/** Appends a (possibly quantised) geometry, transformed by `matrix`, as float data. */
function appendGeometry(parts: Parts, geometry: THREE.BufferGeometry, matrix: THREE.Matrix4) {
  const base = parts.position.length / 3;
  const pos = geometry.getAttribute("position");
  const nor = geometry.getAttribute("normal");
  const uv = geometry.getAttribute("uv");
  const normalMatrix = new THREE.Matrix3().getNormalMatrix(matrix);
  const p = new THREE.Vector3();
  const n = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i).applyMatrix4(matrix);
    parts.position.push(p.x, p.y, p.z);
    if (nor) n.fromBufferAttribute(nor, i).applyMatrix3(normalMatrix).normalize();
    else n.set(0, 1, 0);
    parts.normal.push(n.x, n.y, n.z);
    parts.uv.push(uv ? uv.getX(i) : 0, uv ? uv.getY(i) : 0);
  }
  const index = geometry.getIndex();
  if (index) for (let i = 0; i < index.count; i++) parts.index.push(base + index.getX(i));
  else for (let i = 0; i < pos.count; i++) parts.index.push(base + i);
}

/** One quad (4 vertices, 2 triangles) with explicit corners (counter-clockwise seen from `normal`). */
function appendQuad(parts: Parts, corners: THREE.Vector3[], normal: THREE.Vector3, uvs: [number, number][]) {
  const base = parts.position.length / 3;
  corners.forEach((c, i) => {
    parts.position.push(c.x, c.y, c.z);
    parts.normal.push(normal.x, normal.y, normal.z);
    parts.uv.push(uvs[i][0], uvs[i][1]);
  });
  parts.index.push(base, base + 1, base + 2, base, base + 2, base + 3);
}

/** The slab: wood top / underside (grain along X → atlas v), black-metal edge band. */
function appendSlab(parts: Parts) {
  const { xMin, xMax, zMin, zMax, thickness } = LISTENING_DESK.slab;
  const y1 = LISTENING_DESK.top;
  const y0 = y1 - thickness;
  const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  const wood = (x: number, z: number): [number, number] => [
    WOOD_UV.u0 + ((z - zMin) / (zMax - zMin)) * (WOOD_UV.u1 - WOOD_UV.u0),
    WOOD_UV.v0 + ((x - xMin) / (xMax - xMin)) * (WOOD_UV.v1 - WOOD_UV.v0),
  ];
  const metal: [number, number][] = [
    [METAL_UV.u0, METAL_UV.v0],
    [METAL_UV.u1, METAL_UV.v0],
    [METAL_UV.u1, METAL_UV.v1],
    [METAL_UV.u0, METAL_UV.v1],
  ];
  // Top (+Y) and underside (−Y).
  appendQuad(parts, [V(xMin, y1, zMax), V(xMax, y1, zMax), V(xMax, y1, zMin), V(xMin, y1, zMin)], V(0, 1, 0), [wood(xMin, zMax), wood(xMax, zMax), wood(xMax, zMin), wood(xMin, zMin)]);
  appendQuad(parts, [V(xMin, y0, zMin), V(xMax, y0, zMin), V(xMax, y0, zMax), V(xMin, y0, zMax)], V(0, -1, 0), [wood(xMin, zMin), wood(xMax, zMin), wood(xMax, zMax), wood(xMin, zMax)]);
  // Edges: the black metal frame band.
  appendQuad(parts, [V(xMin, y0, zMax), V(xMax, y0, zMax), V(xMax, y1, zMax), V(xMin, y1, zMax)], V(0, 0, 1), metal);
  appendQuad(parts, [V(xMax, y0, zMin), V(xMin, y0, zMin), V(xMin, y1, zMin), V(xMax, y1, zMin)], V(0, 0, -1), metal);
  appendQuad(parts, [V(xMax, y0, zMax), V(xMax, y0, zMin), V(xMax, y1, zMin), V(xMax, y1, zMax)], V(1, 0, 0), metal);
  appendQuad(parts, [V(xMin, y0, zMin), V(xMin, y0, zMax), V(xMin, y1, zMax), V(xMin, y1, zMin)], V(-1, 0, 0), metal);
}

const deskCache = new WeakMap<THREE.BufferGeometry, THREE.BufferGeometry>();

/**
 * The merged desk geometry for a table mesh (cached per source geometry — every station shares it).
 * `tableMesh` must be the loaded table's TableMesh with an up-to-date world matrix (table scene at identity).
 */
export function deskGeometry(tableMesh: THREE.Mesh): THREE.BufferGeometry {
  const cached = deskCache.get(tableMesh.geometry);
  if (cached) return cached;
  const parts: Parts = { position: [], normal: [], uv: [], index: [] };
  const shorten = (LISTENING_DESK.top - LISTENING_DESK.slab.thickness) / LISTENING_DESK.top;
  for (const base of LISTENING_DESK.bases) {
    const matrix = new THREE.Matrix4().makeTranslation(base.x, 0, 0).multiply(new THREE.Matrix4().makeScale(1, shorten, 1)).multiply(tableMesh.matrixWorld);
    appendGeometry(parts, tableMesh.geometry, matrix);
  }
  appendSlab(parts);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(parts.position, 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(parts.normal, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(parts.uv, 2));
  geometry.setIndex(parts.index);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  deskCache.set(tableMesh.geometry, geometry);
  return geometry;
}

// ---------------------------------------------------------------------------
// Album stack
// ---------------------------------------------------------------------------

/** Shared stack resources (one set for the whole museum). */
let shared: {
  body: THREE.BoxGeometry;
  art: THREE.PlaneGeometry;
  bodyMaterial: THREE.MeshStandardMaterial;
  piles: Map<number, THREE.BufferGeometry>;
} | null = null;

function stackResources() {
  if (shared) return shared;
  const { size, thickness } = ALBUM_STACK.sleeve;
  const art = new THREE.PlaneGeometry(size, size).rotateX(-Math.PI / 2);
  // Runtime sleeve textures follow glTF conventions (flipY = false): flip v so the artwork reads upright from
  // the front (image top toward the back of the desk).
  const uv = art.getAttribute("uv");
  for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - uv.getY(i));
  shared = {
    body: new THREE.BoxGeometry(size, thickness, size),
    art,
    // Card-stock edges: warm, matte, quiet.
    bodyMaterial: new THREE.MeshStandardMaterial({ name: "AlbumSleeveBody", color: "#d8d0c2", roughness: 0.92, metalness: 0 }),
    piles: new Map(),
  };
  return shared;
}

/** A merged resting pile of `count` sleeve bodies (NEARBY / DISTANT: one draw). */
function pileGeometry(count: number): THREE.BufferGeometry {
  const res = stackResources();
  const cached = res.piles.get(count);
  if (cached) return cached;
  const parts: Parts = { position: [], normal: [], uv: [], index: [] };
  const pose = { x: 0, y: 0, z: 0, yaw: 0 };
  const matrix = new THREE.Matrix4();
  for (let d = 0; d < count; d++) {
    restPose(d, count, pose);
    matrix.makeRotationY(pose.yaw).setPosition(pose.x, pose.y, pose.z);
    appendGeometry(parts, res.body, matrix);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(parts.position, 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(parts.normal, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(parts.uv, 2));
  geometry.setIndex(parts.index);
  geometry.computeBoundingSphere();
  res.piles.set(count, geometry);
  return geometry;
}

/** One station tier's album stack: a group placed on the desk, plus the handles to pose / dress it. */
export interface AlbumStackView {
  group: THREE.Group;
  quality: StationQuality;
  /** ACTIVE only: one art material per playlist record (index = playlist order). */
  artMaterials: THREE.MeshStandardMaterial[];
  /** Applies the stack system's poses (ACTIVE only; lower tiers are static). */
  applyPoses(poses: readonly SleevePose[], version: number): void;
  dispose(): void;
}

const noRaycast = () => undefined;

/**
 * Builds a tier's stack. `count` = playlist length; `selectedArt` = the station's shared sleeve material (it
 * always shows the selected record's artwork — used for the NEARBY top).
 */
export function createAlbumStack(quality: StationQuality, count: number, selectedArt: THREE.Material): AlbumStackView {
  const res = stackResources();
  const group = new THREE.Group();
  group.name = `AlbumStack_${quality}`;
  group.position.set(ALBUM_STACK.origin.x, LISTENING_DESK.top, ALBUM_STACK.origin.z);
  group.rotation.y = ALBUM_STACK.yaw;
  const artMaterials: THREE.MeshStandardMaterial[] = [];
  const lift = ALBUM_STACK.sleeve.thickness / 2 + 0.0002;

  if (quality !== "active") {
    const pile = new THREE.Mesh(pileGeometry(count), res.bodyMaterial);
    pile.name = "AlbumSleevePile";
    pile.raycast = noRaycast;
    group.add(pile);
    if (quality === "nearby") {
      const top = restPose(0, count);
      const art = new THREE.Mesh(res.art, selectedArt);
      art.name = "AlbumSleeveArt";
      art.position.set(top.x, top.y + lift, top.z);
      art.rotation.y = top.yaw;
      art.raycast = noRaycast;
      group.add(art);
    }
    return { group, quality, artMaterials, applyPoses: () => undefined, dispose: () => undefined };
  }

  const bodies = new THREE.InstancedMesh(res.body, res.bodyMaterial, count);
  bodies.name = "AlbumSleeveBodies";
  bodies.raycast = noRaycast;
  bodies.frustumCulled = false; // instance bounds move; the stack is always beside the visible deck
  group.add(bodies);
  const arts: THREE.Mesh[] = [];
  for (let i = 0; i < count; i++) {
    const material = new THREE.MeshStandardMaterial({ name: "AlbumSleeveArt", color: "#ffffff", roughness: 0.78, metalness: 0 });
    artMaterials.push(material);
    const art = new THREE.Mesh(res.art, material);
    art.name = "AlbumSleeveArt";
    art.raycast = noRaycast;
    arts.push(art);
    group.add(art);
  }
  const matrix = new THREE.Matrix4();
  let applied = -1;
  const view: AlbumStackView = {
    group,
    quality,
    artMaterials,
    applyPoses(poses, version) {
      if (version === applied) return;
      applied = version;
      for (let i = 0; i < count && i < poses.length; i++) {
        const p = poses[i];
        matrix.makeRotationY(p.yaw).setPosition(p.x, p.y, p.z);
        bodies.setMatrixAt(i, matrix);
        arts[i].position.set(p.x, p.y + lift, p.z);
        arts[i].rotation.y = p.yaw;
      }
      bodies.instanceMatrix.needsUpdate = true;
    },
    dispose() {
      bodies.dispose();
      for (const material of artMaterials) material.dispose();
    },
  };
  // Until the first pose arrives, rest in playlist order (never an empty / collapsed pile).
  view.applyPoses(Array.from({ length: count }, (_, d) => restPose(d, count)), 0);
  applied = -1;
  return view;
}
