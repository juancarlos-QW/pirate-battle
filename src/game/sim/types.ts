import type { EnemyKind } from '../../config/gameConfig.ts';
import type { GameAction } from '../../config/controls.ts';

export type ShipKind = 'player' | EnemyKind;
export type WeaponSlot = 'front' | 'left' | 'right';
export type Faction = 'player' | 'enemy';

export interface Ship {
  readonly id: number;
  readonly kind: ShipKind;
  x: number;
  y: number;
  /** Heading in radians. 0 points to +x, angles grow clockwise on screen (y points down). */
  angle: number;
  /** Forward speed, never negative. */
  speed: number;
  health: number;
  readonly maxHealth: number;
  readonly radius: number;
  /** Seconds until each weapon can fire again. */
  readonly cooldowns: Record<WeaponSlot, number>;
}

export interface Projectile {
  readonly id: number;
  readonly faction: Faction;
  x: number;
  y: number;
  readonly vx: number;
  readonly vy: number;
  readonly damage: number;
  readonly radius: number;
  /** Remaining distance before the projectile falls into the sea. */
  remaining: number;
}

export type EndReason = 'timeUp' | 'sunk';

/** Actions held during a simulation step (pause is handled outside the simulation). */
export type SimInput = Readonly<Record<Exclude<GameAction, 'pause'>, boolean>>;

export const IDLE_INPUT: SimInput = {
  forward: false,
  turnLeft: false,
  turnRight: false,
  fireFront: false,
  fireLeft: false,
  fireRight: false,
};

/** Things that happened during a step. Consumed by rendering effects and audio. */
export type GameEvent =
  | {
      readonly type: 'shot';
      readonly faction: Faction;
      readonly slot: WeaponSlot;
      readonly x: number;
      readonly y: number;
    }
  | { readonly type: 'splash'; readonly x: number; readonly y: number }
  | { readonly type: 'hit'; readonly targetId: number; readonly x: number; readonly y: number }
  | {
      readonly type: 'shipDestroyed';
      readonly shipId: number;
      readonly kind: ShipKind;
      readonly x: number;
      readonly y: number;
      readonly angle: number;
      /** True when the kill awarded points. */
      readonly scored: boolean;
    }
  | { readonly type: 'ram'; readonly x: number; readonly y: number }
  | { readonly type: 'spawn'; readonly shipId: number; readonly kind: EnemyKind }
  | { readonly type: 'matchEnd'; readonly reason: EndReason };
