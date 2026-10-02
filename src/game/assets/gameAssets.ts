import { Assets, type Texture } from 'pixi.js';
import type { DecorationKind } from '../sim/arena.ts';
import type { ShipKind } from '../sim/types.ts';

const BASE = `${import.meta.env.BASE_URL}assets/png`;

const tile = (index: number) => `${BASE}/default/tiles/tile_${index}.png`;

/** Tile indices in the 16-column tile sheet (1-based, row-major). */
const SAND_NINE_SLICE = [
  [1, 2, 3],
  [17, 18, 19],
  [33, 34, 35],
] as const;
const WATER_TILE = 73;
const DECORATION_TILES: Record<DecorationKind, readonly number[]> = {
  rock: [49, 50, 51],
  mossyRock: [65, 66, 67],
  palm: [70, 71, 72],
  plant: [87, 88],
};

/** Full ship sprites. Their bow points down (+y). */
const SHIP_SPRITES: Record<ShipKind, string> = {
  player: `${BASE}/default/ships/ship_5.png`,
  chaser: `${BASE}/default/ships/ship_2.png`,
  shooter: `${BASE}/default/ships/ship_3.png`,
};

const MANIFEST = {
  water: tile(WATER_TILE),
  cannonBall: `${BASE}/default/ship_parts/cannon_ball.png`,
  explosion1: `${BASE}/default/effects/explosion_1.png`,
  explosion2: `${BASE}/default/effects/explosion_2.png`,
  explosion3: `${BASE}/default/effects/explosion_3.png`,
  fire1: `${BASE}/default/effects/fire_1.png`,
  fire2: `${BASE}/default/effects/fire_2.png`,
  enemyHealthFrame: `${BASE}/retina/ui/hud/enemy_health_frame.png`,
} as const;

export interface GameTextures {
  readonly water: Texture;
  readonly sand: readonly (readonly Texture[])[];
  readonly decorations: Record<DecorationKind, readonly Texture[]>;
  readonly ships: Record<ShipKind, Texture>;
  readonly cannonBall: Texture;
  readonly explosion: readonly Texture[];
  readonly fire: readonly Texture[];
  readonly enemyHealthFrame: Texture;
}

/** Loads (or reuses from the Pixi cache) every texture the arena needs. */
export async function loadGameTextures(): Promise<GameTextures> {
  const decorationUrls = Object.fromEntries(
    Object.entries(DECORATION_TILES).map(([kind, indices]) => [kind, indices.map(tile)]),
  ) as Record<DecorationKind, string[]>;
  const sandUrls = SAND_NINE_SLICE.map((row) => row.map(tile));

  const urls = [
    ...Object.values(MANIFEST),
    ...Object.values(SHIP_SPRITES),
    ...sandUrls.flat(),
    ...Object.values(decorationUrls).flat(),
  ];
  const loaded = await Assets.load<Texture>(urls);
  const get = (url: string): Texture => {
    const texture = loaded[url];
    if (!texture) throw new Error(`Missing texture: ${url}`);
    return texture;
  };

  return {
    water: get(MANIFEST.water),
    sand: sandUrls.map((row) => row.map(get)),
    decorations: {
      rock: decorationUrls.rock.map(get),
      mossyRock: decorationUrls.mossyRock.map(get),
      palm: decorationUrls.palm.map(get),
      plant: decorationUrls.plant.map(get),
    },
    ships: {
      player: get(SHIP_SPRITES.player),
      chaser: get(SHIP_SPRITES.chaser),
      shooter: get(SHIP_SPRITES.shooter),
    },
    cannonBall: get(MANIFEST.cannonBall),
    explosion: [get(MANIFEST.explosion1), get(MANIFEST.explosion2), get(MANIFEST.explosion3)],
    fire: [get(MANIFEST.fire1), get(MANIFEST.fire2)],
    enemyHealthFrame: get(MANIFEST.enemyHealthFrame),
  };
}
