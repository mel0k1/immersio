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
import { CollectionCard, Section } from "../components/Cards";
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
  return tracks.filter(
    (tr) => (tr.title ?? "").toLowerCase().includes(f) || (tr.artists ?? []).join(" ").toLowerCase().includes(f),
  );
}

export function Hero({
  kind,
  title,
  subtitle,
  cover,
  meta,
  onPlayAll,
  onShuffle,
  extra,
  tools,
  round,
}: {
  kind: string;
  title: string;
  subtitle?: React.ReactNode;
  cover: string | null;
  meta: React.ReactNode;
  onPlayAll: () => void;
  onShuffle?: () => void;
  extra?: React.ReactNode;
  tools?: React.ReactNode;
  round?: boolean;
}) {
  const color = useHeroColor(cover);
  const t = useT();
  return (
    <div className="hero" style={{ ["--hero-color" as string]: color ?? "var(--accent)" }}>
      <div className="hero-glass" />
      <div className="hero-top">
        <div style={{ width: 140, height: 140, borderRadius: round ? "999px" : 10, overflow: "hidden", boxShadow: "0 16px 40px rgba(0,0,0,.55)", flexShrink: 0 }}>
          <Cover src={cover} round={round} />
        </div>
        <div style={{ minWidth: 0 }}>
          <div className="hero-kind">{kind}</div>
          <h1 className="hero-title">{title}</h1>
          {subtitle && <div className="hero-sub">{subtitle}</div>}
          <div className="hero-meta">{meta}</div>
        </div>
      </div>
      <div className="hero-actions">
        <button className="btn sm primary" onClick={onPlayAll}>
          <Play size={16} fill="currentColor" />
          {t("playAll")}
        </button>
        {onShuffle && (
          <button className="btn sm icon-only" title={t("shuffle")} onClick={onShuffle}>
            <Shuffle size={16} />
          </button>
        )}
        <div className="spacer" />
        {tools}
        {extra && extra}
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
    <button className="btn sm" onClick={() => toggleSaved(item)}>
      {saved ? <Check size={15} /> : <Plus size={15} />}
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

  // keep each track's position in the release order, filtering only hides rows
  const filtered = useMemo(
    () => (info ? info.tracks.map((tr, i) => ({ tr, i })).filter(({ tr }) => filterTracks([tr], q).length > 0) : []),
    [info, q],
  );

  if (fail) return <div className="page"><div className="state-block">{t("emptySearch")}</div></div>;
  if (!info) return <div className="page"><div className="state-block"><span className="spin" /></div></div>;

  const playable = filtered.map(({ tr }) => playableOf(tr));
  const fullPlayable = info.tracks.map(playableOf);

  return (
    <div className="page">
      <Hero
        kind={kind === "album" ? t("albums") : t("playlists")}
        title={info.title}
        subtitle={
          info.owners.length > 0 ? (
            info.owners.map((o, i) => (
              <span key={i}>
                <b onClick={() => nav(`/search?q=${encodeURIComponent(o)}`)}>{o}</b>
                {i < info.owners.length - 1 && <span style={{ color: "var(--text-faint)" }}>,</span>}
              </span>
            ))
          ) : undefined
        }
        cover={info.cover}
        meta={
          <>
            {info.year && <span>{info.year}</span>}
            <span>
              {info.tracks.length} {t("songsCount")}
            </span>
            {info.total > 0 && <span>{fmtTotal(info.total, "ru")}</span>}
          </>
        }
        onPlayAll={() => info.tracks.length > 0 && playContext(fullPlayable, 0)}
        onShuffle={() =>
          info.tracks.length > 0 && playContext(fullPlayable, Math.floor(Math.random() * info.tracks.length))
        }
        tools={<SearchFilter value={q} onChange={setQ} />}
        extra={<SaveButton item={{ browseId: info.browseId, kind: info.kind, title: info.title, subtitle: info.owners.join(", "), thumbs: data && data.kind !== "artist" ? data.thumbs : [] }} />}
      />
      <div className="track-list">
        {filtered.map(({ tr, i }) => (
          <TrackRow key={`${tr.videoId}-${i}`} raw={tr} track={playableOf(tr)} index={i} queue={playable} hideCover={info.kind === "album"} hideArtist={info.kind === "album"} />
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
  // top-tracks numbering follows the source order while the filter hides rows
  const filtered = useMemo(
    () => (artist ? artist.topTracks.map((tr, i) => ({ tr, i })).filter(({ tr }) => filterTracks([tr], q).length > 0) : []),
    [artist, q],
  );

  if (fail) return <div className="page"><div className="state-block">{t("emptySearch")}</div></div>;
  if (!artist) return <div className="page"><div className="state-block"><span className="spin" /></div></div>;

  const cover = bestThumb(artist.thumbs);
  const playable = filtered.map(({ tr }) => playableOf(tr));

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
        tools={<SearchFilter value={q} onChange={setQ} />}
        extra={
          <>
            <button
              className="btn sm"
              onClick={() => {
                artist.topTracks.forEach((tr) => usePlayer.getState().addToQueue(playableOf(tr)));
                useUi.getState().showToast(`${t("addToQueue")}: +${artist.topTracks.length}`);
              }}
            >
              <ListPlus size={15} />
              {t("addToQueue")}
            </button>
            <SaveButton item={{ browseId: artist.browseId, kind: "artist", title: artist.name, subtitle: t("artists"), thumbs: artist.thumbs }} />
          </>
        }
      />
      <Section title={t("topTracks")}>
        <div className="track-list">
          {filtered.map(({ tr, i }) => (
            <TrackRow key={tr.videoId} raw={tr} track={playableOf(tr)} index={i} queue={playable} />
          ))}
        </div>
        {artist.topTracks.length === 0 && <div className="state-block">{t("emptySearch")}</div>}
      </Section>
      {artist.albums.length > 0 && (
        <Section title={t("singles")}>
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
        </Section>
      )}
    </div>
  );
}
