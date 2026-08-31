/** App shell: sidebar plus the main panel. */

import { useQuery } from '@tanstack/react-query';

import { GameList } from './components/GameList';
import { GameView } from './components/GameView';
import { HistoryLog } from './components/HistoryLog';
import { SavedGames } from './components/SavedGames';
import { TeamFavorites } from './components/TeamFavorites';
import * as api from './lib/api';
import { useAppStore } from './store/useAppStore';

export default function App() {
  const view = useAppStore((s) => s.view);
  const setView = useAppStore((s) => s.setView);
  const selectedGamePk = useAppStore((s) => s.selectedGamePk);
  const viewingSnapshot = useAppStore((s) => s.viewingSnapshot);

  const config = useQuery({ queryKey: ['config'], queryFn: api.getConfig });
  const favoriteTeamId = config.data?.favoriteTeamIds?.[0] ?? null;
  const pollMs = (config.data?.pollSeconds ?? 15) * 1000;

  return (
    <div className="app">
      <aside className="sidebar">
        <h1 className="brand">ballview</h1>

        <nav className="nav">
          {(
            [
              ['games', 'Games'],
              ['history', 'Game log'],
              ['saved', 'Saved'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              className={view === id ? 'nav-item active' : 'nav-item'}
              onClick={() => setView(id)}
            >
              {label}
            </button>
          ))}
        </nav>

        <div className="sidebar-section">
          <TeamFavorites favoriteTeamId={favoriteTeamId} />
        </div>

        <footer className="sidebar-foot muted small">
          Data from the MLB Stats API. Unofficial and unaffiliated.
        </footer>
      </aside>

      <main className="main">
        {selectedGamePk != null ? (
          <GameView
            gamePk={selectedGamePk}
            fromSnapshot={viewingSnapshot}
            pollMs={pollMs}
          />
        ) : (
          <>
            {view === 'games' && (
              <GameList favoriteTeamId={favoriteTeamId} pollMs={pollMs} />
            )}
            {view === 'history' && <HistoryLog favoriteTeamId={favoriteTeamId} />}
            {view === 'saved' && <SavedGames />}
          </>
        )}
      </main>
    </div>
  );
}
