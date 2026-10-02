import type { z } from 'zod';

const PREFIX = 'pirate-battle:';

/** Namespaced, versioned keys for everything persisted in localStorage. */
export const STORAGE_KEYS = {
  options: `${PREFIX}options:v1`,
  lastResult: `${PREFIX}last-result:v1`,
  player: `${PREFIX}player:v1`,
} as const;

function getStorage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

/** Reads and validates a JSON value. Missing, corrupted or outdated data yields `null`. */
export function readJson<T>(key: string, schema: z.ZodType<T>): T | null {
  const storage = getStorage();
  if (!storage) return null;
  try {
    const raw = storage.getItem(key);
    if (raw === null) return null;
    const parsed = schema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** Writes a JSON value. Returns `false` when storage is unavailable or full. */
export function writeJson(key: string, value: unknown): boolean {
  const storage = getStorage();
  if (!storage) return false;
  try {
    storage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function removeKey(key: string): void {
  try {
    getStorage()?.removeItem(key);
  } catch {
    // Storage unavailable: nothing to remove.
  }
}
