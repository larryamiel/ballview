//! Crate-wide error type.
//!
//! Every Tauri command returns `Result<T, Error>`; `Error` serializes to a plain
//! string so the frontend receives a readable message rather than an opaque object.

use serde::{Serialize, Serializer};

#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error("network request failed: {0}")]
    Http(#[from] reqwest::Error),

    #[error("MLB API returned {status} for {url}")]
    ApiStatus { status: u16, url: String },

    #[error("could not parse the MLB response: {0}")]
    Parse(String),

    #[error("file error: {0}")]
    Io(#[from] std::io::Error),

    #[error("could not read or write JSON: {0}")]
    Json(#[from] serde_json::Error),

    #[error("{0}")]
    Storage(String),

    #[error("no game found for gamePk {0}")]
    GameNotFound(i64),

    #[error("{0}")]
    Other(String),
}

impl Error {
    pub fn other(msg: impl Into<String>) -> Self {
        Error::Other(msg.into())
    }

    pub fn storage(msg: impl Into<String>) -> Self {
        Error::Storage(msg.into())
    }
}

impl From<tauri::Error> for Error {
    fn from(e: tauri::Error) -> Self {
        Error::Other(e.to_string())
    }
}

/// Serialize as the human-readable message so `invoke()` rejects with a useful string.
impl Serialize for Error {
    // Fully qualified: the `Result<T>` alias below shadows the two-parameter std Result.
    fn serialize<S: Serializer>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error> {
        serializer.serialize_str(&self.to_string())
    }
}

pub type Result<T> = std::result::Result<T, Error>;
