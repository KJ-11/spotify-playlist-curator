import { kmeans } from "ml-kmeans";
import type { VibeVector } from "./types";
import { VIBE_DIMENSIONS } from "./types";

export function vibeVectorToArray(v: VibeVector): number[] {
  return VIBE_DIMENSIONS.map((dim) => v[dim]);
}

export function arrayToVibeVector(arr: number[]): VibeVector {
  const v: Partial<VibeVector> = {};
  VIBE_DIMENSIONS.forEach((dim, i) => {
    v[dim] = arr[i];
  });
  return v as VibeVector;
}

export function chooseBestK(numTracks: number): number {
  const raw = Math.round(Math.sqrt(numTracks / 3));
  return Math.max(5, Math.min(12, raw));
}

function centroidDistance(a: VibeVector, b: VibeVector): number {
  return Math.sqrt(
    VIBE_DIMENSIONS.reduce((sum, dim) => sum + (a[dim] - b[dim]) ** 2, 0)
  );
}

export function mergeSmallClusters(
  assignments: number[],
  centroids: VibeVector[],
  minSize: number
): { assignments: number[]; centroids: VibeVector[] } {
  const result = [...assignments];
  const counts = new Map<number, number>();
  for (const a of result) counts.set(a, (counts.get(a) ?? 0) + 1);

  for (const [clusterId, count] of counts) {
    if (count >= minSize) continue;
    let nearestId = -1;
    let nearestDist = Infinity;
    for (const [otherId] of counts) {
      if (otherId === clusterId || (counts.get(otherId) ?? 0) < minSize) continue;
      const dist = centroidDistance(centroids[clusterId], centroids[otherId]);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearestId = otherId;
      }
    }
    if (nearestId >= 0) {
      for (let i = 0; i < result.length; i++) {
        if (result[i] === clusterId) result[i] = nearestId;
      }
      counts.set(nearestId, (counts.get(nearestId) ?? 0) + count);
      counts.delete(clusterId);
    }
  }
  return { assignments: result, centroids };
}

export function splitLargeClusters(
  assignments: number[],
  vectors: VibeVector[],
  centroids: VibeVector[],
  maxSize: number,
  maxIterations = 20
): { assignments: number[]; centroids: VibeVector[] } {
  const result = [...assignments];
  const newCentroids = [...centroids];

  for (let iter = 0; iter < maxIterations; iter++) {
    const counts = new Map<number, number>();
    for (const a of result) counts.set(a, (counts.get(a) ?? 0) + 1);

    const oversized = [...counts.entries()].filter(([, count]) => count > maxSize);
    if (oversized.length === 0) break;

    let nextId = Math.max(...result) + 1;

    for (const [clusterId, count] of oversized) {
      if (count <= maxSize) continue;
      const indices = result
        .map((a, i) => (a === clusterId ? i : -1))
        .filter((i) => i >= 0);
      const clusterVectors = indices.map((i) => vibeVectorToArray(vectors[i]));
      const sub = kmeans(clusterVectors, 2, { initialization: "kmeans++" });
      for (let j = 0; j < indices.length; j++) {
        if (sub.clusters[j] === 1) {
          result[indices[j]] = nextId;
        }
      }
      newCentroids[clusterId] = arrayToVibeVector(sub.centroids[0]);
      newCentroids.push(arrayToVibeVector(sub.centroids[1]));
      nextId++;
    }
  }

  return { assignments: result, centroids: newCentroids };
}

export function clusterTracks(vectors: VibeVector[]): {
  assignments: number[];
  centroids: VibeVector[];
  k: number;
} {
  const k = chooseBestK(vectors.length);
  const data = vectors.map(vibeVectorToArray);
  const result = kmeans(data, k, { initialization: "kmeans++" });

  let centroids = result.centroids.map(arrayToVibeVector);
  let assignments: number[];
  ({ assignments, centroids } = mergeSmallClusters(result.clusters, centroids, 5));
  ({ assignments, centroids } = splitLargeClusters(
    assignments,
    vectors,
    centroids,
    30
  ));

  const uniqueIds = [...new Set(assignments)];
  const idMap = new Map(uniqueIds.map((id, i) => [id, i]));
  const normalized = assignments.map((a) => idMap.get(a)!);
  const finalCentroids = uniqueIds.map((id) => centroids[id]);

  return { assignments: normalized, centroids: finalCentroids, k: uniqueIds.length };
}
