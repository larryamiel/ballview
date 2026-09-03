/**
 * The Players section: three ways to look at the same league.
 *
 * The leaderboard answers "who is best at X", the charts answer "how do these two
 * compare, and when", and the spotlight answers "who is worth watching right now". They
 * are one section rather than three top-level destinations because they are the same
 * subject at three distances, and the title bar has room for four names, not six.
 */

import { useState } from 'react';
import { BarChart3, LineChart, Trophy } from 'lucide-react';

import { PlayerCompare } from './PlayerCompare';
import { PlayerStats } from './PlayerStats';
import { SpotlightPanel } from './SpotlightPanel';

type Tab = 'leaderboard' | 'compare' | 'spotlight';

const TABS: { id: Tab; label: string; icon: typeof BarChart3 }[] = [
  { id: 'leaderboard', label: 'Leaderboard', icon: BarChart3 },
  { id: 'compare', label: 'Charts', icon: LineChart },
  { id: 'spotlight', label: 'Spotlight', icon: Trophy },
];

export function PlayersScreen() {
  const [tab, setTab] = useState<Tab>('leaderboard');

  return (
    <div className="players-screen">
      <nav className="tabs" role="tablist">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            className={tab === id ? 'tab active' : 'tab'}
            onClick={() => setTab(id)}
          >
            <Icon size={15} aria-hidden="true" /> {label}
          </button>
        ))}
      </nav>

      <div className="tab-body">
        {tab === 'leaderboard' && <PlayerStats />}
        {tab === 'compare' && <PlayerCompare />}
        {tab === 'spotlight' && <SpotlightPanel />}
      </div>
    </div>
  );
}
