"use client";

import { useEffect } from "react";
import { describeInputEvent } from "@/input/exitDiagnostics";
import type { FocusController } from "@/state/focus";
import type { TravelController } from "@/state/travel";

/** Elements whose own Enter / Escape handling must win (the Close button, dev panel fields). */
const ownsKey = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT", "BUTTON", "A", "SUMMARY"].includes(target.tagName));

/**
 * Focus keys: Enter focuses the ACTIVE station (when one is available), Escape leaves focus.
 * Pointer / tap focus is handled by the station's interaction volume (StationInteraction).
 */
export function useFocusInput(focus: FocusController, travel: TravelController) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      if (event.key === "Escape") {
        if (focus.requestExit("escape-key", describeInputEvent(event))) event.preventDefault();
      } else if (event.key === "Enter" && !ownsKey(event.target)) {
        if (focus.requestFocus(travel.activeStation, travel.activeStation, travel)) event.preventDefault();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [focus, travel]);
}
