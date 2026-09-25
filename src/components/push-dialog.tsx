"use client";

import { useState } from "react";
import type { Cluster } from "@/lib/types";

interface PushResult {
  name: string;
  spotifyUrl: string;
  trackCount: number;
}

export function PushDialog({
  clusters,
  onClose,
}: {
  clusters: Cluster[];
  onClose: () => void;
}) {
  const [pushing, setPushing] = useState(false);
  const [results, setResults] = useState<PushResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handlePush = async () => {
    setPushing(true);
    setError(null);

    try {
      const { generateCoverArtCSS, renderCoverToBase64 } = await import("@/lib/cover-art");

      const playlists = await Promise.all(
        clusters
          .filter((c) => c.tracks.length > 0)
          .map(async (c) => {
            const { colors, angle } = generateCoverArtCSS(c.centroid);
            const coverImageBase64 = await renderCoverToBase64(colors, angle, c.name);
            return {
              name: c.name,
              trackUris: c.tracks.map((t) => `spotify:track:${t.track.id}`),
              coverImageBase64,
            };
          })
      );

      const res = await fetch("/api/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playlists }),
      });

      if (!res.ok) {
        setError("Failed to create playlists");
        return;
      }

      const data = await res.json();
      setResults(data.results);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setPushing(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 max-w-lg w-full mx-4">
        {!results ? (
          <>
            <h2 className="text-lg font-bold mb-4">Create Playlists on Spotify</h2>
            <div className="space-y-2 mb-6">
              {clusters
                .filter((c) => c.tracks.length > 0)
                .map((c) => (
                  <div key={c.id} className="flex justify-between text-sm">
                    <span>{c.name}</span>
                    <span className="text-zinc-400">{c.tracks.length} tracks</span>
                  </div>
                ))}
            </div>
            <div className="flex gap-3 justify-end">
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm rounded-lg border border-zinc-700 hover:bg-zinc-800 transition"
              >
                Cancel
              </button>
              <button
                onClick={handlePush}
                disabled={pushing}
                className="px-4 py-2 text-sm rounded-lg bg-green-600 hover:bg-green-500
                  disabled:bg-zinc-700 text-white transition"
              >
                {pushing ? "Creating..." : "Create Playlists"}
              </button>
            </div>
          </>
        ) : (
          <>
            <h2 className="text-lg font-bold mb-4">Playlists Created</h2>
            <div className="space-y-3 mb-6">
              {results.map((r) => (
                <div key={r.spotifyUrl} className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">{r.name}</p>
                    <p className="text-xs text-zinc-400">{r.trackCount} tracks</p>
                  </div>
                  <a
                    href={r.spotifyUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-green-500 hover:text-green-400 text-sm"
                  >
                    Open in Spotify →
                  </a>
                </div>
              ))}
            </div>
            <button
              onClick={onClose}
              className="w-full px-4 py-2 text-sm rounded-lg bg-zinc-800 hover:bg-zinc-700 transition"
            >
              Done
            </button>
          </>
        )}
        {error && <p className="text-red-400 text-sm mt-3">{error}</p>}
      </div>
    </div>
  );
}
