import { describe, it, expect } from "vitest";
import { buildJevState, normalizeScore, DIMENSION_QUESTIONS } from "@/lib/jev";
import type { TrackWithFeatures } from "@/lib/types";
import { VIBE_DIMENSIONS } from "@/lib/types";

const mockTrack: TrackWithFeatures = {
  track: {
    id: "t1",
    name: "Test Track",
    artists: [{ id: "a1", name: "Test Artist" }],
    album: { name: "Test Album", images: [] },
    preview_url: null,
    external_urls: { spotify: "https://open.spotify.com/track/t1" },
    popularity: 72,
    release_date: "2016-03-15",
  },
  audioFeatures: {
    energy: 0.8,
    valence: 0.6,
    tempo: 128,
    danceability: 0.75,
    acousticness: 0.1,
    instrumentalness: 0.0,
    liveness: 0.15,
    speechiness: 0.05,
  },
  genres: ["house", "electronic"],
};

describe("buildJevState", () => {
  it("includes audio features, metadata, and genres", () => {
    const state = buildJevState(mockTrack);
    expect(state.audioFeatures).toEqual(mockTrack.audioFeatures);
    expect(state.genres).toEqual(["house", "electronic"]);
    expect(state.releaseYear).toBe(2016);
    expect(state.popularity).toBe(72);
    expect(state.trackName).toBe("Test Track");
    expect(state.artistNames).toEqual(["Test Artist"]);
  });
});

describe("normalizeScore", () => {
  it("normalizes a score with 5 levels to 0-1 range", () => {
    expect(normalizeScore(0, 5)).toBe(0);
    expect(normalizeScore(4, 5)).toBe(1);
    expect(normalizeScore(2, 5)).toBe(0.5);
  });

  it("clamps values outside range", () => {
    expect(normalizeScore(-0.5, 5)).toBe(0);
    expect(normalizeScore(5, 5)).toBe(1);
  });
});

describe("DIMENSION_QUESTIONS", () => {
  it("has exactly 13 dimension questions", () => {
    expect(Object.keys(DIMENSION_QUESTIONS)).toHaveLength(13);
  });

  it("covers all vibe dimensions", () => {
    for (const dim of VIBE_DIMENSIONS) {
      expect(DIMENSION_QUESTIONS).toHaveProperty(dim);
    }
  });
});
