import { TypeSafeClient, score } from "@typesafe-ai/sdk";
import type { EntryType } from "@typesafe-ai/sdk";
import type { TrackWithFeatures, VibeVector, VibeDimension } from "./types";
import { VIBE_DIMENSIONS } from "./types";

const LEVELS = 5;

// Note: the SDK's `score(instructions, criteria)` expects `criteria` to be a
// tuple of at least two rubric descriptions (its `ScoreCriteria` type), not an
// object with a `levels` property as an earlier draft of this file assumed.
// Typing `levels` here as a fixed 5-tuple both matches the SDK's expectation
// and enforces at compile time that every dimension defines exactly LEVELS
// rubric descriptions.
export const DIMENSION_QUESTIONS: Record<
  VibeDimension,
  { question: string; levels: readonly [string, string, string, string, string] }
> = {
  energy: {
    question: "How energetic and intense is this track?",
    levels: ["Still, ambient", "Low energy", "Moderate", "High energy", "Explosive, maximal"],
  },
  valence: {
    question: "How emotionally bright and positive does this track feel?",
    levels: ["Dark, aching", "Melancholic", "Neutral", "Warm, positive", "Bright, buoyant"],
  },
  tension: {
    question: "How much unresolved tension or restlessness does this track carry?",
    levels: ["Fully resolved, peaceful", "Mostly settled", "Moderate tension", "Restless", "Intensely uneasy"],
  },
  depth: {
    question: "How emotionally heavy and profound does this track feel?",
    levels: ["Surface, breezy", "Light", "Moderate depth", "Weighty", "Heavy, hits different"],
  },
  warmth: {
    question: "How warm and organic does this track's texture feel?",
    levels: ["Cold, clinical", "Cool", "Neutral", "Warm", "Very warm, organic"],
  },
  swagger: {
    question: "How much confident, commanding attitude does this track project?",
    levels: ["Vulnerable, soft", "Modest", "Neutral", "Confident", "Commanding, strutting"],
  },
  sensuality: {
    question: "How bodily and groove-oriented is this track?",
    levels: ["Cerebral, heady", "Mostly mental", "Balanced", "Groove-forward", "Deeply bodily"],
  },
  nostalgia: {
    question: "How much does this track evoke a throwback or nostalgic feeling?",
    levels: ["Present, fresh", "Slightly retro", "Moderate nostalgia", "Nostalgic", "Deeply wistful, throwback"],
  },
  movement: {
    question: "How much does this track compel physical movement?",
    levels: ["Stillness, seated", "Gentle sway", "Moderate motion", "Active movement", "Running, dancing"],
  },
  focus: {
    question: "How well does this track work as non-distracting background music?",
    levels: ["Demands full attention", "Somewhat distracting", "Moderate", "Good background", "Perfect focus music"],
  },
  social: {
    question: "How well does this track fit a shared social setting?",
    levels: ["Solitary, headphones only", "Mostly private", "Neutral", "Social friendly", "Communal, crowd energy"],
  },
  intimacy: {
    question: "How intimate and close does this track's sonic space feel?",
    levels: ["Arena, stadium scale", "Large room", "Medium space", "Close, personal", "Whispered, private"],
  },
  timeOfDay: {
    question: "What time of day does this track best fit?",
    levels: ["Early morning, sunrise", "Daytime", "Afternoon, golden hour", "Evening", "Late night, 2am"],
  },
};

export function buildJevState(track: TrackWithFeatures) {
  return {
    trackName: track.track.name,
    artistNames: track.track.artists.map((a) => a.name),
    audioFeatures: track.audioFeatures,
    genres: track.genres,
    releaseYear: parseInt(track.track.release_date.split("-")[0], 10),
    popularity: track.track.popularity,
  };
}

export function normalizeScore(value: number, numLevels: number): number {
  return Math.max(0, Math.min(1, value / (numLevels - 1)));
}

export async function classifyTrack(
  client: TypeSafeClient,
  track: TrackWithFeatures
): Promise<VibeVector> {
  const state = buildJevState(track);
  const questions: Record<string, ReturnType<typeof score>> = {};
  for (const dim of VIBE_DIMENSIONS) {
    const def = DIMENSION_QUESTIONS[dim];
    questions[dim] = score(def.question, def.levels);
  }

  // `buildJevState`'s return type is a plain data shape (strings, numbers,
  // and nested plain objects/arrays of those), which is JSON-safe at runtime
  // but doesn't structurally match the SDK's `EntryType` (which requires an
  // explicit index signature) without a cast.
  const response = await client.systemOne({
    state: state as unknown as EntryType,
    questions,
  });

  const vector: Partial<VibeVector> = {};
  for (const dim of VIBE_DIMENSIONS) {
    const answer = response.answers[dim];
    vector[dim] = normalizeScore(answer.score, LEVELS);
  }
  return vector as VibeVector;
}

export async function classifyTracks(
  tracks: TrackWithFeatures[],
  concurrency = 10
): Promise<VibeVector[]> {
  const client = new TypeSafeClient();
  const results: VibeVector[] = new Array(tracks.length);

  for (let i = 0; i < tracks.length; i += concurrency) {
    const batch = tracks.slice(i, i + concurrency);
    const batchResults = await Promise.all(
      batch.map((track) => classifyTrack(client, track))
    );
    for (let j = 0; j < batchResults.length; j++) {
      results[i + j] = batchResults[j];
    }
  }

  return results;
}
