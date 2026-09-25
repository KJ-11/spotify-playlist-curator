import { NextResponse } from "next/server";
import { AppError, errorResponse } from "@/lib/api-error";
import { fetchLibrary } from "@/lib/library";
import { requireAccessToken } from "@/lib/session";

export const maxDuration = 120;

export async function GET() {
  try {
    const accessToken = await requireAccessToken();
    const tracks = await fetchLibrary(accessToken);
    if (tracks.length === 0) {
      throw new AppError(
        "EMPTY_LIBRARY",
        "We couldn't find any tracks — play or like some music on Spotify first.",
        422
      );
    }
    return NextResponse.json({ tracks });
  } catch (error) {
    return errorResponse(error, "Failed to fetch library");
  }
}
