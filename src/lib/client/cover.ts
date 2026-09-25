import type { LibraryTrack } from "@/lib/types";

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** Golden-angle spacing keeps consecutive seeds (p0, p1, …) far apart on the colour wheel. */
const GOLDEN_ANGLE = 137.508;

/**
 * Two-stop gradient for a playlist. The hue comes from a stable seed (the playlist id) so
 * every playlist is visually distinct and renaming doesn't repaint it; the average audio
 * features then shade it: valence warms or cools the hue, energy sets saturation, and
 * acousticness lightens.
 */
export function playlistColors(seed: string, tracks: LibraryTrack[]): [string, string] {
  const withFeatures = tracks.filter((t) => t.features);
  const avg = (key: "valence" | "energy" | "acousticness") =>
    withFeatures.length
      ? withFeatures.reduce((s, t) => s + t.features![key], 0) / withFeatures.length
      : 0.5;
  const base = (hashString(seed) * GOLDEN_ANGLE) % 360;
  const hue = Math.round(base + (avg("valence") - 0.5) * 40);
  const sat = Math.round(45 + avg("energy") * 40);
  const light = Math.round(34 + avg("acousticness") * 14);
  return [`hsl(${hue}, ${sat}%, ${light}%)`, `hsl(${hue + 40}, ${sat}%, ${Math.max(light - 14, 14)}%)`];
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
