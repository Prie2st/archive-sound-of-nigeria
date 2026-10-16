/**
 * Keyboard focus after DOM controls (docs/FOCUS_MODE.md §8).
 *
 * The museum's keys (Enter = focus the station, Escape = leave, ← / → = records, M = mute) listen on
 * the window and deliberately ignore events aimed at buttons — a focused button owns its own Enter /
 * Space. So when a POINTER (mouse, touch, pen) activates one of the temporary DOM controls, the
 * button would keep keyboard focus and the next Enter would press it again instead of reaching the
 * museum. After a pointer activation the control therefore hands focus back to the page.
 *
 * Keyboard activations are left alone: a user who tabbed to the control and pressed Enter / Space
 * keeps focus on it (the browser reports such clicks with `detail === 0`). The control stays in the
 * tab order; nothing is disabled or globally intercepted.
 *
 * Plain TypeScript (no DOM types needed), so Node tests can drive it.
 */

/** The parts of a click event this needs. */
export interface ActivationEvent {
  /** Click count: ≥ 1 for pointer clicks / taps, 0 for keyboard (Enter / Space) and programmatic clicks. */
  detail: number;
  currentTarget: { blur(): void } | null;
}

/** True when the click came from a pointer (mouse, touch, pen) rather than the keyboard. */
export const isPointerActivation = (event: Pick<ActivationEvent, "detail">): boolean => event.detail > 0;

/** After a pointer activation, return keyboard focus to the museum; keyboard activations keep focus. */
export function releaseFocusAfterPointer(event: ActivationEvent) {
  if (isPointerActivation(event)) event.currentTarget?.blur();
}
