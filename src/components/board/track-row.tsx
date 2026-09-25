"use client";

import type { LibraryTrack } from "@/lib/types";
import { PreviewButton } from "./preview-button";
import { TrackArtwork } from "./track-artwork";

export interface MoveTarget {
  id: string;
  name: string;
}

export function TrackRow({
  track,
  targets,
  onMove,
  disabled = false,
}: {
  track: LibraryTrack;
  targets: MoveTarget[];
  onMove: (toId: string) => void;
  disabled?: boolean;
}) {
  const meta = [track.artists.join(", "), track.year, track.playCount && `${track.playCount} ${track.playCount === 1 ? "play" : "plays"}`]
    .filter(Boolean)
    .join(" · ");

  return (
    <li className="group flex items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-zinc-800/60">
      <TrackArtwork trackId={track.id} imageUrl={track.imageUrl} />
      <div className="min-w-0 flex-1">
        <a
          href={track.spotifyUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="block truncate text-sm font-medium hover:underline"
        >
          {track.name}
        </a>
        <p className="truncate text-xs text-zinc-400">{meta}</p>
      </div>
      <PreviewButton track={track} />
      {!disabled && (
        <select
          aria-label={`Move ${track.name}`}
          title="Move to…"
          value=""
          onChange={(e) => e.target.value && onMove(e.target.value)}
          className="w-8 shrink-0 cursor-pointer appearance-none rounded bg-transparent text-center text-zinc-500 opacity-60 hover:text-zinc-200 focus:opacity-100 group-hover:opacity-100"
        >
          <option value="">⋯</option>
          {targets.map((t) => (
            <option key={t.id} value={t.id}>
              Move to {t.name}
            </option>
          ))}
        </select>
      )}
    </li>
  );
}
