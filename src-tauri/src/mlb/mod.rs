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

/// Every team's record for a season, flattened out of MLB's per-division nesting.
pub async fn fetch_standings(client: &MlbClient, season: &str) -> Result<Vec<TeamStanding>> {
    let resp: StandingsResponse = client.get_json(&endpoints::standings(season)).await?;
    Ok(flatten_standings(resp))
}

/// Collapse `records[].teamRecords[]` into one row per team.
///
/// Split out from the fetch so it can be tested against a saved fixture without a
/// network call — the shape here is the part that drifts, not the request.
pub fn flatten_standings(resp: StandingsResponse) -> Vec<TeamStanding> {
    let mut out = Vec::with_capacity(30);
    for record in resp.records {
        let division_name = record
            .division
            .as_ref()
            .and_then(|d| d.name_short.clone().or_else(|| d.name.clone()));
        let league_name = record.league.as_ref().and_then(|l| l.name.clone());
        for tr in record.team_records {
            let Some(team) = tr.team else { continue };
            out.push(TeamStanding {
                team_id: team.id,
                team_name: team.name.clone(),
                wins: tr.wins.unwrap_or(0),
                losses: tr.losses.unwrap_or(0),
                pct: tr.winning_percentage,
                games_back: tr.games_back,
                division_rank: tr.division_rank,
                division_name: division_name.clone(),
                league_name: league_name.clone(),
                streak: tr.streak.and_then(|s| s.streak_code),
            });
        }
    }
    out
}

/// League-wide player statistics, flattened to one row per player.
#[allow(clippy::too_many_arguments)]
pub async fn fetch_player_stats(
    client: &MlbClient,
    kind: &str,
    group: &str,
    season: &str,
    pool: &str,
    limit: u32,
    sort_stat: Option<&str>,
    order: Option<&str>,
    start_date: Option<&str>,
    end_date: Option<&str>,
    games_back: Option<u32>,
) -> Result<Vec<PlayerStatRow>> {
    let url = endpoints::player_stats(
        kind, group, season, pool, limit, sort_stat, order, start_date, end_date, games_back,
    );
    let resp: StatsResponse = client.get_json(&url).await?;
    Ok(flatten_stats(resp))
}

/// Collapse `stats[].splits[]` into one row per player.
///
/// A split with no player attached is dropped rather than rendered as a blank row: it
/// means MLB returned a team or league aggregate, which this table has no column for.
pub fn flatten_stats(resp: StatsResponse) -> Vec<PlayerStatRow> {
    let mut out = Vec::new();
    for group in resp.stats {
        for split in group.splits {
            let Some(player) = split.player else { continue };
            let Some(id) = player.id else { continue };
            out.push(PlayerStatRow {
                player_id: id,
                player_name: player
                    .full_name
                    .or(player.name)
                    .unwrap_or_else(|| format!("Player {id}")),
                team_id: split.team.as_ref().map(|t| t.id),
                team_name: split.team.and_then(|t| t.name),
                position: split.position.and_then(|p| p.abbreviation),
                rank: split.rank,
                stat: split.stat,
            });
        }
    }
    out
}

/// One player's biographical record, for the preview card.
pub async fn fetch_person(client: &MlbClient, person_id: i64) -> Result<Person> {
    let resp: PeopleResponse = client.get_json(&endpoints::person(person_id)).await?;
    resp.people
        .into_iter()
        .next()
        .ok_or_else(|| crate::error::Error::Parse(format!("no player {person_id}")))
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
            player_ids: player_ids(&item.keywords_all),
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

/// The players a clip is tagged with.
///
/// Both `player` ("playerid-676979") and `player_id` ("676979") appear for the same
/// person, so only the plain numeric form is read and the list is de-duplicated.
fn player_ids(keywords: &[ContentKeyword]) -> Vec<i64> {
    let mut out: Vec<i64> = keywords
        .iter()
        .filter(|k| k.kind.as_deref() == Some("player_id"))
        .filter_map(|k| k.value.as_ref()?.parse::<i64>().ok())
        .collect();
    out.sort_unstable();
    out.dedup();
    out
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

// ---------------------------------------------------------------------------
// Charts, comparisons and the spotlight
// ---------------------------------------------------------------------------

/// One player's game-by-game line, oldest first.
///
/// The `game` object is flattened to its `gamePk` on the way out: the chart only ever
/// wants the id, to open the box score behind a point.
pub async fn fetch_game_log(
    client: &MlbClient,
    person_id: i64,
    group: &str,
    season: &str,
) -> Result<Vec<GameLogSplit>> {
    let resp: GameLogResponse = client
        .get_json(&endpoints::player_game_log(person_id, group, season))
        .await?;
    Ok(flatten_game_log(resp))
}

pub fn flatten_game_log(resp: GameLogResponse) -> Vec<GameLogSplit> {
    let mut out = Vec::new();
    for group in resp.stats {
        for split in group.splits {
            out.push(GameLogSplit {
                date: split.date,
                game_pk: split.game.and_then(|g| g.game_pk),
                is_home: split.is_home,
                is_win: split.is_win,
                opponent: split.opponent,
                team: split.team,
                stat: split.stat,
            });
        }
    }
    // MLB returns these chronologically, but a chart that assumes it and is wrong draws
    // a line that doubles back on itself, so the order is made explicit here.
    out.sort_by(|a, b| a.date.cmp(&b.date));
    out
}

/// One player's totals over a window — the point behind a scatter mark.
pub async fn fetch_player_range(
    client: &MlbClient,
    person_id: i64,
    group: &str,
    season: &str,
    start: &str,
    end: &str,
) -> Result<Option<PlayerStatRow>> {
    let resp: StatsResponse = client
        .get_json(&endpoints::player_range(person_id, group, season, start, end))
        .await?;
    Ok(first_split_as_row(resp, person_id))
}

/// Turn a *per-player* stats response into one row.
///
/// `flatten_stats` cannot be used here: it drops any split with no `player` object, and
/// the `/people/{id}/stats` endpoints omit that object entirely — the player is already
/// named by the URL. Reusing it silently returned nothing for every player on the
/// scatter, which is exactly the kind of empty chart that looks like a network problem.
fn first_split_as_row(resp: StatsResponse, person_id: i64) -> Option<PlayerStatRow> {
    let split = resp.stats.into_iter().flat_map(|g| g.splits).next()?;
    Some(PlayerStatRow {
        player_id: split.player.as_ref().and_then(|p| p.id).unwrap_or(person_id),
        player_name: split
            .player
            .as_ref()
            .and_then(|p| p.full_name.clone().or_else(|| p.name.clone()))
            .unwrap_or_default(),
        team_id: split.team.as_ref().map(|t| t.id),
        team_name: split.team.and_then(|t| t.name),
        position: split.position.and_then(|p| p.abbreviation),
        rank: split.rank,
        stat: split.stat,
    })
}

/// Every player on a big-league roster this season, for the picker.
pub async fn fetch_sport_players(client: &MlbClient, season: &str) -> Result<Vec<PlayerRef>> {
    let resp: PeopleListResponse = client
        .get_json(&endpoints::sport_players(season))
        .await?;

    let mut out: Vec<PlayerRef> = resp
        .people
        .into_iter()
        .filter_map(|p| {
            let name = p.full_name?;
            Some(PlayerRef {
                id: p.id,
                full_name: name,
                team_id: p.current_team.as_ref().map(|t| t.id),
                team_name: p.current_team.and_then(|t| t.name),
                position: p
                    .primary_position
                    .as_ref()
                    .and_then(|pos| pos.abbreviation.clone()),
                position_type: p.primary_position.and_then(|pos| pos.kind),
            })
        })
        .collect();
    out.sort_by(|a, b| a.full_name.cmp(&b.full_name));
    out
        .into_iter()
        .fold(Ok(Vec::new()), |acc: Result<Vec<PlayerRef>>, p| {
            let mut v = acc?;
            // The roster feed lists a player once per team when they were traded; the
            // picker wants one row per person.
            if v.last().map(|l: &PlayerRef| l.id) != Some(p.id) {
                v.push(p);
            }
            Ok(v)
        })
}

/// Season WAR and friends, indexed by player id.
pub async fn fetch_sabermetrics(
    client: &MlbClient,
    group: &str,
    season: &str,
) -> Result<Vec<SabermetricRow>> {
    let resp: SabermetricsResponse = client
        .get_json(&endpoints::sabermetrics(group, season, 2000))
        .await?;
    Ok(flatten_sabermetrics(resp))
}

pub fn flatten_sabermetrics(resp: SabermetricsResponse) -> Vec<SabermetricRow> {
    let num = |m: &serde_json::Map<String, serde_json::Value>, k: &str| -> Option<f64> {
        m.get(k).and_then(|v| v.as_f64())
    };
    let mut out = Vec::new();
    for group in resp.stats {
        for split in group.splits {
            let Some(player) = split.player else { continue };
            let Some(id) = player.id else { continue };
            out.push(SabermetricRow {
                player_id: id,
                player_name: player.full_name.unwrap_or_else(|| format!("Player {id}")),
                war: num(&split.stat, "war"),
                woba: num(&split.stat, "woba"),
                wrc_plus: num(&split.stat, "wRcPlus"),
            });
        }
    }
    out
}
