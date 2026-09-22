import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { fetchAllTracks } from "@/lib/spotify";

export async function GET() {
  const session = await auth();
  if (!session?.accessToken) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const tracks = await fetchAllTracks(session.accessToken as string);
  return NextResponse.json({ tracks, count: tracks.length });
}
