"use client";

import { useRef, useState } from "react";

export function TrackPreview({
  previewUrl,
  spotifyUrl,
}: {
  previewUrl: string | null;
  spotifyUrl: string;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);

  if (!previewUrl) {
    return (
      <a
        href={spotifyUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="text-green-500 hover:text-green-400 text-xs"
      >
        Open in Spotify
      </a>
    );
  }

  const toggle = () => {
    if (!audioRef.current) return;
    if (playing) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
    setPlaying(!playing);
  };

  return (
    <>
      <audio
        ref={audioRef}
        src={previewUrl}
        onEnded={() => setPlaying(false)}
      />
      <button
        onClick={toggle}
        className="w-8 h-8 flex items-center justify-center rounded-full bg-zinc-700 hover:bg-zinc-600 transition"
      >
        {playing ? "⏸" : "▶"}
      </button>
    </>
  );
}
