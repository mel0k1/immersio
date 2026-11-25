import { Trash2, X, Play, Pause } from "lucide-react";
import { usePlayer } from "../lib/store";
import { useT } from "../lib/i18n";
import { fmtTime } from "../lib/format";
import { Cover } from "./Cover";

export function QueueDrawer() {
  const t = useT();
  const { queue, index } = usePlayer();
  const playing = usePlayer((s) => s.playing);
  const jumpTo = usePlayer((s) => s.jumpTo);
  const removeFromQueue = usePlayer((s) => s.removeFromQueue);
  const setQueueOpen = usePlayer((s) => s.setQueueOpen);

  return (
    <div className="queue-drawer">
      <div className="queue-head">
        <span className="queue-title">{t("queue")}</span>
        <button className="icon-btn" onClick={() => setQueueOpen(false)}>
          <X size={18} />
        </button>
      </div>
      <div className="queue-list">
        {queue.length === 0 && <div className="state-block">{t("queueEmpty")}</div>}
        {queue.map((tr, i) => (
          <div key={`${tr.key}-${i}`} className={`queue-row${i === index ? " current" : ""}`} onClick={() => jumpTo(i)}>
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
