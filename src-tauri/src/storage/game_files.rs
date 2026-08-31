//! Saved game snapshots: `games/{gamePk}.json`.
//!
//! A snapshot is self-contained — feed, boxscore, and highlight metadata in one file —
//! so a saved game reopens offline and exports as a single portable file.

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use tauri::AppHandle;

use super::{atomic_write_json, paths, read_json_opt};
use crate::error::{Error, Result};
use crate::mlb::models::{Boxscore, Highlight, LiveFeed};

/// Bump when the snapshot shape changes incompatibly, so old files can be detected.
pub const SNAPSHOT_VERSION: u32 = 1;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GameSnapshot {
    #[serde(default = "default_version")]
    pub version: u32,
    pub game_pk: i64,
    /// ISO-8601 timestamp of when this snapshot was taken.
    pub saved_at: String,
    #[serde(default)]
    pub season: Option<String>,
    #[serde(default)]
    pub game_date: Option<String>,
    #[serde(default)]
    pub game_type: Option<String>,
    #[serde(default)]
    pub away_team: Option<String>,
    #[serde(default)]
    pub home_team: Option<String>,
    #[serde(default)]
    pub away_score: Option<i64>,
    #[serde(default)]
    pub home_score: Option<i64>,
    /// True when the game had finished at save time. A snapshot of an in-progress game
    /// is legal but incomplete, and re-saving later overwrites it.
    #[serde(default)]
    pub is_final: bool,
    pub feed: LiveFeed,
    #[serde(default)]
    pub boxscore: Option<Boxscore>,
    #[serde(default)]
    pub highlights: Vec<Highlight>,
    /// Clip ids downloaded to `media/{gamePk}/` (Feature 7).
    #[serde(default)]
    pub local_clips: Vec<String>,
}

fn default_version() -> u32 {
    SNAPSHOT_VERSION
}

impl GameSnapshot {
    /// Build a snapshot from a live feed, pulling the summary fields out of the feed so
    /// the history list can render without loading the whole file.
    pub fn from_feed(
        game_pk: i64,
        feed: LiveFeed,
        boxscore: Option<Boxscore>,
        highlights: Vec<Highlight>,
    ) -> Self {
        let game_data = feed.game_data.as_ref();
        let linescore = feed.live_data.as_ref().and_then(|d| d.linescore.as_ref());

        let team_name = |t: Option<&crate::mlb::models::Team>| {
            t.and_then(|t| t.name.clone().or_else(|| t.team_name.clone()))
        };

        Self {
            version: SNAPSHOT_VERSION,
            game_pk,
            saved_at: chrono::Utc::now().to_rfc3339(),
            season: game_data.and_then(|g| g.game.as_ref()).and_then(|g| g.season.clone()),
            game_date: game_data
                .and_then(|g| g.datetime.as_ref())
                .and_then(|d| d.official_date.clone().or_else(|| d.date_time.clone())),
            game_type: game_data.and_then(|g| g.game.as_ref()).and_then(|g| g.kind.clone()),
            away_team: team_name(game_data.and_then(|g| g.teams.as_ref()).and_then(|t| t.away.as_ref())),
            home_team: team_name(game_data.and_then(|g| g.teams.as_ref()).and_then(|t| t.home.as_ref())),
            away_score: linescore
                .and_then(|l| l.teams.as_ref())
                .and_then(|t| t.away.as_ref())
                .and_then(|s| s.runs),
            home_score: linescore
                .and_then(|l| l.teams.as_ref())
                .and_then(|t| t.home.as_ref())
                .and_then(|s| s.runs),
            is_final: game_data
                .and_then(|g| g.status.as_ref())
                .map(|s| s.is_final())
                .unwrap_or(false),
            feed,
            boxscore,
            highlights,
            local_clips: Vec::new(),
        }
    }
}

/// A saved game as listed in the UI — the header fields only, without the feed.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SavedGameInfo {
    pub game_pk: i64,
    pub saved_at: String,
    pub season: Option<String>,
    pub game_date: Option<String>,
    pub away_team: Option<String>,
    pub home_team: Option<String>,
    pub away_score: Option<i64>,
    pub home_score: Option<i64>,
    pub is_final: bool,
    pub has_local_clips: bool,
}

impl From<&GameSnapshot> for SavedGameInfo {
    fn from(s: &GameSnapshot) -> Self {
        Self {
            game_pk: s.game_pk,
            saved_at: s.saved_at.clone(),
            season: s.season.clone(),
            game_date: s.game_date.clone(),
            away_team: s.away_team.clone(),
            home_team: s.home_team.clone(),
            away_score: s.away_score,
            home_score: s.home_score,
            is_final: s.is_final,
            has_local_clips: !s.local_clips.is_empty(),
        }
    }
}

pub fn save(app: &AppHandle, snapshot: &GameSnapshot) -> Result<PathBuf> {
    let path = paths::game_file(app, snapshot.game_pk)?;
    atomic_write_json(&path, snapshot)?;
    Ok(path)
}

pub fn load(app: &AppHandle, game_pk: i64) -> Result<GameSnapshot> {
    let path = paths::game_file(app, game_pk)?;
    read_json_opt(&path)?.ok_or(Error::GameNotFound(game_pk))
}

pub fn exists(app: &AppHandle, game_pk: i64) -> Result<bool> {
    Ok(paths::game_file(app, game_pk)?.exists())
}

/// List every saved snapshot, newest game first.
///
/// A file that fails to parse is skipped rather than failing the whole listing — one bad
/// snapshot should not hide the rest of the library.
pub fn list(app: &AppHandle) -> Result<Vec<SavedGameInfo>> {
    let dir = paths::games_dir(app)?;
    if !dir.exists() {
        return Ok(Vec::new());
    }

    let mut out = Vec::new();
    for entry in std::fs::read_dir(&dir)? {
        let path = entry?.path();
        if path.extension().and_then(|e| e.to_str()) != Some("json") {
            continue;
        }
        if let Ok(Some(snapshot)) = read_json_opt::<GameSnapshot>(&path) {
            out.push(SavedGameInfo::from(&snapshot));
        }
    }

    out.sort_by(|a, b| {
        b.game_date
            .as_deref()
            .unwrap_or("")
            .cmp(a.game_date.as_deref().unwrap_or(""))
            .then(b.game_pk.cmp(&a.game_pk))
    });
    Ok(out)
}

/// Copy a snapshot to a user-chosen path (Phase 7 export).
pub fn export(app: &AppHandle, game_pk: i64, dest: &Path) -> Result<()> {
    let snapshot = load(app, game_pk)?;
    if let Some(parent) = dest.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::write(dest, serde_json::to_string_pretty(&snapshot)?)?;
    Ok(())
}

/// Read a snapshot from an arbitrary path (import), validating it is really one.
pub fn import(app: &AppHandle, src: &Path) -> Result<GameSnapshot> {
    let text = std::fs::read_to_string(src)?;
    let snapshot: GameSnapshot = serde_json::from_str(&text)
        .map_err(|e| Error::Parse(format!("not a ballview game file: {e}")))?;
    save(app, &snapshot)?;
    Ok(snapshot)
}
