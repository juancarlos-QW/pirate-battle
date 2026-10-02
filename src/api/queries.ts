import {
  keepPreviousData,
  QueryClient,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { enqueue, flushOutbox, remove } from '../storage/outbox.ts';
import { getPlayerId, setLastMatchId } from '../storage/playerStore.ts';
import { ApiError, fetchHistory, fetchRanking, submitMatch } from './client.ts';
import type { MatchSettingsDto, MatchSubmission } from './schemas.ts';

export const queryKeys = {
  ranking: (settings: MatchSettingsDto, page: number) =>
    ['ranking', settings.sessionTime, settings.spawnInterval, page] as const,
  history: (playerId: string, page: number) => ['history', playerId, page] as const,
};

const isRetryable = (error: unknown) => error instanceof ApiError && error.retryable;

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        retry: (failureCount, error) => failureCount < 2 && isRetryable(error),
        refetchOnWindowFocus: false,
      },
      mutations: {
        retry: (failureCount, error) => failureCount < 1 && isRetryable(error),
        retryDelay: 1000,
      },
    },
  });
}

export function useRanking(settings: MatchSettingsDto, page: number) {
  return useQuery({
    queryKey: queryKeys.ranking(settings, page),
    queryFn: ({ signal }) => fetchRanking(settings, page, signal),
    placeholderData: keepPreviousData,
  });
}

export function useHistory(page: number) {
  const playerId = getPlayerId();
  return useQuery({
    queryKey: queryKeys.history(playerId, page),
    queryFn: ({ signal }) => fetchHistory(playerId, page, signal),
    placeholderData: keepPreviousData,
  });
}

/**
 * Sends a finished match. If the server cannot be reached the result is kept in the outbox and
 * delivered later, so a bad connection never loses a score.
 */
export function useSubmitMatch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (match: MatchSubmission) => submitMatch(match),
    onMutate: (match) => {
      setLastMatchId(match.id);
      enqueue(match);
    },
    onSuccess: (_response, match) => {
      remove(match.id);
      void flushOutbox().finally(() => invalidateLog(queryClient));
    },
    onError: (error, match) => {
      // Invalid results are dropped; anything else stays queued for a later retry.
      if (!isRetryable(error)) remove(match.id);
    },
  });
}

export function invalidateLog(queryClient: QueryClient): Promise<void> {
  return queryClient.invalidateQueries({
    predicate: (query) => query.queryKey[0] === 'ranking' || query.queryKey[0] === 'history',
  });
}
