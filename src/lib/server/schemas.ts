import "server-only";
import { z } from "zod";
import { MAX_TRACKS_FOR_CURATION, MIN_TRACKS_FOR_CURATION } from "@/lib/types";

const spotifyId = z.string().regex(/^[A-Za-z0-9]{22}$/, "not a Spotify track id");

const audioFeatures = z.object({
  energy: z.number(),
  valence: z.number(),
  danceability: z.number(),
  acousticness: z.number(),
  instrumentalness: z.number(),
  speechiness: z.number(),
  liveness: z.number(),
  tempo: z.number(),
  loudness: z.number(),
});

// Only the fields curation reads are validated strictly; display fields are passed through.
const libraryTrack = z.object({
  id: spotifyId,
  uri: z.string().max(64),
  name: z.string().max(300),
  artists: z.array(z.string().max(200)).max(20),
  album: z.string().max(300),
  imageUrl: z.string().url().max(500).nullable(),
  year: z.number().int().nullable(),
  isrc: z.string().max(20).nullable(),
  spotifyUrl: z.string().max(200),
  sources: z.array(z.enum(["recent", "top_short", "top_medium", "top_long", "saved"])).max(5),
  playCount: z.number().int().nonnegative().optional(),
  features: audioFeatures.nullable(),
});

// Clients may send more than the curation cap; the server trims by priority.
export const curateRequest = z.object({
  tracks: z
    .array(libraryTrack)
    .min(MIN_TRACKS_FOR_CURATION, `need at least ${MIN_TRACKS_FOR_CURATION} tracks`)
    .max(MAX_TRACKS_FOR_CURATION * 3),
});

export const enrichRequest = z.object({
  ids: z.array(spotifyId).min(1).max(MAX_TRACKS_FOR_CURATION * 3),
});

export const pushRequest = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.string().max(300).default(""),
  trackUris: z.array(z.string().regex(/^spotify:track:[A-Za-z0-9]{22}$/)).min(1).max(1000),
  // Spotify caps cover uploads at 256KB of base64.
  coverImageBase64: z.string().max(256 * 1024).nullable(),
});
