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
