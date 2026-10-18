"use client";

import { useEffect } from "react";

/** The loader's instruments in its order, as favicon frames (scripts/build-favicons.mjs → public/icons/favicon). */
const FAVICON_FRAMES = ["trumpet", "guitar", "shaker", "djembe", "conga"].map((name) => `/icons/favicon/${name}.png`);
/** The loader's calm cadence (its reduced-motion icon step); background tabs are throttled to about 1 s anyway. */
const STEP_MS = 1200;

/**
 * Cycles the tab icon through the instruments, as the loader does. The metadata declares the first frame, so the icon
 * is right before this runs, without JavaScript and with reduced motion (which keeps it still).
 */
export function AnimatedFavicon() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const links = Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel="icon"]'));
    if (links.length === 0) return;
    // Warm the cache so each swap is instant.
    for (const src of FAVICON_FRAMES) new Image().src = src;
    let frame = 0;
    const timer = window.setInterval(() => {
      frame = (frame + 1) % FAVICON_FRAMES.length;
      for (const link of links) link.href = FAVICON_FRAMES[frame];
    }, STEP_MS);
    return () => {
      window.clearInterval(timer);
      for (const link of links) link.href = FAVICON_FRAMES[0];
    };
  }, []);
  return null;
}
