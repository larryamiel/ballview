/**
 * Player leaderboards: hitters and pitchers, over a season, a window, or a run of games.
 *
 * Hitting and pitching are separate tables rather than one with empty cells — an ERA
 * column means nothing for a shortstop. Sorting is done by MLB rather than in the
 * browser, because the response is capped: sorting a truncated page client-side would
 * put the wrong players at the top and quietly claim they lead the league.
 */

import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, CheckSquare, Search, Square, Users } from 'lucide-react';

import * as api from '../lib/api';
import type { PlayerStatRow, StatRange } from '../lib/types';
import { PlayerPreview } from './PlayerPreview';
import { PlayerHeadshot } from './ui/PlayerHeadshot';
import { EmptyState, ErrorState, Skeleton } from './ui/States';
import { TeamLogo } from './ui/TeamLogo';

type Group = 'hitting' | 'pitching';
type RangeId = 'season' | 'last7' | 'last30' | 'last10g' | 'custom';
/** Pitchers only: a starter has started at least one of the games in the range. */
type Role = 'all' | 'starter' | 'reliever';

interface Column {
  /** The MLB stat key, and the value passed as `sortStat`. */
  key: string;
  label: string;
  title: string;
  /** True when a lower number is the better one, so the first click sorts ascending. */
  lowerIsBetter?: boolean;
  /** Not every column can be sorted upstream. */
  sortable?: boolean;
}

const HITTING: Column[] = [
  { key: 'gamesPlayed', label: 'G', title: 'Games' },
  { key: 'atBats', label: 'AB', title: 'At bats' },
  { key: 'runs', label: 'R', title: 'Runs' },
  { key: 'hits', label: 'H', title: 'Hits' },
  { key: 'doubles', label: '2B', title: 'Doubles' },
  { key: 'triples', label: '3B', title: 'Triples' },
  { key: 'homeRuns', label: 'HR', title: 'Home runs' },
  { key: 'rbi', label: 'RBI', title: 'Runs batted in' },
  { key: 'baseOnBalls', label: 'BB', title: 'Walks' },
  { key: 'strikeOuts', label: 'SO', title: 'Strikeouts' },
  { key: 'stolenBases', label: 'SB', title: 'Stolen bases' },
  { key: 'avg', label: 'AVG', title: 'Batting average' },
  { key: 'obp', label: 'OBP', title: 'On-base percentage' },
  { key: 'slg', label: 'SLG', title: 'Slugging' },
  { key: 'ops', label: 'OPS', title: 'On-base plus slugging' },
];

const PITCHING: Column[] = [
  { key: 'gamesPlayed', label: 'G', title: 'Games' },
  { key: 'gamesStarted', label: 'GS', title: 'Games started' },
  { key: 'inningsPitched', label: 'IP', title: 'Innings pitched' },
  { key: 'wins', label: 'W', title: 'Wins' },
  { key: 'losses', label: 'L', title: 'Losses', lowerIsBetter: true },
  { key: 'saves', label: 'SV', title: 'Saves' },
  { key: 'era', label: 'ERA', title: 'Earned run average', lowerIsBetter: true },
  { key: 'whip', label: 'WHIP', title: 'Walks and hits per inning', lowerIsBetter: true },
  { key: 'strikeOuts', label: 'SO', title: 'Strikeouts' },
  { key: 'baseOnBalls', label: 'BB', title: 'Walks', lowerIsBetter: true },
  { key: 'hits', label: 'H', title: 'Hits allowed', lowerIsBetter: true },
  { key: 'homeRuns', label: 'HR', title: 'Home runs allowed', lowerIsBetter: true },
  { key: 'strikeoutsPer9Inn', label: 'K/9', title: 'Strikeouts per nine innings' },
  { key: 'walksPer9Inn', label: 'BB/9', title: 'Walks per nine innings', lowerIsBetter: true },
];

/** Which keys the Rust side will actually forward as `sortStat`. */
const NOT_SORTABLE = new Set(['hits']);

const RANGES: { id: RangeId; label: string }[] = [
  { id: 'season', label: 'Season' },
  { id: 'last7', label: 'Last week' },
  { id: 'last30', label: 'Last month' },
  { id: 'last10g', label: 'Last 10 games' },
  { id: 'custom', label: 'Date range' },
];

export function PlayerStats() {
  const [group, setGroup] = useState<Group>('hitting');
  const [rangeId, setRangeId] = useState<RangeId>('season');
  const [sortStat, setSortStat] = useState('homeRuns');
  const [order, setOrder] = useState<'asc' | 'desc'>('desc');
  const [filter, setFilter] = useState('');
  const [selected, setSelected] = useState<PlayerStatRow | null>(null);
  const [custom, setCustom] = useState<{ start: string; end: string }>({ start: '', end: '' });
  const [qualified, setQualified] = useState(true);
  const [role, setRole] = useState<Role>('all');
  const [minGames, setMinGames] = useState(0);

  // A baseball day is a US concept, so the window is anchored to MLB's calendar rather
  // than the machine clock — see `today_mlb` on the Rust side.
  const today = useQuery({
    queryKey: ['today'],
    queryFn: api.getToday,
    staleTime: 60 * 60 * 1000,
  });
  const anchor = today.data;

  // Switching group changes which columns exist, so the sort has to move with it.
  useEffect(() => {
    setSortStat(group === 'hitting' ? 'homeRuns' : 'era');
    setOrder(group === 'hitting' ? 'desc' : 'asc');
    setSelected(null);
    if (group === 'hitting') setRole('all');
  }, [group]);

  useEffect(() => {
    if (rangeId === 'custom' && anchor && !custom.start) {
      setCustom({ start: shiftDays(anchor, -13), end: anchor });
    }
  }, [rangeId, anchor, custom.start]);

  const columns = group === 'hitting' ? HITTING : PITCHING;
  const range = buildRange(rangeId, anchor, custom);

  const stats = useQuery({
    queryKey: ['playerStats', group, range, sortStat, order, qualified],
    queryFn: () => api.getPlayerStats({ group, range: range!, sortStat, order, qualified }),
    // Every range but the season needs the anchor date before it can be asked for.
    enabled: range != null,
    staleTime: 10 * 60 * 1000,
  });

  /**
   * Client-side narrowing, applied after MLB has sorted.
   *
   * The role and games filters cannot be pushed upstream — the API has no parameter for
   * either — so they run here over the rows it returned. That is only sound because the
   * request asks for the whole league rather than a page: filtering a page would drop
   * players who belong at the top of the filtered table.
   */
  const rows = useMemo(() => {
    let all = stats.data ?? [];

    if (group === 'pitching' && role !== 'all') {
      all = all.filter((r) => {
        const started = num(r.stat.gamesStarted);
        return role === 'starter' ? started > 0 : started === 0;
      });
    }

    if (minGames > 0) {
      all = all.filter((r) => num(r.stat.gamesPlayed) >= minGames);
    }

    const q = filter.trim().toLowerCase();
    if (!q) return all;
    return all.filter(
      (r) =>
        r.playerName.toLowerCase().includes(q) ||
        (r.teamName ?? '').toLowerCase().includes(q),
    );
  }, [stats.data, filter, group, role, minGames]);

  const sortBy = (col: Column) => {
    if (NOT_SORTABLE.has(col.key)) return;
    if (col.key === sortStat) {
      setOrder((o) => (o === 'desc' ? 'asc' : 'desc'));
    } else {
      setSortStat(col.key);
      setOrder(col.lowerIsBetter ? 'asc' : 'desc');
    }
  };

  return (
    <section className="panel stats-panel">
      <header className="panel-head">
        <div className="panel-title">
          <h2>Player stats</h2>
          <p className="muted small">
            {rangeLabel(rangeId, range)}
            {stats.data && ` · ${rows.length} of ${stats.data.length} players`}
            {stats.isFetching && ' · updating…'}
          </p>
        </div>

        <div className="row gap">
          <span className="view-switch" role="group" aria-label="Stat group">
            <button
              className={group === 'hitting' ? 'vs active' : 'vs'}
              onClick={() => setGroup('hitting')}
            >
              Batters
            </button>
            <button
              className={group === 'pitching' ? 'vs active' : 'vs'}
              onClick={() => setGroup('pitching')}
            >
              Pitchers
            </button>
          </span>

          {group === 'pitching' && (
            <span className="view-switch" role="group" aria-label="Pitcher role">
              {(['all', 'starter', 'reliever'] as Role[]).map((r) => (
                <button
                  key={r}
                  className={role === r ? 'vs active' : 'vs'}
                  onClick={() => setRole(r)}
                >
                  {r === 'all' ? 'All' : r === 'starter' ? 'Starters' : 'Relievers'}
                </button>
              ))}
            </span>
          )}

          <label className="search-box">
            <Search size={14} aria-hidden="true" />
            <input
              value={filter}
              placeholder="Search player or team"
              onChange={(e) => setFilter(e.target.value)}
              aria-label="Search players"
            />
          </label>
        </div>
      </header>

      <div className="range-bar">
        {RANGES.map((r) => (
          <button
            key={r.id}
            className={rangeId === r.id ? 'range-chip active' : 'range-chip'}
            onClick={() => setRangeId(r.id)}
          >
            {r.label}
          </button>
        ))}

        <button
          className={qualified ? 'range-chip toggle active' : 'range-chip toggle'}
          onClick={() => setQualified((q) => !q)}
          title="MLB’s own minimum plate appearances or innings"
        >
          {qualified ? <CheckSquare size={13} /> : <Square size={13} />} Qualified only
        </button>

        <label className="min-games" title="Hide players with fewer games than this">
          Min G
          <input
            type="number"
            min={0}
            max={162}
            value={minGames || ''}
            placeholder="0"
            onChange={(e) => setMinGames(Math.max(0, Number(e.target.value) || 0))}
          />
        </label>

        {rangeId === 'custom' && (
          <span className="range-dates">
            <input
              type="date"
              value={custom.start}
              max={custom.end || anchor}
              onChange={(e) => setCustom((c) => ({ ...c, start: e.target.value }))}
              aria-label="Start date"
            />
            <span className="muted small">to</span>
            <input
              type="date"
              value={custom.end}
              min={custom.start}
              max={anchor}
              onChange={(e) => setCustom((c) => ({ ...c, end: e.target.value }))}
              aria-label="End date"
            />
          </span>
        )}
      </div>

      <div className={`stats-body${selected ? ' with-preview' : ''}`}>
        <div className="stats-table-wrap">
          {stats.isPending && <Skeleton rows={10} height={34} />}

          {stats.error && (
            <ErrorState
              title="Could not load these stats."
              error={stats.error}
              onRetry={() => stats.refetch()}
            />
          )}

          {stats.data && rows.length === 0 && (
            <EmptyState icon={<Users size={22} />} title="No players match">
              {filter
                ? `Nothing for “${filter}” in this range.`
                : 'MLB returned no qualifying players for this range.'}
            </EmptyState>
          )}

          {rows.length > 0 && (
            <table className="stats-table">
              <thead>
                <tr>
                  <th className="col-rank">#</th>
                  <th className="col-player">Player</th>
                  {columns.map((col) => (
                    <th
                      key={col.key}
                      className={`num${NOT_SORTABLE.has(col.key) ? '' : ' sortable'}${
                        col.key === sortStat ? ' sorted' : ''
                      }`}
                      title={col.title}
                      onClick={() => sortBy(col)}
                      aria-sort={
                        col.key === sortStat
                          ? order === 'asc'
                            ? 'ascending'
                            : 'descending'
                          : undefined
                      }
                    >
                      {col.label}
                      {col.key === sortStat &&
                        (order === 'asc' ? <ArrowUp size={11} /> : <ArrowDown size={11} />)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr
                    key={row.playerId}
                    className={selected?.playerId === row.playerId ? 'selected' : undefined}
                    onClick={() => setSelected(row)}
                  >
                    <td className="col-rank muted">{i + 1}</td>
                    <td className="col-player">
                      <PlayerHeadshot personId={row.playerId} name={row.playerName} size={26} />
                      <span className="stats-name">{row.playerName}</span>
                      <TeamLogo teamId={row.teamId} name={row.teamName} size={18} />
                      {row.position && <span className="muted small">{row.position}</span>}
                    </td>
                    {columns.map((col) => (
                      <td key={col.key} className="num">
                        {format(row.stat[col.key])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {selected && (
          <PlayerPreview
            row={selected}
            columns={columns}
            rangeLabel={rangeLabel(rangeId, range)}
            onClose={() => setSelected(null)}
          />
        )}
      </div>
    </section>
  );
}

/** Counting stats arrive as numbers or numeric strings depending on the endpoint. */
function num(value: string | number | null | undefined): number {
  if (value == null) return 0;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

/** MLB sends most rate stats as strings (".302"); pass those through untouched. */
function format(value: string | number | null | undefined): string {
  if (value == null || value === '') return '—';
  if (typeof value === 'number') return String(value);
  return value;
}

function buildRange(
  id: RangeId,
  anchor: string | undefined,
  custom: { start: string; end: string },
): StatRange | null {
  switch (id) {
    case 'season':
      return { kind: 'season' };
    case 'last10g':
      return { kind: 'lastGames', games: 10 };
    case 'last7':
      return anchor ? { kind: 'dateRange', start: shiftDays(anchor, -6), end: anchor } : null;
    case 'last30':
      return anchor ? { kind: 'dateRange', start: shiftDays(anchor, -29), end: anchor } : null;
    case 'custom':
      return custom.start && custom.end
        ? { kind: 'dateRange', start: custom.start, end: custom.end }
        : null;
  }
}

function rangeLabel(id: RangeId, range: StatRange | null): string {
  if (id === 'season') return 'Full season';
  if (id === 'last10g') return "Each player's last 10 games";
  if (range && range.kind === 'dateRange') return `${range.start} to ${range.end}`;
  return 'Pick two dates';
}

/** Date arithmetic on the `YYYY-MM-DD` string, anchored at noon to dodge DST. */
function shiftDays(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}
