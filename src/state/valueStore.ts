"use client";

import { useSyncExternalStore } from "react";

/**
 * Minimal external store for one discrete value (e.g. the active era). Written from the
 * render loop or input handlers; only components that read it with `useStoreValue`
 * re-render, and only when the value actually changes.
 */
export interface ValueStore<T> {
  get: () => T;
  set: (value: T) => void;
  subscribe: (listener: () => void) => () => void;
}

export function createValueStore<T>(initial: T): ValueStore<T> {
  let value = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => value,
    set: (next) => {
      if (Object.is(next, value)) return;
      value = next;
      for (const listener of listeners) listener();
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export const useStoreValue = <T,>(store: ValueStore<T>): T => useSyncExternalStore(store.subscribe, store.get, store.get);
