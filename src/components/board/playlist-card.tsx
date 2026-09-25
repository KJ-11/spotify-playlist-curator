"use client";

import { useState, type ReactNode } from "react";
import type { LibraryTrack } from "@/lib/types";
import { TrackRow, type MoveTarget } from "./track-row";

const COLLAPSED_COUNT = 6;

export function PlaylistCard({
  name,
  description,
  tracks,
  gradient,
  selected,
  locked,
  action,
  targets,
  onRename,
  onToggleSelected,
  onMoveTrack,
}: {
  name: string;
  description: string;
  tracks: LibraryTrack[];
  gradient: string;
  selected: boolean;
  /** Freezes edits, e.g. once the playlist exists on Spotify. */
  locked: boolean;
  /** Flow-specific control in the card header (push status, copy button, …). */
  action?: ReactNode;
  targets: MoveTarget[];
  onRename: (name: string) => void;
  onToggleSelected: () => void;
  onMoveTrack: (trackId: string, toId: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? tracks : tracks.slice(0, COLLAPSED_COUNT);

  return (
    <section
      className={`flex flex-col overflow-hidden rounded-2xl border bg-zinc-900 transition ${
        selected ? "border-zinc-700" : "border-zinc-900 opacity-60"
      }`}
    >
      <div className="flex h-32 flex-col justify-between p-4" style={{ background: gradient }}>
        <div className="flex items-center justify-between gap-2">
          <label className="flex cursor-pointer items-center gap-2 rounded-full bg-black/30 px-3 py-1 text-xs text-white">
            <input
              type="checkbox"
              checked={selected}
              onChange={onToggleSelected}
              disabled={locked}
              className="accent-green-500"
            />
            {selected ? "Included" : "Skipped"}
          </label>
          {action}
        </div>
        <input
          value={name}
          onChange={(e) => onRename(e.target.value)}
          disabled={locked}
          aria-label="Playlist name"
          className="w-full rounded bg-transparent text-xl font-bold text-white drop-shadow outline-none focus:bg-black/20 focus:px-1"
        />
      </div>

      <div className="flex flex-1 flex-col p-3">
        <p className="px-2 text-sm text-zinc-400">{description}</p>
        <p className="mt-1 px-2 text-xs text-zinc-500">{tracks.length} tracks</p>
        <ul className="mt-2 flex flex-col">
          {visible.map((t) => (
            <TrackRow
              key={t.id}
              track={t}
              targets={targets}
              disabled={locked}
              onMove={(toId) => onMoveTrack(t.id, toId)}
            />
          ))}
        </ul>
        {tracks.length > COLLAPSED_COUNT && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="mt-1 self-start px-2 py-1 text-xs text-zinc-400 hover:text-zinc-100"
          >
            {expanded ? "Show less" : `Show all ${tracks.length}`}
          </button>
        )}
      </div>
    </section>
  );
}
