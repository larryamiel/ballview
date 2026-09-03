/**
 * Polling hooks for a game in progress.
 *
 * The refetch interval is a function, not a constant, so a game that goes final stops
 * polling on its own without any component having to unmount it. Once a game is Final
 * the feed is immutable, so it is cached indefinitely.
 */

import { useQuery } from '@tanstack/react-query';

import * as api from '../lib/api';
import type { GameSummary, LiveFeed } from '../lib/types';

/** Matches the Rust default; overridden by config.pollSeconds. */
const DEFAULT_POLL_MS = 15_000;

export function isLive(feed?: LiveFeed): boolean {
  return feed?.gameData?.status?.abstractGameState === 'Live';
}

export function isFinal(feed?: LiveFeed): boolean {
  return feed?.gameData?.status?.abstractGameState === 'Final';
}

export function useLiveFeed(gamePk: number | null, pollMs = DEFAULT_POLL_MS) {
  return useQuery({
    queryKey: ['liveFeed', gamePk],
    queryFn: () => api.getLiveFeed(gamePk!),
    enabled: gamePk != null,
    // Poll only while the game is actually in progress.
    refetchInterval: (query) => (isLive(query.state.data) ? pollMs : false),
    // A completed game never changes again.
    staleTime: (query: { state: { data?: LiveFeed } }) =>
      isFinal(query.state.data) ? Infinity : 0,
  });
}

export function useSchedule(date: string, pollMs = DEFAULT_POLL_MS) {
  return useQuery({
    queryKey: ['schedule', date],
    queryFn: () => api.getSchedule(date || undefined),
    // Keep the scoreboard moving while any game on the slate is live.
    refetchInterval: (query) => {
      const games = query.state.data as GameSummary[] | undefined;
      const anyLive = games?.some((g) => g.status?.abstractGameState === 'Live');
      return anyLive ? pollMs : false;
    },
  });
}

export function useBoxscore(gamePk: number | null, live: boolean, pollMs = DEFAULT_POLL_MS) {
  return useQuery({
    queryKey: ['boxscore', gamePk],
    queryFn: () => api.getBoxscore(gamePk!),
    enabled: gamePk != null,
    refetchInterval: live ? pollMs : false,
  });
}

export function useHighlights(gamePk: number | null) {
  return useQuery({
    queryKey: ['highlights', gamePk],
    queryFn: () => api.getGameContent(gamePk!),
    enabled: gamePk != null,
    // Clips are published gradually during a game; a minute of staleness is fine.
    staleTime: 60_000,
  });
}

/**
 * Season standings, keyed by team id for O(1) lookup at the call sites.
 *
 * Records move at most once a day per team, so this is cached for an hour rather than
 * refetched alongside the scoreboard.
 */
export function useStandings() {
  return useQuery({
    queryKey: ['standings'],
    queryFn: async () => {
      const rows = await api.getStandings();
      return new Map(rows.map((r) => [r.teamId, r]));
    },
    staleTime: 60 * 60 * 1000,
    // A missing record costs a line of text, not a broken screen, so a failure here
    // must never surface as an error state in the UI.
    retry: 1,
  });
}
