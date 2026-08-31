/** Play-by-play grouped by half-inning, newest inning first. */

import { useMemo, useState } from 'react';

import type { LiveFeed, Play } from '../lib/types';
import { PitchView } from './PitchView';

interface Props {
  feed: LiveFeed;
}

interface HalfInning {
  key: string;
  inning: number;
  isTop: boolean;
  label: string;
  plays: Play[];
}

export function PlayByPlay({ feed }: Props) {
  const plays = feed.liveData?.plays?.allPlays ?? [];
  const halves = useMemo(() => groupByHalfInning(plays), [plays]);

  if (plays.length === 0) {
    return <p className="muted">No plays yet — the game has not started.</p>;
  }

  return (
    <div className="pbp">
      {halves.map((half) => (
        <section key={half.key} className="half-inning">
          <h3 className="half-head">{half.label}</h3>
          <ol className="play-list">
            {half.plays.map((play, i) => (
              <PlayRow key={play.atBatIndex ?? `${half.key}-${i}`} play={play} />
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}

function PlayRow({ play }: { play: Play }) {
  const [open, setOpen] = useState(false);
  const result = play.result;
  const pitches = (play.playEvents ?? []).filter((e) => e.isPitch);
  const scoring = play.about?.isScoringPlay === true;

  return (
    <li className={`play${scoring ? ' scoring' : ''}`}>
      <button className="play-summary" onClick={() => setOpen((v) => !v)}>
        <span className="play-event">{result?.event ?? 'In progress'}</span>
        <span className="play-desc">
          {result?.description ?? describeInProgress(play)}
        </span>
        <span className="play-meta">
          {typeof result?.awayScore === 'number' && typeof result?.homeScore === 'number' && (
            <span className="muted small">
              {result.awayScore}–{result.homeScore}
            </span>
          )}
          {pitches.length > 0 && (
            <span className="muted small">
              {pitches.length} {pitches.length === 1 ? 'pitch' : 'pitches'}
            </span>
          )}
          <span className="chevron">{open ? '▾' : '▸'}</span>
        </span>
      </button>

      {open && (
        <div className="play-detail">
          <div className="matchup muted small">
            {play.matchup?.batter?.fullName ?? 'Batter'} vs{' '}
            {play.matchup?.pitcher?.fullName ?? 'Pitcher'}
          </div>
          <PitchView play={play} />
          <RunnerMoves play={play} />
        </div>
      )}
    </li>
  );
}

function RunnerMoves({ play }: { play: Play }) {
  const moves = (play.runners ?? []).filter((r) => r.movement?.end || r.movement?.isOut);
  if (moves.length === 0) return null;

  return (
    <ul className="runners">
      {moves.map((r, i) => {
        const who = r.details?.runner?.fullName ?? 'Runner';
        const m = r.movement;
        const out = m?.isOut === true;
        const to = m?.end === 'score' ? 'scored' : m?.end ? `to ${m.end}` : '';
        return (
          <li key={i} className={out ? 'runner out' : 'runner'}>
            {who} {out ? `out at ${m?.outBase ?? m?.end ?? 'base'}` : to}
          </li>
        );
      })}
    </ul>
  );
}

function describeInProgress(play: Play): string {
  const c = play.count;
  if (c && (c.balls != null || c.strikes != null)) {
    return `${c.balls ?? 0}-${c.strikes ?? 0} count`;
  }
  return 'At bat in progress';
}

/**
 * Group plays into half-innings, most recent first.
 *
 * `allPlays` arrives in chronological order. Reversing the *groups* while keeping each
 * group internally chronological is what a viewer wants: the current inning on top, but
 * its at-bats still reading top to bottom.
 */
function groupByHalfInning(plays: Play[]): HalfInning[] {
  const map = new Map<string, HalfInning>();

  for (const play of plays) {
    const inning = play.about?.inning ?? 0;
    const isTop = play.about?.isTopInning !== false;
    const key = `${inning}-${isTop ? 'top' : 'bot'}`;

    if (!map.has(key)) {
      map.set(key, {
        key,
        inning,
        isTop,
        label: `${isTop ? 'Top' : 'Bottom'} ${ordinal(inning)}`,
        plays: [],
      });
    }
    map.get(key)!.plays.push(play);
  }

  return [...map.values()].sort(
    (a, b) => b.inning - a.inning || Number(a.isTop) - Number(b.isTop),
  );
}

function ordinal(n: number): string {
  const rem100 = n % 100;
  if (rem100 >= 11 && rem100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}
