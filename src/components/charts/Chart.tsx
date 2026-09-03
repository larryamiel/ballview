/**
 * The plotting surface: line series over time, or a scatter of stat against stat.
 *
 * Hand-drawn SVG rather than a charting library, for the same reason the strike zone and
 * the field are: everything on screen here is a handful of scales and a path, the app
 * already draws harder pictures than this, and a library would add a few hundred
 * kilobytes to a desktop bundle to do it less specifically.
 *
 * Two modes share one set of axes. In `line` mode the x values are timestamps and the
 * points of a series are joined in order; in `scatter` mode each point stands alone and
 * carries a player's name. A second y axis appears only when a series asks for it, which
 * is what lets two stats on different scales — OPS and home runs, say — share a frame
 * without one of them being drawn as a flat line at the bottom.
 */

import { useMemo, useRef, useState } from 'react';

export interface ChartPoint {
  x: number;
  y: number;
  /** Shown in the tooltip above the values. */
  label?: string;
  /** Carried through to `onPointClick` — a game pk, a player id, whatever the caller needs. */
  meta?: unknown;
}

export interface ChartSeries {
  id: string;
  name: string;
  color: string;
  points: ChartPoint[];
  /** Draw against the right-hand axis instead of the left. */
  axis?: 'left' | 'right';
  /** Dashed, for the second stat in a two-stat comparison. */
  dashed?: boolean;
}

interface Props {
  series: ChartSeries[];
  mode: 'line' | 'scatter';
  xLabel?: string;
  yLabel?: string;
  /** Label for the right-hand axis, when any series uses it. */
  y2Label?: string;
  /** Format x values as dates rather than numbers. */
  xIsDate?: boolean;
  height?: number;
  onPointClick?: (series: ChartSeries, point: ChartPoint) => void;
}

const PAD = { top: 18, right: 58, bottom: 34, left: 54 };

export function Chart({
  series,
  mode,
  xLabel,
  yLabel,
  y2Label,
  xIsDate = false,
  height = 380,
  onPointClick,
}: Props) {
  const [width, setWidth] = useState(880);
  const [hover, setHover] = useState<{ s: ChartSeries; p: ChartPoint; px: number; py: number } | null>(
    null,
  );
  const box = useRef<HTMLDivElement | null>(null);

  // The SVG is drawn in CSS pixels so text stays crisp, which means the width has to be
  // measured rather than assumed.
  const measure = (node: HTMLDivElement | null) => {
    box.current = node;
    if (node) {
      const w = node.getBoundingClientRect().width;
      if (w > 0 && Math.abs(w - width) > 1) setWidth(w);
    }
  };

  const usesRight = series.some((s) => s.axis === 'right');
  const scales = useMemo(
    () => buildScales(series, width, height, usesRight),
    [series, width, height, usesRight],
  );

  const points = series.flatMap((s) => s.points);
  if (points.length === 0) {
    return (
      <div className="chart-empty muted" ref={measure}>
        Nothing to plot yet — pick a player and a stat.
      </div>
    );
  }

  const { xScale, yLeft, yRight, xTicks, leftTicks, rightTicks } = scales;
  const plotBottom = height - PAD.bottom;

  const yFor = (s: ChartSeries) => (s.axis === 'right' && yRight ? yRight : yLeft);

  /** Nearest point to the cursor, so the tooltip works without hitting a 4px circle. */
  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    let best: { s: ChartSeries; p: ChartPoint; d: number; px: number; py: number } | null = null;
    for (const s of series) {
      const scale = yFor(s);
      for (const p of s.points) {
        const px = xScale(p.x);
        const py = scale(p.y);
        const d = (px - mx) ** 2 + (py - my) ** 2;
        if (!best || d < best.d) best = { s, p, d, px, py };
      }
    }
    // Beyond about 40px the nearest point is not what the cursor is asking about.
    setHover(best && best.d < 1600 ? best : null);
  };

  return (
    <div className="chart" ref={measure}>
      <svg
        width={width}
        height={height}
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
        onClick={() => hover && onPointClick?.(hover.s, hover.p)}
        role="img"
        aria-label={`${yLabel ?? 'value'} by ${xLabel ?? 'x'}`}
      >
        {/* Horizontal rules only: vertical ones fight the series lines for attention. */}
        {leftTicks.map((t) => (
          <g key={`gl-${t}`}>
            <line
              className="chart-grid"
              x1={PAD.left}
              y1={yLeft(t)}
              x2={width - PAD.right}
              y2={yLeft(t)}
            />
            <text className="chart-tick" x={PAD.left - 8} y={yLeft(t) + 4} textAnchor="end">
              {formatNumber(t)}
            </text>
          </g>
        ))}

        {yRight &&
          rightTicks.map((t) => (
            <text
              key={`gr-${t}`}
              className="chart-tick right"
              x={width - PAD.right + 8}
              y={yRight(t) + 4}
            >
              {formatNumber(t)}
            </text>
          ))}

        {xTicks.map((t) => (
          <text key={`xt-${t}`} className="chart-tick" x={xScale(t)} y={height - 12} textAnchor="middle">
            {xIsDate ? formatDate(t) : formatNumber(t)}
          </text>
        ))}

        <line className="chart-axis" x1={PAD.left} y1={plotBottom} x2={width - PAD.right} y2={plotBottom} />

        {mode === 'line' &&
          series.map((s) => {
            const scale = yFor(s);
            const d = s.points
              .map((p, i) => `${i === 0 ? 'M' : 'L'}${xScale(p.x)},${scale(p.y)}`)
              .join(' ');
            return (
              <path
                key={s.id}
                className={`chart-line${s.dashed ? ' dashed' : ''}`}
                d={d}
                stroke={s.color}
                fill="none"
              />
            );
          })}

        {series.map((s) => {
          const scale = yFor(s);
          return s.points.map((p, i) => (
            <circle
              key={`${s.id}-${i}`}
              className="chart-dot"
              cx={xScale(p.x)}
              cy={scale(p.y)}
              r={mode === 'scatter' ? 6 : 3.5}
              fill={s.color}
            />
          ));
        })}

        {/* Scatter marks are the players themselves, so they carry their names. */}
        {mode === 'scatter' &&
          series.map((s) =>
            s.points.map((p, i) => (
              <text
                key={`lbl-${s.id}-${i}`}
                className="chart-point-label"
                x={xScale(p.x) + 9}
                y={yFor(s)(p.y) + 4}
              >
                {p.label ?? s.name}
              </text>
            )),
          )}

        {hover && (
          <circle
            className="chart-dot-hover"
            cx={hover.px}
            cy={hover.py}
            r={mode === 'scatter' ? 9 : 6}
            fill="none"
            stroke={hover.s.color}
          />
        )}

        {yLabel && (
          <text
            className="chart-axis-label"
            x={13}
            y={(PAD.top + height - PAD.bottom) / 2}
            textAnchor="middle"
            transform={`rotate(-90 13 ${(PAD.top + height - PAD.bottom) / 2})`}
          >
            {yLabel}
          </text>
        )}
        {y2Label && yRight && (
          <text
            className="chart-axis-label"
            x={width - 10}
            y={(PAD.top + height - PAD.bottom) / 2}
            textAnchor="middle"
            transform={`rotate(-90 ${width - 10} ${(PAD.top + height - PAD.bottom) / 2})`}
          >
            {y2Label}
          </text>
        )}
      </svg>

      {hover && (
        <div
          className="chart-tip"
          style={{
            left: Math.min(Math.max(hover.px, 70), width - 70),
            top: Math.max(hover.py - 12, 8),
          }}
        >
          <strong>{hover.s.name}</strong>
          <span>{hover.p.label ?? (xIsDate ? formatDate(hover.p.x) : formatNumber(hover.p.x))}</span>
          <span className="chart-tip-value">{formatNumber(hover.p.y)}</span>
        </div>
      )}

      <div className="chart-legend">
        {series.map((s) => (
          <span key={s.id} className="chart-key">
            <span className={`chart-swatch${s.dashed ? ' dashed' : ''}`} style={{ background: s.color }} />
            {s.name}
            {s.axis === 'right' && <span className="muted small"> (right)</span>}
          </span>
        ))}
      </div>

      {xLabel && <p className="chart-x-label muted small">{xLabel}</p>}
    </div>
  );
}

/* --- Scales ---------------------------------------------------------------- */

function buildScales(series: ChartSeries[], width: number, height: number, usesRight: boolean) {
  const all = series.flatMap((s) => s.points);
  const leftPoints = series.filter((s) => s.axis !== 'right').flatMap((s) => s.points);
  const rightPoints = series.filter((s) => s.axis === 'right').flatMap((s) => s.points);

  const xDomain = extent(all.map((p) => p.x));
  const leftDomain = padded(extent(leftPoints.map((p) => p.y)));
  const rightDomain = padded(extent(rightPoints.map((p) => p.y)));

  const x0 = PAD.left;
  const x1 = width - PAD.right;
  const y0 = height - PAD.bottom;
  const y1 = PAD.top;

  const xScale = (v: number) =>
    xDomain[1] === xDomain[0]
      ? (x0 + x1) / 2
      : x0 + ((v - xDomain[0]) / (xDomain[1] - xDomain[0])) * (x1 - x0);
  const scaleFor = (d: [number, number]) => (v: number) =>
    d[1] === d[0] ? (y0 + y1) / 2 : y0 - ((v - d[0]) / (d[1] - d[0])) * (y0 - y1);

  return {
    xScale,
    yLeft: scaleFor(leftDomain),
    yRight: usesRight && rightPoints.length > 0 ? scaleFor(rightDomain) : null,
    xTicks: ticks(xDomain[0], xDomain[1], 6),
    leftTicks: ticks(leftDomain[0], leftDomain[1], 5),
    rightTicks: ticks(rightDomain[0], rightDomain[1], 5),
  };
}

function extent(values: number[]): [number, number] {
  if (values.length === 0) return [0, 1];
  return [Math.min(...values), Math.max(...values)];
}

/**
 * A little air above and below the data.
 *
 * A series that never touches the frame is easier to read than one clipped to its own
 * extremes, and a flat series (every value identical) would otherwise have a zero-height
 * domain and divide by zero.
 */
function padded([min, max]: [number, number]): [number, number] {
  if (min === max) return [min - 1, max + 1];
  const room = (max - min) * 0.08;
  return [min - room, max + room];
}

/** Round tick values to something a person would choose: 1, 2, 2.5, 5, 10 × a power of ten. */
function ticks(min: number, max: number, count: number): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max) || min === max) return [min];
  const raw = (max - min) / count;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const normalized = raw / magnitude;
  const step =
    (normalized >= 7.5 ? 10 : normalized >= 3.5 ? 5 : normalized >= 1.5 ? 2 : 1) * magnitude;

  const out: number[] = [];
  for (let t = Math.ceil(min / step) * step; t <= max; t += step) {
    out.push(Number(t.toFixed(10)));
  }
  return out;
}

function formatNumber(v: number): string {
  if (Math.abs(v) >= 1000) return v.toFixed(0);
  if (Number.isInteger(v)) return String(v);
  // Rate stats live between .200 and 1.200 and are read to three places.
  return Math.abs(v) < 10 ? v.toFixed(3).replace(/^0\./, '.') : v.toFixed(1);
}

function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
