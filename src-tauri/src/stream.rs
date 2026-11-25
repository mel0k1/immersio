use tauri::http::{Request, Response, StatusCode};

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

fn payload(uri: &tauri::http::Uri) -> Option<(String, String)> {
    let path = uri.path().trim_start_matches('/');
    let raw = b64url_decode(path)?;
    let v: serde_json::Value = serde_json::from_slice(&raw).ok()?;
    let url = v.get("url").and_then(|x| x.as_str())?.to_string();
    let mime = v
        .get("mime")
        .and_then(|x| x.as_str())
        .unwrap_or("audio/mp4")
        .to_string();
    Some((url, mime))
}

pub async fn handle(request: Request<Vec<u8>>) -> Response<Vec<u8>> {
    let Some((url, mime)) = payload(request.uri()) else {
        return bad_request("bad request");
    };
    let client = reqwest::Client::new();
    let mut r = client.get(&url).header("User-Agent", "Mozilla/5.0");
    if let Some(range) = request.headers().get("range") {
        if let Ok(v) = range.to_str() {
            r = r.header("Range", v);
        }
    }
    let resp = match r.send().await {
        Ok(resp) => resp,
        Err(_) => return bad_request("upstream error"),
    };
    let status = StatusCode::from_u16(resp.status().as_u16()).unwrap_or(StatusCode::OK);
    let mut builder = Response::builder()
        .status(status)
        .header("Content-Type", &mime)
        .header("Accept-Ranges", "bytes");
    for key in ["content-range", "content-length"] {
        if let Some(v) = resp.headers().get(key) {
            builder = builder.header(key, v.clone());
        }
    }
    match resp.bytes().await {
        Ok(bytes) => builder.body(bytes.to_vec()).unwrap_or_else(|_| bad_request("body")),
        Err(_) => bad_request("read error"),
    }
}

fn bad_request(msg: &str) -> Response<Vec<u8>> {
    Response::builder()
        .status(StatusCode::BAD_GATEWAY)
        .body(msg.as_bytes().to_vec())
        .unwrap()
}
