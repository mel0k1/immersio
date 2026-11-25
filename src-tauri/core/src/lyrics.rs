use crate::{CoreError, LyricLine, LyricWord, Lyrics, Result};
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
            out.push(LyricLine { time_ms: ms, text, words: Vec::new() });
        }
    }
    out.sort_by_key(|l| l.time_ms);
    out
}

/// Word-level karaoke timing from YouTube timedtext (json3). Returns None if no
/// caption track provides per-word offsets; caller then falls back to LRCLIB.
async fn word_lines(client: &reqwest::Client, urls: &[String]) -> Option<Vec<LyricLine>> {
    for url in urls {
        let Ok(resp) = client.get(format!("{url}&fmt=json3")).send().await else {
            continue;
        };
        let Ok(v) = resp.json::<Value>().await else {
            continue;
        };
        let Some(events) = v.get("events").and_then(|x| x.as_array()) else {
            continue;
        };
        let mut lines: Vec<LyricLine> = Vec::new();
        let mut line_durs: Vec<u32> = Vec::new();
        let mut word_timed = 0u32;
        let mut with_text = 0u32;
        for e in events {
            let start = e.get("tStartMs").and_then(|x| x.as_u64()).unwrap_or(0) as u32;
            let dur = e.get("dDurationMs").and_then(|x| x.as_u64()).unwrap_or(0) as u32;
            let append = e.get("aAppend").and_then(|x| x.as_u64()).unwrap_or(0) > 0;
            let segs: Vec<(String, u32)> = e
                .get("segs")
                .and_then(|x| x.as_array())
                .map(|arr| {
                    arr.iter()
                        .filter_map(|s| {
                            let text = s.get("utf8")?.as_str()?.to_string();
                            let off = s.get("tOffsetMs").and_then(|x| x.as_u64()).unwrap_or(0) as u32;
                            Some((text, off))
                        })
                        .collect()
                })
                .unwrap_or_default();
            let has_text = segs.iter().any(|(t, _)| !t.trim().is_empty());
            if has_text {
                with_text += 1;
            }
            if segs.iter().any(|(t, o)| *o > 0 && !t.trim().is_empty()) {
                word_timed += 1;
            }
            let mut words: Vec<LyricWord> = Vec::new();
            let mut text = String::new();
            for (t, off) in segs {
                if t.trim().is_empty() {
                    continue;
                }
                words.push(LyricWord { text: t.trim().to_string(), start_ms: start + off, end_ms: 0 });
                if !text.is_empty() {
                    text.push(' ');
                }
                text.push_str(t.trim());
            }
            if words.is_empty() {
                continue;
            }
            if append {
                if let Some(prev) = lines.last_mut() {
                    prev.words.extend(words);
                    if !prev.text.is_empty() {
                        prev.text.push(' ');
                    }
                    prev.text.push_str(&text);
                }
                if let Some(d) = line_durs.last_mut() {
                    *d += dur;
                }
                continue;
            }
            lines.push(LyricLine { time_ms: start, text, words });
            line_durs.push(dur);
            if lines.len() >= 400 {
                break;
            }
        }
        if lines.len() > 5 && word_timed * 3 > with_text * 2 {
            for i in 0..lines.len() {
                let line_end = line_durs.get(i).copied().unwrap_or(5000).max(1500);
                let next_start = lines
                    .get(i + 1)
                    .map(|l| l.time_ms)
                    .unwrap_or(lines[i].time_ms + 5000)
                    .min(lines[i].time_ms + line_end);
                let ws = &mut lines[i].words;
                let mut ends: Vec<u32> = ws[1..].iter().map(|w| w.start_ms).collect();
                ends.push(next_start);
                for (j, w) in ws.iter_mut().enumerate() {
                    w.end_ms = ends
                        .get(j)
                        .copied()
                        .unwrap_or(w.start_ms + 400)
                        .max(w.start_ms + 1);
                }
            }
            return Some(lines);
        }
    }
    None
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
    caption_urls: &[String],
) -> Result<Lyrics> {
    if !caption_urls.is_empty() {
        if let Some(lines) = word_lines(client, caption_urls).await {
            return Ok(Lyrics { synced: lines, plain: None, found: true });
        }
    }
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
