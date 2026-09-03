//! Schedule and team-list commands.

use tauri::State;

use super::{today_mlb, AppState};
use crate::error::Result;
use crate::mlb::{self, models::{GameSummary, Team, TeamStanding}};

#[tauri::command]
pub async fn get_teams(state: State<'_, AppState>) -> Result<Vec<Team>> {
    mlb::fetch_teams(&state.client).await
}

/// Games for a given `YYYY-MM-DD`, or today's slate when `date` is omitted.
///
/// The no-date path deliberately sends no `date` parameter at all, letting MLB apply its
/// own game-day boundary. That is the only way to be right for a viewer in any timezone:
/// on a UTC+8 machine, local midnight lands in the middle of the US evening slate, so a
/// locally-computed date would ask for tomorrow's games and return an empty Preview list.
#[tauri::command]
pub async fn get_schedule(
    state: State<'_, AppState>,
    date: Option<String>,
    team_id: Option<u32>,
) -> Result<Vec<GameSummary>> {
    match date {
        Some(date) => mlb::fetch_schedule(&state.client, &date, team_id).await,
        None => mlb::fetch_schedule_today(&state.client, team_id).await,
    }
}

#[tauri::command]
pub async fn get_schedule_range(
    state: State<'_, AppState>,
    start: String,
    end: String,
    team_id: Option<u32>,
) -> Result<Vec<GameSummary>> {
    mlb::fetch_schedule_range(&state.client, &start, &end, team_id).await
}

/// Today's date on MLB's calendar (US Eastern), for the date picker's starting point.
#[tauri::command]
pub fn get_today() -> String {
    today_mlb()
}

/// Every team's win-loss record, for the season MLB is currently in.
///
/// Records also arrive on each schedule row (`leagueRecord`), but only for teams that
/// happen to be playing. This command backs the places that need a record for a team
/// with no game today — the team picker and the game log header.
#[tauri::command]
pub async fn get_standings(
    state: State<'_, AppState>,
    season: Option<String>,
) -> Result<Vec<TeamStanding>> {
    // The season is the MLB calendar year, not the machine's — see `today_mlb`.
    let season = season.unwrap_or_else(|| today_mlb()[..4].to_string());
    mlb::fetch_standings(&state.client, &season).await
}
