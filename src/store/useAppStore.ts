/**
 * Light UI state. Anything fetched from Rust lives in TanStack Query instead — this
 * store holds only what the user has clicked.
 */

import { create } from 'zustand';

export type MainView = 'games' | 'history' | 'saved' | 'stats';
export type GameTab = 'live' | 'replay' | 'plays' | 'box' | 'clips';
/** How a single pitch is drawn: from behind the plate, or as plots and numbers. */
export type PitchView = 'umpire' | 'data' | 'clip';

interface AppState {
  view: MainView;
  /** The game open in the detail pane, or null for the list. */
  selectedGamePk: number | null;
  /** True when the open game was loaded from disk rather than the network. */
  viewingSnapshot: boolean;
  gameTab: GameTab;
  /** Schedule date being browsed, `YYYY-MM-DD`. Empty means today. */
  scheduleDate: string;
  /**
   * Which rendering of a pitch to show. Global rather than per-at-bat: a viewer who
   * prefers the umpire's view wants it for the next batter too.
   */
  pitchView: PitchView;
  /**
   * The at-bat the replay tab is parked on, by `atBatIndex`.
   *
   * It lives here rather than inside the replay view because the play log hands over to
   * it: pressing Watch on a row selects that at-bat and switches tabs.
   */
  replayAtBat: number | null;

  setView: (view: MainView) => void;
  openGame: (gamePk: number, opts?: { fromSnapshot?: boolean; tab?: GameTab }) => void;
  closeGame: () => void;
  setGameTab: (tab: GameTab) => void;
  setScheduleDate: (date: string) => void;
  setPitchView: (view: PitchView) => void;
  /** Select an at-bat and show it in the replay tab. */
  watchAtBat: (atBatIndex: number) => void;
  setReplayAtBat: (atBatIndex: number | null) => void;
}

export const useAppStore = create<AppState>((set) => ({
  view: 'games',
  selectedGamePk: null,
  viewingSnapshot: false,
  gameTab: 'plays',
  scheduleDate: '',
  pitchView: 'umpire',
  replayAtBat: null,

  setView: (view) => set({ view, selectedGamePk: null }),

  /**
   * Open a game, optionally landing on a particular tab.
   *
   * The caller picks the tab because only it knows what kind of game this is: a game in
   * progress opens on the live view, while a final or saved one opens on the play log,
   * where there is something to read.
   */
  openGame: (gamePk, opts = {}) =>
    set({
      selectedGamePk: gamePk,
      viewingSnapshot: opts.fromSnapshot ?? false,
      gameTab: opts.tab ?? 'plays',
      replayAtBat: null,
    }),

  closeGame: () => set({ selectedGamePk: null, viewingSnapshot: false }),
  setGameTab: (gameTab) => set({ gameTab }),
  setScheduleDate: (scheduleDate) => set({ scheduleDate }),
  setPitchView: (pitchView) => set({ pitchView }),
  watchAtBat: (replayAtBat) => set({ replayAtBat, gameTab: 'replay' }),
  setReplayAtBat: (replayAtBat) => set({ replayAtBat }),
}));
