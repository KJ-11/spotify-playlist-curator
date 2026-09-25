"use client";

import { useState } from "react";
import { apiFetch, ClientApiError, toClientError } from "@/lib/client/api";
import { playlistColors, renderCoverBase64 } from "@/lib/client/cover";
import type { CuratedPlaylist, LibraryTrack } from "@/lib/types";
import { usePersistentState } from "./use-persistent-state";

export type PushState =
  | { state: "pending" }
  | { state: "done"; url: string; coverUploaded: boolean }
  | { state: "failed"; message: string };

interface PushResponse {
  spotifyUrl: string;
  coverUploaded: boolean;
}

/**
 * Creates playlists on Spotify one at a time. Completed playlists are persisted so a
 * reload or retry never creates duplicates.
 */
export function usePushPlaylists(storageKey: string) {
  const [saved, setSaved] = usePersistentState<Record<string, PushState>>(storageKey, {});
  const [pending, setPending] = useState<Record<string, PushState>>({});
  const [pushing, setPushing] = useState(false);
  const [fatalError, setFatalError] = useState<ClientApiError | null>(null);

  const states = { ...saved, ...pending };
  const setState = (id: string, s: PushState) => {
    if (s.state === "done") {
      setSaved((prev) => ({ ...prev, [id]: s }));
      setPending((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    } else {
      setPending((prev) => ({ ...prev, [id]: s }));
    }
  };

  const push = async (items: { playlist: CuratedPlaylist; tracks: LibraryTrack[] }[]) => {
    setPushing(true);
    setFatalError(null);
    for (const { playlist, tracks } of items) {
      setState(playlist.id, { state: "pending" });
      try {
        const res = await apiFetch<PushResponse>("/api/push", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: playlist.name,
            description: playlist.description,
            trackUris: tracks.map((t) => t.uri),
            coverImageBase64: renderCoverBase64(playlist.name, playlistColors(playlist.id, tracks)),
          }),
        });
        setState(playlist.id, { state: "done", url: res.spotifyUrl, coverUploaded: res.coverUploaded });
      } catch (error) {
        const err = toClientError(error);
        setState(playlist.id, { state: "failed", message: err.message });
        // Auth problems will fail every remaining playlist too: stop and surface them.
        if (err.code === "AUTH_EXPIRED" || err.code === "NOT_ALLOWLISTED") {
          setFatalError(err);
          break;
        }
      }
    }
    setPushing(false);
  };

  const reset = () => {
    setSaved({});
    setPending({});
    setFatalError(null);
  };

  return { states, pushing, fatalError, push, reset };
}
