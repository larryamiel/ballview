//! Highlight clip downloads (Feature 7).

use tauri::{AppHandle, State};
use tokio::io::AsyncWriteExt;

use super::AppState;
use crate::error::{Error, Result};
use crate::storage::{game_files, paths};

/// Refuse anything larger than this. A highlight is seconds long; a multi-hundred-MB
/// response means the URL is not what we think it is.
const MAX_CLIP_BYTES: u64 = 512 * 1024 * 1024;

/// Stream a clip to `media/{gamePk}/{clipId}.mp4`.
///
/// Streamed rather than buffered so a large clip never sits entirely in memory, and
/// written to a `.part` file first so an interrupted download is not mistaken for a
/// complete one on the next run.
#[tauri::command]
pub async fn download_highlight(
    app: AppHandle,
    state: State<'_, AppState>,
    game_pk: i64,
    clip_id: String,
    url: String,
) -> Result<String> {
    // Only ever fetch MLB's own media hosts: `url` reaches us from an API response, and
    // this command otherwise writes an arbitrary remote file to disk.
    if !is_allowed_media_url(&url) {
        return Err(Error::other(format!(
            "refusing to download from an unexpected host: {url}"
        )));
    }

    let dir = paths::media_dir(&app, game_pk)?;
    tokio::fs::create_dir_all(&dir).await?;
    let dest = paths::media_file(&app, game_pk, &clip_id)?;
    let part = dest.with_extension("mp4.part");

    let resp = state.client.inner().get(&url).send().await?;
    if !resp.status().is_success() {
        return Err(Error::ApiStatus {
            status: resp.status().as_u16(),
            url,
        });
    }

    if let Some(len) = resp.content_length() {
        if len > MAX_CLIP_BYTES {
            return Err(Error::other(format!(
                "clip is {len} bytes, which exceeds the {MAX_CLIP_BYTES} byte limit"
            )));
        }
    }

    let mut file = tokio::fs::File::create(&part).await?;
    let mut written: u64 = 0;
    let mut stream = resp.bytes_stream();

    use futures_util::StreamExt;
    while let Some(chunk) = stream.next().await {
        let chunk = chunk?;
        written += chunk.len() as u64;
        if written > MAX_CLIP_BYTES {
            // Clean up rather than leaving a partial file behind.
            drop(file);
            let _ = tokio::fs::remove_file(&part).await;
            return Err(Error::other("clip exceeded the maximum download size"));
        }
        file.write_all(&chunk).await?;
    }
    file.flush().await?;
    drop(file);

    tokio::fs::rename(&part, &dest).await?;

    // Record the clip on the snapshot so a reopened game knows it has local media.
    if let Ok(mut snapshot) = game_files::load(&app, game_pk) {
        if !snapshot.local_clips.contains(&clip_id) {
            snapshot.local_clips.push(clip_id.clone());
            game_files::save(&app, &snapshot)?;
        }
    }

    Ok(dest.to_string_lossy().to_string())
}

/// Clip ids already downloaded for a game.
#[tauri::command]
pub fn list_local_clips(app: AppHandle, game_pk: i64) -> Result<Vec<String>> {
    let dir = paths::media_dir(&app, game_pk)?;
    if !dir.exists() {
        return Ok(Vec::new());
    }
    let mut out = Vec::new();
    for entry in std::fs::read_dir(&dir)? {
        let path = entry?.path();
        if path.extension().and_then(|e| e.to_str()) == Some("mp4") {
            if let Some(stem) = path.file_stem().and_then(|s| s.to_str()) {
                out.push(stem.to_string());
            }
        }
    }
    Ok(out)
}

#[tauri::command]
pub fn delete_local_clip(app: AppHandle, game_pk: i64, clip_id: String) -> Result<()> {
    let path = paths::media_file(&app, game_pk, &clip_id)?;
    if path.exists() {
        std::fs::remove_file(&path)?;
    }
    if let Ok(mut snapshot) = game_files::load(&app, game_pk) {
        snapshot.local_clips.retain(|c| c != &clip_id);
        game_files::save(&app, &snapshot)?;
    }
    Ok(())
}

/// Hosts MLB serves highlight mp4s from.
fn is_allowed_media_url(url: &str) -> bool {
    const ALLOWED_HOSTS: &[&str] = &[
        "cuts.diamond.mlb.com",
        "mlb-cuts-diamond.media.mlb.com",
        "sporty-clips.mlb.com",
    ];

    let Some(rest) = url.strip_prefix("https://") else {
        // Plain http is rejected outright, so a downgraded URL cannot slip through.
        return false;
    };
    let host = rest.split('/').next().unwrap_or("");
    // Compare the whole host, not a suffix: `evil-cuts.diamond.mlb.com.attacker.tld`
    // would pass a naive `ends_with` check.
    ALLOWED_HOSTS.contains(&host)
}

#[cfg(test)]
mod tests {
    use super::is_allowed_media_url;

    #[test]
    fn accepts_mlb_media_hosts() {
        assert!(is_allowed_media_url("https://cuts.diamond.mlb.com/a/b.mp4"));
        assert!(is_allowed_media_url(
            "https://mlb-cuts-diamond.media.mlb.com/x.mp4"
        ));
    }

    #[test]
    fn rejects_lookalike_and_insecure_hosts() {
        assert!(!is_allowed_media_url(
            "https://cuts.diamond.mlb.com.attacker.tld/x.mp4"
        ));
        assert!(!is_allowed_media_url("https://attacker.tld/x.mp4"));
        assert!(!is_allowed_media_url("http://cuts.diamond.mlb.com/x.mp4"));
        assert!(!is_allowed_media_url("file:///C:/windows/system32/x"));
    }
}
