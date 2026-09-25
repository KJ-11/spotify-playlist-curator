import { NextResponse, type NextRequest } from "next/server";
import { fetchAudioFeatures } from "@/lib/server/audio-features";
import { clientIp, errorResponse, parseBody } from "@/lib/server/http";
import { enforceLimit } from "@/lib/server/rate-limit";
import { enrichRequest } from "@/lib/server/schemas";

export const maxDuration = 60;

/** Upload flow: looks up audio features for track ids parsed from a Spotify data export. */
export async function POST(req: NextRequest) {
  try {
    await enforceLimit("enrich", clientIp(req));
    const { ids } = await parseBody(req, enrichRequest);
    const features = await fetchAudioFeatures(ids);
    return NextResponse.json({ features: Object.fromEntries(features) });
  } catch (error) {
    return errorResponse(error, "POST /api/enrich");
  }
}
