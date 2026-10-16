"use client";

import type { FocusExitEvent } from "@/state/focus";

/** Describes the DOM event behind a focus-exit request (development diagnostics; cheap, no retention). */
export function describeInputEvent(event: Event): FocusExitEvent {
  const target = event.target instanceof Element ? `${event.target.tagName.toLowerCase()}${event.target.className ? `.${String(event.target.className).split(" ")[0]}` : ""}` : undefined;
  return {
    type: event.type,
    key: event instanceof KeyboardEvent ? event.key : undefined,
    isTrusted: event.isTrusted,
    target,
    detail: event instanceof MouseEvent ? event.detail : undefined,
  };
}
