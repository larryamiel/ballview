//! Tauri commands — the entire Rust→frontend surface.
//!
//! Commands are thin: they resolve state, delegate to `mlb` or `storage`, and return.
//! Any logic worth testing lives in those modules, which need no Tauri runtime.

pub mod favorites;
pub mod games;
pub mod history;
pub mod live;
pub mod media;
pub mod schedule;

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
