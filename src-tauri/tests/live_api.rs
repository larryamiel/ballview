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

#[tokio::test]
#[ignore = "hits the live MLB API"]
async fn standings_parse() {
    // The current MLB season, from MLB's own calendar rather than the machine clock.
    let season = chrono::Utc::now()
        .with_timezone(&chrono_tz::America::New_York)
        .format("%Y")
        .to_string();

    let records = mlb::fetch_standings(&client(), &season)
        .await
        .expect("fetch_standings failed");

    assert_eq!(records.len(), 30, "expected one row per club, got {}", records.len());
    for r in &records {
        assert!(r.team_name.is_some(), "team {} parsed without a name", r.team_id);
        // A short division name is what the picker renders; losing it degrades the row
        // to a bare record, which is the kind of quiet regression this test exists for.
        assert!(
            r.division_name.is_some(),
            "{:?} has no division name — is `hydrate=division` still applied?",
            r.team_name
        );
    }

    let sample = &records[0];
    println!(
        "{:?}: {}-{} ({} in {:?}), streak {:?}",
        sample.team_name,
        sample.wins,
        sample.losses,
        sample.division_rank.as_deref().unwrap_or("?"),
        sample.division_name,
        sample.streak
    );
}

#[tokio::test]
#[ignore = "hits the live MLB API"]
async fn player_stats_parse() {
    let season = chrono::Utc::now()
        .with_timezone(&chrono_tz::America::New_York)
        .format("%Y")
        .to_string();

    // Season hitting, sorted by MLB rather than by us — the ordering is the part the
    // stats table depends on and the part most likely to be dropped upstream.
    let rows = mlb::fetch_player_stats(
        &client(),
        "season",
        "hitting",
        &season,
        "Qualified",
        25,
        Some("homeRuns"),
        Some("desc"),
        None,
        None,
        None,
    )
    .await
    .expect("fetch_player_stats failed");

    assert!(!rows.is_empty(), "no hitting rows returned");
    assert!(rows.iter().all(|r| r.player_id != 0));
    assert!(
        rows.iter().all(|r| r.stat.contains_key("homeRuns")),
        "a row came back without the stat it was sorted on"
    );

    let homers: Vec<i64> = rows
        .iter()
        .filter_map(|r| r.stat.get("homeRuns").and_then(|v| v.as_i64()))
        .collect();
    assert!(
        homers.windows(2).all(|w| w[0] >= w[1]),
        "rows are not in descending home-run order: {homers:?}"
    );
    println!("top hitter: {} with {} HR", rows[0].player_name, homers[0]);

    // Each player's own last ten games — a different `stats` type, not a date window.
    let last10 = mlb::fetch_player_stats(
        &client(),
        "lastXGames",
        "pitching",
        &season,
        "All",
        10,
        Some("era"),
        Some("asc"),
        None,
        None,
        Some(10),
    )
    .await
    .expect("lastXGames failed");
    assert!(!last10.is_empty(), "no last-10-games rows returned");
    println!("last 10 games, best ERA: {}", last10[0].player_name);
}

#[tokio::test]
#[ignore = "hits the live MLB API"]
async fn person_parses() {
    // Shohei Ohtani — a two-way player, so both `batSide` and `pitchHand` are populated.
    let person = mlb::fetch_person(&client(), 660271).await.expect("fetch_person failed");
    assert_eq!(person.id, 660271);
    assert!(person.full_name.is_some());
    assert!(person.primary_position.is_some(), "no position on the record");
    println!(
        "{:?}: {:?}, bats {:?}",
        person.full_name,
        person.primary_position.and_then(|p| p.abbreviation),
        person.bat_side.and_then(|b| b.code)
    );
}

#[tokio::test]
#[ignore = "hits Baseball Savant"]
async fn pitch_clip_resolves_to_an_mp4() {
    // A pitch from the fixture game, so this also proves the join key: the `playId` in
    // MLB's own live feed is what Savant's clip page is addressed by.
    let play_id = "1712c6fb-15fe-3e3c-a407-e7e85fcd550f";
    let url = mlb::savant::fetch_pitch_clip(&client(), play_id)
        .await
        .expect("fetch_pitch_clip failed")
        .expect("Savant has no clip for a pitch that should have one");

    assert!(
        url.starts_with(&format!("https://{}/", mlb::savant::CLIP_HOST)),
        "clip URL moved hosts: {url}"
    );
    assert!(url.ends_with(".mp4"), "not an mp4: {url}");
    // The page escapes the token's `=` padding; an entity left in it would 404.
    assert!(!url.contains('&'), "undecoded entity in the URL: {url}");
    println!("clip for {play_id}: {url}");
}

#[tokio::test]
#[ignore = "hits Baseball Savant"]
async fn an_unknown_play_id_has_no_clip() {
    // Savant answers 200 with a page and no <source>, which must read as "no clip"
    // rather than as an error.
    let clip = mlb::savant::fetch_pitch_clip(&client(), "00000000-0000-0000-0000-000000000000")
        .await
        .expect("fetch_pitch_clip should not fail on an unknown id");
    assert!(clip.is_none(), "expected no clip, got {clip:?}");
}

#[tokio::test]
#[ignore = "hits the live MLB API"]
async fn game_log_carries_dates_and_rates() {
    // Ohtani's 2025 season: the series behind a date-axis chart.
    let log = mlb::fetch_game_log(&client(), 660271, "hitting", "2025")
        .await
        .expect("fetch_game_log failed");
    assert!(log.len() > 100, "expected a full season, got {}", log.len());
    assert!(log.iter().all(|g| g.date.is_some()), "a split arrived with no date");
    assert!(log.iter().all(|g| g.game_pk.is_some()), "a split arrived with no gamePk");
    // Oldest first — a chart that assumes it and is wrong draws a line doubling back.
    let dates: Vec<&str> = log.iter().filter_map(|g| g.date.as_deref()).collect();
    assert!(dates.windows(2).all(|w| w[0] <= w[1]), "game log is not in date order");
    assert!(log[0].stat.contains_key("ops"), "no ops in the game line");
    println!("{} games, first {:?}", log.len(), log[0].date);
}

#[tokio::test]
#[ignore = "hits the live MLB API"]
async fn a_per_player_window_returns_a_row() {
    // Guards a real bug: `/people/{id}/stats` omits the `player` object entirely, so the
    // league-wide flattener (which drops player-less splits) returned nothing at all here
    // and every scatter came back empty.
    let row = mlb::fetch_player_range(&client(), 660271, "hitting", "2025", "2025-07-01", "2025-07-31")
        .await
        .expect("fetch_player_range failed")
        .expect("no row for a month the player certainly played");
    assert_eq!(row.player_id, 660271, "the player id must survive the flattening");
    assert!(row.stat.contains_key("homeRuns"));
    println!("July 2025: {:?} HR", row.stat.get("homeRuns"));
}

#[tokio::test]
#[ignore = "hits the live MLB API"]
async fn sabermetrics_carry_war() {
    let rows = mlb::fetch_sabermetrics(&client(), "hitting", "2025")
        .await
        .expect("fetch_sabermetrics failed");
    assert!(rows.len() > 100, "expected the league, got {}", rows.len());
    let with_war = rows.iter().filter(|r| r.war.is_some()).count();
    assert!(with_war > 100, "only {with_war} players carried a WAR");
    let best = rows
        .iter()
        .max_by(|a, b| a.war.unwrap_or(0.0).total_cmp(&b.war.unwrap_or(0.0)))
        .unwrap();
    println!("best WAR: {} {:?}", best.player_name, best.war);
}

#[tokio::test]
#[ignore = "hits the live MLB API"]
async fn the_roster_list_covers_the_league() {
    let players = mlb::fetch_sport_players(&client(), "2025")
        .await
        .expect("fetch_sport_players failed");
    assert!(players.len() > 1000, "only {} players", players.len());
    assert!(players.iter().any(|p| p.id == 660271), "Ohtani is missing");
    // Deduplicated: a traded player appears once, not once per club.
    let mut ids: Vec<i64> = players.iter().map(|p| p.id).collect();
    ids.sort_unstable();
    let before = ids.len();
    ids.dedup();
    assert_eq!(before, ids.len(), "the roster list has duplicate ids");
}

#[tokio::test]
#[ignore = "hits Baseball Savant"]
async fn pitch_speeds_aggregate_by_day() {
    use ballview_lib::mlb::savant;
    // Paul Skenes, one week of 2025.
    let points = savant::fetch_pitch_speeds(&client(), 694973, "2025-08-01", "2025-08-10")
        .await
        .expect("fetch_pitch_speeds failed");
    assert!(!points.is_empty(), "no pitches came back");

    let fastballs: Vec<_> = points.iter().filter(|p| p.pitch_type == "FF").collect();
    assert!(!fastballs.is_empty(), "no four-seamers in the window");
    for p in &fastballs {
        assert!(
            (80.0..110.0).contains(&p.avg_speed),
            "implausible average release speed {} on {}",
            p.avg_speed,
            p.date
        );
        assert!(p.max_speed >= p.avg_speed);
        assert!(p.pitches > 0);
    }
    println!(
        "{} rows; first four-seam day {} at {} mph over {} pitches",
        points.len(),
        fastballs[0].date,
        fastballs[0].avg_speed,
        fastballs[0].pitches
    );
}

#[tokio::test]
#[ignore = "hits the live MLB API"]
async fn the_spotlight_model_picks_a_sensible_day() {
    use ballview_lib::commands::spotlight::{hitter_wins, pitcher_wins};

    // A real slate: 23 August 2025.
    let hitting = mlb::fetch_player_stats(
        &client(), "byDateRange", "hitting", "2025", "All", 1500,
        None, None, Some("2025-08-23"), Some("2025-08-23"), None,
    )
    .await
    .expect("hitting window failed");
    assert!(hitting.len() > 100, "only {} hitters played?", hitting.len());

    let best = hitting
        .iter()
        .max_by(|a, b| hitter_wins(&a.stat).total_cmp(&hitter_wins(&b.stat)))
        .expect("no hitters");
    let worst = hitting
        .iter()
        .min_by(|a, b| hitter_wins(&a.stat).total_cmp(&hitter_wins(&b.stat)))
        .expect("no hitters");

    // The best day of a real slate is a multi-hit, extra-base day, and it is worth more
    // than a tenth of a win; the worst is an 0-fer and is worth less than nothing.
    assert!(hitter_wins(&best.stat) > 0.1, "top hitter scored too low");
    assert!(hitter_wins(&worst.stat) < 0.0, "someone had a negative-free day?");
    println!(
        "best bat: {} ({:.3} wins) {:?}-for-{:?}",
        best.player_name,
        hitter_wins(&best.stat),
        best.stat.get("hits"),
        best.stat.get("atBats")
    );

    let pitching = mlb::fetch_player_stats(
        &client(), "byDateRange", "pitching", "2025", "All", 1500,
        None, None, Some("2025-08-23"), Some("2025-08-23"), None,
    )
    .await
    .expect("pitching window failed");
    let ace = pitching
        .iter()
        .max_by(|a, b| pitcher_wins(&a.stat).total_cmp(&pitcher_wins(&b.stat)))
        .expect("no pitchers");
    assert!(pitcher_wins(&ace.stat) > 0.1, "top pitcher scored too low");
    println!(
        "best arm: {} ({:.3} wins) {:?} IP",
        ace.player_name,
        pitcher_wins(&ace.stat),
        ace.stat.get("inningsPitched")
    );
}
