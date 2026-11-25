use crate::{CoreError, Result, StreamInfo, Thumb, TrackItem};
use reqwest::Client;
use serde_json::Value;
use std::sync::{LazyLock, RwLock};

const API: &str = "https://api-v2.soundcloud.com";
const HOME: &str = "https://soundcloud.com";
const UA: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36";

static CLIENT_ID: LazyLock<RwLock<Option<String>>> = LazyLock::new(|| RwLock::new(None));

pub struct Sc;

impl Sc {
    pub fn new() -> Self {
        Self
    }

    async fn scripts(&self, http: &Client) -> Vec<String> {
        let html = match http.get(HOME).header("User-Agent", UA).send().await {
            Ok(r) => match r.text().await {
                Ok(t) => t,
                Err(_) => return Vec::new(),
            },
            Err(_) => return Vec::new(),
        };
        let mut out = Vec::new();
        for part in html.split("src=\"").skip(1) {
            let Some(end) = part.find('"') else { continue };
            let u = &part[..end];
            if u.contains("a-v2.sndcdn.com/assets/") && u.ends_with(".js") {
                out.push(if u.starts_with("//") { format!("https:{u}") } else { u.to_string() });
            }
        }
        out.reverse();
        out
    }

    async fn raw_text(&self, http: &Client, url: &str) -> Result<String> {
        let resp = http.get(url).header("User-Agent", UA).send().await?;
        if !resp.status().is_success() {
            return Err(CoreError::Parse(format!("soundcloud http {}", resp.status())));
        }
        Ok(resp.text().await?)
    }

    fn find_client_id(js: &str) -> Option<String> {
        let bytes = js.as_bytes();
        let mut i = 0;
        while let Some(p) = js[i..].find("client_id") {
            let start = i + p + 9;
            let mut j = start;
            while j < bytes.len() && (bytes[j] as char).is_whitespace() {
                j += 1;
            }
            if j < bytes.len() && (bytes[j] == b':' || bytes[j] == b'=') {
                j += 1;
                while j < bytes.len() && ((bytes[j] as char).is_whitespace() || bytes[j] == b'"') {
                    j += 1;
                }
                let s = j;
                while j < bytes.len() && bytes[j].is_ascii_alphanumeric() {
                    j += 1;
                }
                if j - s == 32 {
                    return Some(js[s..j].to_string());
                }
            }
            i = start;
        }
        None
    }

    async fn discover_id(&self, http: &Client) -> Result<String> {
        for u in self.scripts(http).await {
            let text = match self.raw_text(http, &u).await {
                Ok(t) => t,
                Err(_) => continue,
            };
            if let Some(id) = Self::find_client_id(&text) {
                return Ok(id);
            }
        }
        Err(CoreError::Parse("soundcloud client id".into()))
    }

    pub async fn client_id(&self, http: &Client) -> Result<String> {
        if let Some(id) = CLIENT_ID.read().ok().and_then(|g| g.clone()) {
            return Ok(id);
        }
        let id = self.discover_id(http).await?;
        if let Ok(mut g) = CLIENT_ID.write() {
            *g = Some(id.clone());
        }
        Ok(id)
    }

    async fn api(&self, http: &Client, path: &str, params: &[(&str, &str)]) -> Result<Value> {
        let mut cid = self.client_id(http).await?;
        for _ in 0..2 {
            let mut pairs: Vec<(String, String)> =
                params.iter().map(|(k, v)| (k.to_string(), v.to_string())).collect();
            pairs.push(("client_id".into(), cid.clone()));
            let base = if path.starts_with("http") { path.to_string() } else { format!("{API}{path}") };
            let url = reqwest::Url::parse_with_params(&base, pairs.iter().map(|(k, v)| (k.as_str(), v.as_str())))
                .map_err(|e| CoreError::Parse(e.to_string()))?
                .to_string();
            let resp = http.get(&url).header("User-Agent", UA).send().await?;
            let status = resp.status().as_u16();
            if status == 401 || status == 403 {
                if let Ok(mut g) = CLIENT_ID.write() {
                    *g = None;
                }
                cid = self.discover_id(http).await?;
                continue;
            }
            return resp.error_for_status()?.json().await.map_err(Into::into);
        }
        Err(CoreError::Parse("soundcloud auth".into()))
    }

    fn big_art(url: Option<&str>) -> Option<String> {
        let url = url?;
        let dot = url.rfind('.')?;
        let dash = url[..dot].rfind('-')?;
        let tag = &url[dash + 1..dot];
        let ok = tag == "large"
            || tag == "crop"
            || tag == "original"
            || (tag.starts_with('t')
                && tag[1..].split_once('x').is_some_and(|(a, b)| {
                    !a.is_empty() && !b.is_empty() && a.chars().all(|c| c.is_ascii_digit()) && b.chars().all(|c| c.is_ascii_digit())
                }));
        if ok {
            Some(format!("{}-t500x500{}", &url[..dash], &url[dot..]))
        } else {
            Some(url.to_string())
        }
    }

    fn map_track(v: &Value) -> Option<TrackItem> {
        let id = v.get("id").and_then(Value::as_u64)?;
        let title = v.get("title").and_then(Value::as_str)?.trim();
        if title.is_empty() || v.get("streamable").and_then(Value::as_bool) == Some(false) {
            return None;
        }
        let policy = v.get("policy").and_then(Value::as_str).unwrap_or("").to_uppercase();
        if policy == "SNIP" || policy == "BLOCK" {
            return None;
        }
        let user = v.get("user").cloned().unwrap_or(Value::Null);
        let pub_meta = v.get("publisher_metadata").cloned().unwrap_or(Value::Null);
        let artist = pub_meta
            .get("artist")
            .and_then(Value::as_str)
            .filter(|s| !s.trim().is_empty())
            .or_else(|| user.get("username").and_then(Value::as_str))
            .unwrap_or("SoundCloud")
            .trim()
            .to_string();
        let secs = (v.get("duration").and_then(Value::as_u64).unwrap_or(0) / 1000) as u32;
        Some(TrackItem {
            video_id: format!("sc:{id}"),
            title: title.to_string(),
            artists: vec![artist],
            album: None,
            duration_secs: (secs > 0).then_some(secs),
            thumbs: Self::big_art(
                v.get("artwork_url")
                    .and_then(Value::as_str)
                    .or_else(|| user.get("avatar_url").and_then(Value::as_str)),
            )
            .map(|u| vec![Thumb { url: u, width: 500, height: 500 }])
            .unwrap_or_default(),
            explicit: pub_meta.get("explicit").and_then(Value::as_bool).unwrap_or(false),
            url: v.get("permalink_url").and_then(Value::as_str).map(String::from),
        })
    }

    fn tracks_of(body: &Value) -> Vec<TrackItem> {
        body.get("collection")
            .and_then(Value::as_array)
            .map(|a| a.iter().filter_map(Self::map_track).collect())
            .unwrap_or_default()
    }

    pub async fn search(&self, http: &Client, query: &str) -> Result<Vec<TrackItem>> {
        let body = self.api(http, "/search/tracks", &[("q", query), ("limit", "20")]).await?;
        Ok(Self::tracks_of(&body))
    }

    pub async fn related(&self, http: &Client, id: &str) -> Result<Vec<TrackItem>> {
        let body = self.api(http, &format!("/tracks/{id}/related"), &[("limit", "20")]).await?;
        Ok(Self::tracks_of(&body))
    }

    fn rank(proto: &str, mime: &str) -> Option<u8> {
        if mime.contains("mpegurl") {
            return None;
        }
        if proto == "progressive" {
            return Some(if mime.starts_with("audio/mpeg") { 0 } else { 1 });
        }
        if proto == "hls" {
            return Some(if mime.starts_with("audio/mpeg") { 2 } else { 3 });
        }
        None
    }

    fn proto_of(tc: &Value) -> Option<&str> {
        tc.pointer("/format/protocol").and_then(Value::as_str)
    }

    fn mime_type_of(tc: &Value) -> &str {
        tc.pointer("/format/mime_type").and_then(Value::as_str).unwrap_or("audio/mpeg")
    }

    fn mime_of(tc: &Value) -> String {
        let m = Self::mime_type_of(tc);
        if m.contains("mpeg") {
            "audio/mpeg".into()
        } else if m.contains("mp4") {
            "audio/mp4".into()
        } else if m.contains("opus") {
            "audio/ogg".into()
        } else {
            m.to_string()
        }
    }

    fn bitrate_of(tc: &Value) -> Option<u32> {
        let preset = tc.get("preset").and_then(Value::as_str)?;
        let kbps: String = preset.chars().skip_while(|c| !c.is_ascii_digit()).take_while(|c| c.is_ascii_digit()).collect();
        kbps.parse::<u32>().ok().map(|k| k * 1000)
    }

    async fn open(&self, http: &Client, tc: &Value, ta: &str, dur_ms: Option<u64>) -> Result<(StreamInfo, Option<Vec<u8>>)> {
        let turl = tc.get("url").and_then(Value::as_str).ok_or_else(|| CoreError::Parse("transcoding url".into()))?;
        let params: Vec<(&str, &str)> = if ta.is_empty() { Vec::new() } else { vec![("track_authorization", ta)] };
        let body = self.api(http, turl, &params).await?;
        let media = body
            .get("url")
            .and_then(Value::as_str)
            .ok_or_else(|| CoreError::Parse("media url".into()))?
            .to_string();
        let info = StreamInfo {
            url: String::new(),
            mime: Self::mime_of(tc),
            bitrate: Self::bitrate_of(tc),
            duration_ms: dur_ms,
        };
        let proto = Self::proto_of(tc).unwrap_or("");
        if proto == "progressive" {
            return Ok((StreamInfo { url: media, ..info }, None));
        }
        let data = self.hls(http, &media).await?;
        Ok((info, Some(data)))
    }

    pub async fn stream(&self, http: &Client, id: &str) -> Result<(StreamInfo, Option<Vec<u8>>)> {
        let track = self.api(http, &format!("/tracks/{id}"), &[]).await?;
        let ta = track.get("track_authorization").and_then(Value::as_str).unwrap_or("").to_string();
        let dur_ms = track.get("duration").and_then(Value::as_u64);
        let mut tcs: Vec<(Value, u8)> = track
            .pointer("/media/transcodings")
            .and_then(Value::as_array)
            .map(|a| {
                a.iter()
                    .filter(|t| t.get("snipped").and_then(Value::as_bool) != Some(true))
                    .filter_map(|t| {
                        let proto = Self::proto_of(t)?;
                        Some((t.clone(), Self::rank(proto, Self::mime_type_of(t))?))
                    })
                    .collect()
            })
            .unwrap_or_default();
        tcs.sort_by_key(|(_, r)| *r);
        let mut last = CoreError::NotFound("soundcloud transcoding".into());
        for (tc, _) in tcs {
            match self.open(http, &tc, &ta, dur_ms).await {
                Ok(x) => return Ok(x),
                Err(e) => last = e,
            }
        }
        Err(last)
    }

    fn abs_url(base: &str, rel: &str) -> String {
        if rel.starts_with("http") {
            rel.to_string()
        } else {
            match base.rfind('/') {
                Some(p) => format!("{}/{}", &base[..p], rel),
                None => rel.to_string(),
            }
        }
    }

    async fn hls(&self, http: &Client, url: &str) -> Result<Vec<u8>> {
        let mut cur = url.to_string();
        for _ in 0..3 {
            let text = self.raw_text(http, &cur).await?;
            if !text.starts_with("#EXTM3U") {
                return Err(CoreError::Parse("not hls".into()));
            }
            let mut segs: Vec<String> = Vec::new();
            let mut init: Option<String> = None;
            let mut variant: Option<String> = None;
            for line in text.lines() {
                let line = line.trim();
                if line.starts_with("#EXT-X-STREAM-INF") {
                    variant = Some(String::new());
                    continue;
                }
                if line.starts_with('#') {
                    if let Some(rest) = line.strip_prefix("#EXT-X-MAP:") {
                        if let Some(u) = rest.split("URI=\"").nth(1).and_then(|s| s.split('"').next()) {
                            init = Some(Self::abs_url(&cur, u));
                        }
                    }
                    if let Some(rest) = line.strip_prefix("#EXT-X-KEY:") {
                        if let Some(m) = rest.split("METHOD=").nth(1).and_then(|s| s.split([',', '"']).next()) {
                            if m != "NONE" {
                                return Err(CoreError::Blocked("encrypted hls".into()));
                            }
                        }
                    }
                    continue;
                }
                if line.is_empty() {
                    continue;
                }
                match variant.as_deref() {
                    Some("") => variant = Some(Self::abs_url(&cur, line)),
                    None => segs.push(Self::abs_url(&cur, line)),
                    _ => {}
                }
            }
            if let Some(v) = variant.filter(|v| !v.is_empty()) {
                cur = v;
                continue;
            }
            let mut out = Vec::new();
            if let Some(i) = init {
                out.extend(Self::segment_bytes(http, &i).await?);
            }
            for chunk in segs.chunks(6) {
                let mut handles = Vec::new();
                for s in chunk {
                    let c = http.clone();
                    let s = s.clone();
                    handles.push(tokio::spawn(async move { Self::segment_bytes(&c, &s).await }));
                }
                for h in handles {
                    out.extend(h.await.map_err(|e| CoreError::Parse(e.to_string()))??);
                }
            }
            return Ok(out);
        }
        Err(CoreError::Parse("hls depth".into()))
    }

    async fn segment_bytes(http: &Client, url: &str) -> Result<Vec<u8>> {
        for _ in 0..2 {
            let resp = http.get(url).header("User-Agent", UA).send().await;
            match resp {
                Ok(r) if r.status().is_success() => return Ok(r.bytes().await?.to_vec()),
                _ => continue,
            }
        }
        Err(CoreError::Parse("soundcloud segment".into()))
    }
}
