/**
 * Where the pitches of one at-bat crossed the plate, catcher's view.
 *
 * Shared rather than owned by a screen: the pitch tab uses it as a picker (clicking the
 * outlier in the dirt is a more natural way to ask "what was that?" than finding its
 * row) and the play log uses it as a static plot beside the sequence table. One copy
 * means the zone geometry only ever has to be right once.
 */

import type { PlayEvent } from '../lib/types';
import { hasTrajectory } from './BallPath';

/** Plate is 17in wide; in the API's feet-from-centre units that is ±0.708. */
export const PLATE_HALF_WIDTH = 0.708;
/**
 * Extent of the plot in feet — the zone plus enough margin to place a pitch that misses.
 *
 * Wide enough for a ball well off the plate, tight enough that the zone itself fills
 * most of the picture: a window twice this size renders a strike as a dot in a field of
 * empty grey, which is the opposite of what the plot is for.
 */
const PLOT_HALF_WIDTH = 1.7;
const PLOT_BOTTOM = 0.8;
const PLOT_TOP = 4.2;

/**
 * The strike zone's top and bottom are per-batter (the API sends them per pitch), so the
 * box is taken from the last pitch that reported them rather than being a fixed height.
 */
export function zoneBounds(pitches: PlayEvent[]): { top: number; bottom: number } {
  const source = [...pitches].reverse().find((p) => p.pitchData?.strikeZoneTop != null);
  return {
    top: source?.pitchData?.strikeZoneTop ?? 3.4,
    bottom: source?.pitchData?.strikeZoneBottom ?? 1.6,
  };
}

interface Props {
  pitches: PlayEvent[];
  selectedIndex?: number | null;
  /** Omitted where the plot is a picture rather than a picker. */
  onSelect?: (index: number) => void;
  width?: number;
  height?: number;
}

export function PitchPlot({
  pitches,
  selectedIndex = null,
  onSelect,
  width = 210,
  height = 250,
}: Props) {
  const located = pitches
    .map((p, i) => ({ pitch: p, index: i }))
    .filter(
      ({ pitch }) =>
        pitch.pitchData?.coordinates?.pX != null && pitch.pitchData?.coordinates?.pZ != null,
    );
  if (located.length === 0) return null;

  const zone = zoneBounds(pitches);
  const toX = (ft: number) => ((ft + PLOT_HALF_WIDTH) / (PLOT_HALF_WIDTH * 2)) * width;
  // SVG y grows downward, so a higher pitch needs a smaller y.
  const toY = (ft: number) => height - ((ft - PLOT_BOTTOM) / (PLOT_TOP - PLOT_BOTTOM)) * height;
  const pickable = (pitch: PlayEvent) => onSelect != null && hasTrajectory(pitch);

  return (
    <svg
      className="strike-zone"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label="Pitch locations, catcher's view"
    >
      <rect x={0} y={0} width={width} height={height} className="sz-bg" rx={8} />

      {/* The nine-box grid inside the zone is how a broadcast draws it, and it makes a
          borderline pitch legible without anyone measuring pixels. */}
      <g className="sz-grid">
        {[1, 2].map((n) => {
          const x =
            toX(-PLATE_HALF_WIDTH) + ((toX(PLATE_HALF_WIDTH) - toX(-PLATE_HALF_WIDTH)) * n) / 3;
          return <line key={`v${n}`} x1={x} y1={toY(zone.top)} x2={x} y2={toY(zone.bottom)} />;
        })}
        {[1, 2].map((n) => {
          const y = toY(zone.top) + ((toY(zone.bottom) - toY(zone.top)) * n) / 3;
          return (
            <line
              key={`h${n}`}
              x1={toX(-PLATE_HALF_WIDTH)}
              y1={y}
              x2={toX(PLATE_HALF_WIDTH)}
              y2={y}
            />
          );
        })}
      </g>

      <rect
        x={toX(-PLATE_HALF_WIDTH)}
        y={toY(zone.top)}
        width={toX(PLATE_HALF_WIDTH) - toX(-PLATE_HALF_WIDTH)}
        height={toY(zone.bottom) - toY(zone.top)}
        className="sz-box"
      />

      {/* Home plate in plan view, anchoring the picture to a real object. */}
      <polygon
        className="sz-plate"
        points={`${toX(-PLATE_HALF_WIDTH)},${height - 12} ${toX(PLATE_HALF_WIDTH)},${height - 12} ${toX(PLATE_HALF_WIDTH) - 6},${height - 5} ${toX(-PLATE_HALF_WIDTH) + 6},${height - 5}`}
      />

      {located.map(({ pitch, index }) => {
        const c = pitch.pitchData!.coordinates!;
        const selected = index === selectedIndex;
        return (
          <g
            key={pitch.playId ?? index}
            className={`sz-mark${pickable(pitch) ? ' clickable' : ''}${selected ? ' selected' : ''}`}
            onClick={() => pickable(pitch) && onSelect!(index)}
          >
            {selected && <circle cx={toX(c.pX!)} cy={toY(c.pZ!)} r={13} className="sz-halo" />}
            <circle
              cx={toX(c.pX!)}
              cy={toY(c.pZ!)}
              r={10}
              className={`sz-pitch ${pitchClass(pitch)}`}
            />
            <text x={toX(c.pX!)} y={toY(c.pZ!) + 3.5} className="sz-label">
              {pitch.pitchNumber ?? index + 1}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function pitchClass(p: PlayEvent): string {
  const d = p.details;
  if (d?.isInPlay) return 'in-play';
  if (d?.isStrike) return 'strike';
  if (d?.isBall) return 'ball';
  return '';
}
