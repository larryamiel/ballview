//! Data behind the player charts: game logs, windowed lines, and pitch velocity.
//!
//! The chart builder needs three different shapes and this is where each is sourced:
//! a dated series (the game log), a single windowed total per player (a scatter point),
//! and per-pitch release speed (Statcast, via Savant's CSV export).

use tauri::State;

use super::{season_or_current, AppState};
use crate::error::{Error, Result};
use crate::mlb::{
    self,
    models::{GameLogSplit, PitchSpeedPoint, PlayerRef, PlayerStatRow},
    savant,
};

/// One player's game-by-game line for a season, oldest first.
///
/// The whole season comes back in one request whatever window the chart is showing:
/// MLB has no per-window game log, and a season is at most 162 rows, which is cheaper
/// than a request per month and lets the granularity control re-bucket without refetching.
#[tauri::command]
pub async fn get_player_game_log(
    state: State<'_, AppState>,
    person_id: i64,
    group: String,
    season: Option<String>,
) -> Result<Vec<GameLogSplit>> {
    let group = validate_group(&group)?;
    let season = season_or_current(season);
    mlb::fetch_game_log(&state.client, person_id, group, &season).await
}

/// One player's totals over a date window — one point on a stat-versus-stat chart.
#[tauri::command]
pub async fn get_player_range(
    state: State<'_, AppState>,
    person_id: i64,
    group: String,
    start: String,
    end: String,
    season: Option<String>,
) -> Result<Option<PlayerStatRow>> {
    let group = validate_group(&group)?;
    let season = season_or_current(season);
    validate_date(&start)?;
    validate_date(&end)?;
    mlb::fetch_player_range(&state.client, person_id, group, &season, &start, &end).await
}

/// Players matching a search, for the comparison picker.
///
/// The whole roster list is fetched and filtered here rather than in the webview: it is
/// fourteen hundred names, and shipping all of them across the IPC boundary on every
/// keystroke would be worse than the request it saves.
#[tauri::command]
pub async fn search_players(
    state: State<'_, AppState>,
    query: String,
    season: Option<String>,
    limit: Option<usize>,
) -> Result<Vec<PlayerRef>> {
    let season = season_or_current(season);
    let all = mlb::fetch_sport_players(&state.client, &season).await?;
    let needle = query.trim().to_lowercase();
    let limit = limit.unwrap_or(30).min(200);

    if needle.is_empty() {
        return Ok(all.into_iter().take(limit).collect());
    }

    // Ranked, not merely filtered: someone typing "ohtani" wants Shohei Ohtani first,
    // not the first alphabetical player whose name happens to contain the letters.
    let mut matches: Vec<(u8, PlayerRef)> = all
        .into_iter()
        .filter_map(|p| {
            let name = p.full_name.to_lowercase();
            let last = name.rsplit(' ').next().unwrap_or("").to_string();
            let rank = if name.starts_with(&needle) {
                0
            } else if last.starts_with(&needle) {
                1
            } else if name.contains(&needle) {
                2
            } else if p
                .team_name
                .as_deref()
                .map(|t| t.to_lowercase().contains(&needle))
                .unwrap_or(false)
            {
                3
            } else {
                return None;
            };
            Some((rank, p))
        })
        .collect();

    matches.sort_by(|a, b| a.0.cmp(&b.0).then_with(|| a.1.full_name.cmp(&b.1.full_name)));
    Ok(matches.into_iter().take(limit).map(|(_, p)| p).collect())
}

/// Release speed per pitch type per day, for one pitcher over a window.
///
/// Savant, not the Stats API: MLB's own endpoints carry no velocity outside a live feed.
/// Degrades to an empty list rather than an error when Savant is unreachable, because
/// nothing else on the screen depends on it.
#[tauri::command]
pub async fn get_pitch_speeds(
    state: State<'_, AppState>,
    person_id: i64,
    start: String,
    end: String,
) -> Result<Vec<PitchSpeedPoint>> {
    validate_date(&start)?;
    validate_date(&end)?;
    Ok(
        savant::fetch_pitch_speeds(&state.client, person_id, &start, &end)
            .await
            .unwrap_or_default(),
    )
}

/// `hitting` or `pitching` — the value is interpolated into a URL.
fn validate_group(group: &str) -> Result<&'static str> {
    match group {
        "hitting" => Ok("hitting"),
        "pitching" => Ok("pitching"),
        other => Err(Error::other(format!("unknown stat group: {other}"))),
    }
}

/// `YYYY-MM-DD`, checked because it reaches a third-party URL.
pub fn validate_date(date: &str) -> Result<()> {
    let ok = date.len() == 10
        && date.as_bytes()[4] == b'-'
        && date.as_bytes()[7] == b'-'
        && date
            .bytes()
            .enumerate()
            .all(|(i, b)| if i == 4 || i == 7 { b == b'-' } else { b.is_ascii_digit() });
    if ok {
        Ok(())
    } else {
        Err(Error::other(format!("not a date: {date}")))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn dates_must_be_iso() {
        assert!(validate_date("2026-08-01").is_ok());
        assert!(validate_date("2026-8-1").is_err());
        assert!(validate_date("2026-08-01&x=1").is_err());
        assert!(validate_date("").is_err());
    }

    #[test]
    fn only_the_two_real_groups_pass() {
        assert!(validate_group("hitting").is_ok());
        assert!(validate_group("pitching").is_ok());
        assert!(validate_group("fielding&x=1").is_err());
    }
}
