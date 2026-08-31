/** The local snapshot library, plus import. */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { open as openDialog } from '@tauri-apps/plugin-dialog';

import * as api from '../lib/api';
import { errorMessage } from '../lib/api';
import { useAppStore } from '../store/useAppStore';

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
        <h2>Saved games</h2>
        <button onClick={() => importGame.mutate()} disabled={importGame.isPending}>
          Import…
        </button>
      </header>

      {importGame.error && (
        <p className="error-inline small">{errorMessage(importGame.error)}</p>
      )}

      {saved.isPending && <p className="muted">Loading…</p>}
      {saved.error && <p className="error-inline">{errorMessage(saved.error)}</p>}

      {saved.data?.length === 0 && (
        <p className="muted">
          No saved games yet. Open a game and choose “Save game” to keep a copy that works
          offline.
        </p>
      )}

      {saved.data && saved.data.length > 0 && (
        <ul className="history-list">
          {saved.data.map((g) => (
            <li key={g.gamePk}>
              <button className="history-row" onClick={() => openGame(g.gamePk, true)}>
                <span className="date muted small">{g.gameDate ?? '—'}</span>
                <span className="opponent">
                  {g.awayTeam ?? 'Away'} @ {g.homeTeam ?? 'Home'}
                </span>
                <span className="result">
                  <span className="score">
                    {g.awayScore ?? 0}–{g.homeScore ?? 0}
                  </span>
                  {!g.isFinal && <span className="muted small">in progress</span>}
                </span>
                <span className="flags">
                  {g.hasLocalClips && <span className="badge saved">Clips</span>}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
