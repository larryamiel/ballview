/**
 * A player's headshot, falling back to their initials.
 *
 * Sized in CSS by the `size` prop rather than the rendition, because the same 120px
 * cutout is reused at 24px and 44px across the app and swapping renditions per call
 * site would just mean more cache misses.
 */

import { useEffect, useState } from 'react';

import { headshotUrl } from '../../lib/assets';

interface Props {
  personId?: number | null;
  name?: string | null;
  size?: number;
  className?: string;
}

export function PlayerHeadshot({ personId, name, size = 32, className }: Props) {
  const [failed, setFailed] = useState(false);

  useEffect(() => setFailed(false), [personId]);

  const style = { width: size, height: size };
  const classes = `headshot${className ? ` ${className}` : ''}`;

  if (personId == null || failed) {
    return (
      <span className={`${classes} initials`} style={style} aria-hidden="true">
        {initials(name)}
      </span>
    );
  }

  return (
    <img
      className={classes}
      style={style}
      src={headshotUrl(personId)}
      alt=""
      title={name ?? undefined}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}

function initials(name?: string | null): string {
  if (!name) return '·';
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
}
