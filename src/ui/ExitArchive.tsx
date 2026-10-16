"use client";

import { useSyncExternalStore } from "react";
import type { RecordChangeController } from "@/stations/recordChange";

/** Keep the deck running until a record change has landed before covering the scene. */
export function ExitArchive({ records, onExit }: { records: RecordChangeController; onExit: () => void }) {
  const { changing } = useSyncExternalStore(records.subscribe, records.getSnapshot, records.getSnapshot);
  return (
    <button
      type="button"
      className="ui-button ui-button--quiet ui-exit"
      onClick={onExit}
      disabled={changing}
      aria-label="Exit archive and return home"
      title={changing ? "The record is changing. Exit archive will be available when it finishes." : "Return to the home story"}
    >
      <span aria-hidden="true">←</span> Exit archive
    </button>
  );
}
