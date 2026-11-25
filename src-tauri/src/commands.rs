use immersio_core::{Browse, importer::ImportResult, LocalTrack, Lyrics, SearchResults, StreamInfo, TrackItem};
use std::fs;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::Manager;
use tauri::{AppHandle, State};

pub struct AppState {
    pub yt: immersio_core::yt::Yt,
    pub sc: immersio_core::sc::Sc,
    pub http: reqwest::Client,
    pub cache_max: std::sync::RwLock<u64>,
    pub discord: std::sync::Mutex<DiscordHolder>,
}

pub struct DiscordHolder {
    pub id: String,
    pub client: Option<discord_rich_presence::DiscordIpcClient>,
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
pub async fn sc_search(state: State<'_, AppState>, query: String) -> Result<Vec<TrackItem>, String> {
    state.sc.search(&state.http, &query).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn yt_stream(app: AppHandle, state: State<'_, AppState>, video_id: String, hl: String, quality: Option<String>) -> Result<StreamInfo, String> {
    if let Some(id) = video_id.strip_prefix("sc:") {
        let (info, data) = state.sc.stream(&state.http, id).await.map_err(|e| e.to_string())?;
        if let Some(bytes) = data {
            if let Some(path) = crate::stream::cache_file(&app, &video_id, &info.mime) {
                let _ = fs::write(&path, &bytes);
            }
        }
        return Ok(info);
    }
    let q = quality.as_deref().unwrap_or("high");
    state.yt.stream(&video_id, &hl, q).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn yt_radio(state: State<'_, AppState>, video_id: String, hl: String) -> Result<Vec<TrackItem>, String> {
    if let Some(id) = video_id.strip_prefix("sc:") {
        return state.sc.related(&state.http, id).await.map_err(|e| e.to_string());
    }
    state.yt.radio(&video_id, &hl).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn import_playlist(state: State<'_, AppState>, url: String, hl: String) -> Result<ImportResult, String> {
    immersio_core::importer::resolve(&state.yt, &state.sc, &state.http, &url, &hl)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn yt_set_cookies(app: AppHandle, state: State<'_, AppState>, cookies: Option<String>) -> Result<(), String> {
    state.yt.set_cookies(cookies.clone());
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = dir.join("yt-cookies.txt");
    match cookies.filter(|s| !s.trim().is_empty()) {
        Some(c) => fs::write(&path, c.trim()).map_err(|e| e.to_string())?,
        None => {
            let _ = fs::remove_file(&path);
        }
    }
    Ok(())
}

#[tauri::command]
pub fn yt_set_pot(app: AppHandle, state: State<'_, AppState>, token: Option<String>) -> Result<(), String> {
    state.yt.set_pot(token.clone());
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = dir.join("pot.txt");
    match token.filter(|s| !s.trim().is_empty()) {
        Some(t) => fs::write(&path, t.trim()).map_err(|e| e.to_string())?,
        None => {
            let _ = fs::remove_file(&path);
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn pot_provider_fetch(app: AppHandle, state: State<'_, AppState>, url: Option<String>) -> Result<(), String> {
    let base = url
        .filter(|u| !u.trim().is_empty())
        .unwrap_or_else(|| "http://127.0.0.1:4416".into())
        .trim_end_matches('/')
        .to_string();
    let binding = state.yt.visitor().unwrap_or_else(|| "default".into());
    let client = reqwest::Client::new();
    let resp = client
        .get(format!("{base}/get_pot"))
        .query(&[("content_binding", binding)])
        .timeout(std::time::Duration::from_secs(10))
        .send()
        .await
        .map_err(|e| format!("{base}: {e}"))?;
    let val: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
    let token = val
        .get("poToken")
        .and_then(|x| x.as_str())
        .map(|s| s.to_string())
        .filter(|s| !s.is_empty())
        .ok_or_else(|| "no poToken in response".to_string())?;
    yt_set_pot(app, state, Some(token))
}

#[tauri::command]
pub async fn yt_import_liked(state: State<'_, AppState>, hl: String) -> Result<Vec<TrackItem>, String> {
    state.yt.import_liked(&hl).await.map_err(|e| e.to_string())
}

fn cache_dir_of(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?.join("cache");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

#[tauri::command]
pub fn cache_stats(app: AppHandle) -> Result<(u64, u64), String> {
    let dir = cache_dir_of(&app)?;
    let mut bytes = 0u64;
    let mut count = 0u64;
    if let Ok(entries) = fs::read_dir(&dir) {
        for e in entries.filter_map(|e| e.ok()) {
            if let Ok(meta) = e.metadata() {
                if meta.is_file() {
                    bytes += meta.len();
                    count += 1;
                }
            }
        }
    }
    Ok((bytes, count))
}

#[tauri::command]
pub fn cache_clear(app: AppHandle) -> Result<(), String> {
    let dir = cache_dir_of(&app)?;
    if let Ok(entries) = fs::read_dir(&dir) {
        for e in entries.filter_map(|e| e.ok()) {
            let _ = fs::remove_file(e.path());
        }
    }
    Ok(())
}

#[tauri::command]
pub fn set_cache_limit(state: State<'_, AppState>, limit: u64) {
    if let Ok(mut g) = state.cache_max.write() {
        *g = limit;
    }
}

#[tauri::command]
pub fn mpris_update(app: AppHandle, title: String, artist: String, art: String, len_us: u64, pos_us: u64, playing: bool) {
    crate::mpris::update(&app, crate::mpris::Meta { title, artist, art, len_us, pos_us, playing });
}

#[tauri::command]
pub fn set_window_icon(app: AppHandle, rgba: Vec<u8>, w: u32, h: u32) -> Result<(), String> {
    if rgba.len() != (w as usize) * (h as usize) * 4 {
        return Err("icon size mismatch".into());
    }
    let img = tauri::image::Image::new_owned(rgba, w, h);
    for (_, win) in app.webview_windows() {
        let _ = win.set_icon(img.clone());
    }
    Ok(())
}

#[tauri::command]
pub async fn download_track(state: State<'_, AppState>, video_id: String, hl: String, path: String) -> Result<(), String> {
    if let Some(id) = video_id.strip_prefix("sc:") {
        let (info, data) = state.sc.stream(&state.http, id).await.map_err(|e| e.to_string())?;
        if let Some(bytes) = data {
            return fs::write(&path, &bytes).map_err(|e| e.to_string());
        }
        let mut req = state.http.get(&info.url).header("User-Agent", "Mozilla/5.0");
        let bytes = req.send().await.map_err(|e| e.to_string())?.bytes().await.map_err(|e| e.to_string())?;
        return fs::write(&path, &bytes).map_err(|e| e.to_string());
    }
    let info = state.yt.stream(&video_id, &hl, "high").await.map_err(|e| e.to_string())?;
    let mut req = state.http.get(&info.url).header("User-Agent", "Mozilla/5.0");
    if let Some(cookie) = state.yt.cookies() {
        req = req.header("Cookie", cookie);
    }
    let bytes = req.send().await.map_err(|e| e.to_string())?.bytes().await.map_err(|e| e.to_string())?;
    fs::write(&path, &bytes).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn lyrics_fetch(
    state: State<'_, AppState>,
    track: String,
    artist: String,
    album: Option<String>,
    duration: Option<u32>,
    video_id: Option<String>,
) -> Result<Lyrics, String> {
    let video_id = video_id.filter(|v| !v.starts_with("sc:"));
    let mut urls: Vec<String> = Vec::new();
    if let Some(vid) = video_id.as_deref().filter(|s| !s.is_empty()) {
        urls = state.yt.captions_urls(vid).await;
    }
    immersio_core::lyrics::fetch(&state.http, &track, &artist, album.as_deref(), duration, &urls)
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

#[tauri::command]
pub fn discord_update(
    state: State<'_, AppState>,
    client_id: String,
    title: String,
    artist: String,
    cover: Option<String>,
    elapsed: Option<u32>,
    remaining: Option<u32>,
) -> Result<(), String> {
    use discord_rich_presence::{activity, DiscordIpc, DiscordIpcClient};
    if client_id.is_empty() {
        if let Ok(mut holder) = state.discord.lock() {
            if let Some(mut c) = holder.client.take() {
                let _ = c.clear_activity();
            }
            holder.id.clear();
        }
        return Ok(());
    }
    let mut holder = state.discord.lock().map_err(|e| e.to_string())?;
    if holder.id != client_id || holder.client.is_none() {
        if let Some(mut old) = holder.client.take() {
            let _ = old.clear_activity();
        }
        let mut client = DiscordIpcClient::new(&client_id).map_err(|e| e.to_string())?;
        client.connect().map_err(|e| e.to_string())?;
        holder.client = Some(client);
        holder.id = client_id;
    }
    let client = holder.client.as_mut().unwrap();
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64;
    let cover_url = cover;
    let mut act = activity::Activity::new().details(&title).state(&artist);
    if let (Some(el), Some(rem)) = (elapsed, remaining) {
        act = act.timestamps(activity::Timestamps::new().start(now - el as i64).end(now + rem as i64));
    }
    if let Some(u) = cover_url.as_deref() {
        act = act.assets(activity::Assets::new().large_image(u));
    }
    client.set_activity(act).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn discord_clear(state: State<'_, AppState>) -> Result<(), String> {
    use discord_rich_presence::DiscordIpc;
    if let Ok(mut holder) = state.discord.lock() {
        if let Some(mut c) = holder.client.take() {
            let _ = c.clear_activity();
        }
        holder.id.clear();
    }
    Ok(())
}
