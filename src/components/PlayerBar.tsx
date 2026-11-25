import { Heart, ListMusic, Mic2, Pause, Play, Repeat, Repeat1, Shuffle, SkipBack, SkipForward, Volume1, Volume2, VolumeX } from "lucide-react";
import { useLibrary, usePlayer } from "../lib/store";
import { useT } from "../lib/i18n";
import { fmtTime } from "../lib/format";
import { Cover } from "./Cover";
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
  const dur = duration || 0;
  const VolIcon = muted || volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2;

  return (
    <footer className="player-bar">
      <div className="pb-left">
        {track ? (
          <>
            <div onClick={() => setFullscreen(true)} style={{ cursor: "pointer", width: 48, height: 48, borderRadius: 10 }}>
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
            {loading ? <span className="spin" style={{ width: 16, height: 16, borderTopColor: "#0d0d10", borderColor: "rgba(13,13,16,.3)" }} /> : playing ? <Pause size={19} fill="currentColor" /> : <Play size={19} fill="currentColor" style={{ marginLeft: 2 }} />}
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
        <button className={`icon-btn${queueOpen ? " active-solid" : ""}`} onClick={() => setQueueOpen(!queueOpen)} title={t("queue")}>
          <ListMusic size={18} />
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
    </footer>
  );
}
