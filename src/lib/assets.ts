/**
 * Remote image URLs and per-team colour, in one place.
 *
 * These are plain `<img src>` references to MLB's public CDNs, not `fetch` calls, so
 * they do not violate the "no network from the webview" rule in CLAUDE.md — there is no
 * CORS surface and no URL for Rust to own. They do still have to clear the CSP, so any
 * host added here must also appear in `img-src` in `tauri.conf.json`.
 */

/**
 * A team's cap logo, drawn for dark backgrounds.
 *
 * The primary mark (`team-logos/{id}.svg`) is often navy-on-transparent and disappears
 * against the app's background, so the cap-on-dark variant is the default and the
 * primary is only the fallback.
 */
export function teamLogoUrl(teamId: number): string {
  return `https://www.mlbstatic.com/team-logos/team-cap-on-dark/${teamId}.svg`;
}

/** The primary team mark, used when the cap variant 404s. */
export function teamLogoFallbackUrl(teamId: number): string {
  return `https://www.mlbstatic.com/team-logos/${teamId}.svg`;
}

/**
 * A player's headshot.
 *
 * `spots` renditions are square cutouts sized for a roster list; 120 is the smallest
 * that still looks sharp on a HiDPI display at the ~32px we draw it.
 */
export function headshotUrl(personId: number, size: 60 | 120 | 240 = 120): string {
  return `https://midfield.mlbstatic.com/v1/people/${personId}/spots/${size}`;
}

/**
 * Primary club colour, keyed by MLB team id.
 *
 * Used only as an accent (a bar, a ring, a tint) and never as text or background on its
 * own, so contrast stays the app palette's job rather than each club's.
 */
export const TEAM_COLORS: Record<number, string> = {
  108: '#ba0021', // Angels
  109: '#a71930', // Diamondbacks
  110: '#df4601', // Orioles
  111: '#bd3039', // Red Sox
  112: '#0e3386', // Cubs
  113: '#c6011f', // Reds
  114: '#00385d', // Guardians
  115: '#333366', // Rockies
  116: '#0c2340', // Tigers
  117: '#eb6e1f', // Astros
  118: '#004687', // Royals
  119: '#005a9c', // Dodgers
  120: '#ab0003', // Nationals
  121: '#ff5910', // Mets
  133: '#003831', // Athletics
  134: '#fdb827', // Pirates
  135: '#2f241d', // Padres
  136: '#0c2c56', // Mariners
  137: '#fd5a1e', // Giants
  138: '#c41e3a', // Cardinals
  139: '#092c5c', // Rays
  140: '#003278', // Rangers
  141: '#134a8e', // Blue Jays
  142: '#002b5c', // Twins
  143: '#e81828', // Phillies
  144: '#ce1141', // Braves
  145: '#27251f', // White Sox
  146: '#00a3e0', // Marlins
  147: '#003087', // Yankees
  158: '#ffc52f', // Brewers
};

/** Falls back to the app accent for anything not in the map (minors, All-Star squads). */
export function teamColor(teamId?: number | null): string {
  return (teamId != null && TEAM_COLORS[teamId]) || '#4c9aff';
}
