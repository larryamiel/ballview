/** Today's slate: live, upcoming, and final games. Feature 1. */

import { useSchedule } from '../hooks/useLiveFeed';
import { errorMessage } from '../lib/api';
import type { GameSummary } from '../lib/types';
import { useAppStore } from '../store/useAppStore';

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

  return (
    <section className="panel">
      <header className="panel-head">
        <div>
          <h2>{scheduleDate ? formatDate(scheduleDate) : "Today's games"}</h2>
          {isFetching && <span className="muted small">updating…</span>}
        </div>
        <div className="row gap">
          <button onClick={() => shiftDay(-1)} title="Previous day">‹</button>
          <button onClick={() => setScheduleDate('')} disabled={!scheduleDate}>
            Today
          </button>
          <button onClick={() => shiftDay(1)} title="Next day">›</button>
        </div>
      </header>

      {isPending && <p className="muted">Loading the schedule…</p>}

      {error && (
        <div className="error-box">
          <p>Could not load the schedule.</p>
          <p className="muted small">{errorMessage(error)}</p>
          <button onClick={() => refetch()}>Try again</button>
        </div>
      )}

      {games && games.length === 0 && (
        <p className="muted">No games scheduled for this date.</p>
      )}

      {games && games.length > 0 && (
        <ul className="game-list">
          {games.map((game) => (
            <GameRow
              key={`${game.gamePk}-${game.gameNumber ?? 1}`}
              game={game}
              isFavorite={involvesTeam(game, favoriteTeamId)}
              onOpen={() => openGame(game.gamePk)}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function GameRow({
  game,
  isFavorite,
  onOpen,
}: {
  game: GameSummary;
  isFavorite: boolean;
  onOpen: () => void;
}) {
  const away = game.teams?.away;
  const home = game.teams?.home;
  const state = game.status?.abstractGameState;
  const live = state === 'Live';
  const final = state === 'Final';

  return (
    <li>
      <button
        className={`game-row${isFavorite ? ' favorite' : ''}`}
        onClick={onOpen}
        aria-label={`Open ${away?.team?.name ?? 'away'} at ${home?.team?.name ?? 'home'}`}
      >
        <span className="teams">
          <TeamLine
            name={away?.team?.name ?? away?.team?.teamName}
            score={away?.score}
            winner={final && away?.isWinner === true}
            showScore={live || final}
          />
          <TeamLine
            name={home?.team?.name ?? home?.team?.teamName}
            score={home?.score}
            winner={final && home?.isWinner === true}
            showScore={live || final}
          />
        </span>

        <span className="game-state">
          {live && <LiveState game={game} />}
          {final && <span className="badge final">Final</span>}
          {!live && !final && (
            <span className="muted">{formatFirstPitch(game) ?? game.status?.detailedState}</span>
          )}
        </span>
      </button>
    </li>
  );
}

function TeamLine({
  name,
  score,
  winner,
  showScore,
}: {
  name?: string | null;
  score?: number | null;
  winner: boolean;
  showScore: boolean;
}) {
  return (
    <span className={`team-line${winner ? ' winner' : ''}`}>
      <span className="team-name">{name ?? 'TBD'}</span>
      {showScore && <span className="score">{score ?? 0}</span>}
    </span>
  );
}

function LiveState({ game }: { game: GameSummary }) {
  const ls = game.linescore;
  // `inningState` is "Top"/"Bottom"/"Middle"/"End"; the ordinal is "7th".
  const half = ls?.inningState ?? ls?.inningHalf;
  const inning = ls?.currentInningOrdinal;
  return (
    <span className="live-state">
      <span className="badge live">Live</span>
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
  return (
    game.teams?.away?.team?.id === teamId || game.teams?.home?.team?.id === teamId
  );
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
