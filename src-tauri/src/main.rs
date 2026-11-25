mod commands;
mod stream;

use commands::AppState;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(AppState {
            yt: immersio_core::yt::Yt::new(),
            http: reqwest::Client::new(),
        })
        .register_asynchronous_uri_scheme_protocol("stream", move |_ctx, request, responder| {
            tauri::async_runtime::spawn(async move {
                let response = stream::handle(request).await;
                responder.respond(response);
            });
        })
        .invoke_handler(tauri::generate_handler![
            commands::yt_search,
            commands::yt_browse,
            commands::yt_stream,
            commands::lyrics_fetch,
            commands::fetch_image,
            commands::import_local,
            commands::scan_local_dir,
            commands::remove_local,
            commands::app_version,
        ])
        .run(tauri::generate_context!())
        .expect("immersion run failed");
}
