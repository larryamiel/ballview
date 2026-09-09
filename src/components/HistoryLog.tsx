/**
 * The followed club's season: every game, played and still to come.
 *
 * On mount it runs `refresh_history`, which now reads the club's **whole** season in one
 * request rather than only the days since the last logged game — so the log is a
 * schedule, not just a results archive. An unplayed game carries no score and a
 * first-pitch time instead; the row and the calendar cell both render that shape.
 *
 * The identity header (club, record, picker) belongs to `MyTeam`, which owns this and
 * the news and highlights beside it. What is left here is what is specific to the
 * schedule: which half of the season to look at, in which layout, for which year.
 */

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CalendarDays,
  CalendarSearch,
  HardDriveDownload,
  List,
  RotateCw,
} from 'lucide-react';

import { useStandings } from '../hooks/useLiveFeed';
import * as api from '../lib/api';
import { errorMessage } from '../lib/api';
import type { HistoryEntry } from '../lib/types';
import { useAppStore } from '../store/useAppStore';
import { GameCalendar } from './GameCalendar';
import { EmptyState, Skeleton } from './ui/States';
import { TeamLogo } from './ui/TeamLogo';

interface Props {
  favoriteTeamId: number | null;
}

/**
 * Which half of the season to show.
 *
 * "Upcoming" is not merely a filter but the reason this screen changed: a club's next
 * home stand is a different question from its last one, and answering both from one
 * undivided list means the thing you came for is always somewhere in the middle.
 */
type Range = 'all' | 'played' | 'upcoming';

const RANGES: { id: Range; label: string }[] = [
  { id: 'all', label: 'Season' },
  { id: 'played', label: 'Played' },
  { id: 'upcoming', label: 'Upcoming' },
];

export function HistoryLog({ favoriteTeamId }: Props) {
  const queryClient = useQueryClient();
  const openGame = useAppStore((s) => s.openGame);
  const [season, setSeason] = useState<string>('');
  const [layout, setLayout] = useState<'list' | 'calendar'>('calendar');
  const [range, setRange] = useState<Range>('all');

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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['history'] });
      queryClient.invalidateQueries({ queryKey: ['historySeasons'] });
    },
  });

  // Backfill once per team when the log is opened.
  const refreshMutate = refresh.mutate;
  useEffect(() => {
    if (favoriteTeamId != null) refreshMutate();
  }, [favoriteTeamId, refreshMutate]);

  const entries = useMemo(() => history.data?.entries ?? [], [history.data]);
  const shown = useMemo(() => {
    if (range === 'played') return entries.filter((e) => e.isFinal);
    if (range === 'upcoming') return entries.filter((e) => !e.isFinal);
    return entries;
  }, [entries, range]);

  if (favoriteTeamId == null) return null;

  const record = standings.data?.get(favoriteTeamId);
  const logged = tally(entries, favoriteTeamId);
  const remaining = entries.filter((e) => !e.isFinal).length;

  return (
    <div className="schedule-panel">
      <div className="panel-head">
        <div className="panel-title">
          <h3>Schedule</h3>
          <p className="muted small">
            {logged.games > 0
              ? `${logged.wins}-${logged.losses} in ${logged.games} regular-season games`
              : 'No games played yet'}
            {remaining > 0 && ` · ${remaining} to come`}
            {refresh.isPending && ' · checking for new games…'}
          </p>
        </div>

        <div className="row gap">
          <span className="view-switch" role="group" aria-label="Which games">
            {RANGES.map((r) => (
              <button
                key={r.id}
                className={range === r.id ? 'vs active' : 'vs'}
                onClick={() => setRange(r.id)}
              >
                {r.label}
              </button>
            ))}
          </span>

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
      </div>

      {refresh.error && (
        <p className="error-inline small">Backfill failed: {errorMessage(refresh.error)}</p>
      )}

      {history.isPending && <Skeleton rows={6} height={46} />}
      {history.error && <p className="error-inline">{errorMessage(history.error)}</p>}

      {history.data && shown.length === 0 && (
        <EmptyState icon={<CalendarSearch size={22} />} title="Nothing to show">
          {range === 'upcoming'
            ? 'Every game on this season’s schedule has been played.'
            : range === 'played'
              ? 'The season has not started yet.'
              : 'Refresh pulls the club’s whole season, played and still to come.'}
        </EmptyState>
      )}

      {shown.length > 0 && layout === 'calendar' && (
        <GameCalendar
          entries={shown}
          teamId={favoriteTeamId}
          onOpen={(entry) => openGame(entry.gamePk, { fromSnapshot: entry.saved })}
        />
      )}

      {shown.length > 0 && layout === 'list' && (
        <ul className="history-list">
          {orderForReading(shown, range).map((entry) => (
            <HistoryRow
              key={entry.gamePk}
              entry={entry}
              teamId={favoriteTeamId}
              onOpen={() => openGame(entry.gamePk, { fromSnapshot: entry.saved })}
            />
          ))}
        </ul>
      )}

      {record && (
        <p className="muted small schedule-foot">
          Standings say {record.wins}-{record.losses}. The line above counts only the
          regular-season games logged here, which is the same thing once a season has been
          followed from the start. The calendar itself shows every game on the schedule,
          spring training and postseason included.
        </p>
      )}
    </div>
  );
}

/**
 * The order a list of games wants to be read in.
 *
 * Results read newest-first — the last game is the one you are asking about. A schedule
 * reads oldest-first, because the next game is the one you are asking about, and putting
 * the end of October on top buries it. "Season" keeps the results order and lets the
 * upcoming games trail off the top, which is where the boundary between them naturally
 * falls.
 */
function orderForReading(entries: HistoryEntry[], range: Range): HistoryEntry[] {
  return range === 'upcoming' ? [...entries] : [...entries].reverse();
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
      <button className={`history-row${entry.isFinal ? '' : ' upcoming'}`} onClick={onOpen}>
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
          {/* An unplayed game shows first pitch, which is the only thing anyone wants
              from it. Its "status" is the word "Scheduled", which says nothing. */}
          {!entry.isFinal && (
            <span className="muted small">
              {firstPitch(entry) ?? entry.status ?? 'Scheduled'}
            </span>
          )}
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
 * First pitch in the viewer's own timezone.
 *
 * The one place in the app where the machine's local time is the right answer: this is
 * "when should I be watching", which is a question about where the viewer is sitting.
 * Every *date* elsewhere still comes from US Eastern, because a baseball day is a US
 * concept — but a clock time is not a day.
 */
export function firstPitch(entry: HistoryEntry): string | null {
  if (entry.status && /postponed|cancel|suspend|delay/i.test(entry.status)) return entry.status;
  if (!entry.startTime) return null;
  const at = new Date(entry.startTime);
  if (Number.isNaN(at.getTime())) return null;
  return at.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

/**
 * The followed club's **regular-season** record across the games logged.
 *
 * Unplayed games are skipped, and so is everything that is not `gameType: 'R'`. That
 * second filter is load-bearing now that the log holds the club's whole calendar year:
 * spring training and exhibition results used to fall outside the old 30-day backfill
 * window and so never reached this sum, but a full-season log carries them, and counting
 * them produced a record that disagreed with the standings by thirty games. A W-L is
 * understood to mean the regular season, so that is what this counts.
 */
function tally(entries: HistoryEntry[], teamId: number) {
  let wins = 0;
  let losses = 0;
  let games = 0;
  for (const e of entries) {
    if (!e.isFinal) continue;
    if (e.gameType !== 'R') continue;
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
