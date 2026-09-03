/**
 * The "watch it happen" view: one pitch at a time, from behind the plate.
 *
 * Every other tab is a record of what already happened. This one follows the game as it
 * arrives — the newest pitch animates toward the plate the moment the poll delivers it,
 * and when the ball is put in play the view hands over to the field to show where it
 * went and who handled it.
 *
 * The two phases are deliberate. A pitch that is taken or swung through ends at the
 * plate and there is nothing more to see; a ball in play has a second half, and cutting
 * to the defence is what a broadcast does for the same reason.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { Gauge, RotateCcw, Radio } from 'lucide-react';

import type { LiveFeed, Play, PlayEvent } from '../lib/types';
import { hasTrajectory } from './BallPath';
import { creditedPositions, FieldDiagram } from './FieldDiagram';
import { PitchRail } from './PitchRail';
import { UmpireView } from './UmpireView';
import { PlayerHeadshot } from './ui/PlayerHeadshot';
import { EmptyState } from './ui/States';

export function LiveView({ feed }: { feed: LiveFeed }) {
  const plays = feed.liveData?.plays?.allPlays ?? [];
  const defense = feed.liveData?.linescore?.defense;

  // The current play while a game is live; the last one once it is over, so the tab
  // still shows something useful on a finished game.
  const play: Play | undefined = feed.liveData?.plays?.currentPlay ?? plays[plays.length - 1];
  const pitches = useMemo(
    () => (play?.playEvents ?? []).filter((e) => e.isPitch),
    [play],
  );
  const newest = lastTracked(pitches);

  // A manual replay has to change the run key, so it is a counter rather than a flag.
  const [replays, setReplays] = useState(0);
  const [phase, setPhase] = useState<'pitch' | 'field'>('pitch');
  /**
   * Which pitch the frame is showing.
   *
   * `null` means "whatever is newest", which is the whole point of this tab — the feed
   * arrives and the picture follows it. Picking one from the rail pins it, so you can
   * study the pitch before last without the next poll yanking it away; the pin is
   * dropped when the at-bat changes, and the view goes back to following.
   */
  const [pinned, setPinned] = useState<number | null>(null);
  const atBat = play?.atBatIndex ?? null;
  useEffect(() => setPinned(null), [atBat]);

  const latest = pinned != null ? (pitches[pinned] ?? newest) : newest;
  // What the rail marks: the pinned pitch, or whichever one the frame is following.
  const activeIndex = pinned ?? (newest ? pitches.indexOf(newest) : null);
  const pitchKey = latest ? `${play?.atBatIndex}-${latest.pitchNumber ?? ''}-${latest.playId ?? ''}` : 'none';
  const inPlay = latest?.details?.isInPlay === true;

  // A new pitch always starts back at the plate, whatever the previous one ended as.
  const seen = useRef(pitchKey);
  useEffect(() => {
    if (seen.current !== pitchKey) {
      seen.current = pitchKey;
      setPhase('pitch');
    }
  }, [pitchKey]);

  if (!play || !latest) {
    return (
      <EmptyState icon={<Radio size={22} />} title="Waiting for the first pitch">
        This view follows the live feed — the newest pitch appears here as soon as it is
        tracked.
      </EmptyState>
    );
  }

  const zoneTop = latest.pitchData?.strikeZoneTop;
  const zoneBottom = latest.pitchData?.strikeZoneBottom;
  const credited = creditedPositions(play);

  return (
    <div className="live-view">
      <header className="live-head">
        <span className="live-side">
          <PlayerHeadshot
            personId={play.matchup?.batter?.id}
            name={play.matchup?.batter?.fullName}
            size={40}
          />
          <span className="live-names">
            <span className="muted small">At bat</span>
            <strong>{play.matchup?.batter?.fullName ?? 'Batter'}</strong>
          </span>
        </span>

        <span className="live-count">
          <span className="count">
            {play.count?.balls ?? 0}-{play.count?.strikes ?? 0}
          </span>
          <span className="muted small">
            {play.about?.isTopInning !== false ? 'Top' : 'Bot'} {play.about?.inning ?? '?'}
          </span>
        </span>

        <span className="live-side right">
          <span className="live-names">
            <span className="muted small">Pitching</span>
            <strong>{play.matchup?.pitcher?.fullName ?? 'Pitcher'}</strong>
          </span>
          <PlayerHeadshot
            personId={play.matchup?.pitcher?.id}
            name={play.matchup?.pitcher?.fullName}
            size={40}
          />
        </span>
      </header>

      <div className="live-stage">
        {/* The selector, so any pitch of the at-bat can be watched — not only the one
            that happens to be newest. */}
        <PitchRail
          pitches={pitches}
          selected={activeIndex}
          onPick={(i) => {
            // Re-picking the pitch already showing is a request to watch it again.
            if (i === activeIndex) setReplays((n) => n + 1);
            setPinned(i);
            setPhase('pitch');
          }}
          heading={pinned == null ? 'Following the game' : 'Pinned to one pitch'}
        />

        <div className="live-frame">
          {phase === 'pitch' ? (
            <UmpireView
              pitch={latest}
              zoneTop={zoneTop}
              zoneBottom={zoneBottom}
              runKey={`${pitchKey}-${replays}`}
              // Only a ball in play has a second act; everything else stays at the plate.
              onArrive={inPlay ? () => setPhase('field') : undefined}
            />
          ) : (
            <div className="live-field">
              <FieldDiagram
                defense={defense}
                highlight={credited}
                hit={latest.hitData}
                flightKey={`${pitchKey}-${replays}`}
                compact
              />
            </div>
          )}
        </div>

        <aside className="live-panel">
          <PitchCard pitch={latest} />

          {inPlay && <HitCard pitch={latest} play={play} credited={credited} />}

          <div className="live-actions">
            <button
              className="btn"
              onClick={() => {
                setPhase('pitch');
                setReplays((n) => n + 1);
              }}
            >
              <RotateCcw size={14} /> Replay
            </button>
            {inPlay && (
              <button
                className={`btn${phase === 'field' ? ' ghost' : ''}`}
                onClick={() => setPhase(phase === 'field' ? 'pitch' : 'field')}
              >
                {phase === 'field' ? 'Show the pitch' : 'Show the field'}
              </button>
            )}
            {pinned != null && (
              <button className="btn ghost" onClick={() => setPinned(null)}>
                Follow the game
              </button>
            )}
          </div>
        </aside>
      </div>

      <p className="live-result">
        {play.result?.description ?? latest.details?.description ?? 'In progress'}
      </p>
    </div>
  );
}

function PitchCard({ pitch }: { pitch: PlayEvent }) {
  const d = pitch.pitchData;
  return (
    <div className="live-card">
      <p className="live-card-head">
        <Gauge size={14} aria-hidden="true" />
        {pitch.details?.type?.description ?? 'Pitch'}
      </p>
      <p className="live-speed">
        {d?.startSpeed != null ? d.startSpeed.toFixed(1) : '—'}
        <span className="unit">mph</span>
      </p>
      <dl className="live-stats">
        <div>
          <dt>Result</dt>
          <dd>{pitch.details?.description ?? pitch.details?.call?.description ?? '—'}</dd>
        </div>
        {d?.breaks?.spinRate != null && (
          <div>
            <dt>Spin</dt>
            <dd>{Math.round(d.breaks.spinRate)} rpm</dd>
          </div>
        )}
        {d?.coordinates?.pfxX != null && d?.coordinates?.pfxZ != null && (
          <div>
            <dt>Movement</dt>
            <dd>
              {Math.abs(d.coordinates.pfxX).toFixed(1)} in{' '}
              {d.coordinates.pfxX >= 0 ? 'right' : 'left'} ·{' '}
              {Math.abs(d.coordinates.pfxZ).toFixed(1)} in{' '}
              {d.coordinates.pfxZ >= 0 ? 'ride' : 'drop'}
            </dd>
          </div>
        )}
      </dl>
    </div>
  );
}

function HitCard({
  pitch,
  play,
  credited,
}: {
  pitch: PlayEvent;
  play: Play;
  credited: string[];
}) {
  const hit = pitch.hitData;
  return (
    <div className="live-card in-play">
      <p className="live-card-head">In play</p>
      <p className="live-event">{play.result?.event ?? 'Batted ball'}</p>
      {hit && (
        <dl className="live-stats">
          {hit.launchSpeed != null && (
            <div>
              <dt>Exit velo</dt>
              <dd>{hit.launchSpeed.toFixed(1)} mph</dd>
            </div>
          )}
          {hit.launchAngle != null && (
            <div>
              <dt>Launch</dt>
              <dd>{hit.launchAngle.toFixed(0)}°</dd>
            </div>
          )}
          {hit.totalDistance != null && (
            <div>
              <dt>Distance</dt>
              <dd>{hit.totalDistance.toFixed(0)} ft</dd>
            </div>
          )}
        </dl>
      )}
      {credited.length > 0 && (
        <p className="muted small">Fielded by {credited.join(' → ')}</p>
      )}
    </div>
  );
}

/** The newest pitch that can actually be drawn, so an untracked one does not blank it. */
function lastTracked(pitches: PlayEvent[]): PlayEvent | undefined {
  for (let i = pitches.length - 1; i >= 0; i--) {
    if (hasTrajectory(pitches[i])) return pitches[i];
  }
  return undefined;
}
