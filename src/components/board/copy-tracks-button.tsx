"use client";

import { useState } from "react";
import type { LibraryTrack } from "@/lib/types";

/**
 * Copies track links, one per line. Pasting them into a playlist in the Spotify desktop
 * app adds every track, so the upload flow needs no Spotify API access to "export".
 */
export function CopyTracksButton({ tracks }: { tracks: LibraryTrack[] }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(tracks.map((t) => t.spotifyUrl).join("\n"));
      setState("copied");
      setTimeout(() => setState("idle"), 2500);
    } catch {
      setState("failed");
    }
  };

  return (
    <button
      onClick={copy}
      disabled={tracks.length === 0}
      className="rounded-full bg-black/40 px-3 py-1 text-xs font-medium text-white hover:bg-black/60 disabled:opacity-50"
    >
      {state === "copied" ? "Copied ✓" : state === "failed" ? "Copy failed" : `Copy ${tracks.length} tracks`}
    </button>
  );
}
