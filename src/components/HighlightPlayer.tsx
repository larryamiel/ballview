/**
 * Highlight clips: list, play inline, and optionally save. Features 6 and 7.
 *
 * Playback uses the mp4 URL directly. If a clip has no mp4 rendition, the Rust side
 * hands us `url: null` and we say so rather than mounting a player that will fail.
 */

import { useState } from 'react';

import { useHighlights } from '../hooks/useLiveFeed';
import * as api from '../lib/api';
import { errorMessage } from '../lib/api';
import type { Highlight } from '../lib/types';

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
    return <p className="muted">Loading highlights…</p>;
  }

  if (!offlineHighlights && query.error) {
    return (
      <div className="error-box">
        <p>Could not load highlights.</p>
        <p className="muted small">{errorMessage(query.error)}</p>
        <button onClick={() => query.refetch()}>Try again</button>
      </div>
    );
  }

  if (!highlights || highlights.length === 0) {
    return <p className="muted">No highlights published for this game yet.</p>;
  }

  return (
    <div className="highlights">
      {playing?.url && (
        <div className="player">
          {/* `key` forces a remount so switching clips reloads the source. */}
          <video key={playing.url} src={playing.url} controls autoPlay className="video" />
          <div className="row between">
            <strong>{playing.title}</strong>
            <button onClick={() => setPlaying(null)}>Close</button>
          </div>
        </div>
      )}

      {saveError && <p className="error-inline small">{saveError}</p>}

      <ul className="clip-list">
        {highlights.map((clip) => {
          const isSaved = saved.includes(clip.id);
          return (
            <li key={clip.id} className="clip">
              {clip.thumbnail ? (
                <img src={clip.thumbnail} alt="" className="thumb" loading="lazy" />
              ) : (
                <div className="thumb placeholder" />
              )}

              <div className="clip-body">
                <div className="clip-title">{clip.title}</div>
                {clip.description && <p className="muted small">{clip.description}</p>}
                <div className="row gap small muted">
                  {clip.duration && <span>{clip.duration}</span>}
                  {isSaved && <span className="badge saved">Saved</span>}
                </div>
              </div>

              <div className="clip-actions">
                {clip.url ? (
                  <>
                    <button onClick={() => setPlaying(clip)}>Play</button>
                    <button onClick={() => save(clip)} disabled={saving === clip.id || isSaved}>
                      {saving === clip.id ? 'Saving…' : isSaved ? 'Saved' : 'Save clip'}
                    </button>
                  </>
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
