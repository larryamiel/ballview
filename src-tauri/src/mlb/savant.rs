//! Baseball Savant / Statcast enrichment (Phase 4b — optional, feature-flagged).
//!
//! This is a *separate* undocumented API from the Stats API, with its own host, its own
//! shapes, and its own failure modes, so it is kept out of `client.rs`. Nothing in the
//! app may depend on it: every caller must degrade to the Stats API views when this
//! returns `Err` or an empty set.

use std::collections::HashMap;

use serde::{Deserialize, Serialize};

use super::client::MlbClient;
use super::models::PitchSpeedPoint;
use super::endpoints;
use crate::error::Result;

/// One Statcast-measured pitch, keyed back to the Stats API by `play_id`.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct StatcastPitch {
    /// Matches `PlayEvent::play_id` in the live feed — the join key between the two APIs.
    #[serde(default)]
    pub play_id: Option<String>,
    #[serde(default)]
    pub pitch_type: Option<String>,
    #[serde(default)]
    pub start_speed: Option<f64>,
    /// Horizontal plate location, feet from centre.
    #[serde(default)]
    pub px: Option<f64>,
    /// Plate height, feet.
    #[serde(default)]
    pub pz: Option<f64>,
    #[serde(default)]
    pub hit_speed: Option<f64>,
    #[serde(default)]
    pub hit_angle: Option<f64>,
    #[serde(default)]
    pub hit_distance: Option<f64>,
    /// Batted-ball landing coordinates on the field diagram.
    #[serde(default)]
    pub hc_x: Option<f64>,
    #[serde(default)]
    pub hc_y: Option<f64>,
    #[serde(default)]
    pub inning: Option<i64>,
}

#[derive(Debug, Clone, Default, Deserialize)]
struct SavantGameFeed {
    #[serde(default)]
    team_home: Vec<StatcastPitch>,
    #[serde(default)]
    team_away: Vec<StatcastPitch>,
}

/// Statcast data for one game, indexed by `play_id` so the UI can look up a pitch in O(1).
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StatcastGame {
    pub game_pk: i64,
    /// Keyed by `play_id`. Pitches Savant did not measure are simply absent.
    pub pitches: HashMap<String, StatcastPitch>,
}

pub async fn fetch_statcast(client: &MlbClient, game_pk: i64) -> Result<StatcastGame> {
    let feed: SavantGameFeed = client.get_json(&endpoints::savant_game(game_pk)).await?;

    let mut pitches = HashMap::new();
    for p in feed.team_home.into_iter().chain(feed.team_away) {
        if let Some(id) = p.play_id.clone() {
            pitches.insert(id, p);
        }
    }

    Ok(StatcastGame { game_pk, pitches })
}

/// The host Savant serves single-pitch clips from.
///
/// Kept beside the extractor because it is the security boundary: the URL comes out of
/// a page ballview does not control, and is handed straight to a `<video>` tag.
pub const CLIP_HOST: &str = "sporty-clips.mlb.com";

/// The video of one pitch, if Savant has one.
///
/// Every tracked pitch of a completed game seems to have a clip — this is not only for
/// highlights — but the page answers 200 with no video for an id it does not know, so
/// "no clip" is a normal result rather than an error.
pub async fn fetch_pitch_clip(client: &MlbClient, play_id: &str) -> Result<Option<String>> {
    let html = client.get_text(&endpoints::savant_clip_page(play_id)).await?;
    Ok(extract_clip_url(&html))
}

/// Pull the mp4 out of the clip page's `<source src="…">`.
///
/// Deliberately a string scan rather than an HTML parse: one attribute is wanted from a
/// 90KB page, and a parser would be a dependency and a second thing to keep working when
/// Savant reflows its markup. The host check is what makes that safe — anything not on
/// `sporty-clips.mlb.com` is discarded rather than played.
pub fn extract_clip_url(html: &str) -> Option<String> {
    let marker = "https://sporty-clips.mlb.com/";
    let start = html.find(marker)?;
    let rest = &html[start..];
    // The URL ends at the quote closing the attribute; a newline or a space means the
    // markup is not what we expect, so stop there too rather than swallowing the page.
    let end = rest.find(['"', '\'', '<', ' ', '\n', '\r'])?;
    let url = decode_entities(&rest[..end]);

    // The base64-ish token is written into the page with its `=` padding escaped, so a
    // URL that still holds an entity means the decoding above missed a form of it.
    if !url.ends_with(".mp4") || url.contains('&') {
        return None;
    }
    if url_host(&url)? != CLIP_HOST {
        return None;
    }
    Some(url)
}

/// The handful of XML entities Savant escapes inside the URL — in practice only `=`.
fn decode_entities(raw: &str) -> String {
    raw.replace("&#x3D;", "=")
        .replace("&#61;", "=")
        .replace("&amp;", "&")
}

fn url_host(url: &str) -> Option<&str> {
    // https only: a downgraded URL would not play under the CSP anyway, and should not
    // reach the point where it might.
    url.strip_prefix("https://")?.split('/').next()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extracts_the_clip_url_and_decodes_its_padding() {
        // Shaped like the real page, including the escaped `=` padding.
        let html = r#"<video id="sporty"><source
            src="https://sporty-clips.mlb.com/QXdhazNfWGw0TUFRPT1fQmdoVVVGUVE&#x3D;&#x3D;.mp4"
            type="video/mp4" /></video>"#;
        assert_eq!(
            extract_clip_url(html).as_deref(),
            Some("https://sporty-clips.mlb.com/QXdhazNfWGw0TUFRPT1fQmdoVVVGUVE==.mp4")
        );
    }

    #[test]
    fn a_page_without_a_video_yields_nothing() {
        // What Savant returns for a playId it does not know: a 200 with no source.
        let html = "<div class=\"video-box\"><p>No video available</p></div>";
        assert_eq!(extract_clip_url(html), None);
    }

    #[test]
    fn rejects_a_url_on_another_host() {
        // The marker is what finds the URL, so a lookalike host cannot even be reached
        // by this extractor — but the check is asserted so it stays that way.
        let html = r#"<source src="https://sporty-clips.mlb.com.attacker.tld/x.mp4">"#;
        assert_eq!(extract_clip_url(html), None);
    }

    #[test]
    fn rejects_a_non_mp4() {
        let html = r#"<source src="https://sporty-clips.mlb.com/master.m3u8">"#;
        assert_eq!(extract_clip_url(html), None);
    }

    #[test]
    fn indexes_both_teams_by_play_id() {
        let json = r#"{
            "team_home": [{"play_id": "h1", "start_speed": 95.2, "pitch_type": "FF"}],
            "team_away": [{"play_id": "a1", "start_speed": 88.0, "pitch_type": "SL"}],
            "some_field_we_ignore": 42
        }"#;
        let feed: SavantGameFeed = serde_json::from_str(json).unwrap();
        assert_eq!(feed.team_home.len(), 1);
        assert_eq!(feed.team_away.len(), 1);
    }

    #[test]
    fn pitches_without_a_play_id_are_dropped() {
        // Without a play_id there is nothing to join against, so the row is useless.
        let json = r#"{"team_home": [{"start_speed": 95.2}], "team_away": []}"#;
        let feed: SavantGameFeed = serde_json::from_str(json).unwrap();
        assert!(feed.team_home[0].play_id.is_none());
    }
}

/* --- Release speed over time ------------------------------------------------ */

/// Average release speed per pitch type per day, for one pitcher over a window.
///
/// Savant's search export is CSV — the only public source of per-pitch velocity — and a
/// season of it is several thousand rows. It is folded down to one row per date and pitch
/// type here so the webview receives tens of points rather than thousands of pitches.
pub async fn fetch_pitch_speeds(
    client: &MlbClient,
    person_id: i64,
    start: &str,
    end: &str,
) -> Result<Vec<PitchSpeedPoint>> {
    let csv = client
        .get_text(&endpoints::savant_pitch_csv(person_id, start, end))
        .await?;
    Ok(aggregate_pitch_speeds(&csv))
}

/// Fold the export into daily averages.
///
/// Only four of the ninety-odd columns are read, and they are found by name rather than
/// by position: Savant adds columns between releases, and a fixed index would silently
/// start reading the wrong one.
pub fn aggregate_pitch_speeds(csv: &str) -> Vec<PitchSpeedPoint> {
    let mut lines = csv.lines();
    let Some(header) = lines.next() else {
        return Vec::new();
    };
    // The export is served with a byte-order mark, which would otherwise become part of
    // the first column's name and lose it.
    let header = header.trim_start_matches('\u{feff}');
    let cols = split_csv(header);
    let index = |name: &str| cols.iter().position(|c| c == name);

    let (Some(i_type), Some(i_date), Some(i_speed)) = (
        index("pitch_type"),
        index("game_date"),
        index("release_speed"),
    ) else {
        return Vec::new();
    };
    let i_spin = index("release_spin_rate");

    // Keyed by (date, pitch type), holding a running sum so one pass is enough.
    let mut buckets: std::collections::BTreeMap<(String, String), Bucket> =
        std::collections::BTreeMap::new();

    for line in lines {
        if line.trim().is_empty() {
            continue;
        }
        let fields = split_csv(line);
        let (Some(date), Some(kind), Some(speed)) = (
            fields.get(i_date),
            fields.get(i_type),
            fields.get(i_speed).and_then(|v| v.parse::<f64>().ok()),
        ) else {
            continue;
        };
        // A pitch with no type is one Statcast could not classify; it would otherwise
        // become an unlabelled series of its own.
        if kind.is_empty() || date.is_empty() {
            continue;
        }

        let bucket = buckets
            .entry((date.clone(), kind.clone()))
            .or_insert_with(Bucket::default);
        bucket.count += 1;
        bucket.total += speed;
        bucket.max = bucket.max.max(speed);
        if let Some(spin) = i_spin
            .and_then(|i| fields.get(i))
            .and_then(|v| v.parse::<f64>().ok())
        {
            bucket.spin_count += 1;
            bucket.spin_total += spin;
        }
    }

    buckets
        .into_iter()
        .map(|((date, pitch_type), b)| PitchSpeedPoint {
            date,
            pitch_type,
            pitches: b.count,
            avg_speed: round2(b.total / b.count as f64),
            max_speed: round2(b.max),
            avg_spin: (b.spin_count > 0).then(|| round2(b.spin_total / b.spin_count as f64)),
        })
        .collect()
}

#[derive(Default)]
struct Bucket {
    count: u32,
    total: f64,
    max: f64,
    spin_count: u32,
    spin_total: f64,
}

fn round2(v: f64) -> f64 {
    (v * 100.0).round() / 100.0
}

/// Split one CSV line, respecting quoted fields.
///
/// Written out rather than pulled in as a dependency because the export needs exactly
/// this much: the `des` column is a sentence full of commas inside quotes, and a naive
/// `split(',')` shifts every column after it.
fn split_csv(line: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut field = String::new();
    let mut quoted = false;
    let mut chars = line.chars().peekable();

    while let Some(c) = chars.next() {
        match c {
            '"' if quoted && chars.peek() == Some(&'"') => {
                // A doubled quote inside a quoted field is one literal quote.
                field.push('"');
                chars.next();
            }
            '"' => quoted = !quoted,
            ',' if !quoted => out.push(std::mem::take(&mut field)),
            _ => field.push(c),
        }
    }
    out.push(field);
    out
}
