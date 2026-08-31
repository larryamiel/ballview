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
5. **Play-by-play of fielders** — defensive alignment and who fielded each play (putouts/assists).
6. **View clips** — list and play available highlight clips inline.
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
│   ├── components/            # GameList, PlayByPlay, PitchView, FielderView, HighlightPlayer, HistoryLog, TeamFavorites
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
- `get_statcast(game_pk)` — optional Savant enrichment, feature-flagged
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
- **Never compute "today" from the machine clock.** A baseball day is a US concept. On a
  machine ahead of US time (e.g. UTC+8), local midnight lands mid-way through the US
  evening slate, so a locally-derived date asks for tomorrow's games and returns an empty
  Preview list. `get_schedule` with no date sends **no `date` parameter at all**, letting
  MLB apply its own game-day boundary; where a date string is unavoidable, use US Eastern
  (`commands::today_mlb`).
- Highlight mp4 hosts must stay in sync in **two** places: the CSP `media-src` in
  `tauri.conf.json` and `ALLOWED_HOSTS` in `commands/media.rs`. A host missing from either
  is a clip that silently fails. `tests/fixtures.rs` guards this.
