/**
 * Instrument exhibits placed around the hall (one per era, two for ROOTS). Content and build settings only; where each
 * stands lives in hallLayout.ts (EXHIBIT_SLOTS). Runtime GLBs are built by scripts/build-exhibits.mjs from the
 * Sketchfab originals in /exhibits-src. Every model is third-party: keep the credits with it (CC-BY requires them).
 */
import type { EraId } from "./types";

export interface ExhibitCredit {
  title: string;
  author: string;
  url: string;
  license: string;
}

export interface ExhibitDefinition {
  id: string;
  eraId: EraId;
  /** Museum label. */
  name: string;
  /** Source file in /exhibits-src. */
  source: string;
  /** Real-world size in metres of the model's largest dimension. */
  size: number;
  /** Corrective rotation (degrees, XYZ) applied before sizing, when a source lies in an odd pose. */
  rotate?: readonly [number, number, number];
  /** Meshopt simplification: fraction of triangles kept. Absent = geometry untouched. */
  keep?: number;
  /** Simplification error limit as a fraction of the mesh radius (default 0.002). */
  error?: number;
  /** The source has per-face vertices (flat normals): drop normals, weld, simplify, then recompute smooth normals. */
  reweld?: boolean;
  /** Shown enlarged by this factor (sculptural, so it reads from the route); the GLB stays real-world size. */
  display: number;
  /** Plinth height in metres (0 = stands on the floor). */
  plinth: number;
  credit: ExhibitCredit;
}

const CC_BY = "CC BY 4.0";

export const EXHIBITS: readonly ExhibitDefinition[] = [
  {
    // Shown in profile (lacing towards the visitor). The model is barrel-shaped, not the dùndún hourglass, so it is
    // labelled generically.
    id: "talking-drum", eraId: "roots", name: "Talking drum", source: "talking-drum.glb", size: 0.6, rotate: [0, -90, 0], keep: 0.25, display: 1.5, plinth: 0.85,
    credit: { title: "Talking Drum v2", author: "techeverlasting", url: "https://sketchfab.com/3d-models/talking-drum-v2-7e6a222bddbd41d1849aa036c17015b4", license: CC_BY },
  },
  {
    // CC BY-ND: rescaled and compressed only, never simplified or edited.
    id: "axatse", eraId: "roots", name: "Axatse (gourd rattle)", source: "axatse.glb", size: 0.32, display: 2, plinth: 0.9,
    credit: { title: "Axatse", author: "Wesleyan University", url: "https://sketchfab.com/3d-models/axatse-38409d6703cb47fcb85fa4a9e60a6511", license: "CC BY-ND 4.0" },
  },
  {
    id: "gramophone", eraId: "recording", name: "Gramophone", source: "gramophone.glb", size: 0.7, display: 1.5, plinth: 0.6,
    credit: { title: "Vintage Gramophone", author: "Maxim Mavrichev", url: "https://sketchfab.com/3d-models/vintage-gramophone-a7508a4233a344008029d21a2f0024bd", license: CC_BY },
  },
  {
    id: "trumpet", eraId: "highlife", name: "Trumpet", source: "trumpet.glb", size: 0.5, display: 1.8, plinth: 1,
    credit: { title: "Trumpet", author: "Charlie Tinley", url: "https://sketchfab.com/3d-models/trumpet-3f2d4f5b962340b2933012e1bc634d88", license: CC_BY },
  },
  {
    id: "saxophone", eraId: "explosion", name: "Alto saxophone", source: "saxophone.glb", size: 0.68, rotate: [0, -90, 0], keep: 0.3, display: 1.6, plinth: 0.5,
    credit: { title: "saxophone alto", author: "ANDRIANIAINAToky", url: "https://sketchfab.com/3d-models/saxophone-alto-08448f4bfbca474b80ba35a571648a27", license: CC_BY },
  },
  {
    // The file's metadata says "Sketchfab Standard" although its title says CC0: confirm before launch.
    id: "boombox", eraId: "transition", name: "Boombox", source: "boombox.glb", size: 0.55, display: 1.6, plinth: 0.9,
    credit: { title: "[CC0] Free Low Poly Boombox", author: "Viktor Sano", url: "https://sketchfab.com/3d-models/cc0-free-low-poly-boombox-d5ea7e4de7664e3eb4f249836ff7a24b", license: "Sketchfab Standard (titled CC0; to confirm)" },
  },
  {
    id: "guitar", eraId: "naija", name: "Acoustic guitar", source: "guitar.glb", size: 1.02, rotate: [15, 0, 0], display: 1.4, plinth: 0.25,
    credit: { title: "DD Acoustic Guitar", author: "Igor Bistritski", url: "https://sketchfab.com/3d-models/dd-acoustic-guitar-4eeb8f55c0de4521af948a343094baa4", license: CC_BY },
  },
  {
    id: "conga", eraId: "afrobeats", name: "Conga", source: "conga.glb", size: 0.76, display: 1.5, plinth: 0.3,
    credit: { title: "conga", author: "alixor22", url: "https://sketchfab.com/3d-models/conga-f965fcb767b04d0eb85a3a0f485ef779", license: CC_BY },
  },
  {
    // A pair, lying flat in the source: sized to real 25 cm tambourines and tilted up to face the visitor.
    id: "tambourine", eraId: "global", name: "Tambourines", source: "tambourine.glb", size: 0.52, rotate: [75, 0, 0], keep: 0.12, error: 0.01, reweld: true, display: 1.8, plinth: 1,
    credit: { title: "Tambourine", author: "arjunpramod1", url: "https://sketchfab.com/3d-models/tambourine-c0dd07bac757481f8d29404b001c482c", license: CC_BY },
  },
];

export const exhibitUrl = (id: string) => `/models/exhibits/${id}.glb`;
