//! URL builders for every external endpoint ballview touches.
//!
//! Nothing outside this module should ever contain a hard-coded MLB URL. When the
//! (undocumented, unversioned) Stats API shifts, this is the only file that moves.

pub const STATS_API: &str = "https://statsapi.mlb.com/api/v1";
/// The live feed lives on v1.1, not v1 — this is not a typo.
pub const STATS_API_V11: &str = "https://statsapi.mlb.com/api/v1.1";
pub const SAVANT: &str = "https://baseballsavant.mlb.com";

/// MLB's own sport id for Major League Baseball. Other ids are minors/college.
pub const SPORT_ID_MLB: u32 = 1;

pub fn teams() -> String {
    format!("{STATS_API}/teams?sportId={SPORT_ID_MLB}&activeStatus=Y")
}

/// A single day's schedule. `date` is `YYYY-MM-DD`.
pub fn schedule(date: &str, team_id: Option<u32>) -> String {
    let mut url = format!(
        "{STATS_API}/schedule?sportId={SPORT_ID_MLB}&date={date}\
         &hydrate=team,linescore,game(content(summary))"
    );
    if let Some(id) = team_id {
        url.push_str(&format!("&teamId={id}"));
    }
    url
}

/// An inclusive date range, used by the history backfill.
pub fn schedule_range(start: &str, end: &str, team_id: Option<u32>) -> String {
    let mut url = format!(
        "{STATS_API}/schedule?sportId={SPORT_ID_MLB}&startDate={start}&endDate={end}\
         &hydrate=team,linescore"
    );
    if let Some(id) = team_id {
        url.push_str(&format!("&teamId={id}"));
    }
    url
}

pub fn live_feed(game_pk: i64) -> String {
    format!("{STATS_API_V11}/game/{game_pk}/feed/live")
}

pub fn game_content(game_pk: i64) -> String {
    format!("{STATS_API}/game/{game_pk}/content")
}

pub fn boxscore(game_pk: i64) -> String {
    format!("{STATS_API}/game/{game_pk}/boxscore")
}

pub fn linescore(game_pk: i64) -> String {
    format!("{STATS_API}/game/{game_pk}/linescore")
}

/// Statcast pitch-level data for one game (Phase 4b, feature-flagged).
pub fn savant_game(game_pk: i64) -> String {
    format!("{SAVANT}/gf?game_pk={game_pk}")
}
