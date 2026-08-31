/**
 * The favorited team's game log. Feature 3.
 *
 * On mount it runs the startup backfill (`refresh_history`), which fills in games that
 * finished while the app was closed, then renders the season's log from disk. Entries
 * marked `saved` open from the local snapshot and work with no network.
 */

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import * as api from '../lib/api';
import { errorMessage } from '../lib/api';
import type { HistoryEntry } from '../lib/types';
import { useAppStore } from '../store/useAppStore';

interface Props {
  favoriteTeamId: number | null;
}

export function HistoryLog({ favoriteTeamId }: Props) {
  const queryClient = useQueryClient();
  const openGame = useAppStore((s) => s.openGame);
  const [season, setSeason] = useState<string>('');
  const [backfilled, setBackfilled] = useState(0);

  const seasons = useQuery({
    queryKey: ['historySeasons', favoriteTeamId],
    queryFn: () => api.getHistorySeasons(favoriteTeamId!),
    enabled: favoriteTeamId != null,
  });

  const history = useQuery({
    queryKey: ['history', favoriteTeamId, season],
    queryFn: () => api.getHistory(favoriteTeamId!, season || undefined),
    enabled: favoriteTeamId != null,
  });

  const refresh = useMutation({
    mutationFn: () => api.refreshHistory(favoriteTeamId ?? undefined),
    onSuccess: (count) => {
      setBackfilled(count);
      queryClient.invalidateQueries({ queryKey: ['history'] });
      queryClient.invalidateQueries({ queryKey: ['historySeasons'] });
    },
  });

  // Backfill once per team when the log is opened.
  const refreshMutate = refresh.mutate;
  useEffect(() => {
    if (favoriteTeamId != null) refreshMutate();
  }, [favoriteTeamId, refreshMutate]);

  if (favoriteTeamId == null) {
    return (
      <section className="panel">
        <h2>History</h2>
        <p className="muted">
          Pick a favorite team in the sidebar and ballview will start logging its games here.
        </p>
      </section>
    );
  }

  const entries = history.data?.entries ?? [];

  return (
    <section className="panel">
      <header className="panel-head">
        <div>
          <h2>Game log</h2>
          {refresh.isPending && <span className="muted small">checking for new games…</span>}
          {!refresh.isPending && backfilled > 0 && (
            <span className="muted small">{backfilled} games up to date</span>
          )}
        </div>
        <div className="row gap">
          {(seasons.data?.length ?? 0) > 0 && (
            <select value={season} onChange={(e) => setSeason(e.target.value)}>
              <option value="">Current season</option>
              {seasons.data?.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          )}
          <button onClick={() => refresh.mutate()} disabled={refresh.isPending}>
            Refresh
          </button>
        </div>
      </header>

      {refresh.error && (
        <p className="error-inline small">
          Backfill failed: {errorMessage(refresh.error)}
        </p>
      )}

      {history.isPending && <p className="muted">Loading the log…</p>}
      {history.error && <p className="error-inline">{errorMessage(history.error)}</p>}

      {history.data && entries.length === 0 && (
        <p className="muted">
          No games logged yet for this season. They appear here once played.
        </p>
      )}

      {entries.length > 0 && (
        <ul className="history-list">
          {[...entries].reverse().map((entry) => (
            <HistoryRow
              key={entry.gamePk}
              entry={entry}
              teamId={favoriteTeamId}
              onOpen={() => openGame(entry.gamePk, entry.saved)}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function HistoryRow({
  entry,
  teamId,
  onOpen,
}: {
  entry: HistoryEntry;
  teamId: number;
  onOpen: () => void;
}) {
  const isHome = entry.homeTeamId === teamId;
  const opponent = isHome ? entry.awayTeam : entry.homeTeam;
  const us = isHome ? entry.homeScore : entry.awayScore;
  const them = isHome ? entry.awayScore : entry.homeScore;

  const outcome =
    entry.isFinal && us != null && them != null
      ? us > them
        ? 'W'
        : us < them
          ? 'L'
          : 'T'
      : null;

  return (
    <li>
      <button className="history-row" onClick={onOpen}>
        <span className="date muted small">{entry.gameDate ?? '—'}</span>
        <span className="opponent">
          {isHome ? 'vs' : '@'} {opponent ?? 'TBD'}
        </span>
        <span className="result">
          {outcome && <span className={`outcome ${outcome.toLowerCase()}`}>{outcome}</span>}
          {us != null && them != null && (
            <span className="score">
              {us}–{them}
            </span>
          )}
          {!entry.isFinal && <span className="muted small">{entry.status ?? 'Scheduled'}</span>}
        </span>
        <span className="flags">
          {entry.saved && <span className="badge saved" title="Saved offline">Saved</span>}
          {entry.gameType && entry.gameType !== 'R' && (
            <span className="badge type" title={gameTypeLabel(entry.gameType)}>
              {gameTypeLabel(entry.gameType)}
            </span>
          )}
        </span>
      </button>
    </li>
  );
}

/** MLB's gameType codes, as stored per entry so seasons can be filtered. */
function gameTypeLabel(code: string): string {
  const labels: Record<string, string> = {
    S: 'Spring',
    R: 'Regular',
    E: 'Exhibition',
    A: 'All-Star',
    F: 'Wild Card',
    D: 'Division',
    L: 'League',
    W: 'World Series',
    P: 'Playoff',
  };
  return labels[code] ?? code;
}
