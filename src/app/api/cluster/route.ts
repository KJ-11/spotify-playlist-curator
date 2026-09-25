import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { clusterTracks } from "@/lib/cluster";
import { projectToUmap } from "@/lib/umap";
import type { VibeVector } from "@/lib/types";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.accessToken) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  try {
    const { vibeVectors } = (await req.json()) as { vibeVectors: VibeVector[] };
    const { assignments, centroids, k } = clusterTracks(vibeVectors);
    const positions2d = projectToUmap(vibeVectors);

    return NextResponse.json({ assignments, centroids, positions2d, k });
  } catch (error) {
    console.error("Failed to cluster tracks:", error);
    return NextResponse.json({ error: "Failed to cluster tracks" }, { status: 500 });
  }
}
