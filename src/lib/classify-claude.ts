import Anthropic from "@anthropic-ai/sdk";
import type { TrackWithFeatures, VibeVector } from "./types";
import { VIBE_DIMENSIONS } from "./types";
import { buildJevState, DIMENSION_QUESTIONS, normalizeScore } from "./jev";

const LEVELS = 5;

function buildClassificationPrompt(tracks: TrackWithFeatures[]): string {
  const dimensionDesc = VIBE_DIMENSIONS.map((dim) => {
    const def = DIMENSION_QUESTIONS[dim];
    return `- ${dim}: ${def.question}\n  Scale: ${def.levels.map((l, i) => `${i}="${l}"`).join(", ")}`;
  }).join("\n");

  const trackList = tracks.map((t, i) => {
    const s = buildJevState(t);
    return `[${i}] "${s.trackName}" by ${s.artistNames.join(", ")} (${s.releaseYear}, pop=${s.popularity})
  Genres: ${s.genres.join(", ") || "unknown"}
  Audio: energy=${s.audioFeatures.energy}, valence=${s.audioFeatures.valence}, tempo=${s.audioFeatures.tempo}, dance=${s.audioFeatures.danceability}, acoustic=${s.audioFeatures.acousticness}, instrumental=${s.audioFeatures.instrumentalness}`;
  }).join("\n");

  return `Score each track on 13 vibe dimensions. Use integer scores 0-4 for each dimension.

Dimensions:
${dimensionDesc}

Tracks:
${trackList}

Respond with ONLY a JSON array of objects, one per track in order. Each object has the 13 dimension names as keys with integer scores 0-4. No other text.`;
}

export async function classifyTracksClaude(
  tracks: TrackWithFeatures[],
  batchSize = 20
): Promise<VibeVector[]> {
  const client = new Anthropic();
  const results: VibeVector[] = new Array(tracks.length);

  for (let i = 0; i < tracks.length; i += batchSize) {
    const batch = tracks.slice(i, i + batchSize);
    const message = await client.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 4096,
      messages: [{ role: "user", content: buildClassificationPrompt(batch) }],
    });

    const text =
      message.content[0]?.type === "text" ? message.content[0].text : "[]";
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    const scores: Record<string, number>[] = JSON.parse(jsonMatch?.[0] ?? "[]");

    for (let j = 0; j < batch.length; j++) {
      const raw = scores[j] ?? {};
      const vector: Partial<VibeVector> = {};
      for (const dim of VIBE_DIMENSIONS) {
        vector[dim] = normalizeScore(raw[dim] ?? 2, LEVELS);
      }
      results[i + j] = vector as VibeVector;
    }
  }

  return results;
}
