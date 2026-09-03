/**
 * The scoreboard at the top of a game: teams, score, state, and the inning grid.
 *
 * This is the one part of the app a viewer looks at constantly, so it is built to be
 * read at a glance and from across a desk — big tabular numerals, the club's own colour
 * as a rail, and the count/outs/bases in the shape a ballpark board uses.
 */

import { ChevronDown, ChevronUp, Circle, Radio, WifiOff } from 'lucide-react';

import { teamColor } from '../lib/assets';
import type { LiveFeed, Linescore, TeamStanding } from '../lib/types';
import { TeamLogo } from './ui/TeamLogo';

interface Props {
  feed: LiveFeed;
  offline: boolean;
  standings?: Map<number, TeamStanding>;
  /** Reduced to a single strip, so a long play log gets the height back. */
  condensed?: boolean;
  onToggle?: () => void;
}

export function ScoreBoard({ feed, offline, standings, condensed = false, onToggle }: Props) {
  const away = feed.gameData?.teams?.away;
  const home = feed.gameData?.teams?.home;
  const ls = feed.liveData?.linescore;
  const status = feed.gameData?.status;
  const live = status?.abstractGameState === 'Live';
  const final = status?.abstractGameState === 'Final';

  const awayRuns = ls?.teams?.away?.runs ?? 0;
  const homeRuns = ls?.teams?.home?.runs ?? 0;

  // Condensed keeps exactly what a viewer needs mid-scroll — who, the score, and where
  // the game stands — and drops the records and the inning grid, which are reference
  // material rather than the thing being watched.
  if (condensed) {
    return (
      <div className="scoreboard condensed">
        <span className="cs-team">
          <TeamLogo teamId={away?.id} name={away?.name} abbreviation={away?.abbreviation} size={22} />
          <span className="cs-abbr">{away?.abbreviation ?? 'AWY'}</span>
          <span className="cs-runs">{awayRuns}</span>
        </span>

        <span className="cs-state">
          {live ? (
            <>
              <span className="badge live">
                <span className="live-dot" aria-hidden="true" /> Live
              </span>
              <span>
                {ls?.inningState} {ls?.currentInningOrdinal}
              </span>
              <span className="count">
                {ls?.balls ?? 0}-{ls?.strikes ?? 0}
              </span>
              <Outs outs={ls?.outs ?? 0} />
              <Bases linescore={ls} />
            </>
          ) : (
            <span className={`badge ${final ? 'final' : 'preview'}`}>
              {status?.detailedState ?? '—'}
            </span>
          )}
        </span>

        <span className="cs-team right">
          <span className="cs-runs">{homeRuns}</span>
          <span className="cs-abbr">{home?.abbreviation ?? 'HOM'}</span>
          <TeamLogo teamId={home?.id} name={home?.name} abbreviation={home?.abbreviation} size={22} />
        </span>

        {onToggle && (
          <button className="scoreboard-toggle" onClick={onToggle} title="Expand the scoreboard">
            <ChevronDown size={15} />
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="scoreboard">
      <div className="scoreboard-main">
        <TeamScore
          teamId={away?.id}
          name={away?.name}
          abbreviation={away?.abbreviation}
          runs={awayRuns}
          record={away?.id != null ? standings?.get(away.id) : undefined}
          leading={final && awayRuns > homeRuns}
          side="away"
        />

        <div className="scoreboard-state">
          {live ? (
            <>
              <span className="badge live">
                <span className="live-dot" aria-hidden="true" /> Live
              </span>
              <span className="inning-big">
                {ls?.inningState} {ls?.currentInningOrdinal}
              </span>
              <div className="count-line">
                <span className="count">
                  {ls?.balls ?? 0}-{ls?.strikes ?? 0}
                </span>
                <Outs outs={ls?.outs ?? 0} />
                <Bases linescore={ls} />
              </div>
            </>
          ) : (
            <>
              <span className={`badge ${final ? 'final' : 'preview'}`}>
                {status?.detailedState ?? '—'}
              </span>
              {feed.gameData?.datetime?.officialDate && (
                <span className="muted small">{feed.gameData.datetime.officialDate}</span>
              )}
            </>
          )}

          {offline && (
            <span className="badge saved">
              <WifiOff size={11} aria-hidden="true" /> Offline snapshot
            </span>
          )}
          {!offline && live && (
            <span className="muted small refresh-note">
              <Radio size={11} aria-hidden="true" /> auto-refreshing
            </span>
          )}
        </div>

        <TeamScore
          teamId={home?.id}
          name={home?.name}
          abbreviation={home?.abbreviation}
          runs={homeRuns}
          record={home?.id != null ? standings?.get(home.id) : undefined}
          leading={final && homeRuns > awayRuns}
          side="home"
        />
      </div>

      <InningGrid
        linescore={ls}
        awayAbbr={away?.abbreviation ?? 'AWY'}
        homeAbbr={home?.abbreviation ?? 'HOM'}
      />

      {onToggle && (
        <button className="scoreboard-toggle" onClick={onToggle} title="Collapse the scoreboard">
          <ChevronUp size={15} />
        </button>
      )}
    </div>
  );
}

function TeamScore({
  teamId,
  name,
  abbreviation,
  runs,
  record,
  leading,
  side,
}: {
  teamId?: number | null;
  name?: string | null;
  abbreviation?: string | null;
  runs: number;
  record?: TeamStanding;
  leading: boolean;
  /** Which end of the scoreboard this club sits at; drives the mirrored layout. */
  side: 'away' | 'home';
}) {
  return (
    <div
      className={`team-score ${side}${leading ? ' leading' : ''}`}
      style={{ ['--team-accent' as string]: teamColor(teamId) }}
    >
      <TeamLogo teamId={teamId} name={name} abbreviation={abbreviation} size={44} />
      <div className="team-score-text">
        <span className="team-score-name">{name ?? 'Team'}</span>
        {record && (
          <span className="team-score-record muted small">
            {record.wins}-{record.losses}
            {record.streak ? ` · ${record.streak}` : ''}
          </span>
        )}
      </div>
      <span className="runs">{runs}</span>
    </div>
  );
}

/** Three pips; filled ones are outs recorded in the current half-inning. */
function Outs({ outs }: { outs: number }) {
  return (
    <span className="outs" role="img" aria-label={`${outs} ${outs === 1 ? 'out' : 'outs'}`}>
      {[0, 1, 2].map((i) => (
        <Circle
          key={i}
          size={9}
          className={i < outs ? 'out-pip filled' : 'out-pip'}
          fill={i < outs ? 'currentColor' : 'none'}
        />
      ))}
    </span>
  );
}

/** Runners on base, from `linescore.offense`. A filled diamond means occupied. */
export function Bases({ linescore }: { linescore?: Linescore | null }) {
  const offense = linescore?.offense;
  const on = {
    first: offense?.first != null,
    second: offense?.second != null,
    third: offense?.third != null,
  };
  const label = [on.first && 'first', on.second && 'second', on.third && 'third'].filter(Boolean);

  return (
    <span
      className="bases"
      role="img"
      aria-label={label.length ? `Runners on ${label.join(', ')}` : 'Bases empty'}
    >
      <span className={`base third${on.third ? ' occupied' : ''}`} />
      <span className={`base second${on.second ? ' occupied' : ''}`} />
      <span className={`base first${on.first ? ' occupied' : ''}`} />
    </span>
  );
}

/**
 * The inning-by-inning line, plus R/H/E.
 *
 * Extra innings widen the grid rather than wrapping it, and the row scrolls sideways on
 * a narrow window — a 15-inning game should not reflow the whole scoreboard.
 */
function InningGrid({
  linescore,
  awayAbbr,
  homeAbbr,
}: {
  linescore?: Linescore | null;
  awayAbbr: string;
  homeAbbr: string;
}) {
  const innings = linescore?.innings ?? [];
  if (innings.length === 0) return null;

  // A regulation game always shows nine columns even before they are played, so the
  // grid does not grow a column at a time as the game goes on.
  const count = Math.max(linescore?.scheduledInnings ?? 9, innings.length);
  const columns = Array.from({ length: count }, (_, i) => innings.find((n) => n.num === i + 1));

  return (
    <div className="inning-grid-wrap">
      <table className="inning-grid">
        <thead>
          <tr>
            {/* The stub corner stays empty, which is what a screen reader expects of a
                row-header column; a label here is announced before every single cell. */}
            <td className="corner" />
            {columns.map((_, i) => (
              <th key={i} scope="col">
                {i + 1}
              </th>
            ))}
            <th className="rhe" scope="col">R</th>
            <th className="rhe" scope="col">H</th>
            <th className="rhe" scope="col">E</th>
          </tr>
        </thead>
        <tbody>
          {(['away', 'home'] as const).map((side) => (
            <tr key={side}>
              <th scope="row">{side === 'away' ? awayAbbr : homeAbbr}</th>
              {columns.map((inning, i) => (
                <td key={i}>{inning?.[side]?.runs ?? (inning ? 0 : '')}</td>
              ))}
              <td className="rhe">{linescore?.teams?.[side]?.runs ?? 0}</td>
              <td className="rhe">{linescore?.teams?.[side]?.hits ?? 0}</td>
              <td className="rhe">{linescore?.teams?.[side]?.errors ?? 0}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
