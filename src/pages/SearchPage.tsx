import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Search as SearchIcon } from "lucide-react";
import { api } from "../lib/ipc";
import { bestThumb, playableOf, type CollectionItem, type SearchResults, type TrackItem } from "../types";
import { useT } from "../lib/i18n";
import { TrackRow } from "../components/TrackRow";
import { CollectionCard } from "../components/Cards";

const TABS = ["all", "track", "video", "album", "artist", "playlist", "soundcloud"] as const;
type Tab = (typeof TABS)[number];

const HISTORY_KEY = "imm-search-history";

function loadHistory(): string[] {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
  } catch {
    return [];
  }
}

function normText(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[(\[{].*?[)\]}]/g, " ")
    .replace(/[^a-zа-яё0-9]+/gi, " ")
    .split(" ")
    .filter(Boolean);
}

function sim(a: string, b: string): number {
  const A = new Set(normText(a));
  const B = new Set(normText(b));
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  return inter / Math.max(A.size, B.size);
}

function isSameTrack(yt: TrackItem, sc: TrackItem): boolean {
  if (sim(yt.title, sc.title) < 0.6) return false;
  if (yt.artists.some((a) => sc.artists.some((b) => sim(a, b) >= 0.5))) return true;
  return sim(yt.artists.join(" "), sc.artists.join(" ")) >= 0.5;
}

function mergeTracks(yt: TrackItem[], sc: TrackItem[]): TrackItem[] {
  const fresh: TrackItem[] = [];
  const seen = new Set<string>();
  for (const t of sc) {
    if (seen.has(t.videoId)) continue;
    if (yt.some((y) => isSameTrack(y, t))) continue;
    seen.add(t.videoId);
    fresh.push(t);
  }
  const out: TrackItem[] = [];
  let k = 0;
  yt.forEach((t, i) => {
    out.push(t);
    if ((i + 1) % 2 === 0 && k < fresh.length) out.push(fresh[k++]);
  });
  while (k < fresh.length) out.push(fresh[k++]);
  return out;
}

export function SearchPage() {
  const t = useT();
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const urlQ = params.get("q") || "";
  const [input, setInput] = useState(urlQ);
  const [res, setRes] = useState<SearchResults | null>(null);
  const [sc, setSc] = useState<TrackItem[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<Tab>("all");
  const [history, setHistory] = useState<string[]>(loadHistory());
  const inputRef = useRef<HTMLInputElement>(null);

  const run = (q: string) => {
    if (!q.trim()) return;
    setParams({ q });
    setInput(q);
    setLoading(true);
    setRes(null);
    setSc(null);
    setTab("all");
    const next = [q, ...history.filter((h) => h !== q)].slice(0, 8);
    setHistory(next);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
    api
      .search(q, "ru")
      .then(setRes)
      .catch(() => setRes({ shelves: [] }))
      .finally(() => setLoading(false));
    api
      .searchSoundcloud(q)
      .then(setSc)
      .catch(() => setSc([]));
  };

  useEffect(() => {
    if (urlQ && urlQ !== input) run(urlQ);
    if (!urlQ) {
      setRes(null);
      setLoading(false);
    }
    inputRef.current?.focus();
  }, [urlQ]);

  const shelves = res?.shelves ?? [];
  const kindsAvailable = new Set<string>(shelves.map((s) => s.kind));
  const scTracks = sc ?? [];
  const tracksOf = (kind: "track" | "video"): TrackItem[] => {
    const s = shelves.filter((x) => x.kind === kind);
    return s.flatMap((x) => x.tracks);
  };
  const collectionsOf = (kind: "album" | "artist" | "playlist"): CollectionItem[] => {
    const out: CollectionItem[] = [];
    const seen = new Set<string>();
    for (const s of shelves.filter((x) => x.kind === kind)) {
      for (const c of s.collections) {
        if (!seen.has(c.browseId)) {
          seen.add(c.browseId);
          out.push(c);
        }
      }
    }
    return out;
  };
  const queueOf = (kind: "track" | "video") => tracksOf(kind).map(playableOf);
  const merged = mergeTracks(tracksOf("track"), scTracks);
  const mergedQueue = merged.map(playableOf);

  return (
    <div className="page">
      <div className="input" style={{ maxWidth: 560 }}>
        <SearchIcon size={18} />
        <input
          ref={inputRef}
          placeholder={t("searchPlaceholder")}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && run(input)}
        />
      </div>
      {history.length > 0 && !urlQ && (
        <div style={{ marginTop: 22 }}>
          <div className="section-title" style={{ marginBottom: 10 }}>{t("search")}</div>
          {history.map((h) => (
            <button
              key={h}
              className="menu-item"
              style={{ color: "var(--text-dim)", padding: "8px 4px" }}
              onClick={() => run(h)}
            >
              {h}
            </button>
          ))}
        </div>
      )}
      {urlQ && (
        <>
          <div className="pills" style={{ margin: "22px 0 18px" }}>
            {TABS.filter((tb) => tb === "all" || kindsAvailable.has(tb) || (tb === "soundcloud" && scTracks.length > 0)).map((tb) => (
              <button key={tb} className={`pill${tab === tb ? " active" : ""}`} onClick={() => setTab(tb)}>
                {tb === "all" ? t("resultsAll") : tb === "soundcloud" ? t("soundcloud") : t(tb === "track" ? "tracks" : tb === "artist" ? "artists" : (tb as string))}
              </button>
            ))}
          </div>
          {loading && <div className="state-block"><span className="spin" /></div>}
          {!loading && (
            <>
              {(tab === "all" || tab === "track") && merged.length > 0 && (
                <div className="track-list" style={{ marginTop: 10 }}>
                  {merged.slice(0, tab === "all" ? 8 : undefined).map((tr, i) => (
                    <TrackRow key={tr.videoId} raw={tr} track={playableOf(tr)} index={i} queue={mergedQueue} />
                  ))}
                </div>
              )}
              {(tab === "all" || tab === "album") && collectionsOf("album").length > 0 && (
                <div className="grid-cards" style={{ marginTop: 18 }}>
                  {collectionsOf("album").map((c) => (
                    <CollectionCard
                      key={c.browseId}
                      title={c.title}
                      subtitle={c.subtitle}
                      cover={bestThumb(c.thumbs)}
                      kind="album"
                      onOpen={() => nav(`/album/${c.browseId}`)}
                    />
                  ))}
                </div>
              )}
              {(tab === "all" || tab === "artist") && collectionsOf("artist").length > 0 && (
                <div className="grid-cards" style={{ marginTop: 18 }}>
                  {collectionsOf("artist").map((c) => (
                    <CollectionCard
                      key={c.browseId}
                      title={c.title}
                      subtitle={c.subtitle || t("artists")}
                      cover={bestThumb(c.thumbs)}
                      kind="artist"
                      onOpen={() => nav(`/artist/${c.browseId}`)}
                    />
                  ))}
                </div>
              )}
              {(tab === "all" || tab === "playlist") && collectionsOf("playlist").length > 0 && (
                <div className="grid-cards" style={{ marginTop: 18 }}>
                  {collectionsOf("playlist").map((c) => (
                    <CollectionCard
                      key={c.browseId}
                      title={c.title}
                      subtitle={c.subtitle}
                      cover={bestThumb(c.thumbs)}
                      kind="playlist"
                      onOpen={() => nav(`/playlist/${c.browseId}`)}
                    />
                  ))}
                </div>
              )}
              {tab === "video" && tracksOf("video").length > 0 && (
                <div className="track-list" style={{ marginTop: 10 }}>
                  {tracksOf("video").map((tr, i) => (
                    <TrackRow key={tr.videoId} raw={tr} track={playableOf(tr)} index={i} queue={queueOf("video")} />
                  ))}
                </div>
              )}
              {tab === "soundcloud" && scTracks.length > 0 && (
                <div className="track-list" style={{ marginTop: 10 }}>
                  {scTracks.map((tr, i) => (
                    <TrackRow key={tr.videoId} raw={tr} track={playableOf(tr)} index={i} queue={scTracks.map(playableOf)} />
                  ))}
                </div>
              )}
              {!loading &&
                merged.length === 0 &&
                tracksOf("video").length === 0 &&
                collectionsOf("album").length === 0 &&
                collectionsOf("artist").length === 0 &&
                collectionsOf("playlist").length === 0 && <div className="state-block">{t("emptySearch")}</div>}
            </>
          )}
        </>
      )}
    </div>
  );
}
