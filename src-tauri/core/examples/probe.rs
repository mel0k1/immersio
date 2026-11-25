use immersio_core::lyrics;
use immersio_core::sc::Sc;
use immersio_core::yt::Yt;

#[tokio::main]
async fn main() {
    let yt = Yt::new();
    let http = reqwest::Client::new();
    if let Some(url) = std::env::args().nth(2) {
        match immersio_core::importer::resolve(&yt, &Sc::new(), &http, &url, "ru").await {
            Ok(r) => println!(
                "import ok [{}]: {} — {} tracks (failed {}), first: {}",
                r.kind,
                r.name,
                r.tracks.len(),
                r.failed,
                r.tracks
                    .first()
                    .map(|t| format!("{} — {}", t.artists.join(", "), t.title))
                    .unwrap_or_default()
            ),
            Err(e) => println!("import err: {e}"),
        }
        return;
    }
    let q = std::env::args().nth(1).unwrap_or_else(|| "kai angel".into());
    match yt.search(&q, "ru").await {
        Ok(res) => {
            println!("shelves: {}", res.shelves.len());
            for s in &res.shelves {
                println!(
                    "  [{}] {} | tracks={} collections={}",
                    format!("{:?}", s.kind),
                    s.title,
                    s.tracks.len(),
                    s.collections.len()
                );
            }
            let first_track = res.shelves.iter().find_map(|s| s.tracks.first());
            let first_album = res.shelves.iter().find_map(|s| {
                s.collections
                    .iter()
                    .find(|c| c.kind == immersio_core::ItemKind::Album)
            });
            let first_artist = res.shelves.iter().find_map(|s| {
                s.collections
                    .iter()
                    .find(|c| c.kind == immersio_core::ItemKind::Artist)
            });
            if let (Some(t), Some(a)) = (first_track, first_album) {
                println!("track: {} — {}", t.artists.join(", "), t.title);
                println!("album: {} ({}) {} tracks", a.title, a.browse_id, a.subtitle);
                match yt.browse(&a.browse_id, "ru").await {
                    Ok(immersio_core::Browse::Album(al)) => println!("album browse ok: {} tracks, year={:?}", al.tracks.len(), al.year),
                    Ok(other) => println!("album browse wrong kind: {:?}", other),
                    Err(e) => println!("album browse err: {e}"),
                }
            }
            if let Some(ar) = first_artist {
                println!("artist: {} ({})", ar.title, ar.browse_id);
                match yt.browse(&ar.browse_id, "ru").await {
                    Ok(immersio_core::Browse::Artist(a)) => println!(
                        "artist browse ok: top={} albums={}",
                        a.top_tracks.len(),
                        a.albums.len()
                    ),
                    Ok(other) => println!("artist browse wrong kind: {:?}", other),
                    Err(e) => println!("artist browse err: {e}"),
                }
            }
            if let Some(t) = first_track {
                let http = reqwest::Client::new();
                match lyrics::fetch(&http, &t.title, &t.artists.join(", "), None, t.duration_secs, &[]).await {
                    Ok(l) => println!("lyrics: synced={} plain={} words={}", l.synced.len(), l.plain.is_some(), l.synced.iter().filter(|x| !x.words.is_empty()).count()),
                    Err(e) => println!("lyrics err: {e}"),
                }
                println!("stream: {:?}", t.video_id);
                match yt.stream(&t.video_id, "ru", "high").await {
                    Ok(s) => println!("stream ok: {} {}kbps", s.mime, s.bitrate.unwrap_or(0)),
                    Err(e) => println!("stream err: {e}"),
                }
                match yt.radio(&t.video_id, "ru").await {
                    Ok(list) => println!("radio ok: {} tracks, first: {}", list.len(), list.first().map(|x| x.title.clone()).unwrap_or_default()),
                    Err(e) => println!("radio err: {e}"),
                }
            }
        }
        Err(e) => println!("search err: {e}"),
    }
}
