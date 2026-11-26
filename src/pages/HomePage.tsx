import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Play } from "lucide-react";
import { api } from "../lib/ipc";
import { playableOf, type Playable, type TrackItem } from "../types";
import { useLibrary, usePlayer } from "../lib/store";
import { useT } from "../lib/i18n";
import { Section, CollectionCard } from "../components/Cards";
import { TrackRow } from "../components/TrackRow";
import { Cover } from "../components/Cover";

function shuffleArr<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function HomePage() {
  const t = useT();
  const nav = useNavigate();
  const history = useLibrary((s) => s.history);
  const liked = useLibrary((s) => s.liked);
  const saved = useLibrary((s) => s.saved);
  const playContext = usePlayer((s) => s.playContext);
  const [popular, setPopular] = useState<TrackItem[]>([]);
  const [popularFail, setPopularFail] = useState(false);

  useEffect(() => {
    let alive = true;
    api
      .search("top hits", "ru")
      .then((r) => {
        if (!alive) return;
        const shelf = r.shelves.find((s) => s.kind === "track");
        setPopular(shelf ? shelf.tracks.slice(0, 8) : []);
      })
      .catch(() => alive && setPopularFail(true));
    return () => {
      alive = false;
    };
  }, []);

  const mixPool = useMemo(() => {
    const pool: Playable[] = [];
    const seen = new Set<string>();
    for (const tr of liked) {
      if (!seen.has(tr.videoId)) {
        seen.add(tr.videoId);
        pool.push(playableOf(tr));
      }
    }
    for (const h of history) {
      if (!seen.has(h.key)) {
        seen.add(h.key);
        pool.push(h);
      }
    }
    return pool;
  }, [liked, history]);

  const mixes = useMemo(() => {
    if (mixPool.length < 4) return [];
    const size = Math.max(3, Math.floor(mixPool.length / 4));
    return [0, 1, 2, 3].map(() => shuffleArr(mixPool).slice(0, Math.min(size + 2, mixPool.length)));
  }, [mixPool]);

  const popularRows = popular;

  const wave = () => {
    if (mixPool.length > 0) playContext(shuffleArr(mixPool), 0);
    else if (popular.length > 0) playContext(popular.map(playableOf), 0);
  };

  const hour = new Date().getHours();
  const greeting = hour >= 5 && hour < 12 ? "goodMorning" : hour >= 12 && hour < 18 ? "goodAfternoon" : hour >= 18 && hour < 23 ? "goodEvening" : "goodNight";

  return (
    <div className="page">
      <div className="home-hero">
        <h1 className="home-hero-title">
          {t(greeting)}
          <br />
          <span style={{ color: "var(--accent)" }}>{t("myWave")}</span>
        </h1>
        <div className="hero-actions" style={{ marginTop: 18 }}>
          <button className="btn primary" onClick={wave}>
            <Play size={17} fill="currentColor" />
            {t("playAll")}
          </button>
        </div>
      </div>
      {history.length > 0 && (
        <Section title={t("recent")}>
          <div className="row-of-cards">
            {history.slice(0, 10).map((h, i) => (
              <div
                key={`${h.key}-${i}`}
                className="card"
                onClick={() => playContext([h], 0)}
                role="button"
              >
                <div className="card-cover">
                  <Cover src={h.thumb ?? h.coverPath ?? undefined} kind={h.localId ? "local" : "none"} />
                </div>
                <div className="card-title">{h.title}</div>
                <div className="card-sub">{h.artists.join(", ")}</div>
              </div>
            ))}
          </div>
        </Section>
      )}
      {mixes.length > 0 && (
        <Section title={t("dailyMixes")}>
          <div className="row-of-cards">
            {mixes.map((mix, i) => (
              <CollectionCard
                key={i}
                title={`${t("mixOf")} ${i + 1}`}
                subtitle={mix[0]?.artists.slice(0, 2).join(", ") || t("mixOf")}
                cover={mix[0]?.thumb}
                kind="none"
                onOpen={() => playContext(shuffleArr(mix), 0)}
                onPlay={() => playContext(shuffleArr(mix), 0)}
              />
            ))}
          </div>
        </Section>
      )}
      {saved.length > 0 && (
        <Section title={t("library")}>
          <div className="row-of-cards">
            {saved.slice(0, 10).map((c) => (
              <CollectionCard
                key={c.browseId}
                title={c.title}
                subtitle={c.subtitle}
                cover={c.thumbs.length ? c.thumbs[c.thumbs.length - 1].url : null}
                kind={c.kind}
                onOpen={() => nav(`/${c.kind}/${c.browseId}`)}
                onPlay={undefined}
              />
            ))}
          </div>
        </Section>
      )}
      <Section title={t("popularTracks")}>
        {popularRows.length > 0 ? (
          <div className="track-list">
            {popularRows.map((tr, i) => (
              <TrackRow
                key={tr.videoId}
                raw={tr}
                track={playableOf(tr)}
                index={i}
                queue={popularRows.map(playableOf)}
              />
            ))}
          </div>
        ) : (
          <div className="state-block">{popularFail ? t("emptySearch") : <span className="spin" />}</div>
        )}
      </Section>
    </div>
  );
}
