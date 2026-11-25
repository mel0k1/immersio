import { useEffect, useState } from "react";
import { HashRouter, Route, Routes, useNavigate } from "react-router-dom";
import { AlertTriangle, WifiOff, X } from "lucide-react";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import "@fontsource-variable/inter";
import "./styles/global.css";
import { Sidebar } from "./components/Sidebar";
import { DragRegion, WindowControls } from "./components/WindowControls";
import { PlayerBar } from "./components/PlayerBar";
import { QueueDrawer } from "./components/QueueDrawer";
import { Fullscreen } from "./components/Fullscreen";
import { PlaylistModals, Toast } from "./components/PlaylistModals";
import { ImportModal } from "./components/ImportModal";
import { OverlayPage } from "./components/OverlayPage";
import { HomePage } from "./pages/HomePage";
import { SearchPage } from "./pages/SearchPage";
import { LibraryPage } from "./pages/LibraryPage";
import { SettingsPage } from "./pages/SettingsPage";
import { LikedPage, MyPlaylistPage } from "./pages/LibraryPages";
import { LocalPage } from "./pages/LocalPage";
import { CollectionPage, ArtistPage } from "./pages/CollectionPages";
import { useLibrary, usePlayer, useSettings, useUi } from "./lib/store";
import { bindEngine } from "./lib/audio";
import { api } from "./lib/ipc";
import { useT } from "./lib/i18n";
import { comboOf } from "./lib/shortcuts";
import { isOverlayWindow, isTauri } from "./lib/env";

function ErrorToast() {
  const error = usePlayer((s) => s.error);
  const blocked = usePlayer((s) => s.blocked);
  const dismiss = () => usePlayer.getState().setError(null, false);
  if (!error) return null;
  return (
    <div className="toast">
      <AlertTriangle size={16} color={blocked ? "#ffb020" : "#ff6b6b"} />
      {blocked ? "YouTube" : "Immersio"}: {error}
      <button className="icon-btn" style={{ width: 26, height: 26 }} onClick={dismiss}>
        <X size={14} />
      </button>
    </div>
  );
}

function OfflineBanner() {
  const t = useT();
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
    };
  }, []);
  if (online) return null;
  return (
    <div className="offline-banner">
      <WifiOff size={15} />
      {t("offline")}
    </div>
  );
}

function Shortcuts() {
  const nav = useNavigate();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
      if (document.body.dataset.recording) return;
      const combo = comboOf(e);
      if (!combo) return;
      const binds = useSettings.getState().shortcuts;
      const p = usePlayer.getState();
      if (combo === binds.playPause) {
        e.preventDefault();
        p.toggle();
      } else if (combo === binds.nextTrack) {
        e.preventDefault();
        p.next();
      } else if (combo === binds.prevTrack) {
        e.preventDefault();
        p.prev();
      } else if (combo === binds.seekForward) {
        p.seek(Math.min(p.position + 5, p.duration));
      } else if (combo === binds.seekBackward) {
        p.seek(Math.max(p.position - 5, 0));
      } else if (combo === binds.volumeUp) {
        e.preventDefault();
        p.setVolume(Math.min(1, p.volume + 0.05));
      } else if (combo === binds.volumeDown) {
        e.preventDefault();
        p.setVolume(Math.max(0, p.volume - 0.05));
      } else if (combo === binds.toggleMute) {
        p.toggleMute();
      } else if (combo === binds.toggleFullscreen) {
        p.setFullscreen(!p.fullscreen);
      } else if (combo === binds.likeTrack) {
        const t = p.queue[p.index];
        if (t?.videoId) {
          useLibrary.getState().toggleLike({
            videoId: t.videoId,
            title: t.title,
            artists: t.artists,
            album: t.album ?? null,
            durationSecs: t.durationSecs ?? null,
            thumbs: [],
            explicit: !!t.explicit,
          });
        }
      } else if (combo === binds.toggleQueue) {
        p.setQueueOpen(!p.queueOpen);
      } else if (combo === binds.openSearch) {
        nav("/search");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [nav]);
  return null;
}

let iconImg: HTMLImageElement | null = null;

function tintIcon(accent: string) {
  if (!isTauri) return;
  const m = /^#([0-9a-f]{6})$/i.exec(accent);
  if (!m) return;
  const apply = () => {
    if (!iconImg) return;
    const c = document.createElement("canvas");
    c.width = iconImg.width;
    c.height = iconImg.height;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(iconImg, 0, 0);
    const d = ctx.getImageData(0, 0, c.width, c.height);
    const ar = parseInt(m[1].slice(0, 2), 16);
    const ag = parseInt(m[1].slice(2, 4), 16);
    const ab = parseInt(m[1].slice(4, 6), 16);
    const px = d.data;
    for (let i = 0; i < px.length; i += 4) {
      if (px[i + 3] < 12) continue;
      const l = (px[i] * 299 + px[i + 1] * 587 + px[i + 2] * 114) / 1000;
      const k = Math.min(1, Math.max(0, (255 - l) / 160));
      px[i] = px[i] * (1 - k) + ar * k;
      px[i + 1] = px[i + 1] * (1 - k) + ag * k;
      px[i + 2] = px[i + 2] * (1 - k) + ab * k;
    }
    ctx.putImageData(d, 0, 0);
    api.setIcon(Array.from(ctx.getImageData(0, 0, c.width, c.height).data), c.width, c.height).catch(() => undefined);
  };
  if (iconImg) {
    apply();
    return;
  }
  const img = new Image();
  img.onload = () => {
    iconImg = img;
    apply();
  };
  img.src = "appicon.png";
}

function HistoryPush() {
  const currentKey = usePlayer((s) => s.queue[s.index]?.key);
  const track = usePlayer((s) => s.queue[s.index]);
  useEffect(() => {
    if (track) useLibrary.getState().pushHistory(track);
  }, [currentKey]);
  return null;
}

function DropOverlay() {
  const t = useT();
  const [active, setActive] = useState(false);
  useEffect(() => {
    if (!isTauri) return;
    let unlisten: (() => void) | null = null;
    let alive = true;
    getCurrentWebview()
      .onDragDropEvent((e) => {
        if (e.payload.type === "enter") {
          setActive(true);
        } else if (e.payload.type === "over") {
          setActive(true);
        } else if (e.payload.type === "drop") {
          setActive(false);
          const paths = e.payload.paths ?? [];
          if (paths.length > 0) {
            api
              .importLocal(paths)
              .then((added) => {
                if (added.length > 0) {
                  useLibrary.getState().addLocal(added);
                  useUi.getState().showToast(`+${added.length}`);
                }
              })
              .catch(() => undefined);
          }
        } else if (e.payload.type === "leave") {
          setActive(false);
        }
      })
      .then((fn) => {
        if (!alive) fn();
        else unlisten = fn;
      });
    return () => {
      alive = false;
      unlisten?.();
    };
  }, []);
  if (!active) return null;
  return (
    <div
      style={{
        position: "fixed",
        inset: 12,
        zIndex: 100,
        background: "rgba(13,13,16,0.55)",
        backdropFilter: "blur(10px)",
        border: "2px dashed var(--accent)",
        borderRadius: 20,
        display: "grid",
        placeItems: "center",
        pointerEvents: "none",
        fontWeight: 750,
        fontSize: 18,
      }}
    >
      {t("dropTitle")}
    </div>
  );
}

function Shell() {
  const accent = useSettings((s) => s.accent);
  const theme = useSettings((s) => s.theme);
  const glass = useSettings((s) => s.glass);
  const bgTrack = usePlayer((s) => s.queue[s.index]);
  const queueOpen = usePlayer((s) => s.queueOpen);

  useEffect(() => {
    document.documentElement.style.setProperty("--accent", accent);
    tintIcon(accent);
  }, [accent]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    document.documentElement.dataset.glass = glass ? "on" : "off";
  }, [glass]);

  useEffect(() => {
    bindEngine();
  }, []);

  return (
    <>
      <div className="app-bg" key={bgTrack?.thumb ?? bgTrack?.coverPath ?? "none"}>
        {glass && (bgTrack?.thumb || bgTrack?.coverPath) && (
          <img src={bgTrack?.thumb ?? bgTrack?.coverPath ?? undefined} alt="" />
        )}
      </div>
      <div className="app-frame">
      <DragRegion />
      <WindowControls />
      <Sidebar />
      <div className="main">
        <OfflineBanner />
        <div className="content">
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/search" element={<SearchPage />} />
            <Route path="/library" element={<LibraryPage />} />
            <Route path="/liked" element={<LikedPage />} />
            <Route path="/local" element={<LocalPage />} />
            <Route path="/myplaylist/:id" element={<MyPlaylistPage />} />
            <Route path="/album/:browseId" element={<CollectionPage kind="album" />} />
            <Route path="/playlist/:browseId" element={<CollectionPage kind="playlist" />} />
            <Route path="/artist/:browseId" element={<ArtistPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Routes>
        </div>
        {queueOpen && <QueueDrawer />}
        <PlayerBar />
      </div>
      <Fullscreen />
      <PlaylistModals />
      <ImportModal />
      <Toast />
      <ErrorToast />
      <DropOverlay />
      <Shortcuts />
      <HistoryPush />
    </div>
    </>
  );
}

export default function App() {
  if (isOverlayWindow) return <OverlayPage />;
  return (
    <HashRouter>
      <Shell />
    </HashRouter>
  );
}
