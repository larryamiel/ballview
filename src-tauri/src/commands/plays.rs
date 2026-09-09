//! Play of the day: the best clips from across the league, not just one club's game.
//!
//! # Where the clips come from
//!
//! One request, not thirty: the schedule hydrated with `content(highlights(highlights))`
//! returns every game on a date with its whole reel attached. A fifteen-game slate is
//! roughly 150 clips, and ranking them is a local operation from there.
//!
//! # How they are ranked, and why these parameters
//!
//! MLB publishes no "play of the day" and puts no rating on a clip, so the ranking is
//! this app's own judgement, made explicit rather than hidden:
//!
//! 1. **Anything that is not a play is dropped.** Recaps, condensed games, interviews
//!    and press conferences all arrive in the same array as the plays. They are excluded
//!    on MLB's own taxonomy (`mlb_recap`, `condensed_game`, ...) rather than by guessing
//!    from the headline, and so is anything longer than two minutes -- no single play
//!    takes that long.
//! 2. **The taxonomy sets the floor.** A clip tagged `home-run` or `defense` starts
//!    above a clip tagged only `hitting`; `long-home-runs` starts above both.
//! 3. **The headline supplies what the taxonomy cannot.** MLB has no tag for a walk-off,
//!    a grand slam, a robbed home run or an immaculate inning, but it always writes them
//!    into the headline, so those phrases carry the largest weights in the table below.
//! 4. **Statcast distance is a tiebreaker, not a driver.** A 470-foot homer beats a
//!    390-foot one, but by less than a walk-off beats either.
//! 5. **At most two clips from one game.** Without a cap a single seven-homer blowout
//!    fills the entire list, which is the opposite of what a league-wide view is for.
//!
//! The weights are arbitrary in the sense that any such table is, but they are ordered
//! deliberately: the rarity of the event is what earns the points.

use serde::Serialize;
use tauri::State;

use super::AppState;
use crate::error::Result;
use crate::mlb::{
    self,
    models::{Highlight, HighlightScheduleGame, TopPlay},
};

/// Nothing longer than this is a single play -- it is a recap or a condensed game.
const MAX_PLAY_SECONDS: u32 = 120;
/// Nothing shorter than this is watchable; a two-second stub is a broken asset.
const MIN_PLAY_SECONDS: u32 = 5;
/// How many clips one game may contribute, so a blowout cannot own the list.
const MAX_PER_GAME: usize = 2;

/// Tags that mean "this is not a play". Matched as substrings so both spellings of
/// `condensed-game` / `condensed_game` are caught by one entry.
const NOT_A_PLAY: &[&str] = &[
    "recap",
    "condensed",
    "interview",
    "presser",
    "press-conference",
    "preview",
    "highlight-reel",
    "manager",
];

/// Taxonomy weights -- what kind of play this is.
///
/// Only the **largest** matching weight is counted, never their sum: these tags name one
/// event's kind, and a 450-foot homer carries `home-run`, `long-home-runs` and `hitting`
/// all at once. Adding them up made an ordinary long home run outscore a walk-off single
/// on real data, which is the wrong answer to "what was the play of the day".
const TAG_WEIGHTS: &[(&str, f64, &str)] = &[
    ("long-home-runs", 3.0, "Long home run"),
    ("home-run", 2.5, "Home run"),
    ("defense", 2.0, "Defence"),
    ("pitching", 1.0, "Pitching"),
    ("pennant-chase", 1.0, "Pennant race"),
    ("hitting", 0.5, "Hit"),
];

/// Headline weights -- the moments the taxonomy has no tag for.
///
/// Ordered by rarity, which is the whole basis of the ranking: a walk-off happens a few
/// times a night across the league, a diving catch happens a few times a game.
const PHRASE_WEIGHTS: &[(&str, f64, &str)] = &[
    ("walk-off", 7.0, "Walk-off"),
    ("walkoff", 7.0, "Walk-off"),
    ("perfect game", 7.0, "Perfect game"),
    ("no-hitter", 6.5, "No-hitter"),
    ("grand slam", 5.5, "Grand slam"),
    ("grand-slam", 5.5, "Grand slam"),
    ("immaculate", 5.0, "Immaculate inning"),
    ("inside-the-park", 5.0, "Inside-the-park homer"),
    ("triple play", 5.0, "Triple play"),
    ("for the cycle", 4.5, "Cycle"),
    ("robs", 4.0, "Robbed a home run"),
    ("robbed", 4.0, "Robbed a home run"),
    ("steals a", 3.0, "Robbed a hit"),
    ("diving", 2.5, "Diving catch"),
    ("leaping", 2.5, "Leaping catch"),
    ("over the wall", 2.5, "Over the wall"),
    ("behind the back", 2.5, "Behind the back"),
    ("go-ahead", 2.0, "Go-ahead"),
    ("game-tying", 2.0, "Game-tying"),
    ("double play", 1.5, "Double play"),
    ("strikes out the side", 1.5, "Strikeout side"),
    ("stellar", 1.5, "Stellar play"),
    ("great catch", 1.5, "Great catch"),
    ("throws out", 1.5, "Throws out a runner"),
];

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TopPlays {
    /// The slate these plays came from.
    pub date: String,
    /// True when the date was resolved back off today because today is not played yet.
    pub resolved_back: bool,
    pub plays: Vec<TopPlay>,
}

/// The best plays from one day across the league.
///
/// With no `date`, the last slate that was actually played -- the same rule the spotlight
/// uses, and for the same reason: today's clips do not exist until today's games do.
#[tauri::command]
pub async fn get_top_plays(
    state: State<'_, AppState>,
    date: Option<String>,
    team_id: Option<i64>,
    limit: Option<usize>,
) -> Result<TopPlays> {
    let today = super::today_mlb();
    let date = match date {
        Some(d) => {
            super::charts::validate_date(&d)?;
            d
        }
        None => super::last_completed_slate(&state.client).await,
    };
    let resolved_back = date != today;
    let limit = limit.unwrap_or(12).min(50);

    let slate = mlb::fetch_slate_highlights(&state.client, &date).await?;
    let plays = rank_slate(&slate, team_id, limit);

    Ok(TopPlays {
        date,
        resolved_back,
        plays,
    })
}

/// Rank every clip on a slate, keeping at most `MAX_PER_GAME` from any one game.
pub fn rank_slate(
    slate: &[(HighlightScheduleGame, Vec<Highlight>)],
    team_id: Option<i64>,
    limit: usize,
) -> Vec<TopPlay> {
    let mut scored: Vec<TopPlay> = Vec::new();

    for (game, clips) in slate {
        let (away, home) = teams_of(game);
        for clip in clips {
            // A club filter looks at the clip's own tags, not the game's sides: a clip
            // from a game the club played that is entirely about the opposing pitcher is
            // not "my team's highlight".
            if let Some(id) = team_id {
                if !clip.team_ids.contains(&id) {
                    continue;
                }
            }
            let Some((score, reason)) = score_play(clip) else {
                continue;
            };
            scored.push(TopPlay {
                game_pk: game.game_pk,
                date: game.official_date.clone(),
                away_team: away.0.clone(),
                home_team: home.0.clone(),
                away_team_id: away.1,
                home_team_id: home.1,
                team_ids: clip.team_ids.clone(),
                reason,
                score: (score * 100.0).round() / 100.0,
                clip: clip.clone(),
            });
        }
    }

    // Highest first; ties broken on the clip id so the same slate always ranks the same
    // way rather than shuffling between polls.
    scored.sort_by(|a, b| {
        b.score
            .total_cmp(&a.score)
            .then_with(|| a.clip.id.cmp(&b.clip.id))
    });

    let mut per_game: std::collections::HashMap<i64, usize> = std::collections::HashMap::new();
    let mut out = Vec::with_capacity(limit);
    for play in scored {
        let count = per_game.entry(play.game_pk).or_insert(0);
        if *count >= MAX_PER_GAME {
            continue;
        }
        *count += 1;
        out.push(play);
        if out.len() >= limit {
            break;
        }
    }
    out
}

/// Score one clip, or `None` if it is not a play at all.
pub fn score_play(clip: &Highlight) -> Option<(f64, String)> {
    // No mp4 means nothing to watch. Better to leave it out than to rank a dead card
    // into first place.
    clip.url.as_deref()?;

    if clip
        .tags
        .iter()
        .any(|t| NOT_A_PLAY.iter().any(|bad| t.contains(bad)))
    {
        return None;
    }

    let seconds = duration_seconds(clip.duration.as_deref()).unwrap_or(0);
    if seconds > MAX_PLAY_SECONDS {
        return None;
    }
    // A missing duration is not a rejection -- some clips omit it -- but a present and
    // implausibly short one is.
    if seconds > 0 && seconds < MIN_PLAY_SECONDS {
        return None;
    }

    let text = format!(
        "{} {}",
        clip.title.to_lowercase(),
        clip.description.as_deref().unwrap_or("").to_lowercase()
    );

    let mut score = 1.0;
    let mut reason: Option<(f64, &str)> = None;
    let consider = |weight: f64, label: &'static str, reason: &mut Option<(f64, &str)>| {
        if reason.map(|(w, _)| weight > w).unwrap_or(true) {
            *reason = Some((weight, label));
        }
    };

    // The kind of play: the best single match, not the sum of every tag it carries.
    if let Some((weight, label)) = TAG_WEIGHTS
        .iter()
        .filter(|(tag, _, _)| clip.tags.iter().any(|t| t == tag))
        .map(|(_, weight, label)| (*weight, *label))
        .max_by(|a, b| a.0.total_cmp(&b.0))
    {
        score += weight;
        consider(weight, label, &mut reason);
    }

    // What happened in it: these do compound. A go-ahead grand slam is both, and is
    // rarer and better than either on its own.
    for (phrase, weight, label) in PHRASE_WEIGHTS {
        if text.contains(phrase) {
            score += weight;
            consider(*weight, label, &mut reason);
        }
    }

    // Statcast distance, when MLB writes it into the blurb ("a 456-foot home run").
    if let Some(feet) = feet_in(&text) {
        score += ((feet - 380.0) / 40.0).clamp(0.0, 2.0);
    }

    // A play reads best at somewhere between ten seconds and a minute. Outside that it
    // is either a stub or a montage.
    if (10..=60).contains(&seconds) {
        score += 1.0;
    }

    Some((
        score,
        reason
            .map(|(_, l)| l.to_string())
            .unwrap_or_else(|| "Highlight".into()),
    ))
}

/// MLB's "00:00:32" or "01:23" as whole seconds.
fn duration_seconds(raw: Option<&str>) -> Option<u32> {
    let raw = raw?;
    let parts: Vec<u32> = raw
        .split(':')
        .map(|p| p.trim().parse::<u32>().unwrap_or(0))
        .collect();
    match parts.as_slice() {
        [h, m, s] => Some(h * 3600 + m * 60 + s),
        [m, s] => Some(m * 60 + s),
        [s] => Some(*s),
        _ => None,
    }
}

/// The largest "NNN-foot" or "NNN feet" figure in a blurb, if there is one.
fn feet_in(text: &str) -> Option<f64> {
    let mut best: Option<f64> = None;
    for marker in ["-foot", " foot", " feet", "-feet", " ft"] {
        let mut rest = text;
        while let Some(at) = rest.find(marker) {
            let digits: String = rest[..at]
                .chars()
                .rev()
                .take_while(|c| c.is_ascii_digit())
                .collect::<Vec<_>>()
                .into_iter()
                .rev()
                .collect();
            if let Ok(v) = digits.parse::<f64>() {
                // A batted ball or it is not a distance at all -- "6 foot 4" is a
                // player's height, not a home run.
                if (200.0..600.0).contains(&v) && best.map(|b| v > b).unwrap_or(true) {
                    best = Some(v);
                }
            }
            rest = &rest[at + marker.len()..];
        }
    }
    best
}

/// The two clubs in a game, as `(name, id)` pairs: away first, then home.
type Side = (Option<String>, Option<i64>);

fn teams_of(game: &HighlightScheduleGame) -> (Side, Side) {
    let side = |s: Option<&crate::mlb::models::ScheduleTeamSide>| {
        let team = s.and_then(|s| s.team.as_ref());
        (
            team.and_then(|t| t.name.clone().or_else(|| t.team_name.clone())),
            team.map(|t| t.id),
        )
    };
    let teams = game.teams.as_ref();
    (
        side(teams.and_then(|t| t.away.as_ref())),
        side(teams.and_then(|t| t.home.as_ref())),
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    fn clip(title: &str, tags: &[&str], duration: &str) -> Highlight {
        Highlight {
            id: title.to_string(),
            title: title.to_string(),
            description: None,
            duration: Some(duration.to_string()),
            date: None,
            url: Some("https://mlb-cuts-diamond.mlb.com/x.mp4".into()),
            thumbnail: None,
            player_ids: vec![],
            team_ids: vec![119, 113],
            tags: tags.iter().map(|t| t.to_string()).collect(),
        }
    }

    #[test]
    fn a_recap_is_not_a_play() {
        assert!(score_play(&clip("Reds vs. Dodgers", &["mlb_recap"], "00:03:14")).is_none());
        assert!(score_play(&clip("Condensed Game", &["condensed_game"], "00:11:29")).is_none());
    }

    #[test]
    fn anything_over_two_minutes_is_not_one_play() {
        assert!(score_play(&clip("Long montage", &["home-run"], "00:04:00")).is_none());
    }

    #[test]
    fn a_clip_with_no_mp4_is_dropped() {
        let mut c = clip("Ohtani homers", &["home-run"], "00:00:25");
        c.url = None;
        assert!(score_play(&c).is_none());
    }

    #[test]
    fn a_walk_off_outranks_an_ordinary_homer() {
        let walk_off =
            score_play(&clip("Smith's walk-off homer", &["home-run"], "00:00:35")).unwrap();
        let ordinary = score_play(&clip("Smith's solo homer", &["home-run"], "00:00:35")).unwrap();
        assert!(walk_off.0 > ordinary.0);
        assert_eq!(walk_off.1, "Walk-off");
    }

    #[test]
    fn a_robbed_home_run_outranks_a_routine_hit() {
        let robbed = score_play(&clip("Betts robs a home run", &["defense"], "00:00:22")).unwrap();
        let single = score_play(&clip("Betts' RBI single", &["hitting"], "00:00:22")).unwrap();
        assert!(robbed.0 > single.0);
    }

    #[test]
    fn the_kind_of_play_is_counted_once_not_per_tag() {
        // The real shape of a long home run's tags. Before this was a max rather than a
        // sum, three stacked tags plus the distance bonus beat a walk-off.
        let long_homer = score_play(&clip(
            "Walker's 451-foot three-run homer",
            &["home-run", "long-home-runs", "hitting"],
            "00:00:30",
        ))
        .unwrap();
        let walk_off =
            score_play(&clip("Lara's walk-off single", &["hitting"], "00:00:30")).unwrap();
        assert!(
            walk_off.0 > long_homer.0,
            "a walk-off is the play of the day over a long but ordinary homer: {} vs {}",
            walk_off.0,
            long_homer.0
        );
        assert_eq!(long_homer.1, "Long home run");
    }

    #[test]
    fn distance_is_a_tiebreaker_not_a_driver() {
        let far = score_play(&clip("A 470-foot home run", &["home-run"], "00:00:30"))
            .unwrap()
            .0;
        let near = score_play(&clip("A 390-foot home run", &["home-run"], "00:00:30"))
            .unwrap()
            .0;
        let walk_off = score_play(&clip("A walk-off single", &["hitting"], "00:00:30"))
            .unwrap()
            .0;
        assert!(far > near, "a longer homer should rank higher");
        assert!(walk_off > far, "a walk-off must beat a long but ordinary homer");
    }

    #[test]
    fn a_players_height_is_not_a_home_run_distance() {
        assert_eq!(feet_in("the 6 foot 4 rookie"), None);
        assert_eq!(feet_in("a 451-foot blast"), Some(451.0));
    }

    #[test]
    fn durations_are_read_as_hours_minutes_seconds() {
        assert_eq!(duration_seconds(Some("00:00:32")), Some(32));
        assert_eq!(duration_seconds(Some("00:11:29")), Some(689));
        assert_eq!(duration_seconds(Some("01:05")), Some(65));
        assert_eq!(duration_seconds(None), None);
    }

    #[test]
    fn one_game_cannot_fill_the_list() {
        let game = HighlightScheduleGame {
            game_pk: 1,
            ..Default::default()
        };
        let clips: Vec<Highlight> = (0..6)
            .map(|i| clip(&format!("Homer number {i}"), &["home-run"], "00:00:30"))
            .collect();
        let out = rank_slate(&[(game, clips)], None, 10);
        assert_eq!(out.len(), MAX_PER_GAME);
    }

    #[test]
    fn the_club_filter_reads_the_clips_own_tags() {
        let game = HighlightScheduleGame {
            game_pk: 1,
            ..Default::default()
        };
        let mut theirs = clip("Their homer", &["home-run"], "00:00:30");
        theirs.team_ids = vec![147];
        let ours = clip("Our homer", &["home-run"], "00:00:30");
        let out = rank_slate(&[(game, vec![theirs, ours])], Some(119), 10);
        assert_eq!(out.len(), 1);
        assert_eq!(out[0].clip.title, "Our homer");
    }
}
