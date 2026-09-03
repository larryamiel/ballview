/**
 * Favourite-team picker, top right. Features 2 and 10.
 *
 * A native `<select>` cannot show a logo or a record, and thirty clubs is past the point
 * where an unsearchable list is pleasant, so this is a small combobox: type to filter,
 * arrow keys to move, Enter to pick. The trigger doubles as the app's "who am I
 * following" indicator, which is why it carries the club's record rather than just its
 * name.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, ChevronDown, Search, Star } from 'lucide-react';

import { useStandings } from '../hooks/useLiveFeed';
import * as api from '../lib/api';
import { teamColor } from '../lib/assets';
import type { Team, TeamStanding } from '../lib/types';
import { TeamLogo } from './ui/TeamLogo';

interface Props {
  favoriteTeamId: number | null;
}

export function TeamPicker({ favoriteTeamId }: Props) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState('');
  const [highlight, setHighlight] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const teams = useQuery({
    queryKey: ['teams'],
    queryFn: api.getTeams,
    // The team list changes at most once a season.
    staleTime: 24 * 60 * 60 * 1000,
  });
  const standings = useStandings();

  const mutation = useMutation({
    mutationFn: (teamId: number | null) => api.setFavoriteTeam(teamId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['config'] });
      // A new favourite means a different history log, and a backfill worth running.
      queryClient.invalidateQueries({ queryKey: ['history'] });
    },
  });

  const matches = useMemo(() => {
    const all = teams.data ?? [];
    const q = filter.trim().toLowerCase();
    if (!q) return all;
    return all.filter((t) =>
      [t.name, t.teamName, t.locationName, t.abbreviation]
        .filter(Boolean)
        .some((field) => field!.toLowerCase().includes(q)),
    );
  }, [teams.data, filter]);

  const current = teams.data?.find((t) => t.id === favoriteTeamId) ?? null;

  // Close on an outside click or Escape — a popover that can only be dismissed by
  // picking something is a trap when the user opened it by accident.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  // Opening the picker should land on the club being followed, not on whichever slice
  // of the alphabet the scroll container happens to be showing.
  useEffect(() => {
    if (!open) {
      setFilter('');
      return;
    }
    inputRef.current?.focus();
    const index = matches.findIndex((t) => t.id === favoriteTeamId);
    setHighlight(index === -1 ? 0 : index);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Keep the highlighted option visible as the arrow keys walk the list.
  useEffect(() => {
    if (!open) return;
    const option = listRef.current?.children[highlight];
    (option as HTMLElement | undefined)?.scrollIntoView({ block: 'nearest' });
  }, [open, highlight]);

  const choose = (teamId: number | null) => {
    mutation.mutate(teamId);
    setOpen(false);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') return setOpen(false);
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight((h) => Math.min(matches.length - 1, h + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((h) => Math.max(0, h - 1));
    } else if (e.key === 'Enter' && matches[highlight]) {
      e.preventDefault();
      choose(matches[highlight].id);
    }
  };

  const record = favoriteTeamId != null ? standings.data?.get(favoriteTeamId) : undefined;

  return (
    <div className="team-picker" ref={rootRef}>
      <button
        className={`picker-trigger${current ? ' has-team' : ''}`}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        style={current ? { borderColor: `${teamColor(current.id)}66` } : undefined}
      >
        {current ? (
          <>
            <TeamLogo teamId={current.id} name={current.name} size={26} />
            <span className="picker-labels">
              <span className="picker-name">{current.teamName ?? current.name}</span>
              <span className="picker-record">{recordLine(record)}</span>
            </span>
          </>
        ) : (
          <>
            <Star size={16} aria-hidden="true" />
            <span className="picker-labels">
              <span className="picker-name">Pick a team</span>
              <span className="picker-record muted">Follow one club</span>
            </span>
          </>
        )}
        <ChevronDown size={16} className="picker-caret" aria-hidden="true" />
      </button>

      {open && (
        <div className="picker-menu" role="listbox">
          <div className="picker-search">
            <Search size={14} aria-hidden="true" />
            <input
              ref={inputRef}
              value={filter}
              placeholder="Search teams"
              onChange={(e) => {
                setFilter(e.target.value);
                setHighlight(0);
              }}
              onKeyDown={onKeyDown}
              aria-label="Search teams"
            />
          </div>

          <div className="picker-options" ref={listRef}>
            {teams.isPending && <p className="muted small pad">Loading teams…</p>}

            {matches.map((team, i) => (
              <TeamOption
                key={team.id}
                team={team}
                standing={standings.data?.get(team.id)}
                selected={team.id === favoriteTeamId}
                active={i === highlight}
                onPick={() => choose(team.id)}
                onHover={() => setHighlight(i)}
              />
            ))}

            {!teams.isPending && matches.length === 0 && (
              <p className="muted small pad">No team matches “{filter}”.</p>
            )}
          </div>

          {favoriteTeamId != null && (
            <button className="picker-clear" onClick={() => choose(null)}>
              Stop following
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function TeamOption({
  team,
  standing,
  selected,
  active,
  onPick,
  onHover,
}: {
  team: Team;
  standing?: TeamStanding;
  selected: boolean;
  active: boolean;
  onPick: () => void;
  onHover: () => void;
}) {
  return (
    <button
      role="option"
      aria-selected={selected}
      className={`picker-option${active ? ' active' : ''}${selected ? ' selected' : ''}`}
      onClick={onPick}
      onMouseEnter={onHover}
    >
      <TeamLogo teamId={team.id} name={team.name} size={24} />
      <span className="option-name">{team.name ?? team.teamName}</span>
      <span className="option-record muted small">{recordLine(standing)}</span>
      {selected && <Check size={14} className="option-check" aria-hidden="true" />}
    </button>
  );
}

/** "84-63 · 2nd NL East". Falls back to an em dash while standings are loading. */
function recordLine(standing?: TeamStanding | null): string {
  if (!standing) return '—';
  const record = `${standing.wins}-${standing.losses}`;
  const place = standing.divisionRank ? ordinal(standing.divisionRank) : null;
  // `divisionName` is already the short form ("AL East") from the Rust side.
  return place && standing.divisionName
    ? `${record} · ${place} ${standing.divisionName}`
    : record;
}

function ordinal(rank: string): string {
  const n = Number(rank);
  if (!Number.isFinite(n)) return rank;
  const suffix = n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th';
  return `${n}${suffix}`;
}
