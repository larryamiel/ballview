/**
 * Player of the day, the week and the month.
 *
 * The ranking is computed in Rust (`commands/spotlight.rs`, where the weighting is
 * explained). This screen's job is to make the result legible: who, what they did, and
 * why they are top — then, on a click, the games behind it and the clips they appear in.
 *
 * The honest caveat is shown, not buried: MLB publishes WAR season-to-date only, so the
 * headline number is a wins estimate computed from the window's own line.
 *
 * The window is anchored on the last slate that was actually played, not on today. For
 * most of the day today has no completed games in it — the US evening has not happened
 * yet — and a day's leaderboard over an empty day ranked nobody, which is what "Player
 * of the Day doesn't work" looked like. When the window has fallen back, the panel says
 * so rather than presenting last night's winner as today's.
 */

import { useState } from 'react';
import { useQueries, useQuery } from '@tanstack/react-query';
import { Film, Trophy, X } from 'lucide-react';

import * as api from '../lib/api';
import type { Performer, SpotlightPeriod } from '../lib/types';
import { PlayerHeadshot } from './ui/PlayerHeadshot';
import { TeamLogo } from './ui/TeamLogo';
import { EmptyState, ErrorState, Skeleton } from './ui/States';

const PERIODS: { id: SpotlightPeriod; label: string }[] = [
  { id: 'day', label: 'Day' },
  { id: 'week', label: 'Week' },
  { id: 'month', label: 'Month' },
];

export function SpotlightPanel() {
  const [period, setPeriod] = useState<SpotlightPeriod>('day');
  const [open, setOpen] = useState<{ performer: Performer; group: 'hitting' | 'pitching' } | null>(
    null,
  );

  const spotlight = useQuery({
    queryKey: ['spotlight', period],
    queryFn: () => api.getTopPerformers(period, undefined, undefined, 5),
    staleTime: 5 * 60 * 1000,
  });

  return (
    <div className="spotlight">
      <div className="panel-head">
        <div className="panel-title">
          <h2>
            <Trophy size={18} aria-hidden="true" /> Player of the {period}
          </h2>
          {spotlight.data && (
            <p className="muted small">
              {spotlight.data.start === spotlight.data.end
                ? prettyDate(spotlight.data.end)
                : `${prettyDate(spotlight.data.start)} – ${prettyDate(spotlight.data.end)}`}
              {spotlight.data.resolvedBack && ' · the last completed slate'}
            </p>
          )}
        </div>

        <span className="view-switch" role="group" aria-label="Period">
          {PERIODS.map((p) => (
            <button
              key={p.id}
              className={period === p.id ? 'vs active' : 'vs'}
              onClick={() => setPeriod(p.id)}
            >
              {p.label}
            </button>
          ))}
        </span>
      </div>

      {spotlight.isLoading && <Skeleton rows={4} />}
      {spotlight.isError && (
        <ErrorState
          title="Could not rank anyone"
          error={spotlight.error}
          onRetry={() => spotlight.refetch()}
        />
      )}

      {spotlight.data && (
        <div className="spotlight-columns">
          <Column
            title="Position players"
            performers={spotlight.data.hitters}
            onOpen={(p) => setOpen({ performer: p, group: 'hitting' })}
          />
          <Column
            title="Pitchers"
            performers={spotlight.data.pitchers}
            onOpen={(p) => setOpen({ performer: p, group: 'pitching' })}
          />
        </div>
      )}

      <p className="muted small spotlight-note">
        Ranked on wins added over the window (50%), raw production (30%) and season WAR
        (20%). The wins figure is estimated from the window's own line with standard linear
        weights — MLB publishes WAR season-to-date only, so there is no such thing as a
        single day's WAR to read.
      </p>

      {open && (
        <PerformerModal
          performer={open.performer}
          group={open.group}
          onClose={() => setOpen(null)}
        />
      )}
    </div>
  );
}

function Column({
  title,
  performers,
  onOpen,
}: {
  title: string;
  performers: Performer[];
  onOpen: (p: Performer) => void;
}) {
  if (performers.length === 0) {
    return (
      <section>
        <h3 className="box-head">{title}</h3>
        <EmptyState title="Nobody qualified">
          Every player needs a minimum of work in the window — three plate appearances, or
          three innings — so a very short slate can still come back empty.
        </EmptyState>
      </section>
    );
  }

  const [leader, ...rest] = performers;
  return (
    <section>
      <h3 className="box-head">{title}</h3>

      <button className="spot-leader" onClick={() => onOpen(leader)}>
        <PlayerHeadshot personId={leader.playerId} name={leader.playerName} size={64} />
        <span className="spot-leader-body">
          <span className="spot-name">
            <strong>{leader.playerName}</strong>
            {leader.teamId && <TeamLogo teamId={leader.teamId} name={leader.teamName} size={18} />}
          </span>
          <span className="spot-line">{leader.line}</span>
          <span className="muted small">
            +{leader.winsEstimate.toFixed(2)} wins
            {leader.seasonWar != null && ` · ${leader.seasonWar.toFixed(1)} WAR this season`}
          </span>
        </span>
        <span className="spot-score">{Math.round(leader.score)}</span>
      </button>

      <ol className="spot-rest">
        {rest.map((p) => (
          <li key={p.playerId}>
            <button onClick={() => onOpen(p)}>
              <PlayerHeadshot personId={p.playerId} name={p.playerName} size={28} />
              <span className="spot-rest-name">{p.playerName}</span>
              <span className="muted small spot-rest-line">{p.line}</span>
              <span className="spot-rest-score">{Math.round(p.score)}</span>
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
}

/**
 * What one performer actually did, game by game, with the clips they are in.
 *
 * The game log is filtered to the spotlight window rather than fetched per game: it is
 * one request for the season and the window is at most a month of it. Clips are then
 * fetched per game in that window, and MLB's `player_id` keyword decides which of a
 * game's thirty highlights belong to this player.
 */
function PerformerModal({
  performer,
  group,
  onClose,
}: {
  performer: Performer;
  group: 'hitting' | 'pitching';
  onClose: () => void;
}) {
  const spotlight = useQuery({
    queryKey: ['gameLog', performer.playerId, group, 'spotlight'],
    queryFn: () => api.getPlayerGameLog(performer.playerId, group),
    staleTime: 10 * 60 * 1000,
  });

  // The most recent handful of games — the window that earned the award.
  const games = (spotlight.data ?? []).slice(-5).reverse();

  const clips = useQueries({
    queries: games.map((g) => ({
      queryKey: ['playerHighlights', g.gamePk, performer.playerId],
      queryFn: () => api.getPlayerHighlights(g.gamePk!, performer.playerId),
      enabled: g.gamePk != null,
      staleTime: 30 * 60 * 1000,
    })),
  });

  const allClips = clips.flatMap((q) => q.data ?? []).filter((c) => c.url);
  const [playing, setPlaying] = useState<string | null>(null);

  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <div
        className="modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={performer.playerName}
      >
        <header className="modal-head">
          <PlayerHeadshot personId={performer.playerId} name={performer.playerName} size={48} />
          <span>
            <strong>{performer.playerName}</strong>
            <span className="muted small">
              {' '}
              {performer.position} {performer.teamName ? `· ${performer.teamName}` : ''}
            </span>
          </span>
          <button className="icon-only modal-close" onClick={onClose} title="Close">
            <X size={18} />
          </button>
        </header>

        <p className="spot-line modal-line">{performer.line}</p>

        {spotlight.isLoading ? (
          <Skeleton rows={3} />
        ) : (
          <table className="box-table modal-table">
            <thead>
              <tr>
                <th className="box-name">Game</th>
                {(group === 'hitting'
                  ? ['AB', 'H', 'HR', 'RBI', 'BB', 'SO']
                  : ['IP', 'H', 'ER', 'BB', 'SO']
                ).map((h) => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {games.map((g) => (
                <tr key={g.gamePk ?? g.date}>
                  <td className="box-name">
                    {g.date && prettyDate(g.date)}
                    <span className="muted small">
                      {' '}
                      {g.isHome ? 'vs' : '@'} {g.opponent?.abbreviation ?? g.opponent?.name ?? ''}
                    </span>
                  </td>
                  {(group === 'hitting'
                    ? ['atBats', 'hits', 'homeRuns', 'rbi', 'baseOnBalls', 'strikeOuts']
                    : ['inningsPitched', 'hits', 'earnedRuns', 'baseOnBalls', 'strikeOuts']
                  ).map((key) => (
                    <td key={key} className="num">
                      {g.stat[key] ?? '—'}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <h4 className="box-head modal-clips-head">
          <Film size={14} aria-hidden="true" /> Highlights
        </h4>
        {clips.some((q) => q.isLoading) ? (
          <p className="muted small">Looking for clips…</p>
        ) : allClips.length === 0 ? (
          <p className="muted small">No clips tagged with this player in these games.</p>
        ) : (
          <div className="modal-clips">
            {allClips.slice(0, 6).map((clip) => (
              <button
                key={clip.id}
                className={playing === clip.url ? 'clip-card playing' : 'clip-card'}
                onClick={() => setPlaying(clip.url ?? null)}
              >
                {clip.thumbnail && <img src={clip.thumbnail} alt="" loading="lazy" />}
                <span>{clip.title}</span>
              </button>
            ))}
          </div>
        )}

        {playing && (
          <video key={playing} className="modal-video" src={playing} controls autoPlay />
        )}
      </div>
    </div>
  );
}

function prettyDate(iso: string): string {
  return new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}
