//! URL builders for every external endpoint ballview touches.
//!
//! Nothing outside this module should ever contain a hard-coded MLB URL. When the
//! (undocumented, unversioned) Stats API shifts, this is the only file that moves.

pub const STATS_API: &str = "https://statsapi.mlb.com/api/v1";
/// The live feed lives on v1.1, not v1 — this is not a typo.
pub const STATS_API_V11: &str = "https://statsapi.mlb.com/api/v1.1";
pub const SAVANT: &str = "https://baseballsavant.mlb.com";

/// MLB's own sport id for Major League Baseball. Other ids are minors/college.
pub const SPORT_ID_MLB: u32 = 1;

pub fn teams() -> String {
    format!("{STATS_API}/teams?sportId={SPORT_ID_MLB}&activeStatus=Y")
}

/// A single day's schedule. `date` is `YYYY-MM-DD`.
pub fn schedule(date: &str, team_id: Option<u32>) -> String {
    let mut url = format!(
        "{STATS_API}/schedule?sportId={SPORT_ID_MLB}&date={date}\
         &hydrate=team,linescore,game(content(summary))"
    );
    if let Some(id) = team_id {
        url.push_str(&format!("&teamId={id}"));
    }
    url
}

/// An inclusive date range, used by the history backfill.
pub fn schedule_range(start: &str, end: &str, team_id: Option<u32>) -> String {
    let mut url = format!(
        "{STATS_API}/schedule?sportId={SPORT_ID_MLB}&startDate={start}&endDate={end}\
         &hydrate=team,linescore"
    );
    if let Some(id) = team_id {
        url.push_str(&format!("&teamId={id}"));
    }
    url
}

/// Division standings for a season, across both leagues.
///
/// `leagueId=103,104` is the AL and the NL. Each record carries wins, losses, division
/// rank, games back and the current streak — everything shown beside a team's name.
pub fn standings(season: &str) -> String {
    format!(
        "{STATS_API}/standings?leagueId=103,104&season={season}&standingsTypes=regularSeason&hydrate=team,division,league"
    )
}

pub fn live_feed(game_pk: i64) -> String {
    format!("{STATS_API_V11}/game/{game_pk}/feed/live")
}

pub fn game_content(game_pk: i64) -> String {
    format!("{STATS_API}/game/{game_pk}/content")
}

pub fn boxscore(game_pk: i64) -> String {
    format!("{STATS_API}/game/{game_pk}/boxscore")
}

pub fn linescore(game_pk: i64) -> String {
    format!("{STATS_API}/game/{game_pk}/linescore")
}

/// Statcast pitch-level data for one game (Phase 4b, feature-flagged).
pub fn savant_game(game_pk: i64) -> String {
    format!("{SAVANT}/gf?game_pk={game_pk}")
}

/// Savant's single-pitch video page, keyed by the live feed's own `playId`.
///
/// The page is HTML, not JSON: the mp4 it points at is named by an opaque token that is
/// nothing like the `playId`, so the URL cannot be constructed and has to be read out of
/// the markup. `savant::extract_clip_url` does that part.
pub fn savant_clip_page(play_id: &str) -> String {
    format!("{SAVANT}/sporty-videos?playId={play_id}")
}

/// Today's schedule with **no `date` parameter**, letting MLB decide which day that is.
///
/// This is the most authoritative answer to "what is on right now": the server applies
/// its own game-day boundary, so no client-side timezone reasoning can get it wrong.
pub fn schedule_today(team_id: Option<u32>) -> String {
    let mut url = format!(
        "{STATS_API}/schedule?sportId={SPORT_ID_MLB}\
         &hydrate=team,linescore,game(content(summary))"
    );
    if let Some(id) = team_id {
        url.push_str(&format!("&teamId={id}"));
    }
    url
}

/// League-wide player statistics.
///
/// `kind` is MLB's `stats` parameter and decides which of the optional arguments apply:
/// `season` reads a whole year, `byDateRange` needs a start and an end, and
/// `lastXGames` needs `games_back`. Passing the wrong pair is not an error upstream —
/// the extra parameters are simply ignored — so the command above is what keeps them
/// consistent.
///
/// `pool` is MLB's `playerPool`: `Qualified` applies the league's own minimum plate
/// appearances or innings, `All` includes everyone. The distinction matters — sorting
/// the unqualified pool by ERA fills the top of the table with relievers who have thrown
/// a single scoreless inning.
#[allow(clippy::too_many_arguments)]
pub fn player_stats(
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
) -> String {
    let mut url = format!(
        "{STATS_API}/stats?stats={kind}&group={group}&season={season}&sportId={SPORT_ID_MLB}&playerPool={pool}&limit={limit}"
    );
    if let Some(stat) = sort_stat {
        url.push_str(&format!("&sortStat={stat}"));
    }
    if let Some(order) = order {
        url.push_str(&format!("&order={order}"));
    }
    if let Some(start) = start_date {
        url.push_str(&format!("&startDate={start}"));
    }
    if let Some(end) = end_date {
        url.push_str(&format!("&endDate={end}"));
    }
    if let Some(games) = games_back {
        url.push_str(&format!("&gamesBack={games}"));
    }
    url
}

/// One player's biographical record.
pub fn person(person_id: i64) -> String {
    format!("{STATS_API}/people/{person_id}")
}

// ---------------------------------------------------------------------------
// Charts, comparisons and the spotlight
// ---------------------------------------------------------------------------

/// One player's game-by-game line for a season — the series behind a date-axis chart.
///
/// Every split carries its own `date`, so day, week and month buckets are all built from
/// this one request rather than from a call per bucket.
pub fn player_game_log(person_id: i64, group: &str, season: &str) -> String {
    format!("{STATS_API}/people/{person_id}/stats?stats=gameLog&group={group}&season={season}")
}

/// One player's totals over an arbitrary window — a single point on a scatter.
pub fn player_range(person_id: i64, group: &str, season: &str, start: &str, end: &str) -> String {
    format!(
        "{STATS_API}/people/{person_id}/stats?stats=byDateRange&group={group}&season={season}&startDate={start}&endDate={end}"
    )
}

/// Every player on an MLB roster this season, for the comparison picker.
pub fn sport_players(season: &str) -> String {
    format!("{STATS_API}/sports/{SPORT_ID_MLB}/players?season={season}")
}

/// League-wide sabermetrics — WAR, wOBA, wRC+.
///
/// **Season only.** The endpoint accepts `startDate`/`endDate` and ignores them: the
/// numbers come back identical, which was verified against a full season and a single
/// August for the same player. Anything windowed has to be computed from the window's own
/// line instead.
pub fn sabermetrics(group: &str, season: &str, limit: u32) -> String {
    format!(
        "{STATS_API}/stats?stats=sabermetrics&group={group}&season={season}&sportId={SPORT_ID_MLB}&limit={limit}"
    )
}

/// Statcast's per-pitch export for one pitcher over a window.
///
/// CSV, not JSON — this is Savant's search download, the only public source of release
/// speed per pitch. It is aggregated in Rust so a season of five thousand rows never
/// crosses the IPC boundary.
pub fn savant_pitch_csv(person_id: i64, start: &str, end: &str) -> String {
    format!(
        "{SAVANT}/statcast_search/csv?all=true&type=details&player_type=pitcher\
         &pitchers_lookup%5B%5D={person_id}&game_date_gt={start}&game_date_lt={end}\
         &min_pitches=0&min_results=0"
    )
}

// ---------------------------------------------------------------------------
// The most recent completed slate, league highlights, and club news
// ---------------------------------------------------------------------------

/// MLB's own news site, which is where the RSS feeds live. Not the Stats API.
pub const MLB_WWW: &str = "https://www.mlb.com";

/// A date range with **no hydration at all** — game ids, dates and statuses only.
///
/// Used to answer "which was the last day baseball was actually played", which needs
/// nothing but the status. The hydrated variants pull a linescore per game, and a month
/// of those is several megabytes for a question a few kilobytes can answer.
pub fn schedule_plain(start: &str, end: &str) -> String {
    format!("{STATS_API}/schedule?sportId={SPORT_ID_MLB}&startDate={start}&endDate={end}")
}

/// A whole day's slate with every game's highlight reel attached.
///
/// One request rather than one `game/{pk}/content` call per game: a fifteen-game slate
/// would otherwise be fifteen round trips before the first clip could be ranked.
pub fn schedule_with_highlights(date: &str) -> String {
    // No `team` hydration: the schedule already names both clubs by id and name, and
    // this response is large enough without a full club record per side.
    format!(
        "{STATS_API}/schedule?sportId={SPORT_ID_MLB}&date={date}\
         &hydrate=game(content(highlights(highlights)))"
    )
}

/// One club's record, which is where its `teamName` — and therefore its slug — comes from.
pub fn team(team_id: u32) -> String {
    format!("{STATS_API}/teams/{team_id}")
}

/// A club's news feed on mlb.com.
///
/// `slug` is mlb.com's own path segment, which is the club name lowercased with every
/// non-alphanumeric character removed: "D-backs" → `dbacks`, "Red Sox" → `redsox`,
/// "Blue Jays" → `bluejays`. Verified against all thirty clubs — see
/// `commands::news::team_slug`.
pub fn team_news_rss(slug: &str) -> String {
    format!("{MLB_WWW}/{slug}/feeds/news/rss.xml")
}

/// League-wide news, for when no club is followed yet.
pub fn league_news_rss() -> String {
    format!("{MLB_WWW}/feeds/news/rss.xml")
}
