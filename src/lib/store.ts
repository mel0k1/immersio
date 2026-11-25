import { create } from "zustand";
import { persist } from "zustand/middleware";
import { playableOf } from "../types";
import type { CollectionItem, LocalTrack, Playable, TrackItem, UserPlaylist } from "../types";
import { api } from "./ipc";
import { tKey } from "./i18n";
import type { Locale } from "./locales";

export type { Locale };

export const DEFAULT_SHORTCUTS: Record<string, string> = {
  playPause: "Space",
  nextTrack: "Shift+ArrowRight",
  prevTrack: "Shift+ArrowLeft",
  seekForward: "ArrowRight",
  seekBackward: "ArrowLeft",
  volumeUp: "ArrowUp",
  volumeDown: "ArrowDown",
  toggleMute: "KeyM",
  toggleFullscreen: "KeyF",
  likeTrack: "KeyL",
  toggleQueue: "KeyQ",
  openSearch: "Control+Slash",
};

interface SettingsState {
  lang: Locale;
  accent: string;
  theme: "dark" | "light";
  glass: boolean;
  ambient: boolean;
  streamQuality: "high" | "low";
  rate: number;
  pitchLock: boolean;
  lyricsOffsetMs: number;
  radioAuto: boolean;
  discordOn: boolean;
  discordId: string;
  offlineCache: boolean;
  cacheLimit: number;
  pauseOnDeviceChange: boolean;
  shortcuts: Record<string, string>;
  eqEnabled: boolean;
  eqGains: number[];
  setLang: (l: Locale) => void;
  setAccent: (a: string) => void;
  setTheme: (t: "dark" | "light") => void;
  setGlass: (v: boolean) => void;
  setAmbient: (v: boolean) => void;
  setStreamQuality: (q: "high" | "low") => void;
  setRate: (r: number) => void;
  setPitchLock: (v: boolean) => void;
  setLyricsOffset: (ms: number) => void;
  setRadioAuto: (v: boolean) => void;
  setDiscordOn: (v: boolean) => void;
  setDiscordId: (v: string) => void;
  setOfflineCache: (v: boolean) => void;
  setCacheLimit: (v: number) => void;
  setPauseOnDeviceChange: (v: boolean) => void;
  setShortcut: (action: string, combo: string) => void;
  resetShortcuts: () => void;
  setEqEnabled: (v: boolean) => void;
  setEqGains: (g: number[]) => void;
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      lang: "ru",
      accent: "#7c5cff",
      theme: "dark",
      glass: true,
      ambient: true,
      streamQuality: "high",
      rate: 1,
      pitchLock: true,
      lyricsOffsetMs: 0,
      radioAuto: true,
      discordOn: true,
      discordId: "",
      offlineCache: true,
      cacheLimit: 2147483648,
      pauseOnDeviceChange: true,
      shortcuts: { ...DEFAULT_SHORTCUTS },
      eqEnabled: false,
      eqGains: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      setLang: (lang) => set({ lang }),
      setAccent: (accent) => set({ accent }),
      setTheme: (theme) => set({ theme }),
      setGlass: (glass) => set({ glass }),
      setAmbient: (ambient) => set({ ambient }),
      setStreamQuality: (streamQuality) => set({ streamQuality }),
      setRate: (rate) => set({ rate }),
      setPitchLock: (pitchLock) => set({ pitchLock }),
      setLyricsOffset: (lyricsOffsetMs) => set({ lyricsOffsetMs }),
      setRadioAuto: (radioAuto) => set({ radioAuto }),
      setDiscordOn: (discordOn) => set({ discordOn }),
      setDiscordId: (discordId) => set({ discordId }),
      setOfflineCache: (offlineCache) => set({ offlineCache }),
      setCacheLimit: (cacheLimit) => set({ cacheLimit }),
      setPauseOnDeviceChange: (pauseOnDeviceChange) => set({ pauseOnDeviceChange }),
      setShortcut: (action, combo) => set((s) => ({ shortcuts: { ...s.shortcuts, [action]: combo } })),
      resetShortcuts: () => set({ shortcuts: { ...DEFAULT_SHORTCUTS } }),
      setEqEnabled: (eqEnabled) => set({ eqEnabled }),
      setEqGains: (eqGains) => set({ eqGains }),
    }),
    { name: "imm-settings" },
  ),
);

interface LibraryState {
  liked: TrackItem[];
  playlists: UserPlaylist[];
  saved: CollectionItem[];
  localTracks: LocalTrack[];
  history: Playable[];
  toggleLike: (t: TrackItem) => void;
  addLiked: (tracks: TrackItem[]) => void;
  isLiked: (videoId: string) => boolean;
  createPlaylist: (name: string) => UserPlaylist;
  deletePlaylist: (id: string) => void;
  addToPlaylist: (id: string, tracks: TrackItem[]) => void;
  removeFromPlaylist: (id: string, videoId: string) => void;
  toggleSaved: (c: CollectionItem) => void;
  isSaved: (browseId: string) => boolean;
  addLocal: (tracks: LocalTrack[]) => void;
  removeLocal: (ids: string[]) => void;
  pushHistory: (t: Playable) => void;
  clearHistory: () => void;
  clearAll: () => void;
}

export const useLibrary = create<LibraryState>()(
  persist(
    (set, get) => ({
      liked: [],
      playlists: [],
      saved: [],
      localTracks: [],
      history: [],
      toggleLike: (t) =>
        set((s) => ({
          liked: s.liked.some((x) => x.videoId === t.videoId)
            ? s.liked.filter((x) => x.videoId !== t.videoId)
            : [t, ...s.liked],
        })),
      addLiked: (tracks) =>
        set((s) => {
          const ids = new Set(s.liked.map((x) => x.videoId));
          return { liked: [...tracks.filter((t) => !ids.has(t.videoId)), ...s.liked] };
        }),
      isLiked: (videoId) => get().liked.some((x) => x.videoId === videoId),
      createPlaylist: (name) => {
        const p: UserPlaylist = { id: `${Date.now()}`, name, createdAt: Date.now(), tracks: [] };
        set((s) => ({ playlists: [p, ...s.playlists] }));
        return p;
      },
      deletePlaylist: (id) => set((s) => ({ playlists: s.playlists.filter((p) => p.id !== id) })),
      addToPlaylist: (id, tracks) =>
        set((s) => ({
          playlists: s.playlists.map((p) =>
            p.id === id
              ? { ...p, tracks: [...p.tracks, ...tracks.filter((t) => !p.tracks.some((x) => x.videoId === t.videoId))] }
              : p,
          ),
        })),
      removeFromPlaylist: (id, videoId) =>
        set((s) => ({
          playlists: s.playlists.map((p) => (p.id === id ? { ...p, tracks: p.tracks.filter((t) => t.videoId !== videoId) } : p)),
        })),
      toggleSaved: (c) =>
        set((s) => ({
          saved: s.saved.some((x) => x.browseId === c.browseId)
            ? s.saved.filter((x) => x.browseId !== c.browseId)
            : [c, ...s.saved],
        })),
      isSaved: (browseId) => get().saved.some((x) => x.browseId === browseId),
      addLocal: (tracks) =>
        set((s) => {
          const ids = new Set(s.localTracks.map((t) => t.id));
          return { localTracks: [...tracks.filter((t) => !ids.has(t.id)), ...s.localTracks] };
        }),
      removeLocal: (ids) => set((s) => ({ localTracks: s.localTracks.filter((t) => !ids.includes(t.id)) })),
      pushHistory: (t) =>
        set((s) => ({ history: [t, ...s.history.filter((x) => x.key !== t.key)].slice(0, 60) })),
      clearHistory: () => set({ history: [] }),
      clearAll: () => set({ liked: [], playlists: [], saved: [], localTracks: [], history: [] }),
    }),
    { name: "imm-library" },
  ),
);

interface UiState {
  addToPlaylist: TrackItem[] | null;
  createOpen: boolean;
  importOpen: boolean;
  toast: string | null;
  openAddToPlaylist: (t: TrackItem[] | null) => void;
  setCreateOpen: (v: boolean) => void;
  setImportOpen: (v: boolean) => void;
  showToast: (msg: string) => void;
}

export const useUi = create<UiState>()((set) => ({
  addToPlaylist: null,
  createOpen: false,
  importOpen: false,
  toast: null,
  openAddToPlaylist: (t) => set({ addToPlaylist: t }),
  setCreateOpen: (createOpen) => set({ createOpen }),
  setImportOpen: (importOpen) => set({ importOpen }),
  showToast: (msg) => {
    set({ toast: msg });
    window.setTimeout(() => set({ toast: null }), 2600);
  },
}));

export type RepeatMode = "off" | "all" | "one";

interface PlayerState {
  queue: Playable[];
  index: number;
  playing: boolean;
  loading: boolean;
  position: number;
  duration: number;
  bitrate: number;
  volume: number;
  muted: boolean;
  shuffle: boolean;
  repeat: RepeatMode;
  error: string | null;
  blocked: boolean;
  fullscreen: boolean;
  queueOpen: boolean;
  sleepUntil: number;
  sleepEnd: boolean;
  playContext: (tracks: Playable[], start: number) => void;
  toggle: () => void;
  next: () => void;
  prev: () => void;
  seek: (s: number) => void;
  setVolume: (v: number) => void;
  toggleMute: () => void;
  toggleShuffle: () => void;
  cycleRepeat: () => void;
  addToQueue: (t: Playable) => void;
  playNext: (t: Playable) => void;
  removeFromQueue: (i: number) => void;
  moveInQueue: (from: number, to: number) => void;
  jumpTo: (i: number) => void;
  clearQueue: () => void;
  startRadio: () => Promise<void>;
  setFullscreen: (v: boolean) => void;
  setQueueOpen: (v: boolean) => void;
  setPlaying: (v: boolean) => void;
  setPosition: (p: number, d: number) => void;
  setBitrate: (b: number) => void;
  setSleep: (until: number, atEnd: boolean) => void;
  setError: (e: string | null, blocked?: boolean) => void;
  setLoading: (v: boolean) => void;
}

let audioBind: ((p: PlayerState) => void) | null = null;
export const setAudioBinding = (fn: (p: PlayerState) => void) => (audioBind = fn);

export const usePlayer = create<PlayerState>()(
  persist(
    (set, get) => ({
      queue: [],
      index: 0,
      playing: false,
      loading: false,
      position: 0,
      duration: 0,
      bitrate: 0,
      volume: 0.8,
      muted: false,
      shuffle: false,
      repeat: "off",
      error: null,
      blocked: false,
      fullscreen: false,
      queueOpen: false,
      sleepUntil: 0,
      sleepEnd: false,
      playContext: (tracks, start) => {
        set({ queue: tracks, index: start, error: null, blocked: false });
        audioBind?.(get());
      },
      toggle: () => {
        set((s) => ({ playing: !s.playing }));
        audioBind?.(get());
      },
      next: async () => {
        const s = get();
        if (s.queue.length === 0) return;
        if (s.shuffle) {
          const i = s.index;
          let ni = Math.floor(Math.random() * s.queue.length);
          if (s.queue.length > 1) {
            while (ni === i) ni = Math.floor(Math.random() * s.queue.length);
          }
          set({ index: ni, position: 0 });
        } else if (s.index + 1 < s.queue.length) {
          set({ index: s.index + 1, position: 0 });
        } else if (s.repeat === "all") {
          set({ index: 0, position: 0 });
        } else {
          const cur = s.queue[s.index];
          if (useSettings.getState().radioAuto && cur?.videoId) {
            try {
              const radio = await api.radio(cur.videoId, "ru");
              const list = radio.map(playableOf);
              set({ queue: [...s.queue, ...list], index: s.index + 1, position: 0, playing: true });
              audioBind?.(get());
              return;
            } catch {
              set({ playing: false, position: 0 });
            }
          } else {
            set({ playing: false, position: 0 });
          }
        }
        audioBind?.(get());
      },
      prev: () => {
        const s = get();
        if (s.position > 3) {
          set({ position: 0 });
        } else if (s.index > 0) {
          set({ index: s.index - 1, position: 0 });
        } else {
          set({ position: 0 });
        }
        audioBind?.(get());
      },
      seek: (v) => {
        set({ position: v });
        audioBind?.(get());
      },
      setVolume: (v) => set({ volume: Math.min(1, Math.max(0, v)), muted: v === 0 }),
      toggleMute: () => set((s) => ({ muted: !s.muted })),
      toggleShuffle: () => set((s) => ({ shuffle: !s.shuffle })),
      cycleRepeat: () => set((s) => ({ repeat: s.repeat === "off" ? "all" : s.repeat === "all" ? "one" : "off" })),
      addToQueue: (t) => set((s) => ({ queue: [...s.queue, t] })),
      playNext: (t) => set((s) => ({ queue: [...s.queue.slice(0, s.index + 1), t, ...s.queue.slice(s.index + 1)] })),
      removeFromQueue: (i) =>
        set((s) => {
          const queue = s.queue.filter((_, k) => k !== i);
          let index = s.index;
          if (i < s.index) index -= 1;
          return { queue, index };
        }),
      moveInQueue: (from, to) =>
        set((s) => {
          if (to < 0 || to >= s.queue.length || from === to) return {};
          const queue = [...s.queue];
          const [item] = queue.splice(from, 1);
          queue.splice(to, 0, item);
          let index = s.index;
          if (from === s.index) index = to;
          else if (from < s.index && to >= s.index) index = s.index - 1;
          else if (from > s.index && to <= s.index) index = s.index + 1;
          return { queue, index };
        }),
      jumpTo: (i) => {
        set({ index: i, position: 0, error: null });
        audioBind?.(get());
      },
      clearQueue: () => {
        localStorage.removeItem("imm-session");
        set({ queue: [], index: 0, playing: false });
      },
      startRadio: async () => {
        const s = get();
        const cur = s.queue[s.index];
        if (!cur?.videoId) return;
        try {
          const radio = await api.radio(cur.videoId, "ru");
          const list = radio.map(playableOf).filter((t) => t.key !== cur.key);
          set({ queue: [...s.queue, ...list] });
          useUi.getState().showToast(`${tKey(useSettings.getState().lang, "radio")}: +${list.length}`);
        } catch (e) {
          useUi.getState().showToast(String(e));
        }
      },
      setFullscreen: (v) => set({ fullscreen: v }),
      setQueueOpen: (v) => set({ queueOpen: v }),
      setPlaying: (v) => set({ playing: v }),
      setPosition: (position, duration) => set({ position, duration }),
      setBitrate: (bitrate) => set({ bitrate }),
      setSleep: (sleepUntil, sleepEnd) => set({ sleepUntil, sleepEnd }),
      setError: (error, blocked = false) => set({ error, blocked }),
      setLoading: (loading) => set({ loading }),
    }),
    {
      name: "imm-player",
      partialize: (s) => ({ volume: s.volume, shuffle: s.shuffle, repeat: s.repeat }),
    },
  ),
);
