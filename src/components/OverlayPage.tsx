import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { emit, listen } from "@tauri-apps/api/event";
import { Clock, Pause, Play, SkipBack, SkipForward, X } from "lucide-react";
import { Cover } from "./Cover";
import { fmtTime } from "../lib/format";

interface OverlayState {
  hasTrack: boolean;
  title: string;
  artist: string;
  thumb: string | null;
  playing: boolean;
  loading: boolean;
  position: number;
  duration: number;
  videoId: string | null;
  sleepLabel: string;
}

const initial: OverlayState = {
  hasTrack: false,
  title: "",
  artist: "",
  thumb: null,
  playing: false,
  loading: false,
  position: 0,
  duration: 0,
  videoId: null,
  sleepLabel: "",
};

export function OverlayPage() {
  const [s, setS] = useState<OverlayState>(initial);

  useEffect(() => {
    document.documentElement.style.background = "transparent";
    document.body.style.background = "transparent";
    emit("imm-request").catch(() => undefined);
    const un = listen<OverlayState>("imm-state", (e) => setS(e.payload));
    return () => {
      un.then((f) => f()).catch(() => undefined);
    };
  }, []);

  const cmd = (c: string, value?: number) => {
    emit("imm-cmd", { cmd: c, value }).catch(() => undefined);
  };

  const dur = Math.max(s.duration, 1);

  return (
    <div className="overlay-page">
      <div className="overlay-card" data-tauri-drag-region>
        <div className="overlay-cover" onClick={() => cmd("toggle")} style={{ cursor: "pointer" }}>
          <Cover src={s.thumb ?? undefined} />
        </div>
        <div className="overlay-mid" data-tauri-drag-region>
          <div className="overlay-title">{s.title || "Immersio"}</div>
          <div className="overlay-artist">{s.artist}</div>
          <div className="overlay-progress">
            <input
              className="slider"
              type="range"
              min={0}
              max={dur}
              step={0.1}
              value={Math.min(s.position, dur)}
              style={{ "--fill": `${(s.position / dur) * 100}%` } as CSSProperties}
              onChange={(e) => cmd("seek", Number(e.target.value))}
            />
            <div className="overlay-times">
              <span>{fmtTime(s.position)}</span>
              <span>{fmtTime(s.duration)}</span>
            </div>
          </div>
        </div>
        <div className="overlay-controls">
          <button className="icon-btn" style={{ width: 28, height: 28 }} title={s.sleepLabel || undefined} onClick={() => cmd("sleep")}>
            <Clock size={14} />
          </button>
          <button className="icon-btn" style={{ width: 28, height: 28 }} onClick={() => cmd("close")}>
            <X size={14} />
          </button>
          <button className="icon-btn" style={{ width: 30, height: 30 }} onClick={() => cmd("prev")}>
            <SkipBack size={15} fill="currentColor" />
          </button>
          <button
            className="icon-btn"
            style={{ width: 36, height: 36, background: "rgba(255,255,255,0.14)" }}
            onClick={() => cmd("toggle")}
          >
            {s.playing ? <Pause size={17} fill="currentColor" /> : <Play size={17} fill="currentColor" style={{ marginLeft: 2 }} />}
          </button>
          <button className="icon-btn" style={{ width: 30, height: 30 }} onClick={() => cmd("next")}>
            <SkipForward size={15} fill="currentColor" />
          </button>
        </div>
      </div>
    </div>
  );
}
