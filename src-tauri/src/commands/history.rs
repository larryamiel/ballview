//! History log commands, including the startup backfill.

use tauri::{AppHandle, State};

use super::AppState;
use crate::error::Result;
use crate::mlb;
use crate::storage::{config, history::{self, HistoryLog}};

/// The date range one season's schedule spans.
///
/// The calendar year, not the regular season: spring training starts in February and a
/// World Series can run into November, and both belong to the club's schedule. A season
/// never crosses a New Year, so the year is a safe bound at both ends.
fn season_bounds(season: &str) -> (String, String) {
    (format!("{season}-01-01"), format!("{season}-12-31"))
}

#[tauri::command]
pub fn get_history(app: AppHandle, team_id: u32, season: Option<String>) -> Result<HistoryLog> {
    let season = match season {
        Some(s) => s,
        None => current_season(),
    };
    history::load(&app, team_id, &season)
}

/// List the seasons that have a log file for this team, newest first.
#[tauri::command]
pub fn get_history_seasons(app: AppHandle, team_id: u32) -> Result<Vec<String>> {
    use crate::storage::paths;

    let root = paths::app_root(&app)?.join("history");
    if !root.exists() {
        return Ok(Vec::new());
    }

    let mut seasons = Vec::new();
    for entry in std::fs::read_dir(&root)? {
        let entry = entry?;
        if !entry.file_type()?.is_dir() {
            continue;
        }
        if entry.path().join(format!("{team_id}.json")).exists() {
            if let Some(name) = entry.file_name().to_str() {
                seasons.push(name.to_string());
            }
        }
    }
    seasons.sort_by(|a, b| b.cmp(a));
    Ok(seasons)
}

/// Bring the favorited team's log up to date, **including games not yet played**.
///
/// Called on app open. The log is the club's schedule, not only its results: a follower
/// wants to know when the next home stand starts as much as how the last one went, and a
/// log that stops at today cannot answer that. So the whole season is read in one
/// request and every game upserted — a finished one carries its score, an unplayed one
/// carries `is_final: false` and a first-pitch time, which is the shape an in-progress
/// game already had.
///
/// Re-reading the whole season on each refresh rather than only the days since the last
/// logged game is what keeps a postponement, a rescheduled makeup and a new result all
/// correct without a separate rule for each: the response is the truth, and the upsert
/// is idempotent.
#[tauri::command]
pub async fn refresh_history(
    app: AppHandle,
    state: State<'_, AppState>,
    team_id: Option<u32>,
) -> Result<usize> {
    let team_id = match team_id.or(config::load(&app)?.favorite_team()) {
        Some(id) => id,
        // No favorite set yet: nothing to log, and not an error.
        None => return Ok(0),
    };

    // The whole season in one request, forwards as well as backwards. There is no
    // incremental window any more: a season is one response, and re-reading it is what
    // keeps a postponement, a rescheduled makeup and a new result all correct without
    // three separate rules for them.
    let (start, end) = season_bounds(&current_season());

    let games =
        mlb::fetch_schedule_range(&state.client, &start, &end, Some(team_id)).await?;

    history::record_games(&app, team_id, &games)
}

/// The season ballview considers current.
///
/// The calendar year is the right answer for the *current* season specifically: a season
/// never spans a New Year, so "the season happening now" and "this year" always agree.
/// This is not a shortcut around the season-key rule — per-game filing still reads the
/// API's `season` field (see `storage::history::season_of`).
fn current_season() -> String {
    chrono::Utc::now()
        .with_timezone(&chrono_tz::America::New_York)
        .format("%Y")
        .to_string()
}
