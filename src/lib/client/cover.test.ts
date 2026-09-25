import { describe, it, expect } from "vitest";
import { playlistColors } from "./cover";

const hueOf = (hsl: string) => Number(hsl.match(/hsl\((-?\d+)/)![1]);
const circularDistance = (a: number, b: number) => {
  const d = Math.abs(((a % 360) + 360) % 360 - (((b % 360) + 360) % 360));
  return Math.min(d, 360 - d);
};

describe("playlistColors", () => {
  it("gives consecutive playlists clearly different hues", () => {
    const hues = ["p0", "p1", "p2", "p3", "p4", "p5"].map((id) => hueOf(playlistColors(id, [])[0]));
    for (let i = 1; i < hues.length; i++) {
      expect(circularDistance(hues[i], hues[i - 1])).toBeGreaterThan(40);
    }
  });

  it("is stable for the same seed", () => {
    expect(playlistColors("p2", [])).toEqual(playlistColors("p2", []));
  });
});
