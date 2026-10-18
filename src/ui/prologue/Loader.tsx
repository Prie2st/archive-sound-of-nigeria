"use client";

import { useProgress } from "@react-three/drei";
import { useEffect, useRef, useState, type CSSProperties } from "react";

/**
 * The loading screen (docs/PROLOGUE.md §2, Figma "ARCHIVE — Intro / Home", node 46:39).
 *
 * Cream screen, the ARCHIVE wordmark top-left, an instrument icon cycling in the centre and a large counter
 * bottom-right. As the counter runs 00 → 100 an ink panel rises from the bottom; whatever it covers turns cream
 * (a second, clipped copy of the same layout). At 100 the counter and icon fade, THE SOUND OF NIGERIA arrives
 * letter by letter on the full ink screen, and the loader hands over (`onDone`) to the existing shutter lift.
 *
 * The counter follows real loading (three's file progress) but is smoothed, never runs backwards, creeps while
 * nothing reports, holds below 100 until the archive is ready and takes at least MIN_COUNT_S to complete.
 * It is driven by a timer writing straight to the DOM (no per-frame React state); a timer — not
 * requestAnimationFrame — so a hidden / background page still finishes.
 */

/** The instrument icons that cycle in the centre (design/icons, served from /icons/loader). Native sizes kept. */
const ICONS = [
  { src: "/icons/loader/trumpet.svg", width: 96, height: 66 },
  { src: "/icons/loader/guitar.svg", width: 95, height: 95 },
  { src: "/icons/loader/shaker.svg", width: 83, height: 83 },
  { src: "/icons/loader/djembe.svg", width: 61, height: 80 },
  { src: "/icons/loader/conga.svg", width: 54, height: 80 },
] as const;

const TITLE_LINES = ["The sound", "of Nigeria"] as const;
/** Each letter with its place in the reveal order (spaces: −1). */
const TITLE_LETTERS = TITLE_LINES.map((line, n) => {
  const before = TITLE_LINES.slice(0, n).join("").replace(/\s/g, "").length;
  let order = before;
  return [...line].map((char) => ({ char, order: char === " " ? -1 : order++ }));
});
const TITLE_LETTER_COUNT = TITLE_LINES.join("").replace(/\s/g, "").length;

const TICK_MS = 30;
/** The count never completes faster than this, even from cache (the video's count runs ~3.4 s). */
const MIN_COUNT_S = 2.6;
/** Ceiling while the archive is not ready yet. */
const HOLD_AT = 94;
/** How quickly the shown count follows its target (time constant, s). */
const FOLLOW_S = 0.28;
/** Outro (ms): 100 holds, counter + icon fade, letters arrive, then hand over. */
const HOLD_MS = 260;
const FADE_MS = 420;
const LETTER_STAGGER_MS = 55;
const LETTER_MS = 520;
const TITLE_HOLD_MS = 380;
const REDUCED = { hold: 120, fade: 200, stagger: 0, letter: 300, titleHold: 500 };

type Stage = "counting" | "complete" | "title";

interface LoaderProps {
  /** Archive loaded and the display face available: the count may finish. */
  ready: boolean;
  /** The loader is still the visible layer (aria-hidden once the story opens). */
  active: boolean;
  fontReady: boolean;
  reduced: boolean;
  /** The outro has finished: open the story. */
  onDone: () => void;
}

export function Loader({ ready, active, fontReady, reduced, onDone }: LoaderProps) {
  const { loaded, total } = useProgress();
  const rootRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const [stage, setStage] = useState<Stage>("counting");
  // Latest inputs for the counting timer (read inside it; never re-created per frame).
  const input = useRef({ ready, fraction: 0 });
  const onDoneRef = useRef(onDone);
  useEffect(() => {
    input.current = { ready, fraction: total > 0 ? Math.min(1, loaded / total) : 0 };
    onDoneRef.current = onDone;
  }, [ready, loaded, total, onDone]);

  // The count: smoothed toward real progress, written to the DOM.
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const counts = root.querySelectorAll<HTMLElement>("[data-count]");
    const start = performance.now();
    let last = start;
    let shown = 0;
    let printed = -1;
    const timer = window.setInterval(() => {
      const now = performance.now();
      const dt = Math.min(1, (now - last) / 1000);
      last = now;
      const t = (now - start) / 1000;
      const { ready: done, fraction } = input.current;
      const creep = 88 * (1 - Math.exp(-t / 7)); // keeps moving while nothing reports
      const real = done ? 100 : Math.min(HOLD_AT, Math.max(fraction * HOLD_AT, creep));
      const pace = 100 * easeInOut(Math.min(1, t / MIN_COUNT_S)); // never faster than the minimum duration
      const target = Math.min(real, pace);
      shown = Math.max(shown, shown + (target - shown) * (1 - Math.exp(-dt / FOLLOW_S)));
      if (done && pace >= 100 && target - shown < 0.6) shown = 100;
      root.style.setProperty("--p", (shown / 100).toFixed(4));
      const value = Math.floor(shown);
      if (value !== printed) {
        printed = value;
        const text = String(value).padStart(2, "0");
        counts.forEach((element) => (element.textContent = text));
        barRef.current?.setAttribute("aria-valuenow", String(value));
      }
      if (shown >= 100) {
        window.clearInterval(timer);
        setStage("complete");
      }
    }, TICK_MS);
    return () => window.clearInterval(timer);
  }, []);

  // The outro: 100 holds, the counter fades, the title arrives letter by letter, then the story opens.
  useEffect(() => {
    if (stage === "counting") return;
    const motion = reduced ? REDUCED : { hold: HOLD_MS, fade: FADE_MS, stagger: LETTER_STAGGER_MS, letter: LETTER_MS, titleHold: TITLE_HOLD_MS };
    if (stage === "complete") {
      const timer = window.setTimeout(() => setStage("title"), motion.hold + motion.fade);
      return () => window.clearTimeout(timer);
    }
    const timer = window.setTimeout(() => onDoneRef.current(), motion.stagger * (TITLE_LETTER_COUNT - 1) + motion.letter + motion.titleHold);
    return () => window.clearTimeout(timer);
  }, [stage, reduced]);

  return (
    <div
      ref={rootRef}
      className={`pro-loader pro-loader--${stage}${fontReady ? " is-type" : ""}`}
      aria-hidden={!active}
      style={{ "--p": 0 } as CSSProperties}
    >
      <LoaderFace tone="light" />
      <LoaderFace tone="dark" />
      <div ref={barRef} className="ui-visually-hidden" role="progressbar" aria-label="Loading archive" aria-valuemin={0} aria-valuemax={100} aria-valuenow={0} />
    </div>
  );
}

/** One copy of the layout. The dark copy sits on the ink panel and is clipped to it. */
function LoaderFace({ tone }: { tone: "light" | "dark" }) {
  return (
    <div className={`pro-loader__face pro-loader__face--${tone}`} aria-hidden="true">
      <span className="pro-loader__mark" />
      <span className="pro-loader__icons">
        {ICONS.map((icon, i) => (
          <span
            key={icon.src}
            className="pro-loader__icon"
            style={{ "--i": i, "--n": ICONS.length, width: icon.width, height: icon.height, maskImage: `url("${icon.src}")`, WebkitMaskImage: `url("${icon.src}")` } as CSSProperties}
          />
        ))}
      </span>
      <p className="pro-loader__count" data-count>
        00
      </p>
      <p className="pro-loader__title">
        {TITLE_LETTERS.map((line, n) => (
          <span key={n} className="pro-loader__line">
            {line.map(({ char, order }, i) =>
              order < 0 ? (
                <span key={i}> </span>
              ) : (
                <span key={i} className="pro-loader__letter" style={{ "--l": order } as CSSProperties}>
                  {char}
                </span>
              ),
            )}
          </span>
        ))}
      </p>
    </div>
  );
}

const easeInOut = (x: number) => (x < 0.5 ? 2 * x * x : 1 - (-2 * x + 2) ** 2 / 2);
