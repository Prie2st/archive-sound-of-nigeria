"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";

/**
 * The loading screen (docs/PROLOGUE.md §2, Figma "ARCHIVE — Intro / Home", node 46:39).
 *
 * Cream screen, the ARCHIVE wordmark top-left, an instrument icon cycling in the centre and a large counter
 * bottom-right. As the counter runs 00 → 100 an ink panel rises from the bottom; whatever it covers turns cream
 * (a second copy of the same layout inside the panel). At 100 the counter and icon fade, THE SOUND OF NIGERIA
 * arrives letter by letter on the full ink screen, and the loader hands over (`onDone`) to the shutter lift.
 *
 * Smoothness: the museum loads behind this screen and blocks the main thread for seconds at a time, so no motion
 * here may depend on it. Everything moves on the compositor:
 *   - the panel: Web Animations on `transform` (the panel slides up while its content slides down by the same
 *     amount, so the content stays put);
 *   - the count: each digit is an odometer strip (0–9) moved by a stepped `transform` animation whose change
 *     times are computed from the panel's own easing curve — the number counts on, locked to the panel, even
 *     while JavaScript is stalled;
 *   - icons and title letters: CSS opacity animations.
 * Two runs, each started for panel and digits together:
 *   phase A  0 → HOLD_AT over A_MS, easing into a gentle hold while the archive is still loading
 *   phase B  from wherever A is → 1 once the archive is ready, never finishing before MIN_TOTAL_MS
 * JavaScript only starts the runs, notices the end and updates the accessible value.
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

/** Where the count waits while the archive is still loading. */
const HOLD_AT = 0.94;
const A_MS = 4200;
const A_EASING: Bezier = [0.3, 0.15, 0.2, 1];
/** The count never completes faster than this, even from cache (the reference video counts for ~3.4 s). */
const MIN_TOTAL_MS = 2800;
/** Phase B speed: about this long for the full range (shorter for what is left), never under B_MIN_MS. */
const B_FULL_MS = 2200;
const B_MIN_MS = 650;
const B_EASING: Bezier = [0.35, 0.3, 0.25, 1];
/** Odometer strips: hundreds (blank / 1), tens and ones (0–9). One digit per 1em row. */
const STRIPS = [[" ", "1"], [..."0123456789"], [..."0123456789"]] as const;
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
  const rootRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const [stage, setStage] = useState<Stage>("counting");
  const readyRef = useRef(ready);
  const onDoneRef = useRef(onDone);
  useEffect(() => {
    readyRef.current = ready;
    onDoneRef.current = onDone;
  }, [ready, onDone]);

  // The count: composited panel animations + a per-frame reader that prints the digits.
  useEffect(() => {
    const root = rootRef.current;
    const panel = root?.querySelector<HTMLElement>(".pro-loader__panel");
    const inner = root?.querySelector<HTMLElement>(".pro-loader__face--dark");
    if (!root || !panel || !inner) return;
    const strips = [...root.querySelectorAll<HTMLElement>("[data-place]")];
    const start = performance.now();

    /** One run: panel, its content and every digit strip from `from` to `to` (fractions of the screen covered). */
    const slide = (from: number, to: number, duration: number, bezier: Bezier) => {
      const curve = cubicBezier(bezier);
      const options: KeyframeAnimationOptions = { duration, fill: "forwards" };
      const shift = (p: number) => `translate3d(0, ${((1 - p) * 100).toFixed(3)}%, 0)`;
      const back = (p: number) => `translate3d(0, ${((p - 1) * 100).toFixed(3)}%, 0)`;
      const easing = `cubic-bezier(${bezier.join(", ")})`;
      const outer = panel.animate([{ transform: shift(from) }, { transform: shift(to) }], { ...options, easing });
      inner.animate([{ transform: back(from) }, { transform: back(to) }], { ...options, easing });
      // The time (0–1) at which the shown count reaches `count`: invert the same curve the panel follows.
      const reach = (count: number) => {
        let lo = 0;
        let hi = 1;
        for (let i = 0; i < 30; i++) {
          const mid = (lo + hi) / 2;
          if (from + (to - from) * curve(mid) >= count / 100 - 1e-9) hi = mid;
          else lo = mid;
        }
        return hi;
      };
      const first = Math.floor(from * 100 + 1e-9);
      const last = Math.floor(to * 100 + 1e-9);
      for (const strip of strips) {
        const place = Number(strip.dataset.place);
        const row = (count: number) => `translate3d(0, ${-digitAt(count, place)}em, 0)`;
        const frames: Keyframe[] = [{ offset: 0, transform: row(first), easing: "steps(1, end)" }];
        for (let count = first + 1; count <= last; count++) {
          if (digitAt(count, place) !== digitAt(count - 1, place)) frames.push({ offset: reach(count), transform: row(count), easing: "steps(1, end)" });
        }
        frames.push({ offset: 1, transform: row(last) });
        strip.animate(frames, options);
      }
      return { from, to, curve, animation: outer, startedAt: performance.now(), duration };
    };
    const progressOf = (run: ReturnType<typeof slide>) => {
      const timing = run.animation.effect?.getComputedTiming();
      const t = run.animation.playState === "finished" ? 1 : Math.min(1, Number(timing?.localTime ?? 0) / run.duration);
      return run.from + (run.to - run.from) * run.curve(t);
    };

    const phaseA = slide(0, HOLD_AT, A_MS, A_EASING);
    let phaseB: ReturnType<typeof slide> | null = null;
    let printed = -1;
    let finished = false;
    let frame = 0;
    let timer = 0;

    const print = (value: number) => {
      if (value === printed) return;
      printed = value;
      barRef.current?.setAttribute("aria-valuenow", String(value));
    };

    const tick = () => {
      if (finished) return;
      const now = performance.now();
      if (!phaseB && readyRef.current) {
        const from = progressOf(phaseA); // continue exactly where the panel is (the digits continue from floor)
        const remaining = Math.max(B_MIN_MS, (1 - from) * B_FULL_MS, MIN_TOTAL_MS - (now - start));
        phaseB = slide(from, 1, remaining, B_EASING);
      }
      const done = phaseB !== null && (phaseB.animation.playState === "finished" || now - phaseB.startedAt > phaseB.duration + 400);
      print(done ? 100 : Math.min(99, Math.floor(progressOf(phaseB ?? phaseA) * 100)));
      if (done) {
        finished = true;
        setStage("complete");
        return;
      }
      // Frames when visible; a slow timer when hidden (no frames), so a background page still finishes.
      if (document.hidden) timer = window.setTimeout(tick, 250);
      else frame = requestAnimationFrame(tick);
    };
    tick();
    const onVisibility = () => {
      window.clearTimeout(timer);
      cancelAnimationFrame(frame);
      tick();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      finished = true;
      document.removeEventListener("visibilitychange", onVisibility);
      window.clearTimeout(timer);
      cancelAnimationFrame(frame);
    };
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
    <div ref={rootRef} className={`pro-loader pro-loader--${stage}${fontReady ? " is-type" : ""}`} aria-hidden={!active}>
      <LoaderFace tone="light" />
      <div className="pro-loader__panel">
        <LoaderFace tone="dark" />
      </div>
      <div ref={barRef} className="ui-visually-hidden" role="progressbar" aria-label="Loading archive" aria-valuemin={0} aria-valuemax={100} aria-valuenow={0} />
    </div>
  );
}

/** One copy of the layout. The dark copy rides inside the ink panel. */
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
      {/* Fixed-width odometer cells (OJUJU has no tabular figures): hundreds, tens, ones. */}
      <p className="pro-loader__count">
        {STRIPS.map((rows, place) => (
          <span key={place} className="pro-loader__digit">
            <span className="pro-loader__strip" data-place={place}>
              {rows.map((digit, i) => (
                <span key={i}>{digit === " " ? " " : digit}</span>
              ))}
            </span>
          </span>
        ))}
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

type Bezier = readonly [number, number, number, number];

/** The digit shown at `place` (0 hundreds, 1 tens, 2 ones) for a count of 0–100 — its row in that strip. */
const digitAt = (count: number, place: number): number => (place === 0 ? (count >= 100 ? 1 : 0) : place === 1 ? Math.floor(count / 10) % 10 : count % 10);

/** CSS cubic-bezier as a function of time (0–1) → progress, solved the way browsers do. */
function cubicBezier([x1, y1, x2, y2]: Bezier): (t: number) => number {
  const at = (a: number, b: number, s: number) => 3 * a * s * (1 - s) ** 2 + 3 * b * s * s * (1 - s) + s ** 3;
  return (t: number) => {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    let lo = 0;
    let hi = 1;
    for (let i = 0; i < 40; i++) {
      const mid = (lo + hi) / 2;
      if (at(x1, x2, mid) < t) lo = mid;
      else hi = mid;
    }
    return at(y1, y2, (lo + hi) / 2);
  };
}
