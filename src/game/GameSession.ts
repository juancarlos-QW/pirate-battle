import type { Ticker } from 'pixi.js';
import { GameAudio } from '../audio/GameAudio.ts';
import type { MatchConfig } from '../config/matchConfig.ts';
import { InputController, type JoystickVector } from './input/InputController.ts';
import { GameRenderer } from './render/GameRenderer.ts';
import type { EndReason, SimInput } from './sim/types.ts';
import { World } from './sim/world.ts';

/** Simulation timestep. Rendering runs at the display rate and is decoupled from it. */
const FIXED_STEP = 1 / 60;
/** Longest frame accepted, so a stalled tab does not fast-forward the match. */
const MAX_FRAME = 0.25;

export type SessionPhase = 'loading' | 'running' | 'paused' | 'ended' | 'error';

/** Everything the React HUD needs. Replaced (never mutated) when something visible changes. */
export interface HudState {
  readonly phase: SessionPhase;
  readonly health: number;
  readonly maxHealth: number;
  readonly score: number;
  /** Whole seconds left, rounded up. */
  readonly remaining: number;
  readonly duration: number;
  /** Whole seconds played. */
  readonly elapsed: number;
  readonly endReason: EndReason | null;
}

/**
 * One match: wires the simulation, input and renderer together and runs the game loop.
 * Exposes a tiny external store (`subscribe` / `getSnapshot`) for `useSyncExternalStore`.
 */
export class GameSession {
  readonly world: World;
  private readonly input: InputController;
  private renderer: GameRenderer | null = null;
  private readonly audio = new GameAudio();
  private phase: SessionPhase = 'loading';
  private accumulator = 0;
  private destroyed = false;
  private snapshot: HudState;
  private readonly listeners = new Set<() => void>();

  constructor(config: MatchConfig, seed?: number) {
    this.world = new World(config, seed === undefined ? {} : { seed });
    this.input = new InputController(() => this.togglePause());
    this.snapshot = this.buildSnapshot();
  }

  /** Creates the renderer inside `host` and starts the match. */
  async mount(host: HTMLElement): Promise<void> {
    let renderer: GameRenderer;
    try {
      renderer = await GameRenderer.create(host, this.world);
    } catch (error) {
      if (!this.destroyed) this.setPhase('error');
      throw error;
    }
    if (this.destroyed) {
      renderer.destroy();
      return;
    }
    this.renderer = renderer;
    this.input.attach();
    document.addEventListener('visibilitychange', this.handleVisibility);
    renderer.app.ticker.add(this.tick);
    this.audio.start();
    this.setPhase('running');
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.input.detach();
    this.audio.stop();
    document.removeEventListener('visibilitychange', this.handleVisibility);
    this.renderer?.destroy();
    this.renderer = null;
    this.listeners.clear();
  }

  pause(): void {
    if (this.phase !== 'running') return;
    this.input.clear();
    this.audio.pause();
    this.setPhase('paused');
  }

  resume(): void {
    if (this.phase !== 'paused') return;
    this.accumulator = 0;
    this.audio.resume();
    this.setPhase('running');
  }

  togglePause(): void {
    if (this.phase === 'running') this.pause();
    else this.resume();
  }

  setTouch(action: keyof SimInput, pressed: boolean): void {
    if (this.phase === 'running' || !pressed) this.input.setTouch(action, pressed);
  }

  setJoystick(joystick: JoystickVector | null): void {
    if (this.phase === 'running' || !joystick) this.input.setJoystick(joystick);
  }

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  readonly getSnapshot = (): HudState => this.snapshot;

  private readonly tick = (ticker: Ticker): void => {
    const renderer = this.renderer;
    if (!renderer) return;
    const dt = Math.min(ticker.deltaMS / 1000, MAX_FRAME);

    if (this.phase === 'running') {
      this.accumulator += dt;
      while (this.accumulator >= FIXED_STEP && this.world.status === 'running') {
        this.accumulator -= FIXED_STEP;
        const events = this.world.step(this.input.snapshot(this.world.player.angle), FIXED_STEP);
        renderer.handleEvents(events);
        this.audio.handleEvents(events, this.world);
      }
      if (this.world.status === 'ended') {
        this.input.clear();
        this.phase = 'ended';
      }
    }

    this.audio.update(this.world, this.phase === 'running');
    // Effects keep playing after the match ends (the final wreck), but freeze while paused.
    renderer.render(this.world, this.phase === 'paused' ? 0 : dt);
    this.publish();
  };

  private readonly handleVisibility = (): void => {
    if (document.hidden) this.pause();
  };

  private setPhase(phase: SessionPhase): void {
    this.phase = phase;
    this.publish();
  }

  private buildSnapshot(): HudState {
    const { world } = this;
    return {
      phase: this.phase,
      health: Math.ceil(world.player.health),
      maxHealth: world.player.maxHealth,
      score: world.score,
      remaining: Math.ceil(world.remaining),
      duration: world.config.match.duration,
      elapsed: Math.floor(world.elapsed),
      endReason: world.endReason,
    };
  }

  private publish(): void {
    const next = this.buildSnapshot();
    const prev = this.snapshot;
    const changed = (Object.keys(next) as (keyof HudState)[]).some(
      (key) => next[key] !== prev[key],
    );
    if (!changed) return;
    this.snapshot = next;
    this.listeners.forEach((listener) => listener());
  }
}
