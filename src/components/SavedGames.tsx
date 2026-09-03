/** The local snapshot library, plus import. */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { open as openDialog } from '@tauri-apps/plugin-dialog';
import { Archive, Film, Upload } from 'lucide-react';

import * as api from '../lib/api';
import { errorMessage } from '../lib/api';
import { useAppStore } from '../store/useAppStore';
import { EmptyState, Skeleton } from './ui/States';
import { TeamLogo } from './ui/TeamLogo';

export function SavedGames() {
  const openGame = useAppStore((s) => s.openGame);
  const queryClient = useQueryClient();

  const saved = useQuery({ queryKey: ['savedGames'], queryFn: () => api.listSavedGames() });

  const importGame = useMutation({
    mutationFn: async () => {
      const path = await openDialog({
        multiple: false,
        filters: [{ name: 'ballview game', extensions: ['json'] }],
      });
      if (typeof path !== 'string') return null;
      return api.importGame(path);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['savedGames'] }),
  });

  return (
    <section className="panel">
      <header className="panel-head">
        <div className="panel-title">
          <h2>Saved games</h2>
          <p className="muted small">
            {saved.data
              ? `${saved.data.length} ${saved.data.length === 1 ? 'snapshot' : 'snapshots'} on disk`
              : 'Reading the library'}
          </p>
        </div>
        <button className="btn" onClick={() => importGame.mutate()} disabled={importGame.isPending}>
          <Upload size={15} /> Import
        </button>
      </header>

      {importGame.error && <p className="error-inline small">{errorMessage(importGame.error)}</p>}

      {saved.isPending && <Skeleton rows={4} height={46} />}
      {saved.error && <p className="error-inline">{errorMessage(saved.error)}</p>}

      {saved.data?.length === 0 && (
        <EmptyState icon={<Archive size={22} />} title="No saved games yet">
          Open a game and choose “Save game” to keep a copy that opens with no network.
        </EmptyState>
      )}

      {saved.data && saved.data.length > 0 && (
        <ul className="history-list">
          {saved.data.map((g) => (
            <li key={g.gamePk}>
              <button className="history-row saved-row" onClick={() => openGame(g.gamePk, { fromSnapshot: true })}>
                <span className="date muted small">{g.gameDate ?? '—'}</span>

                <span className="opponent">
                  <TeamLogo teamId={g.awayTeamId} name={g.awayTeam} size={22} />
                  <span className="opponent-name">{g.awayTeam ?? 'Away'}</span>
                  <span className="muted small">at</span>
                  <TeamLogo teamId={g.homeTeamId} name={g.homeTeam} size={22} />
                  <span className="opponent-name">{g.homeTeam ?? 'Home'}</span>
                </span>

                <span className="result">
                  <span className="score">
                    {g.awayScore ?? 0}–{g.homeScore ?? 0}
                  </span>
                  {!g.isFinal && <span className="muted small">in progress</span>}
                </span>

                <span className="flags">
                  {g.hasLocalClips && (
                    <span className="badge saved">
                      <Film size={11} aria-hidden="true" /> Clips
                    </span>
                  )}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
