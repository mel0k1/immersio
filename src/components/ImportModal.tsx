import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { useLibrary, useSettings, useUi } from "../lib/store";
import { useT } from "../lib/i18n";
import { api } from "../lib/ipc";

export function ImportModal() {
  const t = useT();
  const importOpen = useUi((s) => s.importOpen);
  const setImportOpen = useUi((s) => s.setImportOpen);
  const showToast = useUi((s) => s.showToast);
  const lang = useSettings((s) => s.lang);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);

  if (!importOpen) return null;
  const close = () => {
    if (!busy) {
      setImportOpen(false);
      setUrl("");
    }
  };

  const run = async () => {
    if (!url.trim() || busy) return;
    setBusy(true);
    try {
      const res = await api.importPlaylist(url.trim(), lang);
      const p = useLibrary.getState().createPlaylist(res.name || "Import");
      useLibrary.getState().addToPlaylist(p.id, res.tracks);
      showToast(`${t("importDone")}: +${res.tracks.length}${res.failed > 0 ? ` (-${res.failed})` : ""}`);
      setImportOpen(false);
      setUrl("");
    } catch (e) {
      showToast(`${t("importFailed")}: ${String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-back" onClick={close}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-title">{t("importPlaylist")}</div>
        <div className="settings-desc" style={{ marginBottom: 12 }}>
          {t("importPlaylistDesc")}
        </div>
        <div className="input" style={{ width: "100%" }}>
          <input
            autoFocus
            placeholder={t("importUrl")}
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") run();
            }}
          />
        </div>
        <button className="btn accent" style={{ marginTop: 12, width: "100%", justifyContent: "center" }} onClick={run} disabled={busy}>
          {busy ? <Loader2 size={16} className="spin" /> : <Download size={16} />}
          {busy ? t("importing") : t("importStart")}
        </button>
      </div>
    </div>
  );
}
