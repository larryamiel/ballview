# ballview

A Windows desktop app for watching Major League Baseball play-by-play in real time.
Built with [Tauri 2](https://tauri.app) — a Rust backend behind the system WebView, with
a React + TypeScript frontend.

Favorite a team, and ballview keeps an on-disk log of its games. Games are saved as
plain JSON files. **There is no database.**

![status](https://img.shields.io/badge/status-in%20development-blue)

## Features

| # | Feature | Where |
| --- | --- | --- |
| 1 | Today's games with score and inning state | `GameList.tsx` |
| 2 | Favorite a team | `TeamFavorites.tsx` |
| 3 | The favorited team's game log, with backfill | `HistoryLog.tsx` |
| 4 | Every pitch: type, speed, location, count, result | `PitchView.tsx` |
| 5 | Defensive alignment and who fielded each play | `FielderView.tsx` |
| 6 | Watch highlight clips inline | `HighlightPlayer.tsx` |
| 7 | Attach a highlight to a saved game | `commands/media.rs` |

Plus export and import of a game as a single portable `.json` file.

## Requirements

- **Windows 10/11**
- **Node.js** 20+
- **Rust** (MSVC toolchain) — `winget install Rustlang.Rustup`
- **Microsoft C++ Build Tools** with the Windows SDK:
  ```
  winget install Microsoft.VisualStudio.2022.BuildTools --override "--wait --passive --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"
  ```
- **WebView2 runtime** — preinstalled on Windows 11

## Running it

```bash
npm install
npm run tauri dev      # dev build with hot reload
npm run tauri build    # production Windows installer (NSIS)
```

## Tests

```bash
cd src-tauri
cargo test                                        # offline: unit + fixture tests
cargo test --test live_api -- --ignored --nocapture   # hits the real MLB API
```

`tests/fixtures/` holds genuine captured MLB responses, so model parsing is verified
offline and in CI. `tests/live_api.rs` is `#[ignore]` by default — run it deliberately
when you want to check the models against upstream, which is the intended way to catch a
field rename before users do.

## Architecture

```
src/                    React frontend
  lib/api.ts            typed wrappers over every Tauri command (the only invoke site)
  lib/types.ts          TS mirrors of the Rust models
  components/           one per feature
  hooks/useLiveFeed.ts  polling, which stops on its own when a game goes Final
src-tauri/src/
  mlb/                  ALL external HTTP. endpoints.rs is the only place a URL appears
  storage/              plain files: config, snapshots, history logs
  commands/             the Rust→frontend surface
```

Two rules hold the design together:

- **The frontend makes no network requests.** Everything goes through a Rust command,
  which sidesteps CORS and keeps every MLB URL in one module.
- **The frontend does not touch the filesystem.** It uses the dialog plugin to let the
  user pick a path, then hands that path to Rust. The Tauri capability grant is
  correspondingly narrow — read-only, scoped to ballview's own app-data directory.

## Where files live

Everything is under `%APPDATA%/ballview/`:

```
config.json                      settings + favorited team ids
history/{season}/{teamId}.json   the team's game log
games/{gamePk}.json              a full, self-contained game snapshot
media/{gamePk}/{clipId}.mp4      downloaded highlight clips
```

A snapshot holds the feed, boxscore, and highlight metadata together, so a saved game
reopens with no network and exports as one file.

**History is keyed by the API's `season` field, not the calendar year.** Spring training,
the regular season, and the postseason share one season value and therefore one file;
each entry stores its `gameType` so the UI can filter. Entries are upserted by `gamePk`,
never appended blindly, so re-logging an in-progress game updates it instead of
duplicating it.

## Data sources, and the caveats that matter

| Source | Purpose |
| --- | --- |
| MLB Stats API (`statsapi.mlb.com`) | Schedule, teams, live feed, boxscore, highlights |
| Baseball Savant | Optional Statcast enrichment, off by default |

The Stats API is **reverse-engineered, undocumented, and unversioned.** MLB changes it
without notice and publishes no rate limits. ballview is built accordingly:

- Every model field is optional, so an upstream rename degrades one corner of the UI
  rather than breaking the whole parse.
- All HTTP is confined to `src-tauri/src/mlb/`, so breakage has one blast radius.
- Polling is 15s, only for games actually in progress, with backoff on 429 and 5xx.

Two things the validation spike caught that documentation got wrong, and which are worth
knowing if you extend this:

1. **Do not compute "today" from the machine clock.** A baseball day is a US concept. On
   a machine at UTC+8, local midnight arrives in the middle of the US evening slate, so a
   local date asks for tomorrow's games and returns an empty list. The no-date path sends
   no date at all and lets MLB apply its own boundary.
2. **Highlight mp4s do not come from `cuts.diamond.mlb.com`.** In real responses they come
   from `mlb-cuts-diamond.mlb.com`, `darkroom-clips.mlb.com`, and
   `bdata-producedclips.mlb.com`. These hosts must appear in *both* the CSP `media-src`
   in `tauri.conf.json` and the downloader allowlist in `commands/media.rs`; a fixture
   test asserts they stay in sync.

## Not in v1

**Highlightly** (a paid third-party highlights API) is deliberately out of scope. MLB's
own content feed covers Features 6 and 7. Revisit only if MLB clips prove unusable.

## Disclaimer

ballview is unofficial and unaffiliated with Major League Baseball. It reads publicly
accessible MLB endpoints for personal use. Clip availability and geo-restrictions are
MLB's, not ballview's.
