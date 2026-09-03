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

/// The Savant video of one pitch, by the live feed's `playId`.
///
/// `None` means Savant has no video for that pitch, which is an ordinary answer — an
/// untracked pitch, or a game too old or too new to have been cut — not a failure. The
/// mp4 URL is resolved here rather than in the webview because it has to be scraped out
/// of an HTML page, and because the host it points at then has to be checked before
/// anything is handed to a `<video>` tag.
#[tauri::command]
pub async fn get_pitch_clip(state: State<'_, AppState>, play_id: String) -> Result<Option<String>> {
    // `play_id` is interpolated into a URL, so it is validated as the UUID the feed
    // always sends rather than trusted. Anything else would let a caller point the
    // request at another Savant path entirely.
    if !is_play_id(&play_id) {
        return Err(Error::other(format!("not a play id: {play_id}")));
    }
    crate::mlb::savant::fetch_pitch_clip(&state.client, &play_id).await
}

/// A 36-character `8-4-4-4-12` hex UUID, the only shape `playId` ever takes.
fn is_play_id(id: &str) -> bool {
    let groups = [8, 4, 4, 4, 12];
    let mut parts = id.split('-');
    for len in groups {
        let Some(part) = parts.next() else {
            return false;
        };
        if part.len() != len || !part.chars().all(|c| c.is_ascii_hexdigit()) {
            return false;
        }
    }
    parts.next().is_none()
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
///
/// Taken from a real content feed, not from documentation: the Phase 1 spike found that
/// `cuts.diamond.mlb.com` (which CLAUDE.md cited) appears in zero playback URLs, while
/// three other hosts carry all of them. Keep this list and the `media-src` directive in
/// `tauri.conf.json` in sync — a host missing from either one means a clip that silently
/// will not play or will not download. `tests/fixtures.rs` asserts the fixture's hosts
/// are all covered here.
fn is_allowed_media_url(url: &str) -> bool {
    const ALLOWED_HOSTS: &[&str] = &[
        "mlb-cuts-diamond.mlb.com",
        "darkroom-clips.mlb.com",
        "bdata-producedclips.mlb.com",
        // Retained: MLB has served clips from this host historically and may again.
        "cuts.diamond.mlb.com",
        // Savant's per-pitch clips, resolved by `get_pitch_clip`.
        crate::mlb::savant::CLIP_HOST,
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
        assert!(is_allowed_media_url("https://mlb-cuts-diamond.mlb.com/a/b.mp4"));
        assert!(is_allowed_media_url("https://darkroom-clips.mlb.com/a/b.mp4"));
        assert!(is_allowed_media_url(
            "https://bdata-producedclips.mlb.com/x.mp4"
        ));
    }

    #[test]
    fn accepts_the_savant_clip_host() {
        assert!(is_allowed_media_url(
            "https://sporty-clips.mlb.com/QXdhazNf.mp4"
        ));
    }

    #[test]
    fn play_ids_must_be_uuids() {
        use super::is_play_id;
        assert!(is_play_id("09540723-2bd4-361e-9c95-99f681faaa6b"));
        // A traversal or a query tacked on would otherwise reshape the Savant URL.
        assert!(!is_play_id("09540723-2bd4-361e-9c95-99f681faaa6b&x=1"));
        assert!(!is_play_id("../../gf?game_pk=1"));
        assert!(!is_play_id("09540723-2bd4-361e-9c95"));
        assert!(!is_play_id("09540723-2bd4-361e-9c95-99f681faaa6z"));
        assert!(!is_play_id(""));
    }

    #[test]
    fn rejects_lookalike_and_insecure_hosts() {
        assert!(!is_allowed_media_url(
            "https://mlb-cuts-diamond.mlb.com.attacker.tld/x.mp4"
        ));
        assert!(!is_allowed_media_url("https://attacker.tld/x.mp4"));
        assert!(!is_allowed_media_url("http://mlb-cuts-diamond.mlb.com/x.mp4"));
        assert!(!is_allowed_media_url("file:///C:/windows/system32/x"));
    }
}
