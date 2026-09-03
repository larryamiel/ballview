/** Today's slate: live, upcoming, and final games. Features 1 and 10. */

import { ChevronLeft, ChevronRight, CalendarOff, MapPin, Star } from 'lucide-react';

import { useSchedule } from '../hooks/useLiveFeed';
import { teamColor } from '../lib/assets';
import type { GameSummary, ScheduleTeamSide } from '../lib/types';
import { useAppStore } from '../store/useAppStore';
import { EmptyState, ErrorState, Skeleton } from './ui/States';
import { TeamLogo } from './ui/TeamLogo';

interface Props {
  favoriteTeamId: number | null;
  pollMs: number;
}

export function GameList({ favoriteTeamId, pollMs }: Props) {
  const scheduleDate = useAppStore((s) => s.scheduleDate);
  const setScheduleDate = useAppStore((s) => s.setScheduleDate);
  const openGame = useAppStore((s) => s.openGame);

  const { data: games, isPending, error, refetch, isFetching } = useSchedule(scheduleDate, pollMs);

  const shiftDay = (days: number) => {
    const base = scheduleDate ? new Date(`${scheduleDate}T12:00:00`) : new Date();
    base.setDate(base.getDate() + days);
    setScheduleDate(base.toISOString().slice(0, 10));
  };

  // The followed club's game goes to the top. It is the one game the user opened the
  // app for, and hunting for it in a fifteen-game slate is the whole reason favourites
  // exist.
  const ordered = games
    ? [...games].sort(
        (a, b) => Number(involvesTeam(b, favoriteTeamId)) - Number(involvesTeam(a, favoriteTeamId)),
      )
    : [];

  const liveCount = games?.filter((g) => g.status?.abstractGameState === 'Live').length ?? 0;

  return (
    <section className="panel">
      <header className="panel-head">
        <div className="panel-title">
          <h2>{scheduleDate ? formatDate(scheduleDate) : "Today's games"}</h2>
          <p className="muted small">
            {games ? `${games.length} ${games.length === 1 ? 'game' : 'games'}` : 'Loading'}
            {liveCount > 0 && ` · ${liveCount} live now`}
            {isFetching && ' · updating…'}
          </p>
        </div>

        <div className="date-nav">
          <button className="icon-only" onClick={() => shiftDay(-1)} title="Previous day">
            <ChevronLeft size={16} />
          </button>
          <button className="btn" onClick={() => setScheduleDate('')} disabled={!scheduleDate}>
            Today
          </button>
          <button className="icon-only" onClick={() => shiftDay(1)} title="Next day">
            <ChevronRight size={16} />
          </button>
        </div>
      </header>

      {isPending && <Skeleton rows={5} height={78} />}

      {error && (
        <ErrorState title="Could not load the schedule." error={error} onRetry={() => refetch()} />
      )}

      {games && games.length === 0 && (
        <EmptyState icon={<CalendarOff size={22} />} title="No games scheduled">
          Nothing on the calendar for this date. Try the next day.
        </EmptyState>
      )}

      {ordered.length > 0 && (
        <ul className="game-list">
          {ordered.map((game) => (
            <GameCard
              key={`${game.gamePk}-${game.gameNumber ?? 1}`}
              game={game}
              favoriteTeamId={favoriteTeamId}
              // A game in progress opens on the live view; a final one on the log.
              onOpen={() =>
                openGame(game.gamePk, {
                  tab: game.status?.abstractGameState === 'Live' ? 'live' : 'plays',
                })
              }
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function GameCard({
  game,
  favoriteTeamId,
  onOpen,
}: {
  game: GameSummary;
  favoriteTeamId: number | null;
  onOpen: () => void;
}) {
  const isFavorite = involvesTeam(game, favoriteTeamId);
  const away = game.teams?.away;
  const home = game.teams?.home;
  const state = game.status?.abstractGameState;
  const live = state === 'Live';
  const final = state === 'Final';

  return (
    <li>
      <button
        className={`game-row${isFavorite ? ' favorite' : ''}${live ? ' is-live' : ''}`}
        onClick={onOpen}
        style={
          isFavorite ? { ['--row-accent' as string]: teamColor(favoriteTeamId) } : undefined
        }
        aria-label={`Open ${away?.team?.name ?? 'away'} at ${home?.team?.name ?? 'home'}`}
      >
        {isFavorite && (
          <span className="favorite-flag" title="Your team">
            <Star size={12} fill="currentColor" />
          </span>
        )}

        <span className="teams">
          <TeamLine side={away} showScore={live || final} showWinner={final} />
          <TeamLine side={home} showScore={live || final} showWinner={final} />
        </span>

        <span className="game-state">
          {live && <LiveState game={game} />}
          {final && (
            <span className="state-stack">
              <span className="badge final">Final</span>
              {game.venue?.name && (
                <span className="muted small venue">
                  <MapPin size={11} aria-hidden="true" /> {game.venue.name}
                </span>
              )}
            </span>
          )}
          {!live && !final && (
            <span className="state-stack">
              <span className="first-pitch">
                {formatFirstPitch(game) ?? game.status?.detailedState}
              </span>
              {game.venue?.name && (
                <span className="muted small venue">
                  <MapPin size={11} aria-hidden="true" /> {game.venue.name}
                </span>
              )}
            </span>
          )}
        </span>
      </button>
    </li>
  );
}

function TeamLine({
  side,
  showScore,
  showWinner,
}: {
  side?: ScheduleTeamSide | null;
  showScore: boolean;
  showWinner: boolean;
}) {
  const team = side?.team;
  const winner = showWinner && side?.isWinner === true;
  const record = side?.leagueRecord;

  return (
    <span className={`team-line${winner ? ' winner' : ''}`}>
      <TeamLogo teamId={team?.id} name={team?.name} abbreviation={team?.abbreviation} size={26} />
      <span className="team-name">{team?.name ?? team?.teamName ?? 'TBD'}</span>
      {record?.wins != null && record?.losses != null && (
        <span className="team-record muted small">
          {record.wins}-{record.losses}
        </span>
      )}
      {showScore && <span className="score">{side?.score ?? 0}</span>}
    </span>
  );
}

function LiveState({ game }: { game: GameSummary }) {
  const ls = game.linescore;
  // `inningState` is "Top"/"Bottom"/"Middle"/"End"; the ordinal is "7th".
  const half = ls?.inningState ?? ls?.inningHalf;
  const inning = ls?.currentInningOrdinal;
  return (
    <span className="state-stack live-state">
      <span className="badge live">
        <span className="live-dot" aria-hidden="true" /> Live
      </span>
      {half && inning && (
        <span className="inning">
          {half} {inning}
        </span>
      )}
      {typeof ls?.outs === 'number' && (
        <span className="muted small">
          {ls.outs} {ls.outs === 1 ? 'out' : 'outs'}
        </span>
      )}
    </span>
  );
}

function involvesTeam(game: GameSummary, teamId: number | null): boolean {
  if (teamId == null) return false;
  return game.teams?.away?.team?.id === teamId || game.teams?.home?.team?.id === teamId;
}

function formatDate(date: string): string {
  // Noon avoids the date shifting a day under a negative UTC offset.
  return new Date(`${date}T12:00:00`).toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

function formatFirstPitch(game: GameSummary): string | null {
  if (!game.gameDate) return null;
  const d = new Date(game.gameDate);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}
