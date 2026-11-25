import { Home, Search, LibraryBig, Settings, Heart } from "lucide-react";
import { NavLink } from "react-router-dom";
import { useT } from "../lib/i18n";

export function Sidebar() {
  const t = useT();
  return (
    <aside className="sidebar">
      <div className="side-logo">
        <img src="/ghost.png" alt="Immersio" />
      </div>
      <NavLink to="/" className={({ isActive }) => `side-btn${isActive ? " active" : ""}`} title={t("home")}>
        <Home size={21} />
      </NavLink>
      <NavLink to="/search" className={({ isActive }) => `side-btn${isActive ? " active" : ""}`} title={t("search")}>
        <Search size={21} />
      </NavLink>
      <NavLink to="/library" className={({ isActive }) => `side-btn${isActive ? " active" : ""}`} title={t("library")}>
        <LibraryBig size={21} />
      </NavLink>
      <NavLink to="/liked" className={({ isActive }) => `side-btn${isActive ? " active" : ""}`} title={t("liked")}>
        <Heart size={21} />
      </NavLink>
      <div className="side-spacer" />
      <NavLink to="/settings" className={({ isActive }) => `side-btn${isActive ? " active" : ""}`} title={t("settings")}>
        <Settings size={21} />
      </NavLink>
    </aside>
  );
}
