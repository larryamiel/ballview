# ballview

A Windows desktop app for watching Major League Baseball play-by-play in real time,
built with **Tauri 2** (Rust backend + React/TypeScript frontend).

## What it does

ballview connects to official MLB and third-party APIs to show a live, pitch-by-pitch
viewer of every current MLB game. It lets the user favorite a team, then automatically
logs that team's games to an on-disk history. Games are saved as plain files — there is
**no database**.

## Core data sources

| Source | Kind | Purpose |
| --- | --- | --- |
| MLB Stats API (`statsapi.mlb.com`) | Official, keyless | Schedule, teams, live feed, play-by-play, boxscore, linescore, highlights |
| Baseball Savant / Statcast | Official, keyless | Pitch-level and fielder coordinates for richer views |
| Highlightly (**not in v1**) | Third-party, paid/freemium | Bundled video highlights. Deliberately out of scope — see PLAN.md assumptions |

Key MLB Stats API endpoints:

- `GET /api/v1/schedule?sportId=1&date=YYYY-MM-DD` — day's games (add `hydrate=` for nested data)
- `GET /api/v1/teams?sportId=1` — team list (for favoriting)
- `GET /api/v1.1/game/{gamePk}/feed/live` — **live feed**: linescore, `liveData.plays.allPlays[]`
  with per-pitch `playEvents[]`, runners, and fielder attribution
- `GET /api/v1/game/{gamePk}/content` — media + highlights. Playable mp4s come from
  `mlb-cuts-diamond.mlb.com`, `darkroom-clips.mlb.com`, and `bdata-producedclips.mlb.com`
  (verified against real responses; `cuts.diamond.mlb.com` appears in none)
- `GET /api/v1/game/{gamePk}/boxscore` / `/linescore` — fielding positions and line score
- `GET /api/v1/standings?leagueId=103,104&season=YYYY` — every club's W-L, division rank,
  games back and streak. Hydrate `division` for `nameShort` ("AL East")

> Caveat: the MLB Stats API is reverse-engineered and undocumented — no stability guarantee,
> no published rate limits. Treat endpoints/fields as subject to change and centralize all
> HTTP in one Rust module (`src-tauri/src/mlb/`) so breakage is isolated.

## Storage model (file-based, no DB)

Everything lives under the app-data directory (`%APPDATA%/ballview/`):

```
config.json                 # settings + favorited team id(s)
history/{season}/{teamId}.json   # chronological log of the favorited team's games
games/{gamePk}.json         # full saved game snapshot (play-by-play + highlight metadata)
media/{gamePk}/{clipId}.mp4 # downloaded highlight clips (optional, when "save video" is on)
```

A "saved game" is a self-contained JSON snapshot so it can be re-opened offline and can be
exported to any folder as a single file. History logs reference saved games by `gamePk`.

## Features

1. **Current game list** — today's live/upcoming/final games with score + inning state.
2. **Favorite a team** — persist one (or more) favorite team ids.
3. **Favorited team's history log** — chronological list of that team's games, cross-referenced with saved files.
4. **Play-by-play of each pitch** — per-pitch events, count, result, runners.
5. **Box score** — every player's batting and pitching line for the game, both sides,
   with MLB's own footnotes. The defensive alignment is no longer a tab of its own: the
   live and replay views draw it on the play being watched, which is where it means
   something.
6. **View clips** — list and play available highlight clips inline.
6b. **Live view** — the newest pitch from behind the plate, handing over to the field
   when the ball is put in play.
6c. **Replay** — any pitch of any at-bat, drawn the same way, and the real video of it:
   the Umpire / Pitch data / Clip tabs are three readings of the same pitch. The play log
   stays a text record and hands over with a Watch button, so only one screen owns
   "watch a pitch".
8. **Player stats** — hitting and pitching leaderboards over a season, a date window, or
   each player's last N games, with a starter/reliever split and a games minimum.
8b. **Charts and comparisons** — several players on one plot: a stat over time (game, day,
   week or month, on a zoom control) or stat against stat over a window. Release speed is
   chartable too, from Statcast.
8c. **Spotlight** — player of the day, week and month for hitters and pitchers, with the
   games behind the award and the clips that player appears in.
7. **Attach highlight video to history** — optionally download/store a clip alongside the saved game.

## Tech stack

- **Tauri 2** (Rust backend, system webview frontend) — Windows desktop shell.
- **Rust crates**: `reqwest` (HTTP, rustls), `tokio`, `serde`/`serde_json`, `chrono`,
  `tauri-plugin-dialog` + `tauri-plugin-fs` (export/import game files).
- **Frontend**: React 18 + TypeScript + Vite, TanStack Query (API caching/polling),
  Zustand (light app state), plain CSS (or CSS modules).

## Project structure (planned)

```
ballview/
├── CLAUDE.md                  # this file
├── PLAN.md                    # execution plan
├── package.json / vite.config.ts / tsconfig.json / index.html
├── src/                       # React frontend
│   ├── App.tsx  main.tsx
│   ├── components/            # GameList, GameView, ScoreBoard, PlayByPlay, PitchView, BallPath,
│   │                          #   LiveView, ReplayView, UmpireView, FieldDiagram, Matchup,
│   │                          #   BoxScore, HighlightPlayer, HistoryLog, GameCalendar,
│   │                          #   TeamPicker, PlayerStats, PlayerPreview, PitchPlot,
│   │                          #   PlayersScreen, PlayerCompare, SpotlightPanel, PitchRail
│   ├── charts/                 # Chart.tsx (SVG line/scatter), stats.ts (defs + bucketing)
│   │   └── ui/                # TeamLogo, PlayerHeadshot, Brand, States (skeleton/empty/error)
│   ├── hooks/                 # useLiveFeed (polling), etc.
│   ├── lib/                   # api.ts (typed Tauri command client), types.ts (MLB data types)
│   └── store/
└── src-tauri/                 # Rust backend
    ├── Cargo.toml  tauri.conf.json  build.rs  icons/
    └── src/
        ├── main.rs  lib.rs
        ├── mlb/               # client.rs, models.rs, endpoints.rs, savant.rs (ALL external HTTP here)
        ├── storage/           # config.rs, game_files.rs
        └── commands/          # schedule.rs, live.rs, favorites.rs, history.rs, media.rs (Tauri commands)
```

## Tauri command surface (Rust → frontend)

- `get_teams()` / `get_schedule(date, team_id?)` / `get_live_feed(game_pk)` / `get_game_content(game_pk)` / `get_boxscore(game_pk)`
- `get_standings(season?)` — flattened team records, for the picker and the scoreboard
- `get_player_stats(group, range, season?, sortStat?, order?, qualified?)` — leaderboards;
  `range` is a tagged enum (`season` / `dateRange` / `lastGames`)
- `get_person(person_id)` — one player's biography, for the stats preview card
- `get_statcast(game_pk)` — optional Savant enrichment, feature-flagged
- `get_pitch_clip(play_id)` — Savant's video of one pitch; `None` when there is none
- `get_player_game_log(person_id, group, season?)` — dated per-game lines, the series
  behind every time chart
- `get_player_range(person_id, group, start, end, season?)` — one windowed line per player
- `search_players(query, season?, limit?)` — ranked name search for the chart picker
- `get_pitch_speeds(person_id, start, end)` — Statcast release speed, averaged per day
- `get_top_performers(period, date?, season?, limit?)` — the spotlight ranking
- `get_player_highlights(game_pk, person_id)` — a game's clips, filtered to one player
- `get_favorite_team()` / `set_favorite_team(team_id)`
- `save_game(game_pk, snapshot)` / `list_saved_games(team_id?)` / `load_game(game_pk)` / `export_game(game_pk, path)`
- `get_history(team_id, season?)`
- `download_highlight(url, game_pk, clip_id)`

## How to run

```bash
npm install
npm run tauri dev      # dev build
npm run tauri build    # production Windows installer
```

## Notes for contributors

- All network calls go through Rust commands (not the webview) to avoid CORS and keep URLs
  in one place. Do not `fetch` from the frontend.
- Live views poll the live-feed command on a ~15s interval while a game is in progress.
- Any external HTTP/URL change should be confined to `src-tauri/src/mlb/`.
- Club logos and player headshots are plain `<img src>` references to MLB's CDNs
  (`lib/assets.ts`), not `fetch` calls — no CORS surface, so the no-network-in-the-webview
  rule is untouched. Any new image host must be added to `img-src` in `tauri.conf.json`
  or it silently renders as fallback initials.
- `UmpireView` projects the ball through a pinhole camera at the plate umpire's eye
  (`EYE`, 4 ft behind the plate at 4.3 ft). The eye height fixes the horizon, and the
  zone and the ground geometry are framed around it — moving `EYE.z` or `FRAME_HALF_WIDTH`
  without re-checking the framing pushes the strike zone off the picture.
- There is no sidebar: navigation is the title bar's centre column (`App.tsx`), so the
  whole width below it belongs to the game. The title bar is a `1fr auto 1fr` grid —
  that is what keeps the nav in the true centre as the brand and the club picker change
  width. Section *labels* are "My Team" and "Players"; the store's ids are still
  `history` and `stats`, and renaming those would invalidate nothing but is not worth
  the churn.
- A game's tabs are Live · Replay · Play-by-play · Box score · Highlights, centred under
  the scoreboard. The live and replay stages are both selector · picture · numbers, and
  the two side columns are deliberately the *same* width: unequal ones put the frame's
  centre some 60px left of the window's, which is visible the moment you look for it.
  `PitchRail` is the one selector both screens use.
- The live view follows the newest pitch until you pick one from the rail, which pins it
  so a poll cannot yank the picture away mid-study; the pin drops when the at-bat changes. AVG, OPS and
  ERA in the box score come from `seasonStats`, not from the game line: a rate computed
  over four at-bats is noise. `battingOrder` is a string — hundreds are the lineup slot
  and a non-zero remainder marks a replacement, so sorting on the number alone puts a
  pinch hitter directly under the starter they hit for.
- **WAR is season-to-date only.** MLB's `sabermetrics` stat group publishes it, accepts
  `startDate`/`endDate`, and *ignores them* — the same player returns an identical WAR for
  a whole season and for one August. So the spotlight cannot rank on it: it ranks on a
  wins estimate computed from the window's own line with linear weights (see the module
  doc in `commands/spotlight.rs`), and uses season WAR only as a 20% quality prior.
- **A rate cannot be averaged.** Bucketing a game log into weeks means summing the
  counting fields and recomputing OPS or ERA from those totals; the mean of seven daily
  OPS figures is not a week's OPS. `components/charts/stats.ts` declares, per stat, which
  fields it is built from. Innings are summed as *outs* — "5.2 + 5.2" is 11⅓ innings.
- `/people/{id}/stats` responses have **no `player` object** — the player is already named
  by the URL. `flatten_stats` drops player-less splits, so the per-player window fetch has
  its own flattener; reusing the league-wide one returned nothing for every scatter point.
- Statcast velocity comes from Savant's **CSV** search export (`statcast_search/csv`),
  which is the only public per-pitch source. It is aggregated to one row per date and
  pitch type in Rust so a season of five thousand pitches never crosses the IPC boundary,
  and the chart shows four-seamers alone by default — mixing a changeup into the same line
  reads as a velocity drop that is really a pitch-selection change.
- `GameCalendar` is My Team's default layout; the list is the alternative. Months come
  from the log's own entries, so a season with no games renders nothing rather than an
  empty January.
- The batted ball in `FieldDiagram` is placed from `hitData.coordinates`, MLB's old
  stringer grid: home plate at (125.42, 198.27), y growing *down*, ~2.5 ft to the unit.
  The scale is undocumented — it was derived from the fixture, where three fly balls'
  own `totalDistance` give 2.51, 2.48 and 2.50 ft per unit. Spray angle and distance are
  mapped separately onto the drawing, because the drawn infield is deliberately larger
  than a real one and a single ratio would put a ball down the line in foul ground.
- A ball and its shadow, not one marker: a top-down view cannot otherwise tell a 400-ft
  fly from a one-hopper. The gap between them is the only height cue there is.
- Stats leaderboards are sorted by MLB (`sortStat`), not in the browser: the response is
  capped, so a client-side sort of a truncated list would put the wrong players on top.
  The role and games-minimum filters *are* client-side, which is only sound because the
  request asks for the whole league rather than a page.
- `playerPool` defaults to `Qualified`. Sorting the unqualified pool by a rate stat fills
  the leaderboard with relievers who have thrown one scoreless inning.
- The scoreboard's collapse uses two scroll thresholds, not one. Collapsing removes
  ~150px of sticky header, which can carry the scroll back across a single trigger point
  and flicker; the dead zone between `CONDENSE_BELOW` and `EXPAND_ABOVE` prevents it.
- The ball-path preview integrates `pitchData.coordinates`' nine trajectory parameters
  (`x0..aZ`). `tests/trajectory.rs` reproduces MLB's own published `pX`/`pZ` from them, so
  a renamed or dropped field fails the suite instead of quietly blanking the view.
- **Never compute "today" from the machine clock.** A baseball day is a US concept. On a
  machine ahead of US time (e.g. UTC+8), local midnight lands mid-way through the US
  evening slate, so a locally-derived date asks for tomorrow's games and returns an empty
  Preview list. `get_schedule` with no date sends **no `date` parameter at all**, letting
  MLB apply its own game-day boundary; where a date string is unavoidable, use US Eastern
  (`commands::today_mlb`).
- Highlight mp4 hosts must stay in sync in **two** places: the CSP `media-src` in
  `tauri.conf.json` and `ALLOWED_HOSTS` in `commands/media.rs`. A host missing from either
  is a clip that silently fails. `tests/fixtures.rs` guards this.
- Per-pitch video comes from Savant's `/sporty-videos?playId=…` page, keyed by the live
  feed's own `playId` — the same id joins the two APIs. The mp4 sits on
  `sporty-clips.mlb.com` under an opaque token that is **not** derivable from the playId,
  so the URL has to be scraped out of the HTML (`savant::extract_clip_url`), and its `=`
  padding arrives as `&#x3D;` entities. Every tracked pitch has a clip, not only
  highlights. Cloudflare 403s a request with no User-Agent or a bare `Mozilla/5.0`; the
  app's own UA is fine, so nothing is spoofed.
- `linescore.defense` is the alignment **right now**, which is the wrong answer for a
  replayed at-bat — half an inning later the sides have swapped and it draws the batting
  team fielding. `alignmentForPlay` rebuilds it from the half inning, the boxscore, the
  matchup's pitcher and the play's fielding credits. Those credits name a player by id
  and link only, with no `fullName`, so they are resolved back through the boxscore —
  assigning the bare credit blanks the marker.
