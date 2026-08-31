/**
 * Typed wrappers over every Tauri command.
 *
 * This is the only file in the frontend that calls `invoke`. Per CLAUDE.md the webview
 * never makes network requests of its own — all HTTP happens in Rust, which sidesteps
 * CORS and keeps MLB URLs in one place.
 */

import { invoke } from '@tauri-apps/api/core';

import type {
  Boxscore,
  Config,
  GameSnapshot,
  GameSummary,
  Highlight,
  HistoryLog,
  LiveFeed,
  SavedGameInfo,
  StatcastGame,
  Team,
} from './types';

// --- Schedule --------------------------------------------------------------

export const getTeams = () => invoke<Team[]>('get_teams');

/** Omit `date` for today (resolved in the app's local timezone, not UTC). */
export const getSchedule = (date?: string, teamId?: number) =>
  invoke<GameSummary[]>('get_schedule', { date, teamId });

export const getScheduleRange = (start: string, end: string, teamId?: number) =>
  invoke<GameSummary[]>('get_schedule_range', { start, end, teamId });

export const getToday = () => invoke<string>('get_today');

// --- Live game -------------------------------------------------------------

export const getLiveFeed = (gamePk: number) =>
  invoke<LiveFeed>('get_live_feed', { gamePk });

export const getBoxscore = (gamePk: number) =>
  invoke<Boxscore>('get_boxscore', { gamePk });

export const getGameContent = (gamePk: number) =>
  invoke<Highlight[]>('get_game_content', { gamePk });

/**
 * Statcast enrichment. Callers must tolerate rejection: Savant is a second undocumented
 * API and no feature depends on it.
 */
export const getStatcast = (gamePk: number) =>
  invoke<StatcastGame>('get_statcast', { gamePk });

// --- Favorites & settings --------------------------------------------------

export const getConfig = () => invoke<Config>('get_config');
export const setConfig = (config: Config) => invoke<Config>('set_config', { config });
export const getFavoriteTeam = () => invoke<number | null>('get_favorite_team');

/** Pass `null` to clear the favorite. */
export const setFavoriteTeam = (teamId: number | null) =>
  invoke<Config>('set_favorite_team', { teamId });

// --- History ---------------------------------------------------------------

export const getHistory = (teamId: number, season?: string) =>
  invoke<HistoryLog>('get_history', { teamId, season });

export const getHistorySeasons = (teamId: number) =>
  invoke<string[]>('get_history_seasons', { teamId });

/** Backfills games that finished while the app was closed. Returns the count logged. */
export const refreshHistory = (teamId?: number) =>
  invoke<number>('refresh_history', { teamId });

// --- Saved games -----------------------------------------------------------

export const saveGame = (gamePk: number) =>
  invoke<SavedGameInfo>('save_game', { gamePk });

export const loadGame = (gamePk: number) =>
  invoke<GameSnapshot>('load_game', { gamePk });

export const listSavedGames = (teamId?: number) =>
  invoke<SavedGameInfo[]>('list_saved_games', { teamId });

export const gameIsSaved = (gamePk: number) =>
  invoke<boolean>('game_is_saved', { gamePk });

export const exportGame = (gamePk: number, path: string) =>
  invoke<void>('export_game', { gamePk, path });

export const importGame = (path: string) =>
  invoke<SavedGameInfo>('import_game', { path });

// --- Media -----------------------------------------------------------------

export const downloadHighlight = (gamePk: number, clipId: string, url: string) =>
  invoke<string>('download_highlight', { gamePk, clipId, url });

export const listLocalClips = (gamePk: number) =>
  invoke<string[]>('list_local_clips', { gamePk });

export const deleteLocalClip = (gamePk: number, clipId: string) =>
  invoke<void>('delete_local_clip', { gamePk, clipId });

/**
 * Tauri rejects with a plain string (see `error.rs`), so `unknown` reaches catch blocks.
 * Normalizes whatever arrives into something renderable.
 */
export function errorMessage(e: unknown): string {
  if (typeof e === 'string') return e;
  if (e instanceof Error) return e.message;
  return 'Something went wrong.';
}
