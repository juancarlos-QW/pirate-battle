import type { ArenaConfig } from '../../config/gameConfig.ts';
import { clamp } from './math.ts';

/** Rectangular island in tile coordinates. Islands are drawn as sand nine-slices. */
export interface IslandLayout {
  readonly col: number;
  readonly row: number;
  readonly cols: number;
  readonly rows: number;
}

export type DecorationKind = 'rock' | 'mossyRock' | 'palm' | 'plant';

/** Purely visual prop placed on an island tile. */
export interface DecorationLayout {
  readonly kind: DecorationKind;
  readonly col: number;
  readonly row: number;
  readonly variant: number;
}

export interface ArenaLayout {
  readonly islands: readonly IslandLayout[];
  readonly decorations: readonly DecorationLayout[];
}

/** Hand-made map for the default 30×17 arena. The player starts at the arena center. */
export const DEFAULT_ARENA_LAYOUT: ArenaLayout = {
  islands: [
    { col: 2, row: 2, cols: 5, rows: 3 },
    { col: 19, row: 1, cols: 3, rows: 4 },
    { col: 11, row: 4, cols: 2, rows: 2 },
    { col: 9, row: 11, cols: 6, rows: 3 },
    { col: 23, row: 10, cols: 4, rows: 4 },
    { col: 2, row: 12, cols: 3, rows: 3 },
  ],
  decorations: [
    { kind: 'palm', col: 3, row: 3, variant: 1 },
    { kind: 'mossyRock', col: 5, row: 3, variant: 1 },
    { kind: 'rock', col: 20, row: 2, variant: 0 },
    { kind: 'palm', col: 20, row: 3, variant: 0 },
    { kind: 'plant', col: 11, row: 4, variant: 2 },
    { kind: 'palm', col: 10, row: 12, variant: 2 },
    { kind: 'rock', col: 12, row: 12, variant: 1 },
    { kind: 'plant', col: 13, row: 12, variant: 0 },
    { kind: 'palm', col: 24, row: 11, variant: 1 },
    { kind: 'mossyRock', col: 25, row: 12, variant: 2 },
    { kind: 'rock', col: 3, row: 13, variant: 2 },
  ],
};

/**
 * The sand tiles have soft, partly transparent borders. Collision rectangles are inset so ships
 * touch the visible shore instead of an invisible tile edge.
 */
const SHORE_INSET = 10;

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export interface CircleResolution {
  readonly x: number;
  readonly y: number;
  /** True when the circle was pushed out of an island or the arena bounds. */
  readonly collided: boolean;
}

/** Static arena geometry and collision queries. All coordinates are world pixels. */
export class Arena {
  readonly width: number;
  readonly height: number;
  readonly tileSize: number;
  readonly layout: ArenaLayout;
  /** Island collision rectangles. */
  readonly obstacles: readonly Rect[];

  constructor(config: ArenaConfig, layout: ArenaLayout = DEFAULT_ARENA_LAYOUT) {
    this.tileSize = config.tileSize;
    this.width = config.cols * config.tileSize;
    this.height = config.rows * config.tileSize;
    this.layout = layout;
    this.obstacles = layout.islands.map((island) => ({
      x: island.col * this.tileSize + SHORE_INSET,
      y: island.row * this.tileSize + SHORE_INSET,
      w: island.cols * this.tileSize - SHORE_INSET * 2,
      h: island.rows * this.tileSize - SHORE_INSET * 2,
    }));
  }

  get center(): { readonly x: number; readonly y: number } {
    return { x: this.width / 2, y: this.height / 2 };
  }

  isInside(x: number, y: number, margin = 0): boolean {
    return x >= margin && y >= margin && x <= this.width - margin && y <= this.height - margin;
  }

  /** True when the point lies on an island. */
  isSolid(x: number, y: number): boolean {
    return this.obstacles.some(
      (rect) => x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h,
    );
  }

  /** Distance from a point to the nearest island or arena edge (0 when inside an island). */
  clearanceAt(x: number, y: number): number {
    let best = Math.min(x, y, this.width - x, this.height - y);
    for (const rect of this.obstacles) {
      const dx = Math.max(rect.x - x, 0, x - (rect.x + rect.w));
      const dy = Math.max(rect.y - y, 0, y - (rect.y + rect.h));
      best = Math.min(best, Math.hypot(dx, dy));
    }
    return Math.max(0, best);
  }

  /** Pushes a circle out of islands and back inside the arena. */
  resolveCircle(x: number, y: number, radius: number): CircleResolution {
    let px = x;
    let py = y;
    let collided = false;

    for (const rect of this.obstacles) {
      const nearestX = clamp(px, rect.x, rect.x + rect.w);
      const nearestY = clamp(py, rect.y, rect.y + rect.h);
      const dx = px - nearestX;
      const dy = py - nearestY;
      const distSq = dx * dx + dy * dy;
      if (distSq >= radius * radius) continue;
      collided = true;

      if (distSq > 1e-9) {
        const dist = Math.sqrt(distSq);
        px = nearestX + (dx / dist) * radius;
        py = nearestY + (dy / dist) * radius;
      } else {
        // Center inside the rectangle: leave through the closest side.
        const left = px - rect.x;
        const right = rect.x + rect.w - px;
        const top = py - rect.y;
        const bottom = rect.y + rect.h - py;
        const min = Math.min(left, right, top, bottom);
        if (min === left) px = rect.x - radius;
        else if (min === right) px = rect.x + rect.w + radius;
        else if (min === top) py = rect.y - radius;
        else py = rect.y + rect.h + radius;
      }
    }

    const cx = clamp(px, radius, this.width - radius);
    const cy = clamp(py, radius, this.height - radius);
    if (cx !== px || cy !== py) collided = true;
    return { x: cx, y: cy, collided };
  }
}
