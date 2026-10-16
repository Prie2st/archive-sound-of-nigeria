/**
 * Design tokens for the generated museum fallback artwork (scripts/build-archive-artwork.mjs,
 * docs/ARCHIVE_CONTENT.md §8). One restrained palette per era — ground, a deeper shade, an accent, paper
 * and ink — so the 40 sleeves and labels read as one archival series that shifts colour era by era.
 * Artwork tokens only; era lighting / hall graphics are a later milestone.
 *
 * Plain TypeScript.
 */
import type { EraId } from "./types.ts";

export interface EraArtTokens {
  /** Sleeve / label ground. */
  ground: string;
  /** Deeper shade for frames and the spindle ring. */
  deep: string;
  /** Catalogue number, rules and pattern. */
  accent: string;
  /** Text on the ground. */
  paper: string;
  ink: string;
}

export const ERA_ART_TOKENS: Readonly<Record<EraId, EraArtTokens>> = {
  roots: { ground: "#3a2a1f", deep: "#24190f", accent: "#c98f4e", paper: "#f0e5d3", ink: "#1a120b" },
  recording: { ground: "#23302f", deep: "#141d1c", accent: "#b99a5f", paper: "#ece6d8", ink: "#0f1514" },
  highlife: { ground: "#114340", deep: "#0a2a28", accent: "#e1b24f", paper: "#f3ecdb", ink: "#08201e" },
  explosion: { ground: "#7b2416", deep: "#4f150c", accent: "#f0c63a", paper: "#f7efdf", ink: "#2a0b05" },
  transition: { ground: "#26355a", deep: "#172139", accent: "#e8743c", paper: "#eef0ea", ink: "#0e1424" },
  naija: { ground: "#0f5535", deep: "#093622", accent: "#e3cf7a", paper: "#f3f1e6", ink: "#062214" },
  afrobeats: { ground: "#5c2050", deep: "#3a1333", accent: "#ff9f62", paper: "#fbefe4", ink: "#250b20" },
  global: { ground: "#161616", deep: "#0a0a0a", accent: "#cfa94f", paper: "#f4efe6", ink: "#000000" },
};

/** Background pattern families; one is chosen per entry from its genre, its parameters from its id. */
export const ART_PATTERNS = ["rings", "bands", "dots", "diagonals", "arcs", "waves"] as const;
export type ArtPattern = (typeof ART_PATTERNS)[number];

/** Deterministic 32-bit FNV-1a hash (stable across builds and platforms). */
export function artHash(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/** Pattern family: tradition cards use drum-head rings (drums) or sound waves (voice, trumpets); recordings follow their genre. */
export const artPatternFor = (genre: string, isTradition: boolean): ArtPattern =>
  isTradition ? (/drum/i.test(genre) ? "rings" : "waves") : ART_PATTERNS[artHash(genre.toLowerCase()) % ART_PATTERNS.length];
