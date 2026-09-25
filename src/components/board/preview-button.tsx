"use client";

import { useState, useSyncExternalStore } from "react";
import type { LibraryTrack } from "@/lib/types";

// One shared <audio> for the whole page so starting a preview stops the previous one.
let audio: HTMLAudioElement | null = null;
let playingId: string | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function stop() {
  audio?.pause();
  playingId = null;
  notify();
}

async function lookupPreview(track: LibraryTrack): Promise<string | null> {
  const params = new URLSearchParams({ artist: track.artists[0] ?? "", title: track.name });
  if (track.isrc) params.set("isrc", track.isrc);
  const res = await fetch(`/api/preview?${params}`).catch(() => null);
  if (!res?.ok) return null;
  const { url } = (await res.json()) as { url: string | null };
  return url;
}

export function PreviewButton({ track }: { track: LibraryTrack }) {
  const current = useSyncExternalStore(subscribe, () => playingId, () => null);
  const [state, setState] = useState<"idle" | "loading" | "unavailable">("idle");
  const isPlaying = current === track.id;

  if (state === "unavailable") {
    return (
      <a
        href={track.spotifyUrl}
        target="_blank"
        rel="noopener noreferrer"
        title="No preview available — open in Spotify"
        className="w-8 h-8 shrink-0 flex items-center justify-center rounded-full text-zinc-500 hover:text-green-400 text-xs"
      >
        ↗
      </a>
    );
  }

  const toggle = async () => {
    if (isPlaying) return stop();
    setState("loading");
    const url = await lookupPreview(track);
    if (!url) return setState("unavailable");
    if (!audio) {
      audio = new Audio();
      audio.addEventListener("ended", stop);
    }
    audio.src = url;
    playingId = track.id;
    notify();
    try {
      await audio.play();
      setState("idle");
    } catch {
      stop();
      setState("unavailable");
    }
  };

  return (
    <button
      onClick={toggle}
      aria-label={isPlaying ? `Pause ${track.name}` : `Play preview of ${track.name}`}
      className={`w-8 h-8 shrink-0 flex items-center justify-center rounded-full text-xs transition ${
        isPlaying ? "bg-green-500 text-black" : "bg-zinc-800 text-zinc-200 hover:bg-zinc-700"
      }`}
    >
      {state === "loading" ? (
        <span className="w-3 h-3 border-2 border-zinc-500 border-t-zinc-100 rounded-full animate-spin" />
      ) : isPlaying ? (
        "❚❚"
      ) : (
        "▶"
      )}
    </button>
  );
}
