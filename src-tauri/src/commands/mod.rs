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

/// Today's date in the local timezone, as `YYYY-MM-DD`.
///
/// Local, not UTC: a 7pm Pacific first pitch is already "tomorrow" in UTC, which would
/// make the game list empty for exactly the people most likely to be watching.
pub fn today_local() -> String {
    chrono::Local::now().format("%Y-%m-%d").to_string()
}
