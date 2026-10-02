import { useSyncExternalStore } from 'react';
import { z } from 'zod';
import { readJson, STORAGE_KEYS, writeJson } from '../storage/storage.ts';

const SOUND_FILES = {
  cannonFire: ['cannon_fire_1', 'cannon_fire_2', 'cannon_fire_3'],
  broadside: ['cannon_broadside'],
  waterHit: ['cannonball_water_hit_1', 'cannonball_water_hit_2'],
  woodHit: ['ship_wood_hit_1', 'ship_wood_hit_2'],
  explosion: ['ship_explosion_1', 'ship_explosion_2'],
  sinking: ['ship_sinking'],
  collision: ['ship_collision'],
  scorePoint: ['score_point'],
  healthLow: ['health_low'],
  timeWarning: ['time_warning'],
  gameStart: ['game_start'],
  gameComplete: ['game_complete'],
  gameOver: ['game_over'],
  gamePause: ['game_pause'],
  gameResume: ['game_resume'],
  uiClick: ['ui_click'],
  uiOpen: ['ui_open'],
  uiClose: ['ui_close'],
  oceanLoop: ['ocean_ambience_loop'],
  sailingLoop: ['ship_sailing_loop'],
} as const;

export type SoundId = keyof typeof SOUND_FILES;

const BASE = `${import.meta.env.BASE_URL}assets/sounds`;
/** Same sound retriggered faster than this is skipped, so volleys don't clip. */
const MIN_RETRIGGER_S = 0.05;
const audioSettingsSchema = z.object({ muted: z.boolean() });

export interface LoopHandle {
  setVolume(volume: number): void;
  stop(): void;
}

/**
 * Web Audio playback for effects and loops. Every call is a safe no-op when audio is unavailable
 * (no Web Audio, autoplay still locked, files failing to load): sound is never required to play.
 */
class AudioManager {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private readonly buffers = new Map<string, Promise<AudioBuffer | null>>();
  private readonly lastPlayed = new Map<SoundId, number>();
  private readonly listeners = new Set<() => void>();
  private muted = readJson(STORAGE_KEYS.audio, audioSettingsSchema)?.muted ?? false;

  isMuted = (): boolean => this.muted;

  setMuted(muted: boolean): void {
    this.muted = muted;
    writeJson(STORAGE_KEYS.audio, { muted });
    if (this.master && this.context) {
      this.master.gain.setTargetAtTime(muted ? 0 : 1, this.context.currentTime, 0.02);
    }
    this.listeners.forEach((listener) => listener());
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  /** Creates or resumes the audio context. Must run during a user gesture the first time. */
  unlock(): void {
    const context = this.ensureContext();
    if (context?.state === 'suspended') void context.resume().catch(() => undefined);
  }

  /** Starts downloading sounds ahead of time. */
  preload(ids: readonly SoundId[]): void {
    for (const id of ids) for (const file of SOUND_FILES[id]) void this.load(file);
  }

  play(id: SoundId, { volume = 1, rate = 1 }: { volume?: number; rate?: number } = {}): void {
    const context = this.ensureContext();
    if (!context || !this.master || context.state !== 'running') return;
    const now = context.currentTime;
    if (now - (this.lastPlayed.get(id) ?? -1) < MIN_RETRIGGER_S) return;
    this.lastPlayed.set(id, now);

    const files = SOUND_FILES[id];
    const file = files[Math.floor(Math.random() * files.length)]!;
    const master = this.master;
    void this.load(file).then((buffer) => {
      if (!buffer) return;
      const source = context.createBufferSource();
      source.buffer = buffer;
      source.playbackRate.value = rate;
      const gain = context.createGain();
      gain.gain.value = volume;
      source.connect(gain).connect(master);
      source.start();
    });
  }

  /** Starts a looping sound. The returned handle works even before the file has loaded. */
  loop(id: SoundId, initialVolume: number): LoopHandle {
    const context = this.ensureContext();
    let volume = initialVolume;
    let stopped = false;
    let source: AudioBufferSourceNode | null = null;
    let gain: GainNode | null = null;

    if (context && this.master) {
      const master = this.master;
      void this.load(SOUND_FILES[id][0]).then((buffer) => {
        if (!buffer || stopped) return;
        source = context.createBufferSource();
        source.buffer = buffer;
        source.loop = true;
        gain = context.createGain();
        gain.gain.value = volume;
        source.connect(gain).connect(master);
        source.start();
      });
    }

    return {
      setVolume(next) {
        volume = next;
        if (gain && context) gain.gain.setTargetAtTime(next, context.currentTime, 0.1);
      },
      stop() {
        stopped = true;
        try {
          source?.stop();
        } catch {
          // Already stopped.
        }
        source?.disconnect();
      },
    };
  }

  private ensureContext(): AudioContext | null {
    if (this.context) return this.context;
    if (typeof window === 'undefined' || typeof window.AudioContext !== 'function') return null;
    try {
      this.context = new AudioContext();
      this.master = this.context.createGain();
      this.master.gain.value = this.muted ? 0 : 1;
      this.master.connect(this.context.destination);
    } catch {
      this.context = null;
    }
    return this.context;
  }

  private load(file: string): Promise<AudioBuffer | null> {
    let pending = this.buffers.get(file);
    if (!pending) {
      const context = this.ensureContext();
      pending = context
        ? fetch(`${BASE}/${file}.wav`)
            .then((response) => {
              if (!response.ok) throw new Error(`HTTP ${response.status}`);
              return response.arrayBuffer();
            })
            .then((data) => context.decodeAudioData(data))
            .catch(() => null)
        : Promise.resolve(null);
      this.buffers.set(file, pending);
    }
    return pending;
  }
}

export const audio = new AudioManager();

export function useMuted(): boolean {
  return useSyncExternalStore(audio.subscribe, audio.isMuted, audio.isMuted);
}
