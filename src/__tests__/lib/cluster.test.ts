import { describe, it, expect } from "vitest";
import {
  vibeVectorToArray,
  arrayToVibeVector,
  chooseBestK,
  mergeSmallClusters,
  splitLargeClusters,
} from "@/lib/cluster";
import type { VibeVector } from "@/lib/types";
import { VIBE_DIMENSIONS } from "@/lib/types";

const makeVector = (base: number): VibeVector => {
  const v: Partial<VibeVector> = {};
  for (const dim of VIBE_DIMENSIONS) v[dim] = base;
  return v as VibeVector;
};

describe("vibeVectorToArray / arrayToVibeVector", () => {
  it("round-trips correctly", () => {
    const vec = makeVector(0.5);
    const arr = vibeVectorToArray(vec);
    expect(arr).toHaveLength(13);
    expect(arr.every((v) => v === 0.5)).toBe(true);
    const back = arrayToVibeVector(arr);
    expect(back).toEqual(vec);
  });
});

describe("chooseBestK", () => {
  it("returns a value between 5 and 12", () => {
    const k = chooseBestK(100);
    expect(k).toBeGreaterThanOrEqual(5);
    expect(k).toBeLessThanOrEqual(12);
  });

  it("returns fewer clusters for fewer tracks", () => {
    expect(chooseBestK(30)).toBeLessThanOrEqual(chooseBestK(500));
  });
});

describe("mergeSmallClusters", () => {
  it("merges clusters with fewer than minSize tracks", () => {
    const assignments = [0, 0, 0, 0, 0, 1, 1, 2];
    const centroids = [makeVector(0.2), makeVector(0.3), makeVector(0.8)];
    const result = mergeSmallClusters(assignments, centroids, 5);
    const cluster2Tracks = result.assignments.filter((a) => a === 2);
    expect(cluster2Tracks).toHaveLength(0);
  });
});

describe("splitLargeClusters", () => {
  it("splits clusters with more than maxSize tracks", () => {
    const assignments = new Array(40).fill(0);
    const vectors = assignments.map((_, i) => {
      const v = makeVector(i / 40);
      v.energy = i < 20 ? 0.2 : 0.8;
      return v;
    });
    const centroids = [makeVector(0.5)];
    const result = splitLargeClusters(assignments, vectors, centroids, 30);
    const uniqueClusters = new Set(result.assignments);
    expect(uniqueClusters.size).toBeGreaterThan(1);
  });
});
