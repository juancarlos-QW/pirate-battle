import { z } from 'zod';
import { ApiError, submitMatch } from '../api/client.ts';
import { matchSubmissionSchema, type MatchSubmission } from '../api/schemas.ts';
import { readJson, STORAGE_KEYS, writeJson } from './storage.ts';

/**
 * Results that could not be sent (offline, server down) wait here and are retried later.
 * Submissions carry a client generated id, so a retry never creates a duplicate.
 */
const outboxSchema = z.array(matchSubmissionSchema);
const MAX_PENDING = 50;

export function readOutbox(): MatchSubmission[] {
  return readJson(STORAGE_KEYS.outbox, outboxSchema) ?? [];
}

function writeOutbox(items: readonly MatchSubmission[]): void {
  writeJson(STORAGE_KEYS.outbox, items.slice(-MAX_PENDING));
}

export function enqueue(match: MatchSubmission): void {
  const items = readOutbox().filter((item) => item.id !== match.id);
  writeOutbox([...items, match]);
}

export function remove(matchId: string): void {
  writeOutbox(readOutbox().filter((item) => item.id !== matchId));
}

let flushing: Promise<number> | null = null;

/**
 * Sends pending results in order. Stops at the first retryable failure; drops results the
 * server rejects as invalid. Resolves with the number of results delivered.
 */
export function flushOutbox(send: typeof submitMatch = submitMatch): Promise<number> {
  flushing ??= (async () => {
    let delivered = 0;
    try {
      for (const match of readOutbox()) {
        try {
          await send(match);
          delivered += 1;
          remove(match.id);
        } catch (error) {
          if (error instanceof ApiError && error.retryable) break;
          remove(match.id);
        }
      }
    } finally {
      flushing = null;
    }
    return delivered;
  })();
  return flushing;
}
