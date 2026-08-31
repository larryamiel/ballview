//! Everything that talks to an MLB server lives under this module.
//!
//! Per CLAUDE.md: no HTTP anywhere else in the crate, and no MLB URL outside
//! `endpoints.rs`. When the API breaks, the blast radius is this directory.

pub mod client;
pub mod endpoints;
pub mod models;
pub mod savant;

use crate::error::Result;
use client::MlbClient;
use models::*;

pub async fn fetch_teams(client: &MlbClient) -> Result<Vec<Team>> {
    let resp: TeamsResponse = client.get_json(&endpoints::teams()).await?;
    let mut teams = resp.teams;
    // The API returns teams in id order; the UI wants them alphabetical.
    teams.sort_by(|a, b| {
        a.name
            .as_deref()
            .unwrap_or("")
            .cmp(b.name.as_deref().unwrap_or(""))
    });
    Ok(teams)
}

pub async fn fetch_schedule(
    client: &MlbClient,
    date: &str,
    team_id: Option<u32>,
) -> Result<Vec<GameSummary>> {
    let resp: ScheduleResponse = client.get_json(&endpoints::schedule(date, team_id)).await?;
    Ok(flatten_dates(resp))
}

pub async fn fetch_schedule_range(
    client: &MlbClient,
    start: &str,
    end: &str,
    team_id: Option<u32>,
) -> Result<Vec<GameSummary>> {
    let resp: ScheduleResponse = client
        .get_json(&endpoints::schedule_range(start, end, team_id))
        .await?;
    Ok(flatten_dates(resp))
}

/// The schedule nests games under one entry per date; ballview wants a flat list.
fn flatten_dates(resp: ScheduleResponse) -> Vec<GameSummary> {
    resp.dates.into_iter().flat_map(|d| d.games).collect()
}

pub async fn fetch_live_feed(client: &MlbClient, game_pk: i64) -> Result<LiveFeed> {
    client.get_json(&endpoints::live_feed(game_pk)).await
}

pub async fn fetch_boxscore(client: &MlbClient, game_pk: i64) -> Result<Boxscore> {
    client.get_json(&endpoints::boxscore(game_pk)).await
}

pub async fn fetch_linescore(client: &MlbClient, game_pk: i64) -> Result<Linescore> {
    client.get_json(&endpoints::linescore(game_pk)).await
}

/// Fetch the content feed and flatten it into a plain list of playable highlights.
pub async fn fetch_highlights(client: &MlbClient, game_pk: i64) -> Result<Vec<Highlight>> {
    let content: GameContent = client.get_json(&endpoints::game_content(game_pk)).await?;
    Ok(flatten_highlights(content))
}

/// Collect clips from every place MLB hides them, de-duplicated by id.
///
/// Clips appear under `highlights.highlights.items`, `highlights.live.items`, and the
/// `media.epgAlternate[].items` sections, with heavy overlap between them. Which one is
/// populated varies by game state, so all are read and the union is returned.
pub fn flatten_highlights(content: GameContent) -> Vec<Highlight> {
    let mut items: Vec<ContentItem> = Vec::new();

    if let Some(h) = content.highlights {
        if let Some(inner) = h.highlights {
            items.extend(inner.items);
        }
        if let Some(live) = h.live {
            items.extend(live.items);
        }
    }
    if let Some(media) = content.media {
        for section in media.epg_alternate.into_iter().chain(media.epg) {
            items.extend(section.items);
        }
    }

    let mut seen = std::collections::HashSet::new();
    let mut out = Vec::new();
    for item in items {
        // Fall back to the slug, then the title, so a clip with no id is still listed
        // once rather than duplicated on every pass.
        let id = item
            .id
            .clone()
            .or_else(|| item.slug.clone())
            .or_else(|| item.title.clone())
            .unwrap_or_default();
        if id.is_empty() || !seen.insert(id.clone()) {
            continue;
        }
        out.push(Highlight {
            id,
            title: item
                .title
                .or_else(|| item.blurb.clone())
                .unwrap_or_else(|| "Untitled highlight".to_string()),
            description: item.description.or(item.blurb),
            duration: item.duration,
            date: item.date,
            url: best_playback(&item.playbacks),
            thumbnail: best_thumbnail(item.image.as_ref()),
        });
    }
    out
}

/// Pick the most playable mp4 from a clip's playback list.
///
/// MLB mixes HLS manifests, Flash-era renditions, and plain mp4s in one array. A
/// `<video>` tag in the webview can only take the mp4s, so anything else is discarded
/// outright — returning `None` (and rendering "no clip available") beats handing the
/// player a URL it will fail on.
fn best_playback(playbacks: &[Playback]) -> Option<String> {
    let mp4s: Vec<&Playback> = playbacks
        .iter()
        .filter(|p| {
            p.url
                .as_deref()
                .map(|u| u.split('?').next().unwrap_or(u).ends_with(".mp4"))
                .unwrap_or(false)
        })
        .collect();

    // `mp4Avc` is MLB's canonical H.264 rendition and the safest bet in the webview.
    if let Some(p) = mp4s
        .iter()
        .find(|p| p.name.as_deref() == Some("mp4Avc"))
    {
        return p.url.clone();
    }

    // Otherwise take the widest rendition, since width is a string that may not parse.
    mp4s.iter()
        .max_by_key(|p| {
            p.width
                .as_deref()
                .and_then(|w| w.parse::<i64>().ok())
                .unwrap_or(0)
        })
        .and_then(|p| p.url.clone())
}

fn best_thumbnail(image: Option<&ContentImage>) -> Option<String> {
    let cuts = &image?.cuts;
    cuts.iter()
        .filter(|c| c.src.is_some())
        // Around 640px wide: big enough for a list row, small enough not to stall it.
        .min_by_key(|c| (c.width.unwrap_or(0) - 640).abs())
        .and_then(|c| c.src.clone())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn best_playback_prefers_mp4avc() {
        let playbacks = vec![
            Playback {
                name: Some("hlsCloud".into()),
                url: Some("https://example.com/master.m3u8".into()),
                width: Some("1920".into()),
                height: None,
            },
            Playback {
                name: Some("mp4Avc".into()),
                url: Some("https://cuts.diamond.mlb.com/clip.mp4".into()),
                width: Some("1280".into()),
                height: None,
            },
        ];
        assert_eq!(
            best_playback(&playbacks).as_deref(),
            Some("https://cuts.diamond.mlb.com/clip.mp4")
        );
    }

    #[test]
    fn best_playback_ignores_non_mp4() {
        let playbacks = vec![Playback {
            name: Some("hlsCloud".into()),
            url: Some("https://example.com/master.m3u8".into()),
            width: Some("1920".into()),
            height: None,
        }];
        assert_eq!(best_playback(&playbacks), None);
    }

    #[test]
    fn best_playback_falls_back_to_widest_mp4() {
        let playbacks = vec![
            Playback {
                name: Some("small".into()),
                url: Some("https://example.com/a.mp4".into()),
                width: Some("640".into()),
                height: None,
            },
            Playback {
                name: Some("large".into()),
                url: Some("https://example.com/b.mp4".into()),
                width: Some("1920".into()),
                height: None,
            },
        ];
        assert_eq!(
            best_playback(&playbacks).as_deref(),
            Some("https://example.com/b.mp4")
        );
    }

    #[test]
    fn highlights_are_deduplicated_across_sections() {
        let json = r#"{
            "highlights": { "highlights": { "items": [
                {"id": "abc", "title": "Homer", "playbacks": [
                    {"name": "mp4Avc", "url": "https://x/1.mp4", "width": "1280"}]}
            ]}},
            "media": { "epgAlternate": [ { "title": "Game Highlights", "items": [
                {"id": "abc", "title": "Homer", "playbacks": []},
                {"id": "def", "title": "Double", "playbacks": []}
            ]}]}
        }"#;
        let content: GameContent = serde_json::from_str(json).unwrap();
        let out = flatten_highlights(content);
        assert_eq!(out.len(), 2);
        // The first occurrence wins, so the one carrying a real mp4 is kept.
        assert_eq!(out[0].url.as_deref(), Some("https://x/1.mp4"));
    }

    #[test]
    fn unknown_fields_do_not_break_parsing() {
        // Guards the permissive-model rule: an upstream addition must not be fatal.
        let json = r#"{"gamePk": 1, "brandNewField": {"nested": true}}"#;
        let feed: LiveFeed = serde_json::from_str(json).unwrap();
        assert_eq!(feed.game_pk, Some(1));
    }
}

/// Today's games as MLB defines "today" (see `endpoints::schedule_today`).
pub async fn fetch_schedule_today(
    client: &MlbClient,
    team_id: Option<u32>,
) -> Result<Vec<GameSummary>> {
    let resp: ScheduleResponse = client
        .get_json(&endpoints::schedule_today(team_id))
        .await?;
    Ok(flatten_dates(resp))
}
