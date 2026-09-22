"use client";

import { useState } from "react";
import type { Cluster } from "@/lib/types";
import { TrackRow } from "./track-row";

export function ClusterCard({
  cluster,
  onRename,
  onRemoveTrack,
  onDrop,
  onDragTrackStart,
  onRegenerateName,
  onMergeInto,
  regeneratingName = false,
}: {
  cluster: Cluster;
  onRename: (name: string) => void;
  onRemoveTrack: (trackId: string) => void;
  onDrop: (trackId: string, fromClusterId: string) => void;
  onDragTrackStart: (trackId: string, clusterId: string) => void;
  onRegenerateName: () => void;
  onMergeInto: (sourceClusterId: string) => void;
  regeneratingName?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(cluster.name);
  const [dragOver, setDragOver] = useState(false);

  const topArtists = (() => {
    const counts = new Map<string, number>();
    for (const t of cluster.tracks) {
      for (const a of t.track.artists) {
        counts.set(a.name, (counts.get(a.name) ?? 0) + 1);
      }
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([n]) => n);
  })();

  return (
    <div
      className={`rounded-xl border overflow-hidden transition ${
        dragOver ? "border-green-500" : "border-zinc-800"
      } bg-zinc-900`}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);

        const sourceClusterId = e.dataTransfer.getData("application/cluster-id");
        if (sourceClusterId) {
          if (sourceClusterId !== cluster.id) onMergeInto(sourceClusterId);
          return;
        }

        const data = e.dataTransfer.getData("text/plain");
        const [trackId, fromClusterId] = data.split("|");
        if (trackId && fromClusterId !== cluster.id) onDrop(trackId, fromClusterId);
      }}
    >
      <div
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData("application/cluster-id", cluster.id);
          e.dataTransfer.effectAllowed = "move";
        }}
        className="h-24 flex items-end p-4 cursor-grab"
        style={{ background: cluster.coverArtDataUrl }}
        title="Drag onto another cluster to merge"
      >
        {editing ? (
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => { onRename(name); setEditing(false); }}
            onKeyDown={(e) => { if (e.key === "Enter") { onRename(name); setEditing(false); } }}
            autoFocus
            className="bg-transparent text-white text-lg font-bold outline-none border-b border-white/50"
          />
        ) : (
          <h3
            className="text-white text-lg font-bold cursor-pointer drop-shadow-lg"
            onClick={() => setEditing(true)}
          >
            {cluster.name}
          </h3>
        )}
      </div>

      <div className="p-4">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs text-zinc-400">
            {cluster.tracks.length} tracks · {topArtists.join(", ")}
          </span>
          <div className="flex items-center gap-3">
            <button
              onClick={onRegenerateName}
              disabled={regeneratingName}
              className="text-xs text-zinc-500 hover:text-zinc-300 disabled:opacity-50"
            >
              {regeneratingName ? "Naming…" : "Regenerate name"}
            </button>
            <button
              onClick={() => setExpanded(!expanded)}
              className="text-xs text-zinc-500 hover:text-zinc-300"
            >
              {expanded ? "Collapse" : "Expand"}
            </button>
          </div>
        </div>

        {expanded && (
          <div className="flex flex-col max-h-80 overflow-y-auto">
            {cluster.tracks.map((track) => (
              <TrackRow
                key={track.track.id}
                track={track}
                onRemove={() => onRemoveTrack(track.track.id)}
                onDragStart={(e) => {
                  e.dataTransfer.setData("text/plain", `${track.track.id}|${cluster.id}`);
                  onDragTrackStart(track.track.id, cluster.id);
                }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
