import { describe, it, expect } from "vitest";
import { strToU8, zipSync } from "fflate";
import { buildLibraryFromExport, ExportParseError, readExportFiles } from "./spotify-export";

const ID_A = "7MmG8p0F9N3C4AXdK6o6Eb";
const ID_B = "3CRDbSIZ4r5MsZ0YwxuEkn";
const ID_C = "69uxyAqqPIsUyTO8txoP2M";

const extended = (id: string, track: string, artist: string, ms: number, ts: string) => ({
  ts,
  ms_played: ms,
  ip_addr: "203.0.113.7",
  spotify_track_uri: `spotify:track:${id}`,
  master_metadata_track_name: track,
  master_metadata_album_artist_name: artist,
  master_metadata_album_album_name: "Album",
});

describe("buildLibraryFromExport", () => {
  it("aggregates extended history, ignoring skips, podcasts and sensitive fields", () => {
    const { tracks, totalPlays } = buildLibraryFromExport([
      [
        extended(ID_A, "Outside", "Calvin Harris", 200_000, "2024-05-01T10:00:00Z"),
        extended(ID_A, "Outside", "Calvin Harris", 180_000, "2024-06-01T10:00:00Z"),
        extended(ID_B, "Skipped", "Someone", 5_000, "2024-06-01T11:00:00Z"),
        { ts: "2024-06-01T12:00:00Z", ms_played: 900_000, spotify_track_uri: null, episode_name: "A podcast" },
      ],
    ]);
    expect(tracks.map((t) => [t.id, t.playCount])).toEqual([[ID_A, 2]]);
    expect(totalPlays).toBe(2);
    expect(JSON.stringify(tracks)).not.toContain("203.0.113.7");
  });

  it("merges library saves and resolves account history by artist + title", () => {
    const { tracks, unmatchedPlays } = buildLibraryFromExport([
      // Account history arrives before the library file that carries its URIs.
      [
        { endTime: "2024-06-01 10:00", artistName: "Bon Iver", trackName: "Holocene", msPlayed: 300_000 },
        { endTime: "2024-06-02 10:00", artistName: "Unknown", trackName: "Nope", msPlayed: 100_000 },
      ],
      {
        tracks: [
          { artist: "Bon Iver", album: "Bon Iver", track: "Holocene", uri: `spotify:track:${ID_C}` },
          { artist: "Saved Only", album: "X", track: "Never Played", uri: `spotify:track:${ID_B}` },
          { artist: "Local", album: "X", track: "Local file", uri: "spotify:local:abc" },
        ],
      },
    ]);
    const holocene = tracks.find((t) => t.id === ID_C)!;
    expect(holocene.playCount).toBe(1);
    expect(holocene.sources).toContain("saved");
    expect(tracks.find((t) => t.id === ID_B)?.sources).toEqual(["saved"]);
    expect(tracks).toHaveLength(2);
    expect(unmatchedPlays).toBe(1);
  });

  it("tags tracks played in the last 30 days of the export as recent", () => {
    const { tracks } = buildLibraryFromExport([
      [
        extended(ID_A, "Old", "A", 200_000, "2023-01-01T00:00:00Z"),
        extended(ID_B, "New", "B", 100_000, "2024-06-01T00:00:00Z"),
      ],
    ]);
    expect(tracks.find((t) => t.id === ID_B)?.sources).toContain("recent");
    expect(tracks.find((t) => t.id === ID_A)?.sources).not.toContain("recent");
  });

  it("throws a readable error when nothing recognisable was uploaded", () => {
    expect(() => buildLibraryFromExport([{ foo: 1 }, [1, 2]])).toThrow(ExportParseError);
  });
});

describe("readExportFiles", () => {
  it("reads json files out of the export zip", async () => {
    const zip = zipSync({
      "Spotify Extended Streaming History/Streaming_History_Audio_2024.json": strToU8(
        JSON.stringify([extended(ID_A, "Outside", "Calvin Harris", 200_000, "2024-05-01T10:00:00Z")])
      ),
      "Spotify Extended Streaming History/ReadMeFirst.pdf": strToU8("pdf"),
    });
    const file = new File([zip], "my_spotify_data.zip");
    const docs = await readExportFiles([file]);
    expect(docs).toHaveLength(1);
    expect(buildLibraryFromExport(docs).tracks[0].id).toBe(ID_A);
  });
});
