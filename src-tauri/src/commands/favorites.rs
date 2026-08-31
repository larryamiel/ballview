//! Favorited teams and settings, persisted in `config.json`.

use tauri::AppHandle;

use crate::error::Result;
use crate::storage::config::{self, Config};

#[tauri::command]
pub fn get_config(app: AppHandle) -> Result<Config> {
    config::load(&app)
}

#[tauri::command]
pub fn set_config(app: AppHandle, config: Config) -> Result<Config> {
    config::save(&app, &config)?;
    config::load(&app)
}

#[tauri::command]
pub fn get_favorite_team(app: AppHandle) -> Result<Option<u32>> {
    Ok(config::load(&app)?.favorite_team())
}

/// Pass `null` to clear the favorite.
#[tauri::command]
pub fn set_favorite_team(app: AppHandle, team_id: Option<u32>) -> Result<Config> {
    config::set_favorite_team(&app, team_id)
}
