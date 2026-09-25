import { describe, it, expect } from "vitest";
import { MIN_TRACKS_FOR_CURATION } from "@/lib/types";
import { curateRequest, enrichRequest, pushRequest } from "./schemas";

const track = (n: number) => ({
  id: `${"a".repeat(21)}${n % 10}`,
  uri: `spotify:track:${"a".repeat(21)}${n % 10}`,
  name: `Song ${n}`,
  artists: ["Artist"],
  album: "",
  imageUrl: null,
  year: null,
  isrc: null,
  spotifyUrl: "",
  sources: ["saved"],
  features: null,
});

describe("request schemas", () => {
  it("requires a minimum library size for curation", () => {
    const tooFew = { tracks: Array.from({ length: MIN_TRACKS_FOR_CURATION - 1 }, (_, i) => track(i)) };
    const enough = { tracks: Array.from({ length: MIN_TRACKS_FOR_CURATION }, (_, i) => track(i)) };
    expect(curateRequest.safeParse(tooFew).success).toBe(false);
    expect(curateRequest.safeParse(enough).success).toBe(true);
  });

  it("rejects malformed track ids and unknown sources", () => {
    expect(enrichRequest.safeParse({ ids: ["not-an-id"] }).success).toBe(false);
    const bad = { tracks: Array.from({ length: MIN_TRACKS_FOR_CURATION }, (_, i) => ({ ...track(i), sources: ["hacked"] })) };
    expect(curateRequest.safeParse(bad).success).toBe(false);
  });

  it("only accepts Spotify track URIs and trims playlist names", () => {
    const base = { name: "  Night Drive ", trackUris: [`spotify:track:${"b".repeat(22)}`], coverImageBase64: null };
    const parsed = pushRequest.parse(base);
    expect(parsed.name).toBe("Night Drive");
    expect(parsed.description).toBe("");
    expect(pushRequest.safeParse({ ...base, trackUris: ["spotify:episode:abc"] }).success).toBe(false);
  });
});
