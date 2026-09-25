import Anthropic from "@anthropic-ai/sdk";
import type { VibeVector } from "./types";
import { VIBE_DIMENSIONS } from "./types";

interface ClusterSignature {
  centroid: VibeVector;
  topArtists: string[];
  topGenres: string[];
}

export function buildNamingPrompt(cluster: ClusterSignature): string {
  const scores = VIBE_DIMENSIONS.map(
    (dim) => `${dim}: ${cluster.centroid[dim].toFixed(2)}`
  ).join(", ");

  return `You name playlists. Given a cluster of songs with these vibe scores and representative artists/genres, generate a single playlist name.

Rules:
- 2-4 words only
- Atmospheric and evocative — like an album title or a film scene
- NOT a lifestyle blog heading (no "Sunday Slow Burn", "Good Vibes Only")
- Think: "2am Highway", "Velvet Static", "Concrete Haze"
- Return ONLY the name, nothing else

Vibe scores (0 = low, 1 = high): ${scores}
Top artists: ${cluster.topArtists.join(", ") || "various"}
Top genres: ${cluster.topGenres.join(", ") || "mixed"}

Playlist name:`;
}

export async function generatePlaylistName(
  cluster: ClusterSignature
): Promise<string> {
  const client = new Anthropic();
  const message = await client.messages.create({
    model: "claude-sonnet-5",
    max_tokens: 20,
    messages: [{ role: "user", content: buildNamingPrompt(cluster) }],
  });
  const text =
    message.content[0]?.type === "text" ? message.content[0].text : "";
  return text.trim().replace(/^["']|["']$/g, "");
}

export async function generatePlaylistNames(
  clusters: ClusterSignature[]
): Promise<string[]> {
  return Promise.all(clusters.map(generatePlaylistName));
}
