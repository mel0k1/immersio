use crate::{Browse, BrowseAlbum, BrowseArtist, BrowsePlaylist, CollectionItem, ItemKind, Result, SearchResults, Shelf, StreamInfo, Thumb, TrackItem, CoreError};
use reqwest::Client;
use serde_json::{json, Value};
use std::sync::{LazyLock, RwLock};

const API: &str = "https://music.youtube.com/youtubei/v1";

struct ClientCtx {
    name: &'static str,
    version: &'static str,
    ua: &'static str,
    extra: Value,
}

static CLIENTS: LazyLock<Vec<ClientCtx>> = LazyLock::new(|| {
    vec![
        ClientCtx {
            name: "IOS",
            version: "20.10.4",
            ua: "com.google.ios.youtube/20.10.4 (iPhone16,2; U; CPU iOS 18_1_0 like Mac OS X)",
            extra: json!({"deviceModel": "iPhone16,2", "osName": "iPhone", "osVersion": "18.1.0.22B83"}),
        },
        ClientCtx {
            name: "ANDROID",
            version: "19.09.37",
            ua: "com.google.android.youtube/19.09.37 (Linux; U; Android 11) gzip",
            extra: json!({"androidSdkVersion": 30, "osName": "Android", "osVersion": "11"}),
        },
        ClientCtx {
            name: "MWEB",
            version: "2.20250311.03.00",
            ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 16_7_10 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1",
            extra: json!({}),
        },
        ClientCtx {
            name: "WEB_REMIX",
            version: "1.20250310.01.00",
            ua: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36",
            extra: json!({}),
        },
    ]
});

const REMIX: usize = 3;

#[derive(Clone)]
pub struct Yt {
    http: Client,
    visitor: std::sync::Arc<RwLock<Option<String>>>,
}

fn pick_thumbs(v: &Value) -> Vec<Thumb> {
    let mut out = Vec::new();
    if let Some(items) = pointer_thumbs(v) {
        for t in items {
            if let (Some(url), w, h) = (
                t.get("url").and_then(|x| x.as_str()).map(String::from),
                t.get("width").and_then(|x| x.as_u64()),
                t.get("height").and_then(|x| x.as_u64()),
            ) {
                let url = url.replace("http://", "https://");
                out.push(Thumb {
                    url,
                    width: w.unwrap_or(0) as u32,
                    height: h.unwrap_or(0) as u32,
                });
            }
        }
    }
    out.sort_by(|a, b| a.width.cmp(&b.width));
    out
}

fn pointer_thumbs(v: &Value) -> Option<&Vec<Value>> {
    v.pointer("/thumbnail/musicThumbnailRenderer/thumbnail/thumbnails")
        .or_else(|| v.pointer("/thumbnailRenderer/musicThumbnailRenderer/thumbnail/thumbnails"))
        .or_else(|| v.pointer("/musicThumbnailRenderer/thumbnail/thumbnails"))
        .or_else(|| v.pointer("/thumbnail/thumbnails"))
        .and_then(|x| x.as_array())
}

fn runs_text(v: &Value) -> String {
    let mut s = String::new();
    if let Some(arr) = v.get("runs").and_then(|x| x.as_array()) {
        for r in arr {
            if let Some(t) = r.get("text").and_then(|x| x.as_str()) {
                s.push_str(t);
            }
        }
    }
    if s.is_empty() {
        if let Some(t) = v.get("simpleText").and_then(|x| x.as_str()) {
            s = t.to_string();
        }
    }
    s
}

fn first_run_nav(v: &Value) -> Option<&Value> {
    v.get("runs")
        .and_then(|x| x.as_array())
        .and_then(|a| a.first())
        .and_then(|r| r.get("navigationEndpoint"))
}

fn is_dur(s: &str) -> bool {
    let t = s.trim();
    let parts: Vec<&str> = t.split(':').collect();
    (parts.len() == 2 || parts.len() == 3)
        && parts.iter().all(|p| !p.is_empty() && p.chars().all(|c| c.is_ascii_digit()))
}

fn parse_dur(s: &str) -> Option<u32> {
    let parts: Vec<&str> = s.trim().split(':').collect();
    let mut secs = 0u64;
    for p in &parts {
        secs = secs.checked_mul(60)?.checked_add(p.trim().parse().ok()?)?;
    }
    Some(secs as u32)
}

fn walk_video_ids(v: &Value, out: &mut Vec<String>) {
    match v {
        Value::Object(m) => {
            if let Some(id) = m.get("videoId").and_then(|x| x.as_str()) {
                out.push(id.to_string());
            }
            for x in m.values() {
                walk_video_ids(x, out);
            }
        }
        Value::Array(a) => {
            for x in a {
                walk_video_ids(x, out);
            }
        }
        _ => {}
    }
}

fn song_video_id(row: &Value) -> Option<String> {
    if let Some(id) = row.pointer("/playlistItemData/videoId").and_then(|x| x.as_str()) {
        return Some(id.to_string());
    }
    if let Some(id) = first_run_nav(row)
        .and_then(|n| n.pointer("/watchEndpoint/videoId"))
        .and_then(|x| x.as_str())
    {
        return Some(id.to_string());
    }
    if let Some(id) = row
        .get("navigationEndpoint")
        .and_then(|n| n.pointer("/watchEndpoint/videoId"))
        .and_then(|x| x.as_str())
    {
        return Some(id.to_string());
    }
    let mut ids = Vec::new();
    walk_video_ids(&row["menu"], &mut ids);
    ids.into_iter().next()
}

fn row_browse_id(row: &Value) -> Option<String> {
    first_run_nav(row)
        .and_then(|n| n.pointer("/browseEndpoint/browseId"))
        .and_then(|x| x.as_str())
        .map(String::from)
        .or_else(|| {
            row.get("navigationEndpoint")
                .and_then(|n| n.pointer("/browseEndpoint/browseId"))
                .and_then(|x| x.as_str())
                .map(String::from)
        })
}

fn flex_cols(row: &Value) -> Vec<&Value> {
    row.get("flexColumns")
        .and_then(|x| x.as_array())
        .map(|a| a.iter().map(|c| &c["musicResponsiveListItemFlexColumnRenderer"]).collect())
        .unwrap_or_default()
}

const KIND_LABELS: &[&str] = &[
    "композиция",
    "song",
    "трек",
    "track",
    "видео",
    "video",
    "сингл",
    "single",
    "ep",
    "альбом",
    "album",
    "плейлист",
    "playlist",
    "исполнитель",
    "artist",
    "профиль",
    "profile",
];

fn strip_kind_label(segments: Vec<String>) -> Vec<String> {
    if let Some(first) = segments.first() {
        let f = first.trim().to_lowercase();
        if KIND_LABELS.iter().any(|k| f == *k) {
            return segments[1..].to_vec();
        }
    }
    segments
}

fn find_duration(cols: &[&Value]) -> Option<u32> {
    for c in cols {
        let t = runs_text(&c["text"]);
        if is_dur(&t) {
            return parse_dur(&t);
        }
    }
    None
}

fn explicit_of(row: &Value) -> bool {
    row.get("badges")
        .and_then(|b| b.as_array())
        .map(|b| {
            b.iter().any(|x| {
                x.pointer("/musicInlineBadgeRenderer/icon/iconType")
                    .and_then(|i| i.as_str())
                    .map(|s| s.contains("EXPLICIT"))
                    .unwrap_or(false)
            })
        })
        .unwrap_or(false)
}

fn is_junk_segment(s: &str) -> bool {
    let l = s.to_lowercase();
    l.contains("просмотр") || l.contains("view") || l.contains("слушател") || l.contains("listener") || l.contains("подписчик")
}

fn parse_song_row(row: &Value) -> Option<TrackItem> {
    let row = row.get("musicResponsiveListItemRenderer").unwrap_or(row);
    let cols = flex_cols(row);
    if cols.is_empty() {
        return None;
    }
    let title = runs_text(&cols[0]["text"]);
    let video_id = song_video_id(row)?;
    if title.is_empty() || video_id.is_empty() {
        return None;
    }
    let secondary = cols.get(1).map(|c| runs_text(&c["text"])).unwrap_or_default();
    let mut segments: Vec<String> = strip_kind_label(
        secondary
            .split('•')
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .collect(),
    );
    let mut duration = find_duration(&cols);
    if duration.is_none() {
        if let Some(last) = segments.last() {
            if is_dur(last) {
                duration = parse_dur(last);
                segments.pop();
            }
        }
    }
    segments.retain(|s| !is_junk_segment(s));
    let mut artists = segments.clone();
    let mut album = None;
    if segments.len() >= 2 {
        let last = segments.last().unwrap().clone();
        album = Some(last);
        artists = segments[..segments.len() - 1].to_vec();
    }
    Some(TrackItem {
        video_id,
        title,
        artists,
        album,
        duration_secs: duration,
        thumbs: pick_thumbs(row),
        explicit: explicit_of(row),
    })
}

fn kind_from_browse(browse_id: &str) -> Option<ItemKind> {
    if browse_id.starts_with("MPRE") {
        Some(ItemKind::Album)
    } else if browse_id.starts_with("UC") {
        Some(ItemKind::Artist)
    } else if browse_id.starts_with("VL") || browse_id.starts_with("MPL") || browse_id.starts_with("PL") {
        Some(ItemKind::Playlist)
    } else {
        None
    }
}

fn subtitle_of(row: &Value) -> String {
    let cols = flex_cols(row);
    cols.get(1)
        .map(|c| runs_text(&c["text"]))
        .unwrap_or_default()
}

fn parse_collection_row(row: &Value, hint: ItemKind) -> Option<CollectionItem> {
    let cols = flex_cols(row);
    let title = cols.first().map(|c| runs_text(&c["text"])).unwrap_or_default();
    let browse_id = row_browse_id(row)?;
    if title.is_empty() || browse_id.is_empty() {
        return None;
    }
    let subtitle = strip_kind_label(
        subtitle_of(row)
            .split('•')
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .collect(),
    )
    .join(" • ");
    let kind = kind_from_browse(&browse_id).unwrap_or(hint);
    Some(CollectionItem {
        browse_id,
        kind,
        title,
        subtitle,
        thumbs: pick_thumbs(row),
    })
}

fn parse_two_row(row: &Value, hint: ItemKind) -> Option<CollectionItem> {
    let title = row
        .pointer("/title/runs/0/text")
        .and_then(|x| x.as_str())
        .unwrap_or_default()
        .to_string();
    if title.is_empty() {
        return None;
    }
    let browse_id = row
        .pointer("/navigationEndpoint/browseEndpoint/browseId")
        .and_then(|x| x.as_str())
        .unwrap_or_default()
        .to_string();
    if browse_id.is_empty() {
        return None;
    }
    let subtitle = row.get("subtitle").map(runs_text).unwrap_or_default();
    let kind = kind_from_browse(&browse_id).unwrap_or(hint);
    Some(CollectionItem {
        browse_id,
        kind,
        title,
        subtitle,
        thumbs: pick_thumbs(row),
    })
}

fn fix_video_title(t: &mut TrackItem) {
    if let Some(pos) = t.title.find(" — ") {
        let mut artist = t.title[..pos].trim().to_string();
        let rest = t.title[pos + 3..].trim().to_string();
        if let Some(cp) = artist.rfind(", ") {
            let tail = artist[cp + 2..].to_lowercase();
            if tail.contains("просмотр") || tail.contains("view") {
                artist = artist[..cp].trim().to_string();
            }
        }
        t.title = rest;
        if t.artists.is_empty() && !artist.is_empty() {
            t.artists = vec![artist];
        }
    }
}

fn classify_row(row: &Value, hint: ItemKind, tracks: &mut Vec<TrackItem>, videos: &mut Vec<TrackItem>, collections: &mut Vec<CollectionItem>) {
    let video_id = song_video_id(row);
    if let Some(vid) = video_id {
        if let Some(mut t) = parse_song_row(row) {
            let sub = subtitle_of(row).to_lowercase();
            let is_video = hint == ItemKind::Video || sub.starts_with("видео") || sub.starts_with("video");
            t.video_id = vid;
            if is_video {
                fix_video_title(&mut t);
                videos.push(t);
            } else {
                tracks.push(t);
            }
            return;
        }
    }
    if let Some(c) = parse_collection_row(row, hint) {
        collections.push(c);
    }
}

fn card_row(card: &Value) -> Value {
    let mut cols = Vec::new();
    cols.push(json!({"musicResponsiveListItemFlexColumnRenderer": {"text": card.get("title").cloned().unwrap_or_default()}}));
    cols.push(json!({"musicResponsiveListItemFlexColumnRenderer": {"text": card.get("subtitle").cloned().unwrap_or_default()}}));
    let mut pseudo = json!({
        "flexColumns": cols,
        "thumbnail": card.get("thumbnailRenderer").cloned().unwrap_or_default(),
        "navigationEndpoint": card.get("navigationEndpoint").cloned().unwrap_or_default(),
    });
    fix_card_video(&mut pseudo);
    pseudo
}

fn fix_card_video(pseudo: &mut Value) {
    let sub = pseudo
        .pointer("/flexColumns/1/musicResponsiveListItemFlexColumnRenderer/text/runs/0/text")
        .and_then(|x| x.as_str())
        .unwrap_or("")
        .to_lowercase();
    if !(sub.starts_with("видео") || sub.starts_with("video")) {
        return;
    }
    let title = pseudo
        .pointer("/flexColumns/0/musicResponsiveListItemFlexColumnRenderer/text/runs/0/text")
        .and_then(|x| x.as_str())
        .unwrap_or("")
        .to_string();
    if let Some(pos) = title.find(" — ") {
        let mut artist = title[..pos].to_string();
        let rest = title[pos + 3..].to_string();
        if let Some(cp) = artist.rfind(", ") {
            let tail = artist[cp + 2..].to_lowercase();
            if tail.contains("просмотр") || tail.contains("view") {
                artist = artist[..cp].to_string();
            }
        }
        if let Some(obj) = pseudo.as_object_mut() {
            obj["flexColumns"] = json!([
                {"musicResponsiveListItemFlexColumnRenderer": {"text": {"runs": [{"text": rest}]}}},
                {"musicResponsiveListItemFlexColumnRenderer": {"text": {"runs": [{"text": artist}]}}},
            ]);
        }
    }
}

fn shelf_title(v: &Value) -> Option<String> {
    let key = if v.get("musicShelfRenderer").is_some() {
        "musicShelfRenderer"
    } else if v.get("musicCardShelfRenderer").is_some() {
        "musicCardShelfRenderer"
    } else {
        return None;
    };
    v.pointer(&format!("/{key}/title/runs/0/text"))
        .and_then(|x| x.as_str())
        .map(String::from)
}

fn shelf_kind_hint(title: &str) -> ItemKind {
    let t = title.to_lowercase();
    if t.contains("видео") || t.contains("video") {
        ItemKind::Video
    } else if t.contains("песн") || t.contains("song") || t.contains("трек") || t.contains("track") || t.contains("компози") {
        ItemKind::Track
    } else if t.contains("альбом") || t.contains("album") {
        ItemKind::Album
    } else if t.contains("исполн") || t.contains("artist") || t.contains("профил") || t.contains("profile") {
        ItemKind::Artist
    } else {
        ItemKind::Playlist
    }
}

impl Yt {
    pub fn new() -> Self {
        let http = Client::builder()
            .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36")
            .build()
            .expect("client");
        Self {
            http,
            visitor: std::sync::Arc::new(RwLock::new(None)),
        }
    }

    fn context(&self, idx: usize, hl: &str) -> Value {
        let c = &CLIENTS[idx];
        let mut client = json!({
            "clientName": c.name,
            "clientVersion": c.version,
            "hl": hl,
            "gl": "US",
        });
        if let Some(obj) = client.as_object_mut() {
            if let Some(extra) = c.extra.as_object() {
                for (k, v) in extra {
                    obj.insert(k.clone(), v.clone());
                }
            }
            if let Ok(guard) = self.visitor.read() {
                if let Some(vd) = guard.as_ref() {
                    obj.insert("visitorData".into(), json!(vd));
                }
            }
        }
        json!({"client": client})
    }

    async fn post(&self, endpoint: &str, body: Value, idx: usize, hl: &str) -> Result<Value> {
        let c = &CLIENTS[idx];
        let mut body = body;
        if let Some(obj) = body.as_object_mut() {
            obj.insert("context".into(), self.context(idx, hl));
        }
        let resp = self
            .http
            .post(format!("{API}/{endpoint}?prettyPrint=false"))
            .header("Content-Type", "application/json")
            .header("User-Agent", c.ua)
            .header("X-YouTube-Client-Name", client_name_num(c.name))
            .header("X-YouTube-Client-Version", c.version)
            .json(&body)
            .send()
            .await?;
        let val: Value = resp.json().await?;
        if let Some(vd) = val.pointer("/responseContext/visitorData").and_then(|x| x.as_str()) {
            if let Ok(mut guard) = self.visitor.write() {
                *guard = Some(vd.to_string());
            }
        }
        Ok(val)
    }

    pub async fn search(&self, query: &str, hl: &str) -> Result<SearchResults> {
        let val = self.post("search", json!({"query": query}), REMIX, hl).await?;
        let sections = val
            .pointer("/contents/tabbedSearchResultsRenderer/tabs/0/tabRenderer/content/sectionListRenderer/contents")
            .and_then(|x| x.as_array())
            .cloned()
            .unwrap_or_default();
        let mut tracks = Vec::new();
        let mut videos = Vec::new();
        let mut albums = Vec::new();
        let mut artists = Vec::new();
        let mut playlists = Vec::new();
        let mut seen = std::collections::HashSet::new();

        for s in &sections {
            if s.get("musicCardShelfRenderer").is_some() {
                let card = &s["musicCardShelfRenderer"];
                let pseudo = card_row(card);
                let hint = shelf_kind_hint(&shelf_title(s).unwrap_or_default());
                let before_t = tracks.len();
                let before_v = videos.len();
                let before_c = albums.len() + artists.len() + playlists.len();
                classify_row(&pseudo, hint, &mut tracks, &mut videos, &mut playlists);
                if tracks.len() == before_t && videos.len() == before_v
                    && albums.len() + artists.len() + playlists.len() == before_c
                {
                    for row in card.get("contents").and_then(|x| x.as_array()).into_iter().flatten() {
                        if row.get("musicResponsiveListItemRenderer").is_some() {
                            classify_row(&row["musicResponsiveListItemRenderer"], hint, &mut tracks, &mut videos, &mut playlists);
                        }
                    }
                }
                continue;
            }
            if s.get("musicShelfRenderer").is_some() {
                let hint = shelf_kind_hint(&shelf_title(s).unwrap_or_default());
                for row in s.pointer("/musicShelfRenderer/contents").and_then(|x| x.as_array()).into_iter().flatten() {
                    if row.get("musicResponsiveListItemRenderer").is_some() {
                        classify_row(&row["musicResponsiveListItemRenderer"], hint, &mut tracks, &mut videos, &mut playlists);
                    } else if row.get("musicTwoRowItemRenderer").is_some() {
                        if let Some(c) = parse_two_row(&row["musicTwoRowItemRenderer"], hint) {
                            match c.kind {
                                ItemKind::Album => albums.push(c),
                                ItemKind::Artist => artists.push(c),
                                _ => playlists.push(c),
                            }
                        }
                    }
                }
                continue;
            }
            for row in s.pointer("/itemSectionRenderer/contents").and_then(|x| x.as_array()).into_iter().flatten() {
                if row.get("musicResponsiveListItemRenderer").is_some() {
                    classify_row(&row["musicResponsiveListItemRenderer"], ItemKind::Track, &mut tracks, &mut videos, &mut playlists);
                } else if row.get("musicTwoRowItemRenderer").is_some() {
                    if let Some(c) = parse_two_row(&row["musicTwoRowItemRenderer"], ItemKind::Album) {
                        match c.kind {
                            ItemKind::Album => albums.push(c),
                            ItemKind::Artist => artists.push(c),
                            _ => playlists.push(c),
                        }
                    }
                }
            }
        }

        let mut dedup_list = |v: &mut Vec<TrackItem>| {
            let mut out = Vec::new();
            for t in v.drain(..) {
                if seen.insert(format!("t:{}", t.video_id)) {
                    out.push(t);
                }
            }
            *v = out;
        };
        dedup_list(&mut tracks);
        dedup_list(&mut videos);

        let mut shelves = Vec::new();
        if !tracks.is_empty() {
            shelves.push(Shelf {
                kind: ItemKind::Track,
                title: "tracks".into(),
                tracks,
                collections: Vec::new(),
            });
        }
        if !videos.is_empty() {
            shelves.push(Shelf {
                kind: ItemKind::Video,
                title: "videos".into(),
                tracks: videos,
                collections: Vec::new(),
            });
        }
        let mut col_shelf = |kind: ItemKind, mut items: Vec<CollectionItem>| {
            let mut out = Vec::new();
            let mut s2 = std::collections::HashSet::new();
            for c in items.drain(..) {
                if s2.insert(c.browse_id.clone()) && seen.insert(format!("b:{}", c.browse_id)) {
                    out.push(c);
                }
            }
            if !out.is_empty() {
                shelves.push(Shelf {
                    kind,
                    title: format!("{kind:?}").to_lowercase(),
                    tracks: Vec::new(),
                    collections: out,
                });
            }
        };
        col_shelf(ItemKind::Album, albums);
        col_shelf(ItemKind::Artist, artists);
        col_shelf(ItemKind::Playlist, playlists);
        Ok(SearchResults { shelves })
    }

    pub async fn browse(&self, browse_id: &str, hl: &str) -> Result<Browse> {
        let val = self
            .post("browse", json!({"browseId": browse_id}), REMIX, hl)
            .await?;
        if browse_id.starts_with("MPRE") {
            parse_album(&val, browse_id).map(Browse::Album)
        } else if browse_id.starts_with("UC") {
            parse_artist(&val, browse_id).map(Browse::Artist)
        } else {
            parse_playlist(&val, browse_id).map(Browse::Playlist)
        }
    }

    pub async fn stream(&self, video_id: &str, hl: &str, quality: &str) -> Result<StreamInfo> {
        let mut last_reason = String::new();
        for idx in 0..CLIENTS.len() {
            let val = self
                .post(
                    "player",
                    json!({"videoId": video_id, "contentCheckOk": true, "racyCheckOk": true}),
                    idx,
                    hl,
                )
                .await?;
            let status = val
                .pointer("/playabilityStatus/status")
                .and_then(|x| x.as_str())
                .unwrap_or("");
            if status == "OK" {
                let formats = val
                    .pointer("/streamingData/adaptiveFormats")
                    .and_then(|x| x.as_array())
                    .cloned()
                    .unwrap_or_default();
                let mut audio: Vec<Value> = formats
                    .into_iter()
                    .filter(|f| {
                        f.get("mimeType")
                            .and_then(|m| m.as_str())
                            .map(|m| m.starts_with("audio/"))
                            .unwrap_or(false)
                            && f.get("url").is_some()
                    })
                    .collect();
                if audio.is_empty() {
                    continue;
                }
                audio.sort_by_key(|f| f.get("bitrate").and_then(|b| b.as_u64()).unwrap_or(0));
                let best = if quality == "low" {
                    audio.first().unwrap()
                } else {
                    audio.last().unwrap()
                };
                let url = best.get("url").and_then(|u| u.as_str()).unwrap().to_string();
                let mime = best
                    .get("mimeType")
                    .and_then(|m| m.as_str())
                    .unwrap_or("audio/mp4")
                    .split(';')
                    .next()
                    .unwrap_or("audio/mp4")
                    .to_string();
                return Ok(StreamInfo {
                    url,
                    mime,
                    bitrate: best.get("bitrate").and_then(|b| b.as_u64()).map(|b| b as u32),
                    duration_ms: best.get("approxDurationMs").and_then(|d| d.as_u64()),
                });
            }
            last_reason = val
                .pointer("/playabilityStatus/reason")
                .and_then(|x| x.as_str())
                .unwrap_or(status)
                .to_string();
        }
        Err(if last_reason.contains("бот")
            || last_reason.to_lowercase().contains("sign in")
            || last_reason.to_lowercase().contains("confirm")
        {
            CoreError::Blocked(last_reason)
        } else {
            CoreError::NotFound(last_reason)
        })
    }

    pub async fn radio(&self, video_id: &str, hl: &str) -> Result<Vec<TrackItem>> {
        let n1 = self
            .post("next", json!({"videoId": video_id}), REMIX, hl)
            .await?;
        let rid = find_radio_playlist(&n1).ok_or_else(|| CoreError::NotFound("radio".into()))?;
        let n2 = self
            .post("next", json!({"playlistId": rid}), REMIX, hl)
            .await?;
        let mut nodes = Vec::new();
        collect_nodes(&n2, "playlistPanelVideoRenderer", &mut nodes);
        let mut out = Vec::new();
        let mut seen = std::collections::HashSet::new();
        for r in nodes {
            let vid = r.get("videoId").and_then(|x| x.as_str()).unwrap_or("");
            if vid.is_empty() || !seen.insert(vid.to_string()) {
                continue;
            }
            let title = r
                .pointer("/title/runs/0/text")
                .and_then(|x| x.as_str())
                .unwrap_or("");
            if title.is_empty() {
                continue;
            }
            let artist = r
                .pointer("/shortBylineText/runs/0/text")
                .and_then(|x| x.as_str())
                .unwrap_or("");
            let dur = r
                .pointer("/lengthText/runs/0/text")
                .and_then(|x| x.as_str())
                .and_then(parse_dur);
            out.push(TrackItem {
                video_id: vid.to_string(),
                title: title.to_string(),
                artists: if artist.is_empty() { vec![] } else { vec![artist.to_string()] },
                album: None,
                duration_secs: dur,
                thumbs: pick_thumbs(r),
                explicit: false,
            });
        }
        if out.is_empty() {
            return Err(CoreError::NotFound("radio tracks".into()));
        }
        Ok(out)
    }
}

fn find_radio_playlist(val: &Value) -> Option<String> {
    fn walk(v: &Value, out: &mut Option<String>) {
        if out.is_some() {
            return;
        }
        if let Some(obj) = v.as_object() {
            for (k, val) in obj {
                if k == "playlistId" {
                    if let Some(s) = val.as_str() {
                        if s.starts_with("RD") {
                            *out = Some(s.to_string());
                            return;
                        }
                    }
                }
                walk(val, out);
                if out.is_some() {
                    return;
                }
            }
        } else if let Some(arr) = v.as_array() {
            for x in arr {
                walk(x, out);
                if out.is_some() {
                    return;
                }
            }
        }
    }
    let mut out = None;
    walk(val, &mut out);
    out
}

fn collect_nodes<'a>(v: &'a Value, key: &str, out: &mut Vec<&'a Value>) {
    if let Some(obj) = v.as_object() {
        for (k, val) in obj {
            if k == key {
                out.push(val);
            }
            collect_nodes(val, key, out);
        }
    } else if let Some(arr) = v.as_array() {
        for x in arr {
            collect_nodes(x, key, out);
        }
    }
}

fn client_name_num(name: &str) -> &'static str {
    match name {
        "IOS" => "5",
        "ANDROID" => "3",
        "WEB_REMIX" => "67",
        _ => "2",
    }
}

fn find_header<'a>(val: &'a Value, key: &str) -> Option<&'a Value> {
    let mut stack = vec![val];
    let mut visited = 0;
    while let Some(node) = stack.pop() {
        visited += 1;
        if visited > 30000 {
            return None;
        }
        if let Some(obj) = node.as_object() {
            if let Some(found) = obj.get(key) {
                return Some(found);
            }
            for v in obj.values() {
                if v.is_object() || v.is_array() {
                    stack.push(v);
                }
            }
        } else if let Some(arr) = node.as_array() {
            for v in arr {
                if v.is_object() || v.is_array() {
                    stack.push(v);
                }
            }
        }
    }
    None
}

fn header_subtitle_runs(val: &Value) -> Vec<String> {
    ["musicResponsiveHeaderRenderer", "musicImmersiveHeaderRenderer", "musicDetailHeaderRenderer"]
        .iter()
        .find_map(|k| {
            find_header(val, k)
                .and_then(|h| h.get("subtitle"))
                .and_then(|x| x.get("runs"))
                .and_then(|x| x.as_array())
                .map(|a| {
                    a.iter()
                        .filter_map(|r| r.get("text").and_then(|t| t.as_str()))
                        .map(String::from)
                        .collect::<Vec<_>>()
                })
        })
        .unwrap_or_default()
}

fn header_title(val: &Value) -> String {
    ["musicResponsiveHeaderRenderer", "musicImmersiveHeaderRenderer", "musicDetailHeaderRenderer"]
        .iter()
        .find_map(|k| {
            find_header(val, k)
                .and_then(|h| h.pointer("/title/runs/0/text"))
                .and_then(|x| x.as_str())
                .map(String::from)
        })
        .unwrap_or_default()
}

fn header_thumbs(val: &Value) -> Vec<Thumb> {
    ["musicResponsiveHeaderRenderer", "musicImmersiveHeaderRenderer", "musicDetailHeaderRenderer"]
        .iter()
        .find_map(|k| h_thumbnail(val, k))
        .unwrap_or_default()
}

fn h_thumbnail(val: &Value, key: &str) -> Option<Vec<Thumb>> {
    let h = find_header(val, key)?;
    let items = h
        .pointer("/thumbnail/musicThumbnailRenderer/thumbnail/thumbnails")
        .or_else(|| h.pointer("/thumbnail/thumbnails"))?
        .as_array()?;
    let mut out: Vec<Thumb> = items
        .iter()
        .filter_map(|t| {
            let url = t.get("url").and_then(|x| x.as_str()).map(|s| s.replace("http://", "https://"))?;
            Some(Thumb {
                url,
                width: t.get("width").and_then(|x| x.as_u64()).unwrap_or(0) as u32,
                height: t.get("height").and_then(|x| x.as_u64()).unwrap_or(0) as u32,
            })
        })
        .collect();
    out.sort_by(|a, b| a.width.cmp(&b.width));
    Some(out)
}

fn shelf_rows(val: &Value) -> Vec<Value> {
    let mut rows = Vec::new();
    let mut stack: Vec<&Value> = vec![&val["contents"]];
    let mut visited = 0;
    while let Some(node) = stack.pop() {
        visited += 1;
        if visited > 5000 {
            break;
        }
        if let Some(arr) = node.as_array() {
            for item in arr {
                if let Some(r) = item.get("musicResponsiveListItemRenderer") {
                    rows.push(r.clone());
                } else if let Some(t) = item.get("musicTrackRenderer") {
                    rows.push(track_renderer_row(t));
                } else {
                    stack.push(item);
                }
            }
        } else if node.is_object() {
            for v in node.as_object().unwrap().values() {
                stack.push(v);
            }
        }
    }
    rows
}

fn track_renderer_row(t: &Value) -> Value {
    let title = t.pointer("/title/runs/0/text").and_then(|x| x.as_str()).unwrap_or_default().to_string();
    let mut cols = Vec::new();
    cols.push(json!({"musicResponsiveListItemFlexColumnRenderer": {"text": {"runs": [{"text": title}]}}}));
    let artists: Vec<Value> = t
        .get("artistNames")
        .and_then(|a| a.as_array())
        .map(|a| a.iter().map(|x| json!({"text": x.as_str().unwrap_or_default()})).collect())
        .unwrap_or_else(|| {
            t.get("artists")
                .and_then(|a| a.as_array())
                .map(|a| {
                    a.iter()
                        .map(|a| json!({"text": a.get("name").and_then(|n| n.as_str()).unwrap_or_default()}))
                        .collect()
                })
                .unwrap_or_default()
        });
    if !artists.is_empty() {
        cols.push(json!({"musicResponsiveListItemFlexColumnRenderer": {"text": {"runs": artists}}}));
    }
    let dur = t
        .pointer("/duration/runs/0/text")
        .and_then(|x| x.as_str())
        .map(String::from)
        .or_else(|| {
            t.get("durationSeconds")
                .and_then(|d| d.as_u64())
                .map(|d| format!("{}:{:02}", d / 60, d % 60))
        });
    if let Some(d) = &dur {
        cols.push(json!({"musicResponsiveListItemFlexColumnRenderer": {"text": {"runs": [{"text": d}]}}}));
    }
    let mut row = json!({"flexColumns": cols});
    let mut ids = Vec::new();
    walk_video_ids(t, &mut ids);
    if let Some(id) = ids.into_iter().next() {
        row["playlistItemData"] = json!({"videoId": id});
    }
    row["thumbnail"] = json!({"musicThumbnailRenderer": {"thumbnail": {"thumbnails": t.get("thumbnails").cloned().unwrap_or_default()}}});
    row
}

fn parse_album(val: &Value, browse_id: &str) -> Result<BrowseAlbum> {
    let title = header_title(val);
    if title.is_empty() {
        return Err(CoreError::Parse("album header".into()));
    }
    let subtitle = header_subtitle_runs(val);
    let artists: Vec<String> = subtitle
        .iter()
        .filter(|s| !s.contains("track") && !s.contains("song") && !s.chars().all(|c| c.is_ascii_digit() || c == ':'))
        .cloned()
        .collect();
    let year: Option<String> = subtitle
        .iter()
        .find(|s| s.len() == 4 && s.chars().all(|c| c.is_ascii_digit()))
        .map(String::from);
    let meta = subtitle.iter().find(|s| s.contains("track") || s.contains("song")).cloned();
    let track_count = meta.and_then(|m| {
        m.split_whitespace()
            .find(|w| w.chars().all(|c| c.is_ascii_digit()))
            .and_then(|w| w.parse::<u32>().ok())
    });
    let tracks = shelf_rows(val).iter().filter_map(parse_song_row).collect();
    Ok(BrowseAlbum {
        browse_id: browse_id.to_string(),
        title,
        artists,
        year,
        track_count,
        thumbs: header_thumbs(val),
        tracks,
    })
}

fn collect_sections(val: &Value) -> Vec<Value> {
    let mut out = Vec::new();
    let mut stack = vec![val.clone()];
    let mut guard = 0;
    while let Some(node) = stack.pop() {
        guard += 1;
        if guard > 20000 {
            break;
        }
        if let Some(obj) = node.as_object() {
            for key in ["musicShelfRenderer", "musicCarouselShelfRenderer", "musicPlaylistShelfRenderer"] {
                if let Some(s) = obj.get(key) {
                    out.push(s.clone());
                }
            }
            for v in obj.values() {
                if v.is_object() || v.is_array() {
                    stack.push(v.clone());
                }
            }
        } else if let Some(arr) = node.as_array() {
            for v in arr {
                if v.is_object() || v.is_array() {
                    stack.push(v.clone());
                }
            }
        }
    }
    out.dedup_by(|a, b| a == b);
    out
}

fn parse_artist(val: &Value, browse_id: &str) -> Result<BrowseArtist> {
    let name = header_title(val);
    if name.is_empty() {
        return Err(CoreError::Parse("artist header".into()));
    }
    let description = ["musicImmersiveHeaderRenderer"]
        .iter()
        .find_map(|k| {
            find_header(val, k)
                .and_then(|h| h.pointer("/description/runs/0/text"))
                .and_then(|x| x.as_str())
                .map(String::from)
        });
    let mut top_tracks = Vec::new();
    let mut albums = Vec::new();
    let sections = collect_sections(val);
    let mut songs_found = false;
    for shelf in &sections {
        let shelf_title = shelf
            .pointer("/title/runs/0/text")
            .and_then(|x| x.as_str())
            .unwrap_or("")
            .to_lowercase();
        if let Some(rows) = shelf.pointer("/contents").and_then(|x| x.as_array()) {
            if !songs_found
                && (shelf_title.contains("song")
                    || shelf_title.contains("track")
                    || shelf_title.contains("трек")
                    || shelf_title.contains("топ")
                    || shelf_title.contains("top"))
            {
                for r in rows {
                    if let Some(t) = parse_song_row(r) {
                        top_tracks.push(t);
                    }
                }
                songs_found = !top_tracks.is_empty();
            }
        }
        if let Some(items) = shelf.get("contents").and_then(|x| x.as_array()) {
            for item in items {
                if let Some(c) = parse_two_row(&item["musicTwoRowItemRenderer"], ItemKind::Album) {
                    if c.kind == ItemKind::Album {
                        albums.push(c);
                    }
                }
            }
        }
    }
    if top_tracks.is_empty() {
        for r in shelf_rows(val).iter().take(30) {
            if let Some(t) = parse_song_row(r) {
                top_tracks.push(t);
            }
        }
    }
    Ok(BrowseArtist {
        browse_id: browse_id.to_string(),
        name,
        description,
        thumbs: header_thumbs(val),
        top_tracks,
        albums,
    })
}

fn parse_playlist(val: &Value, browse_id: &str) -> Result<BrowsePlaylist> {
    let title = header_title(val);
    if title.is_empty() {
        return Err(CoreError::Parse("playlist header".into()));
    }
    let subtitle = header_subtitle_runs(val);
    let owner = subtitle.get(2).map(String::from).or_else(|| subtitle.get(1).map(String::from));
    let tracks = shelf_rows(val).iter().filter_map(parse_song_row).collect();
    Ok(BrowsePlaylist {
        browse_id: browse_id.to_string(),
        title,
        owner,
        thumbs: header_thumbs(val),
        tracks,
    })
}
