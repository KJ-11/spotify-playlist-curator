import { NextRequest, NextResponse } from "next/server";

// Spotify no longer returns preview_url for development-mode apps. Deezer serves
// 30s previews without auth; its URLs are signed and expire after ~15 minutes,
// so they're looked up on demand rather than stored.
const DEEZER_API = "https://api.deezer.com";

interface DeezerTrack {
  preview?: string;
  error?: unknown;
}

async function deezer<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${DEEZER_API}${path}`, { signal: AbortSignal.timeout(8_000) });
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const isrc = req.nextUrl.searchParams.get("isrc");
  const artist = req.nextUrl.searchParams.get("artist") ?? "";
  const title = req.nextUrl.searchParams.get("title") ?? "";

  let url: string | undefined;
  if (isrc && /^[A-Z0-9]{12}$/i.test(isrc)) {
    const track = await deezer<DeezerTrack>(`/track/isrc:${isrc}`);
    if (track && !track.error) url = track.preview || undefined;
  }
  if (!url && artist && title) {
    const q = encodeURIComponent(`artist:"${artist}" track:"${title}"`);
    const search = await deezer<{ data?: DeezerTrack[] }>(`/search?q=${q}&limit=1`);
    url = search?.data?.[0]?.preview || undefined;
  }

  if (!url) return NextResponse.json({ url: null }, { status: 404 });
  return NextResponse.json({ url }, { headers: { "Cache-Control": "private, max-age=600" } });
}
