import { Clock, Heart, ListMusic, Mic2, Pause, PictureInPicture2, Play, Repeat, Repeat1, Shuffle, SkipBack, SkipForward, Volume1, Volume2, VolumeX } from "lucide-react";
import { useState } from "react";
import { useLibrary, usePlayer } from "../lib/store";
import { useT } from "../lib/i18n";
import { fmtTime } from "../lib/format";
import { Cover } from "./Cover";
import { Menu, type MenuItem } from "./Menu";
import { toggleOverlay } from "../lib/overlay";
import type { CSSProperties } from "react";

function fill(v: number, max: number): CSSProperties {
  const pct = max > 0 ? Math.min(100, (v / max) * 100) : 0;
  return { "--fill": `${pct}%` } as CSSProperties;
}

export function PlayerBar() {
  const t = useT();
  const queue = usePlayer((s) => s.queue);
  const index = usePlayer((s) => s.index);
  const track = queue[index];
  const playing = usePlayer((s) => s.playing);
  const loading = usePlayer((s) => s.loading);
  const position = usePlayer((s) => s.position);
  const duration = usePlayer((s) => s.duration || track?.durationSecs || 0);
  const volume = usePlayer((s) => s.volume);
  const muted = usePlayer((s) => s.muted);
  const shuffle = usePlayer((s) => s.shuffle);
  const repeat = usePlayer((s) => s.repeat);
  const { toggle, next, prev, seek, setVolume, toggleMute, toggleShuffle, cycleRepeat, setFullscreen, setQueueOpen, queueOpen } =
    usePlayer.getState();
  const liked = useLibrary((s) => (track?.videoId ? s.liked.some((x) => x.videoId === track.videoId) : false));
  const toggleLike = useLibrary((s) => s.toggleLike);
  const sleepUntil = usePlayer((s) => s.sleepUntil);
  const sleepEnd = usePlayer((s) => s.sleepEnd);
  const setSleep = usePlayer((s) => s.setSleep);
  const [sleepMenu, setSleepMenu] = useState<{ x: number; y: number } | null>(null);
  const sleepItems: MenuItem[] = [
    { label: t("sleepOff"), onClick: () => setSleep(0, false) },
    ...[15, 30, 60].map((m) => ({ label: `${m} min`, onClick: () => setSleep(Date.now() + m * 60000, false) })),
    { label: t("sleepEnd"), onClick: () => setSleep(0, true) },
  ];
  const sleepTitle = sleepEnd
    ? t("sleepEnd")
    : sleepUntil
      ? `${t("sleepTimer")}: ${Math.max(1, Math.ceil((sleepUntil - Date.now()) / 60000))} min`
      : t("sleepTimer");
  const dur = duration || 0;
  const VolIcon = muted || volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2;

  return (
    <footer className="player-bar">
      <div className="pb-left">
        {track ? (
          <>
            <div onClick={() => setFullscreen(true)} style={{ cursor: "pointer", width: 40, height: 40, borderRadius: 8 }}>
              <Cover src={track.thumb ?? track.coverPath ?? undefined} />
            </div>
            <div className="pb-titles" onClick={() => setFullscreen(true)}>
              <div className="pb-title">{track.title}</div>
              <div className="pb-artist">{track.artists.join(", ") || (track.localId ? t("localFiles") : "")}</div>
            </div>
            {track.videoId && (
              <button className={`icon-btn${liked ? " active" : ""}`} onClick={() => track.videoId && toggleLike({ videoId: track.videoId, title: track.title, artists: track.artists, album: track.album ?? null, durationSecs: track.durationSecs ?? null, thumbs: [], explicit: !!track.explicit })}>
                <Heart size={17} fill={liked ? "currentColor" : "none"} />
              </button>
            )}
          </>
        ) : null}
      </div>
      <div className="pb-center">
        <div className="pb-controls">
          <button className="icon-btn" onClick={prev} title="prev">
            <SkipBack size={19} fill="currentColor" />
          </button>
          <button className="play-fab" onClick={toggle} disabled={!track}>
            {loading ? <span className="spin" style={{ width: 14, height: 14, borderTopColor: "#0d0d10", borderColor: "rgba(13,13,16,.3)" }} /> : playing ? <Pause size={17} fill="currentColor" /> : <Play size={17} fill="currentColor" style={{ marginLeft: 2 }} />}
          </button>
          <button className="icon-btn" onClick={next} title="next">
            <SkipForward size={19} fill="currentColor" />
          </button>
        </div>
        <div className="pb-progress">
          <span className="pb-time">{fmtTime(position)}</span>
          <input
            className="slider"
            type="range"
            min={0}
            max={Math.max(dur, 1)}
            step={0.1}
            value={position}
            style={fill(position, dur)}
            onChange={(e) => seek(Number(e.target.value))}
          />
          <span className="pb-time">{fmtTime(dur)}</span>
        </div>
      </div>
      <div className="pb-right">
        <button className={`icon-btn${shuffle ? " active" : ""}`} onClick={toggleShuffle} title={t("shuffle")}>
          <Shuffle size={18} />
        </button>
        <button className={`icon-btn${repeat !== "off" ? " active" : ""}`} onClick={cycleRepeat} title={repeat}>
          {repeat === "one" ? <Repeat1 size={18} /> : <Repeat size={18} />}
        </button>
        <button className={`icon-btn${sleepUntil || sleepEnd ? " active" : ""}`} onClick={(e) => setSleepMenu({ x: e.clientX, y: e.clientY })} title={sleepTitle}>
          <Clock size={18} />
        </button>
        <button className={`icon-btn${queueOpen ? " active-solid" : ""}`} onClick={() => setQueueOpen(!queueOpen)} title={t("queue")}>
          <ListMusic size={18} />
        </button>
        <button className="icon-btn" onClick={() => toggleOverlay()} title={t("overlay")}>
          <PictureInPicture2 size={18} />
        </button>
        <div className="pb-vol">
          <button className="icon-btn" onClick={toggleMute}>
            <VolIcon size={18} />
          </button>
          <input className="slider" type="range" min={0} max={1} step={0.01} value={muted ? 0 : volume} style={fill(muted ? 0 : volume, 1)} onChange={(e) => setVolume(Number(e.target.value))} />
        </div>
        <button className="icon-btn" onClick={() => setFullscreen(true)} title={t("search")}>
          <Mic2 size={18} />
        </button>
      </div>
      {sleepMenu && <Menu x={sleepMenu.x} y={sleepMenu.y} items={sleepItems} onClose={() => setSleepMenu(null)} />}
    </footer>
  );
}
