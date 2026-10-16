/**
 * Which record each era's station holds (CLAUDE.md §4, docs/AUDIO_ENGINE.md §7).
 *
 * Every era starts on its hero track and keeps its selection when the visitor leaves — the
 * state the future record-changing machine will update. A selection can only ever be a track
 * of that era's own playlist: `select` rejects anything else, so another era's record is
 * structurally unreachable from here (not just hidden in the UI).
 *
 * Plain TypeScript.
 */
import { createInitialEraAudioState, getTrack } from "../data/eras.ts";
import { ERA_IDS, type EraAudioState, type EraId } from "../data/types.ts";

export class TrackSelection {
  private readonly states = new Map<EraId, EraAudioState>();

  constructor() {
    for (const eraId of ERA_IDS) this.states.set(eraId, createInitialEraAudioState(eraId));
  }

  /** The era's selected track id (its hero track until something else is selected). */
  get(eraId: EraId): string {
    return this.require(eraId).selectedTrackId;
  }

  /** Copy of the era's listening state. */
  state(eraId: EraId): EraAudioState {
    return { ...this.require(eraId) };
  }

  /** Selects a track of THIS era. Returns false (and changes nothing) for any other track. */
  select(eraId: EraId, trackId: string): boolean {
    if (!getTrack(eraId, trackId)) return false;
    this.require(eraId).selectedTrackId = trackId;
    return true;
  }

  /** Records that the visitor reached the era. Returns true on the first visit. */
  markVisited(eraId: EraId): boolean {
    const state = this.require(eraId);
    if (state.visited) return false;
    state.visited = true;
    return true;
  }

  private require(eraId: EraId): EraAudioState {
    const state = this.states.get(eraId);
    if (!state) throw new Error(`Unknown era "${eraId}"`);
    return state;
  }
}
