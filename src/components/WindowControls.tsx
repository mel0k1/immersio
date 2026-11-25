import { Minus, Square, X } from "lucide-react";
import { getCurrentWindow } from "@tauri-apps/api/window";

const isTauri = "__TAURI_INTERNALS__" in window;

export function WindowControls() {
  if (!isTauri) return null;
  const win = getCurrentWindow();
  return (
    <div className="win-controls">
      <button onClick={() => win.minimize().catch(() => undefined)} aria-label="minimize">
        <Minus size={16} />
      </button>
      <button onClick={() => win.toggleMaximize().catch(() => undefined)} aria-label="maximize">
        <Square size={13} />
      </button>
      <button className="close" onClick={() => win.close().catch(() => undefined)} aria-label="close">
        <X size={16} />
      </button>
    </div>
  );
}

export function DragRegion() {
  if (!isTauri) return null;
  return <div className="drag-region" style={{ pointerEvents: "auto" }} />;
}
