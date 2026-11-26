/** Demo data for running the UI in a plain browser (no Tauri backend).
 *  Production builds never touch this: every call goes through invoke() under Tauri. */
import type { Browse, CollectionItem, SearchResults, Shelf, TrackItem } from "../types";

function tr(i: number, title: string, artists: string[], album: string | null = null): TrackItem {
  return {
    videoId: `demo${i}`,
    title,
    artists,
    album,
    durationSecs: 180 + ((i * 37) % 140),
    thumbs: [{ url: `https://picsum.photos/seed/imm${i}/240/240`, width: 240, height: 240 }],
    explicit: i % 7 === 3,
  };
}

function col(browseId: string, kind: CollectionItem["kind"], title: string, subtitle: string, seed: string): CollectionItem {
  return { browseId, kind, title, subtitle, thumbs: [{ url: `https://picsum.photos/seed/${seed}/240/240`, width: 240, height: 240 }] };
}

const TRACKS = [
  tr(1, "Midnight Signal", ["Кассетный Магнитофон"], "Ленты и Плёнки"),
  tr(2, "Ghost Frequency", ["Rinat Waves"]),
  tr(3, "Лунный Архив", ["Луна Плюс", "Север"], "Архив 2099"),
  tr(4, "Analog Hearts", ["Tape Club"]),
  tr(5, "Сигнал из Дождя", ["Апрельский Шум"]),
  tr(6, "Neon Descent", ["Vector Kid"], "Night Drive"),
  tr(7, "Полночный Трамвай", ["Кассетный Магнитофон"]),
  tr(8, "Slow Antenna", ["FM Ghosts"]),
  tr(9, "Пульс Города", ["Метро 89"]),
  tr(10, "Crystal Static", ["Rinat Waves"]),
];

const ALBUMS = [
  col("demoAlb1", "album", "Ленты и Плёнки", "Кассетный Магнитофон", "alb1"),
  col("demoAlb2", "album", "Night Drive", "Vector Kid", "alb2"),
  col("demoAlb3", "album", "Архив 2099", "Луна Плюс", "alb3"),
  col("demoAlb4", "album", "Slow Signals", "FM Ghosts", "alb4"),
];

const ARTISTS = [
  col("demoArt1", "artist", "Кассетный Магнитофон", "Артист", "art1"),
  col("demoArt2", "artist", "Rinat Waves", "Артист", "art2"),
  col("demoArt3", "artist", "Vector Kid", "Артист", "art3"),
];

const PLAYLISTS = [
  col("demoPl1", "playlist", "Полночные Дороги", "Immersio", "pl1"),
  col("demoPl2", "playlist", "Только Синтезаторы", "YouTube Music", "pl2"),
  col("demoPl3", "playlist", "Дождь и Ностальгия", "Immersio", "pl3"),
];

function shelf(kind: Shelf["kind"], title: string): Shelf {
  if (kind === "track") return { kind, title, tracks: TRACKS, collections: [] };
  if (kind === "video") return { kind, title, tracks: TRACKS.slice(0, 5), collections: [] };
  if (kind === "album") return { kind, title, tracks: [], collections: ALBUMS };
  if (kind === "artist") return { kind, title, tracks: [], collections: ARTISTS };
  return { kind, title, tracks: [], collections: PLAYLISTS };
}

export const demoSearch = (): SearchResults => ({
  shelves: [shelf("track", "Треки"), shelf("album", "Альбомы"), shelf("artist", "Артисты"), shelf("playlist", "Плейлисты"), shelf("video", "Видео")],
});

export const demoScSearch = (): TrackItem[] => [
  tr(21, "Static Bloom (SC)", ["Fern City"]),
  tr(22, "Медленный Сигнал (SC)", ["Тихий Эфир"]),
  tr(23, "Analog Rain (SC)", ["Fern City"]),
];

export const demoBrowse = (browseId: string): Browse => {
  if (browseId.startsWith("demoArt")) {
    return {
      kind: "artist",
      browseId,
      name: "Кассетный Магнитофон",
      description: "Синтвейв-дуэт из Санкт-Петербурга: аналоговые синты, плёночные барабаны и мелодии для ночных поездок.",
      thumbs: [{ url: "https://picsum.photos/seed/art1/400/400", width: 400, height: 400 }],
      topTracks: TRACKS.slice(0, 8),
      albums: ALBUMS,
    };
  }
  if (browseId.startsWith("demoPl")) {
    return {
      kind: "playlist",
      browseId,
      title: "Полночные Дороги",
      owner: "Immersio",
      thumbs: [{ url: "https://picsum.photos/seed/pl1/400/400", width: 400, height: 400 }],
      tracks: TRACKS,
    };
  }
  return {
    kind: "album",
    browseId,
    title: "Ленты и Плёнки",
    artists: ["Кассетный Магнитофон"],
    year: "2025",
    trackCount: 10,
    thumbs: [{ url: "https://picsum.photos/seed/alb1/400/400", width: 400, height: 400 }],
    tracks: TRACKS.map((t, i) => ({ ...t, album: "Ленты и Плёнки", videoId: `demoAlbT${i}` })),
  };
};
