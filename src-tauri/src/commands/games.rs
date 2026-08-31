//! Saving, loading, exporting, and importing game snapshots.

use std::path::PathBuf;

use tauri::{AppHandle, State};

use super::AppState;
use crate::error::Result;
use crate::mlb;
use crate::storage::{
    config,
    game_files::{self, GameSnapshot, SavedGameInfo},
    history,
};

/// Snapshot a game to `games/{gamePk}.json`.
///
/// Fetches the feed, boxscore, and highlight metadata fresh rather than accepting them
/// from the frontend, so a snapshot is always internally consistent. The boxscore and
/// highlights are best-effort: a game with neither still saves, because the play-by-play
/// is the part worth preserving.
#[tauri::command]
pub async fn save_game(
    app: AppHandle,
    state: State<'_, AppState>,
    game_pk: i64,
) -> Result<SavedGameInfo> {
    let feed = mlb::fetch_live_feed(&state.client, game_pk).await?;
    let boxscore = mlb::fetch_boxscore(&state.client, game_pk).await.ok();
    let highlights = mlb::fetch_highlights(&state.client, game_pk)
        .await
        .unwrap_or_default();

    let mut snapshot = GameSnapshot::from_feed(game_pk, feed, boxscore, highlights);

    // Carry forward any clips already downloaded for this game, so re-saving a game
    // does not orphan its media.
    if let Ok(existing) = game_files::load(&app, game_pk) {
        snapshot.local_clips = existing.local_clips;
    }

    game_files::save(&app, &snapshot)?;

    // Reflect the save in the favorited team's log, if this game involves them.
    if let (Some(team_id), Some(season)) = (config::load(&app)?.favorite_team(), snapshot.season.clone()) {
        let _ = history::mark_saved(&app, team_id, &season, game_pk);
    }

    Ok(SavedGameInfo::from(&snapshot))
}

#[tauri::command]
pub fn load_game(app: AppHandle, game_pk: i64) -> Result<GameSnapshot> {
    game_files::load(&app, game_pk)
}

#[tauri::command]
pub fn list_saved_games(app: AppHandle, team_id: Option<i64>) -> Result<Vec<SavedGameInfo>> {
    let all = game_files::list(&app)?;
    let Some(team_id) = team_id else {
        return Ok(all);
    };

    // The listing header carries team names, not ids, so filtering by team means
    // reading each snapshot. Acceptable: this is a local directory of tens of files,
    // and it keeps `SavedGameInfo` small for the common unfiltered case.
    let filtered = all
        .into_iter()
        .filter(|info| {
            game_files::load(&app, info.game_pk)
                .ok()
                .and_then(|s| {
                    let teams = s.feed.game_data?.teams?;
                    let away = teams.away.map(|t| t.id);
                    let home = teams.home.map(|t| t.id);
                    Some(away == Some(team_id) || home == Some(team_id))
                })
                .unwrap_or(false)
        })
        .collect();
    Ok(filtered)
}

#[tauri::command]
pub fn game_is_saved(app: AppHandle, game_pk: i64) -> Result<bool> {
    game_files::exists(&app, game_pk)
}

/// Write a snapshot to a user-chosen path. The frontend picks the path with the dialog
/// plugin and hands it here, so the webview never needs filesystem access of its own.
#[tauri::command]
pub fn export_game(app: AppHandle, game_pk: i64, path: String) -> Result<()> {
    game_files::export(&app, game_pk, &PathBuf::from(path))
}

#[tauri::command]
pub fn import_game(app: AppHandle, path: String) -> Result<SavedGameInfo> {
    let snapshot = game_files::import(&app, &PathBuf::from(path))?;
    Ok(SavedGameInfo::from(&snapshot))
}
