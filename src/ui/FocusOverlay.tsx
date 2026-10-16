"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { useAudioSnapshot } from "@/audio/browserAudio";
import type { AudioEngine } from "@/audio/engine";
import { ERAS, getEraByIndex, getHeroTrack, getTrack } from "@/data/eras";
import { describeTrack } from "@/data/trackDisplay";
import type { FocusController } from "@/state/focus";
import { describeInputEvent } from "@/input/exitDiagnostics";
import { releaseFocusAfterPointer } from "@/input/pointerActivation";
import type { RecordChangeController } from "@/stations/recordChange";
import { captionStatus, eraYears, loopPosition } from "@/ui/captionModel";
import { ERA_UI_ACCENT } from "@/ui/eraAccent";

/**
 * The focused station's archive caption (docs/FINAL_UI.md §6): a museum label for the record that is
 * MOUNTED on the deck — the era's selection, which switches only when the record change commits the new
 * record (docs/RECORD_CHANGE.md §4), so the caption never names a record that is not on the platter.
 * Wording per content type comes from describeTrack(): tradition references read "<people> musical
 * tradition · Listening reference" with no artist and no release date; artist references are labelled as
 * listening references. No player controls: the turntable is the interface; PREVIOUS / NEXT ask the
 * record-change controller for a physical change (queued per its one-slot policy), Close asks focus to exit
 * (deferred until the deck is stable during a change).
 */
export function FocusOverlay({ focus, audio, records }: { focus: FocusController; audio: AudioEngine; records: RecordChangeController }) {
  const { mode, station } = useSyncExternalStore(focus.subscribe, focus.getSnapshot, focus.getSnapshot);
  const snapshot = useAudioSnapshot(audio);
  const record = useSyncExternalStore(records.subscribe, records.getSnapshot, records.getSnapshot);
  const visible = mode === "FOCUS_TRANSITION_IN" || mode === "FOCUS";
  const closeRef = useRef<HTMLButtonElement>(null);

  // Keyboard users land on Close once the station is in focus (Tab reaches Previous / Next).
  useEffect(() => {
    if (mode === "FOCUS") closeRef.current?.focus({ preventScroll: true });
  }, [mode]);

  if (station < 0) return null;
  const era = getEraByIndex(station);
  // The focused station is always the active era: the audio snapshot's selection is its mounted record.
  const mountedId = snapshot.activeEraId === era.id ? snapshot.selectedTrackId : audio.selection.get(era.id);
  const track = getTrack(era.id, mountedId) ?? getHeroTrack(era.id);
  const position = era.tracks.findIndex((t) => t.id === track.id) + 1;
  const count = era.tracks.length;
  const display = describeTrack(track);
  const meta = [display.date, display.genre].filter(Boolean).join(" · ");
  const dna = track.musicalDNA?.length ? track.musicalDNA.join(" · ") : null;
  const canChange = mode === "FOCUS" && !record.exitPending && count > 1;
  const status = captionStatus(record, snapshot, era.id, track);

  const step = (direction: "previous" | "next") => (event: React.MouseEvent<HTMLButtonElement>) => {
    records.requestStep(direction);
    releaseFocusAfterPointer(event);
  };

  return (
    <aside
      className={`ui-caption${visible ? " is-visible" : ""}${record.changing ? " is-changing" : ""}`}
      style={{ "--era-accent": ERA_UI_ACCENT[era.id] } as React.CSSProperties}
      aria-label={`Listening station ${era.number}, ${era.title}`}
      inert={!visible}
    >
      <p className="ui-micro ui-caption__era">
        <span>{loopPosition(era.index, ERAS.length)}</span>
        <span>{era.title}</span>
        <span>{eraYears(era)}</span>
      </p>

      <div key={track.id} className="ui-caption__record">
        <p className="ui-micro ui-caption__catalogue">
          {display.catalogueNumber && <span className="ui-caption__number">{display.catalogueNumber}</span>}
          <span className="ui-caption__position" aria-label={`record ${position} of ${count}`}>
            {loopPosition(position - 1, count)}
          </span>
        </p>
        <h2 className="ui-caption__title">{display.title}</h2>
        <p className="ui-caption__byline">{display.byline}</p>
        {display.kicker && <p className="ui-caption__kicker">{display.kicker}</p>}
        {meta && <p className="ui-micro ui-caption__meta">{meta}</p>}
        {track.historicalNote && <p className="ui-caption__note">{track.historicalNote}</p>}
        {dna && (
          <p className="ui-micro ui-caption__dna">
            <span className="ui-caption__dna-label">Musical DNA</span> {dna}
          </p>
        )}
      </div>

      {/* One concise announcement per mounted record (the caption itself is not a live region). */}
      <p className="ui-visually-hidden" aria-live="polite">
        {visible ? `On the deck: ${display.catalogueNumber ?? ""} ${display.title}, ${display.byline}. Record ${position} of ${count}.` : ""}
      </p>

      <p className="ui-micro ui-caption__status" aria-live="polite">
        {status}
      </p>

      <div className="ui-caption__controls" role="group" aria-label="Record controls">
        <button
          type="button"
          className={`ui-button${record.changing ? " is-busy" : ""}`}
          data-queued={record.queued === "previous" || undefined}
          disabled={!canChange}
          aria-label="Previous record"
          onClick={step("previous")}
        >
          <span aria-hidden="true">←</span> Previous
        </button>
        <button
          type="button"
          className={`ui-button${record.changing ? " is-busy" : ""}`}
          data-queued={record.queued === "next" || undefined}
          disabled={!canChange}
          aria-label="Next record"
          onClick={step("next")}
        >
          Next <span aria-hidden="true">→</span>
        </button>
        <button
          ref={closeRef}
          type="button"
          className="ui-button ui-button--quiet ui-caption__close"
          aria-label={record.changing ? "Close after the record change" : "Close and return to the archive"}
          onClick={(event) => {
            focus.requestExit("close-button", describeInputEvent(event.nativeEvent));
            releaseFocusAfterPointer(event);
          }}
        >
          Close
        </button>
      </div>
      <p className="ui-micro ui-caption__keys" aria-hidden="true">
        ← → change record · Esc close · M sound
      </p>
    </aside>
  );
}

