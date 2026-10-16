"use client";

import { Line, type OrbitControls } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import { createContext, useContext, useEffect, useMemo, type ComponentRef, type RefObject } from "react";
import * as THREE from "three";
import {
  HALL,
  PATH_CONTROL_POINTS,
  PLATTER_OFFSET,
  getHallLayout,
  nearestStationIndex,
  wrapProgress,
  type StationLayout,
  type Vec3,
} from "@/data/hallLayout";
import type { CameraPreview, HallDebugOptions } from "@/scene/dev/hallDebugState";
import { bezierPoint, FOCUS_CONFIG, transitionControlPoint } from "@/state/focus";

const COLORS = {
  path: "#3fd0ff",
  pathFloor: "#1f6f8a",
  control: "#ff9f1c",
  station: "#ffd166",
  forward: "#ff4d6d",
  view: "#ffffff",
  focus: "#b78cff",
  reference: "#8a8a8a",
  radius: "#5bd18b",
};

type Tuple = THREE.Vector3Tuple;
const tuple = (p: Vec3): Tuple => [p[0], p[1], p[2]];
const fmt = (n: number, d = 2) => n.toFixed(d);
const v3 = (p: Vec3) => `${fmt(p[0])}, ${fmt(p[1])}, ${fmt(p[2])}`;

/** Whether DebugLabels render (toggle for clean composition checks). */
const LabelsVisible = createContext(true);

/** Debug rendering of the marble hall layout (route, anchors, references). */
export function HallLayoutDebug({ options }: { options: HallDebugOptions }) {
  const layout = getHallLayout();

  const route = useMemo(() => layout.curve.getSpacedPoints(400).map((p) => p.toArray()), [layout]);
  const routeOnFloor = useMemo(() => route.map(([x, , z]): Tuple => [x, HALL.routeFloorY + 0.02, z]), [route]);
  // Vertical ticks every 1/40 of the loop, drawn as one segments line (one draw call).
  const ticks = useMemo(
    () =>
      Array.from({ length: 40 }, (_, i) => {
        const p = layout.curve.getPointAt(i / 40);
        return [[p.x, HALL.routeFloorY + 0.02, p.z] as Tuple, p.toArray()];
      }).flat(),
    [layout],
  );

  return (
    <LabelsVisible.Provider value={options.labels}>
    <group name="HallLayoutDebug">
      {options.reference && <References />}

      {options.path && (
        <>
          <Line points={route} color={COLORS.path} lineWidth={3} />
          <Line points={routeOnFloor} color={COLORS.pathFloor} lineWidth={1.5} dashed dashSize={0.3} gapSize={0.2} />
          <Line points={ticks} segments color={COLORS.pathFloor} lineWidth={1} transparent opacity={0.5} />
        </>
      )}

      {options.controlPoints &&
        PATH_CONTROL_POINTS.map((p, i) => (
          <group key={i} position={tuple(p)}>
            <mesh>
              <sphereGeometry args={[0.12, 12, 8]} />
              <meshBasicMaterial color={COLORS.control} toneMapped={false} />
            </mesh>
            <DebugLabel lines={[String(i)]} position={[0, 0.25, 0]} small />
          </group>
        ))}

      {options.stations && layout.stations.map((s) => <StationMarker key={s.index} station={s} />)}

      {options.views &&
        layout.stations.map((s) => (
          <group key={s.index}>
            <mesh position={tuple(s.view.position)}>
              <sphereGeometry args={[0.18, 16, 10]} />
              <meshBasicMaterial color={COLORS.view} toneMapped={false} />
            </mesh>
            <mesh position={tuple(s.view.target)}>
              <sphereGeometry args={[0.08, 12, 8]} />
              <meshBasicMaterial color={COLORS.view} toneMapped={false} />
            </mesh>
            <Line points={[tuple(s.view.position), tuple(s.view.target)]} color={COLORS.view} lineWidth={1.5} dashed dashSize={0.25} gapSize={0.15} />
          </group>
        ))}

      {options.focus && layout.stations.map((s) => <FocusAnchor key={s.index} station={s} />)}
      {options.volumes && layout.stations.map((s) => <FocusVolume key={s.index} station={s} />)}
      {options.focusPaths && layout.stations.map((s) => <FocusPath key={s.index} station={s} />)}
    </group>
    </LabelsVisible.Provider>
  );
}

/** Focus interaction volume (FOCUS_CONFIG.volume, station space); dim — the live one is drawn by StationInteraction. */
function FocusVolume({ station }: { station: StationLayout }) {
  const { size, center } = FOCUS_CONFIG.volume;
  return (
    <group position={tuple(station.position)} rotation={[0, station.heading, 0]}>
      <mesh position={tuple(center)}>
        <boxGeometry args={[size[0], size[1], size[2]]} />
        <meshBasicMaterial color={COLORS.focus} wireframe transparent opacity={0.35} toneMapped={false} />
      </mesh>
    </group>
  );
}

/** Focus transition (Bézier) from the station's route view point to its focus camera, with the control point. */
function FocusPath({ station }: { station: StationLayout }) {
  const { points, control } = useMemo(() => {
    const start = station.view.position;
    const end = station.focusCamera.position;
    const c = transitionControlPoint(start, end);
    return {
      control: c,
      points: Array.from({ length: 33 }, (_, i): Tuple => {
        const p = bezierPoint(start, c, end, i / 32);
        return [p[0], p[1], p[2]];
      }),
    };
  }, [station]);
  return (
    <group>
      <Line points={points} color={COLORS.focus} lineWidth={2} dashed dashSize={0.15} gapSize={0.08} />
      <mesh position={control}>
        <sphereGeometry args={[0.07, 12, 8]} />
        <meshBasicMaterial color={COLORS.control} toneMapped={false} />
      </mesh>
    </group>
  );
}

/** Listening-mode camera anchor: camera position, look-at (platter centre), sightline. */
function FocusAnchor({ station }: { station: StationLayout }) {
  const { position, target, authoring } = station.focusCamera;
  return (
    <group>
      <mesh position={tuple(position)}>
        <sphereGeometry args={[0.1, 16, 10]} />
        <meshBasicMaterial color={COLORS.focus} toneMapped={false} />
      </mesh>
      <mesh position={tuple(target)}>
        <sphereGeometry args={[0.04, 12, 8]} />
        <meshBasicMaterial color={COLORS.focus} toneMapped={false} />
      </mesh>
      <Line points={[tuple(position), tuple(target)]} color={COLORS.focus} lineWidth={2} />
      <DebugLabel
        small
        position={[position[0], position[1] + 0.2, position[2]]}
        lines={[`focus ${station.debugLabel.slice(0, 2)} · yaw ${authoring.yawOffsetDeg}° · ${fmt(authoring.distance)} m`]}
      />
    </group>
  );
}

/**
 * Provisional station proxy at real size: table (0.457 × 0.635 × 0.457), turntable deck
 * (0.455 × 0.142 × 0.353) and the 12" record footprint on the platter. Forward arrow + label.
 */
function StationMarker({ station }: { station: StationLayout }) {
  const degrees = THREE.MathUtils.radToDeg(station.heading);
  return (
    <group position={tuple(station.position)}>
      <group rotation={[0, station.heading, 0]}>
        <mesh position={[0, 0.635 / 2, 0]}>
          <boxGeometry args={[0.457, 0.635, 0.457]} />
          <meshBasicMaterial color={COLORS.station} wireframe toneMapped={false} />
        </mesh>
        <mesh position={[0, 0.635 + 0.071, 0]}>
          <boxGeometry args={[0.455, 0.142, 0.353]} />
          <meshBasicMaterial color={COLORS.station} wireframe toneMapped={false} />
        </mesh>
        <mesh position={tuple(PLATTER_OFFSET)}>
          <cylinderGeometry args={[0.151, 0.151, 0.004, 48]} />
          <meshBasicMaterial color={COLORS.forward} transparent opacity={0.6} toneMapped={false} />
        </mesh>
        {/* Forward (+Z = station front) */}
        <Line
          points={[
            [0, HALL.stationFocusHeight, 0],
            [0, HALL.stationFocusHeight, 1.4],
          ]}
          color={COLORS.forward}
          lineWidth={3}
        />
        <mesh position={[0, HALL.stationFocusHeight, 1.4]} rotation={[Math.PI / 2, 0, 0]}>
          <coneGeometry args={[0.09, 0.25, 12]} />
          <meshBasicMaterial color={COLORS.forward} toneMapped={false} />
        </mesh>
      </group>
      <DebugLabel
        position={[0, 2.0, 0]}
        lines={[
          station.debugLabel,
          `pos ${v3(station.position)}`,
          `fwd ${v3(station.forward)} · ${fmt(degrees, 1)}°`,
          `progress ${fmt(station.progress, 4)} · ${fmt(station.distanceAlongLoop, 1)} m`,
        ]}
      />
    </group>
  );
}

/**
 * Screen-space text label (canvas texture on a sprite): constant size on screen,
 * drawn on top of the scene. Avoids per-label DOM roots and per-frame DOM updates.
 */
function DebugLabel(props: { lines: string[]; position: Tuple; small?: boolean }) {
  return useContext(LabelsVisible) ? <DebugLabelSprite {...props} /> : null;
}

function DebugLabelSprite({ lines, position, small = false }: { lines: string[]; position: Tuple; small?: boolean }) {
  const text = lines.join("\n");
  const sprite = useMemo(() => {
    const rows = text.split("\n");
    const fontSize = small ? 20 : 24;
    const padding = 8;
    const lineHeight = Math.round(fontSize * 1.3);
    const font = `${fontSize}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (!context) throw new Error("2D canvas unavailable");
    context.font = font;
    canvas.width = Math.ceil(Math.max(...rows.map((r) => context.measureText(r).width)) + padding * 2);
    canvas.height = rows.length * lineHeight + padding * 2;
    context.font = font;
    context.fillStyle = "rgba(15, 15, 16, 0.82)";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.textBaseline = "top";
    rows.forEach((row, i) => {
      context.fillStyle = i === 0 && rows.length > 1 ? "#ffd166" : "#e8e4dc";
      context.fillText(row, padding, padding + i * lineHeight);
    });
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const material = new THREE.SpriteMaterial({ map: texture, depthTest: false, sizeAttenuation: false, toneMapped: false });
    const label = new THREE.Sprite(material);
    const pixel = 0.00055; // world-to-screen scale for sizeAttenuation: false
    label.scale.set(canvas.width * pixel, canvas.height * pixel, 1);
    label.center.set(0.5, 0);
    label.renderOrder = 1000;
    return label;
  }, [text, small]);

  useEffect(
    () => () => {
      sprite.material.map?.dispose();
      sprite.material.dispose();
    },
    [sprite],
  );

  return <primitive object={sprite} position={position} />;
}

function ring(radius: number, y: number, segments = 128): Tuple[] {
  return Array.from({ length: segments + 1 }, (_, i) => {
    const a = (i / segments) * Math.PI * 2;
    return [Math.cos(a) * radius, y, Math.sin(a) * radius];
  });
}

/** Room centre, loop-radius range (on the route floor), eye height and floor levels. */
function References() {
  const [minR, maxR] = HALL.loopRadiusRange;
  const floorY = HALL.routeFloorY + 0.01;
  const platformY = HALL.platformFloorY + 0.01;
  const rings = useMemo(
    () => ({
      min: ring(minR, floorY),
      nominal: ring(HALL.initialLoopRadius, floorY),
      max: ring(maxR, floorY),
      eye: ring(HALL.initialLoopRadius, HALL.routeFloorY + HALL.cameraEyeHeight),
      walkway: ring(24, HALL.walkwayFloorY + 0.01),
    }),
    [minR, maxR, floorY],
  );
  const centre = tuple(HALL.roomCenter);
  return (
    <group>
      <Line points={[centre, [centre[0], centre[1] + 3, centre[2]]]} color={COLORS.reference} lineWidth={2} />
      <Line points={[[centre[0] - 1, platformY, centre[2]], [centre[0] + 1, platformY, centre[2]]]} color={COLORS.reference} lineWidth={2} />
      <Line points={[[centre[0], platformY, centre[2] - 1], [centre[0], platformY, centre[2] + 1]]} color={COLORS.reference} lineWidth={2} />
      <DebugLabel
        small
        position={[centre[0], centre[1] + 3.1, centre[2]]}
        lines={[`room centre (${v3(centre)}) · platform y ${HALL.platformFloorY}`]}
      />
      <Line points={rings.min} color={COLORS.radius} lineWidth={1} dashed dashSize={0.4} gapSize={0.3} />
      <Line points={rings.nominal} color={COLORS.radius} lineWidth={1.5} />
      <Line points={rings.max} color={COLORS.radius} lineWidth={1} dashed dashSize={0.4} gapSize={0.3} />
      <Line points={rings.eye} color={COLORS.radius} lineWidth={1} transparent opacity={0.35} />
      <Line points={rings.walkway} color={COLORS.station} lineWidth={1} dashed dashSize={0.4} gapSize={0.3} transparent opacity={0.6} />
      <DebugLabel small position={[0, floorY, -maxR - 0.4]} lines={[`route r ${minR} / ${HALL.initialLoopRadius} / ${maxR} m · sunken ring y ${HALL.routeFloorY}`]} />
      <DebugLabel small position={[0, HALL.walkwayFloorY, -24.4]} lines={[`outer walkway y ${HALL.walkwayFloorY} (stations)`]} />
    </group>
  );
}

interface PathPreviewCameraProps {
  preview: CameraPreview;
  /** Its target is kept in sync so returning to orbit doesn't jump. */
  controls: RefObject<ComponentRef<typeof OrbitControls> | null>;
}

/**
 * Development-only static camera placement along the route (composition check).
 * Sets the camera once per preview change — no per-frame updates, no scroll.
 */
export function PathPreviewCamera({ preview, controls }: PathPreviewCameraProps) {
  const get = useThree((state) => state.get);

  useEffect(() => {
    if (preview.mode === "orbit") return;
    const layout = getHallLayout();
    const { camera } = get();
    const position = new THREE.Vector3();
    const target = new THREE.Vector3();

    if (preview.mode === "station") {
      const station = layout.stations[preview.station];
      const anchor = preview.view === "focus" ? station.focusCamera : station.view;
      position.set(...anchor.position);
      target.set(...anchor.target);
    } else if (preview.mode === "distance") {
      const station = layout.stations[preview.station];
      const anchor = preview.axis === "focus" ? station.focusCamera : station.view;
      target.set(...anchor.target);
      position.set(...anchor.position).sub(target).normalize().multiplyScalar(preview.distance).add(target);
    } else {
      const u = wrapProgress(preview.progress);
      layout.curve.getPointAt(u, position);
      if (preview.look === "ahead") layout.curve.getPointAt(wrapProgress(u + 0.02), target);
      else target.set(...layout.stations[nearestStationIndex(u, layout)].view.target);
    }

    camera.position.copy(position);
    camera.lookAt(target);
    controls.current?.target.copy(target);
  }, [preview, get, controls]);

  return null;
}
