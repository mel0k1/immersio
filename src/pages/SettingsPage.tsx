import { useEffect, useState } from "react";
import { Palette, SlidersHorizontal, Info } from "lucide-react";
import { useSettings, useLibrary, useUi } from "../lib/store";
import { useT } from "../lib/i18n";
import { api } from "../lib/ipc";

const ACCENTS = ["#7c5cff", "#ff5c7c", "#3ecf8e", "#4d71ff", "#ffb020", "#e8e8ee"];

const TABS = ["appearance", "playback", "about"] as const;
type Tab = (typeof TABS)[number];

export function SettingsPage() {
  const t = useT();
  const { lang, accent, setLang, setAccent, streamQuality, rate, radioAuto, discordId, setStreamQuality, setRate, setRadioAuto, setDiscordId } = useSettings();
  const showToast = useUi((s) => s.showToast);
  const clearAll = useLibrary((s) => s.clearAll);
  const [version, setVersion] = useState("");
  const [discordInput, setDiscordInput] = useState(discordId);
  const [tab, setTab] = useState<Tab>("appearance");
  useEffect(() => {
    api.version().then(setVersion).catch(() => setVersion(""));
  }, []);

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
          <button className={`settings-nav-item${tab === "about" ? " active" : ""}`} onClick={() => setTab("about")}>
            <Info size={15} style={{ marginRight: 8, verticalAlign: -2 }} />
            {t("about")}
          </button>
        </div>
        <div className="settings-body">
          {tab === "appearance" && (
            <>
              <div className="settings-row">
                <div>
                  <div className="settings-label">{t("language")}</div>
                </div>
                <div className="seg">
                  <button className={lang === "ru" ? "active" : ""} onClick={() => setLang("ru")}>
                    Русский
                  </button>
                  <button className={lang === "en" ? "active" : ""} onClick={() => setLang("en")}>
                    English
                  </button>
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
                  <div className="settings-label">{t("radioAuto")}</div>
                  <div className="settings-desc">{t("radioAutoDesc")}</div>
                </div>
                <button className={`btn${radioAuto ? " accent" : ""}`} onClick={() => setRadioAuto(!radioAuto)}>
                  {radioAuto ? "ON" : "OFF"}
                </button>
              </div>
              <div className="settings-row">
                <div>
                  <div className="settings-label">{t("discordId")}</div>
                  <div className="settings-desc">{t("discordDesc")}</div>
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
              <div className="settings-row">
                <div>
                  <div className="settings-label">{t("shortcuts")}</div>
                  <div className="settings-desc">{t("shortcutsDesc")}</div>
                </div>
              </div>
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
          {tab === "about" && (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 18 }}>
                <img src="/ghost.png" width={46} height={46} style={{ borderRadius: 10 }} alt="Immersio" />
                <div>
                  <div style={{ fontSize: 17, fontWeight: 750 }}>Immersio</div>
                  <div style={{ color: "var(--text-dim)", fontSize: 13 }}>
                    {t("version")} {version || "0.2.0"}
                  </div>
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
