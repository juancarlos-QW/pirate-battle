import { delay, http, HttpResponse } from 'msw';
import { z } from 'zod';
import { matchSettingsSchema, matchSubmissionSchema, PAGE_SIZE } from '../schemas.ts';
import type { MockDatabase } from './db.ts';
import type { MockScenario } from './scenario.ts';

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
  /** Applies the network scenario. Returns a response to short-circuit the request. */
  async function network(): Promise<Response | undefined> {
    if (!instant) await delay(scenario === 'slow' ? 3000 : 250 + random() * 250);
    if (scenario === 'offline') return HttpResponse.error();
    if (scenario === 'error') return HttpResponse.json({ error: 'internal' }, { status: 500 });
    if (scenario === 'flaky' && random() < 0.5) {
      return HttpResponse.json({ error: 'unavailable' }, { status: 503 });
    }
    return undefined;
  }

  const queryOf = (request: Request) =>
    Object.fromEntries(new URL(request.url).searchParams.entries());

  return [
    http.post(`${baseUrl}/matches`, async ({ request }) => {
      const failure = await network();
      if (failure) return failure;
      const parsed = matchSubmissionSchema.safeParse(await request.json().catch(() => null));
      if (!parsed.success) return badRequest(parsed.error);
      const match = db.insert(parsed.data);
      onChange?.();
      return HttpResponse.json(
        { match, rank: db.rankOf(match.playerId, match.settings) },
        { status: 201 },
      );
    }),

    http.get(`${baseUrl}/ranking`, async ({ request }) => {
      const failure = await network();
      if (failure) return failure;
      const parsed = rankingQuerySchema.safeParse(queryOf(request));
      if (!parsed.success) return badRequest(parsed.error);
      const { page, pageSize, ...rest } = parsed.data;
      const settings = matchSettingsSchema.safeParse(rest);
      if (!settings.success) return badRequest(settings.error);
      return HttpResponse.json(db.rankingPage(settings.data, page, pageSize));
    }),

    http.get(`${baseUrl}/players/:playerId/matches`, async ({ request, params }) => {
      const failure = await network();
      if (failure) return failure;
      const parsed = pagingSchema.safeParse(queryOf(request));
      if (!parsed.success) return badRequest(parsed.error);
      const playerId = String(params.playerId);
      return HttpResponse.json(db.historyPage(playerId, parsed.data.page, parsed.data.pageSize));
    }),
  ];
}
