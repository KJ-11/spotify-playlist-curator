import { describe, it, expect, vi, afterEach } from "vitest";
import { fetchLibrary, mergeSources, toLibraryTrack, type RawSpotifyTrack } from "./library";
import { fetchAudioFeatures } from "../audio-features";

// Mirrors a real Feb-2026 dev-mode track object: release_date lives on album,
// no popularity/available_markets.
const raw = (id: string | null, extra: Partial<RawSpotifyTrack> = {}): RawSpotifyTrack => ({
  id,
  uri: `spotify:track:${id}`,
  name: `Song ${id}`,
  type: "track",
  artists: [{ id: "a1", name: "Artist One" }],
  album: {
    name: "Album",
    release_date: "2014-10-03",
    images: [
      { url: "big", width: 640, height: 640 },
      { url: "mid", width: 300, height: 300 },
      { url: "small", width: 64, height: 64 },
    ],
  },
  external_ids: { isrc: "GBARL1401201" },
  external_urls: { spotify: `https://open.spotify.com/track/${id}` },
  ...extra,
});

describe("toLibraryTrack", () => {
  it("reads year from album.release_date and picks the small image", () => {
    const t = toLibraryTrack(raw("x") as RawSpotifyTrack & { id: string });
    expect(t.year).toBe(2014);
    expect(t.imageUrl).toBe("small");
    expect(t.isrc).toBe("GBARL1401201");
  });

  it("handles year-only and missing release dates", () => {
    const yearOnly = raw("y", { album: { name: "A", release_date: "1999", images: [] } });
    const missing = raw("z", { album: { name: "A", images: [] } });
    expect(toLibraryTrack(yearOnly as RawSpotifyTrack & { id: string }).year).toBe(1999);
    expect(toLibraryTrack(missing as RawSpotifyTrack & { id: string }).year).toBeNull();
  });
});

describe("mergeSources", () => {
  it("dedupes across sources and records every source", () => {
    const tracks = mergeSources([
      ["recent", raw("a")],
      ["top_long", raw("a")],
      ["saved", raw("b")],
    ]);
    expect(tracks).toHaveLength(2);
    expect(tracks.find((t) => t.id === "a")?.sources).toEqual(["recent", "top_long"]);
  });

  it("drops local files, null items, null ids and episodes", () => {
    const tracks = mergeSources([
      ["saved", null],
      ["saved", raw(null)],
      ["saved", raw("local", { is_local: true })],
      ["recent", raw("ep", { type: "episode" })],
      ["saved", raw("ok")],
    ]);
    expect(tracks.map((t) => t.id)).toEqual(["ok"]);
  });
});

describe("fetchAudioFeatures", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("batches by 40 and maps results back by Spotify id from href", async () => {
    const ids = Array.from({ length: 45 }, (_, i) => `id${i}`);
    const fetchMock = vi.fn(async (url: string) => {
      const batch = new URL(url).searchParams.get("ids")!.split(",");
      return new Response(
        JSON.stringify({
          content: batch.slice(0, 2).map((id) => ({
            href: `https://open.spotify.com/track/${id}`,
            energy: 0.8, valence: 0.4, danceability: 0.6, acousticness: 0.2,
            instrumentalness: 0, speechiness: 0.04, liveness: 0.3, tempo: 128, loudness: -4,
          })),
        })
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const map = await fetchAudioFeatures(ids);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(new URL(fetchMock.mock.calls[0][0]).searchParams.get("ids")!.split(",")).toHaveLength(40);
    expect(map.get("id0")?.tempo).toBe(128);
    expect(map.has("id40")).toBe(true);
    expect(map.has("id2")).toBe(false);
  });

  it("returns an empty map instead of throwing when the API is down", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 503 })));
    const map = await fetchAudioFeatures(["a", "b"]);
    expect(map.size).toBe(0);
  });
});

describe("fetchLibrary resilience", () => {
  afterEach(() => vi.unstubAllGlobals());

  const page = (ids: string[]) => ({ items: ids.map((id) => raw(id)), next: null });
  const savedPage = (ids: string[]) => ({ items: ids.map((id) => ({ track: raw(id) })), next: null });
  const ids = (prefix: string, n: number) => Array.from({ length: n }, (_, i) => `${prefix}${i}`);

  /** Routes Spotify URLs to canned responses; ReccoBeats returns nothing. */
  const stubSpotify = (routes: Record<string, () => Response>) =>
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("reccobeats")) return new Response(JSON.stringify({ content: [] }));
        const match = Object.keys(routes).find((k) => url.includes(k));
        return match ? routes[match]() : new Response(JSON.stringify(page([])));
      })
    );

  const quotaHit = () =>
    new Response(JSON.stringify({ error: { reason: "QUOTA_EXCEEDED" } }), { status: 429, headers: { "Retry-After": "3600" } });

  it("continues without a source that hit Spotify's quota when the rest is enough", async () => {
    stubSpotify({
      "/me/top/tracks": quotaHit,
      "/me/tracks": () => new Response(JSON.stringify(savedPage(ids("s", 25)))),
    });
    const tracks = await fetchLibrary("token");
    expect(tracks).toHaveLength(25);
  });

  it("fails when the surviving sources are too small to curate", async () => {
    stubSpotify({
      "/me/top/tracks": quotaHit,
      "/me/tracks": () => new Response(JSON.stringify(savedPage(ids("s", 3)))),
    });
    await expect(fetchLibrary("token")).rejects.toMatchObject({ code: "SPOTIFY_RATE_LIMITED" });
  });

  it("always fails on an expired session", async () => {
    stubSpotify({
      "/me/player/recently-played": () => new Response("expired", { status: 401 }),
      "/me/tracks": () => new Response(JSON.stringify(savedPage(ids("s", 50)))),
    });
    await expect(fetchLibrary("token")).rejects.toMatchObject({ code: "AUTH_EXPIRED" });
  });
});
