"use client";

import type { LibraryTrack } from "@/lib/library-types";
import { PreviewButton } from "./preview-button";

export interface MoveTarget {
  id: string;
  name: string;
}

export function PlaylistTrackRow({
  track,
  targets,
  onMove,
}: {
  track: LibraryTrack;
  targets: MoveTarget[];
  onMove: (toId: string) => void;
}) {
  return (
    <li className="group flex items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-zinc-800/60">
      {track.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={track.imageUrl} alt="" className="h-10 w-10 shrink-0 rounded" loading="lazy" />
      ) : (
        <div className="h-10 w-10 shrink-0 rounded bg-zinc-800" />
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{track.name}</p>
        <p className="truncate text-xs text-zinc-400">
          {track.artists.join(", ")}
          {track.year ? ` · ${track.year}` : ""}
        </p>
      </div>
      <PreviewButton track={track} />
      <select
        aria-label={`Move ${track.name}`}
        value=""
        onChange={(e) => e.target.value && onMove(e.target.value)}
        className="w-8 shrink-0 cursor-pointer appearance-none rounded bg-transparent text-center text-zinc-500 opacity-60 hover:text-zinc-200 group-hover:opacity-100 focus:opacity-100"
        title="Move to…"
      >
        <option value="">⋯</option>
        {targets.map((t) => (
          <option key={t.id} value={t.id}>
            Move to {t.name}
          </option>
        ))}
      </select>
    </li>
  );
}
