import { NextResponse, type NextRequest } from "next/server";
import { AppError } from "@/lib/errors";
import { MIN_TRACKS_FOR_CURATION } from "@/lib/types";
import { clientIp, errorResponse } from "@/lib/server/http";
import { enforceLimit } from "@/lib/server/rate-limit";
import { requireAccessToken } from "@/lib/server/session";
import { fetchLibrary } from "@/lib/server/spotify/library";

export const maxDuration = 120;

/** Signed-in flow: pulls the user's Spotify library and enriches it with audio features. */
export async function GET(req: NextRequest) {
  try {
    const accessToken = await requireAccessToken();
    await enforceLimit("library", clientIp(req));
    const tracks = await fetchLibrary(accessToken);
    if (tracks.length < MIN_TRACKS_FOR_CURATION) {
      throw new AppError(
        "EMPTY_LIBRARY",
        `We found ${tracks.length} tracks, but need at least ${MIN_TRACKS_FOR_CURATION} to make playlists. Play or like some more music on Spotify first.`,
        422
      );
    }
    return NextResponse.json({ tracks });
  } catch (error) {
    return errorResponse(error, "GET /api/library");
  }
}
