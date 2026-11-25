import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { emitOverlayState } from "./audio";

export async function toggleOverlay(): Promise<boolean> {
  const existing = await WebviewWindow.getByLabel("overlay");
  if (existing) {
    await existing.close();
    return false;
  }
  const win = new WebviewWindow("overlay", {
    url: "index.html",
    title: "Immersio",
    width: 420,
    height: 108,
    resizable: false,
    decorations: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    transparent: true,
    shadow: false,
  });
  win.once("tauri://created", () => emitOverlayState());
  return true;
}
