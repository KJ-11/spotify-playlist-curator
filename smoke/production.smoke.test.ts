/**
 * Smoke tests against a deployed instance (production by default).
 *
 *   npm run test:smoke                                   # free checks
 *   SMOKE_CURATE=1 npm run test:smoke                    # + one real Claude curation
 *   SMOKE_BASE_URL=https://my-deploy.vercel.app npm run test:smoke
 *
 * The default checks cost nothing and consume no rate-limit budget: invalid curation
 * requests are rejected by validation before the limiter runs. SMOKE_CURATE spends one
 * Claude call and one of the caller IP's daily curations.
 */
import { describe, expect, it } from "vitest";
import library from "./fixtures/library.json";

const BASE_URL = (process.env.SMOKE_BASE_URL ?? "https://spotify-playlist-curator-black.vercel.app").replace(/\/$/, "");
const RUN_CURATION = process.env.SMOKE_CURATE === "1";

/** A track ReccoBeats and Deezer are known to cover ("Outside" by Calvin Harris). */
const KNOWN_TRACK = { id: "7MmG8p0F9N3C4AXdK6o6Eb", isrc: "GBARL1401201" };

const get = (path: string, init?: RequestInit) => fetch(`${BASE_URL}${path}`, { redirect: "manual", ...init });
const postJson = (path: string, body: unknown) =>
  get(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const errorCode = async (res: Response) => ((await res.json()) as { error?: { code?: string } }).error?.code;

describe(`pages (${BASE_URL})`, () => {
  it("serves the landing page with security headers", async () => {
    const res = await get("/");
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("Playlist Curator");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("x-frame-options")).toBe("DENY");
    expect(res.headers.get("x-powered-by")).toBeNull();
  });

  it("serves the public upload page", async () => {
    expect((await get("/upload")).status).toBe(200);
  });

  it("redirects the old /curate route to /spotify", async () => {
    const res = await get("/curate");
    expect(res.status).toBe(308);
    expect(res.headers.get("location")).toMatch(/\/spotify$/);
  });
});

describe("auth-protected routes", () => {
  it("rejects library reads without a Spotify session", async () => {
    const res = await get("/api/library");
    expect(res.status).toBe(401);
    expect(await errorCode(res)).toBe("AUTH_EXPIRED");
  });

  it("rejects playlist creation without a Spotify session", async () => {
    const res = await postJson("/api/push", {});
    expect(res.status).toBe(401);
    expect(await errorCode(res)).toBe("AUTH_EXPIRED");
  });
});

describe("request validation", () => {
  it("rejects malformed enrich requests", async () => {
    const res = await postJson("/api/enrich", { ids: ["not-a-track-id"] });
    expect(res.status).toBe(400);
    expect(await errorCode(res)).toBe("BAD_REQUEST");
  });

  it("rejects curation of a too-small library before spending any budget", async () => {
    const res = await postJson("/api/curate", { tracks: library.slice(0, 3) });
    expect(res.status).toBe(400);
    expect(await errorCode(res)).toBe("BAD_REQUEST");
  });
});

describe("third-party dependencies", () => {
  it("returns audio features from ReccoBeats", async () => {
    const res = await postJson("/api/enrich", { ids: [KNOWN_TRACK.id] });
    expect(res.status).toBe(200);
    const { features } = (await res.json()) as { features: Record<string, { tempo: number }> };
    expect(features[KNOWN_TRACK.id]?.tempo).toBeGreaterThan(0);
  });

  it("returns a preview URL from Deezer", async () => {
    const res = await get(`/api/preview?isrc=${KNOWN_TRACK.isrc}&artist=Calvin%20Harris&title=Outside`);
    expect(res.status).toBe(200);
    const { url } = (await res.json()) as { url: string };
    expect(url).toMatch(/^https:\/\//);
  });
});

describe.runIf(RUN_CURATION)("curation (spends one Claude call)", () => {
  it(
    "turns a real library into playlists that account for every track",
    async () => {
      const res = await postJson("/api/curate", { tracks: library });
      const body = (await res.json()) as {
        playlists?: { name: string; trackIds: string[] }[];
        unsorted?: string[];
        error?: { code: string; message: string };
      };
      expect(res.status, body.error?.message).toBe(200);
      expect(body.playlists!.length).toBeGreaterThan(0);
      for (const p of body.playlists!) expect(p.name.trim()).not.toBe("");

      const placed = [...body.playlists!.flatMap((p) => p.trackIds), ...body.unsorted!];
      expect(new Set(placed).size).toBe(placed.length);
      expect(new Set(placed)).toEqual(new Set(library.map((t) => t.id)));
    },
    300_000
  );
});
