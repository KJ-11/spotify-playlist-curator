"use client";

import { useState } from "react";
import type { Cluster } from "@/lib/types";
import { ClusterCard } from "./cluster-card";

function clusterSignature(cluster: Cluster) {
  const artistCounts = new Map<string, number>();
  const genreSet = new Set<string>();
  for (const t of cluster.tracks) {
    for (const a of t.track.artists) {
      artistCounts.set(a.name, (artistCounts.get(a.name) ?? 0) + 1);
    }
    for (const g of t.genres) genreSet.add(g);
  }
  const topArtists = [...artistCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name]) => name);
  const topGenres = [...genreSet].slice(0, 3);
  return { centroid: cluster.centroid, topArtists, topGenres };
}

export function ListView({
  clusters,
  onUpdateClusters,
}: {
  clusters: Cluster[];
  onUpdateClusters: (clusters: Cluster[]) => void;
}) {
  const [regeneratingId, setRegeneratingId] = useState<string | null>(null);

  const handleRename = (clusterId: string, newName: string) => {
    onUpdateClusters(
      clusters.map((c) => (c.id === clusterId ? { ...c, name: newName } : c))
    );
  };

  const handleRemoveTrack = (clusterId: string, trackId: string) => {
    onUpdateClusters(
      clusters.map((c) =>
        c.id === clusterId
          ? { ...c, tracks: c.tracks.filter((t) => t.track.id !== trackId) }
          : c
      )
    );
  };

  const handleMoveTrack = (
    targetClusterId: string,
    trackId: string,
    fromClusterId: string
  ) => {
    const sourceCluster = clusters.find((c) => c.id === fromClusterId);
    const track = sourceCluster?.tracks.find((t) => t.track.id === trackId);
    if (!track) return;

    onUpdateClusters(
      clusters.map((c) => {
        if (c.id === fromClusterId) {
          return { ...c, tracks: c.tracks.filter((t) => t.track.id !== trackId) };
        }
        if (c.id === targetClusterId) {
          return { ...c, tracks: [...c.tracks, { ...track, clusterId: targetClusterId }] };
        }
        return c;
      })
    );
  };

  const handleMerge = (targetId: string, sourceId: string) => {
    const source = clusters.find((c) => c.id === sourceId);
    if (!source) return;
    onUpdateClusters(
      clusters
        .map((c) => {
          if (c.id === targetId) {
            return {
              ...c,
              tracks: [
                ...c.tracks,
                ...source.tracks.map((t) => ({ ...t, clusterId: targetId })),
              ],
            };
          }
          return c;
        })
        .filter((c) => c.id !== sourceId)
    );
  };

  const handleRegenerateName = async (clusterId: string) => {
    const cluster = clusters.find((c) => c.id === clusterId);
    if (!cluster) return;

    setRegeneratingId(clusterId);
    try {
      const res = await fetch("/api/name", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clusters: [clusterSignature(cluster)] }),
      });
      if (!res.ok) return;
      const { names } = (await res.json()) as { names: string[] };
      const newName = names[0];
      if (newName) handleRename(clusterId, newName);
    } catch {
      // Leave the existing name in place if regeneration fails.
    } finally {
      setRegeneratingId(null);
    }
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {clusters.map((cluster) => (
        <ClusterCard
          key={cluster.id}
          cluster={cluster}
          onRename={(name) => handleRename(cluster.id, name)}
          onRemoveTrack={(trackId) => handleRemoveTrack(cluster.id, trackId)}
          onDrop={(trackId, fromId) => handleMoveTrack(cluster.id, trackId, fromId)}
          onDragTrackStart={() => {}}
          onRegenerateName={() => handleRegenerateName(cluster.id)}
          onMergeInto={(sourceId) => handleMerge(cluster.id, sourceId)}
          regeneratingName={regeneratingId === cluster.id}
        />
      ))}
    </div>
  );
}
