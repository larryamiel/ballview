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
  NewsItem,
  TopPlays,
  GameLogSplit,
  GameSnapshot,
  GameSummary,
  Highlight,
  HistoryLog,
  LiveFeed,
  PitchSpeedPoint,
  PlayerRef,
  SavedGameInfo,
  Person,
  PlayerStatRow,
  Spotlight,
  SpotlightPeriod,
  StatcastGame,
  StatRange,
  Team,
  TeamStanding,
} from './types';

/** The two stat groups every player query is split by. */
export type StatGroup = 'hitting' | 'pitching';

// --- Schedule --------------------------------------------------------------

export const getTeams = () => invoke<Team[]>('get_teams');

/** Omit `date` for today (resolved in the app's local timezone, not UTC). */
export const getSchedule = (date?: string, teamId?: number) =>
  invoke<GameSummary[]>('get_schedule', { date, teamId });

export const getScheduleRange = (start: string, end: string, teamId?: number) =>
  invoke<GameSummary[]>('get_schedule_range', { start, end, teamId });

export const getToday = () => invoke<string>('get_today');

/** Every team's record. Omit `season` for the one MLB is currently in. */
export const getStandings = (season?: string) =>
  invoke<TeamStanding[]>('get_standings', { season });

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

// --- Player stats ----------------------------------------------------------

/**
 * A leaderboard for one group over one range.
 *
 * `sortStat` is applied by MLB, not here: the league is a few hundred rows and sorting
 * server-side means the top of the table is right even when the response is capped.
 */
export const getPlayerStats = (params: {
  group: 'hitting' | 'pitching';
  range: StatRange;
  season?: string;
  sortStat?: string;
  order?: 'asc' | 'desc';
  limit?: number;
  /** Defaults to true — MLB's own minimum plate appearances or innings. */
  qualified?: boolean;
}) => invoke<PlayerStatRow[]>('get_player_stats', params);

export const getPerson = (personId: number) => invoke<Person>('get_person', { personId });

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
 * Baseball Savant's video of one pitch, by the live feed's own `playId`.
 *
 * `null` means Savant has no clip for it. The URL has to be scraped out of an HTML page,
 * so it is resolved in Rust — and the answer never changes for a given pitch, which makes
 * it worth caching indefinitely on the query side.
 */
export const getPitchClip = (playId: string) =>
  invoke<string | null>('get_pitch_clip', { playId });

// --- Charts, comparisons and the spotlight ---------------------------------

/**
 * One player's game-by-game line for a season, oldest first.
 *
 * The whole season arrives in one request whatever window is on screen: MLB has no
 * per-window game log, a season is at most 162 rows, and re-bucketing by day, week or
 * month is then a local operation rather than a refetch.
 */
export const getPlayerGameLog = (personId: number, group: StatGroup, season?: string) =>
  invoke<GameLogSplit[]>('get_player_game_log', { personId, group, season });

/** One player's totals over a window — a single point on a stat-versus-stat chart. */
export const getPlayerRange = (
  personId: number,
  group: StatGroup,
  start: string,
  end: string,
  season?: string,
) => invoke<PlayerStatRow | null>('get_player_range', { personId, group, start, end, season });

/** Players matching a search, ranked, for the comparison picker. */
export const searchPlayers = (query: string, season?: string, limit?: number) =>
  invoke<PlayerRef[]>('search_players', { query, season, limit });

/**
 * Release speed per pitch type per day, from Statcast.
 *
 * Empty rather than an error when Savant is unreachable — no other part of the chart
 * depends on it.
 */
export const getPitchSpeeds = (personId: number, start: string, end: string) =>
  invoke<PitchSpeedPoint[]>('get_pitch_speeds', { personId, start, end });

/** The best hitters and pitchers over the day, week or month ending `date`. */
export const getTopPerformers = (
  period: SpotlightPeriod,
  date?: string,
  season?: string,
  limit?: number,
) => invoke<Spotlight>('get_top_performers', { period, date, season, limit });

/** The clips one player appears in, from one game. */
export const getPlayerHighlights = (gamePk: number, personId: number) =>
  invoke<Highlight[]>('get_player_highlights', { gamePk, personId });

// --- Play of the day, and club news ----------------------------------------

/**
 * The best plays from one day across the whole league.
 *
 * Omit `date` for the last slate that was actually played — which is not today for most
 * of the day, and the response says so via `resolvedBack`. `teamId` narrows the ranking
 * to clips tagged with one club.
 */
export const getTopPlays = (date?: string, teamId?: number, limit?: number) =>
  invoke<TopPlays>('get_top_plays', { date, teamId, limit });

/** Articles about a club, newest first. Omit `teamId` to use the followed one. */
export const getTeamNews = (teamId?: number, limit?: number) =>
  invoke<NewsItem[]>('get_team_news', { teamId, limit });

/**
 * Tauri rejects with a plain string (see `error.rs`), so `unknown` reaches catch blocks.
 * Normalizes whatever arrives into something renderable.
 */
export function errorMessage(e: unknown): string {
  if (typeof e === 'string') return e;
  if (e instanceof Error) return e.message;
  return 'Something went wrong.';
}
