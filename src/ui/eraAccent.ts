/**
 * The interface's one per-era touch (docs/FINAL_UI.md §9): a single accent colour for the era indicator,
 * the caption rule and the catalogue highlight. Taken from the Era Visual Worlds palettes (eraVisuals.ts) —
 * no new colours — choosing for each era the palette colour that stays visible as a thin line on the light
 * marble and on the paper caption. The UI never changes typeface, layout or ground per era.
 */
import { ERA_VISUALS } from "@/data/eraVisuals";
import type { EraId } from "@/data/types";

export const ERA_UI_ACCENT: Readonly<Record<EraId, string>> = {
  roots: ERA_VISUALS.roots.accent,
  recording: ERA_VISUALS.recording.accent,
  highlife: ERA_VISUALS.highlife.primary,
  explosion: ERA_VISUALS.explosion.primary,
  transition: ERA_VISUALS.transition.primary,
  naija: ERA_VISUALS.naija.accent,
  afrobeats: ERA_VISUALS.afrobeats.secondary,
  global: ERA_VISUALS.global.accent,
};
