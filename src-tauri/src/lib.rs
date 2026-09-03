//! ballview — MLB play-by-play viewer.

pub mod commands;
pub mod error;
pub mod mlb;
pub mod storage;

use commands::AppState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .setup(|app| {
            use tauri::Manager;

            // Create the app-data tree up front so no command has to special-case a
            // first run on a machine that has never opened ballview.
            let root = app.path().app_data_dir()?;
            for sub in ["games", "history", "media"] {
                std::fs::create_dir_all(root.join(sub))?;
            }

            app.manage(AppState::new()?);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // schedule
            commands::schedule::get_teams,
            commands::schedule::get_schedule,
            commands::schedule::get_schedule_range,
            commands::schedule::get_today,
            commands::schedule::get_standings,
            // player stats
            commands::stats::get_player_stats,
            commands::stats::get_person,
            // charts and comparisons
            commands::charts::get_player_game_log,
            commands::charts::get_player_range,
            commands::charts::search_players,
            commands::charts::get_pitch_speeds,
            // spotlight
            commands::spotlight::get_top_performers,
            commands::spotlight::get_player_highlights,
            // live
            commands::live::get_live_feed,
            commands::live::get_boxscore,
            commands::live::get_game_content,
            commands::live::get_statcast,
            // favorites & settings
            commands::favorites::get_config,
            commands::favorites::set_config,
            commands::favorites::get_favorite_team,
            commands::favorites::set_favorite_team,
            // history
            commands::history::get_history,
            commands::history::get_history_seasons,
            commands::history::refresh_history,
            // saved games
            commands::games::save_game,
            commands::games::load_game,
            commands::games::list_saved_games,
            commands::games::game_is_saved,
            commands::games::export_game,
            commands::games::import_game,
            // media
            commands::media::download_highlight,
            commands::media::get_pitch_clip,
            commands::media::list_local_clips,
            commands::media::delete_local_clip,
        ])
        .run(tauri::generate_context!())
        .expect("error while running ballview");
}
