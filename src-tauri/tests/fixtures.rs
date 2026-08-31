//! Offline model tests against real captured API responses.
//!
//! The fixtures in `tests/fixtures/` are genuine MLB responses (game 822688, Aug 30 2026).
//! Unlike `live_api.rs` these run in a normal `cargo test` — they are the regression net
//! that catches a model change breaking a field the UI depends on, with no network and no
//! dependence on whether a game happens to be in progress.

use ballview_lib::mlb::models::*;

fn fixture(name: &str) -> String {
    let path = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("tests/fixtures")
        .join(name);
    std::fs::read_to_string(&path)
        .unwrap_or_else(|e| panic!("could not read fixture {}: {e}", path.display()))
}

#[test]
fn teams_fixture_parses() {
    let resp: TeamsResponse = serde_json::from_str(&fixture("teams.json")).unwrap();
    assert_eq!(resp.teams.len(), 30, "expected 30 active clubs");
    assert!(resp.teams.iter().all(|t| t.name.is_some()));
    assert!(resp.teams.iter().all(|t| t.abbreviation.is_some()));
}

#[test]
fn schedule_fixture_parses() {
    let resp: ScheduleResponse = serde_json::from_str(&fixture("schedule_2026-08-30.json")).unwrap();
    let games: Vec<_> = resp.dates.into_iter().flat_map(|d| d.games).collect();
    assert!(!games.is_empty());

    for g in &games {
        // The history log keys off `season`; losing it would silently misfile games.
        assert!(g.season.is_some(), "game {} lost its season field", g.game_pk);
        assert!(g.teams.is_some(), "game {} lost its teams", g.game_pk);
    }
}

#[test]
fn live_feed_fixture_has_pitches_and_fielding_credits() {
    let feed: LiveFeed = serde_json::from_str(&fixture("live_feed_822688.json")).unwrap();

    let plays = feed
        .live_data
        .as_ref()
        .and_then(|d| d.plays.as_ref())
        .map(|p| p.all_plays.as_slice())
        .expect("no plays in the feed");
    assert_eq!(plays.len(), 74, "play count changed for this fixture");

    // Feature 4: every pitch needs speed and location to render.
    let pitches: Vec<&PlayEvent> = plays
        .iter()
        .flat_map(|p| p.play_events.iter())
        .filter(|e| e.is_pitch == Some(true))
        .collect();
    assert_eq!(pitches.len(), 291);
    assert!(
        pitches
            .iter()
            .all(|p| p.pitch_data.as_ref().and_then(|d| d.start_speed).is_some()),
        "a pitch lost its startSpeed"
    );
    let located = pitches
        .iter()
        .filter(|p| {
            p.pitch_data
                .as_ref()
                .and_then(|d| d.coordinates.as_ref())
                .and_then(|c| c.p_x)
                .is_some()
        })
        .count();
    assert!(located > 250, "only {located} pitches had plate coordinates");

    // Feature 5: fielding credits drive FielderView.
    let credits: usize = plays
        .iter()
        .flat_map(|p| p.runners.iter())
        .flat_map(|r| r.credits.iter())
        .count();
    assert_eq!(credits, 89);
    assert!(plays
        .iter()
        .flat_map(|p| p.runners.iter())
        .flat_map(|r| r.credits.iter())
        .any(|c| c.position.as_ref().and_then(|p| p.abbreviation.as_ref()).is_some()));

    // The linescore drives the header and the defensive diagram.
    let ls = feed
        .live_data
        .as_ref()
        .and_then(|d| d.linescore.as_ref())
        .expect("no linescore");
    assert!(ls.teams.is_some());
    assert!(ls.innings.len() >= 9);
}

#[test]
fn boxscore_fixture_parses_fielding_stats() {
    let box_: Boxscore = serde_json::from_str(&fixture("boxscore_822688.json")).unwrap();
    let home = box_
        .teams
        .as_ref()
        .and_then(|t| t.home.as_ref())
        .expect("no home team");
    assert!(!home.players.is_empty());

    let with_fielding = home
        .players
        .values()
        .filter(|p| p.stats.as_ref().and_then(|s| s.fielding.as_ref()).is_some())
        .count();
    assert!(with_fielding > 0, "no player carried fielding stats");

    // Keys are "ID{playerId}", which the UI relies on being stable.
    assert!(home.players.keys().all(|k| k.starts_with("ID")));
}

#[test]
fn content_fixture_yields_playable_highlights() {
    let content: GameContent = serde_json::from_str(&fixture("content_822688.json")).unwrap();
    // Tested through the flattening path, since that is what the frontend consumes.
    let clips = ballview_lib::mlb::flatten_highlights(content);

    assert!(!clips.is_empty(), "no highlights extracted from the content feed");

    let playable: Vec<_> = clips.iter().filter(|c| c.url.is_some()).collect();
    assert!(
        !playable.is_empty(),
        "{} clips listed but none exposed a playable mp4",
        clips.len()
    );
    // Everything handed to a <video> tag must really be an mp4 on an MLB host, or the
    // CSP in tauri.conf.json will silently block it.
    for c in &playable {
        let url = c.url.as_deref().unwrap();
        assert!(url.starts_with("https://"), "non-https playback url: {url}");
        assert!(
            url.split('?').next().unwrap().ends_with(".mp4"),
            "non-mp4 playback url survived filtering: {url}"
        );
    }
    // Ids are the on-disk filename for saved clips, so they must be unique.
    let mut ids: Vec<_> = clips.iter().map(|c| c.id.as_str()).collect();
    ids.sort_unstable();
    let before = ids.len();
    ids.dedup();
    assert_eq!(before, ids.len(), "duplicate highlight ids survived de-duplication");

    println!("{} clips, {} playable", clips.len(), playable.len());
}

/// Guards the media allowlist against the hosts MLB actually uses.
///
/// The Phase 1 spike found the documented host (`cuts.diamond.mlb.com`) serves none of
/// the real clips. If MLB moves hosts again, this fails here rather than as a clip that
/// silently refuses to play in the app.
#[test]
fn every_playback_host_is_allowed_by_the_csp_and_downloader() {
    // Kept in sync with ALLOWED_HOSTS in src/commands/media.rs and the `media-src`
    // directive in tauri.conf.json.
    const ALLOWED: &[&str] = &[
        "mlb-cuts-diamond.mlb.com",
        "darkroom-clips.mlb.com",
        "bdata-producedclips.mlb.com",
        "cuts.diamond.mlb.com",
    ];

    let content: GameContent = serde_json::from_str(&fixture("content_822688.json")).unwrap();
    let clips = ballview_lib::mlb::flatten_highlights(content);

    let mut seen: Vec<String> = Vec::new();
    for clip in clips.iter().filter(|c| c.url.is_some()) {
        let url = clip.url.as_deref().unwrap();
        let host = url
            .strip_prefix("https://")
            .and_then(|r| r.split('/').next())
            .unwrap_or("")
            .to_string();
        assert!(
            ALLOWED.contains(&host.as_str()),
            "playback host {host} is not in the allowlist - clips from it will not play or download"
        );
        if !seen.contains(&host) {
            seen.push(host);
        }
    }
    println!("playback hosts in fixture: {seen:?}");
    assert!(!seen.is_empty());
}

/// The CSP must also cover thumbnail images, or clip art silently fails to render.
#[test]
fn thumbnail_hosts_are_covered_by_the_csp() {
    const ALLOWED_IMG: &[&str] = &[
        "img.mlbstatic.com",
        "www.mlbstatic.com",
        "midfield.mlbstatic.com",
    ];

    let content: GameContent = serde_json::from_str(&fixture("content_822688.json")).unwrap();
    let clips = ballview_lib::mlb::flatten_highlights(content);

    for clip in clips.iter().filter(|c| c.thumbnail.is_some()) {
        let url = clip.thumbnail.as_deref().unwrap();
        let host = url
            .strip_prefix("https://")
            .and_then(|r| r.split('/').next())
            .unwrap_or("");
        assert!(
            ALLOWED_IMG.contains(&host),
            "thumbnail host {host} is missing from the CSP img-src directive"
        );
    }
}
