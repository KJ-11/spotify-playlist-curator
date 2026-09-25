import type { SpotifyTrack, AudioFeatures, TrackWithFeatures } from "./types";

const SPOTIFY_API = "https://api.spotify.com/v1";

async function spotifyFetch(url: string, accessToken: string, retries = 3): Promise<Response> {
  for (let attempt = 0; attempt < retries; attempt++) {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (res.status === 429) {
      const retryAfter = parseInt(res.headers.get("Retry-After") ?? "1", 10);
      await new Promise((r) => setTimeout(r, retryAfter * 1000));
      continue;
    }
    if (!res.ok) {
      throw new Error(`Spotify API request failed with status ${res.status}: ${url}`);
    }
    return res;
  }
  throw new Error(`Spotify API failed after ${retries} retries: ${url}`);
}

export function deduplicateTracks(tracks: SpotifyTrack[]): SpotifyTrack[] {
  const seen = new Set<string>();
  return tracks.filter((t) => {
    if (seen.has(t.id)) return false;
    seen.add(t.id);
    return true;
  });
}

function chunk<T>(items: T[], size: number): T[][] {
  const batches: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    batches.push(items.slice(i, i + size));
  }
  return batches;
}

export function buildAudioFeatureBatches(ids: string[]): string[][] {
  return chunk(ids, 100);
}

// Spotify's /v1/artists endpoint allows a maximum of 50 IDs per request
// (unlike /v1/audio-features, which allows 100), so it needs its own batch size.
function buildArtistBatches(ids: string[]): string[][] {
  return chunk(ids, 50);
}

async function fetchRecentlyPlayed(accessToken: string): Promise<SpotifyTrack[]> {
  const tracks: SpotifyTrack[] = [];
  let url: string | null = `${SPOTIFY_API}/me/player/recently-played?limit=50`;
  while (url) {
    const res = await spotifyFetch(url, accessToken);
    const data = await res.json();
    tracks.push(...data.items.map((item: { track: SpotifyTrack }) => item.track));
    url = data.cursors?.before
      ? `${SPOTIFY_API}/me/player/recently-played?limit=50&before=${data.cursors.before}`
      : null;
  }
  return tracks;
}

async function fetchTopTracks(accessToken: string): Promise<SpotifyTrack[]> {
  const ranges = ["short_term", "medium_term", "long_term"] as const;
  const results = await Promise.all(
    ranges.map(async (range) => {
      const tracks: SpotifyTrack[] = [];
      let url: string | null = `${SPOTIFY_API}/me/top/tracks?time_range=${range}&limit=50`;
      while (url) {
        const res = await spotifyFetch(url, accessToken);
        const data = await res.json();
        tracks.push(...data.items);
        url = data.next;
      }
      return tracks;
    })
  );
  return results.flat();
}

async function fetchSavedTracks(accessToken: string, maxTracks = 500): Promise<SpotifyTrack[]> {
  const tracks: SpotifyTrack[] = [];
  let url: string | null = `${SPOTIFY_API}/me/tracks?limit=50`;
  while (url && tracks.length < maxTracks) {
    const res = await spotifyFetch(url, accessToken);
    const data = await res.json();
    tracks.push(...data.items.map((item: { track: SpotifyTrack }) => item.track));
    url = data.next;
  }
  return tracks.slice(0, maxTracks);
}

async function fetchAudioFeatures(
  ids: string[],
  accessToken: string
): Promise<Map<string, AudioFeatures>> {
  const map = new Map<string, AudioFeatures>();
  const batches = buildAudioFeatureBatches(ids);
  for (const batch of batches) {
    const res = await spotifyFetch(
      `${SPOTIFY_API}/audio-features?ids=${batch.join(",")}`,
      accessToken
    );
    const data = await res.json();
    for (const af of data.audio_features) {
      if (af) map.set(af.id, af);
    }
  }
  return map;
}

async function fetchArtistGenres(
  artistIds: string[],
  accessToken: string
): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  const batches = buildArtistBatches(artistIds);
  for (const batch of batches) {
    const res = await spotifyFetch(
      `${SPOTIFY_API}/artists?ids=${batch.join(",")}`,
      accessToken
    );
    const data = await res.json();
    for (const artist of data.artists) {
      if (artist) map.set(artist.id, artist.genres ?? []);
    }
  }
  return map;
}

export async function fetchAllTracks(accessToken: string): Promise<TrackWithFeatures[]> {
  const [recent, top, saved] = await Promise.all([
    fetchRecentlyPlayed(accessToken),
    fetchTopTracks(accessToken),
    fetchSavedTracks(accessToken),
  ]);
  const allTracks = deduplicateTracks([...recent, ...top, ...saved]);
  const audioFeaturesMap = await fetchAudioFeatures(
    allTracks.map((t) => t.id),
    accessToken
  );
  const artistIds = [...new Set(allTracks.flatMap((t) => t.artists.map((a) => a.id)))];
  const genreMap = await fetchArtistGenres(artistIds, accessToken);

  return allTracks
    .filter((t) => audioFeaturesMap.has(t.id))
    .map((track) => ({
      track,
      audioFeatures: audioFeaturesMap.get(track.id)!,
      genres: [...new Set(track.artists.flatMap((a) => genreMap.get(a.id) ?? []))],
    }));
}
