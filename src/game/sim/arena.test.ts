import { describe, expect, it } from 'vitest';
import { DEFAULT_GAME_CONFIG } from '../../config/gameConfig.ts';
import { Arena, DEFAULT_ARENA_LAYOUT } from './arena.ts';

describe('Arena', () => {
  const arena = new Arena(DEFAULT_GAME_CONFIG.arena);

  it('keeps the arena center free for the player spawn', () => {
    const { x, y } = arena.center;
    expect(arena.clearanceAt(x, y)).toBeGreaterThan(DEFAULT_GAME_CONFIG.player.radius * 2);
  });

  it('places every island and decoration inside the arena', () => {
    const { cols, rows } = DEFAULT_GAME_CONFIG.arena;
    for (const island of DEFAULT_ARENA_LAYOUT.islands) {
      expect(island.col + island.cols).toBeLessThanOrEqual(cols);
      expect(island.row + island.rows).toBeLessThanOrEqual(rows);
    }
    for (const decoration of DEFAULT_ARENA_LAYOUT.decorations) {
      const onIsland = DEFAULT_ARENA_LAYOUT.islands.some(
        (island) =>
          decoration.col >= island.col &&
          decoration.col < island.col + island.cols &&
          decoration.row >= island.row &&
          decoration.row < island.row + island.rows,
      );
      expect(onIsland).toBe(true);
    }
  });

  it('pushes circles out of islands', () => {
    const [rect] = arena.obstacles;
    const resolved = arena.resolveCircle(rect!.x + 5, rect!.y + rect!.h / 2, 20);
    expect(resolved.collided).toBe(true);
    expect(resolved.x).toBeCloseTo(rect!.x - 20);
  });

  it('clamps circles to the arena bounds', () => {
    const resolved = arena.resolveCircle(-50, arena.height + 50, 10);
    expect(resolved).toEqual({ x: 10, y: arena.height - 10, collided: true });
  });
});
