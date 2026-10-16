"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { getHallLayout, wrapProgress } from "@/data/hallLayout";
import type { EraId } from "@/data/types";
import { useFocusInput } from "@/input/useFocusInput";
import { useTravelInput } from "@/input/useTravelInput";
import { bezierPoint, transitionControlPoint, type FocusController } from "@/state/focus";
import { selectActiveStation, strongestStation, type TravelController } from "@/state/travel";

interface CameraRigProps {
  travel: TravelController;
  focus: FocusController;
  /** Called only when the active era changes (semantic state; never per frame). */
  onActiveEraChange: (era: EraId) => void;
}

const UP = new THREE.Vector3(0, 1, 0);
const ORIGIN = new THREE.Vector3();
const Z_AXIS = new THREE.Vector3(0, 0, 1);
const DEG = Math.PI / 180;

/**
 * Production camera (docs/CAMERA_RIG.md, docs/FOCUS_MODE.md). Owns the camera while mounted:
 *   TRAVEL: input → TravelController (velocity, absolute progress) → loop progress →
 *     position on THE route curve (hallLayout.ts) → orientation blended between the route
 *     direction and the nearest station's route look-at (by station influence) → FOV.
 *   FOCUS_TRANSITION_IN / FOCUS / FOCUS_TRANSITION_OUT: the travel pose is frozen exactly as it
 *     was when focus began; the camera follows a Bézier from it to the station's authored
 *     focus camera, turning toward the record, driven by ONE scalar (FocusController.progress).
 * Everything runs in useFrame with reused objects; React only hears about semantic changes.
 * Never mount it together with OrbitControls / the dev preview camera.
 */
export function CameraRig({ travel, focus, onActiveEraChange }: CameraRigProps) {
  const layout = getHallLayout();
  const element = useThree((state) => state.gl.domElement);
  useTravelInput(travel, element, true);
  useFocusInput(focus, travel);

  const scratch = useMemo(
    () => ({
      position: new THREE.Vector3(),
      near: new THREE.Vector3(),
      far: new THREE.Vector3(),
      routeDir: new THREE.Vector3(),
      stationDir: new THREE.Vector3(),
      forward: new THREE.Vector3(),
      matrix: new THREE.Matrix4(),
      routeQuat: new THREE.Quaternion(),
      stationQuat: new THREE.Quaternion(),
      targetQuat: new THREE.Quaternion(),
      orientation: new THREE.Quaternion(),
      roll: new THREE.Quaternion(),
      travelQuat: new THREE.Quaternion(),
      lookQuat: new THREE.Quaternion(),
      focusPosition: new THREE.Vector3(),
      lookDir: new THREE.Vector3(),
      start: [0, 0, 0] as [number, number, number],
      control: [0, 0, 0] as [number, number, number],
      point: [0, 0, 0] as [number, number, number],
      targets: layout.stations.map((s) => new THREE.Vector3(...s.view.target)),
      focusTargets: layout.stations.map((s) => new THREE.Vector3(...s.focusCamera.target)),
      strongest: { index: -1, influence: 0 },
    }),
    [layout],
  );
  const rig = useRef({ initialized: false, activeStation: -1, fov: 0, rollDeg: 0, yaw: 0 });
  const get = useThree((state) => state.get);

  // If the rig unmounts mid-focus (dev switch to INSPECT), return to travel immediately.
  useEffect(() => () => focus.reset(travel), [focus, travel]);

  // Development: expose the controllers and camera for automated tests in the browser.
  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
    const devWindow = window as Window & {
      __archiveTravel?: { travel: TravelController; focus: FocusController; camera: THREE.Camera; gl: THREE.WebGLRenderer };
    };
    devWindow.__archiveTravel = { travel, focus, camera: get().camera, gl: get().gl };
    return () => {
      delete devWindow.__archiveTravel;
    };
  }, [travel, focus, get]);

  useFrame((state, delta) => {
    const camera = state.camera as THREE.PerspectiveCamera;
    const c = travel.config;
    const r = rig.current;
    const s = scratch;
    const dt = Math.min(delta, 0.1); // a long frame (hidden tab) never launches the visitor or skips a transition

    // 0. Focus transition (one scalar). Completing an exit unlocks travel at the saved position.
    focus.step(dt, travel);
    const travelling = focus.mode === "TRAVEL";

    // 1. Station influence at the current position, then physics (no-op while focus locks travel).
    travel.step(dt, strongestStation(travel.loopProgress, layout.stations, s.strongest).influence);
    const u = travel.loopProgress;
    const { index: station, influence } = strongestStation(u, layout.stations, s.strongest);

    // 2. Travel position: the authored route (its eye height included), arc-length parametrised.
    layout.curve.getPointAt(u, s.position);

    if (travelling) {
      // 3. Orientation: route direction (smoothed look-ahead) blended toward the station look-at.
      layout.curve.getPointAt(wrapProgress(u + c.lookAheadNear / layout.length), s.near);
      layout.curve.getPointAt(wrapProgress(u + c.lookAheadFar / layout.length), s.far);
      s.routeDir.subVectors(s.near, s.position).normalize();
      s.routeDir.add(s.far.sub(s.position).normalize()).normalize();
      s.routeQuat.setFromRotationMatrix(s.matrix.lookAt(ORIGIN, s.routeDir, UP));
      s.targetQuat.copy(s.routeQuat);
      if (station >= 0 && influence > 0) {
        s.stationDir.subVectors(s.targets[station], s.position).normalize();
        s.stationQuat.setFromRotationMatrix(s.matrix.lookAt(ORIGIN, s.stationDir, UP));
        s.targetQuat.slerp(s.stationQuat, influence * c.stationLookWeight);
      }
      if (!r.initialized) s.orientation.copy(s.targetQuat);
      else {
        const speed = Math.min(1, Math.abs(travel.velocity) / c.maxVelocity);
        s.orientation.slerp(s.targetQuat, 1 - Math.exp(-c.orientationResponse * (1 + c.orientationSpeedBoost * speed) * dt));
      }

      // 4. Banking: a slight roll into turns, from the smoothed yaw rate (≤ bankingMaxDeg).
      s.forward.set(0, 0, -1).applyQuaternion(s.orientation);
      const yaw = Math.atan2(s.forward.x, s.forward.z);
      let yawStep = yaw - r.yaw;
      if (yawStep > Math.PI) yawStep -= 2 * Math.PI;
      else if (yawStep < -Math.PI) yawStep += 2 * Math.PI;
      r.yaw = yaw;
      const yawRateDeg = r.initialized && dt > 0 ? yawStep / dt / DEG : 0;
      const targetRoll = Math.max(-c.bankingMaxDeg, Math.min(c.bankingMaxDeg, yawRateDeg * c.bankingGain));
      r.rollDeg += (targetRoll - r.rollDeg) * (1 - Math.exp(-c.bankingResponse * dt));
      s.roll.setFromAxisAngle(Z_AXIS, r.rollDeg * DEG);

      // 5. FOV: slightly tighter on station approach, eased.
      const targetFov = c.travelFov + (c.approachFov - c.travelFov) * influence;
      r.fov = r.initialized ? r.fov + (targetFov - r.fov) * (1 - Math.exp(-c.fovResponse * dt)) : targetFov;
    }
    // While focused the travel pose (orientation, roll, FOV) stays frozen as it was when focus began.
    s.travelQuat.copy(s.orientation).multiply(s.roll);

    let fov = r.fov;
    if (!travelling && focus.station >= 0) {
      // 6. Focus: Bézier from the frozen travel position to the authored focus camera; the view
      //    turns toward the record (look-at from the moving point) as the camera arrives.
      const t = focus.easedProgress;
      const anchor = layout.stations[focus.station].focusCamera;
      s.position.toArray(s.start);
      transitionControlPoint(s.start, anchor.position, focus.config, s.control);
      bezierPoint(s.start, s.control, anchor.position, t, s.point);
      s.focusPosition.set(s.point[0], s.point[1], s.point[2]);
      s.lookDir.subVectors(s.focusTargets[focus.station], s.focusPosition).normalize();
      s.lookQuat.setFromRotationMatrix(s.matrix.lookAt(ORIGIN, s.lookDir, UP));
      camera.position.copy(s.focusPosition);
      camera.quaternion.copy(s.travelQuat).slerp(s.lookQuat, t);
      fov = r.fov + (focus.config.focusFov - r.fov) * t;
    } else {
      camera.position.copy(s.position);
      camera.quaternion.copy(s.travelQuat);
    }
    if (Math.abs(camera.fov - fov) > 1e-4) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }

    // 7. Active era: nearest station along the loop, with hysteresis; React hears changes only.
    //    Travel progress is frozen during focus, so the focused station stays ACTIVE (no LOD change).
    const active = selectActiveStation(u, r.activeStation, layout.stations, c.activeEraHysteresis);
    if (active !== r.activeStation) {
      r.activeStation = active;
      onActiveEraChange(layout.stations[active].eraId);
    }
    travel.setTelemetry(influence, station, active);
    r.initialized = true;
  });

  return null;
}
