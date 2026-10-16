"use client";

import { useEffect } from "react";
import type { TravelController } from "@/state/travel";

const isEditable = (target: EventTarget | null) =>
  target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));

/**
 * Travel input (CLAUDE.md §7): every source feeds velocity impulses into the SAME
 * TravelController — no input moves the camera directly.
 *   wheel            → impulse per (normalized, clamped) delta; native scrolling prevented
 *   touch / pen drag → impulse per vertical move (finger up = forward); pointer captured
 *   ArrowDown/PageDown, ArrowUp/PageUp → one rate-limited impulse per press
 * Mouse drags are left alone (station clicks / dev orbit later). Horizontal gestures are
 * not handled yet (record changing belongs to listening mode).
 */
export function useTravelInput(travel: TravelController, element: HTMLElement | null, enabled: boolean) {
  useEffect(() => {
    if (!element || !enabled) return;

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      travel.addWheel(event.deltaY, event.deltaMode, window.innerHeight);
    };

    let pointerId: number | null = null;
    let lastY = 0;
    const onPointerDown = (event: PointerEvent) => {
      if (event.pointerType === "mouse" || pointerId !== null) return;
      pointerId = event.pointerId;
      lastY = event.clientY;
      try {
        element.setPointerCapture(event.pointerId);
      } catch {
        // pointer already gone (e.g. lifted before the handler ran): the drag still works without capture
      }
    };
    const onPointerMove = (event: PointerEvent) => {
      if (event.pointerId !== pointerId) return;
      travel.addDrag(event.clientY - lastY);
      lastY = event.clientY;
    };
    const onPointerEnd = (event: PointerEvent) => {
      if (event.pointerId !== pointerId) return;
      if (element.hasPointerCapture(event.pointerId)) element.releasePointerCapture(event.pointerId);
      pointerId = null; // velocity keeps coasting: the release speed is already in it
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey || isEditable(event.target)) return;
      const direction = event.key === "ArrowDown" || event.key === "PageDown" ? 1 : event.key === "ArrowUp" || event.key === "PageUp" ? -1 : 0;
      if (!direction) return;
      event.preventDefault();
      travel.addKey(direction, performance.now() / 1000);
    };

    element.addEventListener("wheel", onWheel, { passive: false });
    element.addEventListener("pointerdown", onPointerDown);
    element.addEventListener("pointermove", onPointerMove);
    element.addEventListener("pointerup", onPointerEnd);
    element.addEventListener("pointercancel", onPointerEnd);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      element.removeEventListener("wheel", onWheel);
      element.removeEventListener("pointerdown", onPointerDown);
      element.removeEventListener("pointermove", onPointerMove);
      element.removeEventListener("pointerup", onPointerEnd);
      element.removeEventListener("pointercancel", onPointerEnd);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [travel, element, enabled]);
}
