//! History log commands, including the startup backfill.

use tauri::{AppHandle, State};

use super::{today_local, AppState};
use crate::error::Result;
use crate::mlb;
use crate::storage::{config, history::{self, HistoryLog}};

/// Cap on how far back a single backfill will scan.
///
/// Without a cap, opening the app after a long break would fire a schedule request
/// spanning months. 30 days covers any realistic absence during a season; anything older
/// is a gap the user can fill by browsing to the date directly.
const MAX_BACKFILL_DAYS: i64 = 30;

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

/// Bring the favorited team's log up to date.
///
/// Called on app open. Scans from the day after the newest logged game through today,
/// capped at `MAX_BACKFILL_DAYS`, and upserts everything found — so games that finished
/// while the app was closed still land in the log.
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

    let today = chrono::Local::now().date_naive();
    let earliest = today - chrono::Duration::days(MAX_BACKFILL_DAYS);

    // Start the day after the last game already on file, so a completed game is not
    // re-fetched, but an in-progress one that has since finished still gets refreshed.
    let start = history::latest_logged_date(&app, team_id)?
        .and_then(|d| chrono::NaiveDate::parse_from_str(&d, "%Y-%m-%d").ok())
        .map(|d| d.max(earliest))
        .unwrap_or(earliest);

    if start > today {
        return Ok(0);
    }

    let games = mlb::fetch_schedule_range(
        &state.client,
        &start.format("%Y-%m-%d").to_string(),
        &today_local(),
        Some(team_id),
    )
    .await?;

    history::record_games(&app, team_id, &games)
}

/// The season ballview considers current.
///
/// The calendar year is the right answer for the *current* season specifically: a season
/// never spans a New Year, so "the season happening now" and "this year" always agree.
/// This is not a shortcut around the season-key rule — per-game filing still reads the
/// API's `season` field (see `storage::history::season_of`).
fn current_season() -> String {
    chrono::Local::now().format("%Y").to_string()
}
