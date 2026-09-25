import { NextRequest, NextResponse } from "next/server";
import { AppError, errorResponse } from "@/lib/api-error";
import { requireAccessToken } from "@/lib/session";
import { spotifyFetch, spotifyJson } from "@/lib/spotify-client";

export const maxDuration = 60;

const MAX_COVER_BASE64_BYTES = 256 * 1024;

interface PushRequest {
  name: string;
  description: string;
  trackUris: string[];
  coverImageBase64: string | null;
}

// Creates one playlist per request so the client can show per-playlist
// progress and retry only the ones that failed.
export async function POST(req: NextRequest) {
  try {
    const accessToken = await requireAccessToken();
    const body = (await req.json().catch(() => null)) as PushRequest | null;
    const uris = (body?.trackUris ?? []).filter((u) => /^spotify:track:[A-Za-z0-9]+$/.test(u));
    if (!body?.name?.trim() || uris.length === 0) {
      throw new AppError("BAD_REQUEST", "A playlist needs a name and at least one track.", 400);
    }

    const playlist = await spotifyJson<{ id: string; external_urls: { spotify: string } }>(
      "/me/playlists",
      accessToken,
      {
        method: "POST",
        body: JSON.stringify({
          name: body.name.trim().slice(0, 100),
          description: (body.description ?? "").replace(/\s+/g, " ").slice(0, 300),
          public: false,
        }),
      }
    );

    for (let i = 0; i < uris.length; i += 100) {
      await spotifyFetch(`/playlists/${playlist.id}/items`, accessToken, {
        method: "POST",
        body: JSON.stringify({ uris: uris.slice(i, i + 100) }),
      });
    }

    // Cover upload is cosmetic: report failure but don't fail the playlist.
    let coverUploaded = false;
    if (body.coverImageBase64 && body.coverImageBase64.length <= MAX_COVER_BASE64_BYTES) {
      try {
        await spotifyFetch(`/playlists/${playlist.id}/images`, accessToken, {
          method: "PUT",
          headers: { "Content-Type": "image/jpeg" },
          body: body.coverImageBase64,
        });
        coverUploaded = true;
      } catch (error) {
        console.warn(`Cover upload failed for playlist ${playlist.id}:`, error);
      }
    }

    return NextResponse.json({
      spotifyUrl: playlist.external_urls.spotify,
      trackCount: uris.length,
      coverUploaded,
    });
  } catch (error) {
    return errorResponse(error, "Failed to push playlist");
  }
}
