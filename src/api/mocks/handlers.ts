import { delay, http, HttpResponse } from 'msw';
import { z } from 'zod';
import { REQUEST_TIMEOUT_MS } from '../client.ts';
import { matchSettingsSchema, matchSubmissionSchema, PAGE_SIZE } from '../schemas.ts';
import type { MockDatabase } from './db.ts';
import type { MockScenario } from './scenario.ts';

type Endpoint = 'submit' | 'ranking' | 'history';

/** Long enough for the Axios client to give up first. */
const LATE_RESPONSE_MS = REQUEST_TIMEOUT_MS + 2000;

export interface MockApiOptions {
  readonly baseUrl: string;
  readonly db: MockDatabase;
  readonly scenario?: MockScenario;
  /** Called after every write, e.g. to persist the database. */
  readonly onChange?: () => void;
  /** Disable artificial latency (tests). */
  readonly instant?: boolean;
  readonly random?: () => number;
}

const pagingSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(PAGE_SIZE),
});

const rankingQuerySchema = pagingSchema.extend({
  sessionTime: z.coerce.number(),
  spawnInterval: z.coerce.number(),
});

function badRequest(error: z.ZodError) {
  return HttpResponse.json(
    { error: 'invalid_request', issues: error.issues.map((issue) => issue.message) },
    { status: 400 },
  );
}

export function createHandlers({
  baseUrl,
  db,
  scenario = 'normal',
  onChange,
  instant = false,
  random = Math.random,
}: MockApiOptions) {
  let requestCount = 0;

  /** Latency of one request. Deterministic for `out-of-order`: every other request is slow. */
  function latency(): number {
    requestCount += 1;
    if (scenario === 'slow') return 3000;
    if (scenario === 'timeout') return LATE_RESPONSE_MS;
    if (scenario === 'out-of-order') return requestCount % 2 === 1 ? 1500 : 150;
    return 250 + random() * 250;
  }

  /** Applies the network scenario. Returns a response to short-circuit the request. */
  async function network(endpoint: Endpoint): Promise<Response | undefined> {
    if (!instant) await delay(latency());
    if (scenario === 'offline') return HttpResponse.error();
    if (scenario === 'error') return HttpResponse.json({ error: 'internal' }, { status: 500 });
    if (scenario === 'rejected') {
      return HttpResponse.json({ error: 'invalid_request', issues: [] }, { status: 400 });
    }
    if (
      (scenario === 'ranking-error' && endpoint === 'ranking') ||
      (scenario === 'history-error' && endpoint === 'history')
    ) {
      return HttpResponse.json({ error: 'internal' }, { status: 500 });
    }
    if (scenario === 'flaky' && random() < 0.5) {
      return HttpResponse.json({ error: 'unavailable' }, { status: 503 });
    }
    return undefined;
  }

  const queryOf = (request: Request) =>
    Object.fromEntries(new URL(request.url).searchParams.entries());

  return [
    http.post(`${baseUrl}/matches`, async ({ request }) => {
      const failure = await network('submit');
      if (failure) return failure;
      const parsed = matchSubmissionSchema.safeParse(await request.json().catch(() => null));
      if (!parsed.success) return badRequest(parsed.error);
      const match = db.insert(parsed.data);
      onChange?.();
      // The write is committed, but the client gives up before the answer arrives.
      if (scenario === 'save-timeout' && !instant) await delay(LATE_RESPONSE_MS);
      return HttpResponse.json(
        { match, rank: db.rankOf(match.playerId, match.settings) },
        { status: 201 },
      );
    }),

    http.get(`${baseUrl}/ranking`, async ({ request }) => {
      const failure = await network('ranking');
      if (failure) return failure;
      const parsed = rankingQuerySchema.safeParse(queryOf(request));
      if (!parsed.success) return badRequest(parsed.error);
      const { page, pageSize, ...rest } = parsed.data;
      const settings = matchSettingsSchema.safeParse(rest);
      if (!settings.success) return badRequest(settings.error);
      return HttpResponse.json(db.rankingPage(settings.data, page, pageSize));
    }),

    http.get(`${baseUrl}/players/:playerId/matches`, async ({ request, params }) => {
      const failure = await network('history');
      if (failure) return failure;
      const parsed = pagingSchema.safeParse(queryOf(request));
      if (!parsed.success) return badRequest(parsed.error);
      const playerId = String(params.playerId);
      return HttpResponse.json(db.historyPage(playerId, parsed.data.page, parsed.data.pageSize));
    }),
  ];
}
