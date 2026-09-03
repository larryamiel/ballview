/**
 * The card that opens beside the table when a player is picked.
 *
 * Two sources, and it renders as soon as either arrives: the stat line is already in
 * the row that was clicked, so it appears instantly, while the biography is a second
 * request that fills in underneath. Waiting for both would make every click feel slow
 * for information the table already had.
 */

import { useQuery } from '@tanstack/react-query';
import { X } from 'lucide-react';

import * as api from '../lib/api';
import { headshotUrl, teamColor } from '../lib/assets';
import type { PlayerStatRow } from '../lib/types';
import { TeamLogo } from './ui/TeamLogo';

interface Column {
  key: string;
  label: string;
  title: string;
}

interface Props {
  row: PlayerStatRow;
  columns: Column[];
  rangeLabel: string;
  onClose: () => void;
}

export function PlayerPreview({ row, columns, rangeLabel, onClose }: Props) {
  const person = useQuery({
    queryKey: ['person', row.playerId],
    queryFn: () => api.getPerson(row.playerId),
    // A player's height and handedness do not change during a season.
    staleTime: 24 * 60 * 60 * 1000,
    retry: 1,
  });

  const bio = person.data;

  return (
    <aside
      className="player-preview"
      style={{ ['--row-accent' as string]: teamColor(row.teamId) }}
    >
      <button className="preview-close" onClick={onClose} aria-label="Close preview">
        <X size={16} />
      </button>

      <div className="preview-head">
        <img
          className="preview-shot"
          src={headshotUrl(row.playerId, 240)}
          alt=""
          loading="lazy"
        />
        <div className="preview-id">
          <h3>{row.playerName}</h3>
          <p className="preview-team">
            <TeamLogo teamId={row.teamId} name={row.teamName} size={20} />
            <span>{row.teamName ?? 'Free agent'}</span>
          </p>
          <p className="muted small">
            {[
              bio?.primaryNumber && `#${bio.primaryNumber}`,
              row.position ?? bio?.primaryPosition?.abbreviation,
              bio?.batSide?.code && `bats ${bio.batSide.code}`,
              bio?.pitchHand?.code && `throws ${bio.pitchHand.code}`,
            ]
              .filter(Boolean)
              .join(' · ') || ' '}
          </p>
        </div>
      </div>

      {bio && (
        <dl className="preview-bio">
          {bio.height && bio.weight != null && (
            <div>
              <dt>Size</dt>
              <dd>
                {bio.height}, {bio.weight} lb
              </dd>
            </div>
          )}
          {bio.currentAge != null && (
            <div>
              <dt>Age</dt>
              <dd>{bio.currentAge}</dd>
            </div>
          )}
          {bio.mlbDebutDate && (
            <div>
              <dt>Debut</dt>
              <dd>{bio.mlbDebutDate}</dd>
            </div>
          )}
          {(bio.birthCity || bio.birthCountry) && (
            <div>
              <dt>Born</dt>
              <dd>{[bio.birthCity, bio.birthCountry].filter(Boolean).join(', ')}</dd>
            </div>
          )}
        </dl>
      )}

      <h4 className="preview-section">{rangeLabel}</h4>
      <div className="preview-grid">
        {columns.map((col) => (
          <div key={col.key} title={col.title}>
            <span className="pg-label">{col.label}</span>
            <span className="pg-value">{show(row.stat[col.key])}</span>
          </div>
        ))}
      </div>
    </aside>
  );
}

function show(value: string | number | null | undefined): string {
  if (value == null || value === '') return '—';
  return String(value);
}
