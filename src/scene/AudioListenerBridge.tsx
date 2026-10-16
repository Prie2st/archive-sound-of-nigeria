"use client";

import { useFrame } from "@react-three/fiber";
import { useState } from "react";
import * as THREE from "three";
import type { AudioEngine, AudioFrame } from "@/audio/engine";
import type { FocusController } from "@/state/focus";
import type { TravelController } from "@/state/travel";

/**
 * Publishes the listener to the audio engine every frame (docs/SPATIAL_AUDIO.md §2). The pose is
 * read from the camera the CameraRig has just placed — no second camera calculation — together
 * with the travel loop position and the focus blend. One reused frame object, no React state,
 * no allocations; the engine owns every Web Audio node.
 */
class ListenerBridge {
  private readonly frame: AudioFrame = { position: [0, 0, 0], forward: [0, 0, -1], up: [0, 1, 0], loopProgress: 0, focusAmount: 0, focusStation: -1 };
  private readonly direction = new THREE.Vector3();

  publish(audio: AudioEngine, camera: THREE.Camera, travel: TravelController, focus: FocusController) {
    const frame = this.frame;
    camera.position.toArray(frame.position);
    this.direction.set(0, 0, -1).applyQuaternion(camera.quaternion).toArray(frame.forward);
    this.direction.set(0, 1, 0).applyQuaternion(camera.quaternion).toArray(frame.up);
    frame.loopProgress = travel.loopProgress;
    frame.focusAmount = focus.mode === "TRAVEL" ? 0 : focus.easedProgress;
    frame.focusStation = focus.station;
    audio.updateFrame(frame);
  }
}

/** Mount AFTER the CameraRig so it reads this frame's camera pose (useFrame runs in mount order). */
export function AudioListenerBridge({ audio, travel, focus }: { audio: AudioEngine; travel: TravelController; focus: FocusController }) {
  const [bridge] = useState(() => new ListenerBridge());
  useFrame(({ camera }) => bridge.publish(audio, camera, travel, focus));
  return null;
}
