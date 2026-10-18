"use client";

import { useProgress } from "@react-three/drei";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { startArchiveSound } from "@/audio/browserAudio";
import type { AudioEngine } from "@/audio/engine";
import { CHAPTERS, type ChapterMeta } from "@/content/homeStory";
import { releaseFocusAfterPointer } from "@/input/pointerActivation";
import {
  Afrobeat,
  Afrobeats,
  City,
  Digital,
  Essence,
  Explosion,
  Festac,
  Finale,
  Global,
  Highlife,
  Independence,
  Kennis,
  King1937,
  Lineage,
  LocalSound,
  Modernities,
  Naija,
  OneDance,
  Opening,
  Record1922,
  Systems,
  War1967,
  Youth,
} from "./chapters";
import { Loader } from "./Loader";
import "./prologue.css";
import "./home.css";

/** Loading must look finished for this long before the story opens (loaders start in waves). */
const SETTLE_MS = 450;
/** How often the scene-readiness probe is read while loading (cheap: a few map lookups). */
const PROBE_MS = 250;
/**
 * The visitor is never trapped. If every file has finished but the scene probe has not confirmed the stations
 * within this time (e.g. the page draws no frames), the story opens anyway; after MAX_WAIT_MS it opens whatever
 * the loading state. Entering early only means a station may still be finishing — the museum works either way.
 */
const SCENE_GRACE_MS = 6000;
const MAX_WAIT_MS = 30000;
/** Frames may not run (hidden / backgrounded page): the two-frame wait falls back to a timer. */
const FRAME_FALLBACK_MS = 400;
/** The display face gets this long to arrive before the loader shows its words in the fallback. */
const FONT_WAIT_MS = 2500;
/** Loader lift + opening type rise (CSS: --pro-open). After it the museum underneath may stop drawing. */
const OPEN_MS = 1500;
const OPEN_MS_REDUCED = 350;
/** Prologue → museum (CSS: --pro-leave). */
const LEAVE_MS = 950;
const LEAVE_MS_REDUCED = 250;

const HTML_CLASS = "archive-prologue";
const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

interface PrologueProps {
  audio: AudioEngine;
  /** A warm return keeps the existing scene/context and skips the first-visit loading sequence. */
  returningHome?: boolean;
  /** Whether the scene itself is complete (hall loaded, every station showing its record art). Polled. */
  isSceneReady: () => boolean;
  /** ENTER ARCHIVE pressed: the museum takes over (HUD, input, rendering). */
  onEnter: () => void;
  /** The exit has finished; the prologue can unmount. */
  onExited: () => void;
  /** True while the prologue fully covers the museum (it may stop drawing frames meanwhile). */
  onCoverChange: (covered: boolean) => void;
}

/**
 * The pre-museum prologue (docs/PROLOGUE.md): a deliberate loading moment, then a scrollable editorial story of
 * Nigerian music 1900 → 2026, with ENTER ARCHIVE fixed and available throughout. Native document scroll; motion
 * is CSS (IntersectionObserver toggles classes; nothing runs per frame). ENTER ARCHIVE is the one user gesture that
 * unlocks THE AudioContext through the existing engine (startArchiveSound).
 */
export function Prologue({ audio, returningHome = false, isSceneReady, onEnter, onExited, onCoverChange }: PrologueProps) {
  const archiveReady = useArchiveReady(isSceneReady);
  const fontReady = useDisplayFontReady();
  const reduced = useReducedMotion();
  // The loader counts to 100 once the archive is ready, plays its outro, then the story opens.
  const [loaderDone, setLoaderDone] = useState(false);
  const finishLoader = useCallback(() => setLoaderDone(true), []);
  const revealed = returningHome || loaderDone;
  const [settled, setSettled] = useState(returningHome);
  const [leaving, setLeaving] = useState(false);
  const [chapter, setChapter] = useState<ChapterMeta>(CHAPTERS[0]);
  const rootRef = useRef<HTMLDivElement>(null);
  const leavingRef = useRef(false);
  const phase = leaving ? "leaving" : settled ? "story" : revealed ? "opening" : "loading";

  // Document scroll belongs to the story while it is open (the museum keeps html / body locked otherwise).
  useEffect(() => {
    if (!revealed) return;
    const html = document.documentElement;
    const restoration = history.scrollRestoration;
    history.scrollRestoration = "manual";
    window.scrollTo(0, 0);
    html.classList.add(HTML_CLASS);
    if (returningHome) rootRef.current?.querySelector<HTMLElement>(".pro-story")?.focus({ preventScroll: true });
    return () => {
      html.classList.remove(HTML_CLASS);
      history.scrollRestoration = restoration;
      window.scrollTo(0, 0);
    };
  }, [revealed, returningHome]);

  // Opening finished → the story is the whole screen; the museum underneath may pause drawing.
  useEffect(() => {
    if (!revealed || settled) return;
    const timer = window.setTimeout(() => {
      setSettled(true);
      if (!leavingRef.current) onCoverChange(true);
    }, reduced ? OPEN_MS_REDUCED : OPEN_MS);
    return () => window.clearTimeout(timer);
  }, [revealed, settled, reduced, onCoverChange]);

  // Reveals, the chapter indicator, and the GLOBAL step sequence — all IntersectionObserver.
  useEffect(() => {
    const root = rootRef.current;
    if (!revealed || !root) return;
    const observers: IntersectionObserver[] = [];

    const reveal = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.add("is-in");
          reveal.unobserve(entry.target);
        }
      },
      { rootMargin: "0px 0px -9% 0px", threshold: 0.12 },
    );
    root.querySelectorAll("[data-reveal]").forEach((element) => reveal.observe(element));
    observers.push(reveal);

    const byId = new Map(CHAPTERS.map((meta) => [meta.id, meta]));
    const chapters = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const meta = byId.get((entry.target as HTMLElement).dataset.chapter as ChapterMeta["id"]);
          if (meta) setChapter(meta);
        }
      },
      { rootMargin: "-50% 0px -50% 0px" },
    );
    root.querySelectorAll("[data-chapter]").forEach((element) => chapters.observe(element));
    observers.push(chapters);

    const steps = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const step = Number((entry.target as HTMLElement).dataset.step);
          const container = entry.target.closest<HTMLElement>("[data-steps]");
          if (!container) continue;
          // Crossing the centre line downward reveals the step; scrolling back above it withdraws it again.
          if (entry.isIntersecting) container.dataset.steps = String(Math.max(Number(container.dataset.steps), step));
          else if (entry.boundingClientRect.top > 0) container.dataset.steps = String(Math.min(Number(container.dataset.steps), step - 1));
        }
      },
      { rootMargin: "-50% 0px -50% 0px" },
    );
    root.querySelectorAll("[data-step]").forEach((element) => steps.observe(element));
    observers.push(steps);

    return () => observers.forEach((observer) => observer.disconnect());
  }, [revealed]);

  useEffect(() => {
    if (!leaving) return;
    const timer = window.setTimeout(onExited, reduced ? LEAVE_MS_REDUCED : LEAVE_MS);
    return () => window.clearTimeout(timer);
  }, [leaving, reduced, onExited]);

  const enter = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      if (leavingRef.current) return; // one entry only
      leavingRef.current = true;
      startArchiveSound(audio); // the real gesture; failure is fine — the sound control offers ENABLE SOUND
      releaseFocusAfterPointer(event);
      setLeaving(true);
      onCoverChange(false);
      onEnter();
    },
    [audio, onEnter, onCoverChange],
  );

  return (
    <div ref={rootRef} className={`pro pro--${phase}${reduced ? " pro--reduced" : ""}`} data-tone={chapter.tone} aria-busy={!revealed}>
      <button type="button" className="pro-enter" onClick={enter} disabled={leaving || !revealed} aria-label="Enter archive — opens the 3D museum with sound">
        <span className="pro-enter__pill">
          <span className="pro-enter__text">Enter archive</span>
          <span className="pro-enter__arrow" aria-hidden="true">
            →
          </span>
        </span>
      </button>

      <div className="pro-blur" aria-hidden="true" />

      <article className="pro-story" tabIndex={-1} aria-label="The Sound of Nigeria, 1900 to 2026 — the story before the archive">
        <Opening />
        <Systems />
        <Record1922 />
        <City />
        <King1937 />
        <Highlife />
        <Independence />
        <War1967 />
        <Explosion />
        <Afrobeat />
        <Modernities />
        <Festac />
        <LocalSound />
        <Youth />
        <Kennis />
        <Naija />
        <Digital />
        <Afrobeats />
        <OneDance />
        <Essence />
        <Global />
        <Lineage />
        <Finale />
      </article>

      {!returningHome && <Loader ready={archiveReady && fontReady} active={phase === "loading"} fontReady={fontReady} reduced={reduced} onDone={finishLoader} />}
    </div>
  );
}

/**
 * Readiness, unchanged from the previous intro (docs/FINAL_UI.md §1): every file three's loading manager requested
 * has finished (held for SETTLE_MS, loaders start in waves), the scene probe confirms the hall and all eight
 * stations are presenting, then two frames so the first render is behind the loader — with grace / maximum
 * fallbacks so nobody waits forever.
 */
function useArchiveReady(isSceneReady: () => boolean): boolean {
  const { active, loaded, total } = useProgress();
  const [ready, setReady] = useState(false);
  const [sceneReady, setSceneReady] = useState(false);
  const [patienceUsed, setPatienceUsed] = useState(false);
  const filesDone = !active && loaded >= total;
  const loadingDone = (filesDone && sceneReady) || patienceUsed;

  useEffect(() => {
    if (patienceUsed || !filesDone || sceneReady) return;
    const timer = window.setTimeout(() => setPatienceUsed(true), SCENE_GRACE_MS);
    return () => window.clearTimeout(timer);
  }, [filesDone, sceneReady, patienceUsed]);
  useEffect(() => {
    const timer = window.setTimeout(() => setPatienceUsed(true), MAX_WAIT_MS);
    return () => window.clearTimeout(timer);
  }, []);
  useEffect(() => {
    if (sceneReady) return;
    const timer = window.setInterval(() => {
      if (isSceneReady()) setSceneReady(true);
    }, PROBE_MS);
    return () => window.clearInterval(timer);
  }, [isSceneReady, sceneReady]);
  useEffect(() => {
    if (!loadingDone || ready) return;
    let frame = 0;
    let fallback = 0;
    const timer = window.setTimeout(() => {
      fallback = window.setTimeout(() => setReady(true), FRAME_FALLBACK_MS);
      frame = requestAnimationFrame(() => (frame = requestAnimationFrame(() => setReady(true))));
    }, SETTLE_MS);
    return () => {
      window.clearTimeout(timer);
      window.clearTimeout(fallback);
      cancelAnimationFrame(frame);
    };
  }, [loadingDone, ready]);
  return ready;
}

/** OJUJU is loaded (or given up on after FONT_WAIT_MS — the fallback face keeps the same metrics roughly). */
function useDisplayFontReady(): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      setReady(true);
    };
    const family = getComputedStyle(document.documentElement).getPropertyValue("--font-ojuju").trim();
    const timer = window.setTimeout(finish, FONT_WAIT_MS);
    if (family && document.fonts) {
      Promise.all([document.fonts.load(`300 64px ${family}`), document.fonts.load(`700 64px ${family}`)]).then(finish, finish);
    } else finish();
    return () => {
      done = true;
      window.clearTimeout(timer);
    };
  }, []);
  return ready;
}

const subscribeReducedMotion = (onChange: () => void) => {
  const query = window.matchMedia(REDUCED_MOTION);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
};
const useReducedMotion = () =>
  useSyncExternalStore(
    subscribeReducedMotion,
    () => window.matchMedia(REDUCED_MOTION).matches,
    () => false,
  );
