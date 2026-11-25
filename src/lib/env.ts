import { getCurrentWebview } from "@tauri-apps/api/webview";

export const isTauri = "__TAURI_INTERNALS__" in window;

export const isOverlayWindow = isTauri && getCurrentWebview().label === "overlay";
