/**
 * Replay: any pitch of any at-bat, watched the way the live view shows the current one.
 *
 * The live tab follows the game and gives you no say in what it shows; the play log is
 * a text record you read. This is the half in between — pick an at-bat from the list,
 * pick a pitch from its sequence, and watch it from behind the plate. It is where you
 * go after "what *was* that pitch?", which is a question the other two tabs answer only
 * in words.
 *
 * The list and the viewer are the same components the other tabs use, so there is one
 * implementation of an at-bat row and one of a pitch.
 */

import { useEffect, useMemo, useRef } from 'react';
import { Rewind } from 'lucide-react';

import type { LiveFeed, Play } from '../lib/types';
import { useAppStore } from '../store/useAppStore';
import { alignmentForPlay } from './FieldDiagram';
import { PitchView } from './PitchView';
import { PlayerHeadshot } from './ui/PlayerHeadshot';
import { EmptyState } from './ui/States';

export function ReplayView({ feed }: { feed: LiveFeed }) {
  const selected = useAppStore((s) => s.replayAtBat);
  const setSelected = useAppStore((s) => s.setReplayAtBat);
  const listRef = useRef<HTMLDivElement>(null);

  // Only at-bats with pitches: a substitution or a pickoff has nothing to replay.
  const plays = useMemo(
    () =>
      (feed.liveData?.plays?.allPlays ?? []).filter((p) =>
        (p.playEvents ?? []).some((e) => e.isPitch),
      ),
    [feed],
  );

  const newest = plays.length ? (plays[plays.length - 1].atBatIndex ?? null) : null;
  const play = plays.find((p) => p.atBatIndex === selected) ?? plays[plays.length - 1];

  // Land on the most recent at-bat when arriving with nothing chosen, and follow the
  // game forward only while the viewer has not picked something older to study.
  useEffect(() => {
    if (selected == null && newest != null) setSelected(newest);
  }, [selected, newest, setSelected]);

  // Keep the chosen row in view when the tab is opened from the play log.
  useEffect(() => {
    const active = listRef.current?.querySelector('.replay-row.active');
    active?.scrollIntoView({ block: 'nearest' });
  }, [selected]);

  if (plays.length === 0) {
    return (
      <EmptyState icon={<Rewind size={22} />} title="Nothing to replay yet">
        Once pitches have been thrown they all become available here, at-bat by at-bat.
      </EmptyState>
    );
  }

  return (
    <div className="replay-view">
      <aside className="replay-list" ref={listRef}>
        <p className="replay-list-head muted small">
          {plays.length} at-bats · newest first
        </p>
        {[...plays].reverse().map((p, i) => (
          <ReplayRow
            key={p.atBatIndex ?? i}
            play={p}
            active={p.atBatIndex === play?.atBatIndex}
            onPick={() => setSelected(p.atBatIndex ?? null)}
          />
        ))}
      </aside>

      <div className="replay-stage">
        {play && (
          <>
            <header className="replay-head">
              <span className="inning-chip">
                {play.about?.isTopInning !== false ? 'Top' : 'Bot'} {play.about?.inning ?? '?'}
              </span>
              <PlayerHeadshot
                personId={play.matchup?.batter?.id}
                name={play.matchup?.batter?.fullName}
                size={34}
              />
              <span className="replay-names">
                <strong>{play.matchup?.batter?.fullName ?? 'Batter'}</strong>
                <span className="muted small">
                  vs {play.matchup?.pitcher?.fullName ?? 'Pitcher'}
                </span>
              </span>
              <PlayerHeadshot
                personId={play.matchup?.pitcher?.id}
                name={play.matchup?.pitcher?.fullName}
                size={34}
              />
              <span className="replay-result">{play.result?.event ?? 'In progress'}</span>
            </header>

            {/* `key` remounts the viewer per at-bat, so the pitch selection and the
                animation both restart instead of carrying over from the last one. */}
            <PitchView
              key={play.atBatIndex}
              play={play}
              defense={alignmentForPlay(play, feed.liveData?.boxscore)}
            />

            {play.result?.description && (
              <p className="live-result">{play.result.description}</p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function ReplayRow({
  play,
  active,
  onPick,
}: {
  play: Play;
  active: boolean;
  onPick: () => void;
}) {
  const pitches = (play.playEvents ?? []).filter((e) => e.isPitch).length;
  const scoring = play.about?.isScoringPlay === true;

  return (
    <button
      className={`replay-row${active ? ' active' : ''}${scoring ? ' scoring' : ''}`}
      onClick={onPick}
      aria-current={active ? 'true' : undefined}
    >
      <span className="replay-inning muted small">
        {play.about?.isTopInning !== false ? 'T' : 'B'}
        {play.about?.inning ?? '?'}
      </span>
      <span className="replay-row-body">
        <span className="replay-batter">{play.matchup?.batter?.fullName ?? 'Batter'}</span>
        <span className="muted small">{play.result?.event ?? 'In progress'}</span>
      </span>
      <span className="muted small replay-count">{pitches}p</span>
    </button>
  );
}
