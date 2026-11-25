use crate::{Browse, CoreError, ItemKind, Result, TrackItem, yt::Yt};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::Value;

const MAX_TRACKS: usize = 250;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceTrack {
    pub title: String,
    pub artist: String,
    pub duration_secs: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportResult {
    pub kind: String,
    pub name: String,
    pub tracks: Vec<TrackItem>,
    pub failed: u32,
}

struct Parsed {
    kind: String,
    name: String,
    ready: Vec<TrackItem>,
    to_match: Vec<SourceTrack>,
}

fn take_id(s: &str, start: usize, allowed: impl Fn(char) -> bool) -> String {
    s[start..]
        .chars()
        .take_while(|c| allowed(*c))
        .collect::<String>()
}

fn query_param(url: &str, key: &str) -> Option<String> {
    let i = url.find(&format!("{key}="))?;
    let v = take_id(&url[i + key.len() + 1..], 0, |c| {
        c.is_ascii_alphanumeric() || c == '-' || c == '_'
    });
    if v.is_empty() {
        None
    } else {
        Some(v)
    }
}

fn path_id(url: &str, segment: &str, digits: bool) -> Option<String> {
    let i = url.find(segment)?;
    let id = take_id(url, i + segment.len(), |c| {
        if digits {
            c.is_ascii_digit()
        } else {
            c.is_ascii_alphanumeric()
        }
    });
    if id.is_empty() {
        None
    } else {
        Some(id)
    }
}

async fn parse(yt: &Yt, http: &Client, url: &str, hl: &str) -> Result<Parsed> {
    let url = url.trim();
    if url.contains("spotify.com") {
        return spotify(http, url).await;
    }
    if url.contains("soundcloud.com") {
        return soundcloud(http, url).await;
    }
    if url.contains("deezer.com") || url.contains("page.link") {
        return deezer(http, url).await;
    }
    if url.contains("youtube.com") || url.contains("youtu.be") {
        return youtube(yt, url, hl).await;
    }
    Err(CoreError::Parse("unsupported link".into()))
}

async fn spotify(http: &Client, url: &str) -> Result<Parsed> {
    let Some(id) = path_id(url, "playlist/", false) else {
        return Err(CoreError::Parse("no spotify playlist id".into()));
    };
    let html = http
        .get(format!("https://open.spotify.com/embed/playlist/{id}"))
        .header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36")
        .send()
        .await?
        .error_for_status()?
        .text()
        .await?;
    let marker = "<script id=\"__NEXT_DATA__\" type=\"application/json\">";
    let start = html
        .find(marker)
        .map(|i| i + marker.len())
        .ok_or_else(|| CoreError::Parse("spotify: no data".into()))?;
    let end = html[start..]
        .find("</script>")
        .ok_or_else(|| CoreError::Parse("spotify: no data end".into()))?
        + start;
    let val: Value = serde_json::from_str(html[start..end].trim())
        .map_err(|e| CoreError::Parse(format!("spotify json: {e}")))?;
    let entity = val.pointer("/props/pageProps/state/data/entity").cloned().unwrap_or(Value::Null);
    let name = entity
        .get("name")
        .or_else(|| entity.get("title"))
        .and_then(|x| x.as_str())
        .unwrap_or("Spotify playlist")
        .to_string();
    let mut to_match = Vec::new();
    if let Some(list) = entity.get("trackList").and_then(|x| x.as_array()) {
        for t in list {
            let title = t.get("title").and_then(|x| x.as_str()).unwrap_or("");
            let artist = t.get("subtitle").and_then(|x| x.as_str()).unwrap_or("");
            if title.is_empty() {
                continue;
            }
            let dur = t.get("duration").and_then(|x| x.as_u64()).map(|ms| (ms / 1000) as u32);
            to_match.push(SourceTrack {
                title: title.to_string(),
                artist: artist.to_string(),
                duration_secs: dur,
            });
            if to_match.len() >= MAX_TRACKS {
                break;
            }
        }
    }
    if to_match.is_empty() {
        return Err(CoreError::NotFound("spotify tracks".into()));
    }
    Ok(Parsed { kind: "spotify".into(), name, ready: Vec::new(), to_match })
}

async fn deezer(http: &Client, url: &str) -> Result<Parsed> {
    let Some(id) = path_id(url, "playlist/", true) else {
        return Err(CoreError::Parse("no deezer playlist id".into()));
    };
    let val: Value = http
        .get(format!("https://api.deezer.com/playlist/{id}"))
        .header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64)")
        .send()
        .await?
        .error_for_status()?
        .json()
        .await?;
    let name = val
        .get("title")
        .and_then(|x| x.as_str())
        .unwrap_or("Deezer playlist")
        .to_string();
    let mut to_match = Vec::new();
    if let Some(list) = val.pointer("/tracks/data").and_then(|x| x.as_array()) {
        for t in list {
            let title = t.get("title").and_then(|x| x.as_str()).unwrap_or("");
            let artist = t
                .pointer("/artist/name")
                .and_then(|x| x.as_str())
                .unwrap_or("");
            if title.is_empty() {
                continue;
            }
            let dur = t.get("duration").and_then(|x| x.as_u64()).map(|s| s as u32);
            to_match.push(SourceTrack {
                title: title.to_string(),
                artist: artist.to_string(),
                duration_secs: dur,
            });
            if to_match.len() >= MAX_TRACKS {
                break;
            }
        }
    }
    if to_match.is_empty() {
        return Err(CoreError::NotFound("deezer tracks".into()));
    }
    Ok(Parsed { kind: "deezer".into(), name, ready: Vec::new(), to_match })
}

async fn youtube(yt: &Yt, url: &str, hl: &str) -> Result<Parsed> {
    let list = query_param(url, "list");
    let video = query_param(url, "v");
    if let Some(list) = list {
        if list.starts_with("RD") {
            let vid = video.ok_or_else(|| CoreError::Parse("no video id".into()))?;
            let tracks = yt.radio(&vid, hl).await?;
            return Ok(Parsed { kind: "radio".into(), name: "Radio".into(), ready: tracks, to_match: Vec::new() });
        }
        let browse = yt.browse(&list, hl).await?;
        let (name, tracks) = match browse {
            Browse::Playlist(p) => (p.title, p.tracks),
            Browse::Album(a) => (a.title, a.tracks),
            Browse::Artist(_) => return Err(CoreError::Parse("artist link".into())),
        };
        if tracks.is_empty() {
            return Err(CoreError::NotFound("playlist tracks".into()));
        }
        return Ok(Parsed { kind: "youtube".into(), name, ready: tracks, to_match: Vec::new() });
    }
    if let Some(vid) = video {
        let tracks = yt.radio(&vid, hl).await?;
        return Ok(Parsed { kind: "radio".into(), name: "Radio".into(), ready: tracks, to_match: Vec::new() });
    }
    Err(CoreError::Parse("no list or video id".into()))
}

async fn match_tracks(yt: &Yt, sources: Vec<SourceTrack>, hl: &str) -> (Vec<TrackItem>, u32) {
    let mut out = Vec::new();
    let mut failed = 0u32;
    for src in sources.into_iter().take(MAX_TRACKS) {
        let query = if src.artist.is_empty() {
            src.title.clone()
        } else {
            format!("{} {}", src.artist, src.title)
        };
        let found = yt
            .search(&query, hl)
            .await
            .ok()
            .and_then(|r| {
                r.shelves
                    .into_iter()
                    .find(|s| s.kind == ItemKind::Track)
                    .and_then(|s| s.tracks.into_iter().next())
            });
        match found {
            Some(mut t) => {
                if t.duration_secs.is_none() {
                    t.duration_secs = src.duration_secs;
                }
                out.push(t);
            }
            None => failed += 1,
        }
        tokio::time::sleep(std::time::Duration::from_millis(120)).await;
    }
    (out, failed)
}

pub async fn resolve(yt: &Yt, http: &Client, url: &str, hl: &str) -> Result<ImportResult> {
    let parsed = parse(yt, http, url, hl).await?;
    let (tracks, failed) = if parsed.to_match.is_empty() {
        (parsed.ready, 0)
    } else {
        match_tracks(yt, parsed.to_match, hl).await
    };
    if tracks.is_empty() {
        return Err(CoreError::NotFound("matched tracks".into()));
    }
    Ok(ImportResult { kind: parsed.kind, name: parsed.name, tracks, failed })
}

static SC_CLIENT_ID: std::sync::OnceLock<String> = std::sync::OnceLock::new();

fn js_find_client_id(js: &str) -> Option<String> {
    for marker in ["client_id:\"", "\"client_id\":\""] {
        let mut search = js;
        while let Some(i) = search.find(marker) {
            let rest = &search[i + marker.len()..];
            let id: String = rest.chars().take_while(|c| c.is_ascii_alphanumeric()).collect();
            if (25..=40).contains(&id.len()) {
                return Some(id);
            }
            search = rest;
        }
    }
    None
}

async fn sc_client_id(http: &Client) -> Result<String> {
    if let Some(id) = SC_CLIENT_ID.get() {
        return Ok(id.clone());
    }
    let ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36";
    let html = http
        .get("https://soundcloud.com/")
        .header("User-Agent", ua)
        .send()
        .await?
        .error_for_status()?
        .text()
        .await?;
    let mut assets = Vec::new();
    let mut rest = html.as_str();
    while let Some(i) = rest.find("https://a-v2.sndcdn.com/assets/") {
        let tail = &rest[i..];
        let end = tail.find('"').unwrap_or(tail.len());
        let asset = &tail[..end];
        if asset.ends_with(".js") {
            assets.push(asset.to_string());
        }
        rest = &tail[end..];
    }
    let mut found = None;
    for asset in assets.iter().rev().take(4) {
        let Ok(js) = http
            .get(asset)
            .header("User-Agent", ua)
            .send()
            .await?
            .error_for_status()?
            .text()
            .await
        else {
            continue;
        };
        if let Some(id) = js_find_client_id(&js) {
            found = Some(id);
            break;
        }
    }
    let id = found.ok_or_else(|| CoreError::Blocked("soundcloud client_id".into()))?;
    let _ = SC_CLIENT_ID.set(id.clone());
    Ok(id)
}

async fn soundcloud(http: &Client, url: &str) -> Result<Parsed> {
    let cid = sc_client_id(http).await?;
    let val: Value = http
        .get("https://api-v2.soundcloud.com/resolve")
        .query(&[("url", url), ("client_id", cid.as_str())])
        .header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64)")
        .send()
        .await?
        .error_for_status()?
        .json()
        .await?;
    let kind = val.get("kind").and_then(|x| x.as_str()).unwrap_or("").to_string();
    let name = val
        .get("title")
        .and_then(|x| x.as_str())
        .unwrap_or("SoundCloud")
        .to_string();
    let mut raw_tracks: Vec<Value> = match kind.as_str() {
        "track" => vec![val],
        "playlist" | "system-playlist" => val
            .get("tracks")
            .and_then(|x| x.as_array())
            .cloned()
            .unwrap_or_default(),
        _ => return Err(CoreError::Parse("unsupported soundcloud link".into())),
    };
    // Search results and playlists often return stub entries (id only) — fetch full objects.
    let stub_ids: Vec<String> = raw_tracks
        .iter()
        .filter(|t| t.get("title").and_then(|x| x.as_str()).is_none())
        .filter_map(|t| t.get("id").and_then(|x| x.as_u64()))
        .map(|i| i.to_string())
        .collect();
    if !stub_ids.is_empty() {
        // The endpoint rejects large batches — fetch in chunks of 50 ids.
        for chunk in stub_ids.chunks(50) {
            let ids = chunk.join(",");
            let full: Value = http
                .get("https://api-v2.soundcloud.com/tracks")
                .query(&[("ids", ids.as_str()), ("client_id", cid.as_str())])
                .header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64)")
                .send()
                .await?
                .error_for_status()?
                .json()
                .await?;
            if let Some(arr) = full.as_array() {
                raw_tracks.extend(arr.clone());
            }
        }
    }
    let mut to_match = Vec::new();
    for t in raw_tracks {
        let title = t.get("title").and_then(|x| x.as_str()).unwrap_or("").to_string();
        if title.is_empty() {
            continue;
        }
        let artist = t
            .pointer("/publisher_metadata/artist")
            .and_then(|x| x.as_str())
            .or_else(|| t.pointer("/user/username").and_then(|x| x.as_str()))
            .unwrap_or("")
            .to_string();
        let dur = t
            .get("full_duration")
            .or_else(|| t.get("duration"))
            .and_then(|x| x.as_u64())
            .map(|d| (d / 1000) as u32);
        to_match.push(SourceTrack { title, artist, duration_secs: dur });
        if to_match.len() >= MAX_TRACKS {
            break;
        }
    }
    if to_match.is_empty() {
        return Err(CoreError::NotFound("soundcloud tracks".into()));
    }
    Ok(Parsed { kind: "soundcloud".into(), name, ready: Vec::new(), to_match })
}
