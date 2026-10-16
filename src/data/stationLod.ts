/**
 * Listening-station geometry LOD tiers (docs/STATION_LOD.md).
 *
 * Every tier lives in the SAME runtime GLB (turntable-<profile>.glb, vinyl-<profile>.glb),
 * so tiers share materials and textures and nothing is downloaded twice. ACTIVE keeps the
 * original node names; NEARBY / DISTANT copies carry a suffix (GLTFLoader renames duplicate
 * node names, so they must be unique). Each tier has the same pivot structure (Platter →
 * RecordAnchor, TonearmSwing → TonearmLift → StylusTip) in the same frame, so a station can
 * switch tier without moving: same origin, record centre and silhouette.
 *
 * Plain TypeScript (no React, no three) so Node scripts can import it directly.
 */

export const STATION_QUALITIES = ["active", "nearby", "distant"] as const;

/**
 * Render fidelity for a station (CLAUDE.md §10):
 *   active  — the station being approached / listened to: full interactive models.
 *   nearby  — previous / next station (≈6–18 m): simplified, static-looking.
 *   distant — everything else (≈15 m+): cheap proxy.
 */
export type StationQuality = (typeof STATION_QUALITIES)[number];

export const isStationQuality = (value: unknown): value is StationQuality =>
  (STATION_QUALITIES as readonly unknown[]).includes(value);

const SUFFIX: Record<StationQuality, string> = { active: "", nearby: "_Nearby", distant: "_Distant" };

/**
 * Tier of a station `loopDistance` stations away from the active one (use
 * `getEraLoopDistance` from eras.ts, which wraps GLOBAL ↔ ROOTS): the active station,
 * its previous and next neighbours NEARBY, the other five DISTANT.
 */
export const qualityForLoopDistance = (loopDistance: number): StationQuality =>
  loopDistance === 0 ? "active" : loopDistance === 1 ? "nearby" : "distant";

/** Name of a tier's copy of a model node, e.g. ("Platter", "nearby") → "Platter_Nearby". */
export const lodNodeName = (base: string, quality: StationQuality): string => `${base}${SUFFIX[quality]}`;

/** The sleeve has no NEARBY copy: the full sleeve is only 12 triangles (3 draw calls). */
export const sleeveNodeName = (quality: StationQuality): string => (quality === "distant" ? lodNodeName("Sleeve", "distant") : "Sleeve");

/** Intended viewing distance per tier (metres from the station), for documentation and the future switcher. */
export const LOD_VIEW_DISTANCE: Record<StationQuality, { from: number; to: number }> = {
  active: { from: 0, to: 12 },
  nearby: { from: 6, to: 18 },
  distant: { from: 15, to: Infinity },
};

/**
 * Turntable reduction per tier (meshoptimizer, absolute error in metres).
 * One screen pixel at the test viewport (852 px tall, 50° FOV) ≈ 6.6 mm at 6 m,
 * 13 mm at 12 m, 22 mm at 20 m — both bounds stay far below a pixel in their range.
 */
export interface TurntableLodSettings {
  /** Maximum surface deviation (m). */
  error: number;
  /** Collapse across UV / hard-normal seams (fewer triangles, shading may smear). */
  permissive: boolean;
  /** Delete disconnected pieces smaller than the error (screws, wires, strobe dots). */
  prune: boolean;
  /** Materials left out entirely (e.g. the slip mat, always covered by the record). */
  dropMaterials: readonly string[];
}

export const TURNTABLE_LOD: Record<Exclude<StationQuality, "active">, TurntableLodSettings> = {
  // 0.2 mm keeps every seam (UVs, brushed-metal normals) — invisible even at focus distance.
  nearby: { error: 0.0002, permissive: false, prune: false, dropMaterials: [] },
  // 1 mm, seams may collapse, tiny pieces and the hidden slip mat go.
  distant: { error: 0.001, permissive: true, prune: true, dropMaterials: ["rubber"] },
};

/** Record proxy discs (top face + rim, real Side-A and label materials). */
export const VINYL_LOD: Record<Exclude<StationQuality, "active">, { segments: number; labelSegments: number }> = {
  nearby: { segments: 96, labelSegments: 48 },
  distant: { segments: 32, labelSegments: 24 },
};
