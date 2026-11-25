import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Play, Shuffle, Search, Plus, Check, ListPlus } from "lucide-react";
import { api } from "../lib/ipc";
import { bestThumb, playableOf, type Browse, type Thumb, type TrackItem } from "../types";
import { useLibrary, usePlayer, useUi } from "../lib/store";
import { useT } from "../lib/i18n";
import { fmtTotal } from "../lib/format";
import { TrackRow } from "../components/TrackRow";
import { Cover } from "../components/Cover";
import { CollectionCard } from "../components/Cards";
import { dominantColor } from "../lib/cover";

function useHeroColor(cover: string | null) {
  const [color, setColor] = useState<string | null>(null);
  useEffect(() => {
    if (!cover) return;
    let alive = true;
    dominantColor(cover).then((c) => {
      if (alive && c) setColor(`rgb(${c.join(",")})`);
    });
    return () => {
      alive = false;
    };
  }, [cover]);
  return color;
}

function filterTracks(tracks: TrackItem[], q: string): TrackItem[] {
  const f = q.toLowerCase().trim();
  if (!f) return tracks;
  return tracks.filter((tr) => tr.title.toLowerCase().includes(f) || tr.artists.join(" ").toLowerCase().includes(f));
}

export function Hero({
  kind,
  title,
  cover,
  meta,
  onPlayAll,
  onShuffle,
  extra,
  round,
}: {
  kind: string;
  title: string;
  cover: string | null;
  meta: React.ReactNode;
  onPlayAll: () => void;
  onShuffle?: () => void;
  extra?: React.ReactNode;
  round?: boolean;
}) {
  const color = useHeroColor(cover);
  const t = useT();
  return (
    <div className="hero" style={{ ["--hero-color" as string]: color ?? "#7c5cff" }}>
      <div className="hero-glass" />
      <div className="hero-top">
        <div style={{ width: 180, height: 180, borderRadius: round ? "999px" : 14, overflow: "hidden", boxShadow: "0 16px 40px rgba(0,0,0,.55)", flexShrink: 0 }}>
          <Cover src={cover} round={round} />
        </div>
        <div style={{ minWidth: 0 }}>
          <div className="hero-kind">{kind}</div>
          <h1 className="hero-title">{title}</h1>
          <div className="hero-meta">{meta}</div>
        </div>
      </div>
      <div className="hero-actions">
        <button className="btn primary" onClick={onPlayAll}>
          <Play size={17} fill="currentColor" />
          {t("playAll")}
        </button>
        {onShuffle && (
          <button className="btn" onClick={onShuffle}>
            <Shuffle size={16} />
            {t("shuffle")}
          </button>
        )}
        {extra}
      </div>
    </div>
  );
}

export function SearchFilter({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const t = useT();
  return (
    <div className="list-tools">
      <div className="input">
        <Search size={16} />
        <input placeholder={t("searchIn")} value={value} onChange={(e) => onChange(e.target.value)} />
      </div>
    </div>
  );
}

function SaveButton({ item }: { item: { browseId: string; kind: "album" | "playlist" | "artist"; title: string; subtitle: string; thumbs: Thumb[] } }) {
  const t = useT();
  const saved = useLibrary((s) => s.saved.some((x) => x.browseId === item.browseId));
  const toggleSaved = useLibrary((s) => s.toggleSaved);
  return (
    <button className="btn" onClick={() => toggleSaved(item)}>
      {saved ? <Check size={16} /> : <Plus size={16} />}
      {saved ? t("inLibrary") : t("saveToLibrary")}
    </button>
  );
}

export function CollectionPage({ kind }: { kind: "album" | "playlist" }) {
  const t = useT();
  const nav = useNavigate();
  const { browseId } = useParams();
  const [data, setData] = useState<Browse | null>(null);
  const [fail, setFail] = useState(false);
  const [q, setQ] = useState("");
  const playContext = usePlayer((s) => s.playContext);

  useEffect(() => {
    if (!browseId) return;
    setData(null);
    setFail(false);
    setQ("");
    api
      .browse(browseId, "ru")
      .then(setData)
      .catch(() => setFail(true));
  }, [browseId]);

  const info = useMemo(() => {
    if (!data || data.kind === "artist") return null;
    const tracks = data.kind === "album" ? data.tracks : data.tracks;
    const cover = bestThumb(data.thumbs);
    const owners = data.kind === "album" ? data.artists : data.owner ? [data.owner] : [];
    const year = data.kind === "album" ? data.year : null;
    const total = tracks.reduce((a, b) => a + (b.durationSecs ?? 0), 0);
    return { tracks, cover, owners, year, total, title: data.title, browseId: data.browseId, kind: data.kind === "album" ? ("album" as const) : ("playlist" as const) };
  }, [data]);

  const filtered = useMemo(() => (info ? filterTracks(info.tracks, q) : []), [info, q]);

  if (fail) return <div className="page"><div className="state-block">{t("emptySearch")}</div></div>;
  if (!info) return <div className="page"><div className="state-block"><span className="spin" /></div></div>;

  const playable = filtered.map(playableOf);
  const fullPlayable = info.tracks.map(playableOf);

  return (
    <div className="page">
      <Hero
        kind={kind === "album" ? t("albums") : t("playlists")}
        title={info.title}
        cover={info.cover}
        meta={
          <>
            {info.owners.map((o, i) => (
              <b key={i} onClick={() => nav(`/search?q=${encodeURIComponent(o)}`)}>
                {o}
              </b>
            ))}
            {info.year && <span>{info.year}</span>}
            <span className="hero-chip">
              {info.tracks.length} {t("songsCount")}
            </span>
            {info.total > 0 && <span>{fmtTotal(info.total, "ru")}</span>}
          </>
        }
        onPlayAll={() => info.tracks.length > 0 && playContext(fullPlayable, 0)}
        onShuffle={() =>
          info.tracks.length > 0 && playContext(fullPlayable, Math.floor(Math.random() * info.tracks.length))
        }
        extra={<SaveButton item={{ browseId: info.browseId, kind: info.kind, title: info.title, subtitle: info.owners.join(", "), thumbs: data && data.kind !== "artist" ? data.thumbs : [] }} />}
      />
      <SearchFilter value={q} onChange={setQ} />
      <div className="track-list">
        {filtered.map((tr, i) => (
          <TrackRow key={`${tr.videoId}-${i}`} raw={tr} track={playableOf(tr)} index={i} queue={playable} />
        ))}
      </div>
      {info.tracks.length === 0 && <div className="state-block">{t("emptySearch")}</div>}
    </div>
  );
}

export function ArtistPage() {
  const t = useT();
  const nav = useNavigate();
  const { browseId } = useParams();
  const [data, setData] = useState<Browse | null>(null);
  const [fail, setFail] = useState(false);
  const [q, setQ] = useState("");
  const playContext = usePlayer((s) => s.playContext);

  useEffect(() => {
    if (!browseId) return;
    setData(null);
    setFail(false);
    setQ("");
    api
      .browse(browseId, "ru")
      .then(setData)
      .catch(() => setFail(true));
  }, [browseId]);

  const artist = data?.kind === "artist" ? data : null;
  const filtered = useMemo(() => filterTracks(artist?.topTracks ?? [], q), [artist, q]);

  if (fail) return <div className="page"><div className="state-block">{t("emptySearch")}</div></div>;
  if (!artist) return <div className="page"><div className="state-block"><span className="spin" /></div></div>;

  const cover = bestThumb(artist.thumbs);
  const playable = filtered.map(playableOf);

  return (
    <div className="page">
      <Hero
        kind={t("artists")}
        title={artist.name}
        cover={cover}
        round
        meta={
          artist.description ? (
            <span style={{ maxWidth: 520, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
              {artist.description}
            </span>
          ) : null
        }
        onPlayAll={() => artist.topTracks.length > 0 && playContext(artist.topTracks.map(playableOf), 0)}
        extra={
          <>
            <button
              className="btn"
              onClick={() => {
                artist.topTracks.forEach((tr) => usePlayer.getState().addToQueue(playableOf(tr)));
                useUi.getState().showToast(`${t("addToQueue")}: +${artist.topTracks.length}`);
              }}
            >
              <ListPlus size={16} />
              {t("addToQueue")}
            </button>
            <SaveButton item={{ browseId: artist.browseId, kind: "artist", title: artist.name, subtitle: t("artists"), thumbs: artist.thumbs }} />
          </>
        }
      />
      <div className="section-title" style={{ margin: "26px 0 12px" }}>{t("topTracks")}</div>
      <SearchFilter value={q} onChange={setQ} />
      <div className="track-list">
        {filtered.map((tr, i) => (
          <TrackRow key={tr.videoId} raw={tr} track={playableOf(tr)} index={i} queue={playable} />
        ))}
      </div>
      {artist.topTracks.length === 0 && <div className="state-block">{t("emptySearch")}</div>}
      {artist.albums.length > 0 && (
        <>
          <div className="section-title" style={{ margin: "30px 0 12px" }}>{t("singles")}</div>
          <div className="row-of-cards">
            {artist.albums.map((c) => (
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
        </>
      )}
    </div>
  );
}
