"use client";

import { useEffect } from "react";
import type { RecordChangeController, RecordDirection } from "@/stations/recordChange";

const isEditable = (target: EventTarget | null) =>
  target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));

/**
 * Record keys (docs/RECORD_CHANGE.md §5): ArrowLeft = PREVIOUS, ArrowRight = NEXT — only while fully
 * focused on the ACTIVE station (the controller decides; travel never uses Left / Right). A held key's
 * auto-repeat is ignored; deliberate presses during a change fill the single queue slot.
 */
export function useRecordInput(records: RecordChangeController) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey || isEditable(event.target)) return;
      const direction: RecordDirection | null = event.key === "ArrowRight" ? "next" : event.key === "ArrowLeft" ? "previous" : null;
      if (!direction || !records.inputOpen()) return;
      event.preventDefault();
      if (!event.repeat) records.requestStep(direction);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [records]);
}
