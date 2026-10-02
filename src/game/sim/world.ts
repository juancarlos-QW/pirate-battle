import type { EnemyKind, ShipMovementConfig, WeaponConfig } from '../../config/gameConfig.ts';
import type { MatchConfig } from '../../config/matchConfig.ts';
import { Arena, type ArenaLayout } from './arena.ts';
import { angleDelta, clamp, distanceSq } from './math.ts';
import { createRng, type Rng } from './rng.ts';
import type {
  EndReason,
  Faction,
  GameEvent,
  Projectile,
  Ship,
  ShipKind,
  SimInput,
  WeaponSlot,
} from './types.ts';

export interface WorldOptions {
  readonly seed?: number;
  readonly layout?: ArenaLayout;
}

export type MatchStatus = 'running' | 'ended';

/** Candidate heading offsets tried, in order, when the straight course is blocked. */
const AVOID_OFFSETS = [0, 0.45, -0.45, 0.9, -0.9, 1.35, -1.35, 1.8, -1.8, Math.PI];

/**
 * Deterministic match simulation. It knows nothing about rendering, input devices or time
 * sources: callers advance it with `step(input, dt)` using a fixed timestep.
 */
export class World {
  readonly config: MatchConfig;
  readonly arena: Arena;
  readonly player: Ship;
  readonly enemies: Ship[] = [];
  readonly projectiles: Projectile[] = [];

  elapsed = 0;
  score = 0;
  status: MatchStatus = 'running';
  endReason: EndReason | null = null;

  private readonly rng: Rng;
  private nextId = 1;
  private spawnTimer: number;
  private spawnCount = 0;
  private events: GameEvent[] = [];

  constructor(config: MatchConfig, options: WorldOptions = {}) {
    this.config = config;
    this.arena = new Arena(config.arena, options.layout);
    this.rng = createRng(options.seed ?? Date.now());
    this.spawnTimer = config.spawn.initialDelay;
    const { x, y } = this.arena.center;
    this.player = this.createShip('player', config.player, x, y, -Math.PI / 2);
  }

  get remaining(): number {
    return Math.max(0, this.config.match.duration - this.elapsed);
  }

  /** Advances the match by `dt` seconds and returns what happened during the step. */
  step(input: SimInput, dt: number): readonly GameEvent[] {
    if (this.status === 'ended' || dt <= 0) return [];
    this.events = [];
    this.elapsed = Math.min(this.config.match.duration, this.elapsed + dt);

    for (const ship of [this.player, ...this.enemies]) tickCooldowns(ship, dt);

    this.updatePlayer(input, dt);
    for (const enemy of this.enemies) this.updateEnemy(enemy, dt);
    this.resolveShipContacts();
    this.updateProjectiles(dt);
    this.updateSpawning(dt);

    if (this.player.health <= 0) this.end('sunk');
    else if (this.elapsed >= this.config.match.duration) this.end('timeUp');
    return this.events;
  }

  // ---------------------------------------------------------------- player

  private updatePlayer(input: SimInput, dt: number): void {
    const { player } = this;
    const cfg = this.config.player;
    const turn = (input.turnRight ? 1 : 0) - (input.turnLeft ? 1 : 0);
    this.moveShip(player, cfg, input.forward, turn, dt);

    if (input.fireFront && player.cooldowns.front <= 0) {
      player.cooldowns.front = cfg.frontCannon.cooldown;
      const ox = player.x + Math.cos(player.angle) * (player.radius + 4);
      const oy = player.y + Math.sin(player.angle) * (player.radius + 4);
      this.spawnProjectile('player', ox, oy, player.angle, cfg.frontCannon);
      this.events.push({ type: 'shot', faction: 'player', slot: 'front', x: ox, y: oy });
    }
    if (input.fireLeft) this.fireBroadside(player, 'left');
    if (input.fireRight) this.fireBroadside(player, 'right');
  }

  private fireBroadside(ship: Ship, slot: 'left' | 'right'): void {
    if (ship.cooldowns[slot] > 0) return;
    const cfg = this.config.player.broadside;
    ship.cooldowns[slot] = cfg.cooldown;

    // Starboard (right) is the heading rotated 90° clockwise on screen.
    const side = slot === 'right' ? 1 : -1;
    const direction = ship.angle + (side * Math.PI) / 2;
    const hx = Math.cos(ship.angle);
    const hy = Math.sin(ship.angle);
    const sx = Math.cos(direction);
    const sy = Math.sin(direction);
    for (let i = 0; i < cfg.count; i += 1) {
      const along = (i - (cfg.count - 1) / 2) * cfg.spacing;
      const ox = ship.x + hx * along + sx * ship.radius * 0.7;
      const oy = ship.y + hy * along + sy * ship.radius * 0.7;
      this.spawnProjectile('player', ox, oy, direction, cfg);
    }
    this.events.push({ type: 'shot', faction: 'player', slot, x: ship.x, y: ship.y });
  }

  // ---------------------------------------------------------------- enemies

  private updateEnemy(enemy: Ship, dt: number): void {
    const { player } = this;
    const dx = player.x - enemy.x;
    const dy = player.y - enemy.y;
    const dist = Math.hypot(dx, dy);
    const toPlayer = Math.atan2(dy, dx);

    if (enemy.kind === 'chaser') {
      const cfg = this.config.chaser;
      const heading = this.avoidObstacles(enemy, toPlayer, Math.min(dist, 160));
      this.moveShip(enemy, cfg, true, steer(enemy, heading, cfg.turnSpeed, dt), dt);
      return;
    }

    const cfg = this.config.shooter;
    let desired = toPlayer;
    let throttle = dist > cfg.preferredDistance;
    if (dist < cfg.preferredDistance * 0.6) {
      // Too close: break away, then turn back once at a comfortable distance.
      desired = toPlayer + Math.PI;
      throttle = true;
    }
    const heading = this.avoidObstacles(enemy, desired, 140);
    this.moveShip(enemy, cfg, throttle, steer(enemy, heading, cfg.turnSpeed, dt), dt);

    const aimError = Math.abs(angleDelta(enemy.angle, toPlayer));
    if (dist <= cfg.attackRange && aimError <= cfg.aimTolerance && enemy.cooldowns.front <= 0) {
      enemy.cooldowns.front = cfg.weapon.cooldown;
      const ox = enemy.x + Math.cos(enemy.angle) * (enemy.radius + 4);
      const oy = enemy.y + Math.sin(enemy.angle) * (enemy.radius + 4);
      this.spawnProjectile('enemy', ox, oy, enemy.angle, cfg.weapon);
      this.events.push({ type: 'shot', faction: 'enemy', slot: 'front', x: ox, y: oy });
    }
  }

  /**
   * Returns the closest heading to `desired` whose short look-ahead is free of islands and
   * arena edges. Keeps enemies from grinding against the shore.
   */
  private avoidObstacles(ship: Ship, desired: number, maxLookAhead: number): number {
    const lookAhead = Math.max(
      ship.radius * 1.5,
      Math.min(maxLookAhead, ship.radius + 40 + ship.speed * 0.6),
    );
    for (const offset of AVOID_OFFSETS) {
      const angle = desired + offset;
      if (this.isCourseClear(ship, angle, lookAhead)) return angle;
    }
    return desired;
  }

  private isCourseClear(ship: Ship, angle: number, lookAhead: number): boolean {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    for (const fraction of [0.5, 1]) {
      const px = ship.x + cos * lookAhead * fraction;
      const py = ship.y + sin * lookAhead * fraction;
      if (
        !this.arena.isInside(px, py, ship.radius * 0.5) ||
        this.arena.clearanceAt(px, py) < ship.radius * 0.6
      ) {
        return false;
      }
    }
    return true;
  }

  // ---------------------------------------------------------------- movement & contacts

  private moveShip(
    ship: Ship,
    cfg: ShipMovementConfig,
    throttle: boolean,
    turn: number,
    dt: number,
  ): void {
    ship.angle += clamp(turn, -1, 1) * cfg.turnSpeed * dt;
    ship.speed = throttle
      ? Math.min(cfg.maxSpeed, ship.speed + cfg.acceleration * dt)
      : Math.max(0, ship.speed - cfg.deceleration * dt);

    const resolved = this.arena.resolveCircle(
      ship.x + Math.cos(ship.angle) * ship.speed * dt,
      ship.y + Math.sin(ship.angle) * ship.speed * dt,
      ship.radius,
    );
    ship.x = resolved.x;
    ship.y = resolved.y;
    // Scraping along the shore bleeds speed.
    if (resolved.collided) ship.speed *= Math.max(0, 1 - 3 * dt);
  }

  private resolveShipContacts(): void {
    const { player } = this;

    // Chasers explode on contact with the player.
    for (const enemy of [...this.enemies]) {
      if (enemy.kind !== 'chaser') continue;
      const reach = enemy.radius + player.radius;
      if (distanceSq(enemy.x, enemy.y, player.x, player.y) > reach * reach) continue;
      player.health = Math.max(0, player.health - this.config.chaser.contactDamage);
      this.events.push({ type: 'ram', x: (enemy.x + player.x) / 2, y: (enemy.y + player.y) / 2 });
      this.destroyEnemy(enemy, false);
    }

    // Everything else just pushes apart.
    const ships = [player, ...this.enemies];
    for (let i = 0; i < ships.length; i += 1) {
      for (let j = i + 1; j < ships.length; j += 1) {
        separate(ships[i]!, ships[j]!);
      }
    }
    for (const ship of ships) {
      const resolved = this.arena.resolveCircle(ship.x, ship.y, ship.radius);
      ship.x = resolved.x;
      ship.y = resolved.y;
    }
  }

  // ---------------------------------------------------------------- projectiles

  private spawnProjectile(
    faction: Faction,
    x: number,
    y: number,
    angle: number,
    weapon: WeaponConfig,
  ): void {
    this.projectiles.push({
      id: this.nextId++,
      faction,
      x,
      y,
      vx: Math.cos(angle) * weapon.projectileSpeed,
      vy: Math.sin(angle) * weapon.projectileSpeed,
      damage: weapon.damage,
      radius: weapon.projectileRadius,
      remaining: weapon.range,
    });
  }

  private updateProjectiles(dt: number): void {
    const survivors: Projectile[] = [];
    for (const projectile of this.projectiles) {
      projectile.x += projectile.vx * dt;
      projectile.y += projectile.vy * dt;
      projectile.remaining -= Math.hypot(projectile.vx, projectile.vy) * dt;

      if (!this.arena.isInside(projectile.x, projectile.y)) continue;
      if (this.arena.isSolid(projectile.x, projectile.y) || projectile.remaining <= 0) {
        this.events.push({ type: 'splash', x: projectile.x, y: projectile.y });
        continue;
      }
      const target = this.findHit(projectile);
      if (!target) {
        survivors.push(projectile);
        continue;
      }
      target.health = Math.max(0, target.health - projectile.damage);
      this.events.push({ type: 'hit', targetId: target.id, x: projectile.x, y: projectile.y });
      if (target !== this.player && target.health <= 0) this.destroyEnemy(target, true);
    }
    this.projectiles.length = 0;
    this.projectiles.push(...survivors);
  }

  private findHit(projectile: Projectile): Ship | undefined {
    const candidates = projectile.faction === 'player' ? this.enemies : [this.player];
    return candidates.find((ship) => {
      const reach = ship.radius + projectile.radius;
      return distanceSq(ship.x, ship.y, projectile.x, projectile.y) <= reach * reach;
    });
  }

  private destroyEnemy(enemy: Ship, scored: boolean): void {
    const index = this.enemies.indexOf(enemy);
    if (index === -1) return;
    this.enemies.splice(index, 1);
    if (scored) this.score += this.config.match.pointsPerKill;
    this.events.push({
      type: 'shipDestroyed',
      shipId: enemy.id,
      kind: enemy.kind,
      x: enemy.x,
      y: enemy.y,
      angle: enemy.angle,
      scored,
    });
  }

  // ---------------------------------------------------------------- spawning

  private updateSpawning(dt: number): void {
    const cfg = this.config.spawn;
    this.spawnTimer -= dt;
    if (this.spawnTimer > 0) return;
    this.spawnTimer += cfg.interval;
    if (this.enemies.length >= cfg.maxAlive) return;

    const kind = this.nextEnemyKind();
    const shipConfig = this.config[kind];
    const point = this.findSpawnPoint(shipConfig.radius);
    if (!point) return;

    const angle = Math.atan2(this.player.y - point.y, this.player.x - point.x);
    const enemy = this.createShip(kind, shipConfig, point.x, point.y, angle);
    this.enemies.push(enemy);
    this.spawnCount += 1;
    this.events.push({ type: 'spawn', shipId: enemy.id, kind });
  }

  private nextEnemyKind(): EnemyKind {
    const { openingSequence, weights } = this.config.spawn;
    const opening = openingSequence[this.spawnCount];
    if (opening) return opening;
    const total = weights.chaser + weights.shooter;
    return this.rng.next() * total < weights.chaser ? 'chaser' : 'shooter';
  }

  private findSpawnPoint(radius: number): { x: number; y: number } | null {
    const { clearance, minDistanceFromPlayer, maxAttempts } = this.config.spawn;
    const margin = clearance + radius;
    const minDistSq = minDistanceFromPlayer * minDistanceFromPlayer;
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const x = this.rng.range(margin, this.arena.width - margin);
      const y = this.rng.range(margin, this.arena.height - margin);
      if (distanceSq(x, y, this.player.x, this.player.y) < minDistSq) continue;
      if (this.arena.clearanceAt(x, y) < margin) continue;
      return { x, y };
    }
    return null;
  }

  // ---------------------------------------------------------------- helpers

  private createShip(
    kind: ShipKind,
    cfg: ShipMovementConfig,
    x: number,
    y: number,
    angle: number,
  ): Ship {
    return {
      id: this.nextId++,
      kind,
      x,
      y,
      angle,
      speed: 0,
      health: cfg.maxHealth,
      maxHealth: cfg.maxHealth,
      radius: cfg.radius,
      cooldowns: { front: 0, left: 0, right: 0 },
    };
  }

  private end(reason: EndReason): void {
    this.status = 'ended';
    this.endReason = reason;
    if (reason === 'sunk') {
      const { player } = this;
      this.events.push({
        type: 'shipDestroyed',
        shipId: player.id,
        kind: 'player',
        x: player.x,
        y: player.y,
        angle: player.angle,
        scored: false,
      });
    }
    this.events.push({ type: 'matchEnd', reason });
  }
}

function tickCooldowns(ship: Ship, dt: number): void {
  for (const slot of ['front', 'left', 'right'] as const satisfies readonly WeaponSlot[]) {
    ship.cooldowns[slot] = Math.max(0, ship.cooldowns[slot] - dt);
  }
}

/** Turn input in [-1, 1] that rotates toward `target` without overshooting it. */
function steer(ship: Ship, target: number, turnSpeed: number, dt: number): number {
  const delta = angleDelta(ship.angle, target);
  return clamp(delta / (turnSpeed * dt), -1, 1);
}

function separate(a: Ship, b: Ship): void {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const reach = a.radius + b.radius;
  const distSq = dx * dx + dy * dy;
  if (distSq >= reach * reach) return;
  const dist = Math.sqrt(distSq) || 1e-6;
  const push = (reach - dist) / 2;
  const nx = distSq > 0 ? dx / dist : 1;
  const ny = distSq > 0 ? dy / dist : 0;
  a.x -= nx * push;
  a.y -= ny * push;
  b.x += nx * push;
  b.y += ny * push;
}
