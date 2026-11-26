/** Deterministic pixel-art covers for daily mixes: dithered field + our ghost mascot.
 *  Even mixes wear headphones. Deliberately distinct from Liner's halftone covers. */

function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PALETTES: [string, string][] = [
  ["#7b5cff", "#4038a8"],
  ["#37c8ab", "#1e6e63"],
  ["#ff7847", "#a03a1d"],
  ["#ff5c8a", "#8a2748"],
  ["#6bd45c", "#2f6e2b"],
  ["#4aa8ff", "#24549c"],
];

// 8x9 ghost, 'o' marks 2x2 eye blocks — drawn onto a 12x12 field
const GHOST = [
  "..####..",
  ".######.",
  "########",
  "########",
  "#oo##oo#",
  "#oo##oo#",
  "########",
  "########",
  "#.#.#.#.",
];

// headphones for even mixes: band over the head + accent cups on the sides
function headphones(ox: number, oy: number, accent: string): string[] {
  const parts: string[] = [];
  const px = (x: number, y: number, w: number, h: number, fill: string) =>
    parts.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}"/>`);
  px(ox, oy - 1, 8, 1, accent);
  px(ox, oy, 1, 1, accent);
  px(ox + 7, oy, 1, 1, accent);
  px(ox - 1, oy + 1, 2, 3, accent);
  px(ox + 7, oy + 1, 2, 3, accent);
  px(ox, oy + 2, 1, 2, "#101014");
  px(ox + 7, oy + 2, 1, 2, "#101014");
  return parts;
}

export function mixArt(seed: number): string {
  const rnd = mulberry32(seed * 2654435761 + 11);
  const [a, b] = PALETTES[Math.floor(rnd() * PALETTES.length) % PALETTES.length];
  const dither: string[] = [];
  for (let y = 0; y < 12; y++) {
    for (let x = 0; x < 12; x++) {
      const r = rnd();
      if (r < 0.22) dither.push(`<rect x="${x}" y="${y}" width="1" height="1" fill="${a}" opacity="0.85"/>`);
      else if (r < 0.38) dither.push(`<rect x="${x}" y="${y}" width="1" height="1" fill="${b}" opacity="0.7"/>`);
      else if (r < 0.46) dither.push(`<rect x="${x}" y="${y}" width="1" height="1" fill="${a}" opacity="0.25"/>`);
    }
  }
  const lines: string[] = [];
  for (let y = 1; y < 12; y += 2) {
    lines.push(`<rect x="0" y="${y}" width="12" height="0.4" fill="#000" opacity="0.2"/>`);
  }
  const body: string[] = [];
  const eyes: string[] = [];
  const ox = 2;
  const oy = 2;
  for (let y = 0; y < GHOST.length; y++) {
    for (let x = 0; x < 8; x++) {
      const ch = GHOST[y][x];
      if (ch === "#") body.push(`<rect x="${ox + x}" y="${oy + y}" width="1" height="1" fill="#f4f2ec"/>`);
      if (ch === "o") eyes.push(`<rect x="${ox + x}" y="${oy + y}" width="1" height="1" fill="#101014"/>`);
    }
  }
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 12 12" shape-rendering="crispEdges">` +
    `<rect width="12" height="12" fill="#101014"/>` +
    `<rect width="12" height="12" fill="${b}" opacity="0.35"/>` +
    dither.join("") +
    lines.join("") +
    `<rect x="${ox}" y="${oy + 1}" width="8" height="8" fill="${b}" opacity="0.8"/>` +
    body.join("") +
    eyes.join("") +
    (seed % 2 === 0 ? headphones(ox, oy, a).join("") : "") +
    `</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}
