"use client";

import { useState } from "react";
import type { LibraryTrack } from "@/lib/library-types";
import { PlaylistTrackRow, type MoveTarget } from "./playlist-track-row";

const COLLAPSED_COUNT = 6;

export type PushState =
  | { state: "pending" }
  | { state: "done"; url: string; coverUploaded: boolean }
  | { state: "failed"; message: string };

export function PlaylistCard({
  name,
  description,
  tracks,
  gradient,
  selected,
  push,
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
  push?: PushState;
  targets: MoveTarget[];
  onRename: (name: string) => void;
  onToggleSelected: () => void;
  onMoveTrack: (trackId: string, toId: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? tracks : tracks.slice(0, COLLAPSED_COUNT);
  const locked = push?.state === "done" || push?.state === "pending";

  return (
    <section
      className={`flex flex-col overflow-hidden rounded-2xl border bg-zinc-900 transition ${
        selected ? "border-zinc-700" : "border-zinc-900 opacity-60"
      }`}
    >
      <div className="flex h-32 flex-col justify-between p-4" style={{ background: gradient }}>
        <div className="flex items-center justify-between">
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
          {push && <PushBadge push={push} />}
        </div>
        <input
          value={name}
          onChange={(e) => onRename(e.target.value)}
          disabled={locked}
          aria-label="Playlist name"
          className="w-full rounded bg-transparent text-xl font-bold text-white drop-shadow outline-none placeholder:text-white/60 focus:bg-black/20 focus:px-1"
        />
      </div>

      <div className="flex flex-1 flex-col p-3">
        <p className="px-2 text-sm text-zinc-400">{description}</p>
        <p className="mt-1 px-2 text-xs text-zinc-500">{tracks.length} tracks</p>
        <ul className="mt-2 flex flex-col">
          {visible.map((t) => (
            <PlaylistTrackRow
              key={t.id}
              track={t}
              targets={targets}
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

function PushBadge({ push }: { push: PushState }) {
  if (push.state === "pending") {
    return <span className="rounded-full bg-black/40 px-3 py-1 text-xs text-white">Creating…</span>;
  }
  if (push.state === "failed") {
    return (
      <span title={push.message} className="rounded-full bg-red-600/80 px-3 py-1 text-xs text-white">
        Failed
      </span>
    );
  }
  return (
    <a
      href={push.url}
      target="_blank"
      rel="noopener noreferrer"
      className="rounded-full bg-green-500 px-3 py-1 text-xs font-medium text-black hover:bg-green-400"
    >
      Open in Spotify ↗
    </a>
  );
}
