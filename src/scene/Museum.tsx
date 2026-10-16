"use client";

import dynamic from "next/dynamic";

/** WebGL is client-only: never server-render the canvas. */
const MuseumCanvas = dynamic(() => import("@/scene/MuseumCanvas"), { ssr: false });

export function Museum() {
  return <MuseumCanvas />;
}
