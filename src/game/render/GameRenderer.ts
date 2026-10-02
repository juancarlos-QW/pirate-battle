import { Application, Container, Graphics, Sprite, TilingSprite } from 'pixi.js';
import { loadGameTextures, type GameTextures } from '../assets/gameAssets.ts';
import type { Arena } from '../sim/arena.ts';
import { clamp } from '../sim/math.ts';
import type { GameEvent, Ship, ShipKind } from '../sim/types.ts';
import type { World } from '../sim/world.ts';
import { createEffect, type Effect } from './effects.ts';

/**
 * Smallest world scale before the camera stops showing the whole arena and starts following the
 * player instead. Keeps ships readable on small (mobile) screens.
 */
const MIN_WORLD_SCALE = 0.6;
/** Ship sprite length relative to the collision diameter. */
const SHIP_SPRITE_SCALE = 2.3;
const SHIP_SPRITE_WIDTH = 66;
/** The ship sprites point down; the simulation's angle 0 points right. */
const SPRITE_ROTATION_OFFSET = -Math.PI / 2;
const HEALTH_BAR_WIDTH = 64;
/** Inner channel of the enemy health frame, in frame texture pixels. */
const HEALTH_CHANNEL = { x: 47, y: 25, w: 225, h: 27 } as const;
const DAMAGED_RATIO = 0.5;
const WATER_DRIFT = 6;
const TILE_OVERLAP = 1.5;

interface ShipView {
  readonly root: Container;
  readonly fire: Sprite;
  readonly bar: HealthBarView | null;
}

interface HealthBarView {
  readonly root: Container;
  readonly fill: Graphics;
  ratio: number;
}

/** Draws a `World` with PixiJS. Owns the Pixi application and all display objects. */
export class GameRenderer {
  readonly app: Application;
  private readonly textures: GameTextures;
  private readonly arena: Arena;
  private readonly shipRadii: Record<ShipKind, number>;
  private readonly water: TilingSprite;
  private readonly worldLayer = new Container();
  private readonly projectileLayer = new Container();
  private readonly shipLayer = new Container();
  private readonly effectLayer = new Container();
  private readonly overlayLayer = new Container();
  private readonly ships = new Map<number, ShipView>();
  private readonly projectiles = new Map<number, Sprite>();
  private effects: Effect[] = [];
  private time = 0;

  private constructor(app: Application, textures: GameTextures, world: World) {
    this.app = app;
    this.textures = textures;
    this.arena = world.arena;
    const { player, chaser, shooter } = world.config;
    this.shipRadii = { player: player.radius, chaser: chaser.radius, shooter: shooter.radius };

    this.water = new TilingSprite({ texture: textures.water, width: 1, height: 1 });
    app.stage.addChild(this.water, this.worldLayer);
    this.worldLayer.addChild(
      this.createBoundsShade(),
      this.createIslands(),
      this.projectileLayer,
      this.shipLayer,
      this.effectLayer,
      this.overlayLayer,
    );
  }

  static async create(host: HTMLElement, world: World): Promise<GameRenderer> {
    const app = new Application();
    await app.init({
      resizeTo: host,
      background: '#2aa7c9',
      antialias: true,
      autoDensity: true,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
    });
    const textures = await loadGameTextures();
    app.canvas.setAttribute('aria-hidden', 'true');
    host.appendChild(app.canvas);
    return new GameRenderer(app, textures, world);
  }

  /** Spawns visual effects for simulation events. */
  handleEvents(events: readonly GameEvent[]): void {
    for (const event of events) {
      const effect = createEffect(event, this.textures, (kind) => this.shipScale(kind));
      if (!effect) continue;
      this.effectLayer.addChild(effect.view);
      this.effects.push(effect);
    }
  }

  /**
   * Syncs display objects with the world. `dt` advances animations; pass 0 while paused so
   * everything freezes.
   */
  render(world: World, dt: number): void {
    this.time += dt;
    this.updateCamera(world.player);
    this.syncShips(
      [world.player, ...world.enemies],
      world.status === 'ended' && world.endReason === 'sunk',
    );
    this.syncProjectiles(world);
    this.updateEffects(dt);
  }

  destroy(): void {
    this.effects = [];
    // Textures stay in the Pixi asset cache so the next match starts instantly.
    this.app.destroy({ removeView: true }, { children: true });
  }

  // ---------------------------------------------------------------- scene setup

  private createIslands(): Container {
    const layer = new Container();
    const { tileSize, layout } = this.arena;
    const pick = (index: number, count: number) => (index === 0 ? 0 : index === count - 1 ? 2 : 1);

    for (const island of layout.islands) {
      for (let r = 0; r < island.rows; r += 1) {
        for (let c = 0; c < island.cols; c += 1) {
          const texture = this.textures.sand[pick(r, island.rows)]![pick(c, island.cols)]!;
          const sprite = new Sprite(texture);
          sprite.position.set((island.col + c) * tileSize, (island.row + r) * tileSize);
          // A small overlap hides hairline seams between scaled tiles.
          sprite.setSize(tileSize + TILE_OVERLAP, tileSize + TILE_OVERLAP);
          layer.addChild(sprite);
        }
      }
    }
    for (const decoration of layout.decorations) {
      const variants = this.textures.decorations[decoration.kind];
      const sprite = new Sprite(variants[decoration.variant % variants.length]);
      sprite.anchor.set(0.5);
      sprite.position.set((decoration.col + 0.5) * tileSize, (decoration.row + 0.5) * tileSize);
      sprite.setSize(tileSize, tileSize);
      layer.addChild(sprite);
    }
    return layer;
  }

  /** Darkens the sea outside the arena so its limits are visible. */
  private createBoundsShade(): Graphics {
    const { width: w, height: h } = this.arena;
    const far = 4000;
    return new Graphics()
      .rect(-far, -far, w + far * 2, far)
      .rect(-far, h, w + far * 2, far)
      .rect(-far, 0, far, h)
      .rect(w, 0, far, h)
      .fill({ color: 0x0b2a3a, alpha: 0.4 })
      .rect(0, 0, w, h)
      .stroke({ color: 0xffffff, alpha: 0.25, width: 3 });
  }

  // ---------------------------------------------------------------- per frame

  private updateCamera(player: Ship): void {
    const { width: sw, height: sh } = this.app.screen;
    const { width: ww, height: wh } = this.arena;
    const contain = Math.min(sw / ww, sh / wh);
    const cover = Math.max(sw / ww, sh / wh);
    const scale = Math.max(contain, Math.min(cover, MIN_WORLD_SCALE));
    const viewW = sw / scale;
    const viewH = sh / scale;
    const x = viewW >= ww ? (ww - viewW) / 2 : clamp(player.x - viewW / 2, 0, ww - viewW);
    const y = viewH >= wh ? (wh - viewH) / 2 : clamp(player.y - viewH / 2, 0, wh - viewH);

    this.worldLayer.scale.set(scale);
    this.worldLayer.position.set(-x * scale, -y * scale);
    this.water.setSize(sw, sh);
    this.water.tileScale.set(scale);
    this.water.tilePosition.set(
      (-x + this.time * WATER_DRIFT) * scale,
      (-y + this.time * WATER_DRIFT * 0.5) * scale,
    );
  }

  private syncShips(ships: readonly Ship[], hidePlayer: boolean): void {
    const seen = new Set<number>();
    for (const ship of ships) {
      if (hidePlayer && ship.kind === 'player') continue;
      seen.add(ship.id);
      let view = this.ships.get(ship.id);
      if (!view) {
        view = this.createShipView(ship);
        this.ships.set(ship.id, view);
      }
      view.root.position.set(ship.x, ship.y);
      view.root.rotation = ship.angle + SPRITE_ROTATION_OFFSET;

      const ratio = ship.health / ship.maxHealth;
      view.fire.visible = ratio < DAMAGED_RATIO;
      if (view.fire.visible) {
        const flicker = 1 + Math.sin(this.time * 18 + ship.id) * 0.12;
        view.fire.scale.set(flicker * 0.9, flicker);
      }
      if (view.bar) this.updateHealthBar(view.bar, ship, ratio);
    }
    for (const [id, view] of this.ships) {
      if (seen.has(id)) continue;
      view.root.destroy({ children: true });
      view.bar?.root.destroy({ children: true });
      this.ships.delete(id);
    }
  }

  private createShipView(ship: Ship): ShipView {
    const root = new Container();
    const hull = new Sprite(this.textures.ships[ship.kind]);
    hull.anchor.set(0.5);
    hull.scale.set(this.shipScale(ship.kind));
    const fire = new Sprite(this.textures.fire[0]);
    fire.anchor.set(0.5, 0.9);
    fire.position.set(0, -ship.radius * 0.3);
    fire.visible = false;
    root.addChild(hull, fire);
    this.shipLayer.addChild(root);

    const bar = ship.kind === 'player' ? null : this.createHealthBar();
    return { root, fire, bar };
  }

  private shipScale(kind: ShipKind): number {
    return (this.shipRadii[kind] * SHIP_SPRITE_SCALE) / SHIP_SPRITE_WIDTH;
  }

  private createHealthBar(): HealthBarView {
    const root = new Container();
    const frame = new Sprite(this.textures.enemyHealthFrame);
    const scale = HEALTH_BAR_WIDTH / frame.texture.width;
    frame.scale.set(scale);
    const fill = new Graphics();
    root.addChild(frame, fill);
    root.pivot.set(HEALTH_BAR_WIDTH / 2, 0);
    this.overlayLayer.addChild(root);
    return { root, fill, ratio: -1 };
  }

  private updateHealthBar(bar: HealthBarView, ship: Ship, ratio: number): void {
    bar.root.position.set(ship.x, ship.y - ship.radius - 30);
    if (bar.ratio === ratio) return;
    bar.ratio = ratio;
    const scale = HEALTH_BAR_WIDTH / this.textures.enemyHealthFrame.width;
    const { x, y, w, h } = HEALTH_CHANNEL;
    bar.fill.clear();
    if (ratio <= 0) return;
    bar.fill
      .roundRect(x * scale, y * scale, w * scale * ratio, h * scale, (h * scale) / 2)
      .fill(ratio > DAMAGED_RATIO ? 0xe0392b : 0xb81d12)
      .roundRect(
        x * scale + 2,
        y * scale + 1,
        Math.max(0, w * scale * ratio - 4),
        (h * scale) / 3,
        2,
      )
      .fill({ color: 0xffffff, alpha: 0.3 });
  }

  private syncProjectiles(world: World): void {
    const seen = new Set<number>();
    for (const projectile of world.projectiles) {
      seen.add(projectile.id);
      let sprite = this.projectiles.get(projectile.id);
      if (!sprite) {
        sprite = new Sprite(this.textures.cannonBall);
        sprite.anchor.set(0.5);
        sprite.setSize(projectile.radius * 2.2, projectile.radius * 2.2);
        this.projectileLayer.addChild(sprite);
        this.projectiles.set(projectile.id, sprite);
      }
      sprite.position.set(projectile.x, projectile.y);
    }
    for (const [id, sprite] of this.projectiles) {
      if (seen.has(id)) continue;
      sprite.destroy();
      this.projectiles.delete(id);
    }
  }

  private updateEffects(dt: number): void {
    if (dt <= 0) return;
    this.effects = this.effects.filter((effect) => {
      if (effect.update(dt)) return true;
      effect.view.destroy({ children: true });
      return false;
    });
  }
}
