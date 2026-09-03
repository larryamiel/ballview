/**
 * The followed club's season as a calendar.
 *
 * The list answers "what happened on the 14th"; the calendar answers questions the list
 * is bad at — how long that road trip was, where the off-days fell, whether a bad week
 * was really a bad month. Same entries, laid out on the shape of the season.
 *
 * Months come from the entries themselves rather than a date library: a baseball season
 * is six months long and the log already knows which ones it covers.
 */

import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

import type { HistoryEntry } from '../lib/types';
import { TeamLogo } from './ui/TeamLogo';

interface Props {
  entries: HistoryEntry[];
  teamId: number;
  onOpen: (entry: HistoryEntry) => void;
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function GameCalendar({ entries, teamId, onOpen }: Props) {
  // One bucket per day. A doubleheader puts two entries on the same date, which the
  // cell shows stacked rather than silently dropping one.
  const byDate = useMemo(() => {
    const map = new Map<string, HistoryEntry[]>();
    for (const e of entries) {
      if (!e.gameDate) continue;
      const day = e.gameDate.slice(0, 10);
      const bucket = map.get(day);
      if (bucket) bucket.push(e);
      else map.set(day, [e]);
    }
    return map;
  }, [entries]);

  const months = useMemo(() => {
    const set = new Set<string>();
    for (const day of byDate.keys()) set.add(day.slice(0, 7));
    return [...set].sort();
  }, [byDate]);

  // Open on the most recent month with games in it.
  const [monthIndex, setMonthIndex] = useState(() => Math.max(0, months.length - 1));
  const month = months[Math.min(monthIndex, months.length - 1)];

  if (!month) return null;

  const cells = buildMonth(month);

  return (
    <div className="calendar">
      <header className="calendar-head">
        <button
          className="icon-only"
          onClick={() => setMonthIndex((i) => Math.max(0, i - 1))}
          disabled={monthIndex <= 0}
          title="Previous month"
        >
          <ChevronLeft size={16} />
        </button>
        <h3>{monthLabel(month)}</h3>
        <button
          className="icon-only"
          onClick={() => setMonthIndex((i) => Math.min(months.length - 1, i + 1))}
          disabled={monthIndex >= months.length - 1}
          title="Next month"
        >
          <ChevronRight size={16} />
        </button>
      </header>

      <div className="calendar-grid">
        {WEEKDAYS.map((d) => (
          <div key={d} className="calendar-weekday muted small">
            {d}
          </div>
        ))}

        {cells.map((day, i) =>
          day == null ? (
            <div key={`pad-${i}`} className="calendar-cell empty" />
          ) : (
            <DayCell
              key={day}
              day={day}
              games={byDate.get(day) ?? []}
              teamId={teamId}
              onOpen={onOpen}
            />
          ),
        )}
      </div>
    </div>
  );
}

function DayCell({
  day,
  games,
  teamId,
  onOpen,
}: {
  day: string;
  games: HistoryEntry[];
  teamId: number;
  onOpen: (entry: HistoryEntry) => void;
}) {
  return (
    <div className={`calendar-cell${games.length ? '' : ' off'}`}>
      <span className="calendar-date muted small">{Number(day.slice(8, 10))}</span>

      {games.map((game) => {
        const isHome = game.homeTeamId === teamId;
        const opponentId = isHome ? game.awayTeamId : game.homeTeamId;
        const opponent = isHome ? game.awayTeam : game.homeTeam;
        const us = isHome ? game.homeScore : game.awayScore;
        const them = isHome ? game.awayScore : game.homeScore;
        const outcome =
          game.isFinal && us != null && them != null
            ? us > them
              ? 'w'
              : us < them
                ? 'l'
                : 't'
            : null;

        return (
          <button
            key={game.gamePk}
            className={`calendar-game${outcome ? ` ${outcome}` : ''}`}
            onClick={() => onOpen(game)}
            title={`${isHome ? 'vs' : '@'} ${opponent ?? 'TBD'}${
              us != null && them != null ? ` · ${us}-${them}` : ''
            }`}
          >
            <span className="cg-side muted">{isHome ? 'vs' : '@'}</span>
            <TeamLogo teamId={opponentId} name={opponent} size={18} />
            {outcome ? (
              <span className="cg-score">
                <strong>{outcome.toUpperCase()}</strong> {us}-{them}
              </span>
            ) : (
              <span className="cg-score muted">—</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/**
 * The cells of one month, Monday-first, padded to the start of its first week.
 *
 * Dates are built at noon so a negative UTC offset cannot roll a cell into the day
 * before — the same trap the rest of the app avoids.
 */
function buildMonth(month: string): (string | null)[] {
  const [year, mon] = month.split('-').map(Number);
  const first = new Date(year, mon - 1, 1, 12);
  const daysInMonth = new Date(year, mon, 0, 12).getDate();
  // JS weeks start on Sunday; this grid starts on Monday.
  const lead = (first.getDay() + 6) % 7;

  const cells: (string | null)[] = Array(lead).fill(null);
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(`${month}-${String(d).padStart(2, '0')}`);
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function monthLabel(month: string): string {
  const [year, mon] = month.split('-').map(Number);
  return new Date(year, mon - 1, 1, 12).toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
  });
}
