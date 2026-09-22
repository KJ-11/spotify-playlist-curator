"use client";

import { useSession } from "next-auth/react";
import { redirect } from "next/navigation";
import { useState, useCallback } from "react";
import { CurateButton } from "@/components/curate-button";
import { PipelineProgress } from "@/components/pipeline-progress";
import { ListView } from "@/components/list-view";
import { VibeMap } from "@/components/vibe-map";
import { ViewToggle } from "@/components/view-toggle";
import { PushDialog } from "@/components/push-dialog";
import type {
  TrackWithFeatures,
  VibeVector,
  ClassifiedTrack,
  Cluster,
  CurationResult,
} from "@/lib/types";
import { generateCoverArtCSS } from "@/lib/cover-art";

function buildClusters(
  tracks: TrackWithFeatures[],
  vibeVectors: VibeVector[],
  assignments: number[],
  centroids: VibeVector[],
  positions2d: { x: number; y: number }[],
  names: string[]
): Cluster[] {
  const clusterIds = [...new Set(assignments)].sort((a, b) => a - b);

  return clusterIds.map((clusterId, idx) => {
    const clusterTracks: ClassifiedTrack[] = [];
    for (let i = 0; i < assignments.length; i++) {
      if (assignments[i] === clusterId) {
        clusterTracks.push({
          ...tracks[i],
          vibeVector: vibeVectors[i],
          position2d: positions2d[i],
          clusterId: String(clusterId),
        });
      }
    }

    const centroid = centroids[clusterId] ?? centroids[0];
    const { colors, angle } = generateCoverArtCSS(centroid);
    const gradient = `linear-gradient(${angle}deg, ${colors.join(", ")})`;

    return {
      id: String(clusterId),
      name: names[idx] ?? `Playlist ${idx + 1}`,
      tracks: clusterTracks,
      centroid,
      coverArtDataUrl: gradient,
    };
  });
}

export default function CuratePage() {
  const { data: session, status } = useSession();
  const [pipelineStep, setPipelineStep] = useState(-1);
  const [result, setResult] = useState<CurationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<"map" | "list">("list");
  const [showPush, setShowPush] = useState(false);

  if (status === "unauthenticated") redirect("/");

  const runPipeline = useCallback(async () => {
    setError(null);
    setPipelineStep(0);

    try {
    const tracksRes = await fetch("/api/tracks");
    if (!tracksRes.ok) { setError("Failed to fetch tracks"); return; }
    const { tracks } = await tracksRes.json() as { tracks: TrackWithFeatures[] };

    setPipelineStep(1);
    const classifyRes = await fetch("/api/classify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tracks }),
    });
    if (!classifyRes.ok) { setError("Failed to classify tracks"); return; }
    const { vibeVectors } = await classifyRes.json() as { vibeVectors: VibeVector[] };

    setPipelineStep(2);
    const clusterRes = await fetch("/api/cluster", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ vibeVectors }),
    });
    if (!clusterRes.ok) { setError("Failed to cluster tracks"); return; }
    const { assignments, centroids, positions2d } = await clusterRes.json() as {
      assignments: number[];
      centroids: VibeVector[];
      positions2d: { x: number; y: number }[];
      k: number;
    };

    setPipelineStep(3);
    const clusterIds = [...new Set(assignments)].sort((a, b) => a - b);
    const clusterSignatures = clusterIds.map((clusterId) => {
      const indices = assignments
        .map((a, i) => (a === clusterId ? i : -1))
        .filter((i) => i >= 0);
      const clusterTracks = indices.map((i) => tracks[i]);
      const artistCounts = new Map<string, number>();
      const genreSet = new Set<string>();
      for (const t of clusterTracks) {
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
      return { centroid: centroids[clusterId], topArtists, topGenres };
    });

    const nameRes = await fetch("/api/name", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clusters: clusterSignatures }),
    });
    if (!nameRes.ok) { setError("Failed to name playlists"); return; }
    const { names } = await nameRes.json() as { names: string[] };

    const clusters = buildClusters(tracks, vibeVectors, assignments, centroids, positions2d, names);
    setResult({ clusters, totalTracks: tracks.length });
    setPipelineStep(-1);
    } catch {
      setError("Something went wrong. Please try again.");
      setPipelineStep(-1);
    }
  }, []);

  if (status === "loading") return null;

  return (
    <main className="min-h-screen p-8 max-w-7xl mx-auto">
      <header className="flex items-center justify-between mb-12">
        <h1 className="text-2xl font-bold">Playlist Curator</h1>
        <span className="text-zinc-400 text-sm">{session?.user?.name}</span>
      </header>

      {!result && pipelineStep < 0 && (
        <div className="flex flex-col items-center justify-center gap-6 py-24">
          <CurateButton onClick={runPipeline} disabled={false} />
        </div>
      )}

      {pipelineStep >= 0 && <PipelineProgress currentStep={pipelineStep} />}

      {error && (
        <div className="text-center text-red-400 py-8">
          <p>{error}</p>
          <button onClick={runPipeline} className="mt-4 text-sm underline">
            Try again
          </button>
        </div>
      )}

      {result && (
        <div>
          <div className="flex items-center justify-between mb-6">
            <p className="text-zinc-400 text-sm">
              {result.totalTracks} tracks → {result.clusters.length} playlists
            </p>
            <div className="flex items-center gap-3">
              <ViewToggle view={view} onToggle={setView} />
              <button
                onClick={() => setShowPush(true)}
                className="px-5 py-2 bg-green-600 hover:bg-green-500 text-white text-sm font-medium rounded-full transition"
              >
                Create Playlists
              </button>
            </div>
          </div>
          {view === "list" && (
            <ListView
              clusters={result.clusters}
              onUpdateClusters={(clusters) => setResult({ ...result, clusters })}
            />
          )}
          {view === "map" && (
            <VibeMap
              clusters={result.clusters}
              onMoveTrack={(trackId, fromId, toId) => {
                const source = result.clusters.find((c) => c.id === fromId);
                const track = source?.tracks.find((t) => t.track.id === trackId);
                if (!track) return;
                setResult({
                  ...result,
                  clusters: result.clusters.map((c) => {
                    if (c.id === fromId) return { ...c, tracks: c.tracks.filter((t) => t.track.id !== trackId) };
                    if (c.id === toId) return { ...c, tracks: [...c.tracks, { ...track, clusterId: toId }] };
                    return c;
                  }),
                });
              }}
            />
          )}
        </div>
      )}

      {showPush && result && (
        <PushDialog
          clusters={result.clusters}
          onClose={() => setShowPush(false)}
        />
      )}
    </main>
  );
}
