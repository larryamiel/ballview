/**
 * The box score: every player's line for this game, both sides.
 *
 * The tab it replaced showed the defensive alignment, which two other screens now draw
 * better — the replay puts the fielders on the field for the play you are watching. What
 * was missing was the thing every other baseball app opens with: what each player
 * actually did today.
 *
 * Read as a real box score is read. Batters come in batting order with substitutes
 * indented under the slot they took over, pitchers in the order they appeared, and the
 * team totals close each table. AVG and ERA are the *season* numbers, because a rate
 * computed over one game says nothing.
 */

import { useState } from 'react';

import type { Boxscore, BoxscorePlayer, BoxscoreTeam, PitchingStats } from '../lib/types';
import { PlayerHeadshot } from './ui/PlayerHeadshot';
import { TeamLogo } from './ui/TeamLogo';
import { EmptyState } from './ui/States';

interface Props {
  boxscore?: Boxscore | null;
  /** Names for the tabs, in case a side's own team record has not loaded. */
  awayName?: string | null;
  homeName?: string | null;
}

export function BoxScore({ boxscore, awayName, homeName }: Props) {
  const away = boxscore?.teams?.away;
  const home = boxscore?.teams?.home;
  // The away team bats first, so it is the one to open on.
  const [side, setSide] = useState<'away' | 'home'>('away');

  if (!away && !home) {
    return (
      <EmptyState title="No box score yet">
        Lines appear once the game is under way.
      </EmptyState>
    );
  }

  const team = side === 'away' ? away : home;

  return (
    <div className="boxscore">
      {/* One side at a time. Both at once means two eight-column tables side by side at
          half width, and neither is readable. */}
      <div className="box-switch view-switch" role="group" aria-label="Team">
        <button className={side === 'away' ? 'vs active' : 'vs'} onClick={() => setSide('away')}>
          <TeamLogo teamId={away?.team?.id} name={away?.team?.name ?? awayName} size={18} />
          {away?.team?.name ?? awayName ?? 'Away'}
        </button>
        <button className={side === 'home' ? 'vs active' : 'vs'} onClick={() => setSide('home')}>
          <TeamLogo teamId={home?.team?.id} name={home?.team?.name ?? homeName} size={18} />
          {home?.team?.name ?? homeName ?? 'Home'}
        </button>
      </div>

      {team ? <TeamBox team={team} /> : <p className="muted">No lines for this side.</p>}
    </div>
  );
}

function TeamBox({ team }: { team: BoxscoreTeam }) {
  const batters = orderedBatters(team);
  const pitchers = (team.pitchers ?? [])
    .map((id) => team.players?.[`ID${id}`])
    .filter((p): p is BoxscorePlayer => p != null);

  const totals = team.teamStats?.batting;
  const pitchTotals = team.teamStats?.pitching;

  return (
    <div className="box-tables">
      <section>
        <h3 className="box-head">Batting</h3>
        <table className="box-table">
          <thead>
            <tr>
              <th className="box-name">Player</th>
              <th>AB</th>
              <th>R</th>
              <th>H</th>
              <th>2B</th>
              <th>3B</th>
              <th>HR</th>
              <th>RBI</th>
              <th>BB</th>
              <th>SO</th>
              <th>SB</th>
              <th>LOB</th>
              <th>AVG</th>
              <th>OPS</th>
            </tr>
          </thead>
          <tbody>
            {batters.map(({ player, substitute }) => {
              const b = player.stats?.batting;
              const season = player.seasonStats?.batting;
              return (
                <tr key={player.person?.id ?? player.person?.fullName}>
                  <td className={`box-name${substitute ? ' sub' : ''}`}>
                    <PlayerHeadshot
                      personId={player.person?.id}
                      name={player.person?.fullName}
                      size={22}
                    />
                    <span className="box-player">
                      {player.person?.fullName ?? 'Player'}
                      <span className="muted small"> {player.position?.abbreviation ?? ''}</span>
                    </span>
                  </td>
                  <Num v={b?.atBats} />
                  <Num v={b?.runs} />
                  <Num v={b?.hits} />
                  <Num v={b?.doubles} />
                  <Num v={b?.triples} />
                  <Num v={b?.homeRuns} />
                  <Num v={b?.rbi} />
                  <Num v={b?.baseOnBalls} />
                  <Num v={b?.strikeOuts} />
                  <Num v={b?.stolenBases} />
                  <Num v={b?.leftOnBase} />
                  <td className="num muted">{season?.avg ?? '—'}</td>
                  <td className="num muted">{season?.ops ?? '—'}</td>
                </tr>
              );
            })}
          </tbody>
          {totals && (
            <tfoot>
              <tr>
                <td className="box-name">Totals</td>
                <Num v={totals.atBats} />
                <Num v={totals.runs} />
                <Num v={totals.hits} />
                <Num v={totals.doubles} />
                <Num v={totals.triples} />
                <Num v={totals.homeRuns} />
                <Num v={totals.rbi} />
                <Num v={totals.baseOnBalls} />
                <Num v={totals.strikeOuts} />
                <Num v={totals.stolenBases} />
                <Num v={totals.leftOnBase} />
                <td className="num">{totals.avg ?? '—'}</td>
                <td className="num">{totals.ops ?? '—'}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </section>

      <section>
        <h3 className="box-head">Pitching</h3>
        <table className="box-table">
          <thead>
            <tr>
              <th className="box-name">Pitcher</th>
              <th>IP</th>
              <th>H</th>
              <th>R</th>
              <th>ER</th>
              <th>BB</th>
              <th>SO</th>
              <th>HR</th>
              <th>BF</th>
              <th>P-S</th>
              <th>ERA</th>
            </tr>
          </thead>
          <tbody>
            {pitchers.map((player) => {
              const p = player.stats?.pitching;
              return (
                <tr key={player.person?.id ?? player.person?.fullName}>
                  <td className="box-name">
                    <PlayerHeadshot
                      personId={player.person?.id}
                      name={player.person?.fullName}
                      size={22}
                    />
                    <span className="box-player">
                      {player.person?.fullName ?? 'Pitcher'}
                      {decision(p) && <span className="box-decision">{decision(p)}</span>}
                    </span>
                  </td>
                  <td className="num">{p?.inningsPitched ?? '—'}</td>
                  <Num v={p?.hits} />
                  <Num v={p?.runs} />
                  <Num v={p?.earnedRuns} />
                  <Num v={p?.baseOnBalls} />
                  <Num v={p?.strikeOuts} />
                  <Num v={p?.homeRuns} />
                  <Num v={p?.battersFaced} />
                  <td className="num">
                    {p?.pitchesThrown != null ? `${p.pitchesThrown}-${p.strikes ?? 0}` : '—'}
                  </td>
                  <td className="num muted">{player.seasonStats?.pitching?.era ?? '—'}</td>
                </tr>
              );
            })}
          </tbody>
          {pitchTotals && (
            <tfoot>
              <tr>
                <td className="box-name">Totals</td>
                <td className="num">{pitchTotals.inningsPitched ?? '—'}</td>
                <Num v={pitchTotals.hits} />
                <Num v={pitchTotals.runs} />
                <Num v={pitchTotals.earnedRuns} />
                <Num v={pitchTotals.baseOnBalls} />
                <Num v={pitchTotals.strikeOuts} />
                <Num v={pitchTotals.homeRuns} />
                <Num v={pitchTotals.battersFaced} />
                <td className="num">—</td>
                <td className="num">{pitchTotals.era ?? '—'}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </section>

      <GameNotes team={team} />
    </div>
  );
}

/** The footnotes MLB prints under a real box score, kept in its own column. */
function GameNotes({ team }: { team: BoxscoreTeam }) {
  const sections = (team.info ?? []).filter((s) => (s.fieldList ?? []).length > 0);
  const notes = (team.note ?? []).filter((n) => n.value);
  if (sections.length === 0 && notes.length === 0) return null;

  return (
    <section className="box-notes">
      {sections.map((section) => (
        <div key={section.title ?? ''} className="box-note-block">
          <h4>{section.title ?? 'Notes'}</h4>
          <dl>
            {(section.fieldList ?? []).map((field, i) => (
              <div key={i}>
                <dt>{field.label}</dt>
                <dd>{field.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      ))}

      {notes.length > 0 && (
        <div className="box-note-block">
          <h4>Substitutions</h4>
          <ul className="muted small">
            {notes.map((n, i) => (
              <li key={i}>
                <strong>{n.label}</strong> {n.value}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

/**
 * Batters in batting order, substitutes under the slot they took.
 *
 * `battingOrder` is a string like `"100"` — hundreds are the lineup slot, and a non-zero
 * remainder marks a replacement in that slot. Sorting on the number alone therefore puts
 * a pinch hitter directly beneath the starter they hit for, which is exactly where a
 * printed box score puts them. Players who never batted have no order and are left out.
 */
function orderedBatters(team: BoxscoreTeam): { player: BoxscorePlayer; substitute: boolean }[] {
  const rows: { player: BoxscorePlayer; order: number; substitute: boolean }[] = [];

  for (const player of Object.values(team.players ?? {})) {
    const order = Number(player.battingOrder);
    if (!Number.isFinite(order) || order <= 0) continue;
    rows.push({ player, order, substitute: order % 100 !== 0 });
  }

  rows.sort((a, b) => a.order - b.order);
  return rows.map(({ player, substitute }) => ({ player, substitute }));
}

/** W, L or S beside the pitcher who got one. */
function decision(p?: PitchingStats | null): string | null {
  if (!p) return null;
  if (p.wins) return 'W';
  if (p.losses) return 'L';
  if (p.saves) return 'S';
  return null;
}

/** A counting stat, or an em dash. `0` is a real value and must survive. */
function Num({ v }: { v?: number | null }) {
  return <td className="num">{v ?? '—'}</td>;
}
