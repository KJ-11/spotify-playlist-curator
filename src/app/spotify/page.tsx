"use client";

import { signOut, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { CurationBoard } from "@/components/board/curation-board";
import { SiteHeader } from "@/components/ui/site-header";
import { PushBadge } from "@/components/spotify/push-badge";
import { ActionBar } from "@/components/ui/action-bar";
import { ErrorCard } from "@/components/ui/error-card";
import { ProgressSteps } from "@/components/ui/progress-steps";
import { useCurationBoard } from "@/hooks/use-curation-board";
import { usePushPlaylists } from "@/hooks/use-push-playlists";
import { apiFetch, toClientError, type ClientApiError } from "@/lib/client/api";
import type { Curation, LibraryTrack } from "@/lib/types";

type Phase =
  | { kind: "idle" }
  | { kind: "library" }
  | { kind: "curating"; trackCount: number; featureCount: number }
  | { kind: "error"; error: ClientApiError };

/** Signed-in flow: Spotify library in, playlists created on the user's account out. */
export default function SpotifyPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const board = useCurationBoard("curator:spotify:v2");
  const push = usePushPlaylists("curator:spotify:push:v2");
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/");
  }, [status, router]);

  const curate = async (library: LibraryTrack[]) => {
    setPhase({
      kind: "curating",
      trackCount: library.length,
      featureCount: library.filter((t) => t.features).length,
    });
    try {
      const curation = await apiFetch<Curation>("/api/curate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tracks: library }),
      });
      push.reset();
      board.setCuration(curation);
      setPhase({ kind: "idle" });
    } catch (error) {
      setPhase({ kind: "error", error: toClientError(error) });
    }
  };

  const run = async () => {
    // Retrying a failed curation reuses the library already pulled.
    if (board.tracks) return curate(board.tracks);
    setPhase({ kind: "library" });
    try {
      const { tracks } = await apiFetch<{ tracks: LibraryTrack[] }>("/api/library");
      board.setTracks(tracks);
      await curate(tracks);
    } catch (error) {
      setPhase({ kind: "error", error: toClientError(error) });
    }
  };

  const startOver = () => {
    board.reset();
    push.reset();
    setPhase({ kind: "idle" });
  };

  if (status !== "authenticated" || !board.hydrated) return null;

  const ready = phase.kind === "idle" && board.curation;
  const isDone = (id: string) => push.states[id]?.state === "done";
  const toPush = (board.curation?.playlists ?? [])
    .filter((p) => !board.isSkipped(p.id) && p.trackIds.length > 0 && !isDone(p.id))
    .map((playlist) => ({ playlist, tracks: board.tracksFor(playlist.trackIds) }));
  const doneCount = Object.values(push.states).filter((s) => s.state === "done").length;
  const failedCount = Object.values(push.states).filter((s) => s.state === "failed").length;

  return (
    <main className="mx-auto min-h-screen max-w-7xl px-4 pb-32 pt-6 sm:px-8">
      <SiteHeader>
        {ready && (
          <button onClick={startOver} className="hover:text-zinc-100">
            Start over
          </button>
        )}
        <span className="hidden sm:inline">{session.user?.name}</span>
        <button onClick={() => signOut({ callbackUrl: "/" })} className="hover:text-zinc-100">
          Sign out
        </button>
      </SiteHeader>

      {phase.kind === "idle" && !board.curation && (
        <div className="flex flex-col items-center gap-6 py-24 text-center">
          <p className="max-w-md text-zinc-400">
            We&apos;ll pull your recent plays, top tracks and liked songs, then sort them into playlists that
            actually hang together. Takes a minute or two.
          </p>
          <button
            onClick={run}
            className="rounded-full bg-green-600 px-8 py-4 text-lg font-medium text-white transition hover:bg-green-500"
          >
            Curate my music
          </button>
        </div>
      )}

      {phase.kind === "library" && (
        <ProgressSteps
          steps={[
            { label: "Pulling your library from Spotify", detail: "Recent plays, top tracks, liked songs", state: "active" },
            { label: "Curating playlists", state: "pending" },
          ]}
        />
      )}

      {phase.kind === "curating" && (
        <ProgressSteps
          steps={[
            {
              label: "Pulled your library",
              detail: `${phase.trackCount} tracks · audio features for ${phase.featureCount}`,
              state: "done",
            },
            { label: "Curating playlists", detail: "This can take a minute or two", state: "active" },
          ]}
        />
      )}

      {phase.kind === "error" && <ErrorCard error={phase.error} onRetry={run} />}

      {ready && (
        <>
          <CurationBoard
            board={board}
            isLocked={(id) => isDone(id) || push.states[id]?.state === "pending"}
            renderAction={(p) => push.states[p.id] && <PushBadge push={push.states[p.id]} />}
          />
          <ActionBar
            message={
              push.fatalError
                ? push.fatalError.message
                : doneCount > 0
                  ? `${doneCount} created on Spotify${failedCount ? ` · ${failedCount} failed` : ""}`
                  : `${toPush.length} playlists will be created as private playlists.`
            }
          >
            <button
              onClick={() => push.push(toPush)}
              disabled={push.pushing || toPush.length === 0}
              className="rounded-full bg-green-600 px-6 py-2.5 text-sm font-medium text-white transition hover:bg-green-500 disabled:bg-zinc-800 disabled:text-zinc-500"
            >
              {push.pushing
                ? "Creating…"
                : toPush.length === 0
                  ? doneCount > 0
                    ? "All done"
                    : "Nothing selected"
                  : doneCount > 0 || failedCount > 0
                    ? `Create remaining ${toPush.length}`
                    : `Create ${toPush.length} playlists on Spotify`}
            </button>
          </ActionBar>
        </>
      )}
    </main>
  );
}
