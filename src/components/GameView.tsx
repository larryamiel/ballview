/**
 * Detail pane for one game: scoreboard, tabs, and the save/export actions.
 *
 * Two modes. Live/recent games poll the feed over the network. A game opened from the
 * history log with `saved` set loads its snapshot from disk instead and never touches
 * the network, which is what makes offline reopening work.
 */

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { save as saveDialog } from '@tauri-apps/plugin-dialog';
import {
  ArrowLeft,
  Check,
  ClipboardList,
  Download,
  Film,
  ListOrdered,
  Radio,
  Rewind,
  Save,
} from 'lucide-react';

import { useBoxscore, useLiveFeed, useStandings } from '../hooks/useLiveFeed';
import * as api from '../lib/api';
import { errorMessage } from '../lib/api';
import type { Boxscore, LiveFeed } from '../lib/types';
import { useAppStore, type GameTab } from '../store/useAppStore';
import { BoxScore } from './BoxScore';
import { HighlightPlayer } from './HighlightPlayer';
import { LiveView } from './LiveView';
import { Matchup } from './Matchup';
import { PlayByPlay } from './PlayByPlay';
import { ReplayView } from './ReplayView';
import { ScoreBoard } from './ScoreBoard';
import { ErrorState, Skeleton } from './ui/States';

interface Props {
  gamePk: number;
  fromSnapshot: boolean;
  pollMs: number;
}

const TABS: { id: GameTab; label: string; icon: typeof ListOrdered }[] = [
  { id: 'live', label: 'Live', icon: Radio },
  { id: 'replay', label: 'Replay', icon: Rewind },
  { id: 'plays', label: 'Play-by-play', icon: ListOrdered },
  { id: 'box', label: 'Box score', icon: ClipboardList },
  { id: 'clips', label: 'Highlights', icon: Film },
];

export function GameView({ gamePk, fromSnapshot, pollMs }: Props) {
  const closeGame = useAppStore((s) => s.closeGame);
  const tab = useAppStore((s) => s.gameTab);
  const setTab = useAppStore((s) => s.setGameTab);
  const queryClient = useQueryClient();

  /**
   * Scoreboard collapse: automatic on scroll, overridable by hand.
   *
   * `pinned` is a three-state — null means "follow the scroll", true/false mean the
   * viewer has said which they want and the scroll position stops deciding.
   */
  const [pinned, setPinned] = useState<boolean | null>(null);
  const [scrolled, setScrolled] = useState(false);
  // A state-backed ref, not `useRef`: the anchor only enters the DOM once the feed has
  // loaded, so an effect that reads a ref on mount would find nothing and never look
  // again. Storing the node in state re-runs the effect the moment it appears.
  const [anchor, setAnchor] = useState<HTMLDivElement | null>(null);

  /**
   * Two thresholds, not one.
   *
   * Collapsing removes ~150px of sticky header, which shifts everything below it back
   * up — and near the end of a list the browser also clamps the scroll position to the
   * now-shorter content. Either can carry the scroll back across a single trigger point,
   * which expands the scoreboard, which restores the height, which crosses it again: on
   * a slow scroll that reads as the header flickering. The gap between these two values
   * is a dead zone that a layout shift cannot push the scroll all the way across.
   */
  const CONDENSE_BELOW = 150;
  const EXPAND_ABOVE = 40;

  useEffect(() => {
    const scroller = anchor?.closest('.main');
    if (!scroller) return;

    let frame = 0;
    const read = () => {
      frame = 0;
      const y = scroller.scrollTop;
      setScrolled((was) => (was ? y > EXPAND_ABOVE : y > CONDENSE_BELOW));
    };
    // Coalesced to one read per frame: the feed also re-renders this tree every poll,
    // and a listener doing layout work per scroll event would fight it.
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(read);
    };

    scroller.addEventListener('scroll', onScroll, { passive: true });
    read();
    return () => {
      scroller.removeEventListener('scroll', onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [anchor]);

  // The live view is a watching mode and wants the vertical room, so it starts with
  // the scoreboard already folded — its own header carries the count anyway. Every
  // other tab follows the scroll. Either way an explicit toggle still wins.
  const condensed = pinned ?? (tab === 'live' || tab === 'replay' || scrolled);

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

  // Records are decoration on this screen, so a snapshot opened with no network simply
  // renders without them rather than waiting on a request that cannot succeed.
  const standings = useStandings();

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
      <header className="panel-head game-actions">
        <button className="btn ghost" onClick={closeGame} title="Back to the list  Esc">
          <ArrowLeft size={16} /> Back
        </button>

        <div className="row gap">
          <button
            className="btn"
            onClick={() => saveGame.mutate()}
            disabled={saveGame.isPending}
          >
            {isSaved.data ? <Check size={15} /> : <Save size={15} />}
            {saveGame.isPending ? 'Saving…' : isSaved.data ? 'Saved' : 'Save game'}
          </button>
          <button className="btn" onClick={() => exportGame.mutate()} disabled={exportGame.isPending}>
            <Download size={15} /> Export
          </button>
        </div>
      </header>

      {saveGame.error && <p className="error-inline small">{errorMessage(saveGame.error)}</p>}
      {exportGame.error && <p className="error-inline small">{errorMessage(exportGame.error)}</p>}
      {exportGame.data && <p className="muted small">Exported to {exportGame.data}</p>}

      {pending && <Skeleton rows={3} height={110} />}

      {error && (
        <ErrorState
          title="Could not load this game."
          error={error}
          onRetry={fromSnapshot ? undefined : () => live.refetch()}
        />
      )}

      {feed && (
        <>
          {/* Not a sentinel — just a stable node to find the scroll container from. */}
          <div ref={setAnchor} className="scroll-anchor" aria-hidden="true" />

          <div className={`game-sticky${condensed ? ' condensed' : ''}`}>
            <ScoreBoard
              feed={feed}
              offline={fromSnapshot}
              standings={standings.data}
              condensed={condensed}
              onToggle={() => setPinned(!condensed)}
            />

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
          </div>

          {/* Live and replay both carry their own matchup headers. */}
          {isLiveGame && tab !== 'live' && tab !== 'replay' && <Matchup feed={feed} />}

          <div className="tab-body">
            {tab === 'live' && <LiveView feed={feed} />}
            {tab === 'plays' && <PlayByPlay feed={feed} />}
            {tab === 'replay' && <ReplayView feed={feed} />}
            {tab === 'box' && (
              <BoxScore
                boxscore={boxscore}
                awayName={feed.gameData?.teams?.away?.name}
                homeName={feed.gameData?.teams?.home?.name}
              />
            )}
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
