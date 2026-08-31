//! Schedule and team-list commands.

use tauri::State;

use super::{today_local, AppState};
use crate::error::Result;
use crate::mlb::{self, models::{GameSummary, Team}};

#[tauri::command]
pub async fn get_teams(state: State<'_, AppState>) -> Result<Vec<Team>> {
    mlb::fetch_teams(&state.client).await
}

/// Today's games, or a given `YYYY-MM-DD`.
#[tauri::command]
pub async fn get_schedule(
    state: State<'_, AppState>,
    date: Option<String>,
    team_id: Option<u32>,
) -> Result<Vec<GameSummary>> {
    let date = date.unwrap_or_else(today_local);
    mlb::fetch_schedule(&state.client, &date, team_id).await
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

#[tauri::command]
pub fn get_today() -> String {
    today_local()
}
