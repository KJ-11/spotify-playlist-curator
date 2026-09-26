import { afterEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib/errors";
import { spotifyFetch } from "./client";

const quota429 = (retryAfter: string) =>
  new Response(JSON.stringify({ error: { status: 429, message: "Too many requests", reason: "QUOTA_EXCEEDED" } }), {
    status: 429,
    headers: { "Retry-After": retryAfter },
  });

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("spotifyFetch", () => {
  it("fails fast on QUOTA_EXCEEDED without retrying, and reports the reset time", async () => {
    const fetchMock = vi.fn(async () => quota429("50400"));
    vi.stubGlobal("fetch", fetchMock);

    const error = await spotifyFetch("/me/top/tracks", "token").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).code).toBe("SPOTIFY_RATE_LIMITED");
    expect((error as AppError).message).toContain("in about 14 hours");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("fails fast when Retry-After is too long to wait out", async () => {
    const fetchMock = vi.fn(async () => new Response("slow down", { status: 429, headers: { "Retry-After": "120" } }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(spotifyFetch("/me/tracks", "token")).rejects.toMatchObject({ code: "SPOTIFY_RATE_LIMITED" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("rides out a short burst 429 and succeeds", async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("", { status: 429, headers: { "Retry-After": "2" } }))
      .mockResolvedValueOnce(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const pending = spotifyFetch("/me/tracks", "token");
    await vi.advanceTimersByTimeAsync(2000);
    expect((await pending).status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("maps 401 to AUTH_EXPIRED", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("expired", { status: 401 })));
    await expect(spotifyFetch("/me", "token")).rejects.toMatchObject({ code: "AUTH_EXPIRED" });
  });
});
