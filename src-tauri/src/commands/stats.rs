//! Player statistics: leaderboards over a season, a date range, or the last N games.

use serde::Deserialize;
use tauri::State;

use super::{today_mlb, AppState};
use crate::error::{Error, Result};
use crate::mlb::{
    self,
    models::{Person, PlayerStatRow},
};

/// How much of the season to measure. One shape per MLB `stats` type.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", tag = "kind")]
pub enum StatRange {
    /// The whole season.
    Season,
    /// An inclusive `YYYY-MM-DD` window.
    DateRange { start: String, end: String },
    /// Each player's own last N games, which is not the same as a date window: a club
    /// that had two off-days reaches ten games further back on the calendar than one
    /// that did not, and MLB resolves that per player.
    LastGames { games: u32 },
}

/// Only these may be passed through as `sortStat`.
///
/// The value lands in a URL sent to a third-party API, so it is checked against the set
/// the UI actually offers rather than forwarded verbatim. An unknown key is dropped and
/// MLB applies its own default ordering — a worse sort, never a broken request.
const SORTABLE: &[&str] = &[
    // Hitting
    "gamesPlayed", "plateAppearances", "atBats", "runs", "hits", "doubles", "triples",
    "homeRuns", "rbi", "baseOnBalls", "strikeOuts", "stolenBases", "avg", "obp", "slg",
    "ops", "totalBases", "babip",
    // Pitching
    "gamesStarted", "inningsPitched", "wins", "losses", "saves", "era", "whip",
    "battersFaced", "earnedRuns", "strikeoutsPer9Inn", "walksPer9Inn", "hitsPer9Inn",
    "homeRunsPer9", "strikeoutWalkRatio", "strikePercentage",
];

fn sanitize_sort(sort: Option<&str>) -> Option<&str> {
    sort.filter(|s| SORTABLE.contains(s))
}

/// A leaderboard of players for one range.
///
/// `group` is `hitting` or `pitching`; the two are deliberately separate requests
/// because a combined table would be mostly empty cells — an ERA column means nothing
/// for a shortstop.
#[tauri::command]
pub async fn get_player_stats(
    state: State<'_, AppState>,
    group: String,
    range: StatRange,
    season: Option<String>,
    sort_stat: Option<String>,
    order: Option<String>,
    limit: Option<u32>,
    qualified: Option<bool>,
) -> Result<Vec<PlayerStatRow>> {
    if group != "hitting" && group != "pitching" {
        return Err(Error::storage(format!("unknown stat group: {group}")));
    }

    // The season is MLB's calendar year, not the machine's — see `today_mlb`.
    let season = season.unwrap_or_else(|| today_mlb()[..4].to_string());
    let order = match order.as_deref() {
        Some("asc") => "asc",
        _ => "desc",
    };
    let sort = sanitize_sort(sort_stat.as_deref());
    // Enough to hold the whole league without paging; the table filters client-side.
    let limit = limit.unwrap_or(400).min(1000);
    // Qualified by default: an unqualified leaderboard sorted by a rate stat is topped
    // by players with a handful of plate appearances, which is not what a leaderboard
    // is for. The caller can ask for everyone when it wants the full pool.
    let pool = if qualified.unwrap_or(true) { "Qualified" } else { "All" };

    let (kind, start, end, games) = match &range {
        StatRange::Season => ("season", None, None, None),
        StatRange::DateRange { start, end } => {
            ("byDateRange", Some(start.as_str()), Some(end.as_str()), None)
        }
        StatRange::LastGames { games } => ("lastXGames", None, None, Some(*games)),
    };

    mlb::fetch_player_stats(
        &state.client,
        kind,
        &group,
        &season,
        pool,
        limit,
        sort,
        Some(order),
        start,
        end,
        games,
    )
    .await
}

/// One player's biographical record, for the preview card.
#[tauri::command]
pub async fn get_person(state: State<'_, AppState>, person_id: i64) -> Result<Person> {
    mlb::fetch_person(&state.client, person_id).await
}
