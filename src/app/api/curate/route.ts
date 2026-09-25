import { NextResponse, type NextRequest } from "next/server";
import { assertCuratorConfigured, curateLibrary, prioritizeTracks } from "@/lib/server/curation";
import { clientIp, errorResponse, parseBody } from "@/lib/server/http";
import { assertCurationEnabled, enforceLimit } from "@/lib/server/rate-limit";
import { curateRequest } from "@/lib/server/schemas";
import { getAccessToken } from "@/lib/server/session";

export const maxDuration = 300;

/**
 * Groups tracks into playlists with one Claude call. Open to anonymous users (upload flow),
 * so it's rate limited per caller and globally; signed-in Spotify users get a larger budget.
 */
export async function POST(req: NextRequest) {
  try {
    assertCurationEnabled();
    assertCuratorConfigured();
    const { tracks } = await parseBody(req, curateRequest);

    const ip = clientIp(req);
    const signedIn = (await getAccessToken()) !== null;
    await enforceLimit(signedIn ? "curateSpotify" : "curatePublic", ip, { failClosed: !signedIn });
    await enforceLimit("curateGlobal", "all", { failClosed: !signedIn });

    const curation = await curateLibrary(prioritizeTracks(tracks));
    return NextResponse.json(curation);
  } catch (error) {
    return errorResponse(error, "POST /api/curate");
  }
}
