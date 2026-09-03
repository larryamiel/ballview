/**
 * The pitch selector: one card per pitch of an at-bat, in a column.
 *
 * Shared by the live view and the replay so both screens pick a pitch the same way. A
 * row of numbered dots made you hover each one to find out what it was; the card says it
 * outright — type, speed and how the count moved — and running down the side rather than
 * across the top means a fourteen-pitch at-bat scrolls instead of pushing the picture
 * down the screen.
 */

import type { PlayEvent } from '../lib/types';

interface Props {
  pitches: PlayEvent[];
  /** Index into `pitches`, or null when nothing is chosen yet. */
  selected: number | null;
  onPick: (index: number) => void;
  /** Overrides the "N pitches" heading — the live view says what it is following. */
  heading?: string;
}

export function PitchRail({ pitches, selected, onPick, heading }: Props) {
  if (pitches.length === 0) return null;

  return (
    <aside className="pitch-rail" role="group" aria-label="Pitches in this at-bat">
      <p className="rail-head muted small">
        {heading ?? `${pitches.length} ${pitches.length === 1 ? 'pitch' : 'pitches'}`}
      </p>
      {pitches.map((p, i) => (
        <button
          key={p.playId ?? i}
          className={`pitch-card ${pitchClass(p)}${selected === i ? ' current' : ''}`}
          onClick={() => onPick(i)}
          aria-pressed={selected === i}
          title={p.details?.description ?? p.details?.call?.description ?? undefined}
        >
          <span className={`pitch-pip ${pitchClass(p)}`}>{p.pitchNumber ?? i + 1}</span>
          <span className="pc-body">
            <span className="pc-type">{shortType(p)}</span>
            <span className="pc-speed muted small">
              {p.pitchData?.startSpeed != null ? `${p.pitchData.startSpeed.toFixed(0)} mph` : '—'}
              {p.count && ` · ${p.count.balls ?? 0}-${p.count.strikes ?? 0}`}
            </span>
          </span>
        </button>
      ))}
    </aside>
  );
}

/**
 * A pitch name short enough for a selector card.
 *
 * MLB's own descriptions run to "Four-Seam Fastball", which is three lines in a card this
 * narrow; the shortened forms are the ones a broadcast graphic uses.
 */
const SHORT_TYPE: Record<string, string> = {
  'Four-Seam Fastball': '4-Seam',
  'Two-Seam Fastball': '2-Seam',
  'Split-Finger': 'Splitter',
  'Knuckle Curve': 'Knuckle Cv',
  Curveball: 'Curve',
  Changeup: 'Change',
};

function shortType(p: PlayEvent): string {
  const name = p.details?.type?.description;
  if (!name) return 'Pitch';
  return SHORT_TYPE[name] ?? name;
}

export function pitchClass(p: PlayEvent): string {
  const d = p.details;
  if (d?.isInPlay) return 'in-play';
  if (d?.isStrike) return 'strike';
  if (d?.isBall) return 'ball';
  return '';
}
