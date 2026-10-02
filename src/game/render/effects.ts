import { Container, Graphics, Sprite, type Texture } from 'pixi.js';
import type { GameTextures } from '../assets/gameAssets.ts';
import type { GameEvent, ShipKind } from '../sim/types.ts';

/** Short-lived visual effect. `update` returns false once the effect is finished. */
export interface Effect {
  readonly view: Container;
  update(dt: number): boolean;
}

const SPRITE_ROTATION_OFFSET = -Math.PI / 2;

/** Maps a simulation event to its visual effect, if it has one. */
export function createEffect(
  event: GameEvent,
  textures: GameTextures,
  shipScale: (kind: ShipKind) => number,
): Effect | null {
  switch (event.type) {
    case 'shot':
      return flipbook(textures.explosion.slice(2), event.x, event.y, 0.12, 0.3, 0.45);
    case 'hit':
      return flipbook(textures.explosion.slice(1), event.x, event.y, 0.3, 0.5, 0.8);
    case 'ram':
      return flipbook(textures.explosion, event.x, event.y, 0.5, 0.9, 1.3);
    case 'splash':
      return splash(event.x, event.y);
    case 'shipDestroyed':
      return wreck(textures, event.kind, event.x, event.y, event.angle, shipScale(event.kind));
    case 'spawn':
    case 'matchEnd':
      return null;
  }
}

/** Plays textures in order while growing from `fromScale` to `toScale`. */
function flipbook(
  frames: readonly Texture[],
  x: number,
  y: number,
  duration: number,
  fromScale: number,
  toScale: number,
): Effect {
  const sprite = new Sprite(frames[0]);
  sprite.anchor.set(0.5);
  sprite.position.set(x, y);
  sprite.rotation = Math.random() * Math.PI * 2;
  sprite.scale.set(fromScale);
  let age = 0;
  return {
    view: sprite,
    update(dt) {
      age += dt;
      const t = Math.min(1, age / duration);
      sprite.texture = frames[Math.min(frames.length - 1, Math.floor(t * frames.length))]!;
      sprite.scale.set(fromScale + (toScale - fromScale) * t);
      sprite.alpha = 1 - t * t;
      return age < duration;
    },
  };
}

/** Expanding ring where a cannonball falls into the sea. */
function splash(x: number, y: number): Effect {
  const ring = new Graphics().circle(0, 0, 10).stroke({ color: 0xffffff, width: 3 });
  ring.position.set(x, y);
  const duration = 0.5;
  let age = 0;
  return {
    view: ring,
    update(dt) {
      age += dt;
      const t = Math.min(1, age / duration);
      ring.scale.set(0.4 + t * 1.2);
      ring.alpha = 0.8 * (1 - t);
      return age < duration;
    },
  };
}

/** Explosion followed by the darkened hull slowly sinking. */
function wreck(
  textures: GameTextures,
  kind: ShipKind,
  x: number,
  y: number,
  angle: number,
  scale: number,
): Effect {
  const view = new Container();
  view.position.set(x, y);

  const hull = new Sprite(textures.ships[kind]);
  hull.anchor.set(0.5);
  hull.rotation = angle + SPRITE_ROTATION_OFFSET;
  hull.scale.set(scale);
  hull.tint = 0x5b6670;

  const blast = flipbook(textures.explosion, 0, 0, 0.6, 0.6, 1.4);
  view.addChild(hull, blast.view);

  const duration = 1.8;
  let age = 0;
  let blasting = true;
  return {
    view,
    update(dt) {
      age += dt;
      if (blasting && !blast.update(dt)) {
        blasting = false;
        blast.view.visible = false;
      }
      const t = Math.min(1, age / duration);
      hull.alpha = 1 - t;
      hull.scale.set(scale * (1 - 0.25 * t));
      return age < duration;
    },
  };
}
