"use client";

import { useCallback, useMemo } from "react";
import type { Curation, LibraryTrack } from "@/lib/types";
import { usePersistentState } from "./use-persistent-state";

export const UNSORTED_ID = "unsorted";

interface BoardState {
  tracks: LibraryTrack[] | null;
  curation: Curation | null;
  skipped: string[];
}

const EMPTY: BoardState = { tracks: null, curation: null, skipped: [] };

/**
 * Owns a curation result and the user's edits to it (rename, move, skip), persisted per
 * flow so a reload doesn't cost another curation run.
 */
export function useCurationBoard(storageKey: string) {
  const [state, setState, { hydrated }] = usePersistentState<BoardState>(storageKey, EMPTY);

  const trackById = useMemo(() => new Map((state.tracks ?? []).map((t) => [t.id, t])), [state.tracks]);

  const tracksFor = useCallback(
    (ids: string[]) => ids.map((id) => trackById.get(id)).filter((t): t is LibraryTrack => !!t),
    [trackById]
  );

  const setTracks = useCallback(
    (tracks: LibraryTrack[]) => setState((s) => ({ ...s, tracks })),
    [setState]
  );

  const setCuration = useCallback(
    (curation: Curation) => setState((s) => ({ ...s, curation, skipped: [] })),
    [setState]
  );

  const reset = useCallback(() => setState(EMPTY), [setState]);

  const rename = useCallback(
    (playlistId: string, name: string) =>
      setState((s) =>
        s.curation
          ? {
              ...s,
              curation: {
                ...s.curation,
                playlists: s.curation.playlists.map((p) => (p.id === playlistId ? { ...p, name } : p)),
              },
            }
          : s
      ),
    [setState]
  );

  const moveTrack = useCallback(
    (trackId: string, toId: string) =>
      setState((s) => {
        if (!s.curation) return s;
        const playlists = s.curation.playlists.map((p) => {
          const rest = p.trackIds.filter((id) => id !== trackId);
          return { ...p, trackIds: p.id === toId ? [...rest, trackId] : rest };
        });
        const unsorted = s.curation.unsorted.filter((id) => id !== trackId);
        if (toId === UNSORTED_ID) unsorted.push(trackId);
        return { ...s, curation: { playlists, unsorted } };
      }),
    [setState]
  );

  const toggleSkipped = useCallback(
    (playlistId: string) =>
      setState((s) => ({
        ...s,
        skipped: s.skipped.includes(playlistId)
          ? s.skipped.filter((id) => id !== playlistId)
          : [...s.skipped, playlistId],
      })),
    [setState]
  );

  return {
    hydrated,
    tracks: state.tracks,
    curation: state.curation,
    isSkipped: (playlistId: string) => state.skipped.includes(playlistId),
    tracksFor,
    setTracks,
    setCuration,
    reset,
    rename,
    moveTrack,
    toggleSkipped,
  };
}

export type CurationBoard = ReturnType<typeof useCurationBoard>;
