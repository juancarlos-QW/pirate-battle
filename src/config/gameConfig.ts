/**
 * Central, typed gameplay configuration.
 *
 * Every balancing value used by the simulation lives here. Systems read these values from the
 * per-match snapshot (see `createMatchConfig`) and never hard-code numbers, so balancing changes
 * only require editing this file.
 *
 * Units: distances in world pixels, time in seconds, angles in radians, speeds per second.
 */

export interface ArenaConfig {
  /** Tile size in world pixels. */
  readonly tileSize: number;
  /** Arena size in tiles. World size = cols * tileSize by rows * tileSize. */
  readonly cols: number;
  readonly rows: number;
}

export interface ShipMovementConfig {
  readonly maxHealth: number;
  /** Collision circle radius. */
  readonly radius: number;
  /** Top forward speed. */
  readonly maxSpeed: number;
  /** Speed gained per second while sailing forward. */
  readonly acceleration: number;
  /** Speed lost per second while not sailing forward. */
  readonly deceleration: number;
  /** Rotation speed. */
  readonly turnSpeed: number;
}

export interface WeaponConfig {
  readonly damage: number;
  /** Minimum time between two shots of this weapon. */
  readonly cooldown: number;
  readonly projectileSpeed: number;
  /** Maximum travelled distance before the projectile expires. */
  readonly range: number;
  readonly projectileRadius: number;
}

export interface BroadsideConfig extends WeaponConfig {
  /** Number of parallel projectiles per broadside. */
  readonly count: number;
  /** Distance between two parallel projectiles, along the ship axis. */
  readonly spacing: number;
}

export interface ChaserConfig extends ShipMovementConfig {
  /** Damage dealt to the player on collision (the chaser explodes). */
  readonly contactDamage: number;
}

export interface ShooterConfig extends ShipMovementConfig {
  /** Distance at which the shooter starts firing. */
  readonly attackRange: number;
  /** Distance the shooter tries to keep from the player. */
  readonly preferredDistance: number;
  /** Max angle between heading and target direction to fire. */
  readonly aimTolerance: number;
  readonly weapon: WeaponConfig;
}

export interface SpawnConfig {
  /** Time between two enemy spawns. Overridden by the player's options. */
  readonly interval: number;
  /** Delay before the first spawn. */
  readonly initialDelay: number;
  /** Relative spawn weights per enemy type. */
  readonly weights: { readonly chaser: number; readonly shooter: number };
  /** The first spawns follow this order, guaranteeing both types appear early. */
  readonly openingSequence: readonly EnemyKind[];
  /** Spawning is skipped while this many enemies are alive. */
  readonly maxAlive: number;
  /** Minimum distance between a spawn point and the player. */
  readonly minDistanceFromPlayer: number;
  /** Minimum free distance between a spawn point and any island tile or arena edge. */
  readonly clearance: number;
  /** Candidate points tried before skipping a spawn. */
  readonly maxAttempts: number;
}

export interface MatchRulesConfig {
  /** Active play time. Overridden by the player's options. */
  readonly duration: number;
  /** Points for each enemy destroyed by the player's attacks. */
  readonly pointsPerKill: number;
}

export interface GameConfig {
  readonly arena: ArenaConfig;
  readonly match: MatchRulesConfig;
  readonly spawn: SpawnConfig;
  readonly player: ShipMovementConfig & {
    readonly frontCannon: WeaponConfig;
    readonly broadside: BroadsideConfig;
  };
  readonly chaser: ChaserConfig;
  readonly shooter: ShooterConfig;
}

export type EnemyKind = 'chaser' | 'shooter';

export const DEFAULT_GAME_CONFIG: GameConfig = {
  arena: { tileSize: 64, cols: 30, rows: 17 },
  match: { duration: 120, pointsPerKill: 1 },
  spawn: {
    interval: 3,
    initialDelay: 1.5,
    weights: { chaser: 0.55, shooter: 0.45 },
    openingSequence: ['chaser', 'shooter'],
    maxAlive: 12,
    minDistanceFromPlayer: 480,
    clearance: 48,
    maxAttempts: 40,
  },
  player: {
    maxHealth: 100,
    radius: 26,
    maxSpeed: 180,
    acceleration: 240,
    deceleration: 160,
    turnSpeed: 2.6,
    frontCannon: {
      damage: 25,
      cooldown: 0.45,
      projectileSpeed: 560,
      range: 540,
      projectileRadius: 6,
    },
    broadside: {
      damage: 20,
      cooldown: 1.4,
      projectileSpeed: 480,
      range: 400,
      projectileRadius: 6,
      count: 3,
      spacing: 22,
    },
  },
  chaser: {
    maxHealth: 40,
    radius: 22,
    maxSpeed: 125,
    acceleration: 200,
    deceleration: 160,
    turnSpeed: 2.2,
    contactDamage: 25,
  },
  shooter: {
    maxHealth: 60,
    radius: 26,
    maxSpeed: 95,
    acceleration: 160,
    deceleration: 160,
    turnSpeed: 1.8,
    attackRange: 380,
    preferredDistance: 280,
    aimTolerance: 0.3,
    weapon: {
      damage: 10,
      cooldown: 1.6,
      projectileSpeed: 400,
      range: 440,
      projectileRadius: 5,
    },
  },
};
