/**
 * The pitch as the umpire sees it: down the barrel, from behind the plate.
 *
 * Every other view in the app is a diagram — a plot, a chart, a plan of the field. This
 * one is a *picture*. The ball is projected through a pinhole camera sitting where the
 * umpire's head is, so a pitch released 55 feet away starts as a speck near the middle
 * of the frame and swells to a real baseball by the time it crosses the plate. That
 * growth is the whole point: it is what makes 95 mph legible on a static screen.
 *
 * The projection is honest rather than decorative. At the plate the divisor equals the
 * eye-to-plate distance, so the strike zone, the plate and the ball are all drawn at
 * exactly life size in feet; everything further away shrinks by the same 1/distance rule
 * a real lens applies. Nothing here is tuned by eye.
 */

import { useEffect, useRef, useState } from 'react';

import { sampleTrajectory, type TrajectoryPoint } from './BallPath';
import type { PlayEvent } from '../lib/types';

/** Front edge of the plate, in feet from the tip. The view plane sits here. */
const PLATE_FRONT_Y = 17 / 12;
/** Plate half-width in feet (17 inches across). */
const PLATE_HALF_WIDTH = 0.708;
/** A baseball is 2.9 inches across. */
const BALL_RADIUS_FT = 0.121;

/**
 * The umpire's eye: behind the plate, over the catcher, in his crouch.
 *
 * Four feet back is roughly where a plate umpire's head sits when he sets, and 4.3 ft is
 * the height of that crouch. Both numbers matter to the framing rather than just the
 * flavour: the eye height fixes the horizon, and everything below it — the top of the
 * zone at 3.4 ft, the plate on the ground — has to fit between that line and the bottom
 * of the frame. A standing eye height pushes the plate clean off the picture.
 */
const EYE = { x: 0, y: -4, z: 4.3 };
/** Eye-to-view-plane distance; everything at the plate projects 1:1 at this value. */
const FOCAL = PLATE_FRONT_Y - EYE.y;

/** Half-width of the frame in feet, measured at the plate. */
const FRAME_HALF_WIDTH = 2.6;

interface Projected {
  /** Feet, left-right, at the view plane. */
  x: number;
  /** Feet, up-down, relative to the eye's height. */
  y: number;
  /** Projected radius of a baseball at this distance, in feet. */
  r: number;
  /** True once the ball is in front of the eye and can be drawn at all. */
  visible: boolean;
}

function project(p: { x: number; y: number; z: number }): Projected {
  const depth = p.y - EYE.y;
  // A point level with or behind the eye has no valid projection; the flight never
  // reaches there, but guarding keeps a bad frame from producing an infinite radius.
  if (depth <= 0.1) return { x: 0, y: 0, r: 0, visible: false };
  const scale = FOCAL / depth;
  return {
    x: (p.x - EYE.x) * scale,
    y: (p.z - EYE.z) * scale,
    r: BALL_RADIUS_FT * scale,
    visible: true,
  };
}

interface Props {
  pitch: PlayEvent;
  zoneTop?: number | null;
  zoneBottom?: number | null;
  /** Restart the flight whenever this changes — a new pitch, or a manual replay. */
  runKey: string | number;
  /** Called once the ball reaches the plate. */
  onArrive?: () => void;
  /** Flight time on screen. Real time is ~0.4s, far too fast to watch. */
  durationMs?: number;
}

export function UmpireView({
  pitch,
  zoneTop,
  zoneBottom,
  runKey,
  onArrive,
  durationMs = 1400,
}: Props) {
  const coords = pitch.pitchData?.coordinates;
  const points = coords ? sampleTrajectory(coords, pitch.pitchData?.extension) : null;
  const [progress, setProgress] = useState(0);
  const frame = useRef<number | null>(null);
  const arrived = useRef(false);

  useEffect(() => {
    if (!points) return;
    arrived.current = false;
    setProgress(0);
    let start: number | null = null;

    const step = (now: number) => {
      if (start == null) start = now;
      const p = Math.min(1, (now - start) / durationMs);
      setProgress(p);
      if (p < 1) {
        frame.current = requestAnimationFrame(step);
      } else if (!arrived.current) {
        arrived.current = true;
        onArrive?.();
      }
    };

    frame.current = requestAnimationFrame(step);
    return () => {
      if (frame.current != null) cancelAnimationFrame(frame.current);
    };
    // `points` is derived fresh each render, so the run is keyed on the pitch instead.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runKey, durationMs]);

  if (!points) {
    return (
      <div className="umpire-view empty">
        <p className="muted small">No tracking data for this pitch.</p>
      </div>
    );
  }

  const width = 460;
  const height = 460;
  const scale = width / (FRAME_HALF_WIDTH * 2);
  const toPx = (ft: number) => width / 2 + ft * scale;
  // Screen y grows downward and the projection is measured up from the eye, so the
  // horizon — the eye's own height — sits at a fixed fraction of the frame. It is high
  // in the picture because the umpire is looking *down* at a plate 4.3 ft below him;
  // the ground fills most of the frame, exactly as it does from the crouch.
  const horizon = height * 0.17;
  const toPy = (ft: number) => horizon - ft * scale;

  const index = Math.min(points.length - 1, Math.round(progress * (points.length - 1)));
  const ball = project(points[index]);
  // A short trail reads as motion without smearing the whole flight across the frame.
  const trail = points
    .slice(Math.max(0, index - 14), index + 1)
    .map(project)
    .filter((p) => p.visible);

  const top = zoneTop ?? 3.4;
  const bottom = zoneBottom ?? 1.6;
  const zone = {
    left: toPx(-PLATE_HALF_WIDTH),
    right: toPx(PLATE_HALF_WIDTH),
    top: toPy(top - EYE.z),
    bottom: toPy(bottom - EYE.z),
  };

  return (
    <div className="umpire-view">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Pitch from behind the plate"
      >
        <defs>
          <radialGradient id="uv-sky" cx="50%" cy="38%" r="75%">
            <stop offset="0%" stopColor="#1b2532" />
            <stop offset="100%" stopColor="#0a0d12" />
          </radialGradient>
        </defs>
        <rect x={0} y={0} width={width} height={height} fill="url(#uv-sky)" />

        {/* The dirt meets the sky at the eye's own height, which is the horizon. */}
        <rect x={0} y={horizon} width={width} height={height - horizon} className="uv-ground" />
        <line x1={0} y1={horizon} x2={width} y2={horizon} className="uv-horizon" />

        {/* The dirt around home and the mound are real circles on the ground, projected
            like everything else, so the corridor between them reads as a ballpark
            rather than a flat brown slab. */}
        <GroundCircle cx={0} cy={0} radius={13} className="uv-dirt" toPx={toPx} toPy={toPy} />
        <GroundCircle cx={0} cy={60.5} radius={9} z={0.83} className="uv-mound" toPx={toPx} toPy={toPy} />
        <BatterBoxes toPx={toPx} toPy={toPy} />

        {/* The zone, life-size at the plate. Drawn behind the ball so a strike passes
            visibly *through* it rather than in front of it. */}
        <rect
          x={zone.left}
          y={zone.top}
          width={zone.right - zone.left}
          height={zone.bottom - zone.top}
          className="uv-zone"
        />
        <g className="uv-zone-grid">
          {[1, 2].map((n) => (
            <line
              key={`v${n}`}
              x1={zone.left + ((zone.right - zone.left) * n) / 3}
              y1={zone.top}
              x2={zone.left + ((zone.right - zone.left) * n) / 3}
              y2={zone.bottom}
            />
          ))}
          {[1, 2].map((n) => (
            <line
              key={`h${n}`}
              x1={zone.left}
              y1={zone.top + ((zone.bottom - zone.top) * n) / 3}
              x2={zone.right}
              y2={zone.top + ((zone.bottom - zone.top) * n) / 3}
            />
          ))}
        </g>

        {trail.map((p, i) => (
          <circle
            key={i}
            cx={toPx(p.x)}
            cy={toPy(p.y)}
            r={Math.max(0.6, p.r * scale)}
            className="uv-trail"
            opacity={((i + 1) / trail.length) * 0.45}
          />
        ))}

        {ball.visible && (
          <g className={`uv-ball ${resultClass(pitch)}`}>
            <circle cx={toPx(ball.x)} cy={toPy(ball.y)} r={Math.max(1.5, ball.r * scale)} />
            {/* A rim only reads once the ball is big enough to have one. */}
            {ball.r * scale > 5 && (
              <circle
                cx={toPx(ball.x)}
                cy={toPy(ball.y)}
                r={Math.max(1.5, ball.r * scale)}
                className="uv-ball-rim"
              />
            )}
          </g>
        )}
      </svg>
    </div>
  );
}

/**
 * A circle lying on the ground, drawn in perspective.
 *
 * Points behind the eye have no projection, so the near arc of a circle the umpire is
 * standing inside — the dirt around home — is simply dropped. What survives is the far
 * arc, whose ends project so far off frame that closing the polygon across them falls
 * well below the picture. The result is the correct shape without a clipping path.
 */
function GroundCircle({
  cx,
  cy,
  radius,
  z = 0,
  className,
  toPx,
  toPy,
}: {
  cx: number;
  cy: number;
  radius: number;
  z?: number;
  className: string;
  toPx: (ft: number) => number;
  toPy: (ft: number) => number;
}) {
  const ring: string[] = [];
  for (let i = 0; i <= 48; i++) {
    const a = (i / 48) * Math.PI * 2;
    const p = project({ x: cx + Math.cos(a) * radius, y: cy + Math.sin(a) * radius, z });
    if (!p.visible) continue;
    ring.push(`${toPx(p.x).toFixed(1)},${toPy(p.y).toFixed(1)}`);
  }
  if (ring.length < 3) return null;
  return <polygon points={ring.join(' ')} className={className} />;
}

/**
 * The chalk lines of the two batter's boxes.
 *
 * Home plate itself is *not* drawn, and that is deliberate: from a crouch 4.3 ft above
 * it and 4 ft behind, the plate sits roughly 40 degrees below the horizontal — outside
 * any frame frame tight enough to make the strike zone legible. Trying to include it
 * shrinks the zone to a postage stamp. The inner chalk lines run away from the camera
 * instead, entering frame at the far end and sweeping out through the bottom corners,
 * which anchors the foreground the way the plate would have.
 */
function BatterBoxes({
  toPx,
  toPy,
}: {
  toPx: (ft: number) => number;
  toPy: (ft: number) => number;
}) {
  // The inner edge of each box is 6 inches off the plate; the chalk is 3 inches wide.
  const inner = PLATE_HALF_WIDTH + 0.5;
  const chalk = 0.25;
  // Near end is clipped just in front of the eye, where the projection still resolves.
  const nearY = EYE.y + 0.8;
  const farY = 3.0;

  return (
    <g className="uv-chalk">
      {[-1, 1].map((side) => {
        const a = side * inner;
        const b = side * (inner + chalk);
        const corners = [
          { x: a, y: farY, z: 0 },
          { x: b, y: farY, z: 0 },
          { x: b, y: nearY, z: 0 },
          { x: a, y: nearY, z: 0 },
        ].map(project);
        if (corners.some((c) => !c.visible)) return null;
        const pts = corners
          .map((c) => `${toPx(c.x).toFixed(1)},${toPy(c.y).toFixed(1)}`)
          .join(' ');
        return <polygon key={side} points={pts} />;
      })}
    </g>
  );
}

function resultClass(p: PlayEvent): string {
  const d = p.details;
  if (d?.isInPlay) return 'in-play';
  if (d?.isStrike) return 'strike';
  if (d?.isBall) return 'ball';
  return '';
}

/** Exposed for the caller's own perspective maths — e.g. placing a label at the plate. */
export type { TrajectoryPoint };
