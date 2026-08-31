# ballview — Execution Plan

A phased plan to build the ballview Windows desktop app. Each phase ends in a runnable,
verifiable milestone so the app can be tested continuously rather than built all at once.

## Assumptions & open decisions

| Decision | Default chosen | Notes |
| --- | --- | --- |
| Frontend framework | React 19 + TypeScript + Vite | Scaffold ships React 19; plan originally said 18 |
| HTTP location | Rust commands via `reqwest` | Avoids CORS; centralizes all MLB endpoints |
| Primary data source | MLB Stats API (keyless) | Free, official; undocumented + unstable — isolated in `src-tauri/src/mlb/` |
| Highlight clips | MLB `game/{pk}/content` | Highlightly is out of scope for v1 (row below) |
| Polling cadence | 15s during live games | Move to WebSocket/SSE only if MLB ever exposes one |
| Favorites | Single favorite team (extensible to N) | Stored in `config.json` |
| Video storage | Optional download; default URL-only | "Attach highlight" toggles downloading the mp4 |
| Statcast enrichment | Deferred to Phase 4b, behind a flag | Stats API alone covers Features 4–5; Savant adds coordinates |
| Highlightly | **Out of scope for v1** | No key storage, no client. Revisit only if MLB clips prove unusable |
| History season key | `season` field from the Stats API game record | Not derived from the calendar year — see Phase 2 |

---

## Phase 0 — Project scaffold (day 1)

**Goal:** a "Hello, ballview" Tauri window builds and runs on Windows.

- [ ] Initialize git repo **first**; add `.gitignore` (node_modules, `src-tauri/target`, dist) and commit the existing `CLAUDE.md` / `PLAN.md` so the scaffold arrives as a reviewable diff.
- [ ] Scaffold into a **temp directory**, then merge into `ballview/`. `npm create tauri-app` refuses a non-empty target, and `CLAUDE.md` + `PLAN.md` already live here:
  ```bash
  npm create tauri-app@latest ballview-scaffold -- --template react-ts
  # move everything except the scaffold's README/.gitignore into ballview/
  ```
- [ ] Verify `npm run tauri dev` opens a native window on Windows.
- [ ] Verify `npm run tauri build` produces a Windows installer/executable.
- [ ] Add Rust deps to `Cargo.toml`: `reqwest` (rustls-tls), `tokio`, `serde`, `serde_json`, `chrono`, `tauri-plugin-dialog`, `tauri-plugin-fs`.
- [ ] Add frontend deps: `@tanstack/react-query`, `zustand`.
- [ ] Configure `tauri.conf.json` (app id `com.ballview.app`, window size ~1200×800, min size).
- [ ] **Tauri 2 capabilities (ACL).** Plugins are inert without an explicit grant — create
      `src-tauri/capabilities/default.json` for the main window with `dialog:allow-save`,
      `dialog:allow-open`, and the narrowest `fs` scope that covers `$APPDATA/ballview/**`
      plus the user-chosen export path. Register the plugins in `lib.rs` at the same time.
- [ ] **CSP for remote media.** Set `app.security.csp` in `tauri.conf.json` to allow
      `media-src` for MLB media hosts (the spike found these are `mlb-cuts-diamond.mlb.com`,
      `darkroom-clips.mlb.com`, `bdata-producedclips.mlb.com` - NOT the documented
      `cuts.diamond.mlb.com`). Without this Phase 5's `<video>` silently plays nothing.

**Done when:** app launches, displays a placeholder screen, and a throwaway button
successfully opens a native save dialog and writes a file under `%APPDATA%/ballview/` —
proving the ACL wiring before any real feature depends on it.

---

## Phase 1 — Data layer (Rust) (days 1–3)

**Goal:** all MLB data is fetchable from Rust, with typed models, decoupled from the UI.

- [ ] `mlb/client.rs` — shared `reqwest` client (timeouts, retries, user-agent, error type).
- [ ] `mlb/endpoints.rs` — URL builders + constants for: schedule, teams, live feed, content, boxscore, linescore.
- [ ] `mlb/models.rs` — `serde` structs for `Team`, `GameSummary`, `LiveFeed` (incl. `allPlays[]` → `playEvents[]`, `runners`, fielders), `GameContent` (highlights → playbacks), `Boxscore`.
- [ ] `commands/schedule.rs` — `get_teams`, `get_schedule(date, team_id?)`.
- [ ] `commands/live.rs` — `get_live_feed(game_pk)`, `get_game_content(game_pk)`, `get_boxscore(game_pk)`.
- [ ] Register commands in `lib.rs`.
- [ ] **Spike (do this first, and this week).** Write a throwaway Rust test/bin that prints
      today's schedule and one live feed's play-by-play, to validate models against real
      2026 data (fields shift without notice — lock this down early). September is the
      regular-season stretch run, so live games are plentiful; this gets much harder to
      exercise once the season ends.
- [ ] Save two or three real API responses as fixtures under `src-tauri/tests/fixtures/`
      so model parsing is testable offline and in CI.

**Done when:** a Rust unit/binary can dump today's games and a live game's pitches.

---

## Phase 2 — Storage layer (Rust) (day 3)

**Goal:** file-based persistence with no database.

- [ ] `storage/config.rs` — read/write `config.json` (favorite team id, settings).
- [ ] `storage/game_files.rs` — `save_game(game_pk, snapshot)`, `load_game(game_pk)`, `list_saved_games(team_id?)`, `export_game(game_pk, path)`.
- [ ] Resolve app-data dir via Tauri `path` API → `%APPDATA%/ballview/`.
- [ ] `history/{season}/{teamId}.json` log writer: append game entry (date, teams, score,
      `gamePk`, `gameType`, saved?).
      **Season key:** use the `season` field the Stats API returns on the game record — never
      the calendar year. Spring training (`gameType=S`), regular (`R`) and postseason (`P`)
      all share one season value, so they land in one file; keep `gameType` on the entry so
      the UI can filter. Entries are keyed by `gamePk` and upserted, not blindly appended,
      so a re-log of an in-progress game overwrites rather than duplicates.
- [ ] `commands/favorites.rs` — `get_favorite_team`, `set_favorite_team`.
- [ ] `commands/history.rs` — `get_history(team_id, season?)`.
- [ ] `commands/media.rs` — `download_highlight(url, game_pk, clip_id)` streaming to `media/{gamePk}/{clipId}.mp4`.

**Done when:** favorites, saved games, and history survive an app restart.

---

## Phase 3 — Frontend shell & game list (day 4–5)

**Goal:** the app shows today's games and lets you favorite a team.

- [ ] `src/lib/api.ts` — typed wrappers over `invoke()` for every command.
- [ ] `src/lib/types.ts` — mirror the Rust models.
- [ ] App layout: sidebar + main panel (game list). The sidebar ships with the **favorites
      section only**; the history section is a disabled placeholder until Phase 6 fills it,
      so nothing renders against data that does not exist yet.
- [ ] `GameList.tsx` — fetch `get_schedule` for today; render live/upcoming/final with score + inning.
- [ ] `TeamFavorites.tsx` — team picker (from `get_teams`) → `set_favorite_team`.
- [ ] TanStack Query setup with 15s refetch while any game is `live`.

**Feature 1 ✅ (Current Game List) · Feature 2 ✅ (Favorite a team)**

---

## Phase 4 — Play-by-play views (day 5–8)

**Goal:** click a game → see every pitch and the fielders involved.

- [ ] `useLiveFeed` hook — poll `get_live_feed` while game live; cache final feed once complete.
- [ ] `PlayByPlay.tsx` — render `allPlays[]` grouped by half-inning.
- [ ] `PitchView.tsx` — **Feature 4**: per-pitch `playEvents[]` (pitch type, speed, count, result, runners after).
- [ ] `FielderView.tsx` — **Feature 5**: defensive alignment + fielder on each play (putouts/assists from boxscore + play result).
- [ ] Live-update indicators (inning state, outs, balls/strikes, runners on base).

**Feature 4 ✅ · Feature 5 ✅** — both satisfied by the Stats API alone. Statcast is additive.

---

## Phase 4b — Statcast enrichment (day 8, optional)

**Goal:** the pitch and fielder views gain real coordinates, without becoming dependent on them.

CLAUDE.md lists Baseball Savant as a core source; this is where it lands. Everything here is
behind a `statcast_enabled` config flag and degrades to the Phase 4 views when it fails.

- [ ] `mlb/savant.rs` — separate client for `baseballsavant.mlb.com` (its own base URL, its
      own error type; it is a *different* undocumented API, do not fold it into `client.rs`).
- [ ] `get_statcast(game_pk)` command → per-pitch release/plate coordinates, exit velocity,
      launch angle; fielder positioning where available.
- [ ] `PitchView.tsx` — optional strike-zone plot when Statcast data is present.
- [ ] Cache per `gamePk`; never block the Phase 4 render on this request.

**Cut this phase first if the schedule slips** — no listed feature depends on it.

---

## Phase 5 — Highlights & clips (day 8–10)

**Goal:** play available highlights inline.

- [ ] `HighlightPlayer.tsx` — list highlights from `get_game_content`; `<video>` with the mp4 playback URL.
- [ ] Handle absent/unavailable clips gracefully ("no clip available").
- [ ] Add a "save clip" action → `download_highlight`.

**Feature 6 ✅ (View clips)**

---

## Phase 6 — History log & attach highlights (day 10–12)

**Goal:** the favorited team's games are logged and viewable offline.

- [ ] `HistoryLog.tsx` — **Feature 3**: chronological list of the favorite team's games; open saved game snapshots.
- [ ] "Save game" button → snapshot live/final feed to `games/{gamePk}.json`.
- [ ] Auto-log favorited team's games to history on completion **while running**, plus a
      **startup backfill**: on app open, read the newest entry in the season's history file
      and fetch `schedule?teamId=&startDate=&endDate=` for the gap between that date and
      today, upserting anything missed while the app was closed. Cap the range (e.g. 30 days)
      so a long absence doesn't fire a huge scan on launch.
- [ ] **Feature 7**: when saving, attach a highlight — store playback metadata in the snapshot and (optionally) download the mp4 to `media/`.
- [ ] Offline reopen: `load_game` renders a completed play-by-play without network.

**Feature 3 ✅ · Feature 7 ✅**

---

## Phase 7 — Export, polish, packaging (day 13–14)

- [ ] `export_game` via native save dialog (single `.json` game file).
- [ ] Error/empty/loading states everywhere; rate-limit-friendly polling (back off on 429/errors).
- [ ] Icons + app metadata.
- [ ] `npm run tauri build` → Windows installer; smoke-test on a clean machine.
- [ ] Write `README.md` (setup, features, data-source caveats).

---

## Risks & mitigations

- **MLB API is undocumented/unstable** → all HTTP isolated in `src-tauri/src/mlb/`; typed models with optional fields; keep the Phase-1 validation spike to catch field changes.
- **Highlight mp4 availability / geo-restrictions** → treat clips as best-effort; degrade to metadata-only. Highlightly is *not* a v1 fallback (see Assumptions); if MLB clips prove unusable that is a scope conversation, not a swap.
- **Rate limits (undocumented)** → cache aggressively (TanStack Query), back off on errors, 15s+ poll interval, only fetch live games' feeds.
- **Video playback in webview** → CSP is configured in Phase 0 and verified in Phase 5. If CSP-correct playback still fails (ranged requests, token-signed URLs), fall back to proxying bytes through a Rust command or download-then-play — budget a day for this, it is the likeliest Phase 5 overrun.
- **Tauri 2 ACL** → capabilities are wired and smoke-tested in Phase 0 rather than discovered in Phase 7, when `export_game` would otherwise fail with an opaque permission error.

## Definition of done

All 7 features work on a Windows 11 machine, favorites/history/saved games persist across
restarts with no database, and a production installer is produced.

---

## Status — 2026-09-01

Phases 0 through 7 are implemented. 24 Rust tests pass (`cargo test`).

**Done and verified against real data**

- Phase 0 — scaffold merged onto the docs, app id `com.ballview.app`, 1200×800 window.
  Tauri 2 capabilities and the CSP were written up front, as planned.
- Phase 1 — `mlb/` holds every external call. The validation spike ran against live
  2026 data and a completed game (74 plays, 291 pitches, 89 fielding credits, 40 clips).
  Real responses are captured in `src-tauri/tests/fixtures/` and asserted offline.
- Phase 2 — file storage with atomic write-then-rename. Season keyed by the API field;
  entries upsert by `gamePk` and preserve the `saved` flag.
- Phases 3–6 — all seven features have working UI.
- Phase 7 — export/import via the native dialog, error/empty/loading states throughout,
  backoff on 429/5xx, README written.

**Two bugs the spike caught** (each would have shipped broken; see README for detail)

1. `today_local()` derived the game day from the machine clock. On this UTC+8 box that
   asks for tomorrow's slate and renders an empty list. Now MLB decides the boundary.
2. The documented highlight host `cuts.diamond.mlb.com` serves none of the real clips.
   Both the CSP and the download allowlist would have blocked every mp4.

**Not done**

- [ ] **Statcast is backend-only.** `savant.rs` and `get_statcast` exist and are tested,
      but nothing in `PitchView.tsx` consumes them yet. Phase 4b was always the
      cut-first phase and no listed feature depends on it.
- [ ] **App icons are the Tauri defaults.** Functional, but not ballview's own artwork.
- [ ] **No runtime verification.** The code compiles, tests pass, and the installer
      builds — but nobody has clicked through a running window yet. The Phase 0 ACL
      smoke test (open a save dialog, write to app-data) still needs a human.
- [ ] **Clean-machine smoke test** of the installer.
