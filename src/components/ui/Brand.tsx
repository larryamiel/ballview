/**
 * The ballview mark: a baseball whose seam doubles as a play triangle.
 *
 * Drawn inline rather than loaded from a file so it inherits `currentColor`, scales
 * with the layout, and costs no request — the same mark is exported to `public/logo.svg`
 * for the window/tab icon, where inheriting colour is not an option.
 */

interface Props {
  size?: number;
  className?: string;
}

export function BrandMark({ size = 26, className }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      className={className}
      role="img"
      aria-label="ballview"
    >
      <circle cx="16" cy="16" r="14" className="bm-ball" />
      {/* The two arcs are a baseball's seams; the gap between them frames the play glyph. */}
      <path d="M6.2 6.2c4 3.4 4 15.9 0 19.6" className="bm-seam" />
      <path d="M25.8 6.2c-4 3.4-4 15.9 0 19.6" className="bm-seam" />
      <path d="M13 10.7 22 16l-9 5.3z" className="bm-play" />
    </svg>
  );
}

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <span className={`brand${compact ? ' compact' : ''}`}>
      <BrandMark size={compact ? 24 : 26} />
      {!compact && (
        <span className="brand-text">
          <span className="brand-name">Ballview</span>
          <span className="brand-sub">Play by play</span>
        </span>
      )}
    </span>
  );
}
