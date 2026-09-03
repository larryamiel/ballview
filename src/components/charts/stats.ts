/**
 * What a stat *is*, for charting purposes.
 *
 * The important thing here is that a rate cannot be averaged. A player who goes 0-for-4
 * and then 3-for-4 did not bat .375: two OPS figures added and halved is not an OPS, and
 * neither is a mean of daily ERAs. So every stat declares the counting fields it is built
 * from, and a week's value is computed from the week's totals — the same way the season
 * figure is computed from the season's.
 *
 * Counting stats simply sum, which is the easy half.
 */

import type { GameLogSplit } from '../../lib/types';

export type StatGroup = 'hitting' | 'pitching';

export interface StatDef {
  key: string;
  label: string;
  group: StatGroup;
  /** Sum the raw field, or derive it from other fields. */
  derive?: (totals: Record<string, number>) => number | null;
  /** Fields that must be summed for `derive` to work. */
  needs?: string[];
  /** Fewer decimals for counting stats; three for rates. */
  decimals?: number;
}

const num = (v: unknown): number => {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
};

/** MLB writes innings as "5.2" — five and two thirds. Decimal maths on that is wrong. */
export function inningsToOuts(value: unknown): number {
  const raw = typeof value === 'string' ? value : String(value ?? '');
  const [whole, frac] = raw.split('.');
  return (Number(whole) || 0) * 3 + (Number(frac) || 0);
}

export function outsToInnings(outs: number): number {
  return outs / 3;
}

export const HITTING_STATS: StatDef[] = [
  { key: 'homeRuns', label: 'Home runs', group: 'hitting', decimals: 0 },
  { key: 'hits', label: 'Hits', group: 'hitting', decimals: 0 },
  { key: 'rbi', label: 'RBI', group: 'hitting', decimals: 0 },
  { key: 'runs', label: 'Runs', group: 'hitting', decimals: 0 },
  { key: 'stolenBases', label: 'Stolen bases', group: 'hitting', decimals: 0 },
  { key: 'doubles', label: 'Doubles', group: 'hitting', decimals: 0 },
  { key: 'baseOnBalls', label: 'Walks', group: 'hitting', decimals: 0 },
  { key: 'strikeOuts', label: 'Strikeouts', group: 'hitting', decimals: 0 },
  { key: 'totalBases', label: 'Total bases', group: 'hitting', decimals: 0 },
  {
    key: 'avg',
    label: 'Batting average',
    group: 'hitting',
    needs: ['hits', 'atBats'],
    derive: (t) => (t.atBats > 0 ? t.hits / t.atBats : null),
    decimals: 3,
  },
  {
    key: 'obp',
    label: 'On-base percentage',
    group: 'hitting',
    needs: ['hits', 'baseOnBalls', 'hitByPitch', 'atBats', 'sacFlies'],
    derive: (t) => {
      const denominator = t.atBats + t.baseOnBalls + t.hitByPitch + t.sacFlies;
      return denominator > 0 ? (t.hits + t.baseOnBalls + t.hitByPitch) / denominator : null;
    },
    decimals: 3,
  },
  {
    key: 'slg',
    label: 'Slugging',
    group: 'hitting',
    needs: ['totalBases', 'atBats'],
    derive: (t) => (t.atBats > 0 ? t.totalBases / t.atBats : null),
    decimals: 3,
  },
  {
    key: 'ops',
    label: 'OPS',
    group: 'hitting',
    needs: ['hits', 'baseOnBalls', 'hitByPitch', 'atBats', 'sacFlies', 'totalBases'],
    derive: (t) => {
      const onBase = t.atBats + t.baseOnBalls + t.hitByPitch + t.sacFlies;
      if (onBase <= 0 || t.atBats <= 0) return null;
      return (t.hits + t.baseOnBalls + t.hitByPitch) / onBase + t.totalBases / t.atBats;
    },
    decimals: 3,
  },
];

export const PITCHING_STATS: StatDef[] = [
  { key: 'strikeOuts', label: 'Strikeouts', group: 'pitching', decimals: 0 },
  { key: 'baseOnBalls', label: 'Walks', group: 'pitching', decimals: 0 },
  { key: 'hits', label: 'Hits allowed', group: 'pitching', decimals: 0 },
  { key: 'homeRuns', label: 'Home runs allowed', group: 'pitching', decimals: 0 },
  { key: 'earnedRuns', label: 'Earned runs', group: 'pitching', decimals: 0 },
  {
    key: 'inningsPitched',
    label: 'Innings pitched',
    group: 'pitching',
    needs: ['outs'],
    derive: (t) => outsToInnings(t.outs),
    decimals: 1,
  },
  {
    key: 'era',
    label: 'ERA',
    group: 'pitching',
    needs: ['earnedRuns', 'outs'],
    derive: (t) => (t.outs > 0 ? (t.earnedRuns * 27) / t.outs : null),
    decimals: 2,
  },
  {
    key: 'whip',
    label: 'WHIP',
    group: 'pitching',
    needs: ['hits', 'baseOnBalls', 'outs'],
    derive: (t) => (t.outs > 0 ? ((t.hits + t.baseOnBalls) * 3) / t.outs : null),
    decimals: 2,
  },
  {
    key: 'k9',
    label: 'Strikeouts per 9',
    group: 'pitching',
    needs: ['strikeOuts', 'outs'],
    derive: (t) => (t.outs > 0 ? (t.strikeOuts * 27) / t.outs : null),
    decimals: 2,
  },
];

/** Statcast velocity, which comes from Savant rather than from a game log. */
export const VELOCITY_STAT: StatDef = {
  key: 'releaseSpeed',
  label: 'Release speed (mph)',
  group: 'pitching',
  decimals: 1,
};

export function statsFor(group: StatGroup): StatDef[] {
  return group === 'hitting' ? HITTING_STATS : [...PITCHING_STATS, VELOCITY_STAT];
}

export function findStat(key: string): StatDef | undefined {
  return [...HITTING_STATS, ...PITCHING_STATS, VELOCITY_STAT].find((s) => s.key === key);
}

/* --- Bucketing -------------------------------------------------------------- */

export type Bucket = 'game' | 'day' | 'week' | 'month';

export interface BucketedPoint {
  /** Midpoint timestamp of the bucket, for the x axis. */
  x: number;
  y: number;
  label: string;
  gamePk?: number | null;
  games: number;
}

/**
 * Fold a game log into one point per bucket, computing each stat from that bucket's own
 * totals.
 *
 * `game` keeps every game separate — the finest the log goes, since MLB publishes no
 * inning-level splits — and is what the "per day" end of the zoom control means for a
 * hitter. `week` starts on Monday, matching the calendar elsewhere in the app.
 */
export function bucketGameLog(
  splits: GameLogSplit[],
  stat: StatDef,
  bucket: Bucket,
  range?: { start: string; end: string },
): BucketedPoint[] {
  const inRange = splits.filter((s) => {
    if (!s.date) return false;
    if (!range) return true;
    return s.date >= range.start && s.date <= range.end;
  });

  const groups = new Map<string, GameLogSplit[]>();
  for (const split of inRange) {
    const key = bucketKey(split.date!, bucket, split.gamePk ?? 0);
    const list = groups.get(key);
    if (list) list.push(split);
    else groups.set(key, [split]);
  }

  const out: BucketedPoint[] = [];
  for (const [key, members] of [...groups.entries()].sort()) {
    const totals = sumFields(members, stat);
    const value = stat.derive ? stat.derive(totals) : totals[stat.key];
    if (value == null || !Number.isFinite(value)) continue;

    const dates = members.map((m) => m.date!).sort();
    out.push({
      x: Date.parse(`${midDate(dates)}T12:00:00`),
      y: value,
      label: bucketLabel(key, bucket, dates),
      gamePk: bucket === 'game' ? members[0]?.gamePk : null,
      games: members.length,
    });
  }
  return out;
}

/**
 * Sum every counting field the stat depends on.
 *
 * Innings are summed as outs and converted back, because "5.2 + 5.2" is eleven and a
 * third innings, not 10.4.
 */
function sumFields(splits: GameLogSplit[], stat: StatDef): Record<string, number> {
  const fields = stat.needs ?? [stat.key];
  const totals: Record<string, number> = {};
  for (const field of fields) totals[field] = 0;

  for (const split of splits) {
    for (const field of fields) {
      if (field === 'outs') {
        totals.outs += inningsToOuts(split.stat.inningsPitched);
      } else {
        totals[field] += num(split.stat[field]);
      }
    }
  }
  return totals;
}

function bucketKey(date: string, bucket: Bucket, gamePk: number): string {
  switch (bucket) {
    case 'game':
      return `${date}#${gamePk}`;
    case 'day':
      return date;
    case 'week':
      return weekStart(date);
    case 'month':
      return date.slice(0, 7);
  }
}

/** Monday of the week a date falls in, as `YYYY-MM-DD`. */
export function weekStart(date: string): string {
  const d = new Date(`${date}T12:00:00`);
  const shift = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - shift);
  return d.toISOString().slice(0, 10);
}

function midDate(dates: string[]): string {
  return dates[Math.floor(dates.length / 2)] ?? dates[0];
}

function bucketLabel(key: string, bucket: Bucket, dates: string[]): string {
  const pretty = (iso: string) =>
    new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

  switch (bucket) {
    case 'game':
    case 'day':
      return pretty(dates[0]);
    case 'week':
      return `Week of ${pretty(key)}`;
    case 'month':
      return new Date(`${key}-01T12:00:00`).toLocaleDateString(undefined, {
        month: 'long',
        year: 'numeric',
      });
  }
}

/** The same folding, for Savant's per-day velocity rows. */
export function bucketVelocity(
  points: { date: string; pitches: number; avgSpeed: number }[],
  bucket: Bucket,
): BucketedPoint[] {
  const groups = new Map<string, { date: string; pitches: number; avgSpeed: number }[]>();
  for (const p of points) {
    const key = bucket === 'month' ? p.date.slice(0, 7) : bucket === 'week' ? weekStart(p.date) : p.date;
    const list = groups.get(key);
    if (list) list.push(p);
    else groups.set(key, [p]);
  }

  const out: BucketedPoint[] = [];
  for (const [key, members] of [...groups.entries()].sort()) {
    // Weighted by pitch count: a two-pitch appearance should not move a month's average
    // as much as a hundred-pitch start.
    const pitches = members.reduce((n, m) => n + m.pitches, 0);
    if (pitches === 0) continue;
    const speed = members.reduce((n, m) => n + m.avgSpeed * m.pitches, 0) / pitches;
    const dates = members.map((m) => m.date).sort();
    out.push({
      x: Date.parse(`${midDate(dates)}T12:00:00`),
      y: Number(speed.toFixed(2)),
      label: bucketLabel(key, bucket, dates),
      games: members.length,
    });
  }
  return out;
}
