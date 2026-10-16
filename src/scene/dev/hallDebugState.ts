/** Development-only state for the marble hall layout debugging (shared by scene and panel). */

export interface HallDebugOptions {
  /** Axes, grid and model bounding box (the original inspector helpers). */
  helpers: boolean;
  /** Closed spline (camera route) with progress ticks and its floor projection. */
  path: boolean;
  /** The authored spline control points. */
  controlPoints: boolean;
  /** Station proxies (table + deck + record footprint), forward vectors. */
  stations: boolean;
  /** Route view anchors and their look-at lines. */
  views: boolean;
  /** Listening-mode (FOCUS) camera anchors and their look-at lines. */
  focus: boolean;
  /** Room centre, loop-radius rings and floor-level references. */
  reference: boolean;
  /** Text labels in the 3D view (off for clean composition checks). */
  labels: boolean;
  /** Focus interaction volumes (the ACTIVE station's is the live, clickable one). */
  volumes: boolean;
  /** Focus transition trajectories (from each route view point) with their control points. */
  focusPaths: boolean;
}

export const DEFAULT_HALL_DEBUG: HallDebugOptions = {
  helpers: true,
  path: true,
  controlPoints: true,
  stations: true,
  views: true,
  focus: true,
  reference: true,
  labels: true,
  volumes: false,
  focusPaths: false,
};

/** Which authored camera to preview for a station. */
export type StationView = "route" | "focus";

/** Static camera preview — composition inspection only, not the CameraRig. */
export type CameraPreview =
  | { mode: "orbit" }
  | { mode: "station"; station: number; view: StationView }
  | { mode: "progress"; progress: number; look: "ahead" | "station" }
  /**
   * LOD comparison: `distance` metres from the station along one of its authored camera
   * axes — "route": from the route look-at through the route view point (6.16 m = the route
   * view); "focus": from the platter through the focus camera (2.02 m = the focus view).
   */
  | { mode: "distance"; station: number; axis: "route" | "focus"; distance: number };
