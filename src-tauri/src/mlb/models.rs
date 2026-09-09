//! Serde models for the MLB Stats API.
//!
//! Deliberate design rule: **almost every field is `Option` or `#[serde(default)]`.**
//! The Stats API is reverse-engineered and unversioned — MLB adds, renames, and drops
//! fields mid-season without notice. A strict model turns a cosmetic upstream change
//! into a total outage; a permissive one degrades to a missing value in one corner of
//! the UI. `deny_unknown_fields` is never used here, for the same reason.

use serde::{Deserialize, Serialize};

// ---------------------------------------------------------------------------
// Shared primitives
// ---------------------------------------------------------------------------

/// An `{ id, name }` pair, which the API uses for teams, venues, players, leagues…
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IdName {
    pub id: Option<i64>,
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default, rename = "fullName")]
    pub full_name: Option<String>,
}

impl IdName {
    /// Players carry `fullName`; everything else carries `name`.
    pub fn label(&self) -> Option<&str> {
        self.full_name.as_deref().or(self.name.as_deref())
    }
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CodeDesc {
    #[serde(default)]
    pub code: Option<String>,
    #[serde(default)]
    pub description: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Position {
    #[serde(default)]
    pub code: Option<String>,
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default, rename = "type")]
    pub kind: Option<String>,
    #[serde(default)]
    pub abbreviation: Option<String>,
}

// ---------------------------------------------------------------------------
// Teams  —  GET /api/v1/teams?sportId=1
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Deserialize)]
pub struct TeamsResponse {
    #[serde(default)]
    pub teams: Vec<Team>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Team {
    pub id: i64,
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub team_name: Option<String>,
    #[serde(default)]
    pub abbreviation: Option<String>,
    #[serde(default)]
    pub location_name: Option<String>,
    #[serde(default)]
    pub short_name: Option<String>,
    #[serde(default)]
    pub club_name: Option<String>,
    #[serde(default)]
    pub league: Option<IdName>,
    #[serde(default)]
    pub division: Option<IdName>,
    #[serde(default)]
    pub venue: Option<IdName>,
    #[serde(default)]
    pub active: Option<bool>,
}

// ---------------------------------------------------------------------------
// Schedule  —  GET /api/v1/schedule
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Deserialize)]
pub struct ScheduleResponse {
    #[serde(default)]
    pub dates: Vec<ScheduleDate>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScheduleDate {
    #[serde(default)]
    pub date: Option<String>,
    #[serde(default)]
    pub games: Vec<GameSummary>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GameSummary {
    pub game_pk: i64,
    #[serde(default)]
    pub game_type: Option<String>,
    /// The API returns this as a string ("2026"), not a number.
    #[serde(default)]
    pub season: Option<String>,
    #[serde(default)]
    pub game_date: Option<String>,
    #[serde(default)]
    pub official_date: Option<String>,
    #[serde(default)]
    pub status: Option<GameStatus>,
    #[serde(default)]
    pub teams: Option<ScheduleTeams>,
    #[serde(default)]
    pub venue: Option<IdName>,
    #[serde(default)]
    pub linescore: Option<Linescore>,
    #[serde(default)]
    pub double_header: Option<String>,
    #[serde(default)]
    pub game_number: Option<i64>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GameStatus {
    /// One of `Preview`, `Live`, `Final` — the field worth branching on.
    #[serde(default)]
    pub abstract_game_state: Option<String>,
    #[serde(default)]
    pub detailed_state: Option<String>,
    #[serde(default)]
    pub coded_game_state: Option<String>,
    #[serde(default)]
    pub status_code: Option<String>,
    #[serde(default)]
    pub abstract_game_code: Option<String>,
}

impl GameStatus {
    pub fn is_live(&self) -> bool {
        self.abstract_game_state.as_deref() == Some("Live")
    }
    pub fn is_final(&self) -> bool {
        self.abstract_game_state.as_deref() == Some("Final")
    }
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct ScheduleTeams {
    #[serde(default)]
    pub away: Option<ScheduleTeamSide>,
    #[serde(default)]
    pub home: Option<ScheduleTeamSide>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScheduleTeamSide {
    #[serde(default)]
    pub score: Option<i64>,
    #[serde(default)]
    pub team: Option<Team>,
    #[serde(default)]
    pub is_winner: Option<bool>,
    #[serde(default)]
    pub league_record: Option<LeagueRecord>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LeagueRecord {
    #[serde(default)]
    pub wins: Option<i64>,
    #[serde(default)]
    pub losses: Option<i64>,
    #[serde(default)]
    pub pct: Option<String>,
}

// ---------------------------------------------------------------------------
// Standings  —  GET /api/v1/standings
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Deserialize)]
pub struct StandingsResponse {
    #[serde(default)]
    pub records: Vec<StandingsRecord>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StandingsRecord {
    #[serde(default)]
    pub division: Option<DivisionRef>,
    #[serde(default)]
    pub league: Option<IdName>,
    #[serde(default)]
    pub team_records: Vec<StandingsTeamRecord>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StandingsTeamRecord {
    #[serde(default)]
    pub team: Option<Team>,
    #[serde(default)]
    pub wins: Option<i64>,
    #[serde(default)]
    pub losses: Option<i64>,
    /// A string in the API (".587"), not a number.
    #[serde(default)]
    pub winning_percentage: Option<String>,
    /// Also a string: "-" for the division leader, otherwise "3.5".
    #[serde(default)]
    pub games_back: Option<String>,
    #[serde(default)]
    pub wild_card_games_back: Option<String>,
    #[serde(default)]
    pub division_rank: Option<String>,
    #[serde(default)]
    pub league_rank: Option<String>,
    #[serde(default)]
    pub streak: Option<Streak>,
}

/// A division as it appears in the standings response.
///
/// `nameShort` ("AL East") is what fits beside a club's record; the full name
/// ("American League East") is the fallback for anything that omits it.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DivisionRef {
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub name_short: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Streak {
    #[serde(default)]
    pub streak_code: Option<String>,
}

/// One team's standing, flattened for the UI.
///
/// The API nests records under division, which the frontend has no use for — it looks
/// records up by team id — so the nesting is collapsed here rather than in React.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TeamStanding {
    pub team_id: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub team_name: Option<String>,
    pub wins: i64,
    pub losses: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pct: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub games_back: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub division_rank: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub division_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub league_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub streak: Option<String>,
}

// ---------------------------------------------------------------------------
// Player stats  —  GET /api/v1/stats  and  GET /api/v1/people/{id}
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Deserialize)]
pub struct StatsResponse {
    #[serde(default)]
    pub stats: Vec<StatGroup>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StatGroup {
    #[serde(default)]
    pub total_splits: Option<i64>,
    #[serde(default)]
    pub splits: Vec<StatSplit>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StatSplit {
    #[serde(default)]
    pub player: Option<IdName>,
    #[serde(default)]
    pub team: Option<Team>,
    #[serde(default)]
    pub position: Option<Position>,
    #[serde(default)]
    pub rank: Option<i64>,
    #[serde(default)]
    pub stat: serde_json::Map<String, serde_json::Value>,
}

/// One row of the stats table, flattened for the UI.
///
/// `stat` stays an untyped map on purpose. MLB returns around sixty keys per split and
/// a different set for hitting and pitching; modelling both as structs would mean two
/// near-duplicate sixty-field types that the frontend would immediately widen back into
/// a lookup. The column definitions in the UI are the single place that names them.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlayerStatRow {
    pub player_id: i64,
    pub player_name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub team_id: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub team_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub position: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub rank: Option<i64>,
    pub stat: serde_json::Map<String, serde_json::Value>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct PeopleResponse {
    #[serde(default)]
    pub people: Vec<Person>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Person {
    pub id: i64,
    #[serde(default)]
    pub full_name: Option<String>,
    #[serde(default)]
    pub primary_number: Option<String>,
    #[serde(default)]
    pub primary_position: Option<Position>,
    #[serde(default)]
    pub bat_side: Option<CodeDesc>,
    #[serde(default)]
    pub pitch_hand: Option<CodeDesc>,
    #[serde(default)]
    pub height: Option<String>,
    #[serde(default)]
    pub weight: Option<i64>,
    #[serde(default)]
    pub current_age: Option<i64>,
    #[serde(default)]
    pub mlb_debut_date: Option<String>,
    #[serde(default)]
    pub birth_city: Option<String>,
    #[serde(default)]
    pub birth_country: Option<String>,
    #[serde(default)]
    pub current_team: Option<Team>,
}

// ---------------------------------------------------------------------------
// Live feed  —  GET /api/v1.1/game/{pk}/feed/live
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LiveFeed {
    #[serde(default)]
    pub game_pk: Option<i64>,
    #[serde(default)]
    pub meta_data: Option<FeedMetaData>,
    #[serde(default)]
    pub game_data: Option<GameData>,
    #[serde(default)]
    pub live_data: Option<LiveData>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FeedMetaData {
    /// MLB's own hint for how long to wait before re-polling, in seconds.
    #[serde(default)]
    pub wait: Option<i64>,
    #[serde(default)]
    pub time_stamp: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GameData {
    #[serde(default)]
    pub game: Option<GameMeta>,
    #[serde(default)]
    pub datetime: Option<GameDatetime>,
    #[serde(default)]
    pub status: Option<GameStatus>,
    #[serde(default)]
    pub teams: Option<GameDataTeams>,
    #[serde(default)]
    pub venue: Option<IdName>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GameMeta {
    #[serde(default)]
    pub pk: Option<i64>,
    #[serde(default, rename = "type")]
    pub kind: Option<String>,
    #[serde(default)]
    pub season: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GameDatetime {
    #[serde(default)]
    pub date_time: Option<String>,
    #[serde(default)]
    pub official_date: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct GameDataTeams {
    #[serde(default)]
    pub away: Option<Team>,
    #[serde(default)]
    pub home: Option<Team>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LiveData {
    #[serde(default)]
    pub plays: Option<Plays>,
    #[serde(default)]
    pub linescore: Option<Linescore>,
    #[serde(default)]
    pub boxscore: Option<Boxscore>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Plays {
    #[serde(default)]
    pub all_plays: Vec<Play>,
    #[serde(default)]
    pub current_play: Option<Play>,
    #[serde(default)]
    pub scoring_plays: Vec<i64>,
}

/// One plate appearance, with its pitches in `play_events`.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Play {
    #[serde(default)]
    pub result: Option<PlayResult>,
    #[serde(default)]
    pub about: Option<PlayAbout>,
    #[serde(default)]
    pub count: Option<Count>,
    #[serde(default)]
    pub matchup: Option<Matchup>,
    #[serde(default)]
    pub runners: Vec<Runner>,
    #[serde(default)]
    pub play_events: Vec<PlayEvent>,
    #[serde(default)]
    pub at_bat_index: Option<i64>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlayResult {
    #[serde(default, rename = "type")]
    pub kind: Option<String>,
    #[serde(default)]
    pub event: Option<String>,
    #[serde(default)]
    pub event_type: Option<String>,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub rbi: Option<i64>,
    #[serde(default)]
    pub away_score: Option<i64>,
    #[serde(default)]
    pub home_score: Option<i64>,
    #[serde(default)]
    pub is_out: Option<bool>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlayAbout {
    #[serde(default)]
    pub at_bat_index: Option<i64>,
    #[serde(default)]
    pub half_inning: Option<String>,
    #[serde(default)]
    pub is_top_inning: Option<bool>,
    #[serde(default)]
    pub inning: Option<i64>,
    #[serde(default)]
    pub start_time: Option<String>,
    #[serde(default)]
    pub end_time: Option<String>,
    #[serde(default)]
    pub is_complete: Option<bool>,
    #[serde(default)]
    pub is_scoring_play: Option<bool>,
    #[serde(default)]
    pub has_out: Option<bool>,
}

#[derive(Debug, Clone, Copy, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Count {
    #[serde(default)]
    pub balls: Option<i64>,
    #[serde(default)]
    pub strikes: Option<i64>,
    #[serde(default)]
    pub outs: Option<i64>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Matchup {
    #[serde(default)]
    pub batter: Option<IdName>,
    #[serde(default)]
    pub pitcher: Option<IdName>,
    #[serde(default)]
    pub bat_side: Option<CodeDesc>,
    #[serde(default)]
    pub pitch_hand: Option<CodeDesc>,
}

// --- Runners and fielding credits (Feature 5) ------------------------------

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Runner {
    #[serde(default)]
    pub movement: Option<RunnerMovement>,
    #[serde(default)]
    pub details: Option<RunnerDetails>,
    /// Who fielded it: the putout/assist attribution behind FielderView.
    #[serde(default)]
    pub credits: Vec<FieldingCredit>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RunnerMovement {
    #[serde(default)]
    pub origin_base: Option<String>,
    #[serde(default)]
    pub start: Option<String>,
    #[serde(default)]
    pub end: Option<String>,
    #[serde(default)]
    pub out_base: Option<String>,
    #[serde(default)]
    pub is_out: Option<bool>,
    #[serde(default)]
    pub out_number: Option<i64>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RunnerDetails {
    #[serde(default)]
    pub event: Option<String>,
    #[serde(default)]
    pub event_type: Option<String>,
    #[serde(default)]
    pub runner: Option<IdName>,
    #[serde(default)]
    pub is_scoring_event: Option<bool>,
    #[serde(default)]
    pub rbi: Option<bool>,
    #[serde(default)]
    pub earned: Option<bool>,
    #[serde(default)]
    pub play_index: Option<i64>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FieldingCredit {
    #[serde(default)]
    pub player: Option<IdName>,
    #[serde(default)]
    pub position: Option<Position>,
    /// e.g. `f_putout`, `f_assist`, `f_fielded_ball`.
    #[serde(default)]
    pub credit: Option<String>,
}

// --- Individual pitches (Feature 4) ----------------------------------------

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlayEvent {
    #[serde(default)]
    pub details: Option<PlayEventDetails>,
    #[serde(default)]
    pub count: Option<Count>,
    #[serde(default)]
    pub pitch_data: Option<PitchData>,
    #[serde(default)]
    pub hit_data: Option<HitData>,
    #[serde(default)]
    pub index: Option<i64>,
    #[serde(default)]
    pub play_id: Option<String>,
    #[serde(default)]
    pub pitch_number: Option<i64>,
    #[serde(default)]
    pub start_time: Option<String>,
    #[serde(default)]
    pub end_time: Option<String>,
    /// False for non-pitch events (mound visits, substitutions, pickoffs).
    #[serde(default)]
    pub is_pitch: Option<bool>,
    #[serde(default, rename = "type")]
    pub kind: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlayEventDetails {
    #[serde(default)]
    pub call: Option<CodeDesc>,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub code: Option<String>,
    #[serde(default, rename = "type")]
    pub pitch_type: Option<CodeDesc>,
    #[serde(default)]
    pub is_in_play: Option<bool>,
    #[serde(default)]
    pub is_strike: Option<bool>,
    #[serde(default)]
    pub is_ball: Option<bool>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PitchData {
    #[serde(default)]
    pub start_speed: Option<f64>,
    #[serde(default)]
    pub end_speed: Option<f64>,
    #[serde(default)]
    pub strike_zone_top: Option<f64>,
    #[serde(default)]
    pub strike_zone_bottom: Option<f64>,
    #[serde(default)]
    pub coordinates: Option<PitchCoordinates>,
    #[serde(default)]
    pub breaks: Option<PitchBreaks>,
    /// Gameday's 1-14 zone grid.
    #[serde(default)]
    pub zone: Option<i64>,
    #[serde(default)]
    pub extension: Option<f64>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PitchCoordinates {
    /// Horizontal location at the plate, in feet from centre.
    #[serde(default, rename = "pX")]
    pub p_x: Option<f64>,
    /// Height at the plate, in feet.
    #[serde(default, rename = "pZ")]
    pub p_z: Option<f64>,
    /// Induced movement at the plate, in inches, relative to a spinless pitch.
    #[serde(default, rename = "pfxX")]
    pub pfx_x: Option<f64>,
    #[serde(default, rename = "pfxZ")]
    pub pfx_z: Option<f64>,

    // The nine trajectory parameters. Position, velocity and acceleration at the
    // measurement plane (y0, 50 ft from the plate) fully describe the flight under
    // constant acceleration, which is what lets the UI draw the actual ball path
    // instead of a guessed arc. Present on tracked pitches only.
    #[serde(default, rename = "x0")]
    pub x0: Option<f64>,
    #[serde(default, rename = "y0")]
    pub y0: Option<f64>,
    #[serde(default, rename = "z0")]
    pub z0: Option<f64>,
    #[serde(default, rename = "vX0")]
    pub v_x0: Option<f64>,
    #[serde(default, rename = "vY0")]
    pub v_y0: Option<f64>,
    #[serde(default, rename = "vZ0")]
    pub v_z0: Option<f64>,
    #[serde(default, rename = "aX")]
    pub a_x: Option<f64>,
    #[serde(default, rename = "aY")]
    pub a_y: Option<f64>,
    #[serde(default, rename = "aZ")]
    pub a_z: Option<f64>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PitchBreaks {
    #[serde(default)]
    pub break_angle: Option<f64>,
    #[serde(default)]
    pub break_length: Option<f64>,
    #[serde(default)]
    pub spin_rate: Option<f64>,
    #[serde(default)]
    pub spin_direction: Option<f64>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HitData {
    #[serde(default)]
    pub launch_speed: Option<f64>,
    #[serde(default)]
    pub launch_angle: Option<f64>,
    #[serde(default)]
    pub total_distance: Option<f64>,
    #[serde(default)]
    pub trajectory: Option<String>,
    /// Scorer's position number where the ball was fielded, as a string.
    #[serde(default)]
    pub location: Option<String>,
    #[serde(default)]
    pub coordinates: Option<HitCoordinates>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HitCoordinates {
    #[serde(default, rename = "coordX")]
    pub coord_x: Option<f64>,
    #[serde(default, rename = "coordY")]
    pub coord_y: Option<f64>,
}

// ---------------------------------------------------------------------------
// Linescore
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Linescore {
    #[serde(default)]
    pub current_inning: Option<i64>,
    #[serde(default)]
    pub current_inning_ordinal: Option<String>,
    /// "Top", "Bottom", "Middle", "End".
    #[serde(default)]
    pub inning_state: Option<String>,
    #[serde(default)]
    pub inning_half: Option<String>,
    #[serde(default)]
    pub is_top_inning: Option<bool>,
    #[serde(default)]
    pub scheduled_innings: Option<i64>,
    #[serde(default)]
    pub innings: Vec<Inning>,
    #[serde(default)]
    pub teams: Option<LinescoreTeams>,
    #[serde(default)]
    pub defense: Option<Defense>,
    #[serde(default)]
    pub offense: Option<Offense>,
    #[serde(default)]
    pub balls: Option<i64>,
    #[serde(default)]
    pub strikes: Option<i64>,
    #[serde(default)]
    pub outs: Option<i64>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Inning {
    #[serde(default)]
    pub num: Option<i64>,
    #[serde(default)]
    pub ordinal_num: Option<String>,
    #[serde(default)]
    pub home: Option<InningSide>,
    #[serde(default)]
    pub away: Option<InningSide>,
}

#[derive(Debug, Clone, Copy, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InningSide {
    #[serde(default)]
    pub runs: Option<i64>,
    #[serde(default)]
    pub hits: Option<i64>,
    #[serde(default)]
    pub errors: Option<i64>,
    #[serde(default)]
    pub left_on_base: Option<i64>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct LinescoreTeams {
    #[serde(default)]
    pub home: Option<InningSide>,
    #[serde(default)]
    pub away: Option<InningSide>,
}

/// The nine defenders currently on the field (Feature 5).
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Defense {
    #[serde(default)]
    pub pitcher: Option<IdName>,
    #[serde(default)]
    pub catcher: Option<IdName>,
    #[serde(default)]
    pub first: Option<IdName>,
    #[serde(default)]
    pub second: Option<IdName>,
    #[serde(default)]
    pub third: Option<IdName>,
    #[serde(default)]
    pub shortstop: Option<IdName>,
    #[serde(default)]
    pub left: Option<IdName>,
    #[serde(default)]
    pub center: Option<IdName>,
    #[serde(default)]
    pub right: Option<IdName>,
    #[serde(default)]
    pub team: Option<Team>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Offense {
    #[serde(default)]
    pub batter: Option<IdName>,
    #[serde(default)]
    pub on_deck: Option<IdName>,
    #[serde(default)]
    pub in_hole: Option<IdName>,
    #[serde(default)]
    pub first: Option<IdName>,
    #[serde(default)]
    pub second: Option<IdName>,
    #[serde(default)]
    pub third: Option<IdName>,
    #[serde(default)]
    pub team: Option<Team>,
}

// ---------------------------------------------------------------------------
// Boxscore  —  GET /api/v1/game/{pk}/boxscore
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Boxscore {
    #[serde(default)]
    pub teams: Option<BoxscoreTeams>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct BoxscoreTeams {
    #[serde(default)]
    pub away: Option<BoxscoreTeam>,
    #[serde(default)]
    pub home: Option<BoxscoreTeam>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BoxscoreTeam {
    #[serde(default)]
    pub team: Option<Team>,
    /// Keyed by `"ID{playerId}"` — not a plain player id.
    #[serde(default)]
    pub players: std::collections::HashMap<String, BoxscorePlayer>,
    #[serde(default)]
    pub batters: Vec<i64>,
    #[serde(default)]
    pub pitchers: Vec<i64>,
    #[serde(default)]
    pub bench: Vec<i64>,
    #[serde(default)]
    pub bullpen: Vec<i64>,
    #[serde(default)]
    pub batting_order: Vec<i64>,
    /// The team's totals line, for the bottom row of each table.
    #[serde(default)]
    pub team_stats: Option<PlayerStats>,
    /// MLB's own footnotes — HR, RBI, SB, double plays, "Team LOB".
    #[serde(default)]
    pub info: Vec<BoxInfoSection>,
    /// The lettered notes attached to substitutions ("a: struck out for X in the 7th").
    #[serde(default)]
    pub note: Vec<BoxNote>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BoxInfoSection {
    #[serde(default)]
    pub title: Option<String>,
    #[serde(default)]
    pub field_list: Vec<BoxInfoField>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BoxInfoField {
    #[serde(default)]
    pub label: Option<String>,
    #[serde(default)]
    pub value: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BoxNote {
    #[serde(default)]
    pub label: Option<String>,
    #[serde(default)]
    pub value: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BoxscorePlayer {
    #[serde(default)]
    pub person: Option<IdName>,
    #[serde(default)]
    pub jersey_number: Option<String>,
    #[serde(default)]
    pub position: Option<Position>,
    #[serde(default)]
    pub stats: Option<PlayerStats>,
    /// The same shapes, season to date — where a batting average or an ERA comes from,
    /// since neither means anything computed over one game.
    #[serde(default)]
    pub season_stats: Option<PlayerStats>,
    /// Every position played, in order — how substitutions show up.
    #[serde(default)]
    pub all_positions: Vec<Position>,
    #[serde(default)]
    pub batting_order: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlayerStats {
    #[serde(default)]
    pub batting: Option<BattingStats>,
    #[serde(default)]
    pub pitching: Option<PitchingStats>,
    #[serde(default)]
    pub fielding: Option<FieldingStats>,
}

/// One batting line.
///
/// The same shape serves three purposes — a player's game, that player's season, and the
/// team's totals — because MLB sends all three under the same keys. Rate stats are
/// strings (".247"), and are only ever populated on the season and team lines: an average
/// over four at-bats is noise, so the table shows the season one.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BattingStats {
    /// MLB's own one-line summary, e.g. "0-4 | BB, 3 K, R".
    #[serde(default)]
    pub summary: Option<String>,
    #[serde(default)]
    pub at_bats: Option<i64>,
    #[serde(default)]
    pub runs: Option<i64>,
    #[serde(default)]
    pub hits: Option<i64>,
    #[serde(default)]
    pub doubles: Option<i64>,
    #[serde(default)]
    pub triples: Option<i64>,
    #[serde(default)]
    pub home_runs: Option<i64>,
    #[serde(default)]
    pub rbi: Option<i64>,
    #[serde(default)]
    pub base_on_balls: Option<i64>,
    #[serde(default)]
    pub strike_outs: Option<i64>,
    #[serde(default)]
    pub stolen_bases: Option<i64>,
    #[serde(default)]
    pub left_on_base: Option<i64>,
    #[serde(default)]
    pub avg: Option<String>,
    #[serde(default)]
    pub obp: Option<String>,
    #[serde(default)]
    pub slg: Option<String>,
    #[serde(default)]
    pub ops: Option<String>,
}

/// One pitching line, in the same three flavours as `BattingStats`.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PitchingStats {
    #[serde(default)]
    pub summary: Option<String>,
    /// A string, and deliberately so: "4.2" is four and two thirds, not four point two.
    #[serde(default)]
    pub innings_pitched: Option<String>,
    #[serde(default)]
    pub hits: Option<i64>,
    #[serde(default)]
    pub runs: Option<i64>,
    #[serde(default)]
    pub earned_runs: Option<i64>,
    #[serde(default)]
    pub base_on_balls: Option<i64>,
    #[serde(default)]
    pub strike_outs: Option<i64>,
    #[serde(default)]
    pub home_runs: Option<i64>,
    #[serde(default)]
    pub batters_faced: Option<i64>,
    #[serde(default)]
    pub pitches_thrown: Option<i64>,
    #[serde(default)]
    pub strikes: Option<i64>,
    #[serde(default)]
    pub games_started: Option<i64>,
    #[serde(default)]
    pub wins: Option<i64>,
    #[serde(default)]
    pub losses: Option<i64>,
    #[serde(default)]
    pub saves: Option<i64>,
    #[serde(default)]
    pub era: Option<String>,
}

#[derive(Debug, Clone, Copy, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FieldingStats {
    #[serde(default)]
    pub assists: Option<i64>,
    #[serde(default)]
    pub put_outs: Option<i64>,
    #[serde(default)]
    pub errors: Option<i64>,
    #[serde(default)]
    pub chances: Option<i64>,
}

// ---------------------------------------------------------------------------
// Game content / highlights  —  GET /api/v1/game/{pk}/content
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GameContent {
    #[serde(default)]
    pub highlights: Option<HighlightsWrapper>,
    #[serde(default)]
    pub media: Option<MediaWrapper>,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HighlightsWrapper {
    /// Yes, `highlights.highlights.items` — the nesting is MLB's, not ours.
    #[serde(default)]
    pub highlights: Option<HighlightItems>,
    #[serde(default)]
    pub live: Option<HighlightItems>,
}

#[derive(Debug, Clone, Default, Deserialize)]
pub struct HighlightItems {
    #[serde(default)]
    pub items: Vec<ContentItem>,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaWrapper {
    #[serde(default)]
    pub epg: Vec<EpgSection>,
    #[serde(default)]
    pub epg_alternate: Vec<EpgSection>,
}

#[derive(Debug, Clone, Default, Deserialize)]
pub struct EpgSection {
    #[serde(default)]
    pub title: Option<String>,
    #[serde(default)]
    pub items: Vec<ContentItem>,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ContentItem {
    #[serde(default)]
    pub id: Option<String>,
    #[serde(default)]
    pub slug: Option<String>,
    #[serde(default)]
    pub title: Option<String>,
    #[serde(default)]
    pub blurb: Option<String>,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub duration: Option<String>,
    #[serde(default)]
    pub date: Option<String>,
    #[serde(default)]
    pub playbacks: Vec<Playback>,
    #[serde(default)]
    pub image: Option<ContentImage>,
    /// Who and what the clip is about. Every highlight carries `player_id` entries, which
    /// is what lets a clip be attributed to a player exactly rather than by matching his
    /// name against the title.
    #[serde(default)]
    pub keywords_all: Vec<ContentKeyword>,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ContentKeyword {
    #[serde(default, rename = "type")]
    pub kind: Option<String>,
    #[serde(default)]
    pub value: Option<String>,
    #[serde(default)]
    pub display_name: Option<String>,
}

#[derive(Debug, Clone, Default, Deserialize)]
pub struct Playback {
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub url: Option<String>,
    #[serde(default)]
    pub width: Option<String>,
    #[serde(default)]
    pub height: Option<String>,
}

#[derive(Debug, Clone, Default, Deserialize)]
pub struct ContentImage {
    #[serde(default)]
    pub cuts: Vec<ImageCut>,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImageCut {
    #[serde(default)]
    pub aspect_ratio: Option<String>,
    #[serde(default)]
    pub width: Option<i64>,
    #[serde(default)]
    pub height: Option<i64>,
    #[serde(default)]
    pub src: Option<String>,
}

/// A highlight flattened for the frontend: one clip, one best mp4 URL.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Highlight {
    pub id: String,
    pub title: String,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub duration: Option<String>,
    #[serde(default)]
    pub date: Option<String>,
    /// `None` when MLB lists the clip but exposes no playable mp4 — the UI shows
    /// "no clip available" rather than a broken player.
    #[serde(default)]
    pub url: Option<String>,
    #[serde(default)]
    pub thumbnail: Option<String>,
    /// Player ids the clip is tagged with.
    #[serde(default)]
    pub player_ids: Vec<i64>,
    /// Club ids the clip is tagged with — usually both sides of the game.
    #[serde(default)]
    pub team_ids: Vec<i64>,
    /// MLB's own subject tags for the clip ("home-run", "defense", "mlb_recap").
    ///
    /// The taxonomy is what separates a play from a nine-minute condensed game, which
    /// is otherwise indistinguishable from a headline alone.
    #[serde(default)]
    pub tags: Vec<String>,
}

// ---------------------------------------------------------------------------
// Charts, comparisons and the spotlight
// ---------------------------------------------------------------------------

/// One game out of a player's game log.
///
/// The stat block is a free map for the same reason `PlayerStatRow` uses one: the keys
/// differ by group and run to forty of them, and the chart builder addresses them by name
/// anyway. What matters here is that every split is dated, which is what makes a time
/// axis possible.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GameLogSplit {
    #[serde(default)]
    pub date: Option<String>,
    #[serde(default)]
    pub game_pk: Option<i64>,
    #[serde(default)]
    pub is_home: Option<bool>,
    #[serde(default)]
    pub is_win: Option<bool>,
    #[serde(default)]
    pub opponent: Option<Team>,
    #[serde(default)]
    pub team: Option<Team>,
    #[serde(default)]
    pub stat: serde_json::Map<String, serde_json::Value>,
}

/// The raw shape of a game-log split, before the nested `game` object is flattened.
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RawLogSplit {
    #[serde(default)]
    pub date: Option<String>,
    #[serde(default)]
    pub game: Option<GameRef>,
    #[serde(default)]
    pub is_home: Option<bool>,
    #[serde(default)]
    pub is_win: Option<bool>,
    #[serde(default)]
    pub opponent: Option<Team>,
    #[serde(default)]
    pub team: Option<Team>,
    #[serde(default)]
    pub stat: serde_json::Map<String, serde_json::Value>,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GameRef {
    #[serde(default)]
    pub game_pk: Option<i64>,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GameLogResponse {
    #[serde(default)]
    pub stats: Vec<GameLogGroup>,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GameLogGroup {
    #[serde(default)]
    pub splits: Vec<RawLogSplit>,
}

/// A player as the comparison picker needs them: enough to find and label one.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlayerRef {
    pub id: i64,
    pub full_name: String,
    #[serde(default)]
    pub team_id: Option<i64>,
    #[serde(default)]
    pub team_name: Option<String>,
    #[serde(default)]
    pub position: Option<String>,
    /// `Pitcher` for a pitcher — the picker uses it to offer the right stats.
    #[serde(default)]
    pub position_type: Option<String>,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PeopleListResponse {
    #[serde(default)]
    pub people: Vec<PersonListEntry>,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PersonListEntry {
    pub id: i64,
    #[serde(default)]
    pub full_name: Option<String>,
    #[serde(default)]
    pub current_team: Option<Team>,
    #[serde(default)]
    pub primary_position: Option<Position>,
    #[serde(default)]
    pub active: Option<bool>,
}

/// One player's season sabermetrics — WAR and the rates built on linear weights.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SabermetricRow {
    pub player_id: i64,
    pub player_name: String,
    #[serde(default)]
    pub war: Option<f64>,
    #[serde(default)]
    pub woba: Option<f64>,
    #[serde(default)]
    pub wrc_plus: Option<f64>,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SabermetricsResponse {
    #[serde(default)]
    pub stats: Vec<SabermetricsGroup>,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SabermetricsGroup {
    #[serde(default)]
    pub splits: Vec<SabermetricsSplit>,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SabermetricsSplit {
    #[serde(default)]
    pub player: Option<IdName>,
    #[serde(default)]
    pub stat: serde_json::Map<String, serde_json::Value>,
}

/// Release speed for one pitch type on one date, already averaged.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PitchSpeedPoint {
    pub date: String,
    pub pitch_type: String,
    pub pitches: u32,
    pub avg_speed: f64,
    pub max_speed: f64,
    #[serde(default)]
    pub avg_spin: Option<f64>,
}

// ---------------------------------------------------------------------------
// A slate hydrated with highlights  —  the play-of-the-day ranking
// ---------------------------------------------------------------------------

/// The schedule read through `endpoints::schedule_with_highlights`.
///
/// A separate, deliberately minimal model rather than a `content` field on
/// `GameSummary`: that struct is serialized to the frontend on every schedule call, and
/// a slate's worth of highlight metadata is roughly two megabytes that no schedule view
/// has any use for. Here only the clips and enough game context to label them are read.
#[derive(Debug, Clone, Default, Deserialize)]
pub struct HighlightScheduleResponse {
    #[serde(default)]
    pub dates: Vec<HighlightScheduleDate>,
}

#[derive(Debug, Clone, Default, Deserialize)]
pub struct HighlightScheduleDate {
    #[serde(default)]
    pub games: Vec<HighlightScheduleGame>,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HighlightScheduleGame {
    #[serde(default)]
    pub game_pk: i64,
    #[serde(default)]
    pub official_date: Option<String>,
    #[serde(default)]
    pub teams: Option<ScheduleTeams>,
    #[serde(default)]
    pub content: Option<GameContent>,
}

/// One clip in the league-wide ranking, with the game it came from.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TopPlay {
    pub game_pk: i64,
    pub date: Option<String>,
    pub away_team: Option<String>,
    pub home_team: Option<String>,
    pub away_team_id: Option<i64>,
    pub home_team_id: Option<i64>,
    /// Every club the clip is tagged with — how a "my team only" filter is applied.
    pub team_ids: Vec<i64>,
    /// Why it ranked, in the app's own words ("Walk-off", "Home run", "Defence").
    pub reason: String,
    pub score: f64,
    pub clip: Highlight,
}

// ---------------------------------------------------------------------------
// Club news  —  mlb.com's RSS feeds
// ---------------------------------------------------------------------------

/// One article from a club's news feed.
#[derive(Debug, Clone, Default, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NewsItem {
    pub title: String,
    pub link: String,
    /// RFC 2822 as published ("Wed, 09 Sep 2026 06:42:00 GMT"), normalized to RFC 3339.
    pub published: Option<String>,
    pub author: Option<String>,
    pub image: Option<String>,
    pub summary: Option<String>,
}
