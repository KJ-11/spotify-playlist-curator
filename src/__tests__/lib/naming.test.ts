import { describe, it, expect } from "vitest";
import { buildNamingPrompt } from "@/lib/naming";
import type { VibeVector } from "@/lib/types";
import { VIBE_DIMENSIONS } from "@/lib/types";

const makeVector = (overrides: Partial<VibeVector> = {}): VibeVector => {
  const v: Partial<VibeVector> = {};
  for (const dim of VIBE_DIMENSIONS) v[dim] = 0.5;
  return { ...v, ...overrides } as VibeVector;
};

describe("buildNamingPrompt", () => {
  it("includes dimension scores, artists, and genres", () => {
    const prompt = buildNamingPrompt({
      centroid: makeVector({ energy: 0.9, timeOfDay: 0.9 }),
      topArtists: ["John Summit", "Fisher"],
      topGenres: ["house", "electronic"],
    });
    expect(prompt).toContain("energy: 0.9");
    expect(prompt).toContain("John Summit");
    expect(prompt).toContain("house");
  });

  it("asks for 2-4 word atmospheric name", () => {
    const prompt = buildNamingPrompt({
      centroid: makeVector(),
      topArtists: [],
      topGenres: [],
    });
    expect(prompt).toContain("2-4 word");
  });
});
