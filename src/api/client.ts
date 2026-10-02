import axios, { isAxiosError } from 'axios';
import type { z } from 'zod';
import {
  historyPageSchema,
  PAGE_SIZE,
  rankingPageSchema,
  submitResponseSchema,
  type HistoryPage,
  type MatchSettingsDto,
  type MatchSubmission,
  type RankingPage,
  type SubmitResponse,
} from './schemas.ts';

const REQUEST_TIMEOUT_MS = 8000;

export const http = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? '/api',
  timeout: REQUEST_TIMEOUT_MS,
  headers: { 'Content-Type': 'application/json' },
});

/** Failure kinds the UI distinguishes. */
export type ApiErrorKind = 'network' | 'server' | 'rejected' | 'invalidResponse';

export class ApiError extends Error {
  readonly kind: ApiErrorKind;

  constructor(kind: ApiErrorKind, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'ApiError';
    this.kind = kind;
  }

  /** Worth retrying later: the request never reached the server or the server failed. */
  get retryable(): boolean {
    return this.kind === 'network' || this.kind === 'server';
  }
}

function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;
  if (isAxiosError(error)) {
    const status = error.response?.status;
    if (status === undefined)
      return new ApiError('network', 'The server could not be reached.', { cause: error });
    if (status >= 500) return new ApiError('server', `Server error (${status}).`, { cause: error });
    return new ApiError('rejected', `Request rejected (${status}).`, { cause: error });
  }
  return new ApiError('network', 'Unexpected request failure.', { cause: error });
}

function parse<T>(schema: z.ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new ApiError('invalidResponse', 'The server sent an unexpected response.', {
      cause: result.error,
    });
  }
  return result.data;
}

async function request<T>(schema: z.ZodType<T>, run: () => Promise<{ data: unknown }>): Promise<T> {
  try {
    const response = await run();
    return parse(schema, response.data);
  } catch (error) {
    throw toApiError(error);
  }
}

const withSignal = (signal: AbortSignal | undefined) => (signal ? { signal } : {});

export function submitMatch(match: MatchSubmission): Promise<SubmitResponse> {
  return request(submitResponseSchema, () => http.post('/matches', match));
}

export function fetchRanking(
  settings: MatchSettingsDto,
  page: number,
  signal?: AbortSignal,
): Promise<RankingPage> {
  return request(rankingPageSchema, () =>
    http.get('/ranking', {
      params: { ...settings, page, pageSize: PAGE_SIZE },
      ...withSignal(signal),
    }),
  );
}

export function fetchHistory(
  playerId: string,
  page: number,
  signal?: AbortSignal,
): Promise<HistoryPage> {
  return request(historyPageSchema, () =>
    http.get(`/players/${encodeURIComponent(playerId)}/matches`, {
      params: { page, pageSize: PAGE_SIZE },
      ...withSignal(signal),
    }),
  );
}
