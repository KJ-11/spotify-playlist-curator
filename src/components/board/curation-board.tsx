"use client";

import type { ReactNode } from "react";
import { UNSORTED_ID, type CurationBoard as Board } from "@/hooks/use-curation-board";
import { gradientCss, playlistColors } from "@/lib/client/cover";
import type { CuratedPlaylist, LibraryTrack } from "@/lib/types";
import { PlaylistCard } from "./playlist-card";
import { TrackRow } from "./track-row";

/** The editable result view shared by the Spotify and upload flows. */
export function CurationBoard({
  board,
  renderAction,
  isLocked = () => false,
}: {
  board: Board;
  renderAction?: (playlist: CuratedPlaylist, tracks: LibraryTrack[]) => ReactNode;
  isLocked?: (playlistId: string) => boolean;
}) {
  const { curation, tracks } = board;
  if (!curation) return null;

  const playlistTargets = curation.playlists.map((p) => ({ id: p.id, name: p.name || "Untitled" }));

  return (
    <>
      <p className="mb-6 text-sm text-zinc-400">
        {tracks?.length ?? 0} tracks → {curation.playlists.length} playlists
        {curation.unsorted.length > 0 && ` · ${curation.unsorted.length} unsorted`}. Rename anything, move
        tracks with ⋯, untick what you don&apos;t want.
      </p>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {curation.playlists.map((p) => {
          const pTracks = board.tracksFor(p.trackIds);
          return (
            <PlaylistCard
              key={p.id}
              name={p.name}
              description={p.description}
              tracks={pTracks}
              gradient={gradientCss(playlistColors(p.name, pTracks))}
              selected={!board.isSkipped(p.id)}
              locked={isLocked(p.id)}
              action={renderAction?.(p, pTracks)}
              targets={[
                ...playlistTargets.filter((t) => t.id !== p.id),
                { id: UNSORTED_ID, name: "Unsorted" },
              ]}
              onRename={(name) => board.rename(p.id, name)}
              onToggleSelected={() => board.toggleSkipped(p.id)}
              onMoveTrack={board.moveTrack}
            />
          );
        })}
      </div>

      {curation.unsorted.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-1 font-semibold">Unsorted</h2>
          <p className="mb-3 text-sm text-zinc-500">
            Didn&apos;t fit any playlist convincingly. Move any you want to keep; the rest are left out.
          </p>
          <ul className="grid grid-cols-1 gap-x-4 md:grid-cols-2 xl:grid-cols-3">
            {board.tracksFor(curation.unsorted).map((t) => (
              <TrackRow
                key={t.id}
                track={t}
                targets={playlistTargets}
                onMove={(toId) => board.moveTrack(t.id, toId)}
              />
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
