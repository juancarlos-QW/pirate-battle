import { http as mswHttp, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { ApiError, fetchHistory, fetchRanking, http, submitMatch } from './client.ts';
import { MockDatabase } from './mocks/db.ts';
import { createHandlers } from './mocks/handlers.ts';
import type { MockScenario } from './mocks/scenario.ts';
import type { MatchSubmission } from './schemas.ts';

const BASE_URL = 'http://api.test/api';
const SETTINGS = { sessionTime: 120, spawnInterval: 3 };

const server = setupServer();

function useBackend(scenario: MockScenario = 'normal', db = new MockDatabase()) {
  server.use(...createHandlers({ baseUrl: BASE_URL, db, scenario, instant: true }));
  return db;
}

function submission(overrides: Partial<MatchSubmission> = {}): MatchSubmission {
  return {
    id: 'match-0001',
    playerId: 'player-0001',
    captainName: 'Captain Jack',
    score: 24,
    duration: 120,
    endReason: 'timeUp',
    settings: SETTINGS,
    playedAt: '2026-09-08T19:36:00.000Z',
    ...overrides,
  };
}

beforeAll(() => {
  http.defaults.baseURL = BASE_URL;
  server.listen({ onUnhandledRequest: 'error' });
});
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('API client against the mock backend', () => {
  it('submits a match and returns its rank', async () => {
    useBackend();
    const response = await submitMatch(submission());
    expect(response.rank).toBe(1);
    expect(response.match.id).toBe('match-0001');
  });

  it('pages through the ranking of a bracket', async () => {
    useBackend();
    for (let i = 0; i < 7; i += 1) {
      await submitMatch(submission({ id: `match-${i}000`, playerId: `player-${i}000`, score: i }));
    }
    const page = await fetchRanking(SETTINGS, 2);
    expect(page).toMatchObject({ page: 2, totalPages: 2, total: 7 });
    expect(page.items.map((entry) => entry.rank)).toEqual([6, 7]);
  });

  it('returns the history of one player only', async () => {
    useBackend();
    await submitMatch(submission());
    await submitMatch(submission({ id: 'match-0002', playerId: 'player-0002' }));
    const page = await fetchHistory('player-0001', 1);
    expect(page.items.map((item) => item.id)).toEqual(['match-0001']);
  });

  it('rejects invalid results', async () => {
    useBackend();
    const error = await submitMatch(submission({ duration: 999 })).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).kind).toBe('rejected');
    expect((error as ApiError).retryable).toBe(false);
  });

  it.each([
    ['offline', 'network'],
    ['error', 'server'],
  ] as const)('reports the %s scenario as a retryable %s error', async (scenario, kind) => {
    useBackend(scenario);
    const error = await fetchRanking(SETTINGS, 1).catch((e: unknown) => e);
    expect(error).toMatchObject({ kind, retryable: true });
  });

  it('rejects malformed responses', async () => {
    server.use(mswHttp.get(`${BASE_URL}/ranking`, () => HttpResponse.json({ items: 'nope' })));
    const error = await fetchRanking(SETTINGS, 1).catch((e: unknown) => e);
    expect(error).toMatchObject({ kind: 'invalidResponse' });
  });
});
