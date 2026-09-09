/**
 * My Team: everything about the followed club, under one identity.
 *
 * The club header owns the three things that are true of every tab below it — who is
 * being followed, their record, and the control for changing that — so the schedule, the
 * news and the highlights are all read as belonging to the same club rather than each
 * restating it.
 *
 * The club picker lives here and nowhere else. It used to sit in the title bar, visible
 * from every screen, which put a control for one section in front of three others that
 * do not use it: the league leaderboard, the day's games and the saved-game list are the
 * same whoever you follow. Here it is beside the thing it changes.
 */

import { useState } from 'react';
import { CalendarDays, Clapperboard, Newspaper, Star } from 'lucide-react';

import { useStandings } from '../hooks/useLiveFeed';
import { teamColor } from '../lib/assets';
import { HistoryLog } from './HistoryLog';
import { TeamNews } from './TeamNews';
import { TeamPicker } from './TeamPicker';
import { TopPlays } from './TopPlays';
import { EmptyState } from './ui/States';
import { TeamLogo } from './ui/TeamLogo';

import type { CSSProperties } from 'react';

type Tab = 'schedule' | 'news' | 'highlights';

const TABS: { id: Tab; label: string; icon: typeof CalendarDays }[] = [
  { id: 'schedule', label: 'Schedule', icon: CalendarDays },
  { id: 'news', label: 'News', icon: Newspaper },
  { id: 'highlights', label: 'Highlights', icon: Clapperboard },
];

interface Props {
  favoriteTeamId: number | null;
}

export function MyTeam({ favoriteTeamId }: Props) {
  const [tab, setTab] = useState<Tab>('schedule');
  const standings = useStandings();
  const record = favoriteTeamId != null ? standings.data?.get(favoriteTeamId) : undefined;

  if (favoriteTeamId == null) {
    return (
      <section className="panel">
        <h2>My Team</h2>
        <EmptyState icon={<Star size={22} />} title="No team followed yet">
          Pick a club and ballview starts logging its season here — the whole schedule,
          played and still to come, its news, and the plays worth watching.
        </EmptyState>
        <div className="row center">
          <TeamPicker favoriteTeamId={favoriteTeamId} />
        </div>
      </section>
    );
  }

  return (
    <section className="panel my-team">
      <header
        className="panel-head log-head"
        style={{ ['--row-accent']: teamColor(favoriteTeamId) } as CSSProperties}
      >
        <div className="log-identity">
          <TeamLogo teamId={favoriteTeamId} name={record?.teamName} size={40} />
          <div className="panel-title">
            <h2>{record?.teamName ?? 'My Team'}</h2>
            <p className="muted small">
              {record
                ? `${record.wins}-${record.losses}${
                    record.divisionName ? ` · ${ordinal(record.divisionRank)} ${record.divisionName}` : ''
                  }${record.streak ? ` · ${record.streak}` : ''}`
                : 'Season record loading…'}
            </p>
          </div>
        </div>

        <TeamPicker favoriteTeamId={favoriteTeamId} />
      </header>

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
        {tab === 'schedule' && <HistoryLog favoriteTeamId={favoriteTeamId} />}
        {tab === 'news' && <TeamNews teamId={favoriteTeamId} />}
        {tab === 'highlights' && (
          <TopPlays teamId={favoriteTeamId} teamName={record?.teamName} />
        )}
      </div>
    </section>
  );
}

/** "2" → "2nd in". Division rank arrives as a string, and may be absent entirely. */
function ordinal(rank?: string | null): string {
  const n = Number(rank);
  if (!Number.isFinite(n) || n <= 0) return '';
  const suffix = n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th';
  return `${n}${suffix} in`;
}
