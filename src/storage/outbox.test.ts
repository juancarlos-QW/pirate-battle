import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api/client.ts';
import type { MatchSubmission, SubmitResponse } from '../api/schemas.ts';
import { enqueue, flushOutbox, readOutbox } from './outbox.ts';

class MemoryStorage {
  private data = new Map<string, string>();
  getItem(key: string) {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.data.set(key, value);
  }
  removeItem(key: string) {
    this.data.delete(key);
  }
  clear() {
    this.data.clear();
  }
}

const storage = new MemoryStorage();
vi.stubGlobal('window', { localStorage: storage });

function submission(id: string): MatchSubmission {
  return {
    id,
    playerId: 'player-0001',
    captainName: 'Captain Jack',
    score: 3,
    duration: 60,
    endReason: 'sunk',
    settings: { sessionTime: 120, spawnInterval: 3 },
    playedAt: '2026-09-08T19:36:00.000Z',
  };
}

const ok = (match: MatchSubmission): Promise<SubmitResponse> => Promise.resolve({ match, rank: 1 });

describe('outbox', () => {
  beforeEach(() => storage.clear());

  it('stores each result once', () => {
    enqueue(submission('match-0001'));
    enqueue(submission('match-0001'));
    enqueue(submission('match-0002'));
    expect(readOutbox().map((item) => item.id)).toEqual(['match-0001', 'match-0002']);
  });

  it('delivers pending results in order', async () => {
    enqueue(submission('match-0001'));
    enqueue(submission('match-0002'));
    const send = vi.fn(ok);
    expect(await flushOutbox(send)).toBe(2);
    expect(send.mock.calls.map(([match]) => match.id)).toEqual(['match-0001', 'match-0002']);
    expect(readOutbox()).toEqual([]);
  });

  it('keeps results while the server is unreachable', async () => {
    enqueue(submission('match-0001'));
    const send = vi.fn(() => Promise.reject(new ApiError('network', 'offline')));
    expect(await flushOutbox(send)).toBe(0);
    expect(readOutbox()).toHaveLength(1);
  });

  it('drops results the server rejects', async () => {
    enqueue(submission('match-0001'));
    enqueue(submission('match-0002'));
    const send = vi.fn((match: MatchSubmission) =>
      match.id === 'match-0001' ? Promise.reject(new ApiError('rejected', 'bad')) : ok(match),
    );
    expect(await flushOutbox(send)).toBe(1);
    expect(readOutbox()).toEqual([]);
  });
});
