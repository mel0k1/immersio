import { Home, Search, LibraryBig, Settings, Heart } from "lucide-react";
import { NavLink } from "react-router-dom";
import { useT } from "../lib/i18n";
import { useLibrary } from "../lib/store";
import { bestThumb } from "../types";
import { Cover } from "./Cover";

/** Rail: nav icons, hairline divider, then liked tile + covers of user
 *  playlists and saved collections, like Liner's sidebar strip. */
export function Sidebar() {
  const t = useT();
  const playlists = useLibrary((s) => s.playlists);
  const saved = useLibrary((s) => s.saved);

  const tiles: { key: string; title: string; to: string; cover: string | null; kind: "playlist" | "album" | "liked" }[] = [
    { key: "liked", title: t("likedSongs"), to: "/liked", cover: null, kind: "liked" },
    ...playlists.slice(0, 3).map((p) => ({
      key: `p-${p.id}`,
      title: p.name,
      to: `/myplaylist/${p.id}`,
      cover: bestThumb(p.tracks.find((tr) => bestThumb(tr.thumbs))?.thumbs),
      kind: "playlist" as const,
    })),
    ...saved
      .filter((c) => c.kind !== "artist")
      .slice(0, 5)
      .map((c) => ({
        key: c.browseId,
        title: c.title,
        to: `/${c.kind}/${c.browseId}`,
        cover: bestThumb(c.thumbs),
        kind: c.kind as "playlist" | "album",
      })),
  ];

  return (
    <aside className="sidebar">
      <div className="side-logo">
        <img src="/ghost.png" alt="Immersio" />
      </div>
      <nav className="side-nav">
        <NavLink to="/" className={({ isActive }) => `side-btn${isActive ? " active" : ""}`} title={t("home")}>
          <Home size={20} />
        </NavLink>
        <NavLink to="/search" className={({ isActive }) => `side-btn${isActive ? " active" : ""}`} title={t("search")}>
          <Search size={20} />
        </NavLink>
        <NavLink to="/library" className={({ isActive }) => `side-btn${isActive ? " active" : ""}`} title={t("library")}>
          <LibraryBig size={20} />
        </NavLink>
        <NavLink to="/settings" className={({ isActive }) => `side-btn${isActive ? " active" : ""}`} title={t("settings")}>
          <Settings size={20} />
        </NavLink>
      </nav>
      <div className="side-rule" />
      <div className="side-tiles">
        {tiles.map((tile) => (
          <NavLink key={tile.key} to={tile.to} className={({ isActive }) => `side-tile${isActive ? " active" : ""}`} title={tile.title}>
            {tile.kind === "liked" ? <Heart size={20} fill="#fff" color="none" /> : <Cover src={tile.cover} kind={tile.kind} />}
          </NavLink>
        ))}
      </div>
    </aside>
  );
}
