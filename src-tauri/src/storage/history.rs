//! The favorited team's game log: `history/{season}/{teamId}.json`.
//!
//! Two rules from PLAN.md are enforced here:
//!
//! 1. **The season key comes from the API's `season` field, never the calendar year.**
//!    Spring training, the regular season, and the postseason all share one season value
//!    and therefore one file; `game_type` is stored per entry so the UI can filter.
//! 2. **Entries are upserted by `gamePk`, never blindly appended.** Re-logging a game
//!    that was in progress must update it, not duplicate it.

use serde::{Deserialize, Serialize};
use tauri::AppHandle;

use super::{atomic_write_json, paths, read_json_or_default};
use crate::error::Result;
use crate::mlb::models::GameSummary;

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryLog {
    #[serde(default)]
    pub team_id: u32,
    #[serde(default)]
    pub season: String,
    #[serde(default)]
    pub entries: Vec<HistoryEntry>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryEntry {
    pub game_pk: i64,
    #[serde(default)]
    pub game_date: Option<String>,
    /// `R` regular, `S` spring, `P`/`D`/`L`/`W` postseason rounds, `E` exhibition.
    #[serde(default)]
    pub game_type: Option<String>,
    #[serde(default)]
    pub away_team: Option<String>,
    #[serde(default)]
    pub home_team: Option<String>,
    #[serde(default)]
    pub away_team_id: Option<i64>,
    #[serde(default)]
    pub home_team_id: Option<i64>,
    #[serde(default)]
    pub away_score: Option<i64>,
    #[serde(default)]
    pub home_score: Option<i64>,
    #[serde(default)]
    pub status: Option<String>,
    #[serde(default)]
    pub is_final: bool,
    /// Whether a full snapshot exists in `games/{gamePk}.json`.
    #[serde(default)]
    pub saved: bool,
}

impl HistoryEntry {
    pub fn from_summary(game: &GameSummary) -> Self {
        let away = game.teams.as_ref().and_then(|t| t.away.as_ref());
        let home = game.teams.as_ref().and_then(|t| t.home.as_ref());
        let name = |side: Option<&crate::mlb::models::ScheduleTeamSide>| {
            side.and_then(|s| s.team.as_ref())
                .and_then(|t| t.name.clone().or_else(|| t.team_name.clone()))
        };
        let id = |side: Option<&crate::mlb::models::ScheduleTeamSide>| {
            side.and_then(|s| s.team.as_ref()).map(|t| t.id)
        };

        Self {
            game_pk: game.game_pk,
            game_date: game.official_date.clone().or_else(|| game.game_date.clone()),
            game_type: game.game_type.clone(),
            away_team: name(away),
            home_team: name(home),
            away_team_id: id(away),
            home_team_id: id(home),
            away_score: away.and_then(|s| s.score),
            home_score: home.and_then(|s| s.score),
            status: game
                .status
                .as_ref()
                .and_then(|s| s.detailed_state.clone()),
            is_final: game.status.as_ref().map(|s| s.is_final()).unwrap_or(false),
            saved: false,
        }
    }
}

/// Resolve the season key for a game, per rule 1 above.
///
/// Falls back to the year in the game date only when the API omits `season` entirely —
/// a last resort that is wrong for no real MLB game, but beats writing to `unknown/`.
pub fn season_of(game: &GameSummary) -> String {
    if let Some(season) = game.season.as_ref().filter(|s| !s.is_empty()) {
        return season.clone();
    }
    game.official_date
        .as_deref()
        .or(game.game_date.as_deref())
        .and_then(|d| d.get(0..4))
        .unwrap_or("unknown")
        .to_string()
}

pub fn load(app: &AppHandle, team_id: u32, season: &str) -> Result<HistoryLog> {
    let path = paths::history_file(app, season, team_id)?;
    let mut log: HistoryLog = read_json_or_default(&path)?;
    // Repair the header fields for a file created before they were populated.
    log.team_id = team_id;
    log.season = season.to_string();
    Ok(log)
}

pub fn save(app: &AppHandle, log: &HistoryLog) -> Result<()> {
    let path = paths::history_file(app, &log.season, log.team_id)?;
    atomic_write_json(&path, log)
}

/// Insert or update one entry, keeping the log sorted by date.
///
/// The `saved` flag is preserved across updates: a re-log from the schedule endpoint
/// knows nothing about local snapshots and must not clear it.
pub fn upsert(log: &mut HistoryLog, entry: HistoryEntry) {
    match log.entries.iter_mut().find(|e| e.game_pk == entry.game_pk) {
        Some(existing) => {
            let was_saved = existing.saved;
            *existing = entry;
            existing.saved = was_saved;
        }
        None => log.entries.push(entry),
    }
    log.entries.sort_by(|a, b| {
        a.game_date
            .as_deref()
            .unwrap_or("")
            .cmp(b.game_date.as_deref().unwrap_or(""))
            .then(a.game_pk.cmp(&b.game_pk))
    });
}

/// Log a batch of games for a team, splitting them across season files as needed.
pub fn record_games(app: &AppHandle, team_id: u32, games: &[GameSummary]) -> Result<usize> {
    use std::collections::HashMap;

    let mut by_season: HashMap<String, Vec<&GameSummary>> = HashMap::new();
    for game in games {
        by_season.entry(season_of(game)).or_default().push(game);
    }

    let mut written = 0;
    for (season, games) in by_season {
        let mut log = load(app, team_id, &season)?;
        for game in games {
            upsert(&mut log, HistoryEntry::from_summary(game));
            written += 1;
        }
        // Reconcile the saved flag against what is actually on disk, so a manually
        // deleted snapshot stops being advertised as available.
        for entry in &mut log.entries {
            entry.saved = super::game_files::exists(app, entry.game_pk).unwrap_or(false);
        }
        save(app, &log)?;
    }
    Ok(written)
}

/// The most recent game date already logged for a team, across all seasons.
/// Drives the startup backfill window.
pub fn latest_logged_date(app: &AppHandle, team_id: u32) -> Result<Option<String>> {
    let root = paths::app_root(app)?.join("history");
    if !root.exists() {
        return Ok(None);
    }

    let mut latest: Option<String> = None;
    for season_dir in std::fs::read_dir(&root)? {
        let season_dir = season_dir?;
        if !season_dir.file_type()?.is_dir() {
            continue;
        }
        let file = season_dir.path().join(format!("{team_id}.json"));
        let log: HistoryLog = read_json_or_default(&file)?;
        for entry in log.entries {
            if let Some(date) = entry.game_date {
                if latest.as_deref().map(|l| date.as_str() > l).unwrap_or(true) {
                    latest = Some(date);
                }
            }
        }
    }
    Ok(latest)
}

/// Mark a game as having a local snapshot.
pub fn mark_saved(app: &AppHandle, team_id: u32, season: &str, game_pk: i64) -> Result<()> {
    let mut log = load(app, team_id, season)?;
    if let Some(entry) = log.entries.iter_mut().find(|e| e.game_pk == game_pk) {
        entry.saved = true;
        save(app, &log)?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::mlb::models::GameStatus;

    fn game(pk: i64, season: Option<&str>, date: &str) -> GameSummary {
        GameSummary {
            game_pk: pk,
            season: season.map(String::from),
            official_date: Some(date.to_string()),
            status: Some(GameStatus {
                abstract_game_state: Some("Final".into()),
                ..Default::default()
            }),
            ..Default::default()
        }
    }

    #[test]
    fn season_comes_from_the_api_field() {
        // A postseason game in late October still belongs to its own season file.
        let g = game(1, Some("2026"), "2026-10-28");
        assert_eq!(season_of(&g), "2026");
    }

    #[test]
    fn season_falls_back_to_the_date_year_when_absent() {
        let g = game(1, None, "2026-04-02");
        assert_eq!(season_of(&g), "2026");
    }

    #[test]
    fn upsert_updates_in_place_rather_than_duplicating() {
        let mut log = HistoryLog::default();
        upsert(&mut log, HistoryEntry::from_summary(&game(101, Some("2026"), "2026-05-01")));
        upsert(&mut log, HistoryEntry::from_summary(&game(101, Some("2026"), "2026-05-01")));
        assert_eq!(log.entries.len(), 1);
    }

    #[test]
    fn upsert_preserves_the_saved_flag() {
        let mut log = HistoryLog::default();
        upsert(&mut log, HistoryEntry::from_summary(&game(101, Some("2026"), "2026-05-01")));
        log.entries[0].saved = true;

        // A re-log from the schedule endpoint carries saved:false and must not clear it.
        upsert(&mut log, HistoryEntry::from_summary(&game(101, Some("2026"), "2026-05-01")));
        assert!(log.entries[0].saved, "a schedule refresh erased the snapshot flag");
    }

    #[test]
    fn entries_stay_sorted_by_date() {
        let mut log = HistoryLog::default();
        upsert(&mut log, HistoryEntry::from_summary(&game(3, Some("2026"), "2026-07-01")));
        upsert(&mut log, HistoryEntry::from_summary(&game(1, Some("2026"), "2026-04-01")));
        upsert(&mut log, HistoryEntry::from_summary(&game(2, Some("2026"), "2026-05-01")));
        let dates: Vec<_> = log.entries.iter().map(|e| e.game_date.clone().unwrap()).collect();
        assert_eq!(dates, vec!["2026-04-01", "2026-05-01", "2026-07-01"]);
    }
}
