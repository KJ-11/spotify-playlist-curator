import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";

const SPOTIFY_API = "https://api.spotify.com/v1";

interface PushPlaylist {
  name: string;
  trackUris: string[];
  coverImageBase64: string | null;
}

async function spotifyFetch(url: string, accessToken: string, options: RequestInit = {}) {
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });
  if (res.status === 429) {
    const retryAfter = parseInt(res.headers.get("Retry-After") ?? "1", 10);
    await new Promise((r) => setTimeout(r, retryAfter * 1000));
    return spotifyFetch(url, accessToken, options);
  }
  return res;
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.accessToken) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const accessToken = session.accessToken as string;

  try {
    const meRes = await spotifyFetch(`${SPOTIFY_API}/me`, accessToken);
    const me = await meRes.json();
    const userId = me.id;

    const { playlists } = (await req.json()) as { playlists: PushPlaylist[] };
    const results = [];

    for (const pl of playlists) {
      const createRes = await spotifyFetch(
        `${SPOTIFY_API}/users/${userId}/playlists`,
        accessToken,
        {
          method: "POST",
          body: JSON.stringify({
            name: pl.name,
            public: false,
            description: "Created by Playlist Curator",
          }),
        }
      );
      if (!createRes.ok) {
        throw new Error(`Failed to create playlist "${pl.name}": ${createRes.status}`);
      }
      const playlist = await createRes.json();

      for (let i = 0; i < pl.trackUris.length; i += 100) {
        const addTracksRes = await spotifyFetch(
          `${SPOTIFY_API}/playlists/${playlist.id}/tracks`,
          accessToken,
          {
            method: "POST",
            body: JSON.stringify({ uris: pl.trackUris.slice(i, i + 100) }),
          }
        );
        if (!addTracksRes.ok) {
          throw new Error(`Failed to add tracks to playlist "${pl.name}": ${addTracksRes.status}`);
        }
      }

      if (pl.coverImageBase64) {
        await spotifyFetch(
          `${SPOTIFY_API}/playlists/${playlist.id}/images`,
          accessToken,
          {
            method: "PUT",
            headers: { "Content-Type": "image/jpeg" },
            body: pl.coverImageBase64,
          }
        );
      }

      results.push({
        name: pl.name,
        spotifyUrl: playlist.external_urls.spotify,
        trackCount: pl.trackUris.length,
      });
    }

    return NextResponse.json({ results });
  } catch (error) {
    console.error("Failed to push playlists to Spotify:", error);
    return NextResponse.json({ error: "Failed to push playlists to Spotify" }, { status: 500 });
  }
}
