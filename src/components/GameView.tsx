/**
 * Detail pane for one game: header, tabs, and the save/export actions.
 *
 * Two modes. Live/recent games poll the feed over the network. A game opened from the
 * history log with `saved` set loads its snapshot from disk instead and never touches
 * the network, which is what makes offline reopening work.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { save as saveDialog } from '@tauri-apps/plugin-dialog';

import { useBoxscore, useLiveFeed } from '../hooks/useLiveFeed';
import * as api from '../lib/api';
import { errorMessage } from '../lib/api';
import type { Boxscore, Linescore, LiveFeed } from '../lib/types';
import { useAppStore } from '../store/useAppStore';
import { FielderView } from './FielderView';
import { HighlightPlayer } from './HighlightPlayer';
import { PitchFeed } from './PitchView';
import { PlayByPlay } from './PlayByPlay';

interface Props {
  gamePk: number;
  fromSnapshot: boolean;
  pollMs: number;
}

export function GameView({ gamePk, fromSnapshot, pollMs }: Props) {
  const closeGame = useAppStore((s) => s.closeGame);
  const tab = useAppStore((s) => s.gameTab);
  const setTab = useAppStore((s) => s.setGameTab);
  const queryClient = useQueryClient();

  // Offline path: read the snapshot from disk.
  const snapshot = useQuery({
    queryKey: ['snapshot', gamePk],
    queryFn: () => api.loadGame(gamePk),
    enabled: fromSnapshot,
  });

  // Online path: poll the live feed.
  const live = useLiveFeed(fromSnapshot ? null : gamePk, pollMs);

  const feed: LiveFeed | undefined = fromSnapshot ? snapshot.data?.feed : live.data;
  const isLiveGame = feed?.gameData?.status?.abstractGameState === 'Live';

  const boxQuery = useBoxscore(fromSnapshot ? null : gamePk, isLiveGame, pollMs);
  const boxscore: Boxscore | null | undefined = fromSnapshot
    ? snapshot.data?.boxscore
    : boxQuery.data;

  const isSaved = useQuery({
    queryKey: ['gameIsSaved', gamePk],
    queryFn: () => api.gameIsSaved(gamePk),
  });

  const saveGame = useMutation({
    mutationFn: () => api.saveGame(gamePk),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['gameIsSaved', gamePk] });
      queryClient.invalidateQueries({ queryKey: ['history'] });
      queryClient.invalidateQueries({ queryKey: ['savedGames'] });
    },
  });

  const exportGame = useMutation({
    mutationFn: async () => {
      const away = feed?.gameData?.teams?.away?.abbreviation ?? 'away';
      const home = feed?.gameData?.teams?.home?.abbreviation ?? 'home';
      const date = feed?.gameData?.datetime?.officialDate ?? gamePk;
      // The dialog plugin picks the path; the Rust command does the writing, so the
      // webview needs no filesystem permission of its own.
      const path = await saveDialog({
        defaultPath: `${date}-${away}-at-${home}.json`,
        filters: [{ name: 'ballview game', extensions: ['json'] }],
      });
      if (!path) return null;
      // Export reads the saved snapshot, so make sure one exists first.
      if (!isSaved.data) await api.saveGame(gamePk);
      await api.exportGame(gamePk, path);
      return path;
    },
  });

  const pending = fromSnapshot ? snapshot.isPending : live.isPending;
  const error = fromSnapshot ? snapshot.error : live.error;

  return (
    <section className="panel game-view">
      <header className="panel-head">
        <button className="back" onClick={closeGame}>
          ‹ Back
        </button>
        <div className="row gap">
          <button onClick={() => saveGame.mutate()} disabled={saveGame.isPending}>
            {saveGame.isPending ? 'Saving…' : isSaved.data ? 'Re-save game' : 'Save game'}
          </button>
          <button onClick={() => exportGame.mutate()} disabled={exportGame.isPending}>
            Export…
          </button>
        </div>
      </header>

      {saveGame.error && <p className="error-inline small">{errorMessage(saveGame.error)}</p>}
      {exportGame.error && <p className="error-inline small">{errorMessage(exportGame.error)}</p>}
      {exportGame.data && <p className="muted small">Exported to {exportGame.data}</p>}

      {pending && <p className="muted">Loading the game…</p>}

      {error && (
        <div className="error-box">
          <p>Could not load this game.</p>
          <p className="muted small">{errorMessage(error)}</p>
          {!fromSnapshot && <button onClick={() => live.refetch()}>Try again</button>}
        </div>
      )}

      {feed && (
        <>
          <GameHeader feed={feed} offline={fromSnapshot} />

          <nav className="tabs" role="tablist">
            {(
              [
                ['plays', 'Play-by-play'],
                ['pitches', 'Pitches'],
                ['fielders', 'Fielders'],
                ['clips', 'Highlights'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                role="tab"
                aria-selected={tab === id}
                className={tab === id ? 'tab active' : 'tab'}
                onClick={() => setTab(id)}
              >
                {label}
              </button>
            ))}
          </nav>

          <div className="tab-body">
            {tab === 'plays' && <PlayByPlay feed={feed} />}
            {tab === 'pitches' && <PitchFeed feed={feed} />}
            {tab === 'fielders' && <FielderView feed={feed} boxscore={boxscore} />}
            {tab === 'clips' && (
              <HighlightPlayer
                gamePk={gamePk}
                offlineHighlights={fromSnapshot ? snapshot.data?.highlights : undefined}
                localClips={snapshot.data?.localClips ?? []}
              />
            )}
          </div>
        </>
      )}
    </section>
  );
}

function GameHeader({ feed, offline }: { feed: LiveFeed; offline: boolean }) {
  const away = feed.gameData?.teams?.away;
  const home = feed.gameData?.teams?.home;
  const ls = feed.liveData?.linescore;
  const status = feed.gameData?.status;
  const live = status?.abstractGameState === 'Live';

  return (
    <div className="game-header">
      <div className="score-line">
        <span className="team">
          <span className="team-name">{away?.name ?? 'Away'}</span>
          <span className="score big">{ls?.teams?.away?.runs ?? 0}</span>
        </span>
        <span className="at">@</span>
        <span className="team">
          <span className="score big">{ls?.teams?.home?.runs ?? 0}</span>
          <span className="team-name">{home?.name ?? 'Home'}</span>
        </span>
      </div>

      <div className="game-status row gap">
        {live ? (
          <>
            <span className="badge live">Live</span>
            <span>
              {ls?.inningState} {ls?.currentInningOrdinal}
            </span>
            <span className="muted">
              {ls?.balls ?? 0}-{ls?.strikes ?? 0}, {ls?.outs ?? 0}{' '}
              {ls?.outs === 1 ? 'out' : 'outs'}
            </span>
            <Bases linescore={ls} />
          </>
        ) : (
          <span className="muted">{status?.detailedState ?? '—'}</span>
        )}
        {offline && <span className="badge saved">Offline snapshot</span>}
      </div>
    </div>
  );
}

/** Runners on base, from `linescore.offense`. A filled diamond means occupied. */
function Bases({ linescore }: { linescore?: Linescore | null }) {
  const offense = linescore?.offense;
  const on = {
    first: offense?.first != null,
    second: offense?.second != null,
    third: offense?.third != null,
  };
  const label = [
    on.first && 'first',
    on.second && 'second',
    on.third && 'third',
  ].filter(Boolean);

  return (
    <span
      className="bases"
      role="img"
      aria-label={label.length ? `Runners on ${label.join(', ')}` : 'Bases empty'}
    >
      <span className={`base third${on.third ? ' occupied' : ''}`} />
      <span className={`base second${on.second ? ' occupied' : ''}`} />
      <span className={`base first${on.first ? ' occupied' : ''}`} />
    </span>
  );
}
