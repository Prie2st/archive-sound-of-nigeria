"use client";

import { useThree, type ThreeEvent } from "@react-three/fiber";
import { useEffect, useSyncExternalStore } from "react";
import type { StationLayout } from "@/data/hallLayout";
import type { FocusController } from "@/state/focus";
import type { TravelController } from "@/state/travel";

interface StationInteractionProps {
  /** Station index (must be the ACTIVE station — the only one this is mounted for). */
  index: number;
  station: StationLayout;
  focus: FocusController;
  travel: TravelController;
  /** Development: show the volume as a wireframe. */
  debug?: boolean;
}

/**
 * Invisible click / tap volume around the ACTIVE station's installation (table, turntable,
 * sleeve; FOCUS_CONFIG.volume, in station space). No pixel-perfect picking of the turntable.
 * A pointer that moved more than FOCUS_CONFIG.maxTapMovement between down and up is a drag
 * (travel), not a tap. Desktop: the cursor becomes a pointer while the station is focusable.
 */
export function StationInteraction({ index, station, focus, travel, debug = false }: StationInteractionProps) {
  const get = useThree((state) => state.get);
  const { mode } = useSyncExternalStore(focus.subscribe, focus.getSnapshot, focus.getSnapshot);
  const setCursor = (pointer: boolean) => {
    get().gl.domElement.style.cursor = pointer ? "pointer" : "";
  };

  // Never leave a stale pointer cursor: reset on mode changes and when the active station changes.
  useEffect(
    () => () => {
      get().gl.domElement.style.cursor = "";
    },
    [mode, index, get],
  );

  const { size, center } = focus.config.volume;
  const [x, y, z] = station.position;
  return (
    <group position={[x, y, z]} rotation={[0, station.heading, 0]}>
      <mesh
        name={`FocusVolume:${station.eraId}`}
        position={[center[0], center[1], center[2]]}
        onClick={(event: ThreeEvent<MouseEvent>) => {
          if (event.delta > focus.config.maxTapMovement) return; // a drag, not a tap
          event.stopPropagation();
          if (focus.requestFocus(index, travel.activeStation, travel)) setCursor(false);
        }}
        onPointerOver={() => setCursor(focus.canFocus(index, travel.activeStation))}
        onPointerOut={() => setCursor(false)}
      >
        <boxGeometry args={[size[0], size[1], size[2]]} />
        <meshBasicMaterial visible={debug} wireframe color="#7fd1ff" toneMapped={false} />
      </mesh>
    </group>
  );
}
