use crate::{CoreError, LocalTrack, Result};
use lofty::prelude::*;
use lofty::read_from_path;
use std::path::Path;

fn ext_of(p: &str) -> Option<String> {
    Path::new(p)
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_lowercase())
}

pub fn is_audio_file(p: &str) -> bool {
    matches!(
        ext_of(p).as_deref(),
        Some("mp3") | Some("m4a") | Some("mp4") | Some("aac") | Some("flac") | Some("ogg") | Some("opus") | Some("wav") | Some("wma") | Some("alac") | Some("aiff")
    )
}

pub fn read_meta(id: &str, src_path: &str) -> Result<LocalTrack> {
    if !is_audio_file(src_path) {
        return Err(CoreError::Parse("not audio".into()));
    }
    let tagged = read_from_path(src_path).map_err(|e| CoreError::Parse(e.to_string()))?;
    let tag = tagged.primary_tag().or_else(|| tagged.first_tag());
    let props = tagged.properties();
    let dur = props.duration().as_secs() as u32;
    let file_name = Path::new(src_path)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("track")
        .to_string();
    let title = tag
        .and_then(|t| t.title().map(|s| s.to_string()))
        .filter(|s| !s.is_empty())
        .unwrap_or(file_name);
    let artist = tag
        .and_then(|t| t.artist().map(|s| s.to_string()))
        .filter(|s| !s.is_empty())
        .unwrap_or_default();
    let album = tag
        .and_then(|t| t.album().map(|s| s.to_string()))
        .filter(|s| !s.is_empty())
        .unwrap_or_default();
    let track_no = tag.and_then(|t| t.track());
    let year = tag
        .and_then(|t| t.get_string(ItemKey::Year).map(String::from))
        .and_then(|s| s.get(0..4).and_then(|y| y.parse::<u32>().ok()));
    Ok(LocalTrack {
        id: id.to_string(),
        path: src_path.to_string(),
        title,
        artist,
        album,
        duration_secs: dur,
        track_no,
        year,
        cover_path: None,
    })
}

pub fn extract_cover(src_path: &str) -> Result<Option<Vec<u8>>> {
    let tagged = read_from_path(src_path).map_err(|e| CoreError::Parse(e.to_string()))?;
    let tag = tagged.primary_tag().or_else(|| tagged.first_tag());
    Ok(tag
        .and_then(|t| t.pictures().first())
        .map(|p| p.data().to_vec()))
}

pub fn list_audio_files(dir: &str) -> Vec<String> {
    let mut out = Vec::new();
    let Ok(entries) = std::fs::read_dir(dir) else { return out };
    for e in entries.flatten() {
        let p = e.path();
        if p.is_dir() {
            out.extend(list_audio_files(p.to_string_lossy().as_ref()));
        } else {
            let s = p.to_string_lossy().to_string();
            if is_audio_file(&s) {
                out.push(s);
            }
        }
    }
    out.sort();
    out
}
