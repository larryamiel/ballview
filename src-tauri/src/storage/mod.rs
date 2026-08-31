//! File-based persistence. There is no database, by design (see CLAUDE.md).

pub mod config;
pub mod game_files;
pub mod history;
pub mod paths;

use std::path::Path;

use serde::{de::DeserializeOwned, Serialize};

use crate::error::Result;

/// Read and deserialize a JSON file, returning `T::default()` if it is missing *or* if
/// its contents no longer parse.
///
/// Tolerating a corrupt file is deliberate: a truncated write from a hard shutdown, or a
/// struct that gained a required field, should degrade to "empty" rather than bricking
/// the feature with no in-app way to recover.
pub fn read_json_or_default<T: DeserializeOwned + Default>(path: &Path) -> Result<T> {
    match std::fs::read_to_string(path) {
        Ok(text) => Ok(serde_json::from_str(&text).unwrap_or_default()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(T::default()),
        Err(e) => Err(e.into()),
    }
}

/// Read and deserialize a JSON file, returning `None` when it does not exist.
/// Unlike `read_json_or_default`, a corrupt file here is a real error worth surfacing.
pub fn read_json_opt<T: DeserializeOwned>(path: &Path) -> Result<Option<T>> {
    match std::fs::read_to_string(path) {
        Ok(text) => Ok(Some(serde_json::from_str(&text)?)),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(e.into()),
    }
}

/// Serialize to a sibling temp file, then rename over the target.
///
/// `rename` is atomic within a volume on Windows and POSIX alike, so a crash mid-write
/// leaves the previous file intact instead of a half-written one. Writing history and
/// snapshots in place would risk losing a season log to a bad shutdown.
pub fn atomic_write_json<T: Serialize>(path: &Path, value: &T) -> Result<()> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let json = serde_json::to_string_pretty(value)?;

    let tmp = path.with_extension("json.tmp");
    std::fs::write(&tmp, json.as_bytes())?;
    // `fs::rename` replaces an existing destination on Windows too (MOVEFILE_REPLACE_EXISTING),
    // so the old file is swapped out in one step. Deleting it first would open a window
    // where the file is absent, which is exactly what this function exists to avoid.
    std::fs::rename(&tmp, path)?;
    Ok(())
}
