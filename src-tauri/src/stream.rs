use std::path::PathBuf;
use tauri::http::{Request, Response, StatusCode};
use tauri::{AppHandle, Manager};

fn b64url_decode(s: &str) -> Option<Vec<u8>> {
    const TABLE: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    let s = s.trim_end_matches('=');
    let mut out = Vec::new();
    let mut buf: u32 = 0;
    let mut bits = 0u32;
    for c in s.bytes() {
        let v = TABLE.iter().position(|t| *t == c)? as u32;
        buf = (buf << 6) | v;
        bits += 6;
        if bits >= 8 {
            bits -= 8;
            out.push((buf >> bits) as u8);
        }
    }
    Some(out)
}

struct Payload {
    url: String,
    mime: String,
    video_id: String,
    cache: bool,
}

fn payload(uri: &tauri::http::Uri) -> Option<Payload> {
    let path = uri.path().trim_start_matches('/');
    let raw = b64url_decode(path)?;
    let v: serde_json::Value = serde_json::from_slice(&raw).ok()?;
    Some(Payload {
        url: v.get("url").and_then(|x| x.as_str())?.to_string(),
        mime: v
            .get("mime")
            .and_then(|x| x.as_str())
            .unwrap_or("audio/mp4")
            .to_string(),
        video_id: v
            .get("videoId")
            .and_then(|x| x.as_str())
            .unwrap_or("")
            .to_string(),
        cache: v.get("cache").and_then(|x| x.as_bool()).unwrap_or(false),
    })
}

fn cache_dir(app: &AppHandle) -> Option<PathBuf> {
    let dir = app.path().app_data_dir().ok()?.join("cache");
    std::fs::create_dir_all(&dir).ok()?;
    Some(dir)
}

fn cache_path(dir: &PathBuf, video_id: &str, mime: &str) -> PathBuf {
    let ext = if mime.contains("webm") { "webm" } else { "m4a" };
    dir.join(format!("{video_id}.{ext}"))
}

fn trim_cache(dir: &PathBuf, max_bytes: u64) {
    let Ok(entries) = std::fs::read_dir(dir) else { return };
    let mut files: Vec<(PathBuf, u64, std::time::SystemTime)> = entries
        .filter_map(|e| e.ok())
        .filter(|e| e.path().is_file())
        .filter_map(|e| {
            let meta = e.metadata().ok()?;
            Some((e.path(), meta.len(), meta.modified().ok()?))
        })
        .collect();
    let total: u64 = files.iter().map(|f| f.1).sum();
    if total <= max_bytes {
        return;
    }
    files.sort_by_key(|f| f.2);
    let mut need = total - max_bytes;
    for (path, size, _) in files {
        if need == 0 {
            break;
        }
        if std::fs::remove_file(&path).is_ok() {
            need = need.saturating_sub(size);
        }
    }
}

fn range_bounds(header: Option<&tauri::http::HeaderValue>, len: u64) -> Option<(u64, u64)> {
    let h = header?.to_str().ok()?;
    let spec = h.strip_prefix("bytes=")?;
    let (start, end) = spec.split_once('-')?;
    let start: u64 = start.parse().ok()?;
    let end: u64 = if end.is_empty() {
        len.saturating_sub(1)
    } else {
        end.parse::<u64>().ok()?.min(len.saturating_sub(1))
    };
    if start > end || len == 0 {
        return None;
    }
    Some((start, end))
}

fn ok_headers(mime: &str, len: u64) -> tauri::http::response::Builder {
    Response::builder()
        .header("Content-Type", mime)
        .header("Accept-Ranges", "bytes")
        .header("Access-Control-Allow-Origin", "*")
        .header("Content-Length", len.to_string())
}

fn serve_slice(bytes: &[u8], mime: &str, range: Option<&tauri::http::HeaderValue>) -> Response<Vec<u8>> {
    if let Some((s, e)) = range_bounds(range, bytes.len() as u64) {
        return ok_headers(mime, e - s + 1)
            .status(StatusCode::PARTIAL_CONTENT)
            .header("Content-Range", format!("bytes {s}-{e}/{}", bytes.len()))
            .body(bytes[s as usize..=(e as usize)].to_vec())
            .unwrap();
    }
    ok_headers(mime, bytes.len() as u64)
        .status(StatusCode::OK)
        .body(bytes.to_vec())
        .unwrap()
}

pub async fn handle(app: &AppHandle, request: Request<Vec<u8>>) -> Response<Vec<u8>> {
    let Some(p) = payload(request.uri()) else {
        return bad_request("bad request");
    };
    let cookies = app
        .try_state::<crate::commands::AppState>()
        .map(|s| s.yt.cookies())
        .unwrap_or(None);

    let range = request.headers().get("range").cloned();

    // 1. Cached: serve from disk.
    if !p.video_id.is_empty() {
        if let Some(dir) = cache_dir(app) {
            let path = cache_path(&dir, &p.video_id, &p.mime);
            if path.is_file() {
                if let Ok(bytes) = std::fs::read(&path) {
                    return serve_slice(&bytes, &p.mime, range.as_ref());
                }
            }
        }
    }

    let client = reqwest::Client::new();
    let mut r = client.get(&p.url).header("User-Agent", "Mozilla/5.0");
    if let Some(cookie) = &cookies {
        r = r.header("Cookie", cookie);
    }
    if let Some(v) = &range {
        if let Ok(s) = v.to_str() {
            r = r.header("Range", s);
        }
    }
    let resp = match r.send().await {
        Ok(resp) => resp,
        Err(_) => return bad_request("upstream error"),
    };
    let status = StatusCode::from_u16(resp.status().as_u16()).unwrap_or(StatusCode::OK);
    let mut builder = Response::builder().status(status);
    for key in ["content-range", "content-length"] {
        if let Some(v) = resp.headers().get(key) {
            builder = builder.header(key, v.clone());
        }
    }

    // 2. Fresh full download: cache to disk while responding.
    if range.is_none() && p.cache && !p.video_id.is_empty() && status == StatusCode::OK {
        let bytes = match resp.bytes().await {
            Ok(b) => b,
            Err(_) => return bad_request("read error"),
        };
        if let Some(dir) = cache_dir(app) {
            let path = cache_path(&dir, &p.video_id, &p.mime);
            let _ = std::fs::write(&path, &bytes);
            trim_cache(&dir, 2_000_000_000);
        }
        return ok_headers(&p.mime, bytes.len() as u64)
            .status(StatusCode::OK)
            .body(bytes.to_vec())
            .unwrap_or_else(|_| bad_request("body"));
    }

    // 3. Range passthrough (seek before the file is cached).
    match resp.bytes().await {
        Ok(bytes) => builder
            .header("Content-Type", &p.mime)
            .header("Accept-Ranges", "bytes")
            .body(bytes.to_vec())
            .unwrap_or_else(|_| bad_request("body")),
        Err(_) => bad_request("read error"),
    }
}

fn bad_request(msg: &str) -> Response<Vec<u8>> {
    Response::builder()
        .status(StatusCode::BAD_GATEWAY)
        .body(msg.as_bytes().to_vec())
        .unwrap()
}
