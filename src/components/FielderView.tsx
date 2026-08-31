/**
 * Defensive alignment and fielding credits. Feature 5.
 *
 * Two sources are combined: `linescore.defense` gives who is standing where right now,
 * and each play's `runners[].credits[]` gives who actually handled the ball. The
 * boxscore supplies season-to-date putout/assist/error totals for the game.
 */

import { useMemo } from 'react';

import type { Boxscore, BoxscorePlayer, LiveFeed, Play } from '../lib/types';

interface Props {
  feed: LiveFeed;
  boxscore?: Boxscore | null;
}

/** Diamond positions as percentages of the field graphic. */
const POSITION_LAYOUT: Record<string, { x: number; y: number; abbr: string }> = {
  pitcher: { x: 50, y: 62, abbr: 'P' },
  catcher: { x: 50, y: 88, abbr: 'C' },
  first: { x: 68, y: 52, abbr: '1B' },
  second: { x: 60, y: 40, abbr: '2B' },
  third: { x: 32, y: 52, abbr: '3B' },
  shortstop: { x: 40, y: 40, abbr: 'SS' },
  left: { x: 20, y: 20, abbr: 'LF' },
  center: { x: 50, y: 12, abbr: 'CF' },
  right: { x: 80, y: 20, abbr: 'RF' },
};

export function FielderView({ feed, boxscore }: Props) {
  const defense = feed.liveData?.linescore?.defense;
  const plays = feed.liveData?.plays?.allPlays ?? [];

  const credits = useMemo(() => collectCredits(plays), [plays]);
  const fieldingStats = useMemo(() => collectFieldingStats(boxscore), [boxscore]);

  if (!defense && credits.length === 0) {
    return <p className="muted">No fielding data available for this game yet.</p>;
  }

  return (
    <div className="fielder-view">
      {defense && (
        <section>
          <h3>
            On the field
            {defense.team?.name && <span className="muted small"> · {defense.team.name}</span>}
          </h3>
          <div className="field-diagram" role="img" aria-label="Defensive alignment">
            <div className="field-grass" />
            {Object.entries(POSITION_LAYOUT).map(([key, spot]) => {
              const player = (defense as Record<string, unknown>)[key] as
                | { fullName?: string | null }
                | undefined;
              if (!player?.fullName) return null;
              return (
                <div
                  key={key}
                  className="fielder-dot"
                  style={{ left: `${spot.x}%`, top: `${spot.y}%` }}
                  title={player.fullName}
                >
                  <span className="pos">{spot.abbr}</span>
                  <span className="who">{lastName(player.fullName)}</span>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {fieldingStats.length > 0 && (
        <section>
          <h3>Fielding line</h3>
          <table className="fielding-table">
            <thead>
              <tr>
                <th>Player</th>
                <th>Pos</th>
                <th>PO</th>
                <th>A</th>
                <th>E</th>
              </tr>
            </thead>
            <tbody>
              {fieldingStats.map((row) => (
                <tr key={row.id}>
                  <td>{row.name}</td>
                  <td>{row.position}</td>
                  <td>{row.putOuts}</td>
                  <td>{row.assists}</td>
                  <td className={row.errors > 0 ? 'has-error' : ''}>{row.errors}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <section>
        <h3>Plays in the field</h3>
        {credits.length === 0 ? (
          <p className="muted small">No fielding credits recorded yet.</p>
        ) : (
          <ul className="credit-list">
            {credits.map((c, i) => (
              <li key={i}>
                <span className="credit-play">{c.event}</span>
                <span className="credit-who">
                  {c.fielders.map((f, j) => (
                    <span key={j} className="credit-fielder">
                      {f.position} {f.name}
                      <span className="muted small"> ({f.credit})</span>
                    </span>
                  ))}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

interface CreditRow {
  event: string;
  fielders: { name: string; position: string; credit: string }[];
}

/** Pull every fielding credit out of the play log, newest first. */
function collectCredits(plays: Play[]): CreditRow[] {
  const rows: CreditRow[] = [];

  for (const play of plays) {
    const fielders: CreditRow['fielders'] = [];
    for (const runner of play.runners ?? []) {
      for (const credit of runner.credits ?? []) {
        const name = credit.player?.fullName;
        if (!name) continue;
        const entry = {
          name,
          position: credit.position?.abbreviation ?? credit.position?.code ?? '',
          credit: prettyCredit(credit.credit),
        };
        // The same fielder can be credited on several runners in one play.
        if (!fielders.some((f) => f.name === entry.name && f.credit === entry.credit)) {
          fielders.push(entry);
        }
      }
    }
    if (fielders.length > 0) {
      rows.push({ event: play.result?.event ?? 'Play', fielders });
    }
  }

  return rows.reverse();
}

interface FieldingRow {
  id: string;
  name: string;
  position: string;
  putOuts: number;
  assists: number;
  errors: number;
}

function collectFieldingStats(boxscore?: Boxscore | null): FieldingRow[] {
  if (!boxscore?.teams) return [];

  const rows: FieldingRow[] = [];
  for (const side of [boxscore.teams.away, boxscore.teams.home]) {
    for (const [key, player] of Object.entries(side?.players ?? {})) {
      const f = player.stats?.fielding;
      if (!f) continue;
      const putOuts = f.putOuts ?? 0;
      const assists = f.assists ?? 0;
      const errors = f.errors ?? 0;
      // Skip players who never touched the ball — a bench bat with an empty line
      // adds nothing but noise.
      if (putOuts === 0 && assists === 0 && errors === 0) continue;
      rows.push({
        id: key,
        name: displayName(player),
        position: player.position?.abbreviation ?? '',
        putOuts,
        assists,
        errors,
      });
    }
  }

  return rows.sort((a, b) => b.putOuts + b.assists - (a.putOuts + a.assists));
}

function displayName(player: BoxscorePlayer): string {
  return player.person?.fullName ?? player.person?.name ?? 'Unknown';
}

function lastName(full: string): string {
  const parts = full.trim().split(/\s+/);
  return parts[parts.length - 1] ?? full;
}

/** `f_fielded_ball` → `fielded ball`. */
function prettyCredit(credit?: string | null): string {
  if (!credit) return 'credit';
  return credit.replace(/^f_/, '').replace(/_/g, ' ');
}
