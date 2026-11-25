use immersio_core::{Browse, LocalTrack, Lyrics, SearchResults, StreamInfo};
use std::fs;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::Manager;
use tauri::{AppHandle, State};

pub struct AppState {
    pub yt: immersio_core::yt::Yt,
    pub http: reqwest::Client,
}

#[tauri::command]
pub async fn yt_search(state: State<'_, AppState>, query: String, hl: String) -> Result<SearchResults, String> {
    state.yt.search(&query, &hl).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn yt_browse(state: State<'_, AppState>, browse_id: String, hl: String) -> Result<Browse, String> {
    state.yt.browse(&browse_id, &hl).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn yt_stream(state: State<'_, AppState>, video_id: String, hl: String) -> Result<StreamInfo, String> {
    state.yt.stream(&video_id, &hl).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn lyrics_fetch(
    state: State<'_, AppState>,
    track: String,
    artist: String,
    album: Option<String>,
    duration: Option<u32>,
) -> Result<Lyrics, String> {
    immersio_core::lyrics::fetch(&state.http, &track, &artist, album.as_deref(), duration)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn fetch_image(state: State<'_, AppState>, url: String) -> Result<Vec<u8>, String> {
    let resp = state
        .http
        .get(&url)
        .header("User-Agent", "Mozilla/5.0")
        .send()
        .await
        .map_err(|e| e.to_string())?;
    let bytes = resp.bytes().await.map_err(|e| e.to_string())?;
    Ok(bytes.to_vec())
}

fn new_id() -> String {
    let n = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    format!("{n:x}")
}

fn copy_track_files(app: &AppHandle, src: &str, id: &str) -> Result<LocalTrack, String> {
    let meta = immersio_core::local::read_meta(id, src).map_err(|e| e.to_string())?;
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let lib_dir = dir.join("local-library");
    let covers_dir = dir.join("covers");
    fs::create_dir_all(&lib_dir).map_err(|e| e.to_string())?;
    fs::create_dir_all(&covers_dir).map_err(|e| e.to_string())?;
    let ext = std::path::Path::new(src)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("mp3")
        .to_lowercase();
    let dest = lib_dir.join(format!("{id}.{ext}"));
    fs::copy(src, &dest).map_err(|e| e.to_string())?;
    let mut track = meta;
    track.path = dest.to_string_lossy().to_string();
    if let Ok(Some(bytes)) = immersio_core::local::extract_cover(src) {
        let cover_ext = if bytes.starts_with(&[0x89, b'P', b'N', b'G']) { "png" } else { "jpg" };
        let cover = covers_dir.join(format!("{id}.{cover_ext}"));
        if fs::write(&cover, &bytes).is_ok() {
            track.cover_path = Some(cover.to_string_lossy().to_string());
        }
    }
    Ok(track)
}

#[tauri::command]
pub async fn import_local(app: AppHandle, paths: Vec<String>) -> Result<Vec<LocalTrack>, String> {
    let mut out = Vec::new();
    for p in paths {
        let id = new_id();
        match copy_track_files(&app, &p, &id) {
            Ok(t) => out.push(t),
            Err(_) => continue,
        }
    }
    Ok(out)
}

#[tauri::command]
pub async fn scan_local_dir(dir: String) -> Result<Vec<String>, String> {
    Ok(immersio_core::local::list_audio_files(&dir))
}

#[tauri::command]
pub async fn remove_local(tracks: Vec<LocalTrack>) -> Result<(), String> {
    for t in tracks {
        let _ = fs::remove_file(&t.path);
        if let Some(c) = t.cover_path {
            let _ = fs::remove_file(c);
        }
    }
    Ok(())
}

#[tauri::command]
pub fn app_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}
