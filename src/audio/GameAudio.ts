import type { GameEvent } from '../game/sim/types.ts';
import type { World } from '../game/sim/world.ts';
import { audio, type LoopHandle, type SoundId } from './AudioManager.ts';

const GAME_SOUNDS: readonly SoundId[] = [
  'cannonFire',
  'broadside',
  'waterHit',
  'woodHit',
  'explosion',
  'sinking',
  'collision',
  'scorePoint',
  'healthLow',
  'timeWarning',
  'gameComplete',
  'gameOver',
  'gamePause',
  'gameResume',
];

const LOW_HEALTH_RATIO = 0.25;
const TIME_WARNING_SECONDS = 10;
const OCEAN_VOLUME = 0.35;
const SAILING_MAX_VOLUME = 0.4;

/** Turns simulation events and state into sound: one-shot effects plus ambience loops. */
export class GameAudio {
  private ocean: LoopHandle | null = null;
  private sailing: LoopHandle | null = null;
  private wasLowHealth = false;
  private lastWarnedSecond = Number.POSITIVE_INFINITY;

  start(): void {
    audio.unlock();
    audio.preload(GAME_SOUNDS);
    audio.play('gameStart', { volume: 0.7 });
    this.ocean = audio.loop('oceanLoop', OCEAN_VOLUME);
    this.sailing = audio.loop('sailingLoop', 0);
  }

  handleEvents(events: readonly GameEvent[], world: World): void {
    for (const event of events) {
      switch (event.type) {
        case 'shot':
          if (event.slot === 'front') {
            audio.play('cannonFire', {
              volume: event.faction === 'player' ? 0.6 : 0.35,
              rate: 0.95 + Math.random() * 0.1,
            });
          } else {
            audio.play('broadside', { volume: 0.7 });
          }
          break;
        case 'splash':
          audio.play('waterHit', { volume: 0.25 });
          break;
        case 'hit':
          audio.play('woodHit', { volume: event.targetId === world.player.id ? 0.8 : 0.5 });
          break;
        case 'ram':
          audio.play('collision', { volume: 0.8 });
          break;
        case 'shipDestroyed':
          audio.play(event.kind === 'player' ? 'sinking' : 'explosion', { volume: 0.8 });
          if (event.scored) audio.play('scorePoint', { volume: 0.5 });
          break;
        case 'matchEnd':
          audio.play(event.reason === 'timeUp' ? 'gameComplete' : 'gameOver', { volume: 0.8 });
          break;
        case 'spawn':
          break;
      }
    }
  }

  /** Per-frame state driven sounds. */
  update(world: World, active: boolean): void {
    const { player } = world;
    const sailing = active ? player.speed / world.config.player.maxSpeed : 0;
    this.sailing?.setVolume(sailing * SAILING_MAX_VOLUME);
    if (!active) return;

    const lowHealth = player.health > 0 && player.health / player.maxHealth <= LOW_HEALTH_RATIO;
    if (lowHealth && !this.wasLowHealth) audio.play('healthLow', { volume: 0.7 });
    this.wasLowHealth = lowHealth;

    const second = Math.ceil(world.remaining);
    if (second <= TIME_WARNING_SECONDS && second > 0 && second < this.lastWarnedSecond) {
      this.lastWarnedSecond = second;
      audio.play('timeWarning', { volume: 0.5 });
    }
  }

  pause(): void {
    audio.play('gamePause', { volume: 0.6 });
    this.ocean?.setVolume(OCEAN_VOLUME * 0.4);
  }

  resume(): void {
    audio.play('gameResume', { volume: 0.6 });
    this.ocean?.setVolume(OCEAN_VOLUME);
  }

  stop(): void {
    this.ocean?.stop();
    this.sailing?.stop();
    this.ocean = null;
    this.sailing = null;
  }
}
