/**
 * Record identity on screen (docs/RECORD_CHANGE.md §9): label and sleeve textures for a station's
 * mounted record. Each station owns ONE cloned Label, SleeveFront and SleeveBack material, shared by
 * its three LOD tiers (so a selection shows at every distance; the DISTANT sleeve has no back); a
 * record change only swaps their `map`. The vinyl geometry is never reloaded or duplicated.
 *
 * Textures are loaded once per URL and kept (development art is 32 small files; licensed art will
 * need an eviction policy — see the doc). Runtime textures follow glTF conventions: flipY false, sRGB.
 */
import * as THREE from "three";
import { getTrack } from "@/data/eras";
import type { EraId } from "@/data/types";
import { MODEL_PLACEHOLDER_ARTWORK, resolveRecordArtwork } from "@/stations/recordArtworkCatalog";

/** Per-station presentation, shared by the station's ACTIVE / NEARBY / DISTANT rigs. */
export interface StationPresentation {
  label: THREE.MeshStandardMaterial;
  sleeveFront: THREE.MeshStandardMaterial;
  /** Null when no tier carries a sleeve back (then back art is simply not shown). */
  sleeveBack: THREE.MeshStandardMaterial | null;
  /** The vinyl GLB's neutral placeholder maps (shown for records without artwork). */
  defaultLabelMap: THREE.Texture | null;
  defaultSleeveMap: THREE.Texture | null;
  defaultSleeveBackMap: THREE.Texture | null;
  /** Record currently presented (null until the first present()). */
  trackId: string | null;
}

const materialsOf = (mesh: THREE.Mesh): THREE.Material[] => (Array.isArray(mesh.material) ? mesh.material : [mesh.material]);

/**
 * Clones the Label, SleeveFront and SleeveBack materials once for a station and assigns the clones to every tier's
 * label / sleeve meshes (array materials are per-mesh copies in three.js, so only the slot is replaced).
 */
export function createStationPresentation(records: THREE.Object3D[], sleeves: THREE.Object3D[]): StationPresentation {
  let label: THREE.MeshStandardMaterial | null = null;
  let sleeveFront: THREE.MeshStandardMaterial | null = null;
  let sleeveBack: THREE.MeshStandardMaterial | null = null;
  const swap = (roots: THREE.Object3D[], name: string, pick: (source: THREE.MeshStandardMaterial) => THREE.MeshStandardMaterial) => {
    for (const root of roots) {
      root.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        const slots = materialsOf(object);
        slots.forEach((material, index) => {
          if (material.name !== name) return;
          const replacement = pick(material as THREE.MeshStandardMaterial);
          if (Array.isArray(object.material)) object.material[index] = replacement;
          else object.material = replacement;
        });
      });
    }
  };
  swap(records, "Label", (source) => (label ??= source.clone()));
  swap(sleeves, "SleeveFront", (source) => (sleeveFront ??= source.clone()));
  swap(sleeves, "SleeveBack", (source) => (sleeveBack ??= source.clone()));
  if (!label || !sleeveFront) throw new Error("record presentation: Label / SleeveFront material not found in the vinyl model");
  const labelMaterial: THREE.MeshStandardMaterial = label;
  const sleeveMaterial: THREE.MeshStandardMaterial = sleeveFront;
  // Assigned inside the traverse callback, which control-flow analysis cannot see (it narrows to null).
  const backMaterial = sleeveBack as THREE.MeshStandardMaterial | null;
  return {
    label: labelMaterial,
    sleeveFront: sleeveMaterial,
    sleeveBack: backMaterial,
    defaultLabelMap: labelMaterial.map,
    defaultSleeveMap: sleeveMaterial.map,
    defaultSleeveBackMap: backMaterial?.map ?? null,
    trackId: null,
  };
}

interface ArtworkEntry {
  texture: THREE.Texture | null;
  failed: boolean;
}

const loader = new THREE.TextureLoader();
const cache = new Map<string, ArtworkEntry>();

function load(url: string): ArtworkEntry {
  const existing = cache.get(url);
  if (existing) return existing;
  const entry: ArtworkEntry = { texture: null, failed: false };
  cache.set(url, entry);
  loader.load(
    url,
    (texture) => {
      texture.flipY = false;
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = 4;
      entry.texture = texture;
    },
    undefined,
    () => {
      entry.failed = true;
      console.warn(`[artwork] could not load ${url}; the model placeholder is shown instead`);
    },
  );
  return entry;
}

const settled = (url: string | null) => {
  if (!url) return true;
  const entry = load(url);
  return entry.texture !== null || entry.failed;
};

const artworkOf = (eraId: EraId, trackId: string) => {
  const track = getTrack(eraId, trackId);
  return track ? resolveRecordArtwork(track) : MODEL_PLACEHOLDER_ARTWORK;
};

/**
 * A record's sleeve-front artwork for the album stack (docs/LISTENING_STATION_TABLE.md): starts the load on first
 * call and shares the same once-per-URL cache as the deck's label / sleeve. Returns undefined while loading,
 * null when the record has no sleeve art (or it failed), else the texture.
 */
export function sleeveArtworkTexture(eraId: EraId, trackId: string): THREE.Texture | null | undefined {
  const url = artworkOf(eraId, trackId).sleeveUrl;
  if (!url) return null;
  const entry = load(url);
  if (entry.texture) return entry.texture;
  return entry.failed ? null : undefined;
}

/** Starts loading a record's label / sleeve (record-change request time). */
export function prepareTrackArtwork(eraId: EraId, trackId: string) {
  const art = artworkOf(eraId, trackId);
  if (art.labelUrl) load(art.labelUrl);
  if (art.sleeveUrl) load(art.sleeveUrl);
  if (art.sleeveBackUrl) load(art.sleeveBackUrl);
}

/** Whether a record's artwork has finished loading (or failed — then the placeholder is used). */
export function trackArtworkReady(eraId: EraId, trackId: string): boolean {
  const art = artworkOf(eraId, trackId);
  return settled(art.labelUrl) && settled(art.sleeveUrl) && settled(art.sleeveBackUrl);
}

/**
 * Shows `trackId`'s label and sleeve on a station (no-op when already shown). Waits — keeping the
 * current identity — until its textures are loaded, so there is never a blank flash.
 */
export function presentRecord(presentation: StationPresentation, eraId: EraId, trackId: string) {
  if (presentation.trackId === trackId) return;
  const art = artworkOf(eraId, trackId);
  if (!settled(art.labelUrl) || !settled(art.sleeveUrl) || !settled(art.sleeveBackUrl)) return;
  const loaded = (url: string | null) => (url ? cache.get(url)?.texture : null);
  presentation.label.map = loaded(art.labelUrl) ?? presentation.defaultLabelMap;
  presentation.sleeveFront.map = loaded(art.sleeveUrl) ?? presentation.defaultSleeveMap;
  if (presentation.sleeveBack) presentation.sleeveBack.map = loaded(art.sleeveBackUrl) ?? presentation.defaultSleeveBackMap;
  presentation.trackId = trackId;
}

/** Development readout: loaded artwork textures and their decoded size estimate (RGBA8 + mips). */
export function artworkStats(): { textures: number; bytes: number } {
  let textures = 0;
  let bytes = 0;
  for (const entry of cache.values()) {
    const image = entry.texture?.image as { width?: number; height?: number } | undefined;
    if (!image?.width || !image.height) continue;
    textures++;
    bytes += image.width * image.height * 4 * (4 / 3);
  }
  return { textures, bytes };
}
