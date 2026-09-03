/**
 * Who is at the plate right now. Feature 3.
 *
 * Shown only while a game is live, because it is the one card that answers "what am I
 * looking at" before the play log does. Faces carry that faster than names: a viewer
 * recognises their team's catcher long before they finish reading his surname.
 */

import { PlayerHeadshot } from './ui/PlayerHeadshot';
import type { LiveFeed } from '../lib/types';

export function Matchup({ feed }: { feed: LiveFeed }) {
  const play = feed.liveData?.plays?.currentPlay;
  const offense = feed.liveData?.linescore?.offense;
  const matchup = play?.matchup;

  const batter = matchup?.batter ?? offense?.batter;
  const pitcher = matchup?.pitcher ?? feed.liveData?.linescore?.defense?.pitcher;
  if (!batter && !pitcher) return null;

  const count = play?.count;

  return (
    <div className="matchup-card">
      <Side
        role="At bat"
        person={batter}
        hand={matchup?.batSide?.code ? `${matchup.batSide.code}HB` : null}
      />

      <div className="matchup-middle">
        {count && (
          <span className="matchup-count">
            {count.balls ?? 0}-{count.strikes ?? 0}
          </span>
        )}
        <span className="muted small">
          {play?.result?.description ? 'last result below' : 'in progress'}
        </span>
      </div>

      <Side
        role="Pitching"
        person={pitcher}
        hand={matchup?.pitchHand?.code ? `${matchup.pitchHand.code}HP` : null}
        align="right"
      />

      {offense?.onDeck?.fullName && (
        <p className="matchup-deck muted small">
          On deck: {offense.onDeck.fullName}
          {offense.inHole?.fullName && ` · In the hole: ${offense.inHole.fullName}`}
        </p>
      )}
    </div>
  );
}

function Side({
  role,
  person,
  hand,
  align = 'left',
}: {
  role: string;
  person?: { id?: number | null; fullName?: string | null; name?: string | null } | null;
  hand?: string | null;
  align?: 'left' | 'right';
}) {
  const name = person?.fullName ?? person?.name ?? '—';
  return (
    <div className={`matchup-side ${align}`}>
      <PlayerHeadshot personId={person?.id} name={name} size={46} />
      <div className="matchup-text">
        <span className="muted small">{role}</span>
        <span className="matchup-name">{name}</span>
        {hand && <span className="muted small">{hand}</span>}
      </div>
    </div>
  );
}
