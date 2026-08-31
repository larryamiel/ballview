/**
 * Per-pitch detail for one at-bat. Feature 4.
 *
 * Renders the pitch sequence as a table plus a strike-zone plot. Coordinates come from
 * the Stats API's own `pitchData` — Statcast (Phase 4b) is not required for this view.
 */

import type { LiveFeed, Play, PlayEvent } from '../lib/types';

/** Plate is 17in wide; in the API's feet-from-centre units that is ±0.708. */
const PLATE_HALF_WIDTH = 0.708;
/** Horizontal extent of the plot, in feet, giving some room outside the zone. */
const PLOT_HALF_WIDTH = 2.2;
const PLOT_BOTTOM = 0.5;
const PLOT_TOP = 4.5;

export function PitchView({ play }: { play: Play }) {
  const pitches = (play.playEvents ?? []).filter((e) => e.isPitch);

  if (pitches.length === 0) {
    return <p className="muted small">No pitch data for this play.</p>;
  }

  return (
    <div className="pitch-view">
      <StrikeZone pitches={pitches} />

      <table className="pitch-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Pitch</th>
            <th>Speed</th>
            <th>Result</th>
            <th>Count</th>
          </tr>
        </thead>
        <tbody>
          {pitches.map((p, i) => (
            <tr key={p.playId ?? i} className={pitchClass(p)}>
              <td>{p.pitchNumber ?? i + 1}</td>
              <td>{p.details?.type?.description ?? '—'}</td>
              <td>{p.pitchData?.startSpeed != null ? `${p.pitchData.startSpeed.toFixed(1)} mph` : '—'}</td>
              <td>{p.details?.description ?? p.details?.call?.description ?? '—'}</td>
              <td>
                {p.count?.balls ?? 0}-{p.count?.strikes ?? 0}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <HitDetail pitches={pitches} />
    </div>
  );
}

/**
 * Catcher's-eye view of the plate.
 *
 * The strike zone's top and bottom are per-batter (the API sends them per pitch), so the
 * box is drawn from the last pitch that reported them rather than a fixed rectangle.
 */
function StrikeZone({ pitches }: { pitches: PlayEvent[] }) {
  const located = pitches.filter(
    (p) => p.pitchData?.coordinates?.pX != null && p.pitchData?.coordinates?.pZ != null,
  );
  if (located.length === 0) return null;

  const zoneSource = [...located].reverse().find((p) => p.pitchData?.strikeZoneTop != null);
  const zoneTop = zoneSource?.pitchData?.strikeZoneTop ?? 3.4;
  const zoneBottom = zoneSource?.pitchData?.strikeZoneBottom ?? 1.6;

  const width = 180;
  const height = 220;
  const toX = (ft: number) => ((ft + PLOT_HALF_WIDTH) / (PLOT_HALF_WIDTH * 2)) * width;
  // SVG y grows downward, so a higher pitch needs a smaller y.
  const toY = (ft: number) => height - ((ft - PLOT_BOTTOM) / (PLOT_TOP - PLOT_BOTTOM)) * height;

  return (
    <svg
      className="strike-zone"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label="Pitch locations, catcher's view"
    >
      <rect x={0} y={0} width={width} height={height} className="sz-bg" />
      <rect
        x={toX(-PLATE_HALF_WIDTH)}
        y={toY(zoneTop)}
        width={toX(PLATE_HALF_WIDTH) - toX(-PLATE_HALF_WIDTH)}
        height={toY(zoneBottom) - toY(zoneTop)}
        className="sz-box"
      />
      {located.map((p, i) => {
        const c = p.pitchData!.coordinates!;
        return (
          <g key={p.playId ?? i}>
            <circle cx={toX(c.pX!)} cy={toY(c.pZ!)} r={9} className={`sz-pitch ${pitchClass(p)}`} />
            <text x={toX(c.pX!)} y={toY(c.pZ!) + 3.5} className="sz-label">
              {p.pitchNumber ?? i + 1}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/** Batted-ball detail, shown only for the pitch that was put in play. */
function HitDetail({ pitches }: { pitches: PlayEvent[] }) {
  const inPlay = pitches.find((p) => p.hitData != null);
  const hit = inPlay?.hitData;
  if (!hit) return null;

  const parts: string[] = [];
  if (hit.launchSpeed != null) parts.push(`${hit.launchSpeed.toFixed(1)} mph off the bat`);
  if (hit.launchAngle != null) parts.push(`${hit.launchAngle.toFixed(0)}° launch`);
  if (hit.totalDistance != null) parts.push(`${hit.totalDistance.toFixed(0)} ft`);
  if (hit.trajectory) parts.push(hit.trajectory.replace(/_/g, ' '));

  if (parts.length === 0) return null;
  return <p className="hit-detail muted small">{parts.join(' · ')}</p>;
}

function pitchClass(p: PlayEvent): string {
  const d = p.details;
  if (d?.isInPlay) return 'in-play';
  if (d?.isStrike) return 'strike';
  if (d?.isBall) return 'ball';
  return '';
}

/**
 * Every pitch in the game, most recent first, grouped by at-bat.
 *
 * The play-by-play tab answers "what happened"; this one answers "what was thrown".
 * Only at-bats that actually contain pitches appear, so warmup and substitution
 * entries do not pad the list.
 */
export function PitchFeed({ feed }: { feed: LiveFeed }) {
  const plays = feed.liveData?.plays?.allPlays ?? [];
  const withPitches = plays.filter((p) =>
    (p.playEvents ?? []).some((e) => e.isPitch),
  );

  if (withPitches.length === 0) {
    return <p className="muted">No pitches thrown yet.</p>;
  }

  return (
    <div className="pitch-feed">
      {[...withPitches].reverse().map((play, i) => (
        <section key={play.atBatIndex ?? i} className="pitch-at-bat">
          <h4>
            <span className="muted small">
              {play.about?.isTopInning !== false ? 'Top' : 'Bot'} {play.about?.inning ?? '?'}
            </span>{' '}
            {play.matchup?.batter?.fullName ?? 'Batter'}
            <span className="muted small"> vs {play.matchup?.pitcher?.fullName ?? 'Pitcher'}</span>
          </h4>
          <p className="muted small">{play.result?.description ?? 'In progress'}</p>
          <PitchView play={play} />
        </section>
      ))}
    </div>
  );
}
