import { useState } from "react";
import { Plus } from "lucide-react";
import { useLibrary, useUi } from "../lib/store";
import { useT } from "../lib/i18n";

export function PlaylistModals() {
  const t = useT();
  const addToPlaylist = useUi((s) => s.addToPlaylist);
  const createOpen = useUi((s) => s.createOpen);
  const openAddToPlaylist = useUi((s) => s.openAddToPlaylist);
  const setCreateOpen = useUi((s) => s.setCreateOpen);
  const showToast = useUi((s) => s.showToast);
  const playlists = useLibrary((s) => s.playlists);
  const { addToPlaylist: addTracks, createPlaylist } = useLibrary.getState();
  const [name, setName] = useState("");

  const close = () => {
    openAddToPlaylist(null);
    setCreateOpen(false);
    setName("");
  };

  if (addToPlaylist) {
    return (
      <div className="modal-back" onClick={close}>
        <div className="modal" onClick={(e) => e.stopPropagation()}>
          <div className="modal-title">{t("addToPlaylist")}</div>
          {playlists.length === 0 && <div className="state-block" style={{ padding: 20 }}>{t("emptyLibrary")}</div>}
          {playlists.map((p) => (
            <button
              key={p.id}
              className="menu-item"
              style={{ width: "100%", padding: "10px 12px" }}
              onClick={() => {
                addTracks(p.id, addToPlaylist);
                showToast(t("addToPlaylist"));
                close();
              }}
            >
              {p.name}
              <span style={{ color: "var(--text-faint)", marginLeft: "auto" }}>{p.tracks.length}</span>
            </button>
          ))}
          <button
            className="btn"
            style={{ marginTop: 10, width: "100%", justifyContent: "center" }}
            onClick={() => {
              setCreateOpen(true);
              openAddToPlaylist(null);
            }}
          >
            <Plus size={16} />
            {t("createPlaylist")}
          </button>
        </div>
      </div>
    );
  }

  if (!createOpen) return null;
  return (
    <div className="modal-back" onClick={close}>
      <div className="modal" style={{ width: 420 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-title">{t("createPlaylist")}</div>
        <input
          className="field"
          placeholder={t("playlistName")}
          value={name}
          autoFocus
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && name.trim()) {
              createPlaylist(name.trim());
              showToast(t("createPlaylist"));
              close();
            }
          }}
        />
        <div className="modal-actions">
          <button className="btn" onClick={close}>
            {t("cancel")}
          </button>
          <button
            className="btn primary"
            disabled={!name.trim()}
            onClick={() => {
              createPlaylist(name.trim());
              showToast(t("createPlaylist"));
              close();
            }}
          >
            {t("createPlaylist")}
          </button>
        </div>
      </div>
    </div>
  );
}

export function Toast() {
  const toast = useUi((s) => s.toast);
  if (!toast) return null;
  return <div className="toast">{toast}</div>;
}
