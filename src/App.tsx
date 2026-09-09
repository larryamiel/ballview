/**
 * App shell: one title bar over one panel. No sidebar.
 *
 * Three destinations do not earn a permanent column of the window. They live in the
 * title bar as a segmented control, which hands the entire width below it to the game —
 * where a scoreboard, a play log and a pitch view all actually want the room.
 *
 * The club picker used to sit in the title bar's right column. It has moved into My
 * Team, the one section it changes: on the day's games, the league leaderboard and the
 * saved-game list it was a control with nothing to do, and a permanently visible control
 * reads as one that applies to whatever is on screen. The right column stays in the grid
 * even though it is now empty — it is what keeps the navigation in the window's true
 * centre rather than 90px left of it.
 *
 * The panel below is full-bleed; the content inside it is centred in a column that stops
 * widening past a comfortable measure, so a play description never runs the length of a
 * 34-inch monitor.
 */

import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Archive, CalendarDays, Star, Users } from 'lucide-react';

import { GameList } from './components/GameList';
import { GameView } from './components/GameView';
import { MyTeam } from './components/MyTeam';
import { PlayersScreen } from './components/PlayersScreen';
import { SavedGames } from './components/SavedGames';
import { Brand } from './components/ui/Brand';
import * as api from './lib/api';
import { useAppStore, type MainView } from './store/useAppStore';

const NAV: { id: MainView; label: string; icon: typeof CalendarDays }[] = [
  { id: 'games', label: 'Games', icon: CalendarDays },
  { id: 'history', label: 'My Team', icon: Star },
  { id: 'stats', label: 'Players', icon: Users },
  { id: 'saved', label: 'Saved', icon: Archive },
];

export default function App() {
  const view = useAppStore((s) => s.view);
  const setView = useAppStore((s) => s.setView);
  const selectedGamePk = useAppStore((s) => s.selectedGamePk);
  const viewingSnapshot = useAppStore((s) => s.viewingSnapshot);
  const closeGame = useAppStore((s) => s.closeGame);

  const config = useQuery({ queryKey: ['config'], queryFn: api.getConfig });
  const favoriteTeamId = config.data?.favoriteTeamIds?.[0] ?? null;
  const pollMs = (config.data?.pollSeconds ?? 15) * 1000;

  // Escape backs out of a game. Ignored while typing, so the team search box keeps its
  // own Escape for closing the menu.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      if (e.key === 'Escape') closeGame();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [closeGame]);

  return (
    <div className="app">
      <header className="titlebar">
        <Brand />

        <nav className="segmented" aria-label="Sections">
          {NAV.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              className={view === id ? 'seg active' : 'seg'}
              onClick={() => setView(id)}
              aria-current={view === id ? 'page' : undefined}
            >
              <Icon size={15} aria-hidden="true" />
              <span>{label}</span>
            </button>
          ))}
        </nav>

        {/* Empty, and deliberately still here: the title bar is a `1fr auto 1fr` grid,
            and removing this column would shove the navigation off centre. */}
        <div className="titlebar-right" />
      </header>

      <main className="main">
        <div className="container">
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
              {view === 'history' && <MyTeam favoriteTeamId={favoriteTeamId} />}
              {view === 'stats' && <PlayersScreen />}
              {view === 'saved' && <SavedGames />}
            </>
          )}

          <footer className="app-foot muted small">
            Data from the MLB Stats API. Unofficial and unaffiliated.
          </footer>
        </div>
      </main>
    </div>
  );
}
