import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import type { Browse, Lyrics, LocalTrack, SearchResults, StreamInfo, TrackItem } from "../types";

export const api = {
  search: (query: string, hl: string) =>
    invoke<SearchResults>("yt_search", { query, hl }),
  browse: (browseId: string, hl: string) =>
    invoke<Browse>("yt_browse", { browseId, hl }),
  stream: (videoId: string, hl: string, quality: string) =>
    invoke<StreamInfo>("yt_stream", { videoId, hl, quality }),
  radio: (videoId: string, hl: string) =>
    invoke<TrackItem[]>("yt_radio", { videoId, hl }),
  lyrics: (track: string, artist: string, album: string | null, duration: number | null) =>
    invoke<Lyrics>("lyrics_fetch", { track, artist, album, duration }),
  fetchImage: (url: string) => invoke<number[]>("fetch_image", { url }),
  importLocal: (paths: string[]) => invoke<LocalTrack[]>("import_local", { paths }),
  scanLocalDir: (dir: string) => invoke<string[]>("scan_local_dir", { dir }),
  removeLocal: (tracks: LocalTrack[]) => invoke<void>("remove_local", { tracks }),
  version: () => invoke<string>("app_version"),
  discordUpdate: (p: { clientId: string; title: string; artist: string; cover: string | null; elapsed: number; remaining: number }) =>
    invoke<void>("discord_update", p),
  discordClear: () => invoke<void>("discord_clear"),
};

const isWindows = navigator.userAgent.includes("Windows");

export function localAsset(path: string): string {
  return convertFileSrc(path);
}

export function streamUrl(info: StreamInfo): string {
  const payload = JSON.stringify({ url: info.url, mime: info.mime });
  const bytes = new TextEncoder().encode(payload);
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  const b64 = btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return isWindows ? `https://stream.localhost/${b64}` : `stream://localhost/${b64}`;
}
