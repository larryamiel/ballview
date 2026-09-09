/**
 * Play of the day: the best clips from around the league, not just the followed club's.
 *
 * The ranking is computed in Rust (`commands/plays.rs`, where every weight is written
 * down and argued for). This screen's job is to make the verdict legible: one play gets
 * the stage, the rest are a grid, and each carries the reason it ranked — "Walk-off",
 * "Robbed a home run" — so the order never looks arbitrary.
 *
 * The club filter is here rather than in a separate screen because the question "what did
 * I miss" has two halves — around the league, and at my club — and they are the same
 * list under two filters.
 */

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Clapperboard, Play } from 'lucide-react';

import * as api from '../lib/api';
import type { TopPlay } from '../lib/types';
import { EmptyState, ErrorState, Skeleton } from './ui/States';
import { TeamLogo } from './ui/TeamLogo';

interface Props {
  /** The followed club, offered as a filter. `null` hides the filter entirely. */
  teamId: number | null;
  teamName?: string | null;
}

export function TopPlays({ teamId, teamName }: Props) {
  const [mine, setMine] = useState(false);
  const filterId = mine && teamId != null ? teamId : undefined;

  // Club abbreviations for the card captions. The slate response names both clubs in
  // full — "Arizona Diamondbacks @ Los Angeles Dodgers" is three wrapped lines under a
  // 220px thumbnail — and the team list, already cached for a day, has the short forms.
  const teams = useQuery({
    queryKey: ['teams'],
    queryFn: api.getTeams,
    staleTime: 24 * 60 * 60 * 1000,
  });
  const abbr = useMemo(
    () => new Map((teams.data ?? []).map((t) => [t.id, t.abbreviation ?? t.teamName ?? t.name])),
    [teams.data],
  );

  const plays = useQuery({
    queryKey: ['topPlays', filterId ?? null],
    queryFn: () => api.getTopPlays(undefined, filterId, 12),
    // A finished slate's clips never change; only the rollover to the next day does.
    staleTime: 30 * 60 * 1000,
  });

  const [playing, setPlaying] = useState<TopPlay | null>(null);
  const items = plays.data?.plays ?? [];
  const [lead, ...rest] = items;

  return (
    <section className="top-plays">
      <div className="panel-head">
        <div className="panel-title">
          <h2>
            <Clapperboard size={18} aria-hidden="true" /> Play of the day
          </h2>
          <p className="muted small">
            {plays.data
              ? plays.data.resolvedBack
                ? `From the last completed slate, ${prettyDate(plays.data.date)} — today’s games are still to be played`
                : prettyDate(plays.data.date)
              : 'Ranked across every game on the slate'}
          </p>
        </div>

        {teamId != null && (
          <span className="view-switch" role="group" aria-label="Which clubs">
            <button className={mine ? 'vs' : 'vs active'} onClick={() => setMine(false)}>
              All MLB
            </button>
            <button className={mine ? 'vs active' : 'vs'} onClick={() => setMine(true)}>
              {teamName ?? 'My team'}
            </button>
          </span>
        )}
      </div>

      {plays.isPending && <Skeleton rows={3} height={120} />}
      {plays.isError && (
        <ErrorState
          title="Could not rank the plays"
          error={plays.error}
          onRetry={() => plays.refetch()}
        />
      )}

      {plays.data && items.length === 0 && (
        <EmptyState icon={<Clapperboard size={22} />} title="No plays to show">
          {mine
            ? 'Nothing from this club on the last slate — they may not have played.'
            : 'MLB has published no playable clips for this slate yet.'}
        </EmptyState>
      )}

      {lead && (
        <div className="play-lead">
          {playing?.clip.id === lead.clip.id ? (
            <video key={lead.clip.id} src={lead.clip.url ?? undefined} controls autoPlay />
          ) : (
            <button className="play-lead-poster" onClick={() => setPlaying(lead)}>
              {lead.clip.thumbnail && <img src={lead.clip.thumbnail} alt="" />}
              <span className="play-badge">{lead.reason}</span>
              <span className="play-lead-go">
                <Play size={22} aria-hidden="true" />
              </span>
            </button>
          )}
          <div className="play-lead-caption">
            <span className="play-lead-reason">{lead.reason}</span>
            <strong>{lead.clip.title}</strong>
            <Matchup play={lead} />
          </div>
        </div>
      )}

      {rest.length > 0 && (
        <ul className="play-grid">
          {rest.map((play) => (
            <li key={play.clip.id}>
              <button className="play-card" onClick={() => setPlaying(play)}>
                <span className="play-thumb">
                  {play.clip.thumbnail && <img src={play.clip.thumbnail} alt="" loading="lazy" />}
                  <span className="play-badge small">{play.reason}</span>
                  {play.clip.duration && (
                    <span className="play-duration">{trimDuration(play.clip.duration)}</span>
                  )}
                </span>
                <span className="play-card-title">{play.clip.title}</span>
                <Matchup play={play} abbr={abbr} />
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* One player, opened over the page, so picking a second clip does not leave the
          first one still playing somewhere below the fold. */}
      {playing && playing.clip.id !== lead?.clip.id && (
        <div className="modal-backdrop" onClick={() => setPlaying(null)} role="presentation">
          <div className="modal play-modal" onClick={(e) => e.stopPropagation()} role="dialog">
            <header className="modal-head">
              <strong>{playing.clip.title}</strong>
            </header>
            <video key={playing.clip.id} src={playing.clip.url ?? undefined} controls autoPlay />
            <Matchup play={playing} />
          </div>
        </div>
      )}
    </section>
  );
}

/**
 * "AZ @ LAD", or the clubs in full where there is room for them.
 *
 * `abbr` is passed only by the cards. The lead has a whole column to itself and reads
 * better naming the clubs properly.
 */
function Matchup({
  play,
  abbr,
}: {
  play: TopPlay;
  abbr?: Map<number, string | null | undefined>;
}) {
  const label = (id?: number | null, name?: string | null) =>
    (id != null && abbr?.get(id)) || name || '—';

  return (
    <span className={`play-matchup muted small${abbr ? ' short' : ''}`}>
      <TeamLogo teamId={play.awayTeamId} name={play.awayTeam} size={16} />
      {label(play.awayTeamId, play.awayTeam)}
      <span className="at">@</span>
      <TeamLogo teamId={play.homeTeamId} name={play.homeTeam} size={16} />
      {label(play.homeTeamId, play.homeTeam)}
    </span>
  );
}

/** "00:00:32" reads as "0:32" — the hour is always zero on a single play. */
function trimDuration(raw: string): string {
  const parts = raw.split(':').map(Number);
  const seconds = parts.length === 3 ? parts[1] * 60 + parts[2] : (parts[0] ?? 0) * 60 + (parts[1] ?? 0);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

function prettyDate(iso: string): string {
  return new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  });
}
