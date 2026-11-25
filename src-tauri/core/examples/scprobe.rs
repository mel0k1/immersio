use immersio_core::sc::Sc;

#[tokio::main]
async fn main() {
    let http = reqwest::Client::new();
    let sc = Sc::new();
    let res = match sc.search(&http, "kizaru").await {
        Ok(r) => r,
        Err(e) => {
            println!("search error: {e}");
            return;
        }
    };
    for t in res.iter().take(5) {
        println!("{} | {} | {} | {:?}", t.video_id, t.title, t.artists.join(", "), t.duration_secs);
    }
    if let Some(t) = res.first() {
        let id = t.video_id.trim_start_matches("sc:");
        match sc.stream(&http, id).await {
            Ok((info, data)) => println!(
                "stream ok: url_len={} mime={} bitrate={:?} dur_ms={:?} bytes={:?}",
                info.url.len(),
                info.mime,
                info.bitrate,
                info.duration_ms,
                data.as_ref().map(|d| d.len())
            ),
            Err(e) => println!("stream error: {e}"),
        }
    }
    if let Some(t) = res.first() {
        let id = t.video_id.trim_start_matches("sc:");
        match sc.related(&http, id).await {
            Ok(r) => println!("related: {}", r.len()),
            Err(e) => println!("related error: {e}"),
        }
    }
}
