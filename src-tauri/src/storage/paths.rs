//! Where ballview keeps its files.
//!
//! Everything lives under the OS app-data directory (`%APPDATA%/ballview/` on Windows),
//! resolved through Tauri's path API rather than hard-coded, so a portable or per-user
//! install still lands somewhere valid.
//!
//! ```text
//! config.json                    settings + favorited team ids
//! history/{season}/{teamId}.json chronological log of a team's games
//! games/{gamePk}.json            full saved game snapshot
//! media/{gamePk}/{clipId}.mp4    downloaded highlight clips
//! ```

use std::path::PathBuf;

use tauri::{AppHandle, Manager};

use crate::error::{Error, Result};

pub fn app_root(app: &AppHandle) -> Result<PathBuf> {
    app.path()
        .app_data_dir()
        .map_err(|e| Error::storage(format!("could not resolve the app data directory: {e}")))
}

pub fn config_file(app: &AppHandle) -> Result<PathBuf> {
    Ok(app_root(app)?.join("config.json"))
}

pub fn games_dir(app: &AppHandle) -> Result<PathBuf> {
    Ok(app_root(app)?.join("games"))
}

pub fn game_file(app: &AppHandle, game_pk: i64) -> Result<PathBuf> {
    Ok(games_dir(app)?.join(format!("{game_pk}.json")))
}

pub fn history_dir(app: &AppHandle, season: &str) -> Result<PathBuf> {
    Ok(app_root(app)?.join("history").join(sanitize(season)))
}

pub fn history_file(app: &AppHandle, season: &str, team_id: u32) -> Result<PathBuf> {
    Ok(history_dir(app, season)?.join(format!("{team_id}.json")))
}

pub fn media_dir(app: &AppHandle, game_pk: i64) -> Result<PathBuf> {
    Ok(app_root(app)?.join("media").join(game_pk.to_string()))
}

pub fn media_file(app: &AppHandle, game_pk: i64, clip_id: &str) -> Result<PathBuf> {
    Ok(media_dir(app, game_pk)?.join(format!("{}.mp4", sanitize(clip_id))))
}

/// Strip anything that could escape the intended directory or break on NTFS.
///
/// `season` and `clip_id` both originate from the MLB API, so they are untrusted input
/// as far as path construction is concerned — a clip id containing `../` must not be
/// able to write outside `media/`.
pub fn sanitize(s: &str) -> String {
    let cleaned: String = s
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '-' || c == '_' {
                c
            } else {
                '_'
            }
        })
        .collect();
    if cleaned.is_empty() {
        "unknown".to_string()
    } else {
        cleaned
    }
}

#[cfg(test)]
mod tests {
    use super::sanitize;

    #[test]
    fn strips_traversal_sequences() {
        assert_eq!(sanitize("../../etc/passwd"), "______etc_passwd");
        assert_eq!(sanitize("..\\windows"), "___windows");
    }

    #[test]
    fn keeps_ordinary_ids_intact() {
        assert_eq!(sanitize("2026"), "2026");
        assert_eq!(sanitize("abc-123_def"), "abc-123_def");
    }

    #[test]
    fn empty_input_never_yields_an_empty_filename() {
        assert_eq!(sanitize(""), "unknown");
    }
}
