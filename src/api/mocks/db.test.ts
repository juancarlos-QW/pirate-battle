import { describe, expect, it } from 'vitest';
import type { MatchRecord } from '../schemas.ts';
import { MockDatabase, paginate } from './db.ts';
import { createSeedMatches } from './seed.ts';

const SETTINGS = { sessionTime: 120, spawnInterval: 3 };

function match(overrides: Partial<MatchRecord> & Pick<MatchRecord, 'id'>): MatchRecord {
  return {
    playerId: 'player-aaaa',
    captainName: 'Captain Test',
    score: 10,
    duration: 120,
    endReason: 'timeUp',
    settings: SETTINGS,
    playedAt: '2026-09-08T19:00:00.000Z',
    ...overrides,
  };
}

describe('MockDatabase', () => {
  it('ranks the best match of each player, highest score first', () => {
    const db = new MockDatabase([
      match({ id: 'a1', playerId: 'player-aaaa', score: 10 }),
      match({ id: 'a2', playerId: 'player-aaaa', score: 25 }),
      match({ id: 'b1', playerId: 'player-bbbb', score: 18, captainName: 'Red Sparrow' }),
    ]);
    const ranking = db.ranking(SETTINGS);
    expect(ranking.map((entry) => [entry.rank, entry.matchId])).toEqual([
      [1, 'a2'],
      [2, 'b1'],
    ]);
  });

  it('breaks ties in favour of the earliest match', () => {
    const db = new MockDatabase([
      match({ id: 'late', playerId: 'player-late', playedAt: '2026-09-08T20:00:00.000Z' }),
      match({ id: 'early', playerId: 'player-early', playedAt: '2026-09-08T18:00:00.000Z' }),
    ]);
    expect(db.ranking(SETTINGS)[0]?.matchId).toBe('early');
  });

  it('keeps rankings separate per match settings', () => {
    const db = new MockDatabase([
      match({ id: 'a', settings: { sessionTime: 60, spawnInterval: 2 } }),
    ]);
    expect(db.ranking(SETTINGS)).toEqual([]);
    expect(db.rankOf('player-aaaa', { sessionTime: 60, spawnInterval: 2 })).toBe(1);
  });

  it('ignores duplicate inserts', () => {
    const db = new MockDatabase();
    db.insert(match({ id: 'same', score: 5 }));
    db.insert(match({ id: 'same', score: 50 }));
    expect(db.all()).toHaveLength(1);
    expect(db.all()[0]?.score).toBe(5);
  });

  it('returns the player history newest first', () => {
    const db = new MockDatabase([
      match({ id: 'old', playedAt: '2026-09-07T10:00:00.000Z' }),
      match({ id: 'new', playedAt: '2026-09-08T10:00:00.000Z' }),
      match({ id: 'other', playerId: 'player-zzzz' }),
    ]);
    expect(db.historyPage('player-aaaa', 1, 5).items.map((item) => item.id)).toEqual([
      'new',
      'old',
    ]);
  });

  it('seeds a ranking for the default settings', () => {
    const db = new MockDatabase(createSeedMatches(Date.UTC(2026, 8, 8)));
    expect(db.ranking(SETTINGS).length).toBeGreaterThan(5);
  });
});

describe('paginate', () => {
  it('clamps the page and reports totals', () => {
    const items = Array.from({ length: 12 }, (_, i) => i);
    expect(paginate(items, 3, 5)).toEqual({
      items: [10, 11],
      page: 3,
      pageSize: 5,
      total: 12,
      totalPages: 3,
    });
    expect(paginate(items, 99, 5).page).toBe(3);
    expect(paginate([], 1, 5)).toMatchObject({ items: [], page: 1, totalPages: 1 });
  });
});
