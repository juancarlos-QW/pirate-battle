import { describe, expect, it } from 'vitest';
import { DEFAULT_GAME_CONFIG } from './gameConfig.ts';
import { createMatchConfig, getMatchSettings } from './matchConfig.ts';

describe('createMatchConfig', () => {
  it('applies the player options to a snapshot', () => {
    const config = createMatchConfig({ sessionTime: 90, spawnInterval: 2.5 });
    expect(config.match.duration).toBe(90);
    expect(config.spawn.interval).toBe(2.5);
    expect(getMatchSettings(config)).toEqual({ sessionTime: 90, spawnInterval: 2.5 });
  });

  it('is deeply frozen and does not share references with the defaults', () => {
    const config = createMatchConfig({ sessionTime: 90, spawnInterval: 2.5 });
    expect(Object.isFrozen(config.player.frontCannon)).toBe(true);
    expect(config.player).not.toBe(DEFAULT_GAME_CONFIG.player);
    expect(DEFAULT_GAME_CONFIG.match.duration).toBe(120);
  });
});
