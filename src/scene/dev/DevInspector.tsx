"use client";

import { OrbitControls } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, type ComponentRef, type RefObject } from "react";
import * as THREE from "three";
import { QUALITY_SETTINGS, type ExperienceQuality } from "@/config/quality";
import type { CameraMode } from "@/config/dev";
import { getHallLayout } from "@/data/hallLayout";
import { HallLayoutDebug, PathPreviewCamera } from "@/scene/dev/HallLayoutDebug";
import type { CameraPreview, HallDebugOptions } from "@/scene/dev/hallDebugState";
import type { FocusController } from "@/state/focus";
import type { TravelController } from "@/state/travel";

type OrbitControlsImpl = ComponentRef<typeof OrbitControls>;

interface DevInspectorProps {
  quality: ExperienceQuality;
  bounds: THREE.Box3 | null;
  readoutRef: RefObject<HTMLPreElement | null>;
  /** Marble hall layout debugging; omitted for galleries without a layout (classic). */
  hall?: { options: HallDebugOptions; preview: CameraPreview };
  /** INSPECT: orbit controls + static previews own the camera. TRAVEL: the CameraRig does (never both). */
  mode: CameraMode;
  /** Travel state for the readout (marble hall only). */
  travel?: TravelController;
  /** Focus state for the readout (marble hall only). */
  focus?: FocusController;
}

/**
 * Temporary development view: world axes (X red, Y green, Z blue, 5 m long),
 * a 1 m grid on the world XZ plane at y = 0, the model's bounding box,
 * free orbit controls and a live camera readout.
 * For the marble hall it also draws the layout (route, anchors, references) and can
 * park the camera at points on the route for composition checks.
 */
export function DevInspector({ quality, bounds, readoutRef, hall, mode, travel, focus }: DevInspectorProps) {
  const helpers = hall?.options.helpers ?? true;
  const inspecting = mode === "inspect";
  const orbiting = !hall || hall.preview.mode === "orbit";
  const controls = useRef<OrbitControlsImpl>(null);
  const get = useThree((state) => state.get);

  const gridSize = useMemo(() => {
    if (!bounds) return 20;
    const size = bounds.getSize(new THREE.Vector3());
    return Math.ceil(Math.max(size.x, size.z) / 2) * 2 + 4;
  }, [bounds]);

  const boxHelper = useMemo(() => (bounds ? new THREE.Box3Helper(bounds, 0xffc94d) : null), [bounds]);
  useEffect(() => () => boxHelper?.dispose(), [boxHelper]);

  // Frame the whole model once its bounds are known.
  useEffect(() => {
    if (!bounds || !controls.current) return;
    const { camera } = get();
    const center = bounds.getCenter(new THREE.Vector3());
    const size = bounds.getSize(new THREE.Vector3());
    const radius = size.length() / 2;
    camera.position.set(center.x + radius * 0.9, center.y + radius * 0.7, center.z + radius * 0.9);
    camera.near = 0.05;
    camera.far = radius * 20;
    camera.updateProjectionMatrix();
    controls.current.target.copy(center);
    controls.current.update();
  }, [bounds, get]);

  // Entering INSPECT (e.g. from TRAVEL): orbit around a point just ahead of the current view.
  useEffect(() => {
    if (!inspecting || !controls.current) return;
    const { camera } = get();
    const ahead = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion).multiplyScalar(5);
    controls.current.target.copy(camera.position).add(ahead);
    controls.current.update();
  }, [inspecting, get]);

  return (
    <>
      {helpers && (
        <>
          <axesHelper args={[5]} />
          <gridHelper args={[gridSize, gridSize, 0x8a8a8a, 0x4a4a4a]} />
          {boxHelper && <primitive object={boxHelper} />}
        </>
      )}
      {hall && <HallLayoutDebug options={hall.options} />}
      {inspecting && hall && <PathPreviewCamera preview={hall.preview} controls={controls} />}
      {inspecting && <OrbitControls ref={controls} makeDefault enabled={orbiting} enableDamping dampingFactor={0.12} />}
      <CameraReadout quality={quality} readoutRef={readoutRef} controls={controls} mode={mode} travel={travel} focus={focus} />
    </>
  );
}

const fmt = (v: THREE.Vector3) => `${v.x.toFixed(2)}, ${v.y.toFixed(2)}, ${v.z.toFixed(2)}`;

/** Writes camera data straight into a DOM node (10 Hz) — no React state per frame. */
function CameraReadout({
  quality,
  readoutRef,
  controls,
  mode,
  travel,
  focus,
}: {
  quality: ExperienceQuality;
  readoutRef: RefObject<HTMLPreElement | null>;
  controls: RefObject<OrbitControlsImpl | null>;
  mode: CameraMode;
  travel?: TravelController;
  focus?: FocusController;
}) {
  const elapsed = useRef(0);
  const frames = useRef(0);
  const sinceEstimate = useRef(Infinity);
  const gpuEstimate = useRef("—");

  useFrame((state, delta) => {
    elapsed.current += delta;
    sinceEstimate.current += delta;
    frames.current++;
    if (elapsed.current < 0.5 || !readoutRef.current) return;
    const { camera, gl, scene } = state;
    if (sinceEstimate.current > 2) {
      gpuEstimate.current = estimateGpuMemory(scene);
      sinceEstimate.current = 0;
    }
    const target = mode === "inspect" ? controls.current?.target : undefined;
    const fps = frames.current / elapsed.current;
    const { memory, render } = gl.info;
    readoutRef.current.textContent =
      `QUALITY  ${quality.toUpperCase()}\nDPR      ${gl.getPixelRatio().toFixed(2)} (cap ${QUALITY_SETTINGS[quality].maxDpr})\n` +
      `mode     ${mode.toUpperCase()}${travel ? travelReadout(travel, camera as THREE.PerspectiveCamera, focus) : ""}\n` +
      `camera   ${fmt(camera.position)}\n` +
      `target   ${target ? fmt(target) : "—"}\n` +
      `distance ${target ? camera.position.distanceTo(target).toFixed(2) : "—"} m\n` +
      `fps      ${fps.toFixed(1)}   frame ${((elapsed.current / frames.current) * 1000).toFixed(1)} ms\n` +
      `calls    ${render.calls}   tris ${render.triangles.toLocaleString()}\n` +
      `memory   geometries ${memory.geometries}   textures ${memory.textures}   ≈ ${gpuEstimate.current}`;
    elapsed.current = 0;
    frames.current = 0;
  });

  return null;
}

/** Travel state lines for the dev readout (written at the readout's 2 Hz, not per frame). */
function travelReadout(travel: TravelController, camera: THREE.PerspectiveCamera, focus?: FocusController): string {
  const stations = getHallLayout().stations;
  const label = (index: number) => (index >= 0 ? stations[index].debugLabel : "—");
  const focusLine = focus
    ? `\nfocus    ${focus.mode} · ${label(focus.station)} · progress ${focus.progress.toFixed(3)} · saved abs ${focus.savedAbsoluteProgress?.toFixed(4) ?? "—"}${travel.locked ? " · travel LOCKED" : ""}`
    : "";
  return (
    `${travel.paused ? " (paused)" : ""} · reduced motion ${travel.reducedMotion ? "ON" : "off"}\n` +
    `progress abs ${travel.absoluteProgress.toFixed(4)} · loop ${travel.loopProgress.toFixed(4)} (${(travel.loopProgress * travel.routeLength).toFixed(1)} m)\n` +
    `velocity ${travel.velocity.toFixed(2)} m/s · fov ${camera.fov.toFixed(1)}°\n` +
    `era      ${label(travel.activeStation)} · influence ${travel.influence.toFixed(2)} ${travel.influence > 0 ? `(${label(travel.influenceStation)})` : ""}` +
    focusLine
  );
}

/**
 * Rough GPU memory estimate for the scene: unique geometry buffers + unique textures
 * decoded as RGBA8 with mipmaps (+⅓). Excludes render targets and driver overhead.
 */
function estimateGpuMemory(scene: THREE.Object3D): string {
  const geometries = new Set<THREE.BufferGeometry>();
  const textures = new Set<THREE.Texture>();
  scene.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    geometries.add(object.geometry as THREE.BufferGeometry);
    for (const material of [object.material].flat() as THREE.Material[]) {
      for (const value of Object.values(material)) if (value instanceof THREE.Texture) textures.add(value);
    }
  });
  let geometryBytes = 0;
  for (const geometry of geometries) {
    for (const attribute of Object.values(geometry.attributes)) geometryBytes += (attribute as THREE.BufferAttribute).array.byteLength;
    geometryBytes += geometry.index?.array.byteLength ?? 0;
  }
  let textureBytes = 0;
  for (const texture of textures) {
    const image = texture.image as { width?: number; height?: number } | undefined;
    if (image?.width && image.height) textureBytes += image.width * image.height * 4 * (4 / 3);
  }
  const mb = (bytes: number) => (bytes / 1024 / 1024).toFixed(0);
  return `${mb(geometryBytes + textureBytes)} MB (geo ${mb(geometryBytes)} + tex ${mb(textureBytes)})`;
}
