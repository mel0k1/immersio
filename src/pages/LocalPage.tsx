import { useState } from "react";
import { FolderOpen, FileMusic } from "lucide-react";
import { open } from "@tauri-apps/plugin-dialog";
import { api } from "../lib/ipc";
import { playableLocal } from "../types";
import { useLibrary, usePlayer, useUi } from "../lib/store";
import { useT } from "../lib/i18n";
import { fmtPlural } from "../lib/format";
import { TrackRow } from "../components/TrackRow";
import { Hero, SearchFilter } from "./CollectionPages";

const AUDIO_FILTER = {
  name: "Audio",
  extensions: ["mp3", "m4a", "flac", "ogg", "opus", "wav", "aac", "wma", "aiff"],
};

export function LocalPage() {
  const t = useT();
  const localTracks = useLibrary((s) => s.localTracks);
  const addLocal = useLibrary((s) => s.addLocal);
  const removeLocalStore = useLibrary((s) => s.removeLocal);
  const playContext = usePlayer((s) => s.playContext);
  const showToast = useUi((s) => s.showToast);
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState("");

  const importFiles = async () => {
    setBusy(true);
    try {
      const picked = await open({ multiple: true, filters: [AUDIO_FILTER] });
      if (!picked) return;
      const paths = Array.isArray(picked) ? picked : [picked];
      const added = await api.importLocal(paths);
      addLocal(added);
      showToast(`${added.length} ${fmtPlural(added.length, ["файл", "файла", "файлов"])}`);
    } catch {
      showToast(t("streamError"));
    } finally {
      setBusy(false);
    }
  };

  const importFolder = async () => {
    setBusy(true);
    try {
      const dir = await open({ directory: true });
      if (!dir) return;
      const files = await api.scanLocalDir(dir);
      const added = await api.importLocal(files);
      addLocal(added);
      showToast(`${added.length} ${fmtPlural(added.length, ["файл", "файла", "файлов"])}`);
    } catch {
      showToast(t("streamError"));
    } finally {
      setBusy(false);
    }
  };

  const removeOne = async (id: string) => {
    const track = localTracks.find((tr) => tr.id === id);
    if (!track) return;
    removeLocalStore([id]);
    try {
      await api.removeLocal([track]);
    } catch {}
  };

  const filtered = localTracks.filter((tr) => {
    const f = q.toLowerCase().trim();
    if (!f) return true;
    return `${tr.title} ${tr.artist} ${tr.album}`.toLowerCase().includes(f);
  });
  const playable = filtered.map(playableLocal);

  return (
    <div className="page">
      <Hero
        kind={t("localFiles")}
        title={t("localFiles")}
        cover={localTracks[0]?.coverPath ?? null}
        meta={
          <span className="hero-chip">
            {localTracks.length} {fmtPlural(localTracks.length, ["файл", "файла", "файлов"])}
          </span>
        }
        onPlayAll={() => localTracks.length > 0 && playContext(localTracks.map(playableLocal), 0)}
        extra={
          <>
            <button className="btn" onClick={importFiles} disabled={busy}>
              <FileMusic size={16} />
              {t("importFiles")}
            </button>
            <button className="btn" onClick={importFolder} disabled={busy}>
              <FolderOpen size={16} />
              {t("importFolder")}
            </button>
          </>
        }
      />
      <SearchFilter value={q} onChange={setQ} />
      <div className="track-list">
        {filtered.map((tr, i) => (
          <TrackRow
            key={tr.id}
            track={playableLocal(tr)}
            index={i}
            queue={playable}
            onRemove={() => removeOne(tr.id)}
          />
        ))}
      </div>
      {localTracks.length === 0 && (
        <div className="state-block">
          <FolderOpen size={34} />
          {t("emptyLocal")}
        </div>
      )}
    </div>
  );
}
