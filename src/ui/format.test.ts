import { describe, expect, it } from 'vitest';
import { formatClock, formatPlayedAt, formatSeconds } from './format.ts';

describe('format', () => {
  it('formats clocks as mm:ss', () => {
    expect(formatClock(120)).toBe('02:00');
    expect(formatClock(61.4)).toBe('01:01');
    expect(formatClock(-3)).toBe('00:00');
  });

  it('formats played dates', () => {
    const local = new Date(2026, 8, 8, 19, 36);
    expect(formatPlayedAt(local.toISOString())).toEqual({ date: '08 SEP', time: '19:36' });
  });

  it('formats seconds without trailing zeros', () => {
    expect(formatSeconds(3)).toBe('3');
    expect(formatSeconds(2.5)).toBe('2.5');
  });
});
