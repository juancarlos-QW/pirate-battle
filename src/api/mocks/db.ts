import type {
  HistoryPage,
  MatchRecord,
  MatchSettingsDto,
  RankingEntry,
  RankingPage,
} from '../schemas.ts';

/**
 * In-memory store behind the mock API. Pure logic (no MSW, no storage) so it can be unit tested;
 * persistence is plugged in by the handlers.
 */
export class MockDatabase {
  private readonly matches = new Map<string, MatchRecord>();

  constructor(initial: readonly MatchRecord[] = []) {
    for (const match of initial) this.matches.set(match.id, match);
  }

  all(): MatchRecord[] {
    return [...this.matches.values()];
  }

  /** Inserts a match. Re-sending the same id is a no-op (idempotent retries). */
  insert(match: MatchRecord): MatchRecord {
    const existing = this.matches.get(match.id);
    if (existing) return existing;
    this.matches.set(match.id, match);
    return match;
  }

  /** Best match per player for the given settings, highest score first (earliest wins ties). */
  ranking(settings: MatchSettingsDto): RankingEntry[] {
    const best = new Map<string, MatchRecord>();
    for (const match of this.matches.values()) {
      if (!sameSettings(match.settings, settings)) continue;
      const current = best.get(match.playerId);
      if (!current || compareMatches(match, current) < 0) best.set(match.playerId, match);
    }
    return [...best.values()].sort(compareMatches).map((match, index) => ({
      rank: index + 1,
      matchId: match.id,
      playerId: match.playerId,
      captainName: match.captainName,
      score: match.score,
      playedAt: match.playedAt,
    }));
  }

  rankingPage(settings: MatchSettingsDto, page: number, pageSize: number): RankingPage {
    return paginate(this.ranking(settings), page, pageSize);
  }

  /** Rank of a player in the ranking for the given settings, or null if absent. */
  rankOf(playerId: string, settings: MatchSettingsDto): number | null {
    return this.ranking(settings).find((entry) => entry.playerId === playerId)?.rank ?? null;
  }

  historyPage(playerId: string, page: number, pageSize: number): HistoryPage {
    const items = [...this.matches.values()]
      .filter((match) => match.playerId === playerId)
      .sort((a, b) => b.playedAt.localeCompare(a.playedAt));
    return paginate(items, page, pageSize);
  }
}

function sameSettings(a: MatchSettingsDto, b: MatchSettingsDto): boolean {
  return a.sessionTime === b.sessionTime && a.spawnInterval === b.spawnInterval;
}

function compareMatches(a: MatchRecord, b: MatchRecord): number {
  return b.score - a.score || a.playedAt.localeCompare(b.playedAt);
}

export function paginate<T>(items: readonly T[], page: number, pageSize: number) {
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const current = Math.min(Math.max(1, page), totalPages);
  const start = (current - 1) * pageSize;
  return {
    items: items.slice(start, start + pageSize),
    page: current,
    pageSize,
    total: items.length,
    totalPages,
  };
}
