/**
 * Ball-path preview for a single pitch. Feature 4.
 *
 * The Stats API ships the nine trajectory parameters Statcast fits to every tracked
 * pitch: position, velocity and acceleration at the 50-foot measurement plane. Under
 * constant acceleration those nine numbers describe the whole flight exactly, so the
 * path drawn here is the pitch that was actually thrown rather than an arc invented to
 * connect the release point to the plate.
 *
 * Two views are drawn from the same sampled points:
 *   - side view, distance from the plate against height, which shows drop;
 *   - overhead view, distance against horizontal deviation, which shows run.
 *
 * A dashed reference path accompanies each. That is the same pitch with spin removed —
 * identical release and velocity, gravity and drag only — so the gap between solid and
 * dashed *is* the movement, drawn rather than described.
 */

import { useEffect, useRef, useState } from 'react';
import { Pause, Play, RotateCcw } from 'lucide-react';

import type { PitchCoordinates, PlayEvent } from '../lib/types';

/** Front edge of the plate, in feet from the tip — where pX/pZ are measured. */
const PLATE_FRONT_Y = 17 / 12;
/** The rubber. Release happens a stride in front of it, hence `extension`. */
const RUBBER_Y = 60.5;
const GRAVITY = -32.174;
/** Plate half-width in feet (17 inches across). */
const PLATE_HALF_WIDTH = 0.708;
const SAMPLES = 72;

export interface TrajectoryPoint {
  t: number;
  /** Feet from centre, positive to the catcher's right. */
  x: number;
  /** Feet from the plate tip, counting down as the ball arrives. */
  y: number;
  /** Feet above the ground. */
  z: number;
}

/** True when a pitch carries enough tracking data to draw. */
export function hasTrajectory(pitch: PlayEvent): boolean {
  const c = pitch.pitchData?.coordinates;
  return (
    c?.x0 != null &&
    c?.y0 != null &&
    c?.z0 != null &&
    c?.vY0 != null &&
    c?.aY != null &&
    c.vY0 !== 0
  );
}

/**
 * Time at which the ball reaches a given distance from the plate.
 *
 * The quadratic has two roots; only one is the flight. The other lies far outside it —
 * the point where the drag model, extrapolated absurdly, turns the ball around — so the
 * root nearest t=0 is the physical one.
 */
function timeAtY(c: PitchCoordinates, y: number): number | null {
  const a = 0.5 * (c.aY ?? 0);
  const b = c.vY0 ?? 0;
  const k = (c.y0 ?? 50) - y;
  if (Math.abs(a) < 1e-9) return b === 0 ? null : -k / b;
  const disc = b * b - 4 * a * k;
  if (disc < 0) return null;
  const root = Math.sqrt(disc);
  const t1 = (-b - root) / (2 * a);
  const t2 = (-b + root) / (2 * a);
  return Math.abs(t1) <= Math.abs(t2) ? t1 : t2;
}

function positionAt(c: PitchCoordinates, t: number, spinless: boolean): TrajectoryPoint {
  const ax = spinless ? 0 : (c.aX ?? 0);
  const az = spinless ? GRAVITY : (c.aZ ?? GRAVITY);
  return {
    t,
    x: (c.x0 ?? 0) + (c.vX0 ?? 0) * t + 0.5 * ax * t * t,
    y: (c.y0 ?? 50) + (c.vY0 ?? 0) * t + 0.5 * (c.aY ?? 0) * t * t,
    z: (c.z0 ?? 0) + (c.vZ0 ?? 0) * t + 0.5 * az * t * t,
  };
}

/**
 * Sample the flight from release to the front of the plate.
 *
 * The measurement plane sits at 50 feet but the ball is released in front of the rubber,
 * further away than that, so the model is run backwards past t=0 to reach the hand. That
 * extrapolation is what every public Statcast visualisation does; `extension` gives the
 * stride length when the feed reports it, and 6 feet is the league-average stand-in.
 */
export function sampleTrajectory(
  c: PitchCoordinates,
  extension: number | null | undefined,
  spinless = false,
): TrajectoryPoint[] | null {
  const releaseY = RUBBER_Y - (extension ?? 6);
  const tStart = timeAtY(c, Math.max(releaseY, c.y0 ?? 50)) ?? 0;
  const tEnd = timeAtY(c, PLATE_FRONT_Y);
  if (tEnd == null || tEnd <= tStart) return null;

  const points: TrajectoryPoint[] = [];
  for (let i = 0; i <= SAMPLES; i++) {
    points.push(positionAt(c, tStart + ((tEnd - tStart) * i) / SAMPLES, spinless));
  }
  return points;
}

interface Props {
  pitch: PlayEvent;
  /** Height of the batter's zone, for the target box at the plate. */
  zoneTop?: number | null;
  zoneBottom?: number | null;
}

export function BallPath({ pitch, zoneTop, zoneBottom }: Props) {
  const coords = pitch.pitchData?.coordinates;
  const [playing, setPlaying] = useState(true);
  const [progress, setProgress] = useState(0);
  const frame = useRef<number | null>(null);

  const actual = coords ? sampleTrajectory(coords, pitch.pitchData?.extension) : null;
  const reference = coords ? sampleTrajectory(coords, pitch.pitchData?.extension, true) : null;
  const drawable = actual != null && reference != null;

  // Restart the animation whenever a different pitch is shown.
  const pitchKey = pitch.playId ?? `${pitch.pitchNumber}`;
  useEffect(() => {
    setProgress(0);
    setPlaying(true);
  }, [pitchKey]);

  useEffect(() => {
    if (!playing || !drawable) return;
    // Real flight is under half a second, which is too fast to read. Stretching it to
    // 1.6s keeps the shape of the pitch legible without turning it into a lazy lob.
    const durationMs = 1600;
    let start: number | null = null;

    const step = (now: number) => {
      if (start == null) start = now;
      const p = Math.min(1, (now - start) / durationMs);
      setProgress(p);
      if (p < 1) {
        frame.current = requestAnimationFrame(step);
      } else {
        setPlaying(false);
      }
    };

    frame.current = requestAnimationFrame(step);
    return () => {
      if (frame.current != null) cancelAnimationFrame(frame.current);
    };
  }, [playing, pitchKey, drawable]);

  if (!actual || !reference) {
    return <p className="muted small">No tracking data for this pitch.</p>;
  }

  const replay = () => {
    setProgress(0);
    setPlaying(true);
  };

  const horizontalBreak = coords?.pfxX ?? null;
  const verticalBreak = coords?.pfxZ ?? null;

  return (
    <div className="ball-path">
      <div className="ball-path-views">
        <PathView
          kind="side"
          label="Side view"
          caption="Release to plate — vertical drop"
          actual={actual}
          reference={reference}
          progress={progress}
          zoneTop={zoneTop}
          zoneBottom={zoneBottom}
        />
        <PathView
          kind="top"
          label="Overhead"
          caption="Release to plate — horizontal run"
          actual={actual}
          reference={reference}
          progress={progress}
        />
      </div>

      <div className="ball-path-bar">
        <button
          className="btn icon-btn"
          onClick={() => (playing ? setPlaying(false) : replay())}
        >
          {playing ? <Pause size={14} /> : <Play size={14} />}
          <span>{playing ? 'Pause' : 'Play'}</span>
        </button>
        <button className="btn icon-btn" onClick={replay} title="Replay" aria-label="Replay">
          <RotateCcw size={14} />
        </button>

        <span className="path-legend">
          <span className="legend-item">
            <span className="swatch solid" /> Thrown
          </span>
          <span className="legend-item">
            <span className="swatch dashed" /> No spin
          </span>
        </span>

        {(horizontalBreak != null || verticalBreak != null) && (
          <span className="muted small path-break">
            Movement:{' '}
            {horizontalBreak != null &&
              `${Math.abs(horizontalBreak).toFixed(1)} in ${horizontalBreak >= 0 ? 'right' : 'left'}`}
            {horizontalBreak != null && verticalBreak != null && ' · '}
            {verticalBreak != null &&
              `${Math.abs(verticalBreak).toFixed(1)} in ${verticalBreak >= 0 ? 'ride' : 'drop'}`}
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * One projection of the flight.
 *
 * Both views share a horizontal axis — distance from the plate — so the ball in the two
 * panels is always at the same point in its flight, read left to right.
 */
function PathView({
  kind,
  label,
  caption,
  actual,
  reference,
  progress,
  zoneTop,
  zoneBottom,
}: {
  kind: 'side' | 'top';
  label: string;
  caption: string;
  actual: TrajectoryPoint[];
  reference: TrajectoryPoint[];
  progress: number;
  zoneTop?: number | null;
  zoneBottom?: number | null;
}) {
  const width = 340;
  const height = kind === 'side' ? 160 : 112;
  const pad = { left: 10, right: 22, top: 12, bottom: 18 };

  const startY = actual[0].y;
  // Distance runs right to left in the data (55 ft → 1.4 ft) but left to right on
  // screen, so the axis is inverted here rather than at every call site.
  const toX = (y: number) =>
    pad.left + ((startY - y) / (startY - PLATE_FRONT_Y)) * (width - pad.left - pad.right);

  const vRange = kind === 'side' ? { min: 0, max: 7 } : { min: -3, max: 3 };
  const toY = (v: number) =>
    pad.top + ((vRange.max - v) / (vRange.max - vRange.min)) * (height - pad.top - pad.bottom);

  const value = (p: TrajectoryPoint) => (kind === 'side' ? p.z : p.x);
  const path = (pts: TrajectoryPoint[]) =>
    pts
      .map((p, i) => `${i === 0 ? 'M' : 'L'}${toX(p.y).toFixed(1)} ${toY(value(p)).toFixed(1)}`)
      .join(' ');

  const index = Math.min(actual.length - 1, Math.round(progress * (actual.length - 1)));
  const ball = actual[index];
  // The trail is the flight so far, which is what makes the motion readable at a glance.
  const trail = actual.slice(0, index + 1);

  return (
    <figure className="path-view">
      <figcaption>
        <span className="path-label">{label}</span>
        <span className="muted small">{caption}</span>
      </figcaption>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${label}. ${caption}.`}>
        {kind === 'side' ? (
          <>
            <line
              x1={pad.left}
              y1={toY(0)}
              x2={width - pad.right}
              y2={toY(0)}
              className="path-ground"
            />
            {zoneTop != null && zoneBottom != null && (
              <rect
                x={toX(PLATE_FRONT_Y) - 8}
                y={toY(zoneTop)}
                width={10}
                height={Math.max(2, toY(zoneBottom) - toY(zoneTop))}
                className="path-zone"
              />
            )}
          </>
        ) : (
          <>
            <line
              x1={pad.left}
              y1={toY(0)}
              x2={width - pad.right}
              y2={toY(0)}
              className="path-centre"
            />
            <rect
              x={toX(PLATE_FRONT_Y) - 8}
              y={toY(PLATE_HALF_WIDTH)}
              width={10}
              height={Math.max(2, toY(-PLATE_HALF_WIDTH) - toY(PLATE_HALF_WIDTH))}
              className="path-zone"
            />
          </>
        )}

        <path d={path(reference)} className="path-reference" />
        <path d={path(actual)} className="path-actual-ghost" />
        <path d={path(trail)} className="path-actual" />

        <circle cx={toX(ball.y)} cy={toY(value(ball))} r={5} className="path-ball" />
      </svg>
    </figure>
  );
}
