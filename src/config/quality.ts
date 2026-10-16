/** Small, once-per-visit rendering policy. Geometry LOD and texture profiles stay independent. */
export const EXPERIENCE_QUALITIES = ["high", "medium", "low"] as const;
export type ExperienceQuality = (typeof EXPERIENCE_QUALITIES)[number];

export const QUALITY_SETTINGS = {
  high: { maxDpr: 1.5, antialias: true, activeProps: true, nearbyDecoration: true, hallShadowMapSize: 2048, stationShadowMapSize: 2048, shadowDetail: "full" },
  medium: { maxDpr: 1.25, antialias: true, activeProps: true, nearbyDecoration: false, hallShadowMapSize: 1024, stationShadowMapSize: 1024, shadowDetail: "body" },
  low: { maxDpr: 1, antialias: false, activeProps: false, nearbyDecoration: false, hallShadowMapSize: 512, stationShadowMapSize: 512, shadowDetail: "minimal" },
} as const;

export const isExperienceQuality = (value: unknown): value is ExperienceQuality =>
  EXPERIENCE_QUALITIES.some(quality => quality === value);

/** No scoring or resize listener: rotation/resizing never rebuilds the renderer or restarts the visit. */
export function chooseExperienceQuality({ width, coarsePointer, deviceMemory }: { width: number; coarsePointer: boolean; deviceMemory?: number }): ExperienceQuality {
  if (width <= 480 || (deviceMemory !== undefined && deviceMemory <= 2)) return "low";
  if (coarsePointer || width < 1024) return "medium";
  return "high";
}
