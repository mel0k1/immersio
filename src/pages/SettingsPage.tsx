import { useEffect, useState } from "react";
import { Keyboard, Palette, SlidersHorizontal, Info } from "lucide-react";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { useSettings, useLibrary, useUi, DEFAULT_SHORTCUTS, type Locale } from "../lib/store";
import { useT } from "../lib/i18n";
import { api } from "../lib/ipc";
import { comboOf, comboLabel } from "../lib/shortcuts";
import { EQ_FREQS } from "../lib/audio";

const ACCENTS = ["#7c5cff", "#ff5c7c", "#3ecf8e", "#4d71ff", "#2dd4bf", "#f97316", "#a78bfa", "#ef4444", "#38bdf8", "#84cc16", "#e879f9", "#ffb020", "#e8e8ee"];

const LANGS: [Locale, string][] = [
  ["ru", "Русский"],
  ["en", "English"],
  ["uk", "Українська"],
  ["es", "Español"],
  ["de", "Deutsch"],
  ["it", "Italiano"],
  ["fr", "Français"],
  ["pl", "Polski"],
  ["tr", "Türkçe"],
  ["pt", "Português"],
  ["id", "Indonesia"],
];

const TABS = ["appearance", "playback", "shortcuts", "about"] as const;
type Tab = (typeof TABS)[number];

const ACTIONS: [string, string][] = [
  ["playPause", "scPlayPause"],
  ["nextTrack", "scNext"],
  ["prevTrack", "scPrev"],
  ["seekForward", "scSeekForward"],
  ["seekBackward", "scSeekBackward"],
  ["volumeUp", "scVolumeUp"],
  ["volumeDown", "scVolumeDown"],
  ["toggleMute", "scMute"],
  ["toggleFullscreen", "scFullscreen"],
  ["likeTrack", "scLike"],
  ["toggleQueue", "scQueue"],
  ["openSearch", "scSearch"],
];

const CACHE_OPTIONS = [1, 3, 10, 0];

function fmtSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function SettingsPage() {
  const t = useT();
  const {
    lang, accent, setLang, setAccent, theme, setTheme, glass, setGlass, ambient, setAmbient, streamQuality, rate, pitchLock, radioAuto,
    discordOn, discordId, offlineCache, cacheLimit, pauseOnDeviceChange, shortcuts, eqEnabled, eqGains,
    setStreamQuality, setRate, setPitchLock, setRadioAuto, setDiscordOn, setDiscordId, setOfflineCache, setCacheLimit,
    setPauseOnDeviceChange, setShortcut, resetShortcuts, setEqEnabled, setEqGains,
  } = useSettings();
  const showToast = useUi((s) => s.showToast);
  const clearAll = useLibrary((s) => s.clearAll);
  const addLiked = useLibrary((s) => s.addLiked);
  const [version, setVersion] = useState("");
  const [discordInput, setDiscordInput] = useState(discordId);
  const [cookieInput, setCookieInput] = useState("");
  const [potInput, setPotInput] = useState("");
  const [potProviderInput, setPotProviderInput] = useState("http://127.0.0.1:4416");
  const [cacheInfo, setCacheInfo] = useState<[number, number] | null>(null);
  const [tab, setTab] = useState<Tab>("appearance");
  const [recording, setRecording] = useState<string | null>(null);
  const [updState, setUpdState] = useState<null | "checking" | "none" | "error" | "downloading" | "installed" | Update>(null);

  async function checkForUpdate() {
    setUpdState("checking");
    try {
      const u = await check();
      setUpdState(u ?? "none");
    } catch {
      setUpdState("error");
    }
  }

  async function installUpdate() {
    const u = updState;
    if (!u || typeof u === "string") return;
    setUpdState("downloading");
    try {
      await u.downloadAndInstall();
      setUpdState("installed");
    } catch {
      setUpdState("error");
    }
  }

  useEffect(() => {
    api.version().then(setVersion).catch(() => setVersion(""));
    api.cacheStats().then(setCacheInfo).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!recording) {
      delete document.body.dataset.recording;
      return;
    }
    document.body.dataset.recording = "1";
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.code === "Escape") {
        setRecording(null);
        return;
      }
      const combo = comboOf(e);
      if (!combo) return;
      const clash = Object.entries(shortcuts).find(([a, c]) => a !== recording && c === combo);
      if (clash) {
        showToast(`${t("shortcutTaken")}: ${comboLabel(combo)}`);
        setRecording(null);
        return;
      }
      setShortcut(recording, combo);
      setRecording(null);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [recording]);

  return (
    <div className="page">
      <h1 className="page-title">{t("settings")}</h1>
      <div className="settings-layout" style={{ marginTop: 22 }}>
        <div className="settings-nav">
          <button className={`settings-nav-item${tab === "appearance" ? " active" : ""}`} onClick={() => setTab("appearance")}>
            <Palette size={15} style={{ marginRight: 8, verticalAlign: -2 }} />
            {t("appearance")}
          </button>
          <button className={`settings-nav-item${tab === "playback" ? " active" : ""}`} onClick={() => setTab("playback")}>
            <SlidersHorizontal size={15} style={{ marginRight: 8, verticalAlign: -2 }} />
            {t("playback")}
          </button>
          <button className={`settings-nav-item${tab === "shortcuts" ? " active" : ""}`} onClick={() => setTab("shortcuts")}>
            <Keyboard size={15} style={{ marginRight: 8, verticalAlign: -2 }} />
            {t("shortcuts")}
          </button>
          <button className={`settings-nav-item${tab === "about" ? " active" : ""}`} onClick={() => setTab("about")}>
            <Info size={15} style={{ marginRight: 8, verticalAlign: -2 }} />
            {t("about")}
          </button>
        </div>
        <div className="settings-body">
          {tab === "appearance" && (
            <>
              <div className="settings-row">
                <div className="settings-label">{t("language")}</div>
                <div className="swatches" style={{ justifyContent: "flex-end" }}>
                  {LANGS.map(([code, name]) => (
                    <button key={code} className={`pill${lang === code ? " active" : ""}`} onClick={() => setLang(code)}>
                      {name}
                    </button>
                  ))}
                </div>
              </div>
              <div className="settings-row">
                <div className="settings-label">{t("accentColor")}</div>
                <div className="swatches">
                  {ACCENTS.map((c) => (
                    <button key={c} className={`swatch${accent === c ? " active" : ""}`} style={{ background: c }} onClick={() => setAccent(c)} />
                  ))}
                </div>
              </div>
              <div className="settings-row">
                <div className="settings-label">{t("theme")}</div>
                <div className="seg">
                  <button className={theme === "dark" ? "active" : ""} onClick={() => setTheme("dark")}>
                    {t("themeDark")}
                  </button>
                  <button className={theme === "light" ? "active" : ""} onClick={() => setTheme("light")}>
                    {t("themeLight")}
                  </button>
                </div>
              </div>
              <div className="settings-row">
                <div className="settings-label">{t("glassStyle")}</div>
                <div className="seg">
                  <button className={glass ? "active" : ""} onClick={() => setGlass(true)}>
                    {t("glassOn")}
                  </button>
                  <button className={!glass ? "active" : ""} onClick={() => setGlass(false)}>
                    {t("glassOff")}
                  </button>
                </div>
              </div>
              <div className="settings-row">
                <div>
                  <div className="settings-label">{t("ambient")}</div>
                  <div className="settings-desc">{t("ambientDesc")}</div>
                </div>
                <button className={`btn${ambient ? " accent" : ""}`} onClick={() => setAmbient(!ambient)}>
                  {ambient ? "ON" : "OFF"}
                </button>
              </div>
            </>
          )}
          {tab === "playback" && (
            <>
              <div className="settings-row">
                <div className="settings-label">{t("streamQuality")}</div>
                <div className="seg">
                  <button className={streamQuality === "high" ? "active" : ""} onClick={() => setStreamQuality("high")}>
                    {t("qualityHigh")}
                  </button>
                  <button className={streamQuality === "low" ? "active" : ""} onClick={() => setStreamQuality("low")}>
                    {t("qualityLow")}
                  </button>
                </div>
              </div>
              <div className="settings-row">
                <div className="settings-label">{t("speed")}</div>
                <div className="seg">
                  {[0.75, 1, 1.25, 1.5, 2].map((r) => (
                    <button key={r} className={rate === r ? "active" : ""} onClick={() => setRate(r)}>
                      {r}×
                    </button>
                  ))}
                </div>
              </div>
              <div className="settings-row">
                <div>
                  <div className="settings-label">{t("offlineCache")}</div>
                  <div className="settings-desc">{t("offlineCacheDesc")}{cacheInfo ? ` — ${fmtSize(cacheInfo[0])}, ${cacheInfo[1]}` : ""}</div>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    className="btn"
                    onClick={() =>
                      api
                        .cacheClear()
                        .then(() => {
                          setCacheInfo([0, 0]);
                          showToast(t("cacheCleared"));
                        })
                        .catch((e) => showToast(String(e)))
                    }
                  >
                    {t("cacheClear")}
                  </button>
                  <button className={`btn${offlineCache ? " accent" : ""}`} onClick={() => setOfflineCache(!offlineCache)}>
                    {offlineCache ? "ON" : "OFF"}
                  </button>
                </div>
              </div>
              <div className="settings-row">
                <div>
                  <div className="settings-label">{t("cacheLimit")}</div>
                  <div className="settings-desc">{t("cacheLimitDesc")}</div>
                </div>
                <div className="seg">
                  {CACHE_OPTIONS.map((gb) => (
                    <button key={gb} className={cacheLimit === gb * 1073741824 ? "active" : ""} onClick={() => setCacheLimit(gb * 1073741824)}>
                      {gb === 0 ? t("cacheUnlimited") : `${gb} GB`}
                    </button>
                  ))}
                </div>
              </div>
              <div className="settings-row">
                <div>
                  <div className="settings-label">{t("devicePause")}</div>
                  <div className="settings-desc">{t("devicePauseDesc")}</div>
                </div>
                <button className={`btn${pauseOnDeviceChange ? " accent" : ""}`} onClick={() => setPauseOnDeviceChange(!pauseOnDeviceChange)}>
                  {pauseOnDeviceChange ? "ON" : "OFF"}
                </button>
              </div>
              <div className="settings-row">
                <div>
                  <div className="settings-label">{t("equalizer")}</div>
                  <div className="settings-desc">{t("eqDesc")}</div>
                </div>
                <button className={`btn${eqEnabled ? " accent" : ""}`} onClick={() => setEqEnabled(!eqEnabled)}>
                  {eqEnabled ? "ON" : "OFF"}
                </button>
              </div>
              {eqEnabled && (
                <div className="settings-row">
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 14, rowGap: 18 }}>
                      {EQ_FREQS.map((f, i) => (
                        <div key={f} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                          <span style={{ fontSize: 11, color: "var(--text-dim)" }}>{eqGains[i] ?? 0} dB</span>
                          <input
                            className="slider"
                            type="range"
                            min={-12}
                            max={12}
                            step={1}
                            value={eqGains[i] ?? 0}
                            style={{ width: 96, "--fill": `${(((eqGains[i] ?? 0) + 12) / 24) * 100}%` } as React.CSSProperties}
                            onChange={(e) => {
                              const g = eqGains.length === EQ_FREQS.length ? [...eqGains] : [...eqGains, ...EQ_FREQS.slice(eqGains.length).map(() => 0)];
                              g[i] = Number(e.target.value);
                              setEqGains(g);
                            }}
                          />
                          <span style={{ fontSize: 11, color: "var(--text-dim)" }}>{f >= 1000 ? `${f / 1000}k` : f}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
              <div className="settings-row">
                <div>
                  <div className="settings-label">{t("pitchLock")}</div>
                  <div className="settings-desc">{t("pitchLockDesc")}</div>
                </div>
                <button className={`btn${pitchLock ? " accent" : ""}`} onClick={() => setPitchLock(!pitchLock)}>
                  {pitchLock ? "ON" : "OFF"}
                </button>
              </div>
              <div className="settings-row">
                <div>
                  <div className="settings-label">{t("ytCookies")}</div>
                  <div className="settings-desc">{t("ytCookiesDesc")}</div>
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <input
                    className="field"
                    style={{ width: 260, marginBottom: 0 }}
                    type="password"
                    placeholder={t("ytCookies")}
                    value={cookieInput}
                    onChange={(e) => setCookieInput(e.target.value)}
                  />
                  <button
                    className="btn"
                    onClick={() =>
                      api
                        .setYtCookies(cookieInput.trim() ? cookieInput.trim() : null)
                        .then(() => showToast(t("cookiesSaved")))
                        .catch((e) => showToast(String(e)))
                    }
                  >
                    {t("save")}
                  </button>
                </div>
              </div>
              <div className="settings-row">
                <div>
                  <div className="settings-label">{t("potManual")}</div>
                  <div className="settings-desc">{t("potDesc")}</div>
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <input
                    className="field"
                    style={{ width: 260, marginBottom: 0 }}
                    type="password"
                    placeholder={t("potManual")}
                    value={potInput}
                    onChange={(e) => setPotInput(e.target.value)}
                  />
                  <button
                    className="btn"
                    onClick={() =>
                      api
                        .setPot(potInput.trim() ? potInput.trim() : null)
                        .then(() => showToast(t("potSaved")))
                        .catch((e) => showToast(String(e)))
                    }
                  >
                    {t("save")}
                  </button>
                </div>
              </div>
              <div className="settings-row">
                <div>
                  <div className="settings-label">{t("potProvider")}</div>
                  <div className="settings-desc">{t("potProviderDesc")}</div>
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <input
                    className="field"
                    style={{ width: 260, marginBottom: 0 }}
                    placeholder="http://127.0.0.1:4416"
                    value={potProviderInput}
                    onChange={(e) => setPotProviderInput(e.target.value)}
                  />
                  <button
                    className="btn"
                    onClick={() =>
                      api
                        .potProvider(potProviderInput.trim() || null)
                        .then(() => showToast(t("potOk")))
                        .catch((e) => showToast(String(e)))
                    }
                  >
                    {t("potGet")}
                  </button>
                </div>
              </div>
              <div className="settings-row">
                <div>
                  <div className="settings-label">{t("importLiked")}</div>
                  <div className="settings-desc">{t("importLikedDesc")}</div>
                </div>
                <button
                  className="btn"
                  onClick={() =>
                    api
                      .importLiked()
                      .then((tracks) => {
                        addLiked(tracks);
                        showToast(`${t("importLikedOk")}: ${tracks.length}`);
                      })
                      .catch((e) => showToast(String(e)))
                  }
                >
                  {t("importLiked")}
                </button>
              </div>
              <div className="settings-row">
                <div>
                  <div className="settings-label">{t("radioAuto")}</div>
                  <div className="settings-desc">{t("radioAutoDesc")}</div>
                </div>
                <button className={`btn${radioAuto ? " accent" : ""}`} onClick={() => setRadioAuto(!radioAuto)}>
                  {radioAuto ? "ON" : "OFF"}
                </button>
              </div>
              <div className="settings-row">
                <div>
                  <div className="settings-label">{t("discord")}</div>
                  <div className="settings-desc">{t("discordDesc")}</div>
                </div>
                <button className={`btn${discordOn ? " accent" : ""}`} onClick={() => setDiscordOn(!discordOn)}>
                  {discordOn ? "ON" : "OFF"}
                </button>
              </div>
              {discordOn && (
                <div className="settings-row">
                  <div>
                    <div className="settings-label">{t("discordId")}</div>
                    <div className="settings-desc">{t("discordIdDesc")}</div>
                  </div>
                  <input
                    className="field"
                    style={{ width: 240, marginBottom: 0 }}
                    placeholder="1234567890"
                    value={discordInput}
                    onChange={(e) => setDiscordInput(e.target.value.replace(/[^0-9]/g, ""))}
                    onBlur={() => setDiscordId(discordInput)}
                  />
                </div>
              )}
              <div className="settings-row">
                <div>
                  <div className="settings-label">{t("clearData")}</div>
                  <div className="settings-desc">{t("clearDataDesc")}</div>
                </div>
                <button
                  className="btn"
                  onClick={() => {
                    clearAll();
                    showToast(t("clearData"));
                  }}
                >
                  {t("clearData")}
                </button>
              </div>
            </>
          )}
          {tab === "shortcuts" && (
            <>
              <div className="settings-row">
                <div>
                  <div className="settings-label">{t("shortcuts")}</div>
                  <div className="settings-desc">{t("shortcutsRecDesc")}</div>
                </div>
                <button className="btn" onClick={resetShortcuts}>
                  {t("resetShortcuts")}
                </button>
              </div>
              {ACTIONS.map(([action, key]) => (
                <div className="settings-row" key={action}>
                  <div className="settings-label">{t(key)}</div>
                  <button
                    className={`pill${recording === action ? " active" : ""}`}
                    style={{ minWidth: 130, textAlign: "center" }}
                    onClick={() => setRecording(recording === action ? null : action)}
                  >
                    {recording === action ? t("pressKey") : comboLabel(shortcuts[action] || DEFAULT_SHORTCUTS[action] || "")}
                  </button>
                </div>
              ))}
            </>
          )}
          {tab === "about" && (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 18 }}>
                <img src="/ghost.png" width={46} height={46} style={{ borderRadius: 10 }} alt="Immersio" />
                <div>
                  <div style={{ fontSize: 17, fontWeight: 750 }}>Immersio</div>
                  <div style={{ color: "var(--text-dim)", fontSize: 13 }}>
                    {t("version")} {version || "0.5.0"}
                  </div>
                </div>
              </div>
              <div className="settings-row">
                <div className="settings-label">{t("updateSection")}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  {updState === "none" ? (
                    <span style={{ color: "var(--text-dim)" }}>{t("updateNone")}</span>
                  ) : updState === "checking" || updState === "downloading" ? (
                    <span className="spin" />
                  ) : updState === "installed" ? (
                    <button className="pill" onClick={() => relaunch().catch(() => undefined)}>
                      {t("updateRestart")}
                    </button>
                  ) : updState === "error" ? (
                    <>
                      <span style={{ color: "var(--text-dim)" }}>{t("updateError")}</span>
                      <button className="pill" onClick={checkForUpdate}>
                        {t("updateRetry")}
                      </button>
                    </>
                  ) : updState && typeof updState !== "string" ? (
                    <>
                      <span style={{ color: "var(--text-dim)" }}>{t("updateAvailable")} {updState.version}</span>
                      <button className="pill" onClick={installUpdate}>
                        {t("updateDownload")}
                      </button>
                    </>
                  ) : (
                    <button className="pill" onClick={checkForUpdate}>
                      {t("updateCheck")}
                    </button>
                  )}
                </div>
              </div>
              <div className="settings-row">
                <div className="settings-label">{t("license")}</div>
                <div style={{ color: "var(--text-dim)" }}>GNU GPL v3.0</div>
              </div>
              <div className="settings-row">
                <div className="settings-desc">{t("credits")}</div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
