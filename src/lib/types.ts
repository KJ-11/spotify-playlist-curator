/** Where a track showed up in the user's listening. Drives prioritisation and curation context. */
export type TrackSource = "recent" | "top_short" | "top_medium" | "top_long" | "saved";

/**
 * Spotify-style audio features. Spotify removed `/audio-features` for development-mode
 * apps, so these come from ReccoBeats, keyed by Spotify track id.
 */
export interface AudioFeatures {
  energy: number;
  valence: number;
  danceability: number;
  acousticness: number;
  instrumentalness: number;
  speechiness: number;
  liveness: number;
  tempo: number;
  loudness: number;
}

export interface LibraryTrack {
  id: string;
  uri: string;
  name: string;
  artists: string[];
  album: string;
  imageUrl: string | null;
  year: number | null;
  isrc: string | null;
  spotifyUrl: string;
  sources: TrackSource[];
  /** Lifetime plays, only known when the library comes from a Spotify data export. */
  playCount?: number;
  features: AudioFeatures | null;
}

export interface CuratedPlaylist {
  id: string;
  name: string;
  description: string;
  trackIds: string[];
}

export interface Curation {
  playlists: CuratedPlaylist[];
  unsorted: string[];
}

/** Below this there's nothing meaningful to group, and the model would return only "unsorted". */
export const MIN_TRACKS_FOR_CURATION = 20;

/** Hard ceiling on tracks sent for curation; keeps prompts, latency and cost bounded. */
export const MAX_TRACKS_FOR_CURATION = 700;
