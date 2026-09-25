import { describe, it, expect, vi, beforeEach } from "vitest";
import { deduplicateTracks, buildAudioFeatureBatches } from "@/lib/spotify";
import type { SpotifyTrack, AudioFeatures } from "@/lib/types";

const makeTrack = (id: string, name: string): SpotifyTrack => ({
  id,
  name,
  artists: [{ id: "a1", name: "Artist" }],
  album: { name: "Album", images: [{ url: "https://img", width: 300, height: 300 }] },
  preview_url: null,
  external_urls: { spotify: `https://open.spotify.com/track/${id}` },
  popularity: 50,
  release_date: "2020-01-01",
});

describe("deduplicateTracks", () => {
  it("removes duplicate track IDs, keeping first occurrence", () => {
    const tracks = [makeTrack("1", "A"), makeTrack("2", "B"), makeTrack("1", "A duplicate")];
    const result = deduplicateTracks(tracks);
    expect(result).toHaveLength(2);
    expect(result[0].name).toBe("A");
    expect(result[1].name).toBe("B");
  });

  it("returns empty array for empty input", () => {
    expect(deduplicateTracks([])).toEqual([]);
  });
});

describe("buildAudioFeatureBatches", () => {
  it("splits track IDs into batches of 100", () => {
    const ids = Array.from({ length: 250 }, (_, i) => `track_${i}`);
    const batches = buildAudioFeatureBatches(ids);
    expect(batches).toHaveLength(3);
    expect(batches[0]).toHaveLength(100);
    expect(batches[1]).toHaveLength(100);
    expect(batches[2]).toHaveLength(50);
  });
});
