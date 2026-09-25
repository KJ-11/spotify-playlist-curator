import { describe, it, expect } from "vitest";
import { formatTrackLine, normalizeCuration, prioritizeTracks } from "@/lib/curate";
import type { LibraryTrack } from "@/lib/library-types";

const track = (id: string, extra: Partial<LibraryTrack> = {}): LibraryTrack => ({
  id,
  uri: `spotify:track:${id}`,
  name: `Song ${id}`,
  artists: ["Artist"],
  album: "Album",
  imageUrl: null,
  year: 2020,
  isrc: null,
  spotifyUrl: "",
  sources: ["saved"],
  features: null,
  ...extra,
});

describe("formatTrackLine", () => {
  it("includes audio features when present", () => {
    const line = formatTrackLine(
      track("a", {
        features: {
          energy: 0.823, valence: 0.418, danceability: 0.646, acousticness: 0.213,
          instrumentalness: 0, speechiness: 0.0394, liveness: 0.3, tempo: 128.035, loudness: -4,
        },
        sources: ["recent", "top_long"],
      }),
      3
    );
    expect(line).toBe('3. "Song a" — Artist (2020) [E=82 V=42 D=65 A=21 I=0 S=4; 128bpm] {recent,top_long}');
  });

  it("omits features and year when missing", () => {
    expect(formatTrackLine(track("b", { year: null, sources: [] }), 0)).toBe('0. "Song b" — Artist');
  });
});

describe("normalizeCuration", () => {
  const tracks = ["a", "b", "c", "d", "e"].map((id) => track(id));

  it("drops invalid and duplicate indices and sends leftovers to unsorted", () => {
    const result = normalizeCuration(
      {
        playlists: [
          { name: " Night Drive ", description: "Late.\nVery late.", track_indices: [0, 1, 1, 99, -1] },
          { name: "Dupes", description: "", track_indices: [1, 2] },
          { name: "Empty", description: "", track_indices: [0] },
        ],
        unsorted: [3],
      },
      tracks
    );
    expect(result.playlists.map((p) => [p.name, p.trackIds])).toEqual([
      ["Night Drive", ["a", "b"]],
      ["Dupes", ["c"]],
    ]);
    expect(result.playlists[0].description).toBe("Late. Very late.");
    expect(result.unsorted).toEqual(["d", "e"]);
  });
});

describe("prioritizeTracks", () => {
  it("keeps tracks that appear in more sources when over the cap", () => {
    const tracks = [
      track("once"),
      track("everywhere", { sources: ["recent", "top_short", "top_long", "saved"] }),
      track("twice", { sources: ["saved", "top_medium"] }),
    ];
    expect(prioritizeTracks(tracks, 2).map((t) => t.id)).toEqual(["everywhere", "twice"]);
  });
});
