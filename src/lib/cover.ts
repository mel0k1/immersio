import { api } from "./ipc";

const blobCache = new Map<string, string>();
const inflight = new Map<string, Promise<string>>();
const colorCache = new Map<string, [number, number, number] | null>();

export function imageBlobUrl(url: string): Promise<string> {
  const cached = blobCache.get(url);
  if (cached) return Promise.resolve(cached);
  const pending = inflight.get(url);
  if (pending) return pending;
  const p = api
    .fetchImage(url)
    .then((bytes) => {
      const blob = new Blob([new Uint8Array(bytes)]);
      const out = URL.createObjectURL(blob);
      blobCache.set(url, out);
      inflight.delete(url);
      return out;
    })
    .catch(() => {
      inflight.delete(url);
      return url;
    });
  inflight.set(url, p);
  return p;
}

export function dominantColor(url: string): Promise<[number, number, number] | null> {
  const cached = colorCache.get(url);
  if (cached !== undefined) return Promise.resolve(cached);
  return imageBlobUrl(url)
    .then(
      (blobUrl) =>
        new Promise<[number, number, number] | null>((resolve) => {
          const img = new Image();
          img.onload = () => {
            try {
              const c = document.createElement("canvas");
              c.width = 24;
              c.height = 24;
              const ctx = c.getContext("2d")!;
              ctx.drawImage(img, 0, 0, 24, 24);
              const d = ctx.getImageData(0, 0, 24, 24).data;
              let best: [number, number, number] | null = null;
              let bestScore = -1;
              let sum: [number, number, number] = [0, 0, 0];
              for (let i = 0; i < d.length; i += 4) {
                const r = d[i];
                const g = d[i + 1];
                const b = d[i + 2];
                sum[0] += r;
                sum[1] += g;
                sum[2] += b;
                const max = Math.max(r, g, b);
                const min = Math.min(r, g, b);
                const sat = max === 0 ? 0 : (max - min) / max;
                const lum = (r * 0.299 + g * 0.587 + b * 0.114) / 255;
                const score = sat * 2 - Math.abs(lum - 0.5);
                if (score > bestScore) {
                  bestScore = score;
                  best = [r, g, b];
                }
              }
              const avg: [number, number, number] = [
                sum[0] / (d.length / 4),
                sum[1] / (d.length / 4),
                sum[2] / (d.length / 4),
              ];
              const out = bestScore > 0.15 ? best : avg;
              colorCache.set(url, out);
              resolve(out);
            } catch {
              colorCache.set(url, null);
              resolve(null);
            }
          };
          img.onerror = () => {
            colorCache.set(url, null);
            resolve(null);
          };
          img.src = blobUrl;
        }),
    );
}
