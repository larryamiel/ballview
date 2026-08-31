/**
 * Light UI state. Anything fetched from Rust lives in TanStack Query instead — this
 * store holds only what the user has clicked.
 */

import { create } from 'zustand';

export type MainView = 'games' | 'history' | 'saved';
export type GameTab = 'plays' | 'pitches' | 'fielders' | 'clips';

interface AppState {
  view: MainView;
  /** The game open in the detail pane, or null for the list. */
  selectedGamePk: number | null;
  /** True when the open game was loaded from disk rather than the network. */
  viewingSnapshot: boolean;
  gameTab: GameTab;
  /** Schedule date being browsed, `YYYY-MM-DD`. Empty means today. */
  scheduleDate: string;

  setView: (view: MainView) => void;
  openGame: (gamePk: number, fromSnapshot?: boolean) => void;
  closeGame: () => void;
  setGameTab: (tab: GameTab) => void;
  setScheduleDate: (date: string) => void;
}

export const useAppStore = create<AppState>((set) => ({
  view: 'games',
  selectedGamePk: null,
  viewingSnapshot: false,
  gameTab: 'plays',
  scheduleDate: '',

  setView: (view) => set({ view, selectedGamePk: null }),
  openGame: (gamePk, fromSnapshot = false) =>
    set({ selectedGamePk: gamePk, viewingSnapshot: fromSnapshot, gameTab: 'plays' }),
  closeGame: () => set({ selectedGamePk: null, viewingSnapshot: false }),
  setGameTab: (gameTab) => set({ gameTab }),
  setScheduleDate: (scheduleDate) => set({ scheduleDate }),
}));
