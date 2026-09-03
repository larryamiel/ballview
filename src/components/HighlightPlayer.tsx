/**
 * Highlight clips: list, play inline, and optionally save. Features 6 and 7.
 *
 * Playback uses the mp4 URL directly. If a clip has no mp4 rendition, the Rust side
 * hands us `url: null` and we say so rather than mounting a player that will fail.
 */

import { useState } from 'react';
import { Check, Download, Film, Play, X } from 'lucide-react';

import { useHighlights } from '../hooks/useLiveFeed';
import * as api from '../lib/api';
import { errorMessage } from '../lib/api';
import type { Highlight } from '../lib/types';
import { EmptyState, ErrorState, Skeleton } from './ui/States';

interface Props {
  gamePk: number;
  /** Supplied when viewing a saved snapshot, so clips work with no network. */
  offlineHighlights?: Highlight[];
  localClips?: string[];
}

export function HighlightPlayer({ gamePk, offlineHighlights, localClips = [] }: Props) {
  const query = useHighlights(offlineHighlights ? null : gamePk);
  const highlights = offlineHighlights ?? query.data;

  const [playing, setPlaying] = useState<Highlight | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [saved, setSaved] = useState<string[]>(localClips);
  const [saveError, setSaveError] = useState<string | null>(null);

  const save = async (clip: Highlight) => {
    if (!clip.url) return;
    setSaving(clip.id);
    setSaveError(null);
    try {
      await api.downloadHighlight(gamePk, clip.id, clip.url);
      setSaved((prev) => [...prev, clip.id]);
    } catch (e) {
      setSaveError(errorMessage(e));
    } finally {
      setSaving(null);
    }
  };

  if (!offlineHighlights && query.isPending) {
    return <Skeleton rows={3} height={96} />;
  }

  if (!offlineHighlights && query.error) {
    return (
      <ErrorState
        title="Could not load highlights."
        error={query.error}
        onRetry={() => query.refetch()}
      />
    );
  }

  if (!highlights || highlights.length === 0) {
    return (
      <EmptyState icon={<Film size={22} />} title="No highlights yet">
        MLB publishes clips through the game and for a while after it ends.
      </EmptyState>
    );
  }

  return (
    <div className="highlights">
      {playing?.url && (
        <div className="player">
          {/* `key` forces a remount so switching clips reloads the source. */}
          <video key={playing.url} src={playing.url} controls autoPlay className="video" />
          <div className="row between player-bar">
            <strong>{playing.title}</strong>
            <button className="btn ghost" onClick={() => setPlaying(null)}>
              <X size={14} /> Close
            </button>
          </div>
        </div>
      )}

      {saveError && <p className="error-inline small">{saveError}</p>}

      <ul className="clip-list">
        {highlights.map((clip) => {
          const isSaved = saved.includes(clip.id);
          const isPlaying = playing?.id === clip.id;
          return (
            <li key={clip.id} className={`clip${isPlaying ? ' playing' : ''}`}>
              <button
                className="clip-thumb-btn"
                onClick={() => clip.url && setPlaying(clip)}
                disabled={!clip.url}
                aria-label={`Play ${clip.title}`}
              >
                {clip.thumbnail ? (
                  <img src={clip.thumbnail} alt="" className="thumb" loading="lazy" />
                ) : (
                  <div className="thumb placeholder" />
                )}
                {clip.url && (
                  <span className="thumb-play" aria-hidden="true">
                    <Play size={16} fill="currentColor" />
                  </span>
                )}
                {clip.duration && <span className="thumb-duration">{clip.duration}</span>}
              </button>

              <div className="clip-body">
                <div className="clip-title">{clip.title}</div>
                {clip.description && <p className="muted small">{clip.description}</p>}
                {isSaved && (
                  <span className="badge saved">
                    <Check size={11} aria-hidden="true" /> On disk
                  </span>
                )}
              </div>

              <div className="clip-actions">
                {clip.url ? (
                  <button
                    className="btn"
                    onClick={() => save(clip)}
                    disabled={saving === clip.id || isSaved}
                    title="Keep this clip alongside the saved game"
                  >
                    <Download size={14} />
                    {saving === clip.id ? 'Saving…' : isSaved ? 'Saved' : 'Save clip'}
                  </button>
                ) : (
                  <span className="muted small">No clip available</span>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
