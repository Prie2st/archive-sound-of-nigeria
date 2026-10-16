"use client";

import { useState, useSyncExternalStore } from "react";
import { ERAS, getEra } from "@/data/eras";
import type { EraId } from "@/data/types";
import type { FocusController } from "@/state/focus";
import { useStoreValue, type ValueStore } from "@/state/valueStore";
import { eraYears, loopPosition } from "@/ui/captionModel";
import { ERA_UI_ACCENT } from "@/ui/eraAccent";

const COARSE_POINTER = "(pointer: coarse)";
const subscribeCoarse = (onChange: () => void) => {
  const query = window.matchMedia(COARSE_POINTER);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
};
const isCoarse = () => window.matchMedia(COARSE_POINTER).matches;

/**
 * Production travel HUD (docs/FINAL_UI.md §4): the current era, its place around the loop, and two quiet
 * hints. Everything comes from existing semantic state, never from the camera:
 *   - the era is the ACTIVE-era store written by the CameraRig (nearest station anchor + hysteresis) —
 *     the same value the stations' LOD and the audio follow; no equal 1/8 sectors;
 *   - "listen" appears only when the focus controller would accept a focus request for that station.
 * Re-renders only when the active era or the focus mode changes. Decorative regions never take pointer
 * events, so wheel / touch travel on the canvas is never blocked.
 */
export function TravelHud({ activeEra, focus }: { activeEra: ValueStore<EraId>; focus: FocusController }) {
  const eraId = useStoreValue(activeEra);
  const { mode } = useSyncExternalStore(focus.subscribe, focus.getSnapshot, focus.getSnapshot);
  const coarse = useSyncExternalStore(subscribeCoarse, isCoarse, () => false);
  const era = getEra(eraId);
  const travelling = mode === "TRAVEL";
  const canListen = travelling && focus.canFocus(era.index, era.index);

  // The travel hint retires once the visitor has moved to another era (they have understood travel).
  const [startEra] = useState(eraId);
  const [travelled, setTravelled] = useState(false);
  if (!travelled && eraId !== startEra) setTravelled(true); // adjust-on-change during render (no effect)

  return (
    <div className={`ui-hud${travelling ? "" : " is-focused"}`} style={{ "--era-accent": ERA_UI_ACCENT[eraId] } as React.CSSProperties}>
      <header className="ui-hud__brand">
        <p className="ui-micro ui-hud__brand-mark">Archive</p>
        <p className="ui-hud__brand-name">The Sound of Nigeria</p>
      </header>

      <div className="ui-hud__era" aria-hidden={!travelling}>
        <div key={eraId} className="ui-hud__era-inner">
          <p className="ui-micro">
            <span className="ui-hud__era-count">{loopPosition(era.index, ERAS.length)}</span>
            <span className="ui-hud__stage">{era.thesisStage}</span>
          </p>
          <p className="ui-hud__era-name">{era.title}</p>
          <p className="ui-hud__era-years">{eraYears(era)}</p>
        </div>
      </div>

      {/* Polite announcement of the era for screen readers (once per era change). */}
      <p className="ui-visually-hidden" aria-live="polite">
        {travelling ? `Era ${era.number} of ${ERAS.length}: ${era.title}, ${era.startYear} to ${era.endYear}.` : ""}
      </p>

      <ol className="ui-hud__loop" aria-label={`Era ${era.number} of ${ERAS.length} around the archive`}>
        {ERAS.map((item) => (
          <li key={item.id} className={item.id === eraId ? "is-current" : undefined} aria-current={item.id === eraId ? "step" : undefined}>
            <span className="ui-visually-hidden">
              {item.number} {item.title}
            </span>
          </li>
        ))}
      </ol>

      <div className="ui-hud__hints" aria-hidden={!travelling}>
        <p className={`ui-micro ui-hud__hint${canListen ? " is-on" : ""}`}>{coarse ? "Tap the turntable to listen" : "Enter or click the turntable to listen"}</p>
        <p className={`ui-micro ui-hud__hint ui-hud__hint--travel${travelled ? " is-retired" : ""}`}>{coarse ? "Swipe to travel" : "Scroll to travel"}</p>
      </div>
    </div>
  );
}
