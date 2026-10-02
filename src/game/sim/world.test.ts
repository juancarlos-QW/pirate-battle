import { describe, expect, it } from 'vitest';
import { DEFAULT_GAME_CONFIG, type GameConfig } from '../../config/gameConfig.ts';
import { createMatchConfig } from '../../config/matchConfig.ts';
import type { ArenaLayout } from './arena.ts';
import { IDLE_INPUT, type GameEvent, type SimInput } from './types.ts';
import { World } from './world.ts';

const DT = 1 / 60;
const OPEN_SEA: ArenaLayout = { islands: [], decorations: [] };

function makeWorld(
  overrides: { sessionTime?: number; spawnInterval?: number; base?: GameConfig } = {},
  layout: ArenaLayout = OPEN_SEA,
) {
  const config = createMatchConfig(
    { sessionTime: overrides.sessionTime ?? 60, spawnInterval: overrides.spawnInterval ?? 3 },
    overrides.base,
  );
  return new World(config, { seed: 42, layout });
}

function run(world: World, seconds: number, input: SimInput = IDLE_INPUT): GameEvent[] {
  const events: GameEvent[] = [];
  for (let t = 0; t < seconds; t += DT) events.push(...world.step(input, DT));
  return events;
}

/** Config without enemy spawns, for isolated movement and weapon tests. */
const NO_SPAWNS: GameConfig = {
  ...DEFAULT_GAME_CONFIG,
  spawn: { ...DEFAULT_GAME_CONFIG.spawn, initialDelay: 1e6 },
};

describe('World', () => {
  it('starts the player at the arena center with full health', () => {
    const world = makeWorld();
    expect(world.player.x).toBe(world.arena.width / 2);
    expect(world.player.y).toBe(world.arena.height / 2);
    expect(world.player.health).toBe(DEFAULT_GAME_CONFIG.player.maxHealth);
    expect(world.remaining).toBe(60);
  });

  it('accelerates up to max speed and decelerates to a stop', () => {
    const world = makeWorld({ base: NO_SPAWNS });
    run(world, 3, { ...IDLE_INPUT, forward: true });
    expect(world.player.speed).toBe(DEFAULT_GAME_CONFIG.player.maxSpeed);
    run(world, 3);
    expect(world.player.speed).toBe(0);
  });

  it('turns clockwise with turnRight', () => {
    const world = makeWorld({ base: NO_SPAWNS });
    const start = world.player.angle;
    run(world, 0.5, { ...IDLE_INPUT, turnRight: true });
    expect(world.player.angle).toBeGreaterThan(start);
  });

  it('keeps the player inside the arena', () => {
    const world = makeWorld({ base: NO_SPAWNS });
    run(world, 10, { ...IDLE_INPUT, forward: true });
    expect(world.player.y).toBeGreaterThanOrEqual(world.player.radius);
  });

  it('does not sail through islands', () => {
    const layout: ArenaLayout = {
      islands: [{ col: 14, row: 2, cols: 3, rows: 3 }],
      decorations: [],
    };
    const world = makeWorld({ base: NO_SPAWNS }, layout);
    run(world, 6, { ...IDLE_INPUT, forward: true });
    const islandBottom = 5 * world.arena.tileSize;
    expect(world.player.y).toBeGreaterThan(islandBottom - 10);
    expect(world.arena.isSolid(world.player.x, world.player.y)).toBe(false);
  });

  it('respects weapon cooldowns', () => {
    const world = makeWorld({ base: NO_SPAWNS });
    const events = run(world, 1, { ...IDLE_INPUT, fireFront: true });
    const shots = events.filter((event) => event.type === 'shot');
    // Cooldown 0.45 s: shots at t=0, 0.45 and 0.9.
    expect(shots).toHaveLength(3);
  });

  it('fires broadsides perpendicular to the heading', () => {
    const world = makeWorld({ base: NO_SPAWNS });
    world.step({ ...IDLE_INPUT, fireRight: true }, DT);
    const { count } = DEFAULT_GAME_CONFIG.player.broadside;
    expect(world.projectiles).toHaveLength(count);
    // Heading north: starboard is east.
    for (const projectile of world.projectiles) {
      expect(projectile.vx).toBeGreaterThan(0);
      expect(Math.abs(projectile.vy)).toBeLessThan(1e-6);
    }
  });

  it('spawns both enemy types early, following the opening sequence', () => {
    const world = makeWorld({ spawnInterval: 1 });
    const spawns = run(world, 3).filter((event) => event.type === 'spawn');
    expect(spawns.map((event) => event.kind).slice(0, 2)).toEqual(['chaser', 'shooter']);
  });

  it('spawns enemies away from the player', () => {
    const world = makeWorld({ spawnInterval: 1 });
    run(world, DEFAULT_GAME_CONFIG.spawn.initialDelay + DT);
    const [enemy] = world.enemies;
    expect(enemy).toBeDefined();
    const dist = Math.hypot(enemy!.x - world.player.x, enemy!.y - world.player.y);
    expect(dist).toBeGreaterThanOrEqual(DEFAULT_GAME_CONFIG.spawn.minDistanceFromPlayer);
  });

  it('never exceeds the maximum number of alive enemies', () => {
    const base: GameConfig = {
      ...DEFAULT_GAME_CONFIG,
      spawn: { ...DEFAULT_GAME_CONFIG.spawn, maxAlive: 3 },
      chaser: { ...DEFAULT_GAME_CONFIG.chaser, maxSpeed: 0, acceleration: 0 },
      shooter: { ...DEFAULT_GAME_CONFIG.shooter, maxSpeed: 0, acceleration: 0 },
    };
    const world = makeWorld({ spawnInterval: 1, base });
    run(world, 10);
    expect(world.enemies.length).toBeLessThanOrEqual(3);
  });

  it('awards a point when the player sinks an enemy', () => {
    const world = makeWorld({ base: NO_SPAWNS });
    world.enemies.push({
      id: 999,
      kind: 'shooter',
      x: world.player.x,
      y: world.player.y - 200,
      angle: Math.PI / 2,
      speed: 0,
      health: 1,
      maxHealth: 60,
      radius: 26,
      cooldowns: { front: 99, left: 0, right: 0 },
    });
    const events = run(world, 1, { ...IDLE_INPUT, fireFront: true });
    expect(events).toContainEqual(expect.objectContaining({ type: 'shipDestroyed', scored: true }));
    expect(world.score).toBe(1);
  });

  it('damages the player when a chaser rams it, without awarding points', () => {
    const world = makeWorld({ base: NO_SPAWNS });
    world.enemies.push({
      id: 999,
      kind: 'chaser',
      x: world.player.x + 60,
      y: world.player.y,
      angle: Math.PI,
      speed: 100,
      health: 40,
      maxHealth: 40,
      radius: 22,
      cooldowns: { front: 0, left: 0, right: 0 },
    });
    const events = run(world, 1);
    expect(events.some((event) => event.type === 'ram')).toBe(true);
    expect(world.player.health).toBe(100 - DEFAULT_GAME_CONFIG.chaser.contactDamage);
    expect(world.enemies).toHaveLength(0);
    expect(world.score).toBe(0);
  });

  it('ends when the time is up', () => {
    const world = makeWorld({ base: NO_SPAWNS, sessionTime: 60 });
    const events = run(world, 61);
    expect(world.status).toBe('ended');
    expect(world.endReason).toBe('timeUp');
    expect(world.remaining).toBe(0);
    expect(events.filter((event) => event.type === 'matchEnd')).toHaveLength(1);
  });

  it('ends when the player is sunk', () => {
    const world = makeWorld({ base: NO_SPAWNS });
    world.player.health = 0;
    world.step(IDLE_INPUT, DT);
    expect(world.status).toBe('ended');
    expect(world.endReason).toBe('sunk');
    expect(world.step(IDLE_INPUT, DT)).toEqual([]);
  });

  it('is deterministic for a given seed', () => {
    const a = makeWorld({ spawnInterval: 1 });
    const b = makeWorld({ spawnInterval: 1 });
    const input = { ...IDLE_INPUT, forward: true, turnLeft: true, fireFront: true };
    run(a, 15, input);
    run(b, 15, input);
    expect(a.enemies.map(({ x, y }) => [x, y])).toEqual(b.enemies.map(({ x, y }) => [x, y]));
    expect(a.player.health).toBe(b.player.health);
  });
});
