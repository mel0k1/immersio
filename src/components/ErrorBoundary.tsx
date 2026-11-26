import { Component, type ReactNode } from "react";
import { tKey } from "../lib/i18n";
import { useSettings } from "../lib/store";

interface Props {
  children: ReactNode;
  /** compact variant for overlays */
  compact?: boolean;
}

interface State {
  error: Error | null;
}

/** Catches render crashes so a broken page never blanks the whole window. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error("Render crash:", error);
  }

  render() {
    if (!this.state.error) return this.props.children;
    const lang = useSettings.getState().lang;
    return (
      <div
        className="state-block"
        style={this.props.compact ? { padding: 30 } : { paddingTop: 120 }}
      >
        <div style={{ fontSize: 15, fontWeight: 590 }}>{tKey(lang, "crashTitle")}</div>
        <div style={{ fontSize: 13, color: "var(--text-dim)", maxWidth: 480 }}>
          {this.state.error.message || tKey(lang, "crashUnknown")}
        </div>
        <button className="btn primary" onClick={() => location.reload()}>
          {tKey(lang, "crashReload")}
        </button>
      </div>
    );
  }
}
