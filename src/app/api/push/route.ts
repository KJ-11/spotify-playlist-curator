import { NextResponse, type NextRequest } from "next/server";
import { errorResponse, parseBody } from "@/lib/server/http";
import { pushRequest } from "@/lib/server/schemas";
import { requireAccessToken } from "@/lib/server/session";
import { spotifyFetch, spotifyJson } from "@/lib/server/spotify/client";

export const maxDuration = 60;

/**
 * Creates one private playlist per request, so the client can show per-playlist progress
 * and retry only the ones that failed.
 */
export async function POST(req: NextRequest) {
  try {
    const accessToken = await requireAccessToken();
    const { name, description, trackUris, coverImageBase64 } = await parseBody(req, pushRequest);

    const playlist = await spotifyJson<{ id: string; external_urls: { spotify: string } }>(
      "/me/playlists",
      accessToken,
      {
        method: "POST",
        body: JSON.stringify({ name, description: description.replace(/\s+/g, " "), public: false }),
      }
    );

    for (let i = 0; i < trackUris.length; i += 100) {
      await spotifyFetch(`/playlists/${playlist.id}/items`, accessToken, {
        method: "POST",
        body: JSON.stringify({ uris: trackUris.slice(i, i + 100) }),
      });
    }

    // The cover is cosmetic: report a failed upload but keep the playlist.
    let coverUploaded = false;
    if (coverImageBase64) {
      try {
        await spotifyFetch(`/playlists/${playlist.id}/images`, accessToken, {
          method: "PUT",
          headers: { "Content-Type": "image/jpeg" },
          body: coverImageBase64,
        });
        coverUploaded = true;
      } catch (error) {
        console.warn(`Cover upload failed for playlist ${playlist.id}:`, error);
      }
    }

    return NextResponse.json({
      spotifyUrl: playlist.external_urls.spotify,
      trackCount: trackUris.length,
      coverUploaded,
    });
  } catch (error) {
    return errorResponse(error, "POST /api/push");
  }
}
