/**
 * The play log: what happened, in words, newest first.
 *
 * Deliberately a record rather than a viewer. An expanded row shows the pitch sequence
 * as a table and where the runners went; anything that wants to be *watched* — the
 * umpire's view, the ball path — is one button away in the replay tab rather than
 * duplicated inside every row of a list that can run to eighty entries.
 */

import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Flame, PlayCircle } from 'lucide-react';

import type { LiveFeed, Play, PlayEvent } from '../lib/types';
import { useAppStore } from '../store/useAppStore';
import { PitchPlot } from './PitchPlot';
import { PlayerHeadshot } from './ui/PlayerHeadshot';

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

  // The at-bat in progress opens itself, since it is the one being watched rather than
  // looked up.
  const currentAtBat = feed.liveData?.plays?.currentPlay?.atBatIndex ?? null;

  if (plays.length === 0) {
    return <p className="muted">No plays yet — the game has not started.</p>;
  }

  return (
    <div className="pbp">
      {halves.map((half) => (
        <section key={half.key} className="half-inning">
          <h3 className="half-head">
            <span>{half.label}</span>
            <span className="half-runs muted small">{runsIn(half.plays)} R</span>
          </h3>
          <ol className="play-list">
            {half.plays.map((play, i) => (
              <PlayRow
                key={play.atBatIndex ?? `${half.key}-${i}`}
                play={play}
                isCurrent={currentAtBat != null && play.atBatIndex === currentAtBat}
              />
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}

function PlayRow({ play, isCurrent }: { play: Play; isCurrent: boolean }) {
  const [open, setOpen] = useState(isCurrent);
  const watchAtBat = useAppStore((s) => s.watchAtBat);

  // The at-bat in progress stays open on its own, and folds away once the next one
  // starts — unless the viewer has since opened it again by hand, which `open` keeps.
  useEffect(() => {
    if (isCurrent) setOpen(true);
  }, [isCurrent]);

  const result = play.result;
  const pitches = (play.playEvents ?? []).filter((e) => e.isPitch);
  const scoring = play.about?.isScoringPlay === true;

  return (
    <li className={`play${scoring ? ' scoring' : ''}${isCurrent ? ' current' : ''}`}>
      <button
        className="play-summary"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <PlayerHeadshot
          personId={play.matchup?.batter?.id}
          name={play.matchup?.batter?.fullName}
          size={28}
        />
        <span className="play-event">
          {scoring && <Flame size={13} aria-hidden="true" />}
          {result?.event ?? 'In progress'}
          {isCurrent && <span className="now-chip">Now</span>}
        </span>
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
          <span className="chevron">
            {open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
          </span>
        </span>
      </button>

      {open && (
        <div className="play-detail">
          <div className="play-matchup">
            <PlayerHeadshot
              personId={play.matchup?.batter?.id}
              name={play.matchup?.batter?.fullName}
              size={34}
            />
            <span>
              <strong>{play.matchup?.batter?.fullName ?? 'Batter'}</strong>
              <span className="muted"> vs </span>
              <strong>{play.matchup?.pitcher?.fullName ?? 'Pitcher'}</strong>
            </span>
            <PlayerHeadshot
              personId={play.matchup?.pitcher?.id}
              name={play.matchup?.pitcher?.fullName}
              size={34}
            />

            {pitches.length > 0 && play.atBatIndex != null && (
              <button
                className="btn watch-btn"
                onClick={() => watchAtBat(play.atBatIndex!)}
                title="Open this at-bat in the replay tab"
              >
                <PlayCircle size={15} /> Watch
              </button>
            )}
          </div>

          {/* The table and the plot are the same pitches read two ways — the sequence in
              order, and where they finished. Side by side they also use the width the
              table alone left empty. */}
          <div className="play-detail-grid">
            <div>
              <PitchLog pitches={pitches} />
              <RunnerMoves play={play} />
            </div>

            <div className="play-detail-side">
              <PitchPlot pitches={pitches} width={186} height={222} />
              <HitLine pitches={pitches} />
            </div>
          </div>
        </div>
      )}
    </li>
  );
}

/** The at-bat's pitches as a plain table — a record, not a viewer. */
function PitchLog({ pitches }: { pitches: PlayEvent[] }) {
  if (pitches.length === 0) return null;
  return (
    <table className="pitch-table compact">
      <thead>
        <tr>
          <th>#</th>
          <th>Pitch</th>
          <th>MPH</th>
          <th>Result</th>
          <th>Count</th>
        </tr>
      </thead>
      <tbody>
        {pitches.map((p, i) => (
          <tr key={p.playId ?? i} className={pitchClass(p)}>
            <td>
              <span className={`pitch-pip ${pitchClass(p)}`}>{p.pitchNumber ?? i + 1}</span>
            </td>
            <td>{p.details?.type?.description ?? '—'}</td>
            <td className="num">
              {p.pitchData?.startSpeed != null ? p.pitchData.startSpeed.toFixed(1) : '—'}
            </td>
            <td>{p.details?.description ?? p.details?.call?.description ?? '—'}</td>
            <td className="num">
              {p.count?.balls ?? 0}-{p.count?.strikes ?? 0}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Batted-ball numbers, under the plot, for the pitch that was put in play. */
function HitLine({ pitches }: { pitches: PlayEvent[] }) {
  const hit = pitches.find((p) => p.hitData != null)?.hitData;
  if (!hit) return null;

  const parts: string[] = [];
  if (hit.launchSpeed != null) parts.push(`${hit.launchSpeed.toFixed(1)} mph`);
  if (hit.launchAngle != null) parts.push(`${hit.launchAngle.toFixed(0)}° launch`);
  if (hit.totalDistance != null) parts.push(`${hit.totalDistance.toFixed(0)} ft`);
  if (parts.length === 0) return null;

  return <p className="hit-detail muted small">{parts.join(' · ')}</p>;
}

function pitchClass(p: PlayEvent): string {
  const d = p.details;
  if (d?.isInPlay) return 'in-play';
  if (d?.isStrike) return 'strike';
  if (d?.isBall) return 'ball';
  return '';
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

/**
 * Runs scored in a half-inning.
 *
 * Counted from runners reaching `score`, not from `result.rbi` — a run driven in by an
 * error or a wild pitch is credited to nobody and would go missing from an RBI tally.
 */
function runsIn(plays: Play[]): number {
  return plays.reduce(
    (total, play) =>
      total + (play.runners ?? []).filter((r) => r.movement?.end === 'score').length,
    0,
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
 * Group plays into half-innings, newest first — all the way down.
 *
 * `allPlays` arrives in chronological order. Both the groups and the at-bats inside them
 * are reversed, so the newest inning is on top *and* its newest at-bat is the first row
 * in it. A live viewer reads down from the most recent thing that happened; leaving the
 * at-bats chronological would mean hunting to the bottom of the top group for it.
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

  for (const half of map.values()) half.plays.reverse();

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
