import { setupWorker } from 'msw/browser';
import { z } from 'zod';
import { readJson, STORAGE_KEYS, writeJson } from '../../storage/storage.ts';
import { matchRecordSchema } from '../schemas.ts';
import { MockDatabase } from './db.ts';
import { createHandlers } from './handlers.ts';
import { consumeResetRequest, resolveScenario } from './scenario.ts';
import { createSeedMatches } from './seed.ts';

/** The mock backend keeps its data in localStorage so it survives reloads, like a real server. */
const DB_KEY = 'pirate-battle:mock-db:v1';
const storedMatchesSchema = z.array(matchRecordSchema);

export async function startMockApi(): Promise<void> {
  // `?mock=reset`: back to the seeded database, no pending results, default scenario.
  if (consumeResetRequest([DB_KEY, STORAGE_KEYS.outbox, STORAGE_KEYS.lastResult])) {
    console.info('[mock api] state reset');
  }
  const scenario = resolveScenario();
  const stored = scenario === 'empty' ? null : readJson(DB_KEY, storedMatchesSchema);
  const db = new MockDatabase(stored ?? (scenario === 'empty' ? [] : createSeedMatches()));
  const persist = () => {
    if (scenario !== 'empty') writeJson(DB_KEY, db.all());
  };
  persist();

  const worker = setupWorker(
    ...createHandlers({
      baseUrl: import.meta.env.VITE_API_BASE_URL ?? '/api',
      db,
      scenario,
      onChange: persist,
    }),
  );
  await worker.start({
    onUnhandledRequest: 'bypass',
    quiet: true,
    serviceWorker: { url: `${import.meta.env.BASE_URL}mockServiceWorker.js` },
  });
  if (scenario !== 'normal') console.info(`[mock api] scenario: ${scenario}`);
}
