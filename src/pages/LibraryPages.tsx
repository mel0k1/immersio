import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Download, Trash2 } from "lucide-react";
import { open } from "@tauri-apps/plugin-dialog";
import { playableOf, type TrackItem } from "../types";
import { useLibrary, usePlayer, useUi } from "../lib/store";
import { useT } from "../lib/i18n";
import { api } from "../lib/ipc";
import { fmtPlural, fmtTotal } from "../lib/format";
import { TrackRow } from "../components/TrackRow";
import { Hero, SearchFilter } from "./CollectionPages";

export function LikedPage() {
  const t = useT();
  const liked = useLibrary((s) => s.liked);
  const playContext = usePlayer((s) => s.playContext);
  const showToast = useUi((s) => s.showToast);
  const [q, setQ] = useState("");
  const [dlState, setDlState] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const f = q.toLowerCase().trim();
    if (!f) return liked;
    return liked.filter((tr) => tr.title.toLowerCase().includes(f) || tr.artists.join(" ").toLowerCase().includes(f));
  }, [liked, q]);

  const total = liked.reduce((a, b) => a + (b.durationSecs ?? 0), 0);
  const playable = filtered.map(playableOf);

  const downloadAll = async () => {
    const dir = await open({ directory: true });
    if (!dir || typeof dir !== "string" || liked.length === 0) return;
    let ok = 0;
    let failed = 0;
    for (let i = 0; i < liked.length; i++) {
      const tr = liked[i];
      setDlState(`${i + 1}/${liked.length}`);
      const ext = tr.videoId.startsWith("sc:") ? "mp3" : "m4a";
      const name = `${tr.artists[0] ?? ""} - ${tr.title}.${ext}`.replace(/[\\/:*?"<>|]/g, "_");
      try {
        await api.downloadTrack(tr.videoId, "ru", `${dir}/${name}`);
        ok++;
      } catch {
        failed++;
      }
    }
    setDlState(null);
    showToast(`${t("downloadOk")}: ${ok}` + (failed ? ` / ${t("importFailed")}: ${failed}` : ""));
  };

  return (
    <div className="page">
      <Hero
        kind={t("playlists")}
        title={t("likedSongs")}
        cover={null}
        round={false}
        meta={
          <>
            <span className="hero-chip">
              {liked.length} {fmtPlural(liked.length, ["трек", "трека", "треков"])}
            </span>
            {total > 0 && <span>{fmtTotal(total, "ru")}</span>}
          </>
        }
        onPlayAll={() => liked.length > 0 && playContext(liked.map(playableOf), 0)}
        extra={
          <button className="btn" disabled={dlState !== null} onClick={downloadAll}>
            <Download size={16} />
            {dlState ?? t("downloadAll")}
          </button>
        }
      />
      <SearchFilter value={q} onChange={setQ} />
      <div className="track-list">
        {filtered.map((tr, i) => (
          <TrackRow key={tr.videoId} raw={tr as TrackItem} track={playableOf(tr)} index={i} queue={playable} />
        ))}
      </div>
      {liked.length === 0 && <div className="state-block">{t("emptyLibrary")}</div>}
    </div>
  );
}

export function MyPlaylistPage() {
  const t = useT();
  const { id } = useParams();
  const nav = useNavigate();
  const playlist = useLibrary((s) => s.playlists.find((p) => p.id === id));
  const removeFromPlaylist = useLibrary((s) => s.removeFromPlaylist);
  const deletePlaylist = useLibrary((s) => s.deletePlaylist);
  const playContext = usePlayer((s) => s.playContext);
  const showToast = useUi((s) => s.showToast);
  const [q, setQ] = useState("");

  const tracks = playlist?.tracks ?? [];
  const filtered = useMemo(() => {
    const f = q.toLowerCase().trim();
    if (!f) return tracks;
    return tracks.filter((tr) => tr.title.toLowerCase().includes(f) || tr.artists.join(" ").toLowerCase().includes(f));
  }, [tracks, q]);
  const playable = filtered.map(playableOf);

  if (!playlist) {
    return (
      <div className="page">
        <div className="state-block">{t("emptySearch")}</div>
      </div>
    );
  }

  return (
    <div className="page">
      <Hero
        kind={t("playlists")}
        title={playlist.name}
        cover={tracks.length ? tracks[0].thumbs[tracks[0].thumbs.length - 1]?.url ?? null : null}
        meta={
          <>
            <span className="hero-chip">
              {tracks.length} {fmtPlural(tracks.length, ["трек", "трека", "треков"])}
            </span>
          </>
        }
        onPlayAll={() => tracks.length > 0 && playContext(tracks.map(playableOf), 0)}
        extra={
          <button
            className="btn"
            onClick={() => {
              deletePlaylist(playlist.id);
              showToast(t("remove"));
              nav("/library");
            }}
          >
            <Trash2 size={16} />
            {t("remove")}
          </button>
        }
      />
      <SearchFilter value={q} onChange={setQ} />
      <div className="track-list">
        {filtered.map((tr, i) => (
          <TrackRow
            key={tr.videoId}
            raw={tr}
            track={playableOf(tr)}
            index={i}
            queue={playable}
            onRemove={() => removeFromPlaylist(playlist.id, tr.videoId)}
          />
        ))}
      </div>
      {tracks.length === 0 && <div className="state-block">{t("emptyLibrary")}</div>}
    </div>
  );
}
