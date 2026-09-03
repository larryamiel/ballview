/**
 * Player charts and comparisons.
 *
 * Two shapes of question, one screen:
 *
 * - **Over time** — a stat per player as the season goes along. "Ohtani and
 *   Crow-Armstrong's OPS through August, day by day." The zoom control re-buckets game,
 *   day, week or month without going back to the network, because the whole season's game
 *   log is already in hand.
 * - **Stat against stat** — one point per player over a window. "Home runs against stolen
 *   bases for these six players in July."
 *
 * A pitcher can also chart release speed, which comes from Statcast rather than from a
 * box score, and behaves like any other series once it is bucketed.
 */

import { useEffect, useMemo, useState } from 'react';
import { useQueries, useQuery } from '@tanstack/react-query';
import { LineChart, Scan, Search, X } from 'lucide-react';

import * as api from '../lib/api';
import type { PlayerRef } from '../lib/types';
import { Chart, type ChartSeries } from './charts/Chart';
import {
  bucketGameLog,
  bucketVelocity,
  findStat,
  statsFor,
  VELOCITY_STAT,
  type Bucket,
  type StatGroup,
} from './charts/stats';
import { PlayerHeadshot } from './ui/PlayerHeadshot';
import { TeamLogo } from './ui/TeamLogo';

/** Distinct at a glance on a dark ground, and distinguishable to most colour-blind eyes. */
const COLORS = ['#58a6ff', '#f0b429', '#3fb950', '#ff7b72', '#bc8cff', '#39c5cf'];

type Mode = 'time' | 'scatter';

export function PlayerCompare() {
  const [mode, setMode] = useState<Mode>('time');
  const [group, setGroup] = useState<StatGroup>('hitting');
  const [players, setPlayers] = useState<PlayerRef[]>([]);
  const [bucket, setBucket] = useState<Bucket>('game');
  const [yStat, setYStat] = useState('ops');
  const [xStat, setXStat] = useState('homeRuns');
  /** The optional second series in time mode — the "two stats" case. */
  const [y2Stat, setY2Stat] = useState<string | null>(null);
  const [range, setRange] = useState(() => defaultRange());

  const season = range.end.slice(0, 4);
  const available = statsFor(group);

  // Switching group invalidates any stat that belonged to the other one.
  useEffect(() => {
    const keys = statsFor(group).map((s) => s.key);
    if (!keys.includes(yStat)) setYStat(group === 'hitting' ? 'ops' : 'era');
    if (!keys.includes(xStat)) setXStat(group === 'hitting' ? 'homeRuns' : 'strikeOuts');
    if (y2Stat && !keys.includes(y2Stat)) setY2Stat(null);
  }, [group, xStat, yStat, y2Stat]);

  /* --- Time mode: one game log per player, bucketed locally ---------------- */
  const logs = useQueries({
    queries: players.map((p) => ({
      queryKey: ['gameLog', p.id, group, season],
      queryFn: () => api.getPlayerGameLog(p.id, group, season),
      enabled: mode === 'time' && yStat !== VELOCITY_STAT.key,
      staleTime: 10 * 60 * 1000,
    })),
  });

  const velocities = useQueries({
    queries: players.map((p) => ({
      queryKey: ['pitchSpeeds', p.id, range.start, range.end],
      queryFn: () => api.getPitchSpeeds(p.id, range.start, range.end),
      enabled: mode === 'time' && yStat === VELOCITY_STAT.key,
      staleTime: 30 * 60 * 1000,
    })),
  });

  /* --- Scatter mode: one windowed line per player -------------------------- */
  const ranges = useQueries({
    queries: players.map((p) => ({
      queryKey: ['playerRange', p.id, group, range.start, range.end],
      queryFn: () => api.getPlayerRange(p.id, group, range.start, range.end, season),
      enabled: mode === 'scatter',
      staleTime: 10 * 60 * 1000,
    })),
  });

  const series: ChartSeries[] = useMemo(() => {
    if (players.length === 0) return [];

    if (mode === 'scatter') {
      const x = findStat(xStat);
      const y = findStat(yStat);
      if (!x || !y) return [];
      const points = players
        .map((p, i) => {
          const row = ranges[i]?.data;
          if (!row) return null;
          const xv = readStat(row.stat, x.key);
          const yv = readStat(row.stat, y.key);
          if (xv == null || yv == null) return null;
          return { player: p, index: i, x: xv, y: yv };
        })
        .filter((v): v is NonNullable<typeof v> => v != null);

      // One series per player, not one cloud: the mark then carries the same colour as
      // the player's chip, and the legend names people rather than repeating the axes.
      return points.map((p) => ({
        id: `pt-${p.player.id}`,
        name: p.player.fullName,
        color: COLORS[p.index % COLORS.length],
        points: [{ x: p.x, y: p.y, label: p.player.fullName, meta: p.player.id }],
      }));
    }

    if (yStat === VELOCITY_STAT.key) {
      return players.flatMap((p, i) => {
        const rows = velocities[i]?.data ?? [];
        // Four-seam by default: mixing a changeup into the same line would show a drop
        // that is a pitch selection, not a velocity change.
        const fastballs = rows.filter((r) => r.pitchType === 'FF');
        const points = bucketVelocity(fastballs.length > 0 ? fastballs : rows, bucket);
        if (points.length === 0) return [];
        return [
          {
            id: `velo-${p.id}`,
            name: `${p.fullName} — 4-seam`,
            color: COLORS[i % COLORS.length],
            points,
          },
        ];
      });
    }

    const y = findStat(yStat);
    const y2 = y2Stat ? findStat(y2Stat) : null;
    if (!y) return [];

    const out: ChartSeries[] = [];
    players.forEach((p, i) => {
      const splits = logs[i]?.data ?? [];
      const primary = bucketGameLog(splits, y, bucket, range);
      if (primary.length > 0) {
        out.push({
          id: `${p.id}-${y.key}`,
          name: players.length > 1 ? p.fullName : `${p.fullName} — ${y.label}`,
          color: COLORS[i % COLORS.length],
          points: primary,
        });
      }
      if (y2) {
        const secondary = bucketGameLog(splits, y2, bucket, range);
        if (secondary.length > 0) {
          out.push({
            id: `${p.id}-${y2.key}`,
            name: `${p.fullName} — ${y2.label}`,
            color: COLORS[i % COLORS.length],
            points: secondary,
            axis: 'right',
            dashed: true,
          });
        }
      }
    });
    return out;
  }, [players, mode, logs, velocities, ranges, yStat, y2Stat, xStat, bucket, range]);

  const loading =
    (mode === 'time' && (logs.some((q) => q.isLoading) || velocities.some((q) => q.isLoading))) ||
    (mode === 'scatter' && ranges.some((q) => q.isLoading));

  const yLabel = findStat(yStat)?.label;
  const y2Label = y2Stat ? findStat(y2Stat)?.label : undefined;

  return (
    <div className="compare">
      <div className="compare-controls">
        <span className="view-switch" role="group" aria-label="Chart type">
          <button className={mode === 'time' ? 'vs active' : 'vs'} onClick={() => setMode('time')}>
            <LineChart size={14} /> Over time
          </button>
          <button
            className={mode === 'scatter' ? 'vs active' : 'vs'}
            onClick={() => setMode('scatter')}
          >
            <Scan size={14} /> Stat vs stat
          </button>
        </span>

        <span className="view-switch" role="group" aria-label="Group">
          <button
            className={group === 'hitting' ? 'vs active' : 'vs'}
            onClick={() => setGroup('hitting')}
          >
            Hitting
          </button>
          <button
            className={group === 'pitching' ? 'vs active' : 'vs'}
            onClick={() => setGroup('pitching')}
          >
            Pitching
          </button>
        </span>

        <RangePicker range={range} onChange={setRange} />
      </div>

      <div className="compare-axes">
        {mode === 'scatter' ? (
          <>
            <StatSelect label="X axis" value={xStat} stats={available} onChange={setXStat} />
            <StatSelect label="Y axis" value={yStat} stats={available} onChange={setYStat} />
          </>
        ) : (
          <>
            <span className="axis-fixed muted small">X axis · Date</span>
            <StatSelect label="Y axis" value={yStat} stats={available} onChange={setYStat} />
            <StatSelect
              label="Second stat"
              value={y2Stat ?? ''}
              stats={available}
              onChange={(v) => setY2Stat(v || null)}
              allowNone
              disabled={yStat === VELOCITY_STAT.key}
            />
            {/* The zoom: the same data, read at four grains. */}
            <label className="zoom">
              <span className="muted small">Zoom</span>
              <input
                type="range"
                min={0}
                max={3}
                step={1}
                value={['game', 'day', 'week', 'month'].indexOf(bucket)}
                onChange={(e) =>
                  setBucket((['game', 'day', 'week', 'month'] as Bucket[])[Number(e.target.value)])
                }
              />
              <span className="zoom-value">{BUCKET_LABEL[bucket]}</span>
            </label>
          </>
        )}
      </div>

      <PlayerPicker players={players} season={season} onChange={setPlayers} />

      {players.length === 0 ? (
        <p className="muted compare-hint">
          Add a player to start. Two or three make the most readable comparison; six is the
          most the palette holds.
        </p>
      ) : loading ? (
        <p className="muted compare-hint">Loading…</p>
      ) : (
        <Chart
          series={series}
          mode={mode === 'time' ? 'line' : 'scatter'}
          xIsDate={mode === 'time'}
          xLabel={mode === 'time' ? BUCKET_LABEL[bucket] : findStat(xStat)?.label}
          yLabel={yLabel}
          y2Label={y2Label}
        />
      )}
    </div>
  );
}

const BUCKET_LABEL: Record<Bucket, string> = {
  game: 'Per game',
  day: 'Per day',
  week: 'Per week',
  month: 'Per month',
};

function StatSelect({
  label,
  value,
  stats,
  onChange,
  allowNone = false,
  disabled = false,
}: {
  label: string;
  value: string;
  stats: { key: string; label: string }[];
  onChange: (v: string) => void;
  allowNone?: boolean;
  disabled?: boolean;
}) {
  return (
    <label className="stat-select">
      <span className="muted small">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled}>
        {allowNone && <option value="">None</option>}
        {stats.map((s) => (
          <option key={s.key} value={s.key}>
            {s.label}
          </option>
        ))}
      </select>
    </label>
  );
}

/* --- Picking players -------------------------------------------------------- */

function PlayerPicker({
  players,
  season,
  onChange,
}: {
  players: PlayerRef[];
  season: string;
  onChange: (next: PlayerRef[]) => void;
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);

  const results = useQuery({
    queryKey: ['playerSearch', query, season],
    queryFn: () => api.searchPlayers(query, season, 12),
    enabled: query.trim().length >= 2,
    staleTime: 5 * 60 * 1000,
  });

  const add = (p: PlayerRef) => {
    if (!players.some((existing) => existing.id === p.id) && players.length < COLORS.length) {
      onChange([...players, p]);
    }
    setQuery('');
    setOpen(false);
  };

  return (
    <div className="player-picker">
      <div className="picked">
        {players.map((p, i) => (
          <span key={p.id} className="picked-chip" style={{ borderColor: COLORS[i % COLORS.length] }}>
            <PlayerHeadshot personId={p.id} name={p.fullName} size={22} />
            {p.fullName}
            {p.teamId && <TeamLogo teamId={p.teamId} name={p.teamName} size={16} />}
            <button
              className="icon-only"
              onClick={() => onChange(players.filter((x) => x.id !== p.id))}
              title={`Remove ${p.fullName}`}
            >
              <X size={13} />
            </button>
          </span>
        ))}
      </div>

      <div className="picker-search">
        <label className="search-box">
          <Search size={14} aria-hidden="true" />
          <input
            value={query}
            placeholder="Add a player…"
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
          />
        </label>

        {open && query.trim().length >= 2 && (
          <ul className="picker-results">
            {(results.data ?? []).map((p) => (
              <li key={p.id}>
                <button onClick={() => add(p)}>
                  <PlayerHeadshot personId={p.id} name={p.fullName} size={24} />
                  <span className="pr-name">{p.fullName}</span>
                  <span className="muted small">
                    {p.position} {p.teamName ? `· ${p.teamName}` : ''}
                  </span>
                </button>
              </li>
            ))}
            {results.isFetched && (results.data ?? []).length === 0 && (
              <li className="muted small picker-none">No player by that name.</li>
            )}
          </ul>
        )}
      </div>
    </div>
  );
}

/* --- The window ------------------------------------------------------------- */

interface Range {
  start: string;
  end: string;
}

function RangePicker({ range, onChange }: { range: Range; onChange: (r: Range) => void }) {
  const season = range.end.slice(0, 4);
  const months = MONTHS.map((label, i) => {
    const month = String(i + 4).padStart(2, '0'); // April through September
    return { label, start: `${season}-${month}-01`, end: `${season}-${month}-${lastDay(season, month)}` };
  });

  return (
    <div className="range-picker">
      <button className="chip" onClick={() => onChange(seasonRange(season))}>
        Season
      </button>
      {months.map((m) => (
        <button
          key={m.label}
          className={range.start === m.start && range.end === m.end ? 'chip active' : 'chip'}
          onClick={() => onChange({ start: m.start, end: m.end })}
        >
          {m.label}
        </button>
      ))}
      <label className="date-field">
        <input
          type="date"
          value={range.start}
          onChange={(e) => onChange({ ...range, start: e.target.value })}
        />
        <span className="muted">to</span>
        <input
          type="date"
          value={range.end}
          onChange={(e) => onChange({ ...range, end: e.target.value })}
        />
      </label>
    </div>
  );
}

const MONTHS = ['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep'];

function lastDay(season: string, month: string): string {
  return String(new Date(Number(season), Number(month), 0).getDate()).padStart(2, '0');
}

function seasonRange(season: string): Range {
  return { start: `${season}-03-01`, end: `${season}-11-30` };
}

/**
 * The window a first visit opens on.
 *
 * The current season to date. Deliberately *not* built from the machine clock's month —
 * only the year is taken from it, and the range runs to the end of the season, so a
 * machine ahead of US time cannot cut off games that have already been played.
 */
function defaultRange(): Range {
  const year = new Date().getFullYear();
  return seasonRange(String(year));
}

function readStat(stat: Record<string, unknown>, key: string): number | null {
  const raw = stat[key];
  if (raw == null) return null;
  const n = typeof raw === 'number' ? raw : Number(raw);
  return Number.isFinite(n) ? n : null;
}
