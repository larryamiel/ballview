/**
 * Per-pitch detail for one at-bat. Feature 4.
 *
 * Three linked views of the same pitches: a strike-zone plot (where it ended up), a
 * table (what it was), and the ball-path preview (how it got there). Selecting a pitch
 * in any of them drives the others, so the plot doubles as a picker — clicking the
 * outlier in the dirt is a more natural way to ask "what was that?" than finding its
 * row.
 *
 * Coordinates come from the Stats API's own `pitchData`; Statcast enrichment is not
 * required for any of this.
 */

import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Eye, RotateCcw, Shield, Table2, Video } from 'lucide-react';

import * as api from '../lib/api';
import type { Defense, Play, PlayEvent } from '../lib/types';
import { useAppStore } from '../store/useAppStore';
import { BallPath, hasTrajectory } from './BallPath';
import { creditedPositions, FieldDiagram } from './FieldDiagram';
import { PitchPlot, zoneBounds } from './PitchPlot';
import { pitchClass, PitchRail } from './PitchRail';
import { UmpireView } from './UmpireView';

export function PitchView({ play, defense }: { play: Play; defense?: Defense | null }) {
  const pitches = useMemo(
    () => (play.playEvents ?? []).filter((e) => e.isPitch),
    [play.playEvents],
  );

  // Default to the pitch that ended the at-bat, since that is the one being read about.
  const defaultIndex = useMemo(() => {
    const last = [...pitches].reverse().findIndex(hasTrajectory);
    return last === -1 ? null : pitches.length - 1 - last;
  }, [pitches]);

  const [selected, setSelected] = useState<number | null>(defaultIndex);
  const [replays, setReplays] = useState(0);
  const view = useAppStore((s) => s.pitchView);
  const setView = useAppStore((s) => s.setPitchView);

  // A live at-bat gains pitches under us; follow the newest rather than stranding the
  // selection on a pitch thrown four pitches ago.
  useEffect(() => setSelected(defaultIndex), [defaultIndex]);

  /**
   * Savant's video of whichever pitch is selected.
   *
   * Resolved as soon as a pitch is picked rather than when the Clip tab is opened, so the
   * tab can honestly say whether there is one to watch. A pitch's clip URL never changes,
   * so it is cached for the session and each pitch costs one lookup however often it is
   * revisited.
   */
  const playId = selected != null ? (pitches[selected]?.playId ?? null) : null;
  const clip = useQuery({
    queryKey: ['pitchClip', playId],
    queryFn: () => api.getPitchClip(playId!),
    enabled: playId != null,
    staleTime: Infinity,
    gcTime: 60 * 60 * 1000,
    retry: false,
  });

  if (pitches.length === 0) {
    return <p className="muted small">No pitch data for this play.</p>;
  }

  const active = selected != null ? pitches[selected] : null;
  const zone = zoneBounds(pitches);

  const pick = (i: number) => {
    setSelected(i);
    // Re-picking the pitch already showing is a request to watch it again.
    if (i === selected) setReplays((n) => n + 1);
  };

  return (
    <div className="pitch-view">
      <PitchRail pitches={pitches} selected={selected} onPick={pick} />

      <div className="pitch-main">
      <div className="pitch-toolbar">
        <span className="view-switch" role="group" aria-label="Pitch view">
          <button
            className={view === 'umpire' ? 'vs active' : 'vs'}
            onClick={() => setView('umpire')}
          >
            <Eye size={14} aria-hidden="true" /> Umpire
          </button>
          <button
            className={view === 'data' ? 'vs active' : 'vs'}
            onClick={() => setView('data')}
          >
            <Table2 size={14} aria-hidden="true" /> Pitch data
          </button>
          {/* Only offered once Savant has actually answered with a video. */}
          {playId != null && (clip.isPending || clip.data) && (
            <button
              className={view === 'clip' ? 'vs active' : 'vs'}
              onClick={() => setView('clip')}
              disabled={clip.isPending}
            >
              <Video size={14} aria-hidden="true" /> {clip.isPending ? 'Clip…' : 'Clip'}
            </button>
          )}
        </span>
      </div>

      {view === 'clip' ? (
        <ClipPanel pitch={active} url={clip.data ?? null} pending={clip.isPending} />
      ) : view === 'umpire' ? (
        <UmpirePanel
          pitch={active}
          play={play}
          defense={defense}
          zone={zone}
          runKey={`${play.atBatIndex}-${selected}-${replays}`}
          onReplay={() => setReplays((n) => n + 1)}
        />
      ) : (
        <>
          <div className="pitch-view-top">
            <PitchPlot pitches={pitches} selectedIndex={selected} onSelect={pick} />

            <table className="pitch-table">
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
                  <tr
                    key={p.playId ?? i}
                    className={`${pitchClass(p)}${selected === i ? ' selected' : ''}${
                      hasTrajectory(p) ? ' selectable' : ''
                    }`}
                    onClick={() => hasTrajectory(p) && pick(i)}
                    title={hasTrajectory(p) ? 'Show the ball path' : undefined}
                  >
                    <td>
                      <span className={`pitch-pip ${pitchClass(p)}`}>
                        {p.pitchNumber ?? i + 1}
                      </span>
                    </td>
                    <td>{p.details?.type?.description ?? '—'}</td>
                    <td className="num">
                      {p.pitchData?.startSpeed != null
                        ? `${p.pitchData.startSpeed.toFixed(1)}`
                        : '—'}
                    </td>
                    <td>{p.details?.description ?? p.details?.call?.description ?? '—'}</td>
                    <td className="num">
                      {p.count?.balls ?? 0}-{p.count?.strikes ?? 0}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {active && hasTrajectory(active) && (
            <div className="pitch-path-block">
              <p className="path-heading">
                <span className={`pitch-pip ${pitchClass(active)}`}>
                  {active.pitchNumber ?? (selected ?? 0) + 1}
                </span>
                <strong>{active.details?.type?.description ?? 'Pitch'}</strong>
                {active.pitchData?.startSpeed != null && (
                  <span className="muted"> · {active.pitchData.startSpeed.toFixed(1)} mph</span>
                )}
                {active.pitchData?.breaks?.spinRate != null && (
                  <span className="muted">
                    {' '}
                    · {Math.round(active.pitchData.breaks.spinRate)} rpm
                  </span>
                )}
              </p>
              <BallPath pitch={active} zoneTop={zone.top} zoneBottom={zone.bottom} />
            </div>
          )}
        </>
      )}

        <HitDetail pitches={pitches} />
      </div>
    </div>
  );
}

/**
 * Savant's video of the selected pitch.
 *
 * Every tracked pitch has one, not only the ones that made a highlight reel, so this is
 * a third way to watch the same pitch the other two tabs draw: the actual broadcast cut
 * from the centre-field camera. `key` on the element forces the player to reload when
 * the selection moves rather than keeping the previous pitch's frame on screen.
 */
function ClipPanel({
  pitch,
  url,
  pending,
}: {
  pitch: PlayEvent | null;
  url: string | null;
  pending: boolean;
}) {
  if (pending) {
    return <p className="muted small pitch-untracked">Looking for the video of this pitch…</p>;
  }
  if (!url) {
    return (
      <p className="muted small pitch-untracked">
        Baseball Savant has no video for this pitch. Clips appear once a game has been
        cut, so a game in progress may not have them yet.
      </p>
    );
  }

  return (
    <div className="pitch-clip">
      <video key={url} src={url} controls autoPlay loop playsInline preload="auto" />
      <p className="muted small">
        {pitch?.details?.type?.description ?? 'Pitch'} ·{' '}
        {pitch?.details?.description ?? pitch?.details?.call?.description ?? '—'} · video
        from Baseball Savant
      </p>
    </div>
  );
}

/**
 * The selected pitch from behind the plate, with its numbers beside it.
 *
 * A pitch that was put in play has a second half, so the frame follows the ball: once it
 * reaches the plate the view cuts to the defence and the batted ball flies out to
 * whoever handled it. Everything else ends at the plate, because nothing else happened.
 */
function UmpirePanel({
  pitch,
  play,
  defense,
  zone,
  runKey,
  onReplay,
}: {
  pitch: PlayEvent | null;
  play: Play;
  defense?: Defense | null;
  zone: { top: number; bottom: number };
  runKey: string;
  onReplay: () => void;
}) {
  const [phase, setPhase] = useState<'pitch' | 'field'>('pitch');

  // A different pitch — or the same one watched again — starts back at the plate.
  useEffect(() => setPhase('pitch'), [runKey]);

  if (!pitch || !hasTrajectory(pitch)) {
    return (
      <p className="muted small pitch-untracked">
        This pitch was not tracked, so there is no path to draw. The pitch data view
        still has its location and result.
      </p>
    );
  }

  const d = pitch.pitchData;
  // Only hand over when there is a defence to hand over *to*: a snapshot of a finished
  // game has the alignment, a feed that has not loaded one does not.
  const inPlay = pitch.details?.isInPlay === true && defense != null;
  const credited = creditedPositions(play);

  return (
    <div className="pitch-umpire">
      {phase === 'pitch' ? (
        <UmpireView
          pitch={pitch}
          zoneTop={zone.top}
          zoneBottom={zone.bottom}
          runKey={runKey}
          onArrive={inPlay ? () => setPhase('field') : undefined}
        />
      ) : (
        <div className="pitch-field">
          <FieldDiagram
            defense={defense}
            highlight={credited}
            hit={pitch.hitData}
            flightKey={runKey}
            compact
          />
        </div>
      )}

      <div className="pitch-facts">
        <p className="live-card-head">{pitch.details?.type?.description ?? 'Pitch'}</p>
        <p className="live-speed">
          {d?.startSpeed != null ? d.startSpeed.toFixed(1) : '—'}
          <span className="unit">mph</span>
        </p>
        <dl className="live-stats">
          <div>
            <dt>Result</dt>
            <dd>{pitch.details?.description ?? pitch.details?.call?.description ?? '—'}</dd>
          </div>
          <div>
            <dt>Count</dt>
            <dd>
              {pitch.count?.balls ?? 0}-{pitch.count?.strikes ?? 0}
            </dd>
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

        {inPlay && (
          <div className="pitch-hit">
            <p className="live-card-head">In play</p>
            <p className="live-event">{play.result?.event ?? 'Batted ball'}</p>
            <dl className="live-stats">
              {pitch.hitData?.launchSpeed != null && (
                <div>
                  <dt>Exit velo</dt>
                  <dd>{pitch.hitData.launchSpeed.toFixed(1)} mph</dd>
                </div>
              )}
              {pitch.hitData?.launchAngle != null && (
                <div>
                  <dt>Launch</dt>
                  <dd>{pitch.hitData.launchAngle.toFixed(0)}°</dd>
                </div>
              )}
              {pitch.hitData?.totalDistance != null && (
                <div>
                  <dt>Distance</dt>
                  <dd>{pitch.hitData.totalDistance.toFixed(0)} ft</dd>
                </div>
              )}
            </dl>
            {credited.length > 0 && (
              <p className="muted small">Fielded by {credited.join(' → ')}</p>
            )}
          </div>
        )}

        <div className="live-actions">
          <button
            className="btn"
            onClick={() => {
              setPhase('pitch');
              onReplay();
            }}
          >
            <RotateCcw size={14} /> Replay
          </button>
          {inPlay && (
            <button
              className={`btn${phase === 'field' ? ' ghost' : ''}`}
              onClick={() => setPhase(phase === 'field' ? 'pitch' : 'field')}
            >
              <Shield size={14} /> {phase === 'field' ? 'Show the pitch' : 'Show the field'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/** Batted-ball detail, shown only for the pitch that was put in play. */
function HitDetail({ pitches }: { pitches: PlayEvent[] }) {
  const inPlay = pitches.find((p) => p.hitData != null);
  const hit = inPlay?.hitData;
  if (!hit) return null;

  const parts: string[] = [];
  if (hit.launchSpeed != null) parts.push(`${hit.launchSpeed.toFixed(1)} mph off the bat`);
  if (hit.launchAngle != null) parts.push(`${hit.launchAngle.toFixed(0)}° launch`);
  if (hit.totalDistance != null) parts.push(`${hit.totalDistance.toFixed(0)} ft`);
  if (hit.trajectory) parts.push(hit.trajectory.replace(/_/g, ' '));

  if (parts.length === 0) return null;
  return <p className="hit-detail muted small">{parts.join(' · ')}</p>;
}


