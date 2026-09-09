//! Player of the day, the week and the month.
//!
//! # How the ranking works, and why it is not simply WAR
//!
//! MLB publishes WAR through its `sabermetrics` stat group, but **season to date only**.
//! The endpoint accepts `startDate`/`endDate` and ignores them — the same player returns
//! an identical 10.04 WAR for a whole season and for one August, which was checked
//! before any of this was written. So there is no such thing as "yesterday's WAR" to
//! read, and a spotlight built on the season figure would crown the same two players
//! every day from May onward.
//!
//! What is computed instead is a **wins estimate for the window itself**, from the
//! window's own line, using the standard linear weights that WAR is built on:
//!
//! - Hitters: wOBA from the line → wRAA against a league-average wOBA → runs → wins at
//!   the usual ten runs to a win.
//! - Pitchers: runs allowed per nine against a league average → runs saved over the
//!   innings actually thrown → wins.
//!
//! That is an estimate, not MLB's WAR: it has no park factors, no positional adjustment
//! and no defence. It is honest about what it is, it responds to a single day, and it
//! gets the big things right — a four-hit day with two homers outscores a 1-for-4, and
//! seven shutout innings outscore a one-inning save.
//!
//! The composite is **50% that wins estimate** (as requested), 30% raw production over
//! the window, and 20% season WAR as a quality prior — the last is what keeps a career
//! year from being edged out by one hot afternoon from a replacement-level bench bat.

use std::collections::HashMap;

use serde::{Deserialize, Serialize};
use tauri::State;

use super::{season_or_current, today_mlb, AppState};
use crate::error::{Error, Result};
use crate::mlb::{self, models::Highlight};

/// League baselines, roughly current. Constants rather than another request: they move a
/// few thousandths a year and a wrong third decimal cannot change who is on top.
const LEAGUE_WOBA: f64 = 0.320;
const WOBA_SCALE: f64 = 1.25;
const RUNS_PER_WIN: f64 = 10.0;
const LEAGUE_RA9: f64 = 4.40;

/// Linear weights (FanGraphs' published values, rounded).
const W_BB: f64 = 0.69;
const W_HBP: f64 = 0.72;
const W_1B: f64 = 0.89;
const W_2B: f64 = 1.27;
const W_3B: f64 = 1.62;
const W_HR: f64 = 2.10;

#[derive(Debug, Clone, Copy, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Period {
    Day,
    Week,
    Month,
}

impl Period {
    /// How many days the window covers, ending on the chosen date.
    fn days(self) -> i64 {
        match self {
            Period::Day => 1,
            Period::Week => 7,
            Period::Month => 30,
        }
    }

    /// The least a player must have done to be eligible.
    ///
    /// Without a floor the leaderboard is a lottery: over a month, one perfect
    /// pinch-hit appearance produces an infinite rate and a meaningless winner.
    fn min_plate_appearances(self) -> f64 {
        match self {
            Period::Day => 3.0,
            Period::Week => 12.0,
            Period::Month => 40.0,
        }
    }

    fn min_outs(self) -> f64 {
        match self {
            Period::Day => 9.0,  // three innings
            Period::Week => 12.0,
            Period::Month => 45.0,
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Performer {
    pub player_id: i64,
    pub player_name: String,
    pub team_id: Option<i64>,
    pub team_name: Option<String>,
    pub position: Option<String>,
    /// The composite, 0–100 within this window's pool.
    pub score: f64,
    /// Wins added over the window, estimated from linear weights.
    pub wins_estimate: f64,
    /// MLB's own season-to-date WAR, for context. `None` for a player it does not list.
    pub season_war: Option<f64>,
    /// A one-line summary of what they actually did, e.g. "3-for-5, 2 HR, 4 RBI".
    pub line: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Spotlight {
    pub start: String,
    pub end: String,
    /// True when the caller asked for "now" and the window had to fall back off today
    /// because today has not been played yet. The UI says which day it is showing
    /// rather than presenting last night's slate as this morning's.
    pub resolved_back: bool,
    pub hitters: Vec<Performer>,
    pub pitchers: Vec<Performer>,
}

/// The best hitters and pitchers over the day, week or month ending `date`.
#[tauri::command]
pub async fn get_top_performers(
    state: State<'_, AppState>,
    period: Period,
    date: Option<String>,
    season: Option<String>,
    limit: Option<usize>,
) -> Result<Spotlight> {
    // With no date given, anchor on the last slate that was actually played rather than
    // on today. Today is empty until the evening games are in, and a window over an
    // empty day ranks nobody — see `commands::last_completed_slate`.
    let today = today_mlb();
    let end = match date {
        Some(d) => {
            super::charts::validate_date(&d)?;
            d
        }
        None => super::last_completed_slate(&state.client).await,
    };
    let resolved_back = end != today;
    // The season follows the window, not the wall clock: in January the last completed
    // slate is the previous autumn's, and asking for this year's stats returns nothing.
    let season = season.or_else(|| super::season_of_date(&end)).unwrap_or_else(|| season_or_current(None));
    let start = shift_days(&end, -(period.days() - 1))?;
    let limit = limit.unwrap_or(5).min(25);

    // Four requests, run together: both sides of the window, and both season WAR lists.
    let (hitting, pitching, war_h, war_p) = tokio::join!(
        mlb::fetch_player_stats(
            &state.client, "byDateRange", "hitting", &season, "All", 1500,
            None, None, Some(&start), Some(&end), None,
        ),
        mlb::fetch_player_stats(
            &state.client, "byDateRange", "pitching", &season, "All", 1500,
            None, None, Some(&start), Some(&end), None,
        ),
        mlb::fetch_sabermetrics(&state.client, "hitting", &season),
        mlb::fetch_sabermetrics(&state.client, "pitching", &season),
    );

    // WAR is context, not the ranking: if that request fails the spotlight still works.
    let war_h = war_index(war_h.unwrap_or_default());
    let war_p = war_index(war_p.unwrap_or_default());

    let mut hitters = rank_hitters(&hitting?, &war_h, period);
    let mut pitchers = rank_pitchers(&pitching?, &war_p, period);
    hitters.truncate(limit);
    pitchers.truncate(limit);

    Ok(Spotlight { start, end, resolved_back, hitters, pitchers })
}

/// The clips one player appears in, from one game.
///
/// Filtered on MLB's own `player_id` keyword rather than by looking for the name in the
/// title: "Ohtani's two-run double" and "Dodgers take the lead" are both his, and only
/// the keyword knows that.
#[tauri::command]
pub async fn get_player_highlights(
    state: State<'_, AppState>,
    game_pk: i64,
    person_id: i64,
) -> Result<Vec<Highlight>> {
    let all = mlb::fetch_highlights(&state.client, game_pk).await?;
    Ok(all
        .into_iter()
        .filter(|h| h.player_ids.contains(&person_id))
        .collect())
}

fn war_index(rows: Vec<mlb::models::SabermetricRow>) -> HashMap<i64, f64> {
    rows.into_iter()
        .filter_map(|r| r.war.map(|w| (r.player_id, w)))
        .collect()
}

/* --- The scoring itself ----------------------------------------------------- */

/// Read a stat that may arrive as a number or as a string (".302", "4.2").
fn num(stat: &serde_json::Map<String, serde_json::Value>, key: &str) -> f64 {
    match stat.get(key) {
        Some(serde_json::Value::Number(n)) => n.as_f64().unwrap_or(0.0),
        Some(serde_json::Value::String(s)) => s.parse().unwrap_or(0.0),
        _ => 0.0,
    }
}

/// Innings pitched, from MLB's "4.2" — four and two thirds, not four point two.
fn innings(stat: &serde_json::Map<String, serde_json::Value>) -> f64 {
    let raw = match stat.get("inningsPitched") {
        Some(serde_json::Value::String(s)) => s.clone(),
        Some(serde_json::Value::Number(n)) => n.to_string(),
        _ => return 0.0,
    };
    let (whole, frac) = raw.split_once('.').unwrap_or((raw.as_str(), "0"));
    whole.parse::<f64>().unwrap_or(0.0) + frac.parse::<f64>().unwrap_or(0.0) / 3.0
}

/// Wins added by a hitter over the window, from the window's own line.
pub fn hitter_wins(stat: &serde_json::Map<String, serde_json::Value>) -> f64 {
    let hits = num(stat, "hits");
    let doubles = num(stat, "doubles");
    let triples = num(stat, "triples");
    let hr = num(stat, "homeRuns");
    let singles = (hits - doubles - triples - hr).max(0.0);
    let bb = num(stat, "baseOnBalls") - num(stat, "intentionalWalks");
    let hbp = num(stat, "hitByPitch");
    let ab = num(stat, "atBats");
    let sf = num(stat, "sacFlies");

    let denominator = ab + bb.max(0.0) + sf + hbp;
    if denominator <= 0.0 {
        return 0.0;
    }
    let woba = (W_BB * bb.max(0.0)
        + W_HBP * hbp
        + W_1B * singles
        + W_2B * doubles
        + W_3B * triples
        + W_HR * hr)
        / denominator;

    let pa = num(stat, "plateAppearances").max(denominator);
    let runs_above_average = ((woba - LEAGUE_WOBA) / WOBA_SCALE) * pa;
    // Stolen bases are worth about a fifth of a run each, net of the outs they cost.
    let running = 0.2 * num(stat, "stolenBases") - 0.4 * num(stat, "caughtStealing");
    (runs_above_average + running) / RUNS_PER_WIN
}

/// Wins saved by a pitcher over the window, from runs allowed against a league baseline.
pub fn pitcher_wins(stat: &serde_json::Map<String, serde_json::Value>) -> f64 {
    let ip = innings(stat);
    if ip <= 0.0 {
        return 0.0;
    }
    // Runs, not earned runs: an unearned run costs the team the same, and this is a
    // performance ranking rather than an accounting exercise.
    let runs = num(stat, "runs");
    let ra9 = runs * 9.0 / ip;
    ((LEAGUE_RA9 - ra9) / 9.0) * ip / RUNS_PER_WIN
}

/// Public so a dump harness can produce genuinely real spotlight output, the same way
/// `plays::rank_slate` is.
pub fn rank_hitters(
    rows: &[mlb::models::PlayerStatRow],
    war: &HashMap<i64, f64>,
    period: Period,
) -> Vec<Performer> {
    let eligible: Vec<&mlb::models::PlayerStatRow> = rows
        .iter()
        .filter(|r| num(&r.stat, "plateAppearances") >= period.min_plate_appearances())
        .collect();

    // Production: total bases plus the ways a hitter reaches and drives runs in. Kept
    // separate from the wins estimate so a big counting day is visible even when the
    // rate stats are ordinary.
    let production = |r: &mlb::models::PlayerStatRow| {
        num(&r.stat, "totalBases")
            + num(&r.stat, "baseOnBalls")
            + num(&r.stat, "rbi")
            + num(&r.stat, "runs")
            + num(&r.stat, "stolenBases")
    };

    let wins: Vec<f64> = eligible.iter().map(|r| hitter_wins(&r.stat)).collect();
    let prod: Vec<f64> = eligible.iter().map(|r| production(r)).collect();
    let wars: Vec<f64> = eligible
        .iter()
        .map(|r| war.get(&r.player_id).copied().unwrap_or(0.0))
        .collect();

    let mut out: Vec<Performer> = eligible
        .iter()
        .enumerate()
        .map(|(i, r)| Performer {
            player_id: r.player_id,
            player_name: r.player_name.clone(),
            team_id: r.team_id,
            team_name: r.team_name.clone(),
            position: r.position.clone(),
            score: 100.0
                * (0.50 * share(wins[i], &wins)
                    + 0.30 * share(prod[i], &prod)
                    + 0.20 * share(wars[i], &wars)),
            wins_estimate: round3(wins[i]),
            season_war: war.get(&r.player_id).copied(),
            line: hitting_line(&r.stat),
        })
        .collect();

    out.sort_by(|a, b| b.score.total_cmp(&a.score));
    out
}

pub fn rank_pitchers(
    rows: &[mlb::models::PlayerStatRow],
    war: &HashMap<i64, f64>,
    period: Period,
) -> Vec<Performer> {
    let eligible: Vec<&mlb::models::PlayerStatRow> = rows
        .iter()
        .filter(|r| innings(&r.stat) * 3.0 >= period.min_outs())
        .collect();

    // Strikeouts minus walks over innings: the part of the line a pitcher controls.
    let production = |r: &mlb::models::PlayerStatRow| {
        num(&r.stat, "strikeOuts") - num(&r.stat, "baseOnBalls") + innings(&r.stat)
    };

    let wins: Vec<f64> = eligible.iter().map(|r| pitcher_wins(&r.stat)).collect();
    let prod: Vec<f64> = eligible.iter().map(|r| production(r)).collect();
    let wars: Vec<f64> = eligible
        .iter()
        .map(|r| war.get(&r.player_id).copied().unwrap_or(0.0))
        .collect();

    let mut out: Vec<Performer> = eligible
        .iter()
        .enumerate()
        .map(|(i, r)| Performer {
            player_id: r.player_id,
            player_name: r.player_name.clone(),
            team_id: r.team_id,
            team_name: r.team_name.clone(),
            position: r.position.clone(),
            score: 100.0
                * (0.50 * share(wins[i], &wins)
                    + 0.30 * share(prod[i], &prod)
                    + 0.20 * share(wars[i], &wars)),
            wins_estimate: round3(wins[i]),
            season_war: war.get(&r.player_id).copied(),
            line: pitching_line(&r.stat),
        })
        .collect();

    out.sort_by(|a, b| b.score.total_cmp(&a.score));
    out
}

/// Where a value sits between the pool's worst and best, as 0–1.
///
/// Min-max rather than a z-score on purpose: the components are on wildly different
/// scales (a tenth of a win against twenty total bases), and this puts all of them on
/// the same footing without assuming any of them is normally distributed.
fn share(value: f64, pool: &[f64]) -> f64 {
    let min = pool.iter().copied().fold(f64::INFINITY, f64::min);
    let max = pool.iter().copied().fold(f64::NEG_INFINITY, f64::max);
    if !min.is_finite() || !max.is_finite() || (max - min).abs() < f64::EPSILON {
        return 0.0;
    }
    ((value - min) / (max - min)).clamp(0.0, 1.0)
}

fn hitting_line(stat: &serde_json::Map<String, serde_json::Value>) -> String {
    let mut parts = vec![format!(
        "{}-for-{}",
        num(stat, "hits") as i64,
        num(stat, "atBats") as i64
    )];
    for (key, label) in [
        ("homeRuns", "HR"),
        ("doubles", "2B"),
        ("triples", "3B"),
        ("rbi", "RBI"),
        ("baseOnBalls", "BB"),
        ("stolenBases", "SB"),
    ] {
        let v = num(stat, key) as i64;
        if v > 0 {
            parts.push(format!("{v} {label}"));
        }
    }
    parts.join(", ")
}

fn pitching_line(stat: &serde_json::Map<String, serde_json::Value>) -> String {
    let mut parts = vec![format!(
        "{} IP, {} ER, {} K",
        stat.get("inningsPitched")
            .and_then(|v| v.as_str().map(str::to_string).or_else(|| Some(v.to_string())))
            .unwrap_or_else(|| "0".into()),
        num(stat, "earnedRuns") as i64,
        num(stat, "strikeOuts") as i64
    )];
    let bb = num(stat, "baseOnBalls") as i64;
    if bb > 0 {
        parts.push(format!("{bb} BB"));
    }
    let w = num(stat, "wins") as i64;
    let sv = num(stat, "saves") as i64;
    if w > 0 {
        parts.push(format!("{w} W"));
    }
    if sv > 0 {
        parts.push(format!("{sv} SV"));
    }
    parts.join(", ")
}

fn round3(v: f64) -> f64 {
    (v * 1000.0).round() / 1000.0
}

/// Move a `YYYY-MM-DD` date by whole days.
fn shift_days(date: &str, days: i64) -> Result<String> {
    let parsed = chrono::NaiveDate::parse_from_str(date, "%Y-%m-%d")
        .map_err(|e| Error::other(format!("bad date {date}: {e}")))?;
    Ok((parsed + chrono::Duration::days(days))
        .format("%Y-%m-%d")
        .to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn line(pairs: serde_json::Value) -> serde_json::Map<String, serde_json::Value> {
        pairs.as_object().unwrap().clone()
    }

    #[test]
    fn a_big_day_outscores_a_quiet_one() {
        let huge = line(json!({
            "atBats": 5, "hits": 4, "doubles": 1, "homeRuns": 2, "rbi": 5, "runs": 3,
            "baseOnBalls": 0, "plateAppearances": 5
        }));
        let quiet = line(json!({
            "atBats": 4, "hits": 1, "doubles": 0, "homeRuns": 0, "rbi": 0, "runs": 0,
            "baseOnBalls": 0, "plateAppearances": 4
        }));
        assert!(hitter_wins(&huge) > hitter_wins(&quiet));
        // A 1-for-4 with nothing else is below average, so it must be negative.
        assert!(hitter_wins(&quiet) < 0.0);
    }

    #[test]
    fn a_walk_is_worth_less_than_a_homer() {
        let walked = line(json!({"atBats": 3, "hits": 0, "baseOnBalls": 1, "plateAppearances": 4}));
        let homered =
            line(json!({"atBats": 4, "hits": 1, "homeRuns": 1, "plateAppearances": 4}));
        assert!(hitter_wins(&homered) > hitter_wins(&walked));
    }

    #[test]
    fn innings_are_thirds_not_decimals() {
        let two_and_two_thirds = line(json!({"inningsPitched": "2.2"}));
        assert!((innings(&two_and_two_thirds) - 2.6667).abs() < 0.001);
        // The bug this guards: 2.2 read as two point two, which loses a third of an inning.
        assert!(innings(&two_and_two_thirds) > 2.5);
    }

    #[test]
    fn a_long_shutout_outscores_a_one_inning_save() {
        let starter = line(json!({"inningsPitched": "7.0", "runs": 0, "strikeOuts": 9}));
        let closer = line(json!({"inningsPitched": "1.0", "runs": 0, "strikeOuts": 2}));
        assert!(pitcher_wins(&starter) > pitcher_wins(&closer));
    }

    #[test]
    fn getting_hit_around_is_negative() {
        let shelled = line(json!({"inningsPitched": "3.0", "runs": 8}));
        assert!(pitcher_wins(&shelled) < 0.0);
    }

    #[test]
    fn the_window_ends_on_the_date_given() {
        assert_eq!(shift_days("2026-08-15", 0).unwrap(), "2026-08-15");
        assert_eq!(shift_days("2026-08-15", -6).unwrap(), "2026-08-09");
        // Across a month boundary, which is where naive arithmetic breaks.
        assert_eq!(shift_days("2026-08-02", -6).unwrap(), "2026-07-27");
    }

    #[test]
    fn share_is_zero_when_everyone_is_equal() {
        assert_eq!(share(3.0, &[3.0, 3.0, 3.0]), 0.0);
        assert_eq!(share(5.0, &[1.0, 5.0]), 1.0);
        assert_eq!(share(1.0, &[1.0, 5.0]), 0.0);
    }

    #[test]
    fn the_summary_line_reads_like_a_box_score() {
        let stat = line(json!({
            "atBats": 5, "hits": 3, "homeRuns": 2, "rbi": 4, "baseOnBalls": 1
        }));
        assert_eq!(hitting_line(&stat), "3-for-5, 2 HR, 4 RBI, 1 BB");
    }
}
