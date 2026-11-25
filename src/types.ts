export type ItemKind = "track" | "video" | "album" | "artist" | "playlist";

export interface Thumb {
  url: string;
  width: number;
  height: number;
}

export interface TrackItem {
  videoId: string;
  title: string;
  artists: string[];
  album: string | null;
  durationSecs: number | null;
  thumbs: Thumb[];
  explicit: boolean;
}

export interface CollectionItem {
  browseId: string;
  kind: ItemKind;
  title: string;
  subtitle: string;
  thumbs: Thumb[];
}

export interface Shelf {
  kind: ItemKind;
  title: string;
  tracks: TrackItem[];
  collections: CollectionItem[];
}

export interface SearchResults {
  shelves: Shelf[];
}

export interface BrowseAlbum {
  kind: "album";
  browseId: string;
  title: string;
  artists: string[];
  year: string | null;
  trackCount: number | null;
  thumbs: Thumb[];
  tracks: TrackItem[];
}

export interface BrowseArtist {
  kind: "artist";
  browseId: string;
  name: string;
  description: string | null;
  thumbs: Thumb[];
  topTracks: TrackItem[];
  albums: CollectionItem[];
}

export interface BrowsePlaylist {
  kind: "playlist";
  browseId: string;
  title: string;
  owner: string | null;
  thumbs: Thumb[];
  tracks: TrackItem[];
}

export type Browse = BrowseAlbum | BrowseArtist | BrowsePlaylist;

export interface StreamInfo {
  url: string;
  mime: string;
  bitrate: number | null;
  durationMs: number | null;
}

export interface LyricLine {
  timeMs: number;
  text: string;
}

export interface Lyrics {
  synced: LyricLine[];
  plain: string | null;
  found: boolean;
}

export interface LocalTrack {
  id: string;
  path: string;
  title: string;
  artist: string;
  album: string;
  durationSecs: number;
  trackNo: number | null;
  year: number | null;
  coverPath: string | null;
}

export interface Playable {
  key: string;
  videoId?: string;
  localPath?: string;
  title: string;
  artists: string[];
  album?: string | null;
  durationSecs?: number | null;
  thumb?: string | null;
  explicit?: boolean;
  localId?: string;
  coverPath?: string | null;
}

export interface UserPlaylist {
  id: string;
  name: string;
  createdAt: number;
  tracks: TrackItem[];
}

export interface ImportResult {
  kind: string;
  name: string;
  tracks: TrackItem[];
  failed: number;
}

export const playableOf = (t: TrackItem): Playable => ({
  key: t.videoId,
  videoId: t.videoId,
  title: t.title,
  artists: t.artists,
  album: t.album,
  durationSecs: t.durationSecs,
  thumb: bestThumb(t.thumbs),
  explicit: t.explicit,
});

export const playableLocal = (t: LocalTrack): Playable => ({
  key: `local:${t.id}`,
  localPath: t.path,
  title: t.title,
  artists: t.artist ? [t.artist] : [],
  album: t.album,
  durationSecs: t.durationSecs,
  thumb: t.coverPath ?? null,
  localId: t.id,
  coverPath: t.coverPath,
});

export function bestThumb(thumbs: Thumb[] | undefined | null): string | null {
  if (!thumbs || thumbs.length === 0) return null;
  return thumbs.reduce((a, b) => (b.width * b.height > a.width * a.height ? b : a)).url;
}
