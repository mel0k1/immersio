import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import type { Browse, ImportResult, Lyrics, LocalTrack, SearchResults, StreamInfo, TrackItem } from "../types";
import { demoBrowse, demoScSearch, demoSearch } from "./demo";
import { isTauri } from "./env";

/** In a plain browser (vite dev / qa) there is no backend — serve demo data so pages render. */
const wrap = <A extends unknown[], R>(fn: (...a: A) => Promise<R>, demo: (...a: A) => R): ((...a: A) => Promise<R>) =>
  isTauri
    ? fn
    : (...args: A) =>
        new Promise<R>((resolve) => setTimeout(() => resolve(demo(...args)), 150));

export const api = {
  search: wrap(
    (query: string, hl: string) => invoke<SearchResults>("yt_search", { query, hl }),
    (_q: string, _hl: string) => demoSearch(),
  ),
  searchSoundcloud: wrap(
    (query: string) => invoke<TrackItem[]>("sc_search", { query }),
    (_q: string) => demoScSearch(),
  ),
  browse: wrap(
    (browseId: string, hl: string) => invoke<Browse>("yt_browse", { browseId, hl }),
    (browseId: string) => demoBrowse(browseId),
  ),
  stream: (videoId: string, hl: string, quality: string) =>
    invoke<StreamInfo>("yt_stream", { videoId, hl, quality }),
  radio: (videoId: string, hl: string) =>
    invoke<TrackItem[]>("yt_radio", { videoId, hl }),
  importPlaylist: (url: string, hl: string) =>
    invoke<ImportResult>("import_playlist", { url, hl }),
  lyrics: (track: string, artist: string, album: string | null, duration: number | null, videoId: string | null) =>
    invoke<Lyrics>("lyrics_fetch", { track, artist, album, duration, videoId }),
  fetchImage: (url: string) => invoke<number[]>("fetch_image", { url }),
  importLocal: (paths: string[]) => invoke<LocalTrack[]>("import_local", { paths }),
  scanLocalDir: (dir: string) => invoke<string[]>("scan_local_dir", { dir }),
  removeLocal: (tracks: LocalTrack[]) => invoke<void>("remove_local", { tracks }),
  setYtCookies: (cookies: string | null) => invoke<void>("yt_set_cookies", { cookies }),
  setPot: (token: string | null) => invoke<void>("yt_set_pot", { token }),
  potProvider: (url: string | null) => invoke<void>("pot_provider_fetch", { url }),
  importLiked: () => invoke<TrackItem[]>("yt_import_liked", { hl: "ru" }),
  cacheStats: () => invoke<[number, number]>("cache_stats"),
  cacheClear: () => invoke<void>("cache_clear"),
  downloadTrack: (videoId: string, hl: string, path: string) =>
    invoke<void>("download_track", { videoId, hl, path }),
  version: () => invoke<string>("app_version"),
  discordUpdate: (p: { clientId: string; title: string; artist: string; cover: string | null; elapsed: number; remaining: number }) =>
    invoke<void>("discord_update", p),
  discordClear: () => invoke<void>("discord_clear"),
  mprisUpdate: (p: { title: string; artist: string; art: string; lenUs: number; posUs: number; playing: boolean }) =>
    invoke<void>("mpris_update", p),
  setCacheLimit: (limit: number) => invoke<void>("set_cache_limit", { limit }),
  setIcon: (rgba: number[], w: number, h: number) => invoke<void>("set_window_icon", { rgba, w, h }),
};

const isWindows = navigator.userAgent.includes("Windows");

export function localAsset(path: string): string {
  return convertFileSrc(path);
}

export function streamUrl(info: StreamInfo, videoId: string, cache: boolean): string {
  const payload = JSON.stringify({ url: info.url, mime: info.mime, videoId, cache });
  const bytes = new TextEncoder().encode(payload);
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  const b64 = btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return isWindows ? `https://stream.localhost/${b64}` : `stream://localhost/${b64}`;
}
