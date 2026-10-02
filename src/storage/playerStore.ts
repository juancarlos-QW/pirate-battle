import { z } from 'zod';
import { readJson, STORAGE_KEYS, writeJson } from './storage.ts';

const playerSchema = z.object({ id: z.string().min(8) });
const lastResultSchema = z.object({ matchId: z.string() });

export function createId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

let cachedPlayerId: string | null = null;

/**
 * Anonymous, stable identifier of this browser's player. It ties the match history and the
 * "you" marker on the ranking to the player even if the captain name changes.
 */
export function getPlayerId(): string {
  if (cachedPlayerId) return cachedPlayerId;
  const stored = readJson(STORAGE_KEYS.player, playerSchema);
  cachedPlayerId = stored?.id ?? createId();
  if (!stored) writeJson(STORAGE_KEYS.player, { id: cachedPlayerId });
  return cachedPlayerId;
}

/** Id of the most recent match, highlighted in the match history. */
export function getLastMatchId(): string | null {
  return readJson(STORAGE_KEYS.lastResult, lastResultSchema)?.matchId ?? null;
}

export function setLastMatchId(matchId: string): void {
  writeJson(STORAGE_KEYS.lastResult, { matchId });
}
