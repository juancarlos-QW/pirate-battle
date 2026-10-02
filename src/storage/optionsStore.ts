import { useSyncExternalStore } from 'react';
import { DEFAULT_OPTIONS, playerOptionsSchema, type PlayerOptions } from '../config/options.ts';
import { readJson, STORAGE_KEYS, writeJson } from './storage.ts';

type Listener = () => void;

let current: PlayerOptions = readJson(STORAGE_KEYS.options, playerOptionsSchema) ?? DEFAULT_OPTIONS;
const listeners = new Set<Listener>();

export const optionsStore = {
  get(): PlayerOptions {
    return current;
  },
  /** Persists already validated options. Returns `false` if they could not be stored. */
  save(next: PlayerOptions): boolean {
    current = next;
    const stored = writeJson(STORAGE_KEYS.options, next);
    listeners.forEach((listener) => listener());
    return stored;
  },
  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

export function useOptions(): PlayerOptions {
  return useSyncExternalStore(optionsStore.subscribe, optionsStore.get, optionsStore.get);
}
