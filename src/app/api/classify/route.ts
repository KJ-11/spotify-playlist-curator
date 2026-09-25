import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { classifyTracks } from "@/lib/jev";
import type { TrackWithFeatures } from "@/lib/types";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.accessToken) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  try {
    const { tracks } = (await req.json()) as { tracks: TrackWithFeatures[] };
    const vibeVectors = await classifyTracks(tracks);
    return NextResponse.json({ vibeVectors });
  } catch (error) {
    console.error("Failed to classify tracks:", error);
    return NextResponse.json({ error: "Failed to classify tracks" }, { status: 500 });
  }
}
