import { usePlayer } from "./store";
import { api, localAsset, streamUrl } from "./ipc";
import type { Playable } from "../types";

interface YTPlayer {
  playVideo(): void;
  pauseVideo(): void;
  seekTo(s: number, allow: boolean): void;
  setVolume(v: number): void;
  getCurrentTime(): number;
  getDuration(): number;
  destroy(): void;
}

interface YTNamespace {
  Player: new (el: string, opts: unknown) => YTPlayer;
  PlayerState: { ENDED: number; PLAYING: number; PAUSED: number };
}

declare global {
  interface Window {
    YT?: YTNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

function loadYTApi(cb: () => void) {
  if (window.YT?.Player) return cb();
  window.onYouTubeIframeAPIReady = cb;
  const s = document.createElement("script");
  s.src = "https://www.youtube.com/iframe_api";
  document.head.appendChild(s);
}

class Engine {
  el: HTMLAudioElement | null = null;
  mode: "none" | "audio" | "iframe" = "none";
  yt: YTPlayer | null = null;
  poll: number | null = null;
  current: Playable | null = null;
  gen = 0;
  pendingSeek: number | null = null;
  shouldPlay = false;
  pendingVolume = -1;

  private audio(): HTMLAudioElement {
    if (!this.el) {
      this.el = new Audio();
      this.el.preload = "auto";
      this.el.addEventListener("timeupdate", () => {
        if (this.mode === "audio") emitTime(this.el!.currentTime, this.el!.duration || 0);
      });
      this.el.addEventListener("loadedmetadata", () => {
        if (this.mode === "audio" && this.el!.duration) emitTime(this.el!.currentTime, this.el!.duration);
        if (this.pendingSeek != null) {
          this.el!.currentTime = this.pendingSeek;
          this.pendingSeek = null;
        }
      });
      this.el.addEventListener("ended", () => onEnded());
      this.el.addEventListener("error", () => {
        if (this.mode === "audio" && this.current?.videoId) this.fallbackIframe(this.current);
        else if (this.mode === "audio") usePlayer.getState().setError("streamError");
      });
    }
    return this.el;
  }

  position(): number {
    if (this.mode === "iframe" && this.yt) return this.yt.getCurrentTime() || 0;
    return this.el?.currentTime || 0;
  }

  async load(track: Playable | undefined) {
    if (!track) {
      this.stop();
      this.current = null;
      return;
    }
    if (this.current?.key === track.key) return;
    this.current = track;
    const gen = ++this.gen;
    this.destroyIframe();
    const st = usePlayer.getState();
    this.shouldPlay = st.playing;
    st.setLoading(true);
    st.setError(null, false);
    st.setPosition(0, track.durationSecs ?? 0);
    if (track.localPath) {
      this.mode = "audio";
      const el = this.audio();
      el.src = localAsset(track.localPath);
      el.load();
      this.applyVolume();
      if (this.shouldPlay) el.play().catch(() => undefined);
      st.setLoading(false);
      updateMediaSession(track);
      return;
    }
    if (!track.videoId) return;
    try {
      const info = await api.stream(track.videoId, "ru");
      if (gen !== this.gen) return;
      this.mode = "audio";
      const el = this.audio();
      el.src = streamUrl(info);
      el.load();
      this.applyVolume();
      if (info.durationMs) st.setPosition(0, info.durationMs / 1000);
      if (this.shouldPlay) el.play().catch(() => undefined);
      updateMediaSession(track);
    } catch (e) {
      if (gen !== this.gen) return;
      const msg = String(e);
      if (msg.startsWith("blocked")) {
        st.setError("blockedDesc", true);
      }
      this.fallbackIframe(track);
    }
  }

  private fallbackIframe(track: Playable) {
    if (!track.videoId) return;
    this.gen++;
    const gen = this.gen;
    this.mode = "iframe";
    if (this.el) {
      this.el.pause();
      this.el.removeAttribute("src");
    }
    loadYTApi(() => {
      if (gen !== this.gen || !window.YT) return;
      let host = document.getElementById("yt-frame-host");
      if (!host) {
        host = document.createElement("div");
        host.id = "yt-frame-host";
        host.style.cssText = "position:fixed;left:-9999px;top:0;width:200px;height:112px;opacity:0.01;pointer-events:none;";
        document.body.appendChild(host);
        const inner = document.createElement("div");
        inner.id = "yt-frame";
        host.appendChild(inner);
      }
      this.yt = new window.YT.Player("yt-frame", {
        videoId: track.videoId,
        width: 200,
        height: 112,
        playerVars: { controls: 0, disablekb: 1, modestbranding: 1, playsinline: 1, autoplay: 1 },
        events: {
          onReady: () => {
            if (gen !== this.gen) return;
            usePlayer.getState().setLoading(false);
            this.applyVolume();
            if (this.shouldPlay) this.yt?.playVideo();
            updateMediaSession(track);
          },
          onStateChange: (e: { data: number }) => {
            if (gen !== this.gen) return;
            const ps = window.YT!.PlayerState;
            if (e.data === ps.PLAYING) usePlayer.getState().setPlaying(true);
            if (e.data === ps.PAUSED) usePlayer.getState().setPlaying(false);
            if (e.data === ps.ENDED) onEnded();
            if (e.data === ps.PLAYING && this.pendingSeek != null) {
              this.yt?.seekTo(this.pendingSeek, true);
              this.pendingSeek = null;
            }
          },
        },
      });
      if (this.poll == null) {
        this.poll = window.setInterval(() => {
          if (this.mode === "iframe" && this.yt) {
            emitTime(this.yt.getCurrentTime() || 0, this.yt.getDuration() || 0);
          }
        }, 500);
      }
    });
  }

  private destroyIframe() {
    if (this.poll != null) {
      clearInterval(this.poll);
      this.poll = null;
    }
    if (this.yt) {
      try {
        this.yt.destroy();
      } catch {}
      this.yt = null;
    }
  }

  stop() {
    this.mode = "none";
    this.destroyIframe();
    if (this.el) {
      this.el.pause();
      this.el.removeAttribute("src");
    }
  }

  setPlaying(v: boolean) {
    this.shouldPlay = v;
    if (this.mode === "audio" && this.el) {
      if (v) this.el.play().catch(() => undefined);
      else this.el.pause();
    } else if (this.mode === "iframe" && this.yt) {
      if (v) this.yt.playVideo();
      else this.yt.pauseVideo();
    }
  }

  seek(v: number) {
    if (this.mode === "audio" && this.el) {
      if (!this.el.duration && v === 0) return;
      this.el.currentTime = v;
    } else if (this.mode === "iframe" && this.yt) {
      this.yt.seekTo(v, true);
    } else {
      this.pendingSeek = v;
    }
  }

  applyVolume() {
    const { volume, muted } = usePlayer.getState();
    const v = muted ? 0 : volume;
    if (this.mode === "audio" && this.el) this.el.volume = v;
    else if (this.mode === "iframe" && this.yt) this.yt.setVolume(Math.round(v * 100));
  }
}

function emitTime(pos: number, dur: number) {
  const st = usePlayer.getState();
  st.setPosition(pos, dur || st.duration);
}

function onEnded() {
  const st = usePlayer.getState();
  if (st.repeat === "one") {
    engine.seek(0);
    engine.setPlaying(true);
    return;
  }
  st.next();
}

function updateMediaSession(t: Playable) {
  if (!("mediaSession" in navigator)) return;
  navigator.mediaSession.metadata = new MediaMetadata({
    title: t.title,
    artist: t.artists.join(", "),
    album: t.album ?? "",
    artwork: t.thumb ? [{ src: t.thumb, sizes: "512x512" }] : [],
  });
}

export const engine = new Engine();

export function bindEngine() {
  usePlayer.subscribe((s, prev) => {
    const t = s.queue[s.index];
    const tp = prev.queue[prev.index];
    if ((t?.key ?? null) !== (tp?.key ?? null)) {
      engine.load(t);
      return;
    }
    if (s.playing !== prev.playing) engine.setPlaying(s.playing);
    if (s.volume !== prev.volume || s.muted !== prev.muted) engine.applyVolume();
    if (Math.abs(s.position - prev.position) > 1.1 && Math.abs(s.position - engine.position()) > 1.1) {
      engine.seek(s.position);
    }
  });
  if ("mediaSession" in navigator) {
    navigator.mediaSession.setActionHandler("play", () => usePlayer.getState().setPlaying(true));
    navigator.mediaSession.setActionHandler("pause", () => usePlayer.getState().setPlaying(false));
    navigator.mediaSession.setActionHandler("nexttrack", () => usePlayer.getState().next());
    navigator.mediaSession.setActionHandler("previoustrack", () => usePlayer.getState().prev());
  }
}
