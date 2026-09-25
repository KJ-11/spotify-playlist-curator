"use client";

import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ErrorCard } from "@/components/error-card";
import { PlaylistCard, type PushState } from "@/components/playlist-card";
import { PlaylistTrackRow } from "@/components/playlist-track-row";
import { ProgressSteps, type Step } from "@/components/progress-steps";
import { apiFetch, ClientApiError } from "@/lib/client-api";
import { gradientCss, playlistColors, renderCoverBase64 } from "@/lib/cover";
import type { Curation, LibraryTrack } from "@/lib/library-types";

const STORAGE_KEY = "curator:v1";
const UNSORTED = "unsorted";

type Phase =
  | { kind: "idle" }
  | { kind: "library" }
  | { kind: "curating"; trackCount: number; featureCount: number }
  | { kind: "ready" }
  | { kind: "error"; error: ClientApiError };

interface Saved {
  tracks: LibraryTrack[];
  curation: Curation;
  pushStates?: Record<string, PushState>;
}

function loadSaved(): Saved | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Saved) : null;
  } catch {
    return null;
  }
}

function save(data: Saved | null) {
  try {
    if (data) localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage full or blocked: the session still works, it just won't survive a reload.
  }
}

export default function CuratePage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [tracks, setTracks] = useState<LibraryTrack[] | null>(null);
  const [curation, setCuration] = useState<Curation | null>(null);
  const [skipped, setSkipped] = useState<Set<string>>(new Set());
  const [pushStates, setPushStates] = useState<Record<string, PushState>>({});
  const [pushing, setPushing] = useState(false);
  const [pushError, setPushError] = useState<ClientApiError | null>(null);

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/");
  }, [status, router]);

  useEffect(() => {
    const saved = loadSaved();
    if (saved) {
      setTracks(saved.tracks);
      setCuration(saved.curation);
      // A playlist that was mid-creation when the page closed may or may not exist; let the user retry.
      const restored = Object.fromEntries(
        Object.entries(saved.pushStates ?? {}).filter(([, s]) => s.state === "done")
      );
      setPushStates(restored);
      setPhase({ kind: "ready" });
    }
  }, []);

  useEffect(() => {
    if (tracks && curation) save({ tracks, curation, pushStates });
  }, [tracks, curation, pushStates]);

  const trackById = useMemo(() => new Map((tracks ?? []).map((t) => [t.id, t])), [tracks]);

  const curate = useCallback(async (library: LibraryTrack[]) => {
    setPhase({
      kind: "curating",
      trackCount: library.length,
      featureCount: library.filter((t) => t.features).length,
    });
    try {
      const result = await apiFetch<Curation>("/api/curate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tracks: library }),
      });
      setCuration(result);
      setSkipped(new Set());
      setPushStates({});
      setPhase({ kind: "ready" });
    } catch (error) {
      setPhase({ kind: "error", error: toClientError(error) });
    }
  }, []);

  const run = useCallback(async () => {
    // Reuse an already-fetched library when retrying a failed curation.
    if (tracks) return curate(tracks);
    setPhase({ kind: "library" });
    try {
      const { tracks: library } = await apiFetch<{ tracks: LibraryTrack[] }>("/api/library");
      setTracks(library);
      await curate(library);
    } catch (error) {
      setPhase({ kind: "error", error: toClientError(error) });
    }
  }, [tracks, curate]);

  const startOver = () => {
    save(null);
    setTracks(null);
    setCuration(null);
    setPushStates({});
    setPushError(null);
    setPhase({ kind: "idle" });
  };

  const rename = (id: string, name: string) =>
    setCuration((c) => c && { ...c, playlists: c.playlists.map((p) => (p.id === id ? { ...p, name } : p)) });

  const moveTrack = (trackId: string, toId: string) =>
    setCuration((c) => {
      if (!c) return c;
      const playlists = c.playlists.map((p) => ({
        ...p,
        trackIds: p.id === toId
          ? [...p.trackIds.filter((id) => id !== trackId), trackId]
          : p.trackIds.filter((id) => id !== trackId),
      }));
      const unsorted = c.unsorted.filter((id) => id !== trackId);
      if (toId === UNSORTED) unsorted.push(trackId);
      return { playlists, unsorted };
    });

  const toggleSkipped = (id: string) =>
    setSkipped((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toPush = (curation?.playlists ?? []).filter(
    (p) => !skipped.has(p.id) && p.trackIds.length > 0 && pushStates[p.id]?.state !== "done"
  );

  const pushAll = async () => {
    setPushing(true);
    setPushError(null);
    for (const p of toPush) {
      setPushStates((s) => ({ ...s, [p.id]: { state: "pending" } }));
      const pTracks = p.trackIds.map((id) => trackById.get(id)).filter((t): t is LibraryTrack => !!t);
      try {
        const res = await apiFetch<{ spotifyUrl: string; coverUploaded: boolean }>("/api/push", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: p.name,
            description: p.description,
            trackUris: pTracks.map((t) => t.uri),
            coverImageBase64: renderCoverBase64(p.name, playlistColors(p.name, pTracks)),
          }),
        });
        setPushStates((s) => ({
          ...s,
          [p.id]: { state: "done", url: res.spotifyUrl, coverUploaded: res.coverUploaded },
        }));
      } catch (error) {
        const err = toClientError(error);
        setPushStates((s) => ({ ...s, [p.id]: { state: "failed", message: err.message } }));
        // Auth problems will fail every remaining playlist too; stop and surface them.
        if (err.code === "AUTH_EXPIRED" || err.code === "NOT_ALLOWLISTED") {
          setPushError(err);
          break;
        }
      }
    }
    setPushing(false);
  };

  if (status !== "authenticated") return null;

  const pushedCount = Object.values(pushStates).filter((s) => s.state === "done").length;
  const failedCount = Object.values(pushStates).filter((s) => s.state === "failed").length;

  return (
    <main className="mx-auto min-h-screen max-w-7xl px-4 pb-32 pt-6 sm:px-8">
      <header className="mb-10 flex items-center justify-between">
        <h1 className="text-lg font-bold">Playlist Curator</h1>
        <div className="flex items-center gap-4 text-sm text-zinc-400">
          {phase.kind === "ready" && (
            <button onClick={startOver} className="hover:text-zinc-100">
              Start over
            </button>
          )}
          <span className="hidden sm:inline">{session.user?.name}</span>
          <button onClick={() => signOut({ callbackUrl: "/" })} className="hover:text-zinc-100">
            Sign out
          </button>
        </div>
      </header>

      {phase.kind === "idle" && (
        <div className="flex flex-col items-center gap-6 py-24 text-center">
          <p className="max-w-md text-zinc-400">
            We&apos;ll pull your recent plays, top tracks and liked songs, then sort them into playlists
            that actually hang together. Takes about a minute.
          </p>
          <button
            onClick={run}
            className="rounded-full bg-green-600 px-8 py-4 text-lg font-medium text-white transition hover:bg-green-500"
          >
            Curate my music
          </button>
        </div>
      )}

      {(phase.kind === "library" || phase.kind === "curating") && (
        <ProgressSteps steps={progressSteps(phase)} />
      )}

      {phase.kind === "error" && <ErrorCard error={phase.error} onRetry={run} />}

      {phase.kind === "ready" && curation && (
        <>
          <p className="mb-6 text-sm text-zinc-400">
            {tracks?.length ?? 0} tracks → {curation.playlists.length} playlists
            {curation.unsorted.length > 0 && ` · ${curation.unsorted.length} unsorted`}. Rename anything,
            move tracks with ⋯, untick what you don&apos;t want.
          </p>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {curation.playlists.map((p) => {
              const pTracks = p.trackIds.map((id) => trackById.get(id)).filter((t): t is LibraryTrack => !!t);
              return (
                <PlaylistCard
                  key={p.id}
                  name={p.name}
                  description={p.description}
                  tracks={pTracks}
                  gradient={gradientCss(playlistColors(p.name, pTracks))}
                  selected={!skipped.has(p.id)}
                  push={pushStates[p.id]}
                  targets={[
                    ...curation.playlists.filter((o) => o.id !== p.id).map((o) => ({ id: o.id, name: o.name })),
                    { id: UNSORTED, name: "Unsorted" },
                  ]}
                  onRename={(name) => rename(p.id, name)}
                  onToggleSelected={() => toggleSkipped(p.id)}
                  onMoveTrack={moveTrack}
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
                {curation.unsorted.map((id) => {
                  const t = trackById.get(id);
                  if (!t) return null;
                  return (
                    <PlaylistTrackRow
                      key={id}
                      track={t}
                      targets={curation.playlists.map((o) => ({ id: o.id, name: o.name }))}
                      onMove={(toId) => moveTrack(id, toId)}
                    />
                  );
                })}
              </ul>
            </section>
          )}

          <div className="fixed inset-x-0 bottom-0 border-t border-zinc-800 bg-zinc-950/95 backdrop-blur">
            <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-8">
              <p className="text-sm text-zinc-400">
                {pushError
                  ? pushError.message
                  : pushedCount > 0
                    ? `${pushedCount} created on Spotify${failedCount ? ` · ${failedCount} failed` : ""}`
                    : `${toPush.length} playlists will be created as private playlists.`}
              </p>
              <button
                onClick={pushAll}
                disabled={pushing || toPush.length === 0}
                className="rounded-full bg-green-600 px-6 py-2.5 text-sm font-medium text-white transition hover:bg-green-500 disabled:bg-zinc-800 disabled:text-zinc-500"
              >
                {pushing
                  ? "Creating…"
                  : toPush.length === 0
                    ? pushedCount > 0 ? "All done" : "Nothing selected"
                    : failedCount > 0 || pushedCount > 0
                      ? `Create remaining ${toPush.length}`
                      : `Create ${toPush.length} playlists on Spotify`}
              </button>
            </div>
          </div>
        </>
      )}
    </main>
  );
}

function toClientError(error: unknown): ClientApiError {
  return error instanceof ClientApiError
    ? error
    : new ClientApiError("INTERNAL", "Something went wrong. Try again.");
}

function progressSteps(phase: Extract<Phase, { kind: "library" | "curating" }>): Step[] {
  if (phase.kind === "library") {
    return [
      { label: "Pulling your library from Spotify", detail: "Recent plays, top tracks, liked songs", state: "active" },
      { label: "Curating playlists", state: "pending" },
    ];
  }
  return [
    {
      label: "Pulled your library",
      detail: `${phase.trackCount} tracks · audio features for ${phase.featureCount}`,
      state: "done",
    },
    { label: "Curating playlists", detail: "Listening closely — this can take a minute or two", state: "active" },
  ];
}
