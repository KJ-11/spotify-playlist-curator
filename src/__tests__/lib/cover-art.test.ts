import { describe, it, expect } from "vitest";
import { computeGradientColors } from "@/lib/cover-art";
import type { VibeVector } from "@/lib/types";
import { VIBE_DIMENSIONS } from "@/lib/types";

const makeVector = (overrides: Partial<VibeVector> = {}): VibeVector => {
  const v: Partial<VibeVector> = {};
  for (const dim of VIBE_DIMENSIONS) v[dim] = 0.5;
  return { ...v, ...overrides } as VibeVector;
};

describe("computeGradientColors", () => {
  it("returns 2-3 HSL color strings", () => {
    const colors = computeGradientColors(makeVector());
    expect(colors.length).toBeGreaterThanOrEqual(2);
    expect(colors.length).toBeLessThanOrEqual(3);
    colors.forEach((c) => expect(c).toMatch(/^hsl\(/));
  });

  it("produces warmer hues for high valence", () => {
    const warm = computeGradientColors(makeVector({ valence: 0.9 }));
    const cool = computeGradientColors(makeVector({ valence: 0.1 }));
    const getHue = (hsl: string) => parseInt(hsl.match(/hsl\((\d+)/)?.[1] ?? "0");
    const warmHue = getHue(warm[0]);
    const coolHue = getHue(cool[0]);
    expect(warmHue).toBeLessThan(60);
    expect(coolHue).toBeGreaterThan(200);
  });

  it("produces lower brightness for high timeOfDay (late night)", () => {
    const night = computeGradientColors(makeVector({ timeOfDay: 0.9 }));
    const morning = computeGradientColors(makeVector({ timeOfDay: 0.1 }));
    const getLightness = (hsl: string) =>
      parseInt(hsl.match(/(\d+)%\)$/)?.[1] ?? "50");
    expect(getLightness(night[0])).toBeLessThan(getLightness(morning[0]));
  });
});
