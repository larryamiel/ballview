//! Tauri commands — the entire Rust→frontend surface.
//!
//! Commands are thin: they resolve state, delegate to `mlb` or `storage`, and return.
//! Any logic worth testing lives in those modules, which need no Tauri runtime.

pub mod charts;
pub mod favorites;
pub mod games;
pub mod history;
pub mod live;
pub mod media;
pub mod news;
pub mod plays;
pub mod schedule;
pub mod spotlight;
pub mod stats;

use crate::mlb::client::MlbClient;

/// Shared application state, built once at startup and managed by Tauri.
pub struct AppState {
    pub client: MlbClient,
}

impl AppState {
    pub fn new() -> crate::error::Result<Self> {
        Ok(Self {
            client: MlbClient::new()?,
        })
    }
}

/// Today's date on MLB's calendar, as `YYYY-MM-DD`.
///
/// **Not** the machine's local date. A baseball "day" is a US concept: the slate for
/// Aug 31 is the one MLB lists under Aug 31, regardless of where the viewer sits. On a
/// machine at UTC+8, local midnight arrives while the US evening games are still being
/// played, so a local date would show the *next* day's schedule — an empty Preview list —
/// for most of the viewer's waking hours.
///
/// US Eastern is the anchor because that is what MLB itself uses to bucket a game day.
/// A late West Coast game running past midnight ET keeps the earlier `officialDate` in
/// the API, so it stays on the day it belongs to.
pub fn today_mlb() -> String {
    chrono::Utc::now()
        .with_timezone(&chrono_tz::America::New_York)
        .format("%Y-%m-%d")
        .to_string()
}

/// The season to ask for, defaulting to the one now in progress.
///
/// Derived from US Eastern like every other date in the app: on a machine east of UTC a
/// local new year arrives while the previous season's playoffs are still being played.
pub fn season_or_current(season: Option<String>) -> String {
    season.unwrap_or_else(|| {
        chrono::Utc::now()
            .with_timezone(&chrono_tz::America::New_York)
            .format("%Y")
            .to_string()
    })
}

/// How far back to look for the last day baseball was played, in season.
///
/// Two weeks clears the All-Star break, the longest scheduled gap in the calendar.
const RECENT_SLATE_DAYS: i64 = 14;
/// The wider sweep, used only when the first finds nothing — i.e. the offseason, where
/// the answer is last autumn's final game.
const OFFSEASON_SLATE_DAYS: i64 = 150;

/// The most recent date on which an MLB game finished, as `YYYY-MM-DD`.
///
/// Every "recent form" view needs this, not `today_mlb()`. A day window over today is
/// empty for most of the viewer's waking hours — the US slate has not been played yet —
/// so a leaderboard anchored on today shows nobody until late at night, which reads as a
/// broken feature rather than as an empty day.
///
/// Falls back to today when even the wide sweep comes back empty: better to rank an
/// empty day than to fail the whole request over a schedule call.
pub async fn last_completed_slate(client: &crate::mlb::client::MlbClient) -> String {
    let today = today_mlb();
    for span in [RECENT_SLATE_DAYS, OFFSEASON_SLATE_DAYS] {
        let start = shift_days(&today, -span).unwrap_or_else(|| today.clone());
        if let Ok(Some(date)) = crate::mlb::fetch_last_played_date(client, &start, &today).await {
            return date;
        }
    }
    today
}

/// Move a `YYYY-MM-DD` date by whole days, or `None` if it does not parse.
pub fn shift_days(date: &str, days: i64) -> Option<String> {
    let parsed = chrono::NaiveDate::parse_from_str(date, "%Y-%m-%d").ok()?;
    Some(
        (parsed + chrono::Duration::days(days))
            .format("%Y-%m-%d")
            .to_string(),
    )
}

/// The season a date belongs to — its year, which is the season key for every MLB game.
pub fn season_of_date(date: &str) -> Option<String> {
    date.get(0..4)
        .filter(|y| y.chars().all(|c| c.is_ascii_digit()))
        .map(str::to_string)
}
