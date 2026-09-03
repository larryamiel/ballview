/**
 * The favorited team's game log. Features 3 and 10.
 *
 * On mount it runs the startup backfill (`refresh_history`), which fills in games that
 * finished while the app was closed, then renders the season's log from disk. Entries
 * marked `saved` open from the local snapshot and work with no network.
 */

import { useEffect, useState, type CSSProperties } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CalendarDays,
  CalendarSearch,
  HardDriveDownload,
  List,
  RotateCw,
  Star,
} from 'lucide-react';

import { useStandings } from '../hooks/useLiveFeed';
import * as api from '../lib/api';
import { errorMessage } from '../lib/api';
import { teamColor } from '../lib/assets';
import type { HistoryEntry } from '../lib/types';
import { useAppStore } from '../store/useAppStore';
import { GameCalendar } from './GameCalendar';
import { EmptyState, Skeleton } from './ui/States';
import { TeamLogo } from './ui/TeamLogo';

interface Props {
  favoriteTeamId: number | null;
}

export function HistoryLog({ favoriteTeamId }: Props) {
  const queryClient = useQueryClient();
  const openGame = useAppStore((s) => s.openGame);
  const [season, setSeason] = useState<string>('');
  const [backfilled, setBackfilled] = useState(0);
  const [layout, setLayout] = useState<'list' | 'calendar'>('calendar');

  const seasons = useQuery({
    queryKey: ['historySeasons', favoriteTeamId],
    queryFn: () => api.getHistorySeasons(favoriteTeamId!),
    enabled: favoriteTeamId != null,
  });

  const standings = useStandings();

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
        <h2>My Team</h2>
        <EmptyState icon={<Star size={22} />} title="No team followed yet">
          Pick a club from the selector in the top right and ballview starts logging its
          games here — one line per game, kept on disk.
        </EmptyState>
      </section>
    );
  }

  const entries = history.data?.entries ?? [];
  const record = standings.data?.get(favoriteTeamId);
  const logged = tally(entries, favoriteTeamId);

  return (
    <section className="panel">
      <header
        className="panel-head log-head"
        style={{ ['--row-accent']: teamColor(favoriteTeamId) } as CSSProperties}
      >
        <div className="log-identity">
          <TeamLogo teamId={favoriteTeamId} name={record?.teamName} size={40} />
          <div className="panel-title">
            <h2>{record?.teamName ?? 'My Team'}</h2>
            <p className="muted small">
              {record ? `${record.wins}-${record.losses} overall` : 'Season record loading…'}
              {logged.games > 0 && ` · ${logged.wins}-${logged.losses} across ${logged.games} logged`}
              {refresh.isPending && ' · checking for new games…'}
              {!refresh.isPending && backfilled > 0 && ` · ${backfilled} games up to date`}
            </p>
          </div>
        </div>

        <div className="row gap">
          <span className="view-switch" role="group" aria-label="Layout">
            <button
              className={layout === 'list' ? 'vs active' : 'vs'}
              onClick={() => setLayout('list')}
            >
              <List size={14} aria-hidden="true" /> List
            </button>
            <button
              className={layout === 'calendar' ? 'vs active' : 'vs'}
              onClick={() => setLayout('calendar')}
            >
              <CalendarDays size={14} aria-hidden="true" /> Calendar
            </button>
          </span>

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
          <button className="btn" onClick={() => refresh.mutate()} disabled={refresh.isPending}>
            <RotateCw size={14} className={refresh.isPending ? 'spinning' : undefined} />
            Refresh
          </button>
        </div>
      </header>

      {refresh.error && (
        <p className="error-inline small">Backfill failed: {errorMessage(refresh.error)}</p>
      )}

      {history.isPending && <Skeleton rows={6} height={46} />}
      {history.error && <p className="error-inline">{errorMessage(history.error)}</p>}

      {history.data && entries.length === 0 && (
        <EmptyState icon={<CalendarSearch size={22} />} title="Nothing logged yet">
          Games appear here once they are played. Refresh backfills anything that finished
          while ballview was closed.
        </EmptyState>
      )}

      {entries.length > 0 && layout === 'calendar' && (
        <GameCalendar
          entries={entries}
          teamId={favoriteTeamId}
          onOpen={(entry) => openGame(entry.gamePk, { fromSnapshot: entry.saved })}
        />
      )}

      {entries.length > 0 && layout === 'list' && (
        <ul className="history-list">
          {[...entries].reverse().map((entry) => (
            <HistoryRow
              key={entry.gamePk}
              entry={entry}
              teamId={favoriteTeamId}
              onOpen={() => openGame(entry.gamePk, { fromSnapshot: entry.saved })}
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
  const opponentId = isHome ? entry.awayTeamId : entry.homeTeamId;
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
        <span className="date muted small">{formatShortDate(entry.gameDate)}</span>

        <span className="opponent">
          <span className="home-away muted small">{isHome ? 'vs' : '@'}</span>
          <TeamLogo teamId={opponentId} name={opponent} size={22} />
          <span className="opponent-name">{opponent ?? 'TBD'}</span>
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
          {entry.saved && (
            <span className="badge saved" title="Saved offline">
              <HardDriveDownload size={11} aria-hidden="true" /> Saved
            </span>
          )}
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

/**
 * The followed club's record across the games actually logged.
 *
 * Deliberately not the same number as the standings: the log holds only what ballview
 * has seen, so in a first season the two disagree. Showing both is more honest than
 * picking one and hoping.
 */
function tally(entries: HistoryEntry[], teamId: number) {
  let wins = 0;
  let losses = 0;
  let games = 0;
  for (const e of entries) {
    if (!e.isFinal) continue;
    const isHome = e.homeTeamId === teamId;
    const us = isHome ? e.homeScore : e.awayScore;
    const them = isHome ? e.awayScore : e.homeScore;
    if (us == null || them == null) continue;
    games++;
    if (us > them) wins++;
    else if (us < them) losses++;
  }
  return { wins, losses, games };
}

/** "2026-04-12" → "Apr 12". The year is already implied by the season selector. */
function formatShortDate(date?: string | null): string {
  if (!date) return '—';
  const d = new Date(`${date}T12:00:00`);
  if (Number.isNaN(d.getTime())) return date;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
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
