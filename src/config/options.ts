import { z } from 'zod';
import { DEFAULT_GAME_CONFIG } from './gameConfig.ts';

/**
 * Player-editable options exposed on the Options screen.
 *
 * Documented limits:
 * - Game session time: integer seconds, 60–180 (default 120).
 * - Enemy spawn time: seconds in steps of 0.5, 1–10 (default 3). Must be positive; the lower
 *   bound keeps the arena readable and the upper bound guarantees both enemy types appear in a
 *   minimum-length match.
 * - Captain name: 1–20 characters, shown on the ranking.
 */
export const OPTION_LIMITS = {
  sessionTime: { min: 60, max: 180, step: 10, unitStep: 1 },
  spawnInterval: { min: 1, max: 10, step: 0.5, unitStep: 0.5 },
  captainName: { minLength: 1, maxLength: 20 },
} as const;

export interface PlayerOptions {
  /** Game session time in seconds. */
  readonly sessionTime: number;
  /** Enemy spawn interval in seconds. */
  readonly spawnInterval: number;
  readonly captainName: string;
}

export const DEFAULT_OPTIONS: PlayerOptions = {
  sessionTime: DEFAULT_GAME_CONFIG.match.duration,
  spawnInterval: DEFAULT_GAME_CONFIG.spawn.interval,
  captainName: 'Captain Jack',
};

const { sessionTime, spawnInterval, captainName } = OPTION_LIMITS;

export const playerOptionsSchema = z.object({
  sessionTime: z
    .number({ error: 'Game session time must be a number.' })
    .int('Game session time must be a whole number of seconds.')
    .min(sessionTime.min, `Game session time must be at least ${sessionTime.min} s.`)
    .max(sessionTime.max, `Game session time must be at most ${sessionTime.max} s.`),
  spawnInterval: z
    .number({ error: 'Enemy spawn time must be a number.' })
    .min(spawnInterval.min, `Enemy spawn time must be at least ${spawnInterval.min} s.`)
    .max(spawnInterval.max, `Enemy spawn time must be at most ${spawnInterval.max} s.`)
    .refine(
      (value) => Number.isInteger(value / spawnInterval.unitStep),
      `Enemy spawn time must be a multiple of ${spawnInterval.unitStep} s.`,
    ),
  captainName: z
    .string()
    .trim()
    .min(captainName.minLength, 'Captain name is required.')
    .max(
      captainName.maxLength,
      `Captain name must be at most ${captainName.maxLength} characters.`,
    ),
});

export type OptionsField = keyof PlayerOptions;
export type OptionsErrors = { [K in OptionsField]?: string | undefined };

export type OptionsValidation =
  | { readonly ok: true; readonly value: PlayerOptions }
  | { readonly ok: false; readonly errors: OptionsErrors };

export function validateOptions(input: unknown): OptionsValidation {
  const result = playerOptionsSchema.safeParse(input);
  if (result.success) return { ok: true, value: result.data };

  const errors: OptionsErrors = {};
  for (const issue of result.error.issues) {
    const field = issue.path[0];
    if (typeof field === 'string' && field in DEFAULT_OPTIONS && !(field in errors)) {
      errors[field as OptionsField] = issue.message;
    }
  }
  return { ok: false, errors };
}

/** Clamps a value into the field limits and snaps it to the stepper grid. */
export function stepOption(
  field: 'sessionTime' | 'spawnInterval',
  current: number,
  direction: 1 | -1,
): number {
  const limits = OPTION_LIMITS[field];
  const base = Number.isFinite(current) ? current : DEFAULT_OPTIONS[field];
  const units = base / limits.step;
  const onGrid = Math.abs(units - Math.round(units)) < 1e-9;
  const next = onGrid
    ? base + direction * limits.step
    : (direction > 0 ? Math.ceil(units) : Math.floor(units)) * limits.step;
  const clamped = Math.min(limits.max, Math.max(limits.min, next));
  return Math.round(clamped * 100) / 100;
}
