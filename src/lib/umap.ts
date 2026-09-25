import { UMAP } from "umap-js";
import type { VibeVector } from "./types";
import { vibeVectorToArray } from "./cluster";

export function projectToUmap(
  vectors: VibeVector[]
): { x: number; y: number }[] {
  const data = vectors.map(vibeVectorToArray);
  const umap = new UMAP({
    nComponents: 2,
    nNeighbors: Math.min(15, Math.floor(data.length / 3)),
    minDist: 0.1,
  });
  const embedding = umap.fit(data);
  return embedding.map(([x, y]) => ({ x, y }));
}
