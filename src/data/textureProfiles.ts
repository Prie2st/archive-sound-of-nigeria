/**
 * Texture quality profiles for the station models (table, turntable, vinyl).
 *
 * Single source of truth for both the model build (scripts/build-models.mjs writes one
 * runtime GLB per profile, e.g. turntable-medium.glb) and the app (which picks the file).
 * Geometry is identical in every profile; only texture resolution differs.
 * Measurements and visual checks behind these numbers: docs/STATION_TEXTURE_OPTIMIZATION.md.
 *
 * Plain TypeScript (no React, no three) so Node scripts can import it directly.
 */

export const TEXTURE_PROFILES = ["high", "medium", "low"] as const;
export type TextureProfile = (typeof TEXTURE_PROFILES)[number];

/** Used until the device-quality system exists. */
export const DEFAULT_TEXTURE_PROFILE: TextureProfile = "medium";

/**
 * Development-only variant reproducing the pre-optimisation build (every texture capped at
 * 2048 px, as before), for A/B comparisons. Not built by default:
 *   npm run models -- table turntable --profiles reference
 */
export const REFERENCE_VARIANT = "reference";
export const REFERENCE_MAX_SIZE = 2048;
export type StationModelVariant = TextureProfile | typeof REFERENCE_VARIANT;

export const isStationModelVariant = (value: unknown): value is StationModelVariant =>
  value === REFERENCE_VARIANT || (TEXTURE_PROFILES as readonly unknown[]).includes(value);

export type StationModel = "table" | "turntable" | "vinyl";

/** Runtime file per model; the profile is appended as a suffix. */
const STATION_MODEL_BASES: Record<StationModel, string> = {
  table: "/models/furniture/table",
  turntable: "/models/turntable/turntable",
  vinyl: "/models/vinyl/vinyl",
};

export const stationModelUrl = (model: StationModel, variant: StationModelVariant): string =>
  `${STATION_MODEL_BASES[model]}-${variant}.glb`;

/**
 * Maximum texture edge (px) per profile for a group of material slots. A slot is
 * "<material name>.<glTF texture slot>" as named in the runtime GLB
 * (e.g. "End_Table.normalTexture", "metalbrushedblack.clearcoatNormalTexture").
 * Textures are only ever scaled down, never up.
 */
export interface TextureRule {
  slots: readonly string[];
  sizes: Record<TextureProfile, number>;
  /** Why this resolution: what the map holds and how close it is seen. */
  reason: string;
}

export const STATION_TEXTURE_RULES: Record<StationModel, readonly TextureRule[]> = {
  table: [
    {
      slots: ["End_Table.baseColorTexture", "End_Table.normalTexture"],
      sizes: { high: 2048, medium: 1024, low: 512 },
      reason:
        "Wood grain + frame, real high-frequency detail (½-res error 8/255). 1.44 texels/mm at 2048, 0.72 at 1024: " +
        "still ≥ the focus view's screen density up to ≈1080p; 2048 only pays off on ≥1440p displays.",
    },
    {
      slots: ["End_Table.metallicRoughnessTexture"],
      sizes: { high: 1024, medium: 1024, low: 512 },
      reason: "Roughness + metal/wood mask; soft content (½-res error 3.5/255).",
    },
  ],
  turntable: [
    {
      // Tiling micro-detail maps: UVs repeat 4–3000× (59–199 texels/mm at 2048), so even at
      // 512 they stay ≥15 texels/mm — far above any screen density; the GPU samples a small
      // mip level in every view. Normal maps are almost flat (σ < 1/255).
      slots: [
        "chrome.metallicRoughnessTexture",
        "metalbrushedblack.metallicRoughnessTexture",
        "chrome.CHINCHE.metallicRoughnessTexture",
        "chrome.CHINCHE.normalTexture",
        "metalbrushedblack.normalTexture",
        "metalbrushedblack.clearcoatNormalTexture",
        "plasticshiny.metallicRoughnessTexture",
        "plasticshiny.normalTexture",
        "rubber.normalTexture",
      ],
      sizes: { high: 512, medium: 512, low: 256 },
      reason: "Tiling micro-detail (brushed metal, chrome, plastic); always heavily minified.",
    },
    {
      slots: ["rubber.metallicRoughnessTexture", "rubber.specularTexture"],
      sizes: { high: 1024, medium: 512, low: 256 },
      reason:
        "Slip mat noise (the only non-tiling turntable maps, 3.4 texels/mm at 2048 → 0.86 at 512). " +
        "Mostly hidden under the record.",
    },
  ],
  vinyl: [
    {
      slots: ["VinylSideA.baseColorTexture", "VinylSideA.metallicRoughnessTexture", "VinylSideA.normalTexture"],
      sizes: { high: 1024, medium: 1024, low: 512 },
      reason:
        "Record top face (grooves) — the closest surface in focus view. 6.6 texels/mm at 2048, 3.3 at 1024: " +
        "still ≈3× the focus view's screen density even on a 4K display, so 2048 is never sampled.",
    },
    {
      slots: ["VinylSideB.baseColorTexture", "VinylSideB.metallicRoughnessTexture", "VinylSideB.normalTexture"],
      sizes: { high: 1024, medium: 512, low: 256 },
      reason: "Record underside: only visible while a record is lifted (record switching). 1.65 texels/mm at 512.",
    },
    {
      slots: ["Label.baseColorTexture", "SleeveFront.baseColorTexture", "SleeveBack.baseColorTexture"],
      sizes: { high: 512, medium: 512, low: 256 },
      reason: "Neutral placeholders (flat colour + thin rules); replaced per track by runtime artwork.",
    },
  ],
};

/**
 * Target edge for a texture used by `slots` in `model`: the largest rule size among its
 * slots. Throws for a slot without a rule, so a new texture can't slip through unreviewed.
 */
export function stationTextureSize(model: StationModel, slots: readonly string[], variant: StationModelVariant): number {
  if (slots.length === 0) throw new Error(`${model}: texture without material slots`);
  return Math.max(
    ...slots.map((slot) => {
      const rule = STATION_TEXTURE_RULES[model].find((r) => r.slots.includes(slot));
      if (!rule) throw new Error(`${model}: no texture rule for slot "${slot}" (src/data/textureProfiles.ts)`);
      return variant === REFERENCE_VARIANT ? REFERENCE_MAX_SIZE : rule.sizes[variant];
    }),
  );
}
