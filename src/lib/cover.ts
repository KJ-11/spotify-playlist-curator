import type { LibraryTrack } from "./library-types";

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

// Derives a two-stop gradient from the playlist's average audio features:
// valence sets warm vs. cool, energy sets saturation, acousticness softens.
export function playlistColors(name: string, tracks: LibraryTrack[]): [string, string] {
  const withFeatures = tracks.filter((t) => t.features);
  const avg = (key: "valence" | "energy" | "acousticness") =>
    withFeatures.length
      ? withFeatures.reduce((s, t) => s + t.features![key], 0) / withFeatures.length
      : 0.5;
  const jitter = (hashString(name) % 40) - 20;
  const hue = Math.round(230 - avg("valence") * 200 + jitter);
  const sat = Math.round(35 + avg("energy") * 50);
  const light = Math.round(32 + avg("acousticness") * 18);
  return [`hsl(${hue}, ${sat}%, ${light}%)`, `hsl(${hue + 45}, ${sat}%, ${Math.max(light - 14, 12)}%)`];
}

export function gradientCss(colors: [string, string]): string {
  return `linear-gradient(135deg, ${colors[0]}, ${colors[1]})`;
}

const SPOTIFY_COVER_LIMIT = 256 * 1024;

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/)) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

// Renders a 600x600 JPEG cover and returns raw base64 under Spotify's 256KB limit, or null.
export function renderCoverBase64(name: string, colors: [string, string]): string | null {
  const size = 600;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  const gradient = ctx.createLinearGradient(0, 0, size, size);
  gradient.addColorStop(0, colors[0]);
  gradient.addColorStop(1, colors[1]);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  ctx.fillStyle = "rgba(255,255,255,0.95)";
  ctx.font = "700 60px Inter, system-ui, sans-serif";
  ctx.textBaseline = "bottom";
  const lines = wrapText(ctx, name, size - 96);
  lines.forEach((l, i) => ctx.fillText(l, 48, size - 48 - (lines.length - 1 - i) * 68));

  for (const quality of [0.85, 0.7, 0.5]) {
    const base64 = canvas.toDataURL("image/jpeg", quality).split(",")[1];
    if (base64.length <= SPOTIFY_COVER_LIMIT) return base64;
  }
  return null;
}
