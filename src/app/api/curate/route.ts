import { NextRequest, NextResponse } from "next/server";
import { AppError, errorResponse } from "@/lib/api-error";
import { curateLibrary, prioritizeTracks } from "@/lib/curate";
import type { LibraryTrack } from "@/lib/library-types";
import { requireAccessToken } from "@/lib/session";

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  try {
    await requireAccessToken();
    const body = (await req.json().catch(() => null)) as { tracks?: LibraryTrack[] } | null;
    if (!Array.isArray(body?.tracks) || body.tracks.length === 0) {
      throw new AppError("BAD_REQUEST", "No tracks to curate.", 400);
    }
    const curation = await curateLibrary(prioritizeTracks(body.tracks));
    return NextResponse.json(curation);
  } catch (error) {
    return errorResponse(error, "Failed to curate library");
  }
}
