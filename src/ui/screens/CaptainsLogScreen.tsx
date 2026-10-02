import { useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { useHistory, useRanking } from '../../api/queries.ts';
import type { LogTab } from '../../app/navigation.ts';
import { getLastMatchId, getPlayerId } from '../../storage/playerStore.ts';
import { useOptions } from '../../storage/optionsStore.ts';
import { Button, IconButton } from '../components/Button.tsx';
import { Panel } from '../components/Panel.tsx';
import { useFocusOnMount } from '../hooks/useFocusOnMount.ts';
import { formatClock, formatPlayedAt, formatSeconds } from '../format.ts';
import { uiImage } from '../uiAssets.ts';

interface CaptainsLogScreenProps {
  readonly tab: LogTab;
  readonly onTabChange: (tab: LogTab) => void;
  readonly onBack: () => void;
}

const TABS: readonly { readonly id: LogTab; readonly label: string }[] = [
  { id: 'ranking', label: 'Ranking' },
  { id: 'history', label: 'Match history' },
];

/** Ranking and match history tabs (WAI-ARIA tabs pattern with arrow key navigation). */
export function CaptainsLogScreen({ tab, onTabChange, onBack }: CaptainsLogScreenProps) {
  const headingRef = useFocusOnMount<HTMLHeadingElement>();
  const tabRefs = useRef<Partial<Record<LogTab, HTMLButtonElement | null>>>({});

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    const index = TABS.findIndex((item) => item.id === tab);
    const next = TABS[(index + (event.key === 'ArrowRight' ? 1 : -1) + TABS.length) % TABS.length];
    if (!next) return;
    onTabChange(next.id);
    tabRefs.current[next.id]?.focus();
  };

  return (
    <Panel size="lg" className="captains-log">
      <h1 className="panel-title" ref={headingRef} tabIndex={-1}>
        Captain&apos;s log
      </h1>
      <div className="tabs" role="tablist" aria-label="Captain's log" onKeyDown={handleKeyDown}>
        {TABS.map((item) => (
          <Button
            key={item.id}
            ref={(element) => {
              tabRefs.current[item.id] = element;
            }}
            id={`log-tab-${item.id}`}
            role="tab"
            size="sm"
            variant={tab === item.id ? 'primary' : 'secondary'}
            aria-selected={tab === item.id}
            aria-controls={`log-panel-${item.id}`}
            tabIndex={tab === item.id ? 0 : -1}
            onClick={() => onTabChange(item.id)}
          >
            {item.label}
          </Button>
        ))}
      </div>
      <div
        className="captains-log__panel"
        role="tabpanel"
        id={`log-panel-${tab}`}
        aria-labelledby={`log-tab-${tab}`}
      >
        {tab === 'ranking' ? <RankingPanel /> : <HistoryPanel />}
      </div>
      <Button onClick={onBack}>Main menu</Button>
    </Panel>
  );
}

function RankingPanel() {
  const { sessionTime, spawnInterval } = useOptions();
  const [page, setPage] = useState(1);
  const query = useRanking({ sessionTime, spawnInterval }, page);
  const playerId = getPlayerId();
  const subtitle = `${sessionTime} second battles · ${formatSeconds(spawnInterval)} second spawn interval`;

  return (
    <LogContent
      subtitle={subtitle}
      query={query}
      emptyMessage="No battles recorded with these settings yet. Be the first!"
      page={page}
      onPageChange={setPage}
    >
      {(data) => (
        <table className="log-table log-table--ranking">
          <caption className="visually-hidden">Ranking, {subtitle}</caption>
          <thead>
            <tr>
              <th scope="col">Rank</th>
              <th scope="col">Captain</th>
              <th scope="col">Points</th>
              <th scope="col">Played</th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((entry) => {
              const mine = entry.playerId === playerId;
              const played = formatPlayedAt(entry.playedAt);
              return (
                <tr key={entry.matchId} className={mine ? 'log-table__row--mine' : undefined}>
                  <td className="log-table__rank">{String(entry.rank).padStart(2, '0')}</td>
                  <th scope="row" className="log-table__captain">
                    {entry.rank === 1 && (
                      <img src={uiImage('hud/icon_score')} alt="" className="log-table__star" />
                    )}
                    {entry.captainName}
                    {mine && <span className="log-table__you">You</span>}
                  </th>
                  <td className="log-table__points">{entry.score}</td>
                  <td className="log-table__muted">
                    {played.date} · {played.time}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </LogContent>
  );
}

function HistoryPanel() {
  const { captainName } = useOptions();
  const [page, setPage] = useState(1);
  const query = useHistory(page);
  const lastMatchId = getLastMatchId();
  const subtitle = `${captainName} · Your recent battles`;

  return (
    <LogContent
      subtitle={subtitle}
      query={query}
      emptyMessage="No battles yet. Set sail to start your log!"
      page={page}
      onPageChange={setPage}
    >
      {(data) => (
        <table className="log-table log-table--history">
          <caption className="visually-hidden">Match history, {subtitle}</caption>
          <thead>
            <tr>
              <th scope="col">Date</th>
              <th scope="col">Points</th>
              <th scope="col">Duration</th>
              <th scope="col">Result</th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((match) => {
              const played = formatPlayedAt(match.playedAt);
              const latest = match.id === lastMatchId;
              return (
                <tr key={match.id} className={latest ? 'log-table__row--mine' : undefined}>
                  <th scope="row">
                    {played.date} <span className="log-table__muted">· {played.time}</span>
                    {latest && <span className="log-table__you">Latest</span>}
                  </th>
                  <td className="log-table__points">{match.score}</td>
                  <td>{formatClock(match.duration)}</td>
                  <td className={`log-table__result log-table__result--${match.endReason}`}>
                    {match.endReason === 'timeUp' ? 'Time up' : 'Defeated'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </LogContent>
  );
}

interface PagedData {
  readonly items: readonly unknown[];
  readonly page: number;
  readonly totalPages: number;
}

interface LogContentProps<T extends PagedData> {
  readonly subtitle: string;
  readonly query: {
    readonly data: T | undefined;
    readonly isPending: boolean;
    readonly isError: boolean;
    readonly isPlaceholderData: boolean;
    readonly refetch: () => unknown;
  };
  readonly emptyMessage: string;
  readonly page: number;
  readonly onPageChange: (page: number) => void;
  readonly children: (data: T) => ReactNode;
}

/** Shared loading, error, empty and pagination handling for both tabs. */
function LogContent<T extends PagedData>({
  subtitle,
  query,
  emptyMessage,
  page,
  onPageChange,
  children,
}: LogContentProps<T>) {
  const { data } = query;
  let body: ReactNode;

  if (query.isPending) {
    body = (
      <p className="empty-state" role="status">
        Unrolling the charts…
      </p>
    );
  } else if (query.isError && !data) {
    body = (
      <div className="log-error" role="alert">
        <p>The harbour master can&apos;t be reached right now.</p>
        <Button variant="secondary" size="sm" onClick={() => void query.refetch()}>
          Try again
        </Button>
      </div>
    );
  } else if (!data || data.items.length === 0) {
    body = <p className="empty-state">{emptyMessage}</p>;
  } else {
    body = (
      <>
        <div className="log-table__scroll" aria-busy={query.isPlaceholderData}>
          {children(data)}
        </div>
        {data.totalPages > 1 && (
          <nav className="pager" aria-label="Pages">
            <IconButton
              icon="turn_left"
              label="Previous page"
              disabled={page <= 1 || query.isPlaceholderData}
              onClick={() => onPageChange(page - 1)}
            />
            <span className="pager__label" aria-live="polite">
              Page {data.page} of {data.totalPages}
            </span>
            <IconButton
              icon="turn_right"
              label="Next page"
              disabled={page >= data.totalPages || query.isPlaceholderData}
              onClick={() => onPageChange(page + 1)}
            />
          </nav>
        )}
      </>
    );
  }

  return (
    <>
      <p className="captains-log__subtitle">{subtitle}</p>
      {body}
    </>
  );
}
