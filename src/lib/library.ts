import { spotifyJson } from "./spotify-client";
import { fetchAudioFeatures } from "./reccobeats";
import type { LibraryTrack, TrackSource } from "./library-types";

// Shape of the track object as Spotify returns it today (Feb 2026 dev-mode field set).
export interface RawSpotifyTrack {
  id: string | null;
  uri: string;
  name: string;
  is_local?: boolean;
  type?: string;
  artists: { id: string | null; name: string }[];
  album: {
    name: string;
    release_date?: string;
    images: { url: string; width: number | null; height: number | null }[];
  };
  external_ids?: { isrc?: string };
  external_urls: { spotify: string };
}

interface Paged<T> {
  items: T[];
  next: string | null;
}

const SAVED_TRACKS_CAP = 500;

async function fetchAllPages<T>(firstUrl: string, accessToken: string, cap = Infinity): Promise<T[]> {
  const items: T[] = [];
  let url: string | null = firstUrl;
  while (url && items.length < cap) {
    const page: Paged<T> = await spotifyJson<Paged<T>>(url, accessToken);
    items.push(...page.items);
    url = page.next;
  }
  return items.slice(0, cap);
}

async function fetchSources(accessToken: string): Promise<[TrackSource, RawSpotifyTrack | null][]> {
  const topRange = (range: string, source: TrackSource) =>
    fetchAllPages<RawSpotifyTrack>(`/me/top/tracks?time_range=${range}&limit=50`, accessToken).then(
      (tracks) => tracks.map((t) => [source, t] as [TrackSource, RawSpotifyTrack])
    );

  const results = await Promise.all([
    // Spotify only exposes the last 50 plays, so one page is all there is.
    spotifyJson<{ items: { track: RawSpotifyTrack | null }[] }>(
      "/me/player/recently-played?limit=50",
      accessToken
    ).then((d) => d.items.map((i) => ["recent", i.track] as [TrackSource, RawSpotifyTrack | null])),
    topRange("short_term", "top_short"),
    topRange("medium_term", "top_medium"),
    topRange("long_term", "top_long"),
    fetchAllPages<{ track: RawSpotifyTrack | null }>("/me/tracks?limit=50", accessToken, SAVED_TRACKS_CAP).then(
      (items) => items.map((i) => ["saved", i.track] as [TrackSource, RawSpotifyTrack | null])
    ),
  ]);
  return results.flat();
}

function isUsable(t: RawSpotifyTrack | null): t is RawSpotifyTrack & { id: string } {
  return !!t && !!t.id && !t.is_local && (t.type === undefined || t.type === "track");
}

export function toLibraryTrack(t: RawSpotifyTrack & { id: string }): LibraryTrack {
  const images = t.album.images ?? [];
  // Images are sorted largest-first; pick the smallest that's still >= 64px for list rows.
  const image = [...images].reverse().find((i) => (i.width ?? 0) >= 64) ?? images[0];
  const year = parseInt(t.album.release_date?.slice(0, 4) ?? "", 10);
  return {
    id: t.id,
    uri: t.uri,
    name: t.name,
    artists: t.artists.map((a) => a.name),
    album: t.album.name,
    imageUrl: image?.url ?? null,
    year: Number.isFinite(year) ? year : null,
    isrc: t.external_ids?.isrc ?? null,
    spotifyUrl: t.external_urls.spotify,
    sources: [],
    features: null,
  };
}

export function mergeSources(entries: [TrackSource, RawSpotifyTrack | null][]): LibraryTrack[] {
  const byId = new Map<string, LibraryTrack>();
  for (const [source, raw] of entries) {
    if (!isUsable(raw)) continue;
    const track = byId.get(raw.id) ?? toLibraryTrack(raw);
    if (!track.sources.includes(source)) track.sources.push(source);
    byId.set(raw.id, track);
  }
  return [...byId.values()];
}

export async function fetchLibrary(accessToken: string): Promise<LibraryTrack[]> {
  const tracks = mergeSources(await fetchSources(accessToken));
  const features = await fetchAudioFeatures(tracks.map((t) => t.id));
  for (const t of tracks) t.features = features.get(t.id) ?? null;
  return tracks;
}
