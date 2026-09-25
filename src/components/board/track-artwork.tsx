"use client";

import { useEffect, useState } from "react";

// Session-wide cache so re-renders and moves between playlists don't refetch.
const thumbnailCache = new Map<string, Promise<string | null>>();

function fetchThumbnail(trackId: string): Promise<string | null> {
  let pending = thumbnailCache.get(trackId);
  if (!pending) {
    // Spotify's public oEmbed endpoint needs no auth and allows cross-origin requests.
    pending = fetch(`https://open.spotify.com/oembed?url=https://open.spotify.com/track/${trackId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { thumbnail_url?: string } | null) => d?.thumbnail_url ?? null)
      .catch(() => null);
    thumbnailCache.set(trackId, pending);
  }
  return pending;
}

/** Album art for a track row; looks it up lazily when the track came from a data export. */
export function TrackArtwork({ trackId, imageUrl }: { trackId: string; imageUrl: string | null }) {
  const [src, setSrc] = useState(imageUrl);

  useEffect(() => {
    if (imageUrl) return setSrc(imageUrl);
    let cancelled = false;
    fetchThumbnail(trackId).then((url) => !cancelled && setSrc(url));
    return () => {
      cancelled = true;
    };
  }, [trackId, imageUrl]);

  if (!src) return <div className="h-10 w-10 shrink-0 rounded bg-zinc-800" />;
  // eslint-disable-next-line @next/next/no-img-element -- remote Spotify CDN art, no optimisation needed
  return <img src={src} alt="" className="h-10 w-10 shrink-0 rounded object-cover" loading="lazy" />;
}
