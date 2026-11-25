import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Download, Plus, Search } from "lucide-react";
import { bestThumb } from "../types";
import { useLibrary, useUi } from "../lib/store";
import { useT } from "../lib/i18n";
import { CollectionCard } from "../components/Cards";
import { fmtPlural } from "../lib/format";

const TABS = ["all", "playlists", "albums", "artists"] as const;
type Tab = (typeof TABS)[number];

export function LibraryPage() {
  const t = useT();
  const nav = useNavigate();
  const liked = useLibrary((s) => s.liked);
  const playlists = useLibrary((s) => s.playlists);
  const saved = useLibrary((s) => s.saved);
  const localCount = useLibrary((s) => s.localTracks.length);
  const setCreateOpen = useUi((s) => s.setCreateOpen);
  const setImportOpen = useUi((s) => s.setImportOpen);
  const [tab, setTab] = useState<Tab>("all");
  const [filter, setFilter] = useState("");

  const items = useMemo(() => {
    const f = filter.toLowerCase();
    const list = [
      ...playlists.map((p) => ({
        key: `p-${p.id}`,
        title: p.name,
        subtitle: `${p.tracks.length} ${fmtPlural(p.tracks.length, ["трек", "трека", "треков"])}`,
        cover: p.tracks.length ? bestThumb(p.tracks[0].thumbs) : null,
        kind: "playlist" as const,
        open: () => nav(`/myplaylist/${p.id}`),
      })),
      ...saved
        .filter((c) => (tab === "albums" ? c.kind === "album" : tab === "artists" ? c.kind === "artist" : c.kind !== "artist"))
        .map((c) => ({
          key: c.browseId,
          title: c.title,
          subtitle: c.subtitle,
          cover: bestThumb(c.thumbs),
          kind: c.kind,
          open: () => nav(`/${c.kind}/${c.browseId}`),
        })),
    ];
    return list.filter((x) => x.title.toLowerCase().includes(f));
  }, [playlists, saved, filter, tab, nav]);

  const showLiked = tab === "all" && !filter;
  const showLocal = tab === "all" && !filter;

  return (
    <div className="page">
      <h1 className="page-title">{t("library")}</h1>
      <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "16px 0 22px", flexWrap: "wrap" }}>
        <div className="pills">
          {TABS.map((tb) => (
            <button key={tb} className={`pill${tab === tb ? " active" : ""}`} onClick={() => setTab(tb)}>
              {t(tb)}
            </button>
          ))}
        </div>
        <div style={{ flex: 1 }} />
        <div className="input" style={{ width: 240 }}>
          <Search size={16} />
          <input placeholder={t("searchLibrary")} value={filter} onChange={(e) => setFilter(e.target.value)} />
        </div>
        <button className="btn" onClick={() => setImportOpen(true)}>
          <Download size={16} />
          {t("importPlaylist")}
        </button>
        <button className="btn" onClick={() => setCreateOpen(true)}>
          <Plus size={16} />
          {t("createPlaylist")}
        </button>
      </div>
      <div className="grid-cards">
        {showLiked && (
          <CollectionCard
            title={t("likedSongs")}
            subtitle={`${liked.length} ${fmtPlural(liked.length, ["трек", "трека", "треков"])}`}
            cover={null}
            kind="liked"
            onOpen={() => nav("/liked")}
          />
        )}
        {showLocal && (
          <CollectionCard
            title={t("localFiles")}
            subtitle={`${localCount} ${fmtPlural(localCount, ["файл", "файла", "файлов"])}`}
            cover={null}
            kind="local"
            onOpen={() => nav("/local")}
          />
        )}
        {items.map((it) => (
          <CollectionCard key={it.key} title={it.title} subtitle={it.subtitle} cover={it.cover} kind={it.kind} onOpen={it.open} />
        ))}
      </div>
      {items.length === 0 && showLiked && showLocal && playlists.length === 0 && saved.length === 0 && (
        <div className="state-block">{t("emptyLibrary")}</div>
      )}
    </div>
  );
}
