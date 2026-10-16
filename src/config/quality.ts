/** Small, once-per-visit rendering policy. Geometry LOD and texture profiles stay independent. */
export const EXPERIENCE_QUALITIES = ["high", "medium", "low"] as const;
export type ExperienceQuality = (typeof EXPERIENCE_QUALITIES)[number];

export const QUALITY_SETTINGS = {
  high: { maxDpr: 2, antialias: true, activeProps: true, nearbyDecoration: true, hallShadowMapSize: 2048, stationShadowMapSize: 2048, shadowDetail: "full" },
  medium: { maxDpr: 2, antialias: true, activeProps: true, nearbyDecoration: false, hallShadowMapSize: 1024, stationShadowMapSize: 1024, shadowDetail: "body" },
  low: { maxDpr: 1, antialias: false, activeProps: false, nearbyDecoration: false, hallShadowMapSize: 512, stationShadowMapSize: 512, shadowDetail: "minimal" },
} as const;

export const isExperienceQuality = (value: unknown): value is ExperienceQuality =>
  EXPERIENCE_QUALITIES.some(quality => quality === value);

/** No scoring or resize listener: rotation/resizing never rebuilds the renderer or restarts the visit. */
export function chooseExperienceQuality({ width, coarsePointer, deviceMemory }: { width: number; coarsePointer: boolean; deviceMemory?: number }): ExperienceQuality {
  // Width is a layout hint, not evidence of a weak GPU. Phones without a memory hint
  // (including Safari) retain AA and a sharp, bounded high-DPI drawing buffer.
  if (deviceMemory !== undefined && deviceMemory <= 2) return "low";
  if (coarsePointer || width < 1024) return "medium";
  return "high";
}
