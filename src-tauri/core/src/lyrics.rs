use crate::{CoreError, LyricLine, Lyrics, Result};
use serde_json::Value;

const BASE: &str = "https://lrclib.net/api";

fn parse_lrc(text: &str) -> Vec<LyricLine> {
    let mut out = Vec::new();
    for line in text.lines() {
        let Some((stamp, txt)) = line.split_once(']') else { continue };
        let inner = stamp.trim_start_matches('[');
        let parts: Vec<&str> = inner.split(':').collect();
        if parts.len() != 2 {
            continue;
        }
        let Ok(min) = parts[0].trim().parse::<u32>() else { continue };
        let Ok(sec) = parts[1].trim().parse::<f64>() else { continue };
        let ms = min * 60_000 + (sec * 1000.0) as u32;
        let text = txt.trim().to_string();
        if !text.is_empty() {
            out.push(LyricLine { time_ms: ms, text });
        }
    }
    out.sort_by_key(|l| l.time_ms);
    out
}

async fn get(client: &reqwest::Client, url: &str) -> Result<Value> {
    let resp = client
        .get(url)
        .header("User-Agent", "Immersio/0.1 (https://github.com/mel0k1/immersio)")
        .send()
        .await?;
    if !resp.status().is_success() {
        return Err(CoreError::NotFound(format!("lrclib {}", resp.status())));
    }
    Ok(resp.json().await?)
}

pub async fn fetch(
    client: &reqwest::Client,
    track: &str,
    artist: &str,
    album: Option<&str>,
    duration_secs: Option<u32>,
) -> Result<Lyrics> {
    let mut out = Lyrics {
        synced: Vec::new(),
        plain: None,
        found: false,
    };
    let mut url = format!(
        "{BASE}/get?track_name={}&artist_name={}",
        urlencode(track),
        urlencode(artist)
    );
    if let (Some(a), Some(d)) = (album, duration_secs) {
        url = format!("{url}&album_name={}&duration={d}", urlencode(a));
    }
    if let Ok(v) = get(client, &url).await {
        out = from_obj(&v);
    }
    if !out.found {
        let url = format!(
            "{BASE}/search?track_name={}&artist_name={}",
            urlencode(track),
            urlencode(artist)
        );
        if let Ok(v) = get(client, &url).await {
            if let Some(arr) = v.as_array() {
                let mut best: Option<&Value> = None;
                for item in arr {
                    if item.get("instrumental").and_then(|x| x.as_bool()).unwrap_or(false) {
                        continue;
                    }
                    best = Some(item);
                    if let (Some(want), Some(have)) = (duration_secs, item.get("duration").and_then(|d| d.as_f64())) {
                        if (have as i64 - want as i64).abs() <= 2 {
                            break;
                        }
                    }
                }
                if let Some(item) = best {
                    out = from_obj(item);
                }
            }
        }
    }
    if out.synced.is_empty() && out.plain.is_none() {
        return Err(CoreError::NotFound("lyrics".into()));
    }
    out.found = true;
    Ok(out)
}

fn from_obj(v: &Value) -> Lyrics {
    let synced = v
        .get("syncedLyrics")
        .and_then(|x| x.as_str())
        .map(parse_lrc)
        .unwrap_or_default();
    let plain = v
        .get("plainLyrics")
        .and_then(|x| x.as_str())
        .map(String::from);
    Lyrics {
        synced,
        plain,
        found: true,
    }
}

fn urlencode(s: &str) -> String {
    let mut out = String::new();
    for b in s.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => out.push(b as char),
            _ => out.push_str(&format!("%{b:02X}")),
        }
    }
    out
}
