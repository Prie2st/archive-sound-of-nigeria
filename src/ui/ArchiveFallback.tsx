"use client";

import { Component, type ReactNode } from "react";

/** True when the browser can create a WebGL context (checked once, client-side, before the canvas mounts). */
export function supportsWebGL(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return Boolean(canvas.getContext("webgl2") ?? canvas.getContext("webgl"));
  } catch {
    return false;
  }
}

/** Shown instead of the museum when the 3D archive cannot run (docs/FINAL_UI.md §12). */
export function ArchiveFallback() {
  return (
    <section className="ui-intro ui-intro--fallback" aria-labelledby="fallback-title">
      <div className="ui-intro__body">
        <p className="ui-micro ui-intro__kicker">Archive</p>
        <h1 id="fallback-title" className="ui-intro__title">
          The Sound
          <br />
          of Nigeria
        </h1>
        <p className="ui-intro__years">1900 — 2026</p>
        <p className="ui-intro__premise">Your browser cannot display the 3D archive.</p>
        <p className="ui-intro__note">Try a current desktop browser with hardware acceleration enabled.</p>
      </div>
    </section>
  );
}

/**
 * Catches a failure while creating / rendering the 3D archive (e.g. a WebGL context that cannot be created)
 * and shows the fallback instead of a blank page. The error is still reported to the console (and to the
 * development overlay) — it is never swallowed silently.
 */
export class ArchiveErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.error("[archive] the 3D archive could not start:", error);
  }

  render() {
    return this.state.failed ? <ArchiveFallback /> : this.props.children;
  }
}
