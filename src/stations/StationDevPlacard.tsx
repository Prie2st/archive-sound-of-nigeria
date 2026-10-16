"use client";

import { useEffect, useMemo } from "react";
import * as THREE from "three";
import type { Era } from "@/data/types";

/** Placard size and placement in station space (+Z = station front): behind and above the table. */
const PLACARD = { width: 0.9, height: 0.55, position: [0, 1.75, -0.9] as const };

/**
 * DEVELOPMENT-ONLY era text (number, title, dates) so stations can be identified in
 * the hall. Not the final era typography / art direction.
 */
export function StationDevPlacard({ era }: { era: Era }) {
  const texture = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 900;
    canvas.height = 550;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2D canvas unavailable");
    ctx.fillStyle = "#1d1d1f";
    ctx.textBaseline = "top";
    ctx.font = "600 210px ui-sans-serif, system-ui, sans-serif";
    ctx.fillText(era.number, 30, 10);
    ctx.font = "600 110px ui-sans-serif, system-ui, sans-serif";
    ctx.fillText(era.title, 34, 250);
    ctx.font = "400 64px ui-sans-serif, system-ui, sans-serif";
    ctx.fillText(era.dateLabel, 38, 400);
    const map = new THREE.CanvasTexture(canvas);
    map.colorSpace = THREE.SRGBColorSpace;
    map.anisotropy = 4;
    return map;
  }, [era.number, era.title, era.dateLabel]);

  useEffect(() => () => texture.dispose(), [texture]);

  return (
    <mesh position={[...PLACARD.position]} name={`DevPlacard:${era.id}`}>
      <planeGeometry args={[PLACARD.width, PLACARD.height]} />
      <meshBasicMaterial map={texture} transparent toneMapped={false} depthWrite={false} />
    </mesh>
  );
}
