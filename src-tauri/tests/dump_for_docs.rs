//! Dump real command payloads for the documentation screenshots.
//!
//! `#[ignore]` — run deliberately, like `live_api.rs`. It hits the real MLB endpoints and
//! writes one JSON file whose keys are Tauri command names, so the screenshot harness can
//! stub `invoke` with genuine data rather than invented numbers. Everything here goes
//! through the app's own code (`mlb::*`, `plays::rank_slate`, `spotlight::rank_*`), so
//! what a screenshot shows is what the app computes.
//!
//! Usage:
//!   cargo test --test dump_for_docs -- --ignored --nocapture

use std::collections::HashMap;

use ballview_lib::commands::{last_completed_slate, news, plays, spotlight};
use ballview_lib::mlb::{self, client::MlbClient};
use ballview_lib::storage::history::HistoryEntry;
use serde_json::{json, Map, Value};

/// The club the documentation follows.
const TEAM_ID: u32 = 119;

#[tokio::test]
#[ignore]
async fn dump() {
    let out = std::env::var("BALLVIEW_DOC_DUMP").expect("set BALLVIEW_DOC_DUMP to a file path");
    let client = MlbClient::new().unwrap();
    let mut payload = Map::new();

    let date = last_completed_slate(&client).await;
    let season = &date[..4];
    println!("slate: {date}");

    // --- Reference data ----------------------------------------------------
    let teams = mlb::fetch_teams(&client).await.unwrap();
    let standings = mlb::fetch_standings(&client, season).await.unwrap();
    payload.insert("get_teams".into(), json!(teams));
    payload.insert("get_standings".into(), json!(standings));
    payload.insert("get_today".into(), json!(date));

    // --- Today's games -----------------------------------------------------
    let today_games = mlb::fetch_schedule_today(&client, None).await.unwrap();
    println!("today's slate: {} games", today_games.len());
    payload.insert("get_schedule".into(), json!(today_games));

    // --- My Team: the whole season, played and still to come ---------------
    let season_games = mlb::fetch_schedule_range(
        &client,
        &format!("{season}-01-01"),
        &format!("{season}-12-31"),
        Some(TEAM_ID),
    )
    .await
    .unwrap();
    let entries: Vec<HistoryEntry> = season_games.iter().map(HistoryEntry::from_summary).collect();
    println!(
        "season: {} games, {} unplayed",
        entries.len(),
        entries.iter().filter(|e| !e.is_final).count()
    );
    payload.insert(
        "get_history".into(),
        json!({ "teamId": TEAM_ID, "season": season, "entries": entries }),
    );
    payload.insert("get_history_seasons".into(), json!([season]));
    payload.insert("refresh_history".into(), json!(entries.len()));

    // --- My Team: news -----------------------------------------------------
    let team = mlb::fetch_team(&client, TEAM_ID).await.unwrap();
    let slug = news::team_slug(team.team_name.as_deref().unwrap_or("Dodgers"));
    let xml = mlb::fetch_news_feed(&client, Some(&slug)).await.unwrap();
    let articles = news::parse_rss(&xml);
    println!("news: {} articles from /{slug}", articles.len());
    payload.insert("get_team_news".into(), json!(articles));

    // --- My Team: play of the day ------------------------------------------
    let slate = mlb::fetch_slate_highlights(&client, &date).await.unwrap();
    let ranked = plays::rank_slate(&slate, None, 12);
    println!("plays: {} ranked, top = {}", ranked.len(), ranked[0].clip.title);
    payload.insert(
        "get_top_plays".into(),
        json!({ "date": date, "resolvedBack": true, "plays": ranked }),
    );

    // --- Players: the leaderboard ------------------------------------------
    let leaders = mlb::fetch_player_stats(
        &client, "season", "hitting", season, "Qualified", 100,
        Some("homeRuns"), Some("desc"), None, None, None,
    )
    .await
    .unwrap();
    println!("leaderboard: {} qualified hitters", leaders.len());
    payload.insert("get_player_stats".into(), json!(leaders));

    // --- Players: the spotlight, over the last completed day ---------------
    let start = date.clone();
    let (hitting, pitching, war_h, war_p) = tokio::join!(
        mlb::fetch_player_stats(
            &client, "byDateRange", "hitting", season, "All", 1500,
            None, None, Some(&start), Some(&date), None,
        ),
        mlb::fetch_player_stats(
            &client, "byDateRange", "pitching", season, "All", 1500,
            None, None, Some(&start), Some(&date), None,
        ),
        mlb::fetch_sabermetrics(&client, "hitting", season),
        mlb::fetch_sabermetrics(&client, "pitching", season),
    );
    let index = |rows: Vec<mlb::models::SabermetricRow>| -> HashMap<i64, f64> {
        rows.into_iter().filter_map(|r| r.war.map(|w| (r.player_id, w))).collect()
    };
    let war_h = index(war_h.unwrap_or_default());
    let war_p = index(war_p.unwrap_or_default());
    let mut hitters = spotlight::rank_hitters(&hitting.unwrap(), &war_h, spotlight::Period::Day);
    let mut pitchers = spotlight::rank_pitchers(&pitching.unwrap(), &war_p, spotlight::Period::Day);
    hitters.truncate(5);
    pitchers.truncate(5);
    println!("spotlight: top hitter = {}", hitters[0].player_name);
    payload.insert(
        "get_top_performers".into(),
        json!({
            "start": start, "end": date, "resolvedBack": true,
            "hitters": hitters, "pitchers": pitchers,
        }),
    );

    // --- One finished game, for the game views -----------------------------
    let game_pk = slate
        .iter()
        .map(|(g, _)| g.game_pk)
        .find(|pk| *pk > 0)
        .expect("no game on the slate");
    let (feed, box_, clips) = tokio::join!(
        mlb::fetch_live_feed(&client, game_pk),
        mlb::fetch_boxscore(&client, game_pk),
        mlb::fetch_highlights(&client, game_pk),
    );
    println!("game {game_pk} captured");
    payload.insert("__gamePk".into(), json!(game_pk));
    payload.insert("get_live_feed".into(), json!(feed.unwrap()));
    payload.insert("get_boxscore".into(), json!(box_.unwrap()));
    payload.insert("get_game_content".into(), json!(clips.unwrap()));

    payload.insert(
        "get_config".into(),
        json!({
            "favoriteTeamIds": [TEAM_ID], "saveVideo": false,
            "statcastEnabled": false, "pollSeconds": 15
        }),
    );

    std::fs::write(&out, serde_json::to_vec_pretty(&Value::Object(payload)).unwrap()).unwrap();
    println!("wrote {out}");
}
