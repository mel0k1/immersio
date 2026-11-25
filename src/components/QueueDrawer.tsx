import { useState } from "react";
import { Trash2, X, Play, Pause, Radio, ListPlus } from "lucide-react";
import { useLibrary, usePlayer, useUi } from "../lib/store";
import { useT } from "../lib/i18n";
import { fmtTime } from "../lib/format";
import { Cover } from "./Cover";
import type { TrackItem } from "../types";

export function QueueDrawer() {
  const t = useT();
  const { queue, index } = usePlayer();
  const playing = usePlayer((s) => s.playing);
  const jumpTo = usePlayer((s) => s.jumpTo);
  const removeFromQueue = usePlayer((s) => s.removeFromQueue);
  const moveInQueue = usePlayer((s) => s.moveInQueue);
  const setQueueOpen = usePlayer((s) => s.setQueueOpen);
  const startRadio = usePlayer((s) => s.startRadio);
  const showToast = useUi((s) => s.showToast);
  const [drag, setDrag] = useState<number | null>(null);
  const [over, setOver] = useState<number | null>(null);

  const saveQueue = () => {
    const tracks: TrackItem[] = queue
      .filter((x) => x.videoId)
      .map((x) => ({
        videoId: x.videoId!,
        title: x.title,
        artists: x.artists,
        album: x.album ?? null,
        durationSecs: x.durationSecs ?? null,
        thumbs: [],
        explicit: !!x.explicit,
      }));
    if (tracks.length === 0) return;
    const p = useLibrary.getState().createPlaylist(t("queue"));
    useLibrary.getState().addToPlaylist(p.id, tracks);
    showToast(t("saveQueue"));
  };

  return (
    <div className="queue-drawer">
      <div className="queue-head">
        <span className="queue-title">{t("queue")}</span>
        <div style={{ display: "flex", gap: 4 }}>
          <button className="icon-btn" title={t("startRadio")} onClick={() => startRadio()}>
            <Radio size={17} />
          </button>
          <button className="icon-btn" title={t("saveQueue")} onClick={saveQueue}>
            <ListPlus size={17} />
          </button>
          <button className="icon-btn" onClick={() => setQueueOpen(false)}>
            <X size={18} />
          </button>
        </div>
      </div>
      <div className="queue-list">
        {queue.length === 0 && <div className="state-block">{t("queueEmpty")}</div>}
        {queue.map((tr, i) => (
          <div
            key={`${tr.key}-${i}`}
            className={`queue-row${i === index ? " current" : ""}`}
            onClick={() => jumpTo(i)}
            draggable
            onDragStart={(e) => {
              setDrag(i);
              e.dataTransfer.effectAllowed = "move";
            }}
            onDragOver={(e) => {
              e.preventDefault();
              setOver(i);
            }}
            onDragEnd={() => {
              setDrag(null);
              setOver(null);
            }}
            onDrop={(e) => {
              e.preventDefault();
              if (drag != null && drag !== i) moveInQueue(drag, i);
              setDrag(null);
              setOver(null);
            }}
            style={over === i && drag != null && drag !== i ? { outline: "1px solid var(--accent)", outlineOffset: -1 } : undefined}
          >
            <div style={{ width: 38, height: 38, borderRadius: 8, flexShrink: 0 }}>
              <Cover src={tr.thumb ?? tr.coverPath ?? undefined} />
            </div>
            <div className="queue-titles">
              <div className="tr-title" style={{ fontSize: 13 }}>{tr.title}</div>
              <div className="tr-artist">{tr.artists.join(", ")}</div>
            </div>
            <span className="tr-dur" style={{ fontSize: 12 }}>{fmtTime(tr.durationSecs)}</span>
            <button
              className="icon-btn"
              style={{ width: 30, height: 30 }}
              onClick={(e) => {
                e.stopPropagation();
                removeFromQueue(i);
              }}
            >
              <Trash2 size={15} />
            </button>
            <button
              className="icon-btn"
              style={{ width: 30, height: 30 }}
              onClick={(e) => {
                e.stopPropagation();
                if (i === index) usePlayer.getState().toggle();
                else jumpTo(i);
              }}
            >
              {i === index && playing ? <Pause size={15} /> : <Play size={15} />}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
