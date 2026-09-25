import type { VibeVector } from "./types";

export function computeGradientColors(centroid: VibeVector): string[] {
  const hueBase = centroid.valence > 0.5
    ? 20 + (1 - centroid.valence) * 40
    : 220 + centroid.valence * 60;

  const warmthShift = (centroid.warmth - 0.5) * 30;
  const hue1 = Math.round(hueBase + warmthShift);
  const hue2 = Math.round(hue1 + 40 + centroid.tension * 60);

  const saturation = Math.round(40 + centroid.energy * 50);
  const baseLightness = 55 - centroid.timeOfDay * 30;
  const lightness1 = Math.round(baseLightness);
  const lightness2 = Math.round(baseLightness - 10);

  const colors = [
    `hsl(${hue1}, ${saturation}%, ${lightness1}%)`,
    `hsl(${hue2}, ${saturation}%, ${lightness2}%)`,
  ];

  if (centroid.tension > 0.6) {
    const hue3 = Math.round(hue1 + 120);
    colors.push(`hsl(${hue3}, ${Math.round(saturation * 0.7)}%, ${Math.round(baseLightness - 5)}%)`);
  }

  return colors;
}

export function computeGradientAngle(centroid: VibeVector): number {
  return Math.round(45 + centroid.tension * 90);
}

export function generateCoverArtCSS(centroid: VibeVector): {
  colors: string[];
  angle: number;
} {
  return {
    colors: computeGradientColors(centroid),
    angle: computeGradientAngle(centroid),
  };
}

export function renderCoverToBase64(
  colors: string[],
  angle: number,
  name: string
): Promise<string> {
  return new Promise((resolve) => {
    const canvas = document.createElement("canvas");
    canvas.width = 640;
    canvas.height = 640;
    const ctx = canvas.getContext("2d")!;

    const rad = (angle * Math.PI) / 180;
    const x0 = 320 + 320 * Math.cos(rad + Math.PI);
    const y0 = 320 + 320 * Math.sin(rad + Math.PI);
    const x1 = 320 + 320 * Math.cos(rad);
    const y1 = 320 + 320 * Math.sin(rad);
    const gradient = ctx.createLinearGradient(x0, y0, x1, y1);
    colors.forEach((c, i) => gradient.addColorStop(i / (colors.length - 1), c));
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 640, 640);

    // Subtle noise
    const imageData = ctx.getImageData(0, 0, 640, 640);
    for (let i = 0; i < imageData.data.length; i += 4) {
      const noise = (Math.random() - 0.5) * 15;
      imageData.data[i] += noise;
      imageData.data[i + 1] += noise;
      imageData.data[i + 2] += noise;
    }
    ctx.putImageData(imageData, 0, 0);

    // Playlist name overlay
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.font = "bold 36px Inter, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(name, 320, 320, 580);

    resolve(canvas.toDataURL("image/jpeg", 0.9).split(",")[1]);
  });
}
