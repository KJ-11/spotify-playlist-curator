"use client";

import { useState } from "react";
import { CopyTracksButton } from "@/components/board/copy-tracks-button";
import { CurationBoard } from "@/components/board/curation-board";
import { SiteHeader } from "@/components/ui/site-header";
import { ActionBar } from "@/components/ui/action-bar";
import { ErrorCard } from "@/components/ui/error-card";
import { ProgressSteps, type Step } from "@/components/ui/progress-steps";
import { ExportDropzone } from "@/components/upload/export-dropzone";
import { useCurationBoard } from "@/hooks/use-curation-board";
import { apiFetch, ClientApiError, toClientError } from "@/lib/client/api";
import { buildLibraryFromExport, ExportParseError, readExportFiles } from "@/lib/client/spotify-export";
import {
  MAX_TRACKS_FOR_CURATION,
  MIN_TRACKS_FOR_CURATION,
  type AudioFeatures,
  type Curation,
  type LibraryTrack,
} from "@/lib/types";

type Phase =
  | { kind: "idle" }
  | { kind: "reading" }
  | { kind: "enriching"; trackCount: number; totalPlays: number }
  | { kind: "curating"; trackCount: number; featureCount: number }
  | { kind: "error"; error: ClientApiError };

/** Public flow: a Spotify data export in, copy-pasteable playlists out. No Spotify login. */
export default function UploadPage() {
  const board = useCurationBoard("curator:upload:v1");
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });

  const curate = async (library: LibraryTrack[]) => {
    setPhase({ kind: "curating", trackCount: library.length, featureCount: library.filter((t) => t.features).length });
    const curation = await apiFetch<Curation>("/api/curate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tracks: library }),
    });
    board.setCuration(curation);
    setPhase({ kind: "idle" });
  };

  const handleFiles = async (files: File[]) => {
    try {
      setPhase({ kind: "reading" });
      const summary = buildLibraryFromExport(await readExportFiles(files));
      if (summary.tracks.length < MIN_TRACKS_FOR_CURATION) {
        throw new ClientApiError(
          "EMPTY_LIBRARY",
          `Your export has ${summary.tracks.length} usable tracks; we need at least ${MIN_TRACKS_FOR_CURATION} to make playlists.`
        );
      }
      // The export is already ranked by listening time; send the top slice.
      const library = summary.tracks.slice(0, MAX_TRACKS_FOR_CURATION);

      setPhase({ kind: "enriching", trackCount: library.length, totalPlays: summary.totalPlays });
      const { features } = await apiFetch<{ features: Record<string, AudioFeatures> }>("/api/enrich", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: library.map((t) => t.id) }),
      });
      const enriched = library.map((t) => ({ ...t, features: features[t.id] ?? null }));
      board.setTracks(enriched);
      await curate(enriched);
    } catch (error) {
      const err =
        error instanceof ExportParseError ? new ClientApiError("BAD_REQUEST", error.message) : toClientError(error);
      setPhase({ kind: "error", error: err });
    }
  };

  const retry = () => {
    if (board.tracks) curate(board.tracks).catch((e) => setPhase({ kind: "error", error: toClientError(e) }));
    else setPhase({ kind: "idle" });
  };

  const startOver = () => {
    board.reset();
    setPhase({ kind: "idle" });
  };

  if (!board.hydrated) return null;
  const ready = phase.kind === "idle" && board.curation;
  const selected = (board.curation?.playlists ?? []).filter((p) => !board.isSkipped(p.id) && p.trackIds.length);

  return (
    <main className="mx-auto min-h-screen max-w-7xl px-4 pb-32 pt-6 sm:px-8">
      <SiteHeader>
        {(ready || phase.kind === "error") && (
          <button onClick={startOver} className="hover:text-zinc-100">
            Start over
          </button>
        )}
      </SiteHeader>

      {phase.kind === "idle" && !board.curation && <UploadIntro onFiles={handleFiles} />}

      {(phase.kind === "reading" || phase.kind === "enriching" || phase.kind === "curating") && (
        <ProgressSteps steps={uploadSteps(phase)} />
      )}

      {phase.kind === "error" && <ErrorCard error={phase.error} onRetry={retry} />}

      {ready && (
        <>
          <CurationBoard board={board} renderAction={(_, tracks) => <CopyTracksButton tracks={tracks} />} />
          <ActionBar
            message={
              <>
                To save a playlist: create an empty playlist in the <strong>Spotify desktop app</strong>, click
                into it, and paste (⌘V / Ctrl+V) the copied tracks.
              </>
            }
          >
            <span className="text-sm text-zinc-500">{selected.length} playlists ready</span>
          </ActionBar>
        </>
      )}
    </main>
  );
}

function UploadIntro({ onFiles }: { onFiles: (files: File[]) => void }) {
  return (
    <div className="mx-auto max-w-xl py-8">
      <h1 className="mb-3 text-3xl font-bold">Curate from your Spotify data</h1>
      <p className="mb-8 text-zinc-400">
        No Spotify login needed. Years of play history make for better playlists than recent plays alone.
      </p>
      <ExportDropzone onFiles={onFiles} />
      <p className="mt-3 text-xs text-zinc-500">
        Files are read in your browser. Only track ids, titles, artists and play counts are sent to the server.
      </p>

      <h2 className="mb-3 mt-10 font-semibold">Getting your data</h2>
      <ol className="list-decimal space-y-2 pl-5 text-sm text-zinc-400">
        <li>
          Open{" "}
          <a
            href="https://www.spotify.com/account/privacy/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-green-400 hover:underline"
          >
            Spotify → Account → Privacy
          </a>
          .
        </li>
        <li>
          Request <strong>Extended streaming history</strong> for the richest results (arrives within ~30 days), or{" "}
          <strong>Account data</strong> for a faster export (usually under a week).
        </li>
        <li>When Spotify emails you, download the .zip and drop it above as-is.</li>
      </ol>
    </div>
  );
}

function uploadSteps(phase: Extract<Phase, { kind: "reading" | "enriching" | "curating" }>): Step[] {
  const read: Step =
    phase.kind === "reading"
      ? { label: "Reading your export", state: "active" }
      : { label: "Read your export", state: "done" };
  const enrich: Step =
    phase.kind === "reading"
      ? { label: "Looking up audio features", state: "pending" }
      : phase.kind === "enriching"
        ? {
            label: "Looking up audio features",
            detail: `${phase.trackCount} tracks from ${phase.totalPlays.toLocaleString()} plays`,
            state: "active",
          }
        : { label: "Looked up audio features", detail: `Found for ${phase.featureCount} tracks`, state: "done" };
  const curate: Step =
    phase.kind === "curating"
      ? { label: "Curating playlists", detail: "This can take a minute or two", state: "active" }
      : { label: "Curating playlists", state: "pending" };
  return [read, enrich, curate];
}
