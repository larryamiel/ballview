//! Live feed, boxscore, highlights, and optional Statcast.

use tauri::State;

use super::AppState;
use crate::error::Result;
use crate::mlb::{
    self,
    models::{Boxscore, Highlight, LiveFeed},
    savant::{self, StatcastGame},
};

#[tauri::command]
pub async fn get_live_feed(state: State<'_, AppState>, game_pk: i64) -> Result<LiveFeed> {
    mlb::fetch_live_feed(&state.client, game_pk).await
}

#[tauri::command]
pub async fn get_boxscore(state: State<'_, AppState>, game_pk: i64) -> Result<Boxscore> {
    mlb::fetch_boxscore(&state.client, game_pk).await
}

/// Highlight clips, already flattened to `{ id, title, url }`.
#[tauri::command]
pub async fn get_game_content(state: State<'_, AppState>, game_pk: i64) -> Result<Vec<Highlight>> {
    mlb::fetch_highlights(&state.client, game_pk).await
}

/// Statcast enrichment. Callers must treat failure as "no data", not an error state —
/// Savant is a second undocumented API and nothing in the UI depends on it.
#[tauri::command]
pub async fn get_statcast(state: State<'_, AppState>, game_pk: i64) -> Result<StatcastGame> {
    savant::fetch_statcast(&state.client, game_pk).await
}
