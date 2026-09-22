export interface SpotifyTrack {
  id: string;
  name: string;
  artists: { id: string; name: string }[];
  album: {
    name: string;
    images: { url: string; width: number; height: number }[];
  };
  preview_url: string | null;
  external_urls: { spotify: string };
  popularity: number;
  release_date: string;
}

export interface AudioFeatures {
  energy: number;
  valence: number;
  tempo: number;
  danceability: number;
  acousticness: number;
  instrumentalness: number;
  liveness: number;
  speechiness: number;
}

export const VIBE_DIMENSIONS = [
  "energy",
  "valence",
  "tension",
  "depth",
  "warmth",
  "swagger",
  "sensuality",
  "nostalgia",
  "movement",
  "focus",
  "social",
  "intimacy",
  "timeOfDay",
] as const;

export type VibeDimension = (typeof VIBE_DIMENSIONS)[number];

export type VibeVector = Record<VibeDimension, number>;

export interface TrackWithFeatures {
  track: SpotifyTrack;
  audioFeatures: AudioFeatures;
  genres: string[];
}

export interface ClassifiedTrack extends TrackWithFeatures {
  vibeVector: VibeVector;
  position2d: { x: number; y: number };
  clusterId: string;
}

export interface Cluster {
  id: string;
  name: string;
  tracks: ClassifiedTrack[];
  centroid: VibeVector;
  coverArtDataUrl: string;
}

export interface CurationResult {
  clusters: Cluster[];
  totalTracks: number;
}
