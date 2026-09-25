import type { AudioFeatures } from "./library-types";

// ReccoBeats serves Spotify-compatible audio features keyed by Spotify track id.
// It's a free third-party API, so everything here is best-effort: failures
// leave tracks without features instead of failing the pipeline.
const RECCOBEATS_API = "https://api.reccobeats.com/v1/audio-features";
const BATCH_SIZE = 40; // API rejects more than 40 ids per request
const CONCURRENCY = 4;

interface ReccoBeatsFeatures extends AudioFeatures {
  href: string;
}

function spotifyIdFromHref(href: string): string | null {
  return href.match(/track\/([A-Za-z0-9]+)/)?.[1] ?? null;
}

async function fetchBatch(ids: string[]): Promise<ReccoBeatsFeatures[]> {
  try {
    const res = await fetch(`${RECCOBEATS_API}?ids=${ids.join(",")}`, {
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      console.warn(`ReccoBeats returned ${res.status} for a batch of ${ids.length}`);
      return [];
    }
    const data = (await res.json()) as { content?: ReccoBeatsFeatures[] };
    return data.content ?? [];
  } catch (error) {
    console.warn("ReccoBeats batch failed:", error);
    return [];
  }
}

export async function fetchAudioFeatures(ids: string[]): Promise<Map<string, AudioFeatures>> {
  const batches: string[][] = [];
  for (let i = 0; i < ids.length; i += BATCH_SIZE) batches.push(ids.slice(i, i + BATCH_SIZE));

  const map = new Map<string, AudioFeatures>();
  for (let i = 0; i < batches.length; i += CONCURRENCY) {
    const results = await Promise.all(batches.slice(i, i + CONCURRENCY).map(fetchBatch));
    for (const f of results.flat()) {
      const id = spotifyIdFromHref(f.href);
      if (!id) continue;
      map.set(id, {
        energy: f.energy,
        valence: f.valence,
        danceability: f.danceability,
        acousticness: f.acousticness,
        instrumentalness: f.instrumentalness,
        speechiness: f.speechiness,
        liveness: f.liveness,
        tempo: f.tempo,
        loudness: f.loudness,
      });
    }
  }
  return map;
}
