export type TrackSource = "recent" | "top_short" | "top_medium" | "top_long" | "saved";

// Spotify-style audio features, sourced from ReccoBeats since Spotify removed
// /audio-features for development-mode apps.
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
