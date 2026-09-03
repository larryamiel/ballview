/**
 * A club's logo, with a graceful path all the way down to nothing.
 *
 * Three things can go wrong and all of them are normal: the cap variant may not exist
 * for a club, the primary may not either, and an offline snapshot has no network at all.
 * Rather than leaving a broken-image glyph in the middle of a scoreboard, the component
 * degrades cap → primary → tinted initials.
 */

import { useEffect, useState } from 'react';

import { teamColor, teamLogoFallbackUrl, teamLogoUrl } from '../../lib/assets';

interface Props {
  teamId?: number | null;
  name?: string | null;
  abbreviation?: string | null;
  size?: number;
  className?: string;
}

type Stage = 'cap' | 'primary' | 'initials';

export function TeamLogo({ teamId, name, abbreviation, size = 28, className }: Props) {
  const [stage, setStage] = useState<Stage>('cap');

  // A recycled row (the schedule re-renders every poll) must not keep the previous
  // team's failure state, or a working logo would render as initials.
  useEffect(() => setStage('cap'), [teamId]);

  const label = name ?? abbreviation ?? 'Team';
  const style = { width: size, height: size };

  if (teamId == null || stage === 'initials') {
    return (
      <span
        className={`team-logo initials${className ? ` ${className}` : ''}`}
        style={{ ...style, background: `${teamColor(teamId)}33`, color: '#fff' }}
        aria-hidden="true"
      >
        {initials(abbreviation ?? name)}
      </span>
    );
  }

  return (
    <img
      className={`team-logo${className ? ` ${className}` : ''}`}
      style={style}
      src={stage === 'cap' ? teamLogoUrl(teamId) : teamLogoFallbackUrl(teamId)}
      alt=""
      title={label}
      loading="lazy"
      onError={() => setStage((s) => (s === 'cap' ? 'primary' : 'initials'))}
    />
  );
}

function initials(source?: string | null): string {
  if (!source) return '?';
  const trimmed = source.trim();
  // An abbreviation ("NYY") is already the right answer; a full name is not.
  if (trimmed.length <= 3) return trimmed.toUpperCase();
  return trimmed
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
}
