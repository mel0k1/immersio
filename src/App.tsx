import { useEffect } from "react";
import { HashRouter, Route, Routes, useNavigate } from "react-router-dom";
import { AlertTriangle, X } from "lucide-react";
import "@fontsource-variable/inter";
import "./styles/global.css";
import { Sidebar } from "./components/Sidebar";
import { DragRegion, WindowControls } from "./components/WindowControls";
import { PlayerBar } from "./components/PlayerBar";
import { QueueDrawer } from "./components/QueueDrawer";
import { Fullscreen } from "./components/Fullscreen";
import { PlaylistModals, Toast } from "./components/PlaylistModals";
import { HomePage } from "./pages/HomePage";
import { SearchPage } from "./pages/SearchPage";
import { LibraryPage } from "./pages/LibraryPage";
import { SettingsPage } from "./pages/SettingsPage";
import { LikedPage, MyPlaylistPage } from "./pages/LibraryPages";
import { LocalPage } from "./pages/LocalPage";
import { CollectionPage, ArtistPage } from "./pages/CollectionPages";
import { useLibrary, usePlayer, useSettings } from "./lib/store";
import { bindEngine } from "./lib/audio";

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

function Shortcuts() {
  const nav = useNavigate();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
      const p = usePlayer.getState();
      if (e.code === "Space") {
        e.preventDefault();
        p.toggle();
      } else if (e.code === "ArrowRight" && e.shiftKey) {
        p.next();
      } else if (e.code === "ArrowLeft" && e.shiftKey) {
        p.prev();
      } else if (e.code === "ArrowRight") {
        p.seek(Math.min(p.position + 5, p.duration));
      } else if (e.code === "ArrowLeft") {
        p.seek(Math.max(p.position - 5, 0));
      } else if (e.code === "ArrowUp") {
        e.preventDefault();
        p.setVolume(Math.min(1, p.volume + 0.05));
      } else if (e.code === "ArrowDown") {
        e.preventDefault();
        p.setVolume(Math.max(0, p.volume - 0.05));
      } else if (e.code === "KeyF") {
        p.setFullscreen(!p.fullscreen);
      } else if (e.code === "KeyM") {
        p.toggleMute();
      } else if (e.code === "KeyN") {
        p.next();
      } else if (e.code === "KeyB") {
        p.prev();
      } else if (e.code === "KeyQ") {
        p.setQueueOpen(!p.queueOpen);
      } else if (e.code === "Slash" && e.ctrlKey) {
        nav("/search");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [nav]);
  return null;
}

function HistoryPush() {
  const currentKey = usePlayer((s) => s.queue[s.index]?.key);
  const track = usePlayer((s) => s.queue[s.index]);
  useEffect(() => {
    if (track) useLibrary.getState().pushHistory(track);
  }, [currentKey]);
  return null;
}

function Shell() {
  const accent = useSettings((s) => s.accent);
  const queueOpen = usePlayer((s) => s.queueOpen);

  useEffect(() => {
    document.documentElement.style.setProperty("--accent", accent);
  }, [accent]);

  useEffect(() => {
    bindEngine();
  }, []);

  return (
    <div className="app-frame">
      <DragRegion />
      <WindowControls />
      <Sidebar />
      <div className="main">
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
      <Toast />
      <ErrorToast />
      <Shortcuts />
      <HistoryPush />
    </div>
  );
}

export default function App() {
  return (
    <HashRouter>
      <Shell />
    </HashRouter>
  );
}
