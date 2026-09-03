/**
 * The defensive alignment picture, on its own so three screens can share it.
 *
 * The live view shows it when a ball is put in play, and the replay hands over to it at
 * the end of an in-play pitch, with whoever handled the ball lit up and the batted ball
 * flying out to them. Keeping one copy means the marker positions only ever have to
 * agree with one drawing.
 */

import { useEffect, useRef, useState } from 'react';

import type { Boxscore, Defense, HitData, Play } from '../lib/types';
import { PlayerHeadshot } from './ui/PlayerHeadshot';

/**
 * Where each fielder stands, as percentages of the field graphic.
 *
 * These are keyed to the diamond drawn below — home at (50, 92), the bases at (64, 74),
 * (50, 58) and (36, 74), the mound at (50, 72) — so a marker lands on the dirt it names.
 * Middle infielders sit a step behind the baseline and the corners a step off the line,
 * which is where they actually play.
 */
export const POSITION_LAYOUT: Record<string, { x: number; y: number; abbr: string }> = {
  pitcher: { x: 50, y: 72, abbr: 'P' },
  catcher: { x: 50, y: 95, abbr: 'C' },
  first: { x: 70, y: 69, abbr: '1B' },
  second: { x: 61, y: 57, abbr: '2B' },
  third: { x: 30, y: 69, abbr: '3B' },
  shortstop: { x: 39, y: 57, abbr: 'SS' },
  left: { x: 20, y: 31, abbr: 'LF' },
  center: { x: 50, y: 22, abbr: 'CF' },
  right: { x: 80, y: 31, abbr: 'RF' },
};

interface Props {
  defense?: Defense | null;
  /** Position abbreviations to highlight — the fielders credited on a play. */
  highlight?: string[];
  /** Smaller markers and no names, for use beside other content. */
  compact?: boolean;
  /** Batted-ball data. When present the ball is flown out to where it was fielded. */
  hit?: HitData | null;
  /** Restart the flight whenever this changes — a new batted ball, or a replay. */
  flightKey?: string | number;
  /** Called once the ball reaches the fielder. */
  onLand?: () => void;
}

export function FieldDiagram({
  defense,
  highlight = [],
  compact = false,
  hit = null,
  flightKey,
  onLand,
}: Props) {
  if (!defense) return null;
  const lit = new Set(highlight);

  return (
    <div
      className={`field-diagram${compact ? ' compact' : ''}`}
      role="img"
      aria-label="Defensive alignment"
    >
      {/* The field is drawn rather than approximated with a gradient, so a fielder
          marker sits on the position it names instead of floating over a blur. */}
      <svg className="field-art" viewBox="0 0 100 100" preserveAspectRatio="none">
        <path className="field-outfield" d="M50 95 L4 42 A62 62 0 0 1 96 42 Z" />
        <path className="field-infield" d="M50 95 L24 66 A36 36 0 0 1 76 66 Z" />
        <path className="field-diamond" d="M50 92 L64 74 L50 58 L36 74 Z" />
        <circle className="field-mound" cx="50" cy="72" r="3.4" />
      </svg>

      {Object.entries(POSITION_LAYOUT).map(([key, spot]) => {
        const player = (defense as Record<string, unknown>)[key] as
          | { id?: number | null; fullName?: string | null }
          | undefined;
        if (!player?.fullName) return null;
        const active = lit.has(spot.abbr);
        return (
          <div
            key={key}
            className={`fielder-dot${active ? ' active' : ''}`}
            style={{ left: `${spot.x}%`, top: `${spot.y}%` }}
            title={player.fullName}
          >
            <PlayerHeadshot
              personId={player.id}
              name={player.fullName}
              size={compact ? 22 : 30}
            />
            <span className="pos">{spot.abbr}</span>
            {!compact && <span className="who">{lastName(player.fullName)}</span>}
          </div>
        );
      })}

      {hit && <BallFlight hit={hit} runKey={flightKey ?? 'flight'} onLand={onLand} />}
    </div>
  );
}

/* --- The batted ball ------------------------------------------------------- */

/**
 * MLB's hit coordinates are in the old stringer grid: home plate at (125.42, 198.27),
 * y growing *down* toward the backstop, roughly 2.5 feet to the unit.
 *
 * The scale is not documented, but it checks out against the same events' own
 * `totalDistance`: three fly balls in the fixture give 2.51, 2.48 and 2.50 ft per unit.
 */
const HC_HOME = { x: 125.42, y: 198.27 };
const FT_PER_UNIT = 2.5;
/** Radius the fence is drawn at, in feet — a ball hit further is simply on the wall. */
const WALL_FT = 400;

/** The drawn field: home, and the circle the outfield arc is a piece of. */
const DIAGRAM_HOME = { x: 50, y: 92 };
const ARC_CENTER = { x: 50, y: 83.6 };
const ARC_RADIUS = 62;
const ARC_HALF_ANGLE = Math.asin(46 / ARC_RADIUS);

/**
 * Where the ball was fielded, as a point on the diagram.
 *
 * Spray angle and distance are mapped separately: the angle is spread across the fan
 * between the two foul lines, and the distance is a fraction of the way out to the
 * fence. That keeps a ball down the line inside fair territory even though the drawing
 * is not to scale — the diamond in it is deliberately larger than a real one.
 */
function landingSpot(hit: HitData): { x: number; y: number } | null {
  const c = hit.coordinates;
  if (c?.coordX == null || c?.coordY == null) return null;

  const dx = c.coordX - HC_HOME.x;
  const dy = HC_HOME.y - c.coordY;
  // Behind the plate is a foul ball off the backstop; nothing to fly.
  if (dy <= 0) return null;

  const spray = Math.atan2(dx, dy);
  const t = clamp(spray / (Math.PI / 4), -1, 1);
  const angle = t * ARC_HALF_ANGLE;
  const fence = {
    x: ARC_CENTER.x + ARC_RADIUS * Math.sin(angle),
    y: ARC_CENTER.y - ARC_RADIUS * Math.cos(angle),
  };

  const feet = Math.hypot(dx, dy) * FT_PER_UNIT;
  const frac = clamp(feet / WALL_FT, 0.04, 1);
  return {
    x: DIAGRAM_HOME.x + (fence.x - DIAGRAM_HOME.x) * frac,
    y: DIAGRAM_HOME.y + (fence.y - DIAGRAM_HOME.y) * frac,
  };
}

/**
 * The ball leaving the bat, animated over the alignment.
 *
 * A shadow runs along the ground on the line the ball actually travelled while the ball
 * itself rides above it, higher and slower for a fly ball than for a one-hopper. Without
 * the pair, a top-down view of a 400-foot fly and a 30-foot roller look identical — the
 * separation between ball and shadow is the only cue for height there is.
 */
function BallFlight({
  hit,
  runKey,
  onLand,
}: {
  hit: HitData;
  runKey: string | number;
  onLand?: () => void;
}) {
  const spot = landingSpot(hit);
  const [progress, setProgress] = useState(0);
  const frame = useRef<number | null>(null);
  const landed = useRef(false);

  const angle = hit.launchAngle ?? 10;
  // A pop-up hangs; a ground ball is through the infield in a blink. Real hang times are
  // 1–6 seconds, and these are compressed toward the middle of that so neither extreme
  // is boring to watch.
  const durationMs = clamp(900 + angle * 22, 700, 2200);
  // Height on screen, in diagram units. Ground balls stay on the deck.
  const lift = clamp((angle / 45) * 13, 0, 15);

  useEffect(() => {
    landed.current = false;
    setProgress(0);
    let start: number | null = null;

    const step = (now: number) => {
      if (start == null) start = now;
      const p = Math.min(1, (now - start) / durationMs);
      setProgress(p);
      if (p < 1) {
        frame.current = requestAnimationFrame(step);
      } else if (!landed.current) {
        landed.current = true;
        onLand?.();
      }
    };

    frame.current = requestAnimationFrame(step);
    return () => {
      if (frame.current != null) cancelAnimationFrame(frame.current);
    };
    // Keyed on the batted ball, not on the callbacks, so a re-render mid-flight does not
    // restart it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runKey, durationMs, lift]);

  if (!spot) return null;

  // The ball decelerates into the fielder's glove; the shadow keeps pace with it.
  const eased = 1 - Math.pow(1 - progress, 1.7);
  const ground = {
    x: DIAGRAM_HOME.x + (spot.x - DIAGRAM_HOME.x) * eased,
    y: DIAGRAM_HOME.y + (spot.y - DIAGRAM_HOME.y) * eased,
  };
  const height = Math.sin(Math.PI * eased) * lift;

  return (
    <>
      {/* Stretched with the field art, so the line stays on the path the ball took. */}
      <svg className="ball-flight" viewBox="0 0 100 100" preserveAspectRatio="none">
        <line
          className="bf-path"
          x1={DIAGRAM_HOME.x}
          y1={DIAGRAM_HOME.y}
          x2={ground.x}
          y2={ground.y}
        />
      </svg>

      <span
        className="bf-shadow"
        style={{ left: `${ground.x}%`, top: `${ground.y}%`, opacity: 0.15 + 0.35 * (1 - height / 15) }}
      />
      <span
        className="bf-ball"
        style={{
          left: `${ground.x}%`,
          top: `${ground.y - height}%`,
          transform: `translate(-50%, -50%) scale(${1 + height / 18})`,
        }}
      />
      {progress >= 1 && (
        <span className="bf-mark" style={{ left: `${spot.x}%`, top: `${spot.y}%` }} />
      )}
    </>
  );
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

/**
 * The defence that was on the field for one particular play.
 *
 * `linescore.defense` is the *current* alignment, which is the wrong answer for anything
 * but the play in progress: replaying a top-of-the-9th at-bat with it puts the batting
 * team's own fielders on the diagram, because by then the sides have changed. The half
 * inning says who was fielding — the home team in the top — and the boxscore says who
 * they were.
 *
 * Two sources override the boxscore where they are authoritative for this play: the
 * matchup names the pitcher who actually threw it, and the fielding credits name whoever
 * touched the ball. What is left is a limitation worth knowing: the boxscore is
 * end-of-game, so a defensive substitution made in the 8th will appear in a replay of the
 * 2nd. The feed carries substitutions as events, but reconstructing the alignment
 * inning by inning is a bigger job than the picture is worth.
 */
export function alignmentForPlay(play?: Play | null, boxscore?: Boxscore | null): Defense | null {
  if (!play) return null;

  const fielding = play.about?.isTopInning !== false ? 'home' : 'away';
  const team = boxscore?.teams?.[fielding];
  const defense: Defense = { team: team?.team ?? null };

  for (const player of Object.values(team?.players ?? {})) {
    const key = POSITION_KEYS[player.position?.abbreviation ?? ''];
    // First writer wins: the batting order lists the starters, and a replacement at the
    // same position appears after them.
    if (key && player.person && !defense[key]) defense[key] = player.person;
  }

  if (play.matchup?.pitcher) defense.pitcher = play.matchup.pitcher;

  // A fielding credit names its player by id and link only — no `fullName` — so the id
  // is resolved back through the boxscore. Overriding with the bare credit would replace
  // a named fielder with an anonymous one, and the diagram draws nothing for a marker
  // with no name.
  for (const runner of play.runners ?? []) {
    for (const credit of runner.credits ?? []) {
      const key = POSITION_KEYS[credit.position?.abbreviation ?? ''];
      const person = team?.players?.[`ID${credit.player?.id}`]?.person;
      if (key && person?.fullName) defense[key] = person;
    }
  }

  // Nothing but a team name is not an alignment; let the caller render nothing.
  return defense.pitcher || defense.catcher ? defense : null;
}

/** Position abbreviation to the key `Defense` and `POSITION_LAYOUT` use. */
const POSITION_KEYS: Record<string, keyof Omit<Defense, 'team'>> = {
  P: 'pitcher',
  C: 'catcher',
  '1B': 'first',
  '2B': 'second',
  '3B': 'third',
  SS: 'shortstop',
  LF: 'left',
  CF: 'center',
  RF: 'right',
};

/** Position abbreviations credited with handling the ball on one play. */
export function creditedPositions(play?: Play | null): string[] {
  if (!play) return [];
  const out: string[] = [];
  for (const runner of play.runners ?? []) {
    for (const credit of runner.credits ?? []) {
      const abbr = credit.position?.abbreviation;
      if (abbr && !out.includes(abbr)) out.push(abbr);
    }
  }
  return out;
}

export function lastName(full: string): string {
  const parts = full.trim().split(/\s+/);
  return parts[parts.length - 1] ?? full;
}
