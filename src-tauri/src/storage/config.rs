//! `config.json` — favorited teams and app settings.

use serde::{Deserialize, Serialize};
use tauri::AppHandle;

use super::{atomic_write_json, paths, read_json_or_default};
use crate::error::Result;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Config {
    /// Stored as a list from day one so multi-team support needs no migration, even
    /// though the UI currently sets exactly one.
    #[serde(default)]
    pub favorite_team_ids: Vec<u32>,
    /// Download highlight mp4s alongside saved games. Off by default: clips are large
    /// and the URL alone is enough to replay while online.
    #[serde(default)]
    pub save_video: bool,
    /// Statcast enrichment (Phase 4b). Off by default — it is additive, and Savant is
    /// a second undocumented API that can fail independently.
    #[serde(default)]
    pub statcast_enabled: bool,
    /// Live-feed poll interval. Floored at 5s in `get_config` so a hand-edited file
    /// cannot turn the app into a scraper.
    #[serde(default = "default_poll_seconds")]
    pub poll_seconds: u64,
}

fn default_poll_seconds() -> u64 {
    15
}

impl Default for Config {
    fn default() -> Self {
        Self {
            favorite_team_ids: Vec::new(),
            save_video: false,
            statcast_enabled: false,
            poll_seconds: default_poll_seconds(),
        }
    }
}

impl Config {
    pub fn favorite_team(&self) -> Option<u32> {
        self.favorite_team_ids.first().copied()
    }
}

/// Read `config.json`, falling back to defaults when it is missing or corrupt.
///
/// A malformed config must never prevent the app from starting — the user would have no
/// way to fix it from inside the UI.
pub fn load(app: &AppHandle) -> Result<Config> {
    let path = paths::config_file(app)?;
    let mut config: Config = read_json_or_default(&path)?;
    if config.poll_seconds < 5 {
        config.poll_seconds = default_poll_seconds();
    }
    Ok(config)
}

pub fn save(app: &AppHandle, config: &Config) -> Result<()> {
    atomic_write_json(&paths::config_file(app)?, config)
}

pub fn set_favorite_team(app: &AppHandle, team_id: Option<u32>) -> Result<Config> {
    let mut config = load(app)?;
    config.favorite_team_ids = match team_id {
        Some(id) => vec![id],
        None => Vec::new(),
    };
    save(app, &config)?;
    Ok(config)
}
