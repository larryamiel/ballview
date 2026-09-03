/** The three things every panel needs: loading, empty, and broken. */

import type { ReactNode } from 'react';
import { AlertTriangle, RotateCw } from 'lucide-react';

import { errorMessage } from '../../lib/api';

/**
 * Grey blocks in the shape of the content that is coming.
 *
 * A skeleton beats a "Loading…" line here because the schedule reloads on every poll;
 * a spinner that appears and vanishes every fifteen seconds reads as a glitch, while
 * rows that hold their shape do not.
 */
export function Skeleton({ rows = 4, height = 62 }: { rows?: number; height?: number }) {
  return (
    <div className="skeleton-stack" aria-hidden="true">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="skeleton" style={{ height }} />
      ))}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  children,
}: {
  icon?: ReactNode;
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="empty-state">
      {icon && <span className="empty-icon">{icon}</span>}
      <p className="empty-title">{title}</p>
      {children && <p className="muted">{children}</p>}
    </div>
  );
}

export function ErrorState({
  title,
  error,
  onRetry,
}: {
  title: string;
  error: unknown;
  onRetry?: () => void;
}) {
  return (
    <div className="error-box">
      <p className="row gap">
        <AlertTriangle size={16} aria-hidden="true" /> {title}
      </p>
      <p className="muted small">{errorMessage(error)}</p>
      {onRetry && (
        <button className="btn" onClick={onRetry}>
          <RotateCw size={14} aria-hidden="true" /> Try again
        </button>
      )}
    </div>
  );
}
