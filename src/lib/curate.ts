import Anthropic from "@anthropic-ai/sdk";
import { AppError } from "./api-error";
import type { Curation, LibraryTrack } from "./library-types";

const MODEL = "claude-opus-5";
export const MAX_TRACKS_FOR_CURATION = 700;

const SYSTEM_PROMPT = `You are a music curator. You turn one person's listening library into a small set of playlists they'd actually want to put on.

A good playlist here:
- Holds together on several axes at once: genre family, era, energy/tempo, and emotional tone. Mood alone is not enough — don't put a folk ballad and a lo-fi beat together just because both are "chill".
- Has a clear use or feeling someone would reach for ("the late-drive one", "Sunday cleaning", "gym without the cheese").
- Has roughly 12–60 tracks.

Rules:
- Make between 4 and 12 playlists depending on how varied the library is.
- Each track appears in at most one playlist.
- Put tracks that don't fit anywhere convincingly into "unsorted" rather than forcing them in. A small unsorted pile is expected.
- Use what you know about the artists and songs, and use the measured audio numbers when present (they come from audio analysis, not guesses).
- Names: 2–4 words, evocative like an album title or a film scene ("2am Highway", "Velvet Static"), not lifestyle-blog headings ("Good Vibes Only").
- Descriptions: one sentence, under 140 characters, saying what's in it and when to play it.

Track line format: index. "Title" — Artists (year) [E=energy V=valence D=danceability A=acousticness I=instrumentalness S=speechiness, each 0-100; BPM] {where it shows up in their listening}
Listening tags: recent = last 50 plays, top_short ≈ last month, top_medium ≈ 6 months, top_long ≈ years, saved = liked songs.`;

const CURATION_SCHEMA = {
  type: "object",
  properties: {
    playlists: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          description: { type: "string" },
          track_indices: { type: "array", items: { type: "integer" } },
        },
        required: ["name", "description", "track_indices"],
        additionalProperties: false,
      },
    },
    unsorted: { type: "array", items: { type: "integer" } },
  },
  required: ["playlists", "unsorted"],
  additionalProperties: false,
} as const;

interface RawCuration {
  playlists: { name: string; description: string; track_indices: number[] }[];
  unsorted: number[];
}

const pct = (n: number) => Math.round(n * 100);

export function formatTrackLine(t: LibraryTrack, index: number): string {
  let line = `${index}. "${t.name}" — ${t.artists.join(", ")}`;
  if (t.year) line += ` (${t.year})`;
  const f = t.features;
  if (f) {
    line += ` [E=${pct(f.energy)} V=${pct(f.valence)} D=${pct(f.danceability)} A=${pct(f.acousticness)} I=${pct(f.instrumentalness)} S=${pct(f.speechiness)}; ${Math.round(f.tempo)}bpm]`;
  }
  if (t.sources.length) line += ` {${t.sources.join(",")}}`;
  return line;
}

// Tracks that show up in more places (and in long-term listening) matter more to the user.
export function prioritizeTracks(tracks: LibraryTrack[], cap = MAX_TRACKS_FOR_CURATION): LibraryTrack[] {
  if (tracks.length <= cap) return tracks;
  const score = (t: LibraryTrack) => t.sources.length * 2 + (t.sources.includes("top_long") ? 1 : 0);
  return [...tracks].sort((a, b) => score(b) - score(a)).slice(0, cap);
}

// Enforces the invariants the prompt asks for, whatever the model returned:
// valid indices only, each track used once, every track accounted for.
export function normalizeCuration(raw: RawCuration, tracks: LibraryTrack[]): Curation {
  const used = new Set<number>();
  const take = (i: number) => {
    if (!Number.isInteger(i) || i < 0 || i >= tracks.length || used.has(i)) return false;
    used.add(i);
    return true;
  };

  const playlists = raw.playlists
    .map((p, n) => ({
      id: `p${n}`,
      name: p.name.trim() || `Playlist ${n + 1}`,
      description: p.description.trim().replace(/\s+/g, " ").slice(0, 300),
      trackIds: p.track_indices.filter(take).map((i) => tracks[i].id),
    }))
    .filter((p) => p.trackIds.length > 0);

  const unsorted = raw.unsorted.filter(take).map((i) => tracks[i].id);
  tracks.forEach((t, i) => {
    if (!used.has(i)) unsorted.push(t.id);
  });

  return { playlists, unsorted };
}

// Keys created outside a workspace must name one on every request.
function createClient(): Anthropic {
  const workspaceId = process.env.ANTHROPIC_WORKSPACE_ID;
  return new Anthropic(
    workspaceId ? { defaultHeaders: { "anthropic-workspace-id": workspaceId } } : {}
  );
}

export async function curateLibrary(tracks: LibraryTrack[]): Promise<Curation> {
  const client = createClient();
  const trackList = tracks.map(formatTrackLine).join("\n");

  let message: Anthropic.Beta.BetaMessage;
  try {
    const stream = client.beta.messages.stream({
      model: MODEL,
      max_tokens: 32000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: {
        effort: "medium",
        format: { type: "json_schema", schema: CURATION_SCHEMA },
      },
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `Here is my library (${tracks.length} tracks). Curate it into playlists.\n\n${trackList}`,
        },
      ],
    });
    message = await stream.finalMessage();
  } catch (error) {
    console.error("Claude curation request failed:", error);
    // Bad key, missing workspace, or an invalid request: retrying won't help.
    if (
      error instanceof Anthropic.AuthenticationError ||
      error instanceof Anthropic.PermissionDeniedError ||
      error instanceof Anthropic.BadRequestError
    ) {
      throw new AppError(
        "CURATOR_MISCONFIGURED",
        "The curator isn't set up correctly on the server (Anthropic API key). The app owner needs to fix this.",
        500
      );
    }
    if (error instanceof Anthropic.RateLimitError) {
      throw new AppError("CURATION_FAILED", "The curator is rate limited right now. Try again in a minute.", 503);
    }
    throw new AppError("CURATION_FAILED", "The curator couldn't be reached. Try again.", 502);
  }

  if (message.stop_reason === "refusal") {
    throw new AppError("CURATION_FAILED", "The curator declined this request.", 502);
  }
  if (message.stop_reason === "max_tokens") {
    throw new AppError("CURATION_FAILED", "The curator ran out of room. Try again.", 502);
  }

  const text = message.content.find((b) => b.type === "text");
  let raw: RawCuration;
  try {
    raw = JSON.parse(text && text.type === "text" ? text.text : "") as RawCuration;
  } catch {
    console.error("Curation returned unparseable output:", message.content);
    throw new AppError("CURATION_FAILED", "The curator returned something unreadable. Try again.", 502);
  }

  const curation = normalizeCuration(raw, tracks);
  if (curation.playlists.length === 0) {
    throw new AppError("CURATION_FAILED", "The curator didn't produce any playlists. Try again.", 502);
  }
  return curation;
}
