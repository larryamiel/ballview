/**
 * TypeScript mirrors of the Rust models in `src-tauri/src/mlb/models.rs`.
 *
 * These follow the same rule as the Rust side: nearly everything is optional, because
 * the MLB Stats API is undocumented and shifts without notice. Prefer optional chaining
 * over non-null assertions when reading anything in here.
 */

export interface IdName {
  id?: number | null;
  name?: string | null;
  fullName?: string | null;
}

export interface CodeDesc {
  code?: string | null;
  description?: string | null;
}

export interface Position {
  code?: string | null;
  name?: string | null;
  type?: string | null;
  abbreviation?: string | null;
}

export interface Team {
  id: number;
  name?: string | null;
  teamName?: string | null;
  abbreviation?: string | null;
  locationName?: string | null;
  shortName?: string | null;
  clubName?: string | null;
  league?: IdName | null;
  division?: IdName | null;
  venue?: IdName | null;
  active?: boolean | null;
}

/** `Preview` before first pitch, `Live` in progress, `Final` when complete. */
export type AbstractGameState = 'Preview' | 'Live' | 'Final' | string;

export interface GameStatus {
  abstractGameState?: AbstractGameState | null;
  detailedState?: string | null;
  codedGameState?: string | null;
  statusCode?: string | null;
  abstractGameCode?: string | null;
}

export interface LeagueRecord {
  wins?: number | null;
  losses?: number | null;
  pct?: string | null;
}

export interface ScheduleTeamSide {
  score?: number | null;
  team?: Team | null;
  isWinner?: boolean | null;
  leagueRecord?: LeagueRecord | null;
}

export interface ScheduleTeams {
  away?: ScheduleTeamSide | null;
  home?: ScheduleTeamSide | null;
}

export interface GameSummary {
  gamePk: number;
  gameType?: string | null;
  /** A string in the API ("2026"), not a number. */
  season?: string | null;
  gameDate?: string | null;
  officialDate?: string | null;
  status?: GameStatus | null;
  teams?: ScheduleTeams | null;
  venue?: IdName | null;
  linescore?: Linescore | null;
  doubleHeader?: string | null;
  gameNumber?: number | null;
}

// --- Live feed -------------------------------------------------------------

export interface Count {
  balls?: number | null;
  strikes?: number | null;
  outs?: number | null;
}

export interface PitchCoordinates {
  /** Horizontal location at the plate, in feet from centre. */
  pX?: number | null;
  /** Height at the plate, in feet. */
  pZ?: number | null;
  /** Induced movement at the plate, in inches. */
  pfxX?: number | null;
  pfxZ?: number | null;

  /**
   * The nine trajectory parameters: position, velocity and acceleration at the 50-foot
   * measurement plane. Present on tracked pitches only — see `BallPath`.
   */
  x0?: number | null;
  y0?: number | null;
  z0?: number | null;
  vX0?: number | null;
  vY0?: number | null;
  vZ0?: number | null;
  aX?: number | null;
  aY?: number | null;
  aZ?: number | null;
}

export interface PitchBreaks {
  breakAngle?: number | null;
  breakLength?: number | null;
  spinRate?: number | null;
  spinDirection?: number | null;
}

export interface PitchData {
  startSpeed?: number | null;
  endSpeed?: number | null;
  strikeZoneTop?: number | null;
  strikeZoneBottom?: number | null;
  coordinates?: PitchCoordinates | null;
  breaks?: PitchBreaks | null;
  zone?: number | null;
  extension?: number | null;
}

export interface HitCoordinates {
  coordX?: number | null;
  coordY?: number | null;
}

export interface HitData {
  launchSpeed?: number | null;
  launchAngle?: number | null;
  totalDistance?: number | null;
  trajectory?: string | null;
  location?: string | null;
  coordinates?: HitCoordinates | null;
}

export interface PlayEventDetails {
  call?: CodeDesc | null;
  description?: string | null;
  code?: string | null;
  type?: CodeDesc | null;
  isInPlay?: boolean | null;
  isStrike?: boolean | null;
  isBall?: boolean | null;
}

export interface PlayEvent {
  details?: PlayEventDetails | null;
  count?: Count | null;
  pitchData?: PitchData | null;
  hitData?: HitData | null;
  index?: number | null;
  playId?: string | null;
  pitchNumber?: number | null;
  startTime?: string | null;
  endTime?: string | null;
  /** False for mound visits, substitutions, and pickoffs. */
  isPitch?: boolean | null;
  type?: string | null;
}

export interface FieldingCredit {
  player?: IdName | null;
  position?: Position | null;
  /** `f_putout`, `f_assist`, `f_fielded_ball`, … */
  credit?: string | null;
}

export interface RunnerMovement {
  originBase?: string | null;
  start?: string | null;
  end?: string | null;
  outBase?: string | null;
  isOut?: boolean | null;
  outNumber?: number | null;
}

export interface RunnerDetails {
  event?: string | null;
  eventType?: string | null;
  runner?: IdName | null;
  isScoringEvent?: boolean | null;
  rbi?: boolean | null;
  earned?: boolean | null;
  playIndex?: number | null;
}

export interface Runner {
  movement?: RunnerMovement | null;
  details?: RunnerDetails | null;
  credits?: FieldingCredit[];
}

export interface PlayResult {
  type?: string | null;
  event?: string | null;
  eventType?: string | null;
  description?: string | null;
  rbi?: number | null;
  awayScore?: number | null;
  homeScore?: number | null;
  isOut?: boolean | null;
}

export interface PlayAbout {
  atBatIndex?: number | null;
  halfInning?: string | null;
  isTopInning?: boolean | null;
  inning?: number | null;
  startTime?: string | null;
  endTime?: string | null;
  isComplete?: boolean | null;
  isScoringPlay?: boolean | null;
  hasOut?: boolean | null;
}

export interface Matchup {
  batter?: IdName | null;
  pitcher?: IdName | null;
  batSide?: CodeDesc | null;
  pitchHand?: CodeDesc | null;
}

export interface Play {
  result?: PlayResult | null;
  about?: PlayAbout | null;
  count?: Count | null;
  matchup?: Matchup | null;
  runners?: Runner[];
  playEvents?: PlayEvent[];
  atBatIndex?: number | null;
}

export interface Plays {
  allPlays?: Play[];
  currentPlay?: Play | null;
  scoringPlays?: number[];
}

export interface InningSide {
  runs?: number | null;
  hits?: number | null;
  errors?: number | null;
  leftOnBase?: number | null;
}

export interface Inning {
  num?: number | null;
  ordinalNum?: string | null;
  home?: InningSide | null;
  away?: InningSide | null;
}

export interface Defense {
  pitcher?: IdName | null;
  catcher?: IdName | null;
  first?: IdName | null;
  second?: IdName | null;
  third?: IdName | null;
  shortstop?: IdName | null;
  left?: IdName | null;
  center?: IdName | null;
  right?: IdName | null;
  team?: Team | null;
}

export interface Offense {
  batter?: IdName | null;
  onDeck?: IdName | null;
  inHole?: IdName | null;
  first?: IdName | null;
  second?: IdName | null;
  third?: IdName | null;
  team?: Team | null;
}

export interface Linescore {
  currentInning?: number | null;
  currentInningOrdinal?: string | null;
  inningState?: string | null;
  inningHalf?: string | null;
  isTopInning?: boolean | null;
  scheduledInnings?: number | null;
  innings?: Inning[];
  teams?: { home?: InningSide | null; away?: InningSide | null } | null;
  defense?: Defense | null;
  offense?: Offense | null;
  balls?: number | null;
  strikes?: number | null;
  outs?: number | null;
}

export interface FieldingStats {
  assists?: number | null;
  putOuts?: number | null;
  errors?: number | null;
  chances?: number | null;
}

/**
 * One batting line.
 *
 * The same shape covers a player's game, that player's season, and the team's totals —
 * MLB sends all three under the same keys. The rate stats are strings (".247") and are
 * populated only on the season and team lines, which is why the table's AVG column reads
 * from `seasonStats`: an average over four at-bats is noise.
 */
export interface BattingStats {
  /** MLB's own summary, e.g. `"0-4 | BB, 3 K, R"`. */
  summary?: string | null;
  atBats?: number | null;
  runs?: number | null;
  hits?: number | null;
  doubles?: number | null;
  triples?: number | null;
  homeRuns?: number | null;
  rbi?: number | null;
  baseOnBalls?: number | null;
  strikeOuts?: number | null;
  stolenBases?: number | null;
  leftOnBase?: number | null;
  avg?: string | null;
  obp?: string | null;
  slg?: string | null;
  ops?: string | null;
}

export interface PitchingStats {
  summary?: string | null;
  /** A string on purpose: `"4.2"` is four and two thirds innings, not four point two. */
  inningsPitched?: string | null;
  hits?: number | null;
  runs?: number | null;
  earnedRuns?: number | null;
  baseOnBalls?: number | null;
  strikeOuts?: number | null;
  homeRuns?: number | null;
  battersFaced?: number | null;
  pitchesThrown?: number | null;
  strikes?: number | null;
  gamesStarted?: number | null;
  wins?: number | null;
  losses?: number | null;
  saves?: number | null;
  era?: string | null;
}

export interface PlayerGameStats {
  batting?: BattingStats | null;
  pitching?: PitchingStats | null;
  fielding?: FieldingStats | null;
}

export interface BoxscorePlayer {
  person?: IdName | null;
  jerseyNumber?: string | null;
  position?: Position | null;
  stats?: PlayerGameStats | null;
  /** The same shapes, season to date — where AVG and ERA come from. */
  seasonStats?: PlayerGameStats | null;
  allPositions?: Position[];
  /** `"100"` for a starter in the first slot, `"101"` for whoever replaced them. */
  battingOrder?: string | null;
}

/** MLB's own footnotes under a box score: HR, RBI, SB, double plays, team LOB. */
export interface BoxInfoSection {
  title?: string | null;
  fieldList?: { label?: string | null; value?: string | null }[];
}

export interface BoxscoreTeam {
  team?: Team | null;
  /** Keyed by `"ID{playerId}"`, not a bare id. */
  players?: Record<string, BoxscorePlayer>;
  batters?: number[];
  pitchers?: number[];
  bench?: number[];
  bullpen?: number[];
  battingOrder?: number[];
  teamStats?: PlayerGameStats | null;
  info?: BoxInfoSection[];
  note?: { label?: string | null; value?: string | null }[];
}

export interface Boxscore {
  teams?: { away?: BoxscoreTeam | null; home?: BoxscoreTeam | null } | null;
}

export interface GameMeta {
  pk?: number | null;
  type?: string | null;
  season?: string | null;
}

export interface GameData {
  game?: GameMeta | null;
  datetime?: { dateTime?: string | null; officialDate?: string | null } | null;
  status?: GameStatus | null;
  teams?: { away?: Team | null; home?: Team | null } | null;
  venue?: IdName | null;
}

export interface LiveFeed {
  gamePk?: number | null;
  metaData?: { wait?: number | null; timeStamp?: string | null } | null;
  gameData?: GameData | null;
  liveData?: {
    plays?: Plays | null;
    linescore?: Linescore | null;
    boxscore?: Boxscore | null;
  } | null;
}

// --- Highlights ------------------------------------------------------------

export interface Highlight {
  id: string;
  title: string;
  description?: string | null;
  duration?: string | null;
  date?: string | null;
  /** `null` when MLB lists the clip but exposes no playable mp4. */
  url?: string | null;
  thumbnail?: string | null;
  /** Players the clip is tagged with, by MLB's own keyword. */
  playerIds?: number[];
  /** Clubs the clip is tagged with — usually both sides of the game. */
  teamIds?: number[];
  /** MLB's subject tags ("home-run", "defense", "mlb_recap"). */
  tags?: string[];
}

/** One clip in the league-wide play-of-the-day ranking. */
export interface TopPlay {
  gamePk: number;
  date?: string | null;
  awayTeam?: string | null;
  homeTeam?: string | null;
  awayTeamId?: number | null;
  homeTeamId?: number | null;
  teamIds: number[];
  /** Why it ranked, in the app's words: "Walk-off", "Robbed a home run"… */
  reason: string;
  score: number;
  clip: Highlight;
}

export interface TopPlays {
  date: string;
  /** The slate is not today's, because today has not been played yet. */
  resolvedBack: boolean;
  plays: TopPlay[];
}

/** One article from a club's mlb.com news feed. */
export interface NewsItem {
  title: string;
  link: string;
  /** RFC 3339, or null when the feed's date would not parse. */
  published?: string | null;
  author?: string | null;
  image?: string | null;
  summary?: string | null;
}

// --- Statcast (Phase 4b, optional) -----------------------------------------

export interface StatcastPitch {
  play_id?: string | null;
  pitch_type?: string | null;
  start_speed?: number | null;
  px?: number | null;
  pz?: number | null;
  hit_speed?: number | null;
  hit_angle?: number | null;
  hit_distance?: number | null;
  hc_x?: number | null;
  hc_y?: number | null;
  inning?: number | null;
}

export interface StatcastGame {
  gamePk: number;
  /** Keyed by `playId`, matching `PlayEvent.playId`. */
  pitches: Record<string, StatcastPitch>;
}

/**
 * One team's place in the standings, flattened by the Rust side.
 *
 * `pct` and `gamesBack` are strings in the API (".587", "-") and are kept that way so
 * the UI shows exactly what MLB publishes.
 */
export interface TeamStanding {
  teamId: number;
  teamName?: string | null;
  wins: number;
  losses: number;
  pct?: string | null;
  gamesBack?: string | null;
  divisionRank?: string | null;
  divisionName?: string | null;
  leagueName?: string | null;
  streak?: string | null;
}

// --- Player stats ----------------------------------------------------------

/**
 * One row of a stats leaderboard.
 *
 * `stat` is an untyped bag because MLB returns ~60 keys per split and a different set
 * for hitting and pitching. The column tables in `PlayerStats.tsx` are the one place
 * that names them, and values arrive as strings (".302", "180.1") as often as numbers.
 */
export interface PlayerStatRow {
  playerId: number;
  playerName: string;
  teamId?: number | null;
  teamName?: string | null;
  position?: string | null;
  rank?: number | null;
  stat: Record<string, string | number | null>;
}

/** Mirrors the Rust `StatRange` enum, which is tagged on `kind`. */
export type StatRange =
  | { kind: 'season' }
  | { kind: 'dateRange'; start: string; end: string }
  | { kind: 'lastGames'; games: number };

export interface Person {
  id: number;
  fullName?: string | null;
  primaryNumber?: string | null;
  primaryPosition?: Position | null;
  batSide?: CodeDesc | null;
  pitchHand?: CodeDesc | null;
  height?: string | null;
  weight?: number | null;
  currentAge?: number | null;
  mlbDebutDate?: string | null;
  birthCity?: string | null;
  birthCountry?: string | null;
  currentTeam?: Team | null;
}

// --- Storage ---------------------------------------------------------------

export interface Config {
  favoriteTeamIds: number[];
  saveVideo: boolean;
  statcastEnabled: boolean;
  pollSeconds: number;
}

export interface HistoryEntry {
  gamePk: number;
  gameDate?: string | null;
  /** First pitch as a UTC instant. Present on games that have not been played yet. */
  startTime?: string | null;
  gameType?: string | null;
  awayTeam?: string | null;
  homeTeam?: string | null;
  awayTeamId?: number | null;
  homeTeamId?: number | null;
  awayScore?: number | null;
  homeScore?: number | null;
  status?: string | null;
  isFinal: boolean;
  /** A full snapshot exists in `games/{gamePk}.json`. */
  saved: boolean;
}

export interface HistoryLog {
  teamId: number;
  season: string;
  entries: HistoryEntry[];
}

export interface SavedGameInfo {
  gamePk: number;
  savedAt: string;
  season?: string | null;
  gameDate?: string | null;
  awayTeam?: string | null;
  homeTeam?: string | null;
  awayTeamId?: number | null;
  homeTeamId?: number | null;
  awayScore?: number | null;
  homeScore?: number | null;
  isFinal: boolean;
  hasLocalClips: boolean;
}

export interface GameSnapshot {
  version: number;
  gamePk: number;
  savedAt: string;
  season?: string | null;
  gameDate?: string | null;
  gameType?: string | null;
  awayTeam?: string | null;
  homeTeam?: string | null;
  awayScore?: number | null;
  homeScore?: number | null;
  isFinal: boolean;
  feed: LiveFeed;
  boxscore?: Boxscore | null;
  highlights: Highlight[];
  localClips: string[];
}

// --- Charts, comparisons and the spotlight ---------------------------------

/** One game from a player's game log. The stat block's keys vary by group. */
export interface GameLogSplit {
  date?: string | null;
  gamePk?: number | null;
  isHome?: boolean | null;
  isWin?: boolean | null;
  opponent?: Team | null;
  team?: Team | null;
  stat: Record<string, string | number | null>;
}

/** A player as the comparison picker needs them. */
export interface PlayerRef {
  id: number;
  fullName: string;
  teamId?: number | null;
  teamName?: string | null;
  position?: string | null;
  /** `Pitcher` for a pitcher — decides which stats the picker offers. */
  positionType?: string | null;
}

/** Release speed for one pitch type on one date, already averaged in Rust. */
export interface PitchSpeedPoint {
  date: string;
  pitchType: string;
  pitches: number;
  avgSpeed: number;
  maxSpeed: number;
  avgSpin?: number | null;
}

/** One player's standing in a spotlight window. */
export interface Performer {
  playerId: number;
  playerName: string;
  teamId?: number | null;
  teamName?: string | null;
  position?: string | null;
  /** The composite, 0–100 within the window's pool. */
  score: number;
  /** Wins added over the window, estimated from linear weights. */
  winsEstimate: number;
  /** MLB's season-to-date WAR, for context — it is not windowed. */
  seasonWar?: number | null;
  line: string;
}

export interface Spotlight {
  start: string;
  end: string;
  /** The window fell back off today, because today has not been played yet. */
  resolvedBack: boolean;
  hitters: Performer[];
  pitchers: Performer[];
}

export type SpotlightPeriod = 'day' | 'week' | 'month';
