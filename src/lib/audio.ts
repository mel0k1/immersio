import { usePlayer, useSettings } from "./store";
import { api, localAsset, streamUrl } from "./ipc";
import type { Playable } from "../types";
import { emit, listen } from "@tauri-apps/api/event";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";

const isTauri = "__TAURI_INTERNALS__" in window;

interface YTPlayer {
  playVideo(): void;
  pauseVideo(): void;
  seekTo(s: number, allow: boolean): void;
  setVolume(v: number): void;
  setPlaybackRate(r: number): void;
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

export const EQ_FREQS = [60, 230, 910, 3600, 14000];

class Engine {
  el: HTMLAudioElement | null = null;
  mode: "none" | "audio" | "iframe" = "none";
  yt: YTPlayer | null = null;
  poll: number | null = null;
  current: Playable | null = null;
  gen = 0;
  pendingSeek: number | null = null;
  shouldPlay = false;
  elEq: boolean = false;
  eqCtx: AudioContext | null = null;
  eqFilters: BiquadFilterNode[] | null = null;

  private teardownAudio() {
    if (this.el) {
      this.el.pause();
      this.el.removeAttribute("src");
      this.el.load();
      this.el = null;
    }
    if (this.eqCtx) {
      this.eqCtx.close().catch(() => undefined);
      this.eqCtx = null;
      this.eqFilters = null;
    }
    this.elEq = false;
  }

  private ensureAudio(needEq: boolean): HTMLAudioElement {
    if (this.el && this.elEq !== needEq) this.teardownAudio();
    if (!this.el) {
      this.el = new Audio();
      this.el.preload = "auto";
      this.elEq = needEq;
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
        if (this.mode === "audio" && this.current?.videoId && !this.current.videoId.startsWith("sc:")) this.fallbackIframe(this.current);
        else if (this.mode === "audio") usePlayer.getState().setError("streamError");
      });
      if (needEq) this.buildEqGraph(this.el);
    }
    return this.el;
  }

  private buildEqGraph(el: HTMLAudioElement) {
    try {
      const ctx = new AudioContext();
      const src = ctx.createMediaElementSource(el);
      const filters = EQ_FREQS.map((f, i) => {
        const b = ctx.createBiquadFilter();
        b.type = i === 0 ? "lowshelf" : i === EQ_FREQS.length - 1 ? "highshelf" : "peaking";
        b.frequency.value = f;
        b.Q.value = 0.9;
        b.gain.value = 0;
        return b;
      });
      let node: AudioNode = src;
      for (const f of filters) {
        node.connect(f);
        node = f;
      }
      node.connect(ctx.destination);
      this.eqCtx = ctx;
      this.eqFilters = filters;
      ctx.resume().catch(() => undefined);
    } catch {
      this.eqCtx = null;
      this.eqFilters = null;
    }
  }

  applyEqGains() {
    if (!this.eqFilters) return;
    const s = useSettings.getState();
    const gains = s.eqEnabled ? s.eqGains : [0, 0, 0, 0, 0];
    this.eqFilters.forEach((f, i) => {
      f.gain.value = gains[i] ?? 0;
    });
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
    const settings = useSettings.getState();
    this.shouldPlay = st.playing;
    st.setLoading(true);
    st.setError(null, false);
    st.setPosition(0, track.durationSecs ?? 0);
    if (track.localPath) {
      this.mode = "audio";
      const el = this.ensureAudio(false);
      el.src = localAsset(track.localPath);
      el.load();
      this.applyVolume();
      this.applyRate();
      if (this.shouldPlay) el.play().catch(() => undefined);
      st.setLoading(false);
      updateMediaSession(track);
      return;
    }
    if (!track.videoId) return;
    try {
      const info = await api.stream(track.videoId, "ru", settings.streamQuality);
      if (gen !== this.gen) return;
      this.mode = "audio";
      const el = this.ensureAudio(settings.eqEnabled);
      el.removeAttribute("crossorigin");
      el.crossOrigin = "anonymous";
      el.src = streamUrl(info, track.videoId, settings.offlineCache);
      el.load();
      this.applyVolume();
      this.applyRate();
      this.applyEqGains();
      if (info.durationMs) st.setPosition(0, info.durationMs / 1000);
      if (this.shouldPlay) el.play().catch(() => undefined);
      updateMediaSession(track);
    } catch (e) {
      if (gen !== this.gen) return;
      const msg = String(e);
      if (msg.startsWith("blocked")) {
        st.setError("blockedDesc", true);
      }
      if (track.videoId?.startsWith("sc:")) {
        st.setError("streamError");
        return;
      }
      this.fallbackIframe(track);
    }
  }

  reloadCurrent() {
    const t = this.current;
    if (!t) return;
    const pos = this.position();
    this.current = null;
    if (this.pendingSeek == null) this.pendingSeek = pos;
    this.load(t);
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
            this.applyRate();
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

  applyRate() {
    const { rate, pitchLock } = useSettings.getState();
    if (this.mode === "audio" && this.el) {
      this.el.preservesPitch = pitchLock;
      this.el.playbackRate = rate;
    } else if (this.mode === "iframe" && this.yt) {
      try {
        this.yt.setPlaybackRate(rate);
      } catch {}
    }
  }
}

function emitTime(pos: number, dur: number) {
  const st = usePlayer.getState();
  st.setPosition(pos, dur || st.duration);
}

function onEnded() {
  const st = usePlayer.getState();
  if (st.sleepEnd) {
    st.setSleep(0, false);
    st.setPlaying(false);
    return;
  }
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

export function emitOverlayState() {
  if (!isTauri) return;
  const s = usePlayer.getState();
  const t = s.queue[s.index];
  emit("imm-state", {
    hasTrack: !!t,
    title: t?.title ?? "",
    artist: t?.artists.join(", ") ?? "",
    thumb: t?.thumb ?? t?.coverPath ?? null,
    playing: s.playing,
    loading: s.loading,
    position: s.position,
    duration: s.duration || t?.durationSecs || 0,
    videoId: t?.videoId ?? null,
  }).catch(() => undefined);
}

let discordKey = "";

const DISCORD_APP_ID = "1177081335727267940";

function syncDiscord(s: ReturnType<typeof usePlayer.getState>, force = false) {
  const st = useSettings.getState();
  const t = s.queue[s.index];
  if (!st.discordOn || !t) {
    if (discordKey !== "") {
      discordKey = "";
      api.discordClear().catch(() => undefined);
    }
    return;
  }
  const id = st.discordId.trim() || DISCORD_APP_ID;
  const key = `${t.key}|${s.playing}`;
  if (!force && key === discordKey) return;
  discordKey = key;
  const dur = s.duration || t.durationSecs || 0;
  api
    .discordUpdate({
      clientId: id,
      title: t.title,
      artist: t.artists.join(", ") || "Immersio",
      cover: t.thumb ?? null,
      elapsed: Math.round(s.position),
      remaining: Math.max(0, Math.round(dur - s.position)),
    })
    .catch(() => undefined);
}

const SESSION_KEY = "imm-session";

export function bindEngine() {
  try {
    const sess = JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
    if (sess?.queue?.length) {
      const index = Math.min(sess.index, sess.queue.length - 1);
      usePlayer.setState({ queue: sess.queue, index, position: sess.savedPos || 0 });
      engine.pendingSeek = sess.savedPos || 0;
      engine.load(sess.queue[index]);
      syncDiscord(usePlayer.getState(), true);
    }
  } catch {}
  usePlayer.subscribe((s, prev) => {
    const t = s.queue[s.index];
    const tp = prev.queue[prev.index];
    if ((t?.key ?? null) !== (tp?.key ?? null)) {
      engine.load(t);
      syncDiscord(s);
      emitOverlayState();
      return;
    }
    if (s.playing !== prev.playing) {
      engine.setPlaying(s.playing);
      syncDiscord(s);
      emitOverlayState();
    }
    if (s.volume !== prev.volume || s.muted !== prev.muted) engine.applyVolume();
    if (Math.abs(s.position - prev.position) > 1.1 && Math.abs(s.position - engine.position()) > 1.1) {
      engine.seek(s.position);
    }
    if (Math.abs(s.position - prev.position) > 0.25) emitOverlayState();
  });
  useSettings.subscribe((s, prev) => {
    if (s.rate !== prev.rate || s.pitchLock !== prev.pitchLock) engine.applyRate();
    if (s.discordOn !== prev.discordOn || s.discordId !== prev.discordId) syncDiscord(usePlayer.getState(), true);
    if (s.eqEnabled !== prev.eqEnabled) engine.reloadCurrent();
    if (s.eqEnabled && s.eqGains !== prev.eqGains) engine.applyEqGains();
    if (s.offlineCache !== prev.offlineCache) {
      // cache flag is applied on next track load
    }
  });
  window.setInterval(() => {
    const st = usePlayer.getState();
    if (st.playing) syncDiscord(st, true);
  }, 15000);
  window.setInterval(() => {
    const s = usePlayer.getState();
    if (s.playing) {
      localStorage.setItem(
        SESSION_KEY,
        JSON.stringify({ queue: s.queue, index: s.index, savedPos: engine.position() }),
      );
    }
    if (s.sleepUntil && Date.now() >= s.sleepUntil) {
      s.setSleep(0, false);
      s.setPlaying(false);
    }
  }, 5000);
  if (isTauri) {
    listen("imm-request", () => emitOverlayState()).catch(() => undefined);
    listen<{ cmd: string; value?: number }>("imm-cmd", (e) => {
      const p = usePlayer.getState();
      const { cmd, value } = e.payload;
      if (cmd === "toggle") p.toggle();
      else if (cmd === "next") p.next();
      else if (cmd === "prev") p.prev();
      else if (cmd === "seek" && typeof value === "number") p.seek(value);
      else if (cmd === "close") {
        WebviewWindow.getByLabel("overlay").then((w) => w?.close()).catch(() => undefined);
      }
    }).catch(() => undefined);
  }
  if ("mediaSession" in navigator) {
    navigator.mediaSession.setActionHandler("play", () => usePlayer.getState().setPlaying(true));
    navigator.mediaSession.setActionHandler("pause", () => usePlayer.getState().setPlaying(false));
    navigator.mediaSession.setActionHandler("nexttrack", () => usePlayer.getState().next());
    navigator.mediaSession.setActionHandler("previoustrack", () => usePlayer.getState().prev());
    navigator.mediaSession.setActionHandler("seekto", (d) => {
      if (d.seekTime != null) usePlayer.getState().seek(d.seekTime);
    });
    navigator.mediaSession.setActionHandler("seekbackward", () => {
      const p = usePlayer.getState();
      p.seek(Math.max(0, p.position - 10));
    });
    navigator.mediaSession.setActionHandler("seekforward", () => {
      const p = usePlayer.getState();
      p.seek(p.position + 10);
    });
  }
}
