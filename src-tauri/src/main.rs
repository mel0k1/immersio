#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod mpris;
mod stream;

use commands::AppState;
use tauri::Manager;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .manage(AppState {
            yt: immersio_core::yt::Yt::new(),
            sc: immersio_core::sc::Sc::new(),
            http: reqwest::Client::new(),
            cache_max: std::sync::RwLock::new(2_000_000_000),
            discord: std::sync::Mutex::new(commands::DiscordHolder {
                id: String::new(),
                client: None,
            }),
        })
        .setup(|app| {
            mpris::init(app.handle());
            if let Ok(dir) = app.path().app_data_dir() {
                if let Ok(text) = std::fs::read_to_string(dir.join("yt-cookies.txt")) {
                    let c = text.trim().to_string();
                    if !c.is_empty() {
                        app.state::<AppState>().yt.set_cookies(Some(c));
                    }
                }
                if let Ok(text) = std::fs::read_to_string(dir.join("pot.txt")) {
                    let t = text.trim().to_string();
                    if !t.is_empty() {
                        app.state::<AppState>().yt.set_pot(Some(t));
                    }
                }
            }
            Ok(())
        })
        .register_asynchronous_uri_scheme_protocol("stream", move |ctx, request, responder| {
            let app = ctx.app_handle().clone();
            tauri::async_runtime::spawn(async move {
                let response = stream::handle(&app, request).await;
                responder.respond(response);
            });
        })
        .invoke_handler(tauri::generate_handler![
            commands::yt_search,
            commands::yt_browse,
            commands::yt_stream,
            commands::yt_radio,
            commands::sc_search,
            commands::import_playlist,
            commands::lyrics_fetch,
            commands::fetch_image,
            commands::import_local,
            commands::scan_local_dir,
            commands::remove_local,
            commands::yt_set_cookies,
            commands::yt_set_pot,
            commands::pot_provider_fetch,
            commands::yt_import_liked,
            commands::cache_stats,
            commands::cache_clear,
            commands::set_cache_limit,
            commands::mpris_update,
            commands::set_window_icon,
            commands::download_track,
            commands::app_version,
            commands::discord_update,
            commands::discord_clear,
        ])
        .run(tauri::generate_context!())
        .expect("immersion run failed");
}
