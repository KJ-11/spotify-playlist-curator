import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { fetchAllTracks } from "@/lib/spotify";

export async function GET() {
  const session = await auth();
  if (!session?.accessToken) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  try {
    const tracks = await fetchAllTracks(session.accessToken as string);
    return NextResponse.json({ tracks, count: tracks.length });
  } catch (error) {
    console.error("Failed to fetch tracks:", error);
    return NextResponse.json({ error: "Failed to fetch tracks" }, { status: 500 });
  }
}
