import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { generatePlaylistNames } from "@/lib/naming";
import type { VibeVector } from "@/lib/types";

interface NameRequest {
  clusters: {
    centroid: VibeVector;
    topArtists: string[];
    topGenres: string[];
  }[];
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.accessToken) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  try {
    const { clusters } = (await req.json()) as NameRequest;
    const names = await generatePlaylistNames(clusters);
    return NextResponse.json({ names });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
