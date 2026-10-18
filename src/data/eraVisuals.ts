/** Presentation only. The locked hall, archive and playback systems never read these tokens. */
import { ERA_ART_TOKENS } from "./archiveArtTokens.ts";
import type { StationLayout } from "./hallLayout.ts";
import type { EraId } from "./types.ts";

export interface EraVisualToken {
  primary: string;
  secondary: string;
  accent: string;
  paper: string;
  light: string;
  motif: "weave" | "shellac" | "brass" | "print" | "cassette" | "disc" | "city" | "arena";
}

const art = ERA_ART_TOKENS;
export const ERA_VISUALS: Record<EraId, EraVisualToken> = {
  roots: { primary: art.roots.ground, secondary: "#754b2c", accent: art.roots.accent, paper: art.roots.paper, light: "#ffc180", motif: "weave" },
  recording: { primary: "#e3d6bb", secondary: "#312b25", accent: "#9c754d", paper: "#f1ead9", light: "#ffe3b0", motif: "shellac" },
  highlife: { primary: art.highlife.ground, secondary: "#ead8ac", accent: art.highlife.accent, paper: art.highlife.paper, light: "#ffe0a0", motif: "brass" },
  explosion: { primary: art.explosion.ground, secondary: "#183c2b", accent: art.explosion.accent, paper: art.explosion.paper, light: "#ffbb78", motif: "print" },
  transition: { primary: "#273758", secondary: "#78658e", accent: "#86b9dc", paper: "#e0e4e6", light: "#a5c9ed", motif: "cassette" },
  naija: { primary: "#ced4db", secondary: "#0c392d", accent: "#245df0", paper: "#f3f5ed", light: "#b7d8ff", motif: "disc" },
  afrobeats: { primary: art.afrobeats.deep, secondary: "#176d70", accent: art.afrobeats.accent, paper: art.afrobeats.paper, light: "#ffcaaf", motif: "city" },
  global: { primary: "#111217", secondary: "#333943", accent: art.global.accent, paper: art.global.paper, light: "#e6e8f3", motif: "arena" },
};

export const ERA_ATLAS = { url: "/textures/environment/era-worlds-v1.webp", width: 2048, height: 1024, tile: 512, padding: 8 } as const;
export const ERA_WORLD_LAYOUT = {
  // Square, like the 512 px tiles (Figma "ARCHIVE — Editable Era Backdrops", BACKDROP 14:91), so nothing stretches.
  panel: { width: 3, height: 3, y: 2.2, z: -1.31, thickness: 0.012 },
  nextEdge: { x: 1.66, y: 2.3, z: -0.75, width: 0.22, height: 1.4 },
  prop: { x: 1.35, z: -0.75, halfWidth: 0.22, halfDepth: 0.22, height: 1.14 },
} as const;

/** Plane faces the centre of the hall; its position is offset behind the locked station. */
export function eraPanelPose(station: StationLayout) {
  const z = ERA_WORLD_LAYOUT.panel.z;
  return {
    position: [station.position[0] + Math.sin(station.heading) * z, ERA_WORLD_LAYOUT.panel.y, station.position[2] + Math.cos(station.heading) * z] as [number, number, number],
    heading: Math.atan2(-station.position[0], -station.position[2]),
  };
}

export interface EraVisualSettings { enabled: boolean; forcedEra: EraId | null }
export const DEFAULT_ERA_VISUAL_SETTINGS: EraVisualSettings = { enabled: true, forcedEra: null };

export function eraVisualTier(index: number, active: number): "active" | "nearby" | "distant" {
  const distance = Math.min(Math.abs(index - active), 8 - Math.abs(index - active));
  return distance === 0 ? "active" : distance === 1 ? "nearby" : "distant";
}



