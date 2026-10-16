/**
 * Gallery environments. The active one is chosen by the dev configuration
 * (src/config/dev.ts), so the old and new museum shells can be compared.
 */

export type GalleryId = "classic" | "marble";

export interface GalleryDefinition {
  id: GalleryId;
  label: string;
  url: string;
  /** Pipeline state of the file, shown in the dev inspector. */
  status: string;
  /**
   * Materials authored as alpha BLEND whose textures carry no alpha channel.
   * Rendered opaque when the dev `opaqueFix` is on, to avoid depth-sorting artefacts.
   */
  opaqueMaterials: readonly string[];
  /** Whether the authored hall layout (src/data/hallLayout.ts) applies. Marble only. */
  hasHallLayout: boolean;
}

export const GALLERIES: Record<GalleryId, GalleryDefinition> = {
  classic: {
    id: "classic",
    label: "Classic gallery (old)",
    url: "/models/gallery/gallery.glb",
    status: "optimized (scripts/build-models.mjs)",
    opaqueMaterials: [],
    hasHallLayout: false,
  },
  marble: {
    id: "marble",
    label: "Marble gallery (new)",
    url: "/models/gallery/marble-gallery.glb",
    status: "optimized (scripts/build-models.mjs) — 16 MB, full geometry",
    // Already fixed in the build (opaque materials + separate RoomGlass), so nothing to patch at runtime.
    opaqueMaterials: [],
    hasHallLayout: true,
  },
};

export const isGalleryId = (value: unknown): value is GalleryId =>
  typeof value === "string" && value in GALLERIES;
