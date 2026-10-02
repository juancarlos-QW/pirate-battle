import { DEFAULT_GAME_CONFIG, type GameConfig } from './gameConfig.ts';
import type { PlayerOptions } from './options.ts';

/** Immutable configuration snapshot used by a single match. */
export type MatchConfig = GameConfig;

/** The subset of a match configuration that identifies a ranking bracket. */
export interface MatchSettings {
  readonly sessionTime: number;
  readonly spawnInterval: number;
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    for (const key of Object.keys(value)) deepFreeze((value as Record<string, unknown>)[key]);
    Object.freeze(value);
  }
  return value;
}

/**
 * Builds the configuration snapshot for a new match. Later option changes do not affect a match
 * that has already started, because the snapshot is a frozen deep copy.
 */
export function createMatchConfig(
  options: Pick<PlayerOptions, 'sessionTime' | 'spawnInterval'>,
  base: GameConfig = DEFAULT_GAME_CONFIG,
): MatchConfig {
  const copy = structuredClone(base);
  return deepFreeze({
    ...copy,
    match: { ...copy.match, duration: options.sessionTime },
    spawn: { ...copy.spawn, interval: options.spawnInterval },
  });
}

export function getMatchSettings(config: MatchConfig): MatchSettings {
  return { sessionTime: config.match.duration, spawnInterval: config.spawn.interval };
}
