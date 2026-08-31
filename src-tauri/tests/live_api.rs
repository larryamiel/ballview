//! Phase 1 validation spike — parses live MLB responses with the real models.
//!
//! These hit the network, so they are `#[ignore]` by default and never run in a normal
//! `cargo test`. Run them deliberately when validating against upstream:
//!
//! ```text
//! cargo test --test live_api -- --ignored --nocapture
//! ```
//!
//! The Stats API is undocumented and shifts without notice; this is how a field rename
//! gets caught on purpose rather than as a bug report.

use ballview_lib::mlb::{self, client::MlbClient};

fn client() -> MlbClient {
    MlbClient::new().expect("failed to build the client")
}

#[tokio::test]
#[ignore = "hits the live MLB API"]
async fn teams_parse() {
    let teams = mlb::fetch_teams(&client()).await.expect("fetch_teams failed");
    assert!(teams.len() >= 30, "expected at least 30 clubs, got {}", teams.len());
    let named = teams.iter().filter(|t| t.name.is_some()).count();
    assert_eq!(named, teams.len(), "some teams parsed without a name");
    println!("parsed {} teams, e.g. {:?}", teams.len(), teams[0].name);
}

#[tokio::test]
#[ignore = "hits the live MLB API"]
async fn todays_schedule_parses() {
    let date = chrono::Local::now().format("%Y-%m-%d").to_string();
    let games = mlb::fetch_schedule(&client(), &date, None)
        .await
        .expect("fetch_schedule failed");
    println!("{date}: {} games", games.len());
    for g in &games {
        println!(
            "  {} | {} @ {} | {:?}",
            g.game_pk,
            g.teams.as_ref().and_then(|t| t.away.as_ref()).and_then(|s| s.team.as_ref()).and_then(|t| t.name.clone()).unwrap_or_default(),
            g.teams.as_ref().and_then(|t| t.home.as_ref()).and_then(|s| s.team.as_ref()).and_then(|t| t.name.clone()).unwrap_or_default(),
            g.status.as_ref().and_then(|s| s.abstract_game_state.clone()),
        );
        assert!(g.season.is_some(), "game {} has no season field", g.game_pk);
    }
}

#[tokio::test]
#[ignore = "hits the live MLB API"]
async fn live_feed_play_by_play_parses() {
    let c = client();
    let date = chrono::Local::now().format("%Y-%m-%d").to_string();
    let games = mlb::fetch_schedule(&c, &date, None).await.expect("schedule failed");

    // Prefer a game in progress. Failing that, fall back to yesterday's slate: before
    // first pitch every game today is `Preview` with an empty `allPlays`, which would let
    // this test pass while validating nothing about pitch or fielder parsing.
    let live_today = games
        .iter()
        .find(|g| g.status.as_ref().map(|s| s.is_live()).unwrap_or(false))
        .cloned();

    let target = match live_today {
        Some(g) => g,
        None => {
            // Walk back day by day. One day is not enough: an off day, or simply being
            // ahead of the US clock, can leave the previous date entirely unplayed.
            let mut found = None;
            for back in 1..=7 {
                let day = (chrono::Utc::now().with_timezone(&chrono_tz::America::New_York)
                    - chrono::Duration::days(back))
                .format("%Y-%m-%d")
                .to_string();
                let past = mlb::fetch_schedule(&c, &day, None)
                    .await
                    .unwrap_or_default();
                if let Some(g) = past
                    .into_iter()
                    .find(|g| g.status.as_ref().map(|s| s.is_final()).unwrap_or(false))
                {
                    println!("no live game; validating against completed game on {day}");
                    found = Some(g);
                    break;
                }
            }
            found.expect("no completed game in the last 7 days to validate against")
        }
    };

    let feed = mlb::fetch_live_feed(&c, target.game_pk).await.expect("live feed failed");
    let plays = feed
        .live_data
        .as_ref()
        .and_then(|d| d.plays.as_ref())
        .map(|p| p.all_plays.as_slice())
        .unwrap_or_default();

    println!("game {} -> {} plays", target.game_pk, plays.len());

    let pitches: usize = plays
        .iter()
        .flat_map(|p| p.play_events.iter())
        .filter(|e| e.is_pitch == Some(true))
        .count();
    let with_speed: usize = plays
        .iter()
        .flat_map(|p| p.play_events.iter())
        .filter(|e| e.pitch_data.as_ref().and_then(|d| d.start_speed).is_some())
        .count();
    let credits: usize = plays
        .iter()
        .flat_map(|p| p.runners.iter())
        .flat_map(|r| r.credits.iter())
        .count();

    println!("  {pitches} pitches, {with_speed} with a speed, {credits} fielding credits");

    if !plays.is_empty() {
        assert!(pitches > 0, "plays exist but no playEvents parsed as pitches");
        // Feature 4 depends on pitchData surviving the parse.
        assert!(with_speed > 0, "no pitch reported startSpeed - pitchData may have moved");
    }
}

#[tokio::test]
#[ignore = "hits the live MLB API"]
async fn boxscore_and_highlights_parse() {
    let c = client();
    let date = chrono::Local::now().format("%Y-%m-%d").to_string();
    let games = mlb::fetch_schedule(&c, &date, None).await.expect("schedule failed");
    let target = games.first().expect("no games scheduled today");

    let box_ = mlb::fetch_boxscore(&c, target.game_pk).await.expect("boxscore failed");
    let players = box_
        .teams
        .as_ref()
        .and_then(|t| t.home.as_ref())
        .map(|t| t.players.len())
        .unwrap_or(0);
    println!("boxscore home players: {players}");

    // Highlights legitimately come back empty before/early in a game.
    let clips = mlb::fetch_highlights(&c, target.game_pk).await.expect("highlights failed");
    let playable = clips.iter().filter(|c| c.url.is_some()).count();
    println!("highlights: {} listed, {} with a playable mp4", clips.len(), playable);
}
