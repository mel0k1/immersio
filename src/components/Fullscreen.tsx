import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Heart, Pause, Play, Repeat, Repeat1, Shuffle, SkipBack, SkipForward, Volume1, Volume2, VolumeX } from "lucide-react";
import { api } from "../lib/ipc";
import { dominantColor, imageBlobUrl } from "../lib/cover";
import { useLibrary, usePlayer, useSettings } from "../lib/store";
import { useT } from "../lib/i18n";
import { fmtTime, hexToRgb } from "../lib/format";
import { Cover } from "./Cover";
import { WindowControls } from "./WindowControls";
import { engine } from "../lib/audio";
import type { CSSProperties } from "react";
import type { LyricLine, LyricWord, Lyrics } from "../types";

const RATES = [0.75, 1, 1.25, 1.5, 2];

function fill(v: number, max: number): CSSProperties {
  const pct = max > 0 ? Math.min(100, (v / max) * 100) : 0;
  return { "--fill": `${pct}%` } as CSSProperties;
}

function interpolateWords(line: LyricLine, nextTime: number): LyricWord[] {
  const toks = line.text.split(/\s+/).filter(Boolean);
  if (!toks.length) return [];
  const end = Math.max(nextTime - 50, line.timeMs + toks.length * 120);
  const total = toks.reduce((a, w) => a + w.length, 0) || 1;
  const span = end - line.timeMs;
  let acc = line.timeMs;
  return toks.map((w) => {
    const share = (w.length / total) * span;
    const start = acc;
    acc += share;
    return { text: w, startMs: start, endMs: acc };
  });
}

function KaraokeLine({ line, nextTime, offset }: { line: LyricLine; nextTime: number; offset: number }) {
  const [, tick] = useState(0);
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      tick((x) => x + 1);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);
  const ms = engine.position() * 1000 + offset;
  const words = line.words.length > 0 ? line.words : interpolateWords(line, nextTime);
  return (
    <>
      {words.map((w, i) => {
        const pct = ms <= w.startMs ? 0 : ms >= w.endMs ? 100 : ((ms - w.startMs) / Math.max(1, w.endMs - w.startMs)) * 100;
        const filling = pct > 0 && pct < 100;
        return (
          <span key={i} className={`lyr-word${pct >= 100 ? " done" : ""}`}>
            {w.text}
            {filling && (
              <span className="lyr-fill" style={{ width: `${pct}%` }}>
                {w.text}
              </span>
            )}
          </span>
        );
      })}
    </>
  );
}

export function Fullscreen() {
  const t = useT();
  const fullscreen = usePlayer((s) => s.fullscreen);
  const track = usePlayer((s) => s.queue[s.index]);
  const playing = usePlayer((s) => s.playing);
  const position = usePlayer((s) => s.position);
  const duration = usePlayer((s) => s.duration || s.queue[s.index]?.durationSecs || 0);
  const volume = usePlayer((s) => s.volume);
  const muted = usePlayer((s) => s.muted);
  const shuffle = usePlayer((s) => s.shuffle);
  const repeat = usePlayer((s) => s.repeat);
  const liked = useLibrary((s) => (track?.videoId ? s.liked.some((x) => x.videoId === track.videoId) : false));
  const toggleLike = useLibrary((s) => s.toggleLike);
  const rate = useSettings((s) => s.rate);
  const lyricsOffsetMs = useSettings((s) => s.lyricsOffsetMs);
  const setRate = useSettings((s) => s.setRate);
  const setLyricsOffset = useSettings((s) => s.setLyricsOffset);
  const { setFullscreen, toggle, next, prev, seek, setVolume, toggleMute, toggleShuffle, cycleRepeat } = usePlayer.getState();
  const [lyrics, setLyrics] = useState<Lyrics | null>(null);
  const [lyricsFail, setLyricsFail] = useState(false);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [bg, setBg] = useState<[number, number, number] | null>(null);
  const lyricsRef = useRef<HTMLDivElement>(null);
  const dur = duration || 0;
  const VolIcon = muted || volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2;

  useEffect(() => {
    if (!fullscreen || !track) return;
    const key = track.thumb ?? track.coverPath ?? null;
    setLyrics(null);
    setLyricsFail(false);
    setBlobUrl(null);
    setBg(null);
    if (key) {
      imageBlobUrl(key).then(setBlobUrl);
      dominantColor(key).then(setBg);
    }
    if (!track.videoId) return;
    let alive = true;
    api
      .lyrics(track.title, track.artists.join(", "), track.album ?? null, track.durationSecs ?? null, track.videoId ?? null)
      .then((l) => alive && setLyrics(l))
      .catch(() => alive && setLyricsFail(true));
    return () => {
      alive = false;
    };
  }, [fullscreen, track?.key]);

  const activeLine = useMemo(() => {
    if (!lyrics?.synced.length) return -1;
    const ms = position * 1000 + lyricsOffsetMs;
    let lo = 0;
    let hi = lyrics.synced.length - 1;
    let idx = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (lyrics.synced[mid].timeMs <= ms) {
        idx = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    return idx;
  }, [lyrics, position, lyricsOffsetMs]);

  useEffect(() => {
    if (!fullscreen || activeLine < 0 || !lyricsRef.current) return;
    const el = lyricsRef.current.querySelector<HTMLElement>(`[data-line="${activeLine}"]`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [activeLine, fullscreen]);

  if (!fullscreen) return null;
  const rgb = bg ? bg.join(",") : "60,50,110";

  return (
    <div className="fullscreen">
      <div className="fs-blobs" style={{ background: `rgb(${rgb})` }}>
        <div className="fs-blob" style={{ background: `rgba(${rgb},0.85)` }} />
        <div className="fs-blob" style={{ background: `rgba(${hexToRgb("#2b2b33").join(",")},0.9)` }} />
        <div className="fs-blob" style={{ background: `rgba(${rgb},0.55)` }} />
      </div>
      <div className="fs-veil" />
      <div className="fs-top">
        <button className="icon-btn" style={{ zIndex: 4 }} onClick={() => setFullscreen(false)}>
          <ChevronDown size={22} />
        </button>
        <div style={{ display: "flex", gap: 8, alignItems: "center", zIndex: 4 }}>
          {lyrics?.synced.length ? (
            <div className="seg" style={{ background: "rgba(255,255,255,0.12)" }}>
              <button onClick={() => setLyricsOffset(lyricsOffsetMs - 200)}>−200</button>
              <button onClick={() => setLyricsOffset(0)} title={t("lyricsOffset")}>
                {lyricsOffsetMs === 0 ? t("lyricsOffset") : `${lyricsOffsetMs}ms`}
              </button>
              <button onClick={() => setLyricsOffset(lyricsOffsetMs + 200)}>+200</button>
            </div>
          ) : null}
          <button
            className="pill"
            style={{ background: "rgba(255,255,255,0.12)", color: rate !== 1 ? "var(--accent)" : undefined, fontWeight: 700 }}
            onClick={() => setRate(RATES[(RATES.indexOf(rate) + 1) % RATES.length] ?? 1)}
            title={t("speed")}
          >
            {rate}×
          </button>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", zIndex: 4 }}>
          {track?.videoId && (
            <button
              className={`icon-btn${liked ? " active" : ""}`}
              onClick={() =>
                track.videoId &&
                toggleLike({
                  videoId: track.videoId,
                  title: track.title,
                  artists: track.artists,
                  album: track.album ?? null,
                  durationSecs: track.durationSecs ?? null,
                  thumbs: [],
                  explicit: !!track.explicit,
                })
              }
              title={liked ? t("unlike") : t("like")}
            >
              <Heart size={20} fill={liked ? "currentColor" : "none"} />
            </button>
          )}
          <WindowControls />
        </div>
      </div>
      <div className="fs-left">
        <div className="fs-cover-card">
          <Cover src={blobUrl ?? track?.thumb ?? track?.coverPath ?? undefined} />
        </div>
        <div className="fs-titles">
          <div className="fs-title">{track?.title}</div>
          <div className="fs-artist">{track?.artists.join(", ")}</div>
        </div>
        <div className="fs-controls">
          <div className="fs-progress">
            <span className="pb-time">{fmtTime(position)}</span>
            <input className="slider" type="range" min={0} max={Math.max(dur, 1)} step={0.1} value={position} style={fill(position, dur)} onChange={(e) => seek(Number(e.target.value))} />
            <span className="pb-time">{fmtTime(dur)}</span>
          </div>
          <div className="fs-transport">
            <button className={`icon-btn${shuffle ? " active" : ""}`} onClick={toggleShuffle}>
              <Shuffle size={19} />
            </button>
            <button className="icon-btn" onClick={prev}>
              <SkipBack size={21} fill="currentColor" />
            </button>
            <button className="play-fab" style={{ width: 46, height: 46 }} onClick={toggle}>
              {playing ? <Pause size={21} fill="currentColor" /> : <Play size={21} fill="currentColor" style={{ marginLeft: 2 }} />}
            </button>
            <button className="icon-btn" onClick={next}>
              <SkipForward size={21} fill="currentColor" />
            </button>
            <button className={`icon-btn${repeat !== "off" ? " active" : ""}`} onClick={cycleRepeat}>
              {repeat === "one" ? <Repeat1 size={19} /> : <Repeat size={19} />}
            </button>
          </div>
          <div className="fs-volume">
            <button className="icon-btn" onClick={toggleMute}>
              <VolIcon size={18} />
            </button>
            <input className="slider" type="range" min={0} max={1} step={0.01} value={muted ? 0 : volume} style={fill(muted ? 0 : volume, 1)} onChange={(e) => setVolume(Number(e.target.value))} />
          </div>
        </div>
      </div>
      <div className="lyrics-pane">
        <div className="lyrics-scroll" ref={lyricsRef}>
          {lyrics?.synced.length ? (
            lyrics.synced.map((l, i) => (
              <div
                key={i}
                data-line={i}
                className={`lyrics-line${i === activeLine ? " active" : ""}`}
                onClick={() => seek(l.timeMs / 1000)}
              >
                {i === activeLine ? (
                  <KaraokeLine line={l} nextTime={lyrics.synced[i + 1]?.timeMs ?? l.timeMs + 4000} offset={lyricsOffsetMs} />
                ) : (
                  l.text
                )}
              </div>
            ))
          ) : lyrics?.plain ? (
            <div className="lyrics-plain">{lyrics.plain}</div>
          ) : (
            <div className="lyrics-empty">
              {lyricsFail ? t("emptySearch") : t("loading")}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
