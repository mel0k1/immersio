import { useState } from "react";
import { Download, Heart, Link2, ListPlus, ListStart, MoreVertical, Play, Radio, Trash2, User, Disc3, Pause } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { save } from "@tauri-apps/plugin-dialog";
import type { Playable, TrackItem } from "../types";
import { playableOf } from "../types";
import { useLibrary, usePlayer, useUi } from "../lib/store";
import { api } from "../lib/ipc";
import { useT } from "../lib/i18n";
import { fmtTime } from "../lib/format";
import { Menu, type MenuItem } from "./Menu";
import { Cover } from "./Cover";

interface Props {
  raw?: TrackItem;
  track: Playable;
  index?: number;
  queue?: Playable[];
  onRemove?: () => void;
  showAlbumLink?: boolean;
}

export function TrackRow({ raw, track, index, queue, onRemove, showAlbumLink = true }: Props) {
  const t = useT();
  const nav = useNavigate();
  const liked = useLibrary((s) => s.liked.some((x) => x.videoId === track.videoId));
  const toggleLike = useLibrary((s) => s.toggleLike);
  const addToPlaylist = useUi((s) => s.openAddToPlaylist);
  const showToast = useUi((s) => s.showToast);
  const currentKey = usePlayer((s) => (s.queue[s.index]?.key ?? null));
  const playing = usePlayer((s) => s.playing);
  const playContext = usePlayer((s) => s.playContext);
  const addToQueue = usePlayer((s) => s.addToQueue);
  const playNext = usePlayer((s) => s.playNext);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const isCurrent = currentKey === track.key;
  const isPlaying = isCurrent && playing;

  const play = () => {
    const list = queue ?? [track];
    const i = index ?? 0;
    playContext(list, list.findIndex((x) => x.key === track.key) === -1 ? i : list.findIndex((x) => x.key === track.key));
  };

  const items: MenuItem[] = [];
  if (raw) {
    items.push({
      icon: Heart,
      label: liked ? t("unlike") : t("like"),
      onClick: () => toggleLike(raw),
    });
    items.push({ icon: ListPlus, label: t("addToPlaylist"), onClick: () => addToPlaylist([raw]) });
    items.push({ icon: ListStart, label: t("playNext"), onClick: () => playNext(track) });
    items.push({ icon: Play, label: t("addToQueue"), onClick: () => addToQueue(track) });
    items.push({
      icon: Radio,
      label: t("startRadio"),
      onClick: async () => {
        try {
          const radio = await api.radio(raw.videoId, "ru");
          playContext([track, ...radio.map(playableOf)], 0);
        } catch (e) {
          showToast(String(e));
        }
      },
    });
    items.push({
      icon: Link2,
      label: t("copyLink"),
      onClick: () => {
        const link = raw.videoId.startsWith("sc:") ? raw.url : `https://music.youtube.com/watch?v=${raw.videoId}`;
        if (!link) return;
        navigator.clipboard.writeText(link).then(() => showToast(t("linkCopied")));
      },
    });
    items.push({
      icon: Download,
      label: t("download"),
      onClick: async () => {
        const ext = raw.videoId.startsWith("sc:") ? "mp3" : "m4a";
        try {
          const path = await save({
            defaultPath: `${raw.artists[0] ?? ""} - ${raw.title}.${ext}`.replace(/[\\/:*?"<>|]/g, "_"),
            filters: [{ name: "Audio", extensions: [ext, "webm"] }],
          });
          if (!path) return;
          showToast(t("downloading"));
          await api.downloadTrack(raw.videoId, "ru", path);
          showToast(t("downloadOk"));
        } catch (e) {
          showToast(String(e));
        }
      },
    });
    items.push({ label: "-" });
    if (raw.artists[0]) {
      const artistName = raw.artists[0];
      items.push({ icon: User, label: t("goToArtist"), onClick: () => nav(`/search?q=${encodeURIComponent(artistName)}`) });
    }
    if (raw.album && showAlbumLink) {
      const albumName = raw.album;
      items.push({ icon: Disc3, label: t("goToAlbum"), onClick: () => nav(`/search?q=${encodeURIComponent(albumName)}`) });
    }
  }
  if (onRemove) {
    items.push({ label: "-" });
    items.push({ icon: Trash2, label: t("remove"), danger: true, onClick: onRemove });
  }

  return (
    <div className={`track-row${isCurrent ? " playing" : ""}`} onContextMenu={(e) => (items.length ? (e.preventDefault(), setMenu({ x: e.clientX, y: e.clientY })) : undefined)}>
      <div className="tr-idx">
        {isPlaying ? (
          <span className="eq">
            <span />
            <span />
            <span />
          </span>
        ) : (
          (index ?? 0) + 1
        )}
      </div>
      <div className="tr-main" onDoubleClick={play}>
        <div className="tr-thumb-wrap">
          <Cover src={track.thumb ?? track.coverPath ?? undefined} />
        </div>
        <div className="tr-titles">
          <div className="tr-title">
            <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{track.title}</span>
            {track.explicit && <span className="explicit-badge">E</span>}
            {track.localId && <span className="card-badge" style={{ position: "static" }}>{t("localBadge")}</span>}
          </div>
          <div className="tr-artist">
            {track.artists.length > 0 ? (
              track.artists.map((a, i) => (
                <span key={`${a}-${i}`}>
                  {i > 0 && ", "}
                  <span
                    onClick={(e) => {
                      e.stopPropagation();
                      if (raw) nav(`/search?q=${encodeURIComponent(a)}`);
                    }}
                  >
                    {a}
                  </span>
                </span>
              ))
            ) : (
              <span>&nbsp;</span>
            )}
            {track.album && <span style={{ color: "var(--text-faint)" }}> · {track.album}</span>}
          </div>
        </div>
      </div>
      <div className="tr-acts">
        {raw && (
          <button
            className={`icon-btn${liked ? " active" : ""}`}
            onClick={() => toggleLike(raw)}
            title={liked ? t("unlike") : t("like")}
          >
            <Heart size={17} fill={liked ? "currentColor" : "none"} />
          </button>
        )}
        <button
          className="icon-btn"
          onClick={play}
          title={isPlaying ? t("nowPlaying") : ""}
          style={{ opacity: isPlaying ? 1 : undefined }}
        >
          {isPlaying ? <Pause size={17} /> : <Play size={17} />}
        </button>
        {items.length > 0 && (
          <button className="icon-btn" onClick={(e) => setMenu({ x: e.clientX, y: e.clientY })}>
            <MoreVertical size={17} />
          </button>
        )}
      </div>
      <div className="tr-dur">{fmtTime(track.durationSecs)}</div>
      {menu && <Menu x={menu.x} y={menu.y} items={items} onClose={() => setMenu(null)} />}
    </div>
  );
}
