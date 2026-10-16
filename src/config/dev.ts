import { chooseExperienceQuality, isExperienceQuality, type ExperienceQuality } from "./quality";
import { isEraId } from "@/data/eras";
import { isGalleryId, type GalleryId } from "@/data/galleries";
import { isStationQuality, type StationQuality } from "@/data/stationLod";
import { DEFAULT_TEXTURE_PROFILE, isStationModelVariant, type StationModelVariant } from "@/data/textureProfiles";
import type { EraId } from "@/data/types";

/**
 * Development configuration.
 *
 * Precedence (highest first):
 *   1. URL params, development builds only:  ?gallery=classic|marble  &inspector=0|1  &opaqueFix=0|1  &stations=0|1
 *                                            &textures=high|medium|low|reference  &era=roots|…|global
 *                                            &lod=auto|active|nearby|distant  &camera=travel|inspect  &stationLog=0|1
 *                                            &audioFail=<eraId> (that era's audio points at a missing file)  &marker=0|1 (record rotation marker)
 *                                            &quality=high|medium|low (rendering budget)
 *                                            &intro=0 (skip the ENTER ARCHIVE screen; sound is then enabled from the SOUND control)
 *   2. Env vars (.env.local):                 NEXT_PUBLIC_GALLERY, NEXT_PUBLIC_INSPECTOR, NEXT_PUBLIC_OPAQUE_FIX, NEXT_PUBLIC_STATIONS,
 *                                            NEXT_PUBLIC_TEXTURE_PROFILE, NEXT_PUBLIC_ACTIVE_ERA, NEXT_PUBLIC_STATION_LOD,
 *                                            NEXT_PUBLIC_CAMERA_MODE
 *   3. DEFAULTS below.
 */
export interface DevConfig {
  /** Which museum shell to load. */
  gallery: GalleryId;
  /** Rendering budget selected once per visit; ?quality= overrides it in development only. */
  quality: ExperienceQuality;
  /** Axes, bounding box, grid, orbit controls and camera readout. */
  inspector: boolean;
  /** Render alpha-less BLEND materials as opaque (see GalleryDefinition.opaqueMaterials). */
  opaqueFix: boolean;
  /** Render the listening stations (off = hall-only, e.g. for performance comparisons). */
  stations: boolean;
  /**
   * Station model texture profile (src/data/textureProfiles.ts). "reference" = the
   * pre-optimisation textures, dev A/B only (build it first: see textureProfiles.ts).
   */
  textureProfile: StationModelVariant;
  /**
   * Start era: TRAVEL starts at this station's route view; in INSPECT mode it is the
   * manually chosen ACTIVE era (in TRAVEL the camera position decides the active era).
   */
  activeEra: EraId;
  /** Geometry tier forced on every station (LOD comparison); null = assignment by active era. Live in the panel. */
  lodOverride: StationQuality | null;
  /**
   * TRAVEL = the production CameraRig owns the camera (wheel / touch / keys); INSPECT = dev
   * orbit controls and static previews. Never both. Production is always TRAVEL.
   */
  cameraMode: CameraMode;
  /** Log per-station alignment (record centre, stylus, bounds) on tier changes. Off by default: it costs ≈25 ms per era change. */
  stationLog: boolean;
  /** Development: this era's audio URL points at a missing file, to test the "recording unavailable" path. URL only. */
  audioFail: EraId | null;
  /** Development: red radial line on every record to check platter speed / direction / continuity. URL only. */
  platterMarker: boolean;
  /** The ENTER ARCHIVE intro (docs/FINAL_UI.md §1). Always on in production; `?intro=0` skips it in development. */
  intro: boolean;
}

export type CameraMode = "travel" | "inspect";
const isCameraMode = (value: unknown): value is CameraMode => value === "travel" || value === "inspect";

const DEFAULTS: DevConfig = {
  gallery: "marble",
  quality: "high",
  inspector: true,
  opaqueFix: true,
  stations: true,
  textureProfile: DEFAULT_TEXTURE_PROFILE,
  activeEra: "roots",
  lodOverride: null,
  cameraMode: "travel",
  stationLog: false,
  audioFail: null,
  platterMarker: false,
  intro: true,
};

const parseFlag = (value: string | null | undefined): boolean | undefined =>
  value === "1" || value === "true" ? true : value === "0" || value === "false" ? false : undefined;

/** Client-only: reads the URL, so call it from code that never renders on the server. */
export function resolveDevConfig(): DevConfig {
  const config: DevConfig = { ...DEFAULTS };
  if (typeof window !== "undefined") {
    config.quality = chooseExperienceQuality({
      width: window.innerWidth,
      coarsePointer: window.matchMedia("(pointer: coarse)").matches,
      deviceMemory: (navigator as Navigator & { deviceMemory?: number }).deviceMemory,
    });
  }

  const envGallery = process.env.NEXT_PUBLIC_GALLERY;
  if (isGalleryId(envGallery)) config.gallery = envGallery;
  config.inspector = parseFlag(process.env.NEXT_PUBLIC_INSPECTOR) ?? config.inspector;
  config.opaqueFix = parseFlag(process.env.NEXT_PUBLIC_OPAQUE_FIX) ?? config.opaqueFix;
  config.stations = parseFlag(process.env.NEXT_PUBLIC_STATIONS) ?? config.stations;
  const envTextures = process.env.NEXT_PUBLIC_TEXTURE_PROFILE;
  if (isStationModelVariant(envTextures)) config.textureProfile = envTextures;
  const envEra = process.env.NEXT_PUBLIC_ACTIVE_ERA;
  if (isEraId(envEra)) config.activeEra = envEra;
  const envLod = process.env.NEXT_PUBLIC_STATION_LOD;
  if (isStationQuality(envLod)) config.lodOverride = envLod;
  const envCamera = process.env.NEXT_PUBLIC_CAMERA_MODE;
  if (isCameraMode(envCamera)) config.cameraMode = envCamera;

  if (process.env.NODE_ENV === "development" && typeof window !== "undefined") {
    const params = new URLSearchParams(window.location.search);
    const quality = params.get("quality");
    if (isExperienceQuality(quality)) config.quality = quality;
    const gallery = params.get("gallery");
    if (isGalleryId(gallery)) config.gallery = gallery;
    config.inspector = parseFlag(params.get("inspector")) ?? config.inspector;
    config.opaqueFix = parseFlag(params.get("opaqueFix")) ?? config.opaqueFix;
    config.stations = parseFlag(params.get("stations")) ?? config.stations;
    const textures = params.get("textures");
    if (isStationModelVariant(textures)) config.textureProfile = textures;
    const era = params.get("era");
    if (isEraId(era)) config.activeEra = era;
    const lod = params.get("lod");
    if (isStationQuality(lod)) config.lodOverride = lod;
    else if (lod === "auto") config.lodOverride = null;
    const camera = params.get("camera");
    if (isCameraMode(camera)) config.cameraMode = camera;
    config.stationLog = parseFlag(params.get("stationLog")) ?? config.stationLog;
    const audioFail = params.get("audioFail");
    if (isEraId(audioFail)) config.audioFail = audioFail;
    config.platterMarker = parseFlag(params.get("marker")) ?? config.platterMarker;
    config.intro = parseFlag(params.get("intro")) ?? config.intro;
  }

  return config;
}
