import { describe, expect, it } from 'vitest';
import { DEFAULT_OPTIONS, stepOption, validateOptions } from './options.ts';

describe('validateOptions', () => {
  it('accepts the defaults', () => {
    expect(validateOptions(DEFAULT_OPTIONS)).toEqual({ ok: true, value: DEFAULT_OPTIONS });
  });

  it('trims the captain name', () => {
    const result = validateOptions({ ...DEFAULT_OPTIONS, captainName: '  Anne  ' });
    expect(result.ok && result.value.captainName).toBe('Anne');
  });

  it.each([
    [{ sessionTime: 59 }, 'sessionTime'],
    [{ sessionTime: 181 }, 'sessionTime'],
    [{ sessionTime: 90.5 }, 'sessionTime'],
    [{ sessionTime: Number.NaN }, 'sessionTime'],
    [{ spawnInterval: 0 }, 'spawnInterval'],
    [{ spawnInterval: -1 }, 'spawnInterval'],
    [{ spawnInterval: 10.5 }, 'spawnInterval'],
    [{ spawnInterval: 2.3 }, 'spawnInterval'],
    [{ captainName: '   ' }, 'captainName'],
    [{ captainName: 'x'.repeat(21) }, 'captainName'],
  ])('rejects %o', (patch, field) => {
    const result = validateOptions({ ...DEFAULT_OPTIONS, ...patch });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(Object.keys(result.errors)).toEqual([field]);
  });

  it('accepts the documented bounds', () => {
    for (const sessionTime of [60, 180]) {
      for (const spawnInterval of [1, 10, 2.5]) {
        expect(validateOptions({ ...DEFAULT_OPTIONS, sessionTime, spawnInterval }).ok).toBe(true);
      }
    }
  });
});

describe('stepOption', () => {
  it('steps on the grid and clamps to the limits', () => {
    expect(stepOption('sessionTime', 120, 1)).toBe(130);
    expect(stepOption('sessionTime', 180, 1)).toBe(180);
    expect(stepOption('sessionTime', 60, -1)).toBe(60);
    expect(stepOption('spawnInterval', 3, -1)).toBe(2.5);
    expect(stepOption('spawnInterval', 1, -1)).toBe(1);
  });

  it('snaps off-grid values in the step direction', () => {
    expect(stepOption('sessionTime', 125, 1)).toBe(130);
    expect(stepOption('sessionTime', 125, -1)).toBe(120);
    expect(stepOption('sessionTime', 500, -1)).toBe(180);
    expect(stepOption('sessionTime', Number.NaN, 1)).toBe(130);
  });
});
