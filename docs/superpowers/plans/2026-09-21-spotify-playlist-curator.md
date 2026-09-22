# Spotify Playlist Curator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a multi-user web app that pulls Spotify listening data, classifies tracks on 13 vibe dimensions via Jev, clusters into playlists with generated names and cover art, and lets users preview/edit/push playlists back to Spotify — with an interactive D3 constellation visualization.

**Architecture:** Next.js App Router monolith deployed on Vercel. Server-side API routes handle Spotify OAuth, data fetching, Jev classification, k-means clustering, UMAP projection, and Claude naming. Client renders a D3 force-directed vibe map and a list view for editing clusters. No database — all state is ephemeral per session.

**Tech Stack:** Next.js 15 (App Router), TypeScript strict, Tailwind CSS v4, Auth.js v5 (Spotify provider), `@typesafe-ai/sdk` (Jev), `@anthropic-ai/sdk` (Claude), D3.js v7, `umap-js`, `ml-kmeans`, Vitest

## Global Constraints

- Node 20+, Next.js 15, TypeScript strict mode
- Dark theme by default — Tailwind `darkMode: "class"`, `<html class="dark">` in root layout
- All API keys server-side only — never exposed to client
- Spotify Development Mode — 25 users max, manually allowlisted
- No database — React state is the only session persistence
- Desktop-first layout (responsive but not mobile-optimized)
- Vitest for unit/integration tests; manual browser testing for UI
- Each API route returns JSON; errors return `{ error: string }` with appropriate status codes

## File Structure

```
src/
├── app/
│   ├── layout.tsx                    # Root layout: dark theme, SessionProvider
│   ├── page.tsx                      # Landing / login page
│   ├── curate/
│   │   └── page.tsx                  # Main curation page (auth-gated)
│   └── api/
│       ├── auth/[...nextauth]/
│       │   └── route.ts              # Auth.js route handler
│       ├── tracks/
│       │   └── route.ts              # GET: fetch + deduplicate + enrich tracks
│       ├── classify/
│       │   └── route.ts              # POST: Jev vibe classification
│       ├── cluster/
│       │   └── route.ts              # POST: k-means + UMAP
│       ├── name/
│       │   └── route.ts              # POST: Claude playlist naming
│       └── push/
│           └── route.ts              # POST: create playlists on Spotify
├── lib/
│   ├── types.ts                      # All shared TypeScript types
│   ├── auth.ts                       # Auth.js config + Spotify provider
│   ├── spotify.ts                    # Spotify API client: pagination, retry, batching
│   ├── jev.ts                        # Jev client: 13-dimension scoring
│   ├── cluster.ts                    # K-means + post-processing (merge/split)
│   ├── umap.ts                       # UMAP 13D → 2D wrapper
│   ├── naming.ts                     # Claude API: cluster → playlist name
│   └── cover-art.ts                  # Dimension scores → gradient cover art (canvas)
├── components/
│   ├── providers.tsx                 # SessionProvider wrapper (client component)
│   ├── login-button.tsx              # "Connect Spotify" OAuth button
│   ├── curate-button.tsx             # "Curate My Music" trigger
│   ├── pipeline-progress.tsx         # Step-by-step loading animation
│   ├── view-toggle.tsx               # Map/List toggle
│   ├── track-preview.tsx             # Audio player: preview_url or Spotify link
│   ├── vibe-map.tsx                  # D3 force simulation constellation
│   ├── list-view.tsx                 # Card grid of clusters
│   ├── cluster-card.tsx              # Single cluster: cover, name, tracks
│   ├── track-row.tsx                 # Track in list: art, name, artist, preview
│   └── push-dialog.tsx              # Confirm + progress for push to Spotify
├── __tests__/
│   ├── lib/
│   │   ├── spotify.test.ts
│   │   ├── jev.test.ts
│   │   ├── cluster.test.ts
│   │   ├── umap.test.ts
│   │   ├── naming.test.ts
│   │   └── cover-art.test.ts
│   └── api/
│       ├── tracks.test.ts
│       ├── classify.test.ts
│       └── cluster.test.ts
└── tailwind.config.ts
```

---

### Task 1: Project Scaffolding + Spotify Auth

**Files:**
- Create: `package.json`, `tsconfig.json`, `tailwind.config.ts`, `next.config.ts`, `.env.local`, `.env.example`, `.gitignore`
- Create: `src/lib/types.ts`, `src/lib/auth.ts`
- Create: `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/api/auth/[...nextauth]/route.ts`
- Create: `src/components/providers.tsx`, `src/components/login-button.tsx`
- Create: `vitest.config.ts`

**Interfaces:**
- Produces: `auth()` function returning session with `accessToken: string`; `signIn("spotify")` triggers OAuth flow; all downstream tasks use `auth()` to get the Spotify access token.

- [ ] **Step 1: Scaffold Next.js project**

```bash
cd /Users/kj/Code/Personal/spotify-playlist-curator
npx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --yes
```

If the directory already has files (the spec), say yes to proceed. Remove any boilerplate from `src/app/page.tsx` and `src/app/layout.tsx`.

- [ ] **Step 2: Install dependencies**

```bash
npm install next-auth@beta @auth/core
npm install @typesafe-ai/sdk @anthropic-ai/sdk
npm install d3 umap-js ml-kmeans
npm install -D @types/d3 vitest @vitejs/plugin-react
```

- [ ] **Step 3: Create `.env.example` and `.gitignore` update**

`.env.example`:
```
AUTH_SECRET=                     # openssl rand -base64 32
AUTH_SPOTIFY_ID=                 # Spotify app client ID
AUTH_SPOTIFY_SECRET=             # Spotify app client secret
TYPESAFE_API_KEY=                # Jev API key from console.typesafe.ai
ANTHROPIC_API_KEY=               # Claude API key
```

Add `.env.local` to `.gitignore` (create-next-app usually does this).

- [ ] **Step 4: Create shared types**

`src/lib/types.ts`:
```typescript
export interface SpotifyTrack {
  id: string;
  name: string;
  artists: { id: string; name: string }[];
  album: {
    name: string;
    images: { url: string; width: number; height: number }[];
  };
  preview_url: string | null;
  external_urls: { spotify: string };
  popularity: number;
  release_date: string;
}

export interface AudioFeatures {
  energy: number;
  valence: number;
  tempo: number;
  danceability: number;
  acousticness: number;
  instrumentalness: number;
  liveness: number;
  speechiness: number;
}

export const VIBE_DIMENSIONS = [
  "energy",
  "valence",
  "tension",
  "depth",
  "warmth",
  "swagger",
  "sensuality",
  "nostalgia",
  "movement",
  "focus",
  "social",
  "intimacy",
  "timeOfDay",
] as const;

export type VibeDimension = (typeof VIBE_DIMENSIONS)[number];

export type VibeVector = Record<VibeDimension, number>;

export interface TrackWithFeatures {
  track: SpotifyTrack;
  audioFeatures: AudioFeatures;
  genres: string[];
}

export interface ClassifiedTrack extends TrackWithFeatures {
  vibeVector: VibeVector;
  position2d: { x: number; y: number };
  clusterId: string;
}

export interface Cluster {
  id: string;
  name: string;
  tracks: ClassifiedTrack[];
  centroid: VibeVector;
  coverArtDataUrl: string;
}

export interface CurationResult {
  clusters: Cluster[];
  totalTracks: number;
}
```

- [ ] **Step 5: Configure Auth.js with Spotify provider**

`src/lib/auth.ts`:
```typescript
import NextAuth from "next-auth";
import Spotify from "next-auth/providers/spotify";

const scopes = [
  "user-read-recently-played",
  "user-top-read",
  "user-library-read",
  "playlist-modify-public",
  "playlist-modify-private",
  "ugc-image-upload",
].join(" ");

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Spotify({
      authorization: `https://accounts.spotify.com/authorize?scope=${encodeURIComponent(scopes)}`,
    }),
  ],
  callbacks: {
    async jwt({ token, account }) {
      if (account) {
        return {
          ...token,
          accessToken: account.access_token,
          refreshToken: account.refresh_token,
          expiresAt: account.expires_at,
        };
      }
      if (Date.now() < (token.expiresAt as number) * 1000) {
        return token;
      }
      const response = await fetch("https://accounts.spotify.com/api/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `Basic ${Buffer.from(
            `${process.env.AUTH_SPOTIFY_ID}:${process.env.AUTH_SPOTIFY_SECRET}`
          ).toString("base64")}`,
        },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: token.refreshToken as string,
        }),
      });
      const data = await response.json();
      return {
        ...token,
        accessToken: data.access_token,
        refreshToken: data.refresh_token ?? token.refreshToken,
        expiresAt: Math.floor(Date.now() / 1000) + data.expires_in,
      };
    },
    async session({ session, token }) {
      return { ...session, accessToken: token.accessToken as string };
    },
  },
});
```

`src/app/api/auth/[...nextauth]/route.ts`:
```typescript
import { handlers } from "@/lib/auth";
export const { GET, POST } = handlers;
```

- [ ] **Step 6: Create SessionProvider wrapper**

`src/components/providers.tsx`:
```typescript
"use client";
import { SessionProvider } from "next-auth/react";
import { ReactNode } from "react";

export function Providers({ children }: { children: ReactNode }) {
  return <SessionProvider>{children}</SessionProvider>;
}
```

- [ ] **Step 7: Create root layout with dark theme**

`src/app/layout.tsx`:
```tsx
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Providers } from "@/components/providers";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Playlist Curator",
  description: "Turn your Spotify listening habits into curated playlists",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.className} bg-zinc-950 text-zinc-100 min-h-screen`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
```

- [ ] **Step 8: Create login button and landing page**

`src/components/login-button.tsx`:
```tsx
"use client";
import { signIn, signOut, useSession } from "next-auth/react";

export function LoginButton() {
  const { data: session } = useSession();
  if (session) {
    return (
      <div className="flex items-center gap-4">
        <span className="text-zinc-400 text-sm">{session.user?.name}</span>
        <button
          onClick={() => signOut()}
          className="px-4 py-2 text-sm rounded-lg border border-zinc-700 hover:bg-zinc-800 transition"
        >
          Sign out
        </button>
      </div>
    );
  }
  return (
    <button
      onClick={() => signIn("spotify")}
      className="px-6 py-3 bg-green-600 hover:bg-green-500 text-white font-medium rounded-full transition"
    >
      Connect Spotify
    </button>
  );
}
```

`src/app/page.tsx`:
```tsx
import { LoginButton } from "@/components/login-button";

export default function Home() {
  return (
    <main className="flex flex-col items-center justify-center min-h-screen gap-8">
      <div className="text-center">
        <h1 className="text-5xl font-bold tracking-tight mb-4">Playlist Curator</h1>
        <p className="text-zinc-400 text-lg max-w-md">
          Turn your messy Spotify listening into curated playlists, organized by vibe.
        </p>
      </div>
      <LoginButton />
    </main>
  );
}
```

- [ ] **Step 9: Configure Vitest**

`vitest.config.ts`:
```typescript
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "node",
    globals: true,
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
});
```

Add to `package.json` scripts: `"test": "vitest run", "test:watch": "vitest"`

- [ ] **Step 10: Verify auth flow works**

```bash
npm run dev
```

Open `http://localhost:3000`. Click "Connect Spotify." Verify:
- Redirects to Spotify OAuth consent screen
- Shows the correct scopes (recently played, library, playlists, image upload)
- Redirects back to the app after approval
- Shows user's name and "Sign out" button

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "feat: scaffold project with Next.js, Tailwind dark theme, and Spotify OAuth"
```

---

### Task 2: Spotify Data Fetching

**Files:**
- Create: `src/lib/spotify.ts`
- Create: `src/app/api/tracks/route.ts`
- Create: `src/__tests__/lib/spotify.test.ts`

**Interfaces:**
- Consumes: `auth()` from `src/lib/auth.ts` for the access token
- Produces: `fetchAllTracks(accessToken: string): Promise<TrackWithFeatures[]>` — returns deduplicated tracks with audio features and genre tags. API route `GET /api/tracks` returns this as JSON.

- [ ] **Step 1: Write tests for Spotify client**

`src/__tests__/lib/spotify.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { deduplicateTracks, buildAudioFeatureBatches } from "@/lib/spotify";
import type { SpotifyTrack, AudioFeatures } from "@/lib/types";

const makeTrack = (id: string, name: string): SpotifyTrack => ({
  id,
  name,
  artists: [{ id: "a1", name: "Artist" }],
  album: { name: "Album", images: [{ url: "https://img", width: 300, height: 300 }] },
  preview_url: null,
  external_urls: { spotify: `https://open.spotify.com/track/${id}` },
  popularity: 50,
  release_date: "2020-01-01",
});

describe("deduplicateTracks", () => {
  it("removes duplicate track IDs, keeping first occurrence", () => {
    const tracks = [makeTrack("1", "A"), makeTrack("2", "B"), makeTrack("1", "A duplicate")];
    const result = deduplicateTracks(tracks);
    expect(result).toHaveLength(2);
    expect(result[0].name).toBe("A");
    expect(result[1].name).toBe("B");
  });

  it("returns empty array for empty input", () => {
    expect(deduplicateTracks([])).toEqual([]);
  });
});

describe("buildAudioFeatureBatches", () => {
  it("splits track IDs into batches of 100", () => {
    const ids = Array.from({ length: 250 }, (_, i) => `track_${i}`);
    const batches = buildAudioFeatureBatches(ids);
    expect(batches).toHaveLength(3);
    expect(batches[0]).toHaveLength(100);
    expect(batches[1]).toHaveLength(100);
    expect(batches[2]).toHaveLength(50);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/__tests__/lib/spotify.test.ts
```

Expected: FAIL — `deduplicateTracks` and `buildAudioFeatureBatches` not found.

- [ ] **Step 3: Implement Spotify client**

`src/lib/spotify.ts`:
```typescript
import type { SpotifyTrack, AudioFeatures, TrackWithFeatures } from "./types";

const SPOTIFY_API = "https://api.spotify.com/v1";

async function spotifyFetch(url: string, accessToken: string, retries = 3): Promise<Response> {
  for (let attempt = 0; attempt < retries; attempt++) {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (res.status === 429) {
      const retryAfter = parseInt(res.headers.get("Retry-After") ?? "1", 10);
      await new Promise((r) => setTimeout(r, retryAfter * 1000));
      continue;
    }
    return res;
  }
  throw new Error(`Spotify API failed after ${retries} retries: ${url}`);
}

export function deduplicateTracks(tracks: SpotifyTrack[]): SpotifyTrack[] {
  const seen = new Set<string>();
  return tracks.filter((t) => {
    if (seen.has(t.id)) return false;
    seen.add(t.id);
    return true;
  });
}

export function buildAudioFeatureBatches(ids: string[]): string[][] {
  const batches: string[][] = [];
  for (let i = 0; i < ids.length; i += 100) {
    batches.push(ids.slice(i, i + 100));
  }
  return batches;
}

async function fetchRecentlyPlayed(accessToken: string): Promise<SpotifyTrack[]> {
  const tracks: SpotifyTrack[] = [];
  let url: string | null = `${SPOTIFY_API}/me/player/recently-played?limit=50`;
  while (url) {
    const res = await spotifyFetch(url, accessToken);
    const data = await res.json();
    tracks.push(...data.items.map((item: { track: SpotifyTrack }) => item.track));
    url = data.cursors?.before
      ? `${SPOTIFY_API}/me/player/recently-played?limit=50&before=${data.cursors.before}`
      : null;
  }
  return tracks;
}

async function fetchTopTracks(accessToken: string): Promise<SpotifyTrack[]> {
  const ranges = ["short_term", "medium_term", "long_term"] as const;
  const results = await Promise.all(
    ranges.map(async (range) => {
      const tracks: SpotifyTrack[] = [];
      let url: string | null = `${SPOTIFY_API}/me/top/tracks?time_range=${range}&limit=50`;
      while (url) {
        const res = await spotifyFetch(url, accessToken);
        const data = await res.json();
        tracks.push(...data.items);
        url = data.next;
      }
      return tracks;
    })
  );
  return results.flat();
}

async function fetchSavedTracks(accessToken: string, maxTracks = 500): Promise<SpotifyTrack[]> {
  const tracks: SpotifyTrack[] = [];
  let url: string | null = `${SPOTIFY_API}/me/tracks?limit=50`;
  while (url && tracks.length < maxTracks) {
    const res = await spotifyFetch(url, accessToken);
    const data = await res.json();
    tracks.push(...data.items.map((item: { track: SpotifyTrack }) => item.track));
    url = data.next;
  }
  return tracks.slice(0, maxTracks);
}

async function fetchAudioFeatures(
  ids: string[],
  accessToken: string
): Promise<Map<string, AudioFeatures>> {
  const map = new Map<string, AudioFeatures>();
  const batches = buildAudioFeatureBatches(ids);
  for (const batch of batches) {
    const res = await spotifyFetch(
      `${SPOTIFY_API}/audio-features?ids=${batch.join(",")}`,
      accessToken
    );
    const data = await res.json();
    for (const af of data.audio_features) {
      if (af) map.set(af.id, af);
    }
  }
  return map;
}

async function fetchArtistGenres(
  artistIds: string[],
  accessToken: string
): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  const batches = buildAudioFeatureBatches(artistIds); // reuse 100-batch logic
  for (const batch of batches) {
    const res = await spotifyFetch(
      `${SPOTIFY_API}/artists?ids=${batch.join(",")}`,
      accessToken
    );
    const data = await res.json();
    for (const artist of data.artists) {
      if (artist) map.set(artist.id, artist.genres ?? []);
    }
  }
  return map;
}

export async function fetchAllTracks(accessToken: string): Promise<TrackWithFeatures[]> {
  const [recent, top, saved] = await Promise.all([
    fetchRecentlyPlayed(accessToken),
    fetchTopTracks(accessToken),
    fetchSavedTracks(accessToken),
  ]);
  const allTracks = deduplicateTracks([...recent, ...top, ...saved]);
  const audioFeaturesMap = await fetchAudioFeatures(
    allTracks.map((t) => t.id),
    accessToken
  );
  const artistIds = [...new Set(allTracks.flatMap((t) => t.artists.map((a) => a.id)))];
  const genreMap = await fetchArtistGenres(artistIds, accessToken);

  return allTracks
    .filter((t) => audioFeaturesMap.has(t.id))
    .map((track) => ({
      track,
      audioFeatures: audioFeaturesMap.get(track.id)!,
      genres: [...new Set(track.artists.flatMap((a) => genreMap.get(a.id) ?? []))],
    }));
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/__tests__/lib/spotify.test.ts
```

Expected: PASS

- [ ] **Step 5: Create the tracks API route**

`src/app/api/tracks/route.ts`:
```typescript
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
```

- [ ] **Step 6: Manual test — fetch real tracks**

```bash
npm run dev
```

Log in via Spotify, then visit `http://localhost:3000/api/tracks` in a browser. Verify:
- Returns JSON with `tracks` array and `count`
- Tracks have `audioFeatures` populated
- Tracks have `genres` arrays (may be empty for some)
- No duplicate track IDs in the response

- [ ] **Step 7: Commit**

```bash
git add src/lib/spotify.ts src/app/api/tracks/route.ts src/__tests__/lib/spotify.test.ts
git commit -m "feat: Spotify data fetching with pagination, dedup, audio features, and genres"
```

---

### Task 3: Jev Vibe Classification

**Files:**
- Create: `src/lib/jev.ts`
- Create: `src/app/api/classify/route.ts`
- Create: `src/__tests__/lib/jev.test.ts`

**Interfaces:**
- Consumes: `TrackWithFeatures[]` from Task 2
- Produces: `classifyTracks(tracks: TrackWithFeatures[]): Promise<VibeVector[]>` — returns a vibe vector (13 scores, each 0.0–1.0) per track, in the same order as the input array. API route `POST /api/classify` accepts `{ tracks: TrackWithFeatures[] }` and returns `{ vibeVectors: VibeVector[] }`.

- [ ] **Step 1: Write tests for Jev classification**

`src/__tests__/lib/jev.test.ts`:
```typescript
import { describe, it, expect, vi } from "vitest";
import { buildJevState, normalizeScore, DIMENSION_QUESTIONS } from "@/lib/jev";
import type { TrackWithFeatures } from "@/lib/types";
import { VIBE_DIMENSIONS } from "@/lib/types";

const mockTrack: TrackWithFeatures = {
  track: {
    id: "t1",
    name: "Test Track",
    artists: [{ id: "a1", name: "Test Artist" }],
    album: { name: "Test Album", images: [] },
    preview_url: null,
    external_urls: { spotify: "https://open.spotify.com/track/t1" },
    popularity: 72,
    release_date: "2016-03-15",
  },
  audioFeatures: {
    energy: 0.8,
    valence: 0.6,
    tempo: 128,
    danceability: 0.75,
    acousticness: 0.1,
    instrumentalness: 0.0,
    liveness: 0.15,
    speechiness: 0.05,
  },
  genres: ["house", "electronic"],
};

describe("buildJevState", () => {
  it("includes audio features, metadata, and genres", () => {
    const state = buildJevState(mockTrack);
    expect(state.audioFeatures).toEqual(mockTrack.audioFeatures);
    expect(state.genres).toEqual(["house", "electronic"]);
    expect(state.releaseYear).toBe(2016);
    expect(state.popularity).toBe(72);
    expect(state.trackName).toBe("Test Track");
    expect(state.artistNames).toEqual(["Test Artist"]);
  });
});

describe("normalizeScore", () => {
  it("normalizes a score with 5 levels to 0-1 range", () => {
    expect(normalizeScore(0, 5)).toBe(0);
    expect(normalizeScore(4, 5)).toBe(1);
    expect(normalizeScore(2, 5)).toBe(0.5);
  });

  it("clamps values outside range", () => {
    expect(normalizeScore(-0.5, 5)).toBe(0);
    expect(normalizeScore(5, 5)).toBe(1);
  });
});

describe("DIMENSION_QUESTIONS", () => {
  it("has exactly 13 dimension questions", () => {
    expect(Object.keys(DIMENSION_QUESTIONS)).toHaveLength(13);
  });

  it("covers all vibe dimensions", () => {
    for (const dim of VIBE_DIMENSIONS) {
      expect(DIMENSION_QUESTIONS).toHaveProperty(dim);
    }
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/__tests__/lib/jev.test.ts
```

Expected: FAIL

- [ ] **Step 3: Implement Jev classification client**

`src/lib/jev.ts`:
```typescript
import { TypeSafeClient, score } from "@typesafe-ai/sdk";
import type { TrackWithFeatures, VibeVector, VibeDimension } from "./types";
import { VIBE_DIMENSIONS } from "./types";

const LEVELS = 5;

export const DIMENSION_QUESTIONS: Record<
  VibeDimension,
  { question: string; levels: string[] }
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
    questions[dim] = score(def.question, { levels: def.levels });
  }

  const response = await client.systemOne({ state, questions });

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
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/__tests__/lib/jev.test.ts
```

Expected: PASS

- [ ] **Step 5: Create classify API route**

`src/app/api/classify/route.ts`:
```typescript
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { classifyTracks } from "@/lib/jev";
import type { TrackWithFeatures } from "@/lib/types";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.accessToken) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { tracks } = (await req.json()) as { tracks: TrackWithFeatures[] };
  const vibeVectors = await classifyTracks(tracks);
  return NextResponse.json({ vibeVectors });
}
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/jev.ts src/app/api/classify/route.ts src/__tests__/lib/jev.test.ts
git commit -m "feat: Jev 13-dimension vibe classification with score normalization"
```

---

### Task 4: K-Means Clustering + UMAP Projection

**Files:**
- Create: `src/lib/cluster.ts`
- Create: `src/lib/umap.ts`
- Create: `src/app/api/cluster/route.ts`
- Create: `src/__tests__/lib/cluster.test.ts`

**Interfaces:**
- Consumes: `VibeVector[]` from Task 3
- Produces: `clusterTracks(vectors: VibeVector[]): { assignments: number[]; centroids: VibeVector[]; k: number }` and `projectToUmap(vectors: VibeVector[]): { x: number; y: number }[]`. API route `POST /api/cluster` accepts `{ vibeVectors: VibeVector[] }` and returns `{ assignments: number[], centroids: VibeVector[], positions2d: { x: number, y: number }[], k: number }`.

- [ ] **Step 1: Write tests for clustering**

`src/__tests__/lib/cluster.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import {
  vibeVectorToArray,
  arrayToVibeVector,
  chooseBestK,
  mergeSmallClusters,
  splitLargeClusters,
} from "@/lib/cluster";
import type { VibeVector } from "@/lib/types";
import { VIBE_DIMENSIONS } from "@/lib/types";

const makeVector = (base: number): VibeVector => {
  const v: Partial<VibeVector> = {};
  for (const dim of VIBE_DIMENSIONS) v[dim] = base;
  return v as VibeVector;
};

describe("vibeVectorToArray / arrayToVibeVector", () => {
  it("round-trips correctly", () => {
    const vec = makeVector(0.5);
    const arr = vibeVectorToArray(vec);
    expect(arr).toHaveLength(13);
    expect(arr.every((v) => v === 0.5)).toBe(true);
    const back = arrayToVibeVector(arr);
    expect(back).toEqual(vec);
  });
});

describe("chooseBestK", () => {
  it("returns a value between 5 and 12", () => {
    const k = chooseBestK(100);
    expect(k).toBeGreaterThanOrEqual(5);
    expect(k).toBeLessThanOrEqual(12);
  });

  it("returns fewer clusters for fewer tracks", () => {
    expect(chooseBestK(30)).toBeLessThanOrEqual(chooseBestK(500));
  });
});

describe("mergeSmallClusters", () => {
  it("merges clusters with fewer than minSize tracks", () => {
    const assignments = [0, 0, 0, 0, 0, 1, 1, 2];
    const centroids = [makeVector(0.2), makeVector(0.3), makeVector(0.8)];
    const result = mergeSmallClusters(assignments, centroids, 5);
    const cluster2Tracks = result.assignments.filter((a) => a === 2);
    expect(cluster2Tracks).toHaveLength(0);
  });
});

describe("splitLargeClusters", () => {
  it("splits clusters with more than maxSize tracks", () => {
    const assignments = new Array(40).fill(0);
    const vectors = assignments.map((_, i) => {
      const v = makeVector(i / 40);
      v.energy = i < 20 ? 0.2 : 0.8;
      return v;
    });
    const centroids = [makeVector(0.5)];
    const result = splitLargeClusters(assignments, vectors, centroids, 30);
    const uniqueClusters = new Set(result.assignments);
    expect(uniqueClusters.size).toBeGreaterThan(1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/__tests__/lib/cluster.test.ts
```

Expected: FAIL

- [ ] **Step 3: Implement clustering logic**

`src/lib/cluster.ts`:
```typescript
import kmeans from "ml-kmeans";
import type { VibeVector } from "./types";
import { VIBE_DIMENSIONS } from "./types";

export function vibeVectorToArray(v: VibeVector): number[] {
  return VIBE_DIMENSIONS.map((dim) => v[dim]);
}

export function arrayToVibeVector(arr: number[]): VibeVector {
  const v: Partial<VibeVector> = {};
  VIBE_DIMENSIONS.forEach((dim, i) => {
    v[dim] = arr[i];
  });
  return v as VibeVector;
}

export function chooseBestK(numTracks: number): number {
  const raw = Math.round(Math.sqrt(numTracks / 3));
  return Math.max(5, Math.min(12, raw));
}

function centroidDistance(a: VibeVector, b: VibeVector): number {
  return Math.sqrt(
    VIBE_DIMENSIONS.reduce((sum, dim) => sum + (a[dim] - b[dim]) ** 2, 0)
  );
}

export function mergeSmallClusters(
  assignments: number[],
  centroids: VibeVector[],
  minSize: number
): { assignments: number[]; centroids: VibeVector[] } {
  const result = [...assignments];
  const counts = new Map<number, number>();
  for (const a of result) counts.set(a, (counts.get(a) ?? 0) + 1);

  for (const [clusterId, count] of counts) {
    if (count >= minSize) continue;
    let nearestId = -1;
    let nearestDist = Infinity;
    for (const [otherId] of counts) {
      if (otherId === clusterId || (counts.get(otherId) ?? 0) < minSize) continue;
      const dist = centroidDistance(centroids[clusterId], centroids[otherId]);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearestId = otherId;
      }
    }
    if (nearestId >= 0) {
      for (let i = 0; i < result.length; i++) {
        if (result[i] === clusterId) result[i] = nearestId;
      }
      counts.set(nearestId, (counts.get(nearestId) ?? 0) + count);
      counts.delete(clusterId);
    }
  }
  return { assignments: result, centroids };
}

export function splitLargeClusters(
  assignments: number[],
  vectors: VibeVector[],
  centroids: VibeVector[],
  maxSize: number
): { assignments: number[]; centroids: VibeVector[] } {
  const result = [...assignments];
  const newCentroids = [...centroids];
  const counts = new Map<number, number>();
  for (const a of result) counts.set(a, (counts.get(a) ?? 0) + 1);

  let nextId = Math.max(...result) + 1;

  for (const [clusterId, count] of counts) {
    if (count <= maxSize) continue;
    const indices = result
      .map((a, i) => (a === clusterId ? i : -1))
      .filter((i) => i >= 0);
    const clusterVectors = indices.map((i) => vibeVectorToArray(vectors[i]));
    const sub = kmeans(clusterVectors, 2, { initialization: "kmeans++" });
    for (let j = 0; j < indices.length; j++) {
      if (sub.clusters[j] === 1) {
        result[indices[j]] = nextId;
      }
    }
    newCentroids.push(arrayToVibeVector(sub.centroids[1]));
    nextId++;
  }
  return { assignments: result, centroids: newCentroids };
}

export function clusterTracks(vectors: VibeVector[]): {
  assignments: number[];
  centroids: VibeVector[];
  k: number;
} {
  const k = chooseBestK(vectors.length);
  const data = vectors.map(vibeVectorToArray);
  const result = kmeans(data, k, { initialization: "kmeans++" });

  const centroids = result.centroids.map(arrayToVibeVector);
  let { assignments } = mergeSmallClusters(result.clusters, centroids, 5);
  ({ assignments } = splitLargeClusters(
    assignments,
    vectors,
    centroids,
    30
  ));

  const uniqueIds = [...new Set(assignments)];
  const idMap = new Map(uniqueIds.map((id, i) => [id, i]));
  const normalized = assignments.map((a) => idMap.get(a)!);

  return { assignments: normalized, centroids, k: uniqueIds.length };
}
```

- [ ] **Step 4: Implement UMAP wrapper**

`src/lib/umap.ts`:
```typescript
import { UMAP } from "umap-js";
import type { VibeVector } from "./types";
import { vibeVectorToArray } from "./cluster";

export function projectToUmap(
  vectors: VibeVector[]
): { x: number; y: number }[] {
  const data = vectors.map(vibeVectorToArray);
  const umap = new UMAP({
    nComponents: 2,
    nNeighbors: Math.min(15, Math.floor(data.length / 3)),
    minDist: 0.1,
  });
  const embedding = umap.fit(data);
  return embedding.map(([x, y]) => ({ x, y }));
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
npx vitest run src/__tests__/lib/cluster.test.ts
```

Expected: PASS

- [ ] **Step 6: Create cluster API route**

`src/app/api/cluster/route.ts`:
```typescript
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

  const { vibeVectors } = (await req.json()) as { vibeVectors: VibeVector[] };
  const { assignments, centroids, k } = clusterTracks(vibeVectors);
  const positions2d = projectToUmap(vibeVectors);

  return NextResponse.json({ assignments, centroids, positions2d, k });
}
```

- [ ] **Step 7: Commit**

```bash
git add src/lib/cluster.ts src/lib/umap.ts src/app/api/cluster/route.ts src/__tests__/lib/cluster.test.ts
git commit -m "feat: k-means clustering with merge/split post-processing and UMAP 2D projection"
```

---

### Task 5: Playlist Naming + Cover Art Generation

**Files:**
- Create: `src/lib/naming.ts`
- Create: `src/lib/cover-art.ts`
- Create: `src/app/api/name/route.ts`
- Create: `src/__tests__/lib/naming.test.ts`
- Create: `src/__tests__/lib/cover-art.test.ts`

**Interfaces:**
- Consumes: `Cluster[]` (without names/covers yet) from Tasks 2–4
- Produces: `generatePlaylistName(cluster: { centroid: VibeVector; topArtists: string[]; topGenres: string[] }): Promise<string>` and `generateCoverArt(centroid: VibeVector, name: string): string` (returns data URL). API route `POST /api/name` accepts `{ clusters: { centroid, topArtists, topGenres }[] }` and returns `{ names: string[] }`.

- [ ] **Step 1: Write tests for naming**

`src/__tests__/lib/naming.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { buildNamingPrompt } from "@/lib/naming";
import type { VibeVector } from "@/lib/types";
import { VIBE_DIMENSIONS } from "@/lib/types";

const makeVector = (overrides: Partial<VibeVector> = {}): VibeVector => {
  const v: Partial<VibeVector> = {};
  for (const dim of VIBE_DIMENSIONS) v[dim] = 0.5;
  return { ...v, ...overrides } as VibeVector;
};

describe("buildNamingPrompt", () => {
  it("includes dimension scores, artists, and genres", () => {
    const prompt = buildNamingPrompt({
      centroid: makeVector({ energy: 0.9, timeOfDay: 0.9 }),
      topArtists: ["John Summit", "Fisher"],
      topGenres: ["house", "electronic"],
    });
    expect(prompt).toContain("energy: 0.9");
    expect(prompt).toContain("John Summit");
    expect(prompt).toContain("house");
  });

  it("asks for 2-4 word atmospheric name", () => {
    const prompt = buildNamingPrompt({
      centroid: makeVector(),
      topArtists: [],
      topGenres: [],
    });
    expect(prompt).toContain("2-4 word");
  });
});
```

- [ ] **Step 2: Write tests for cover art color mapping**

`src/__tests__/lib/cover-art.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { computeGradientColors } from "@/lib/cover-art";
import type { VibeVector } from "@/lib/types";
import { VIBE_DIMENSIONS } from "@/lib/types";

const makeVector = (overrides: Partial<VibeVector> = {}): VibeVector => {
  const v: Partial<VibeVector> = {};
  for (const dim of VIBE_DIMENSIONS) v[dim] = 0.5;
  return { ...v, ...overrides } as VibeVector;
};

describe("computeGradientColors", () => {
  it("returns 2-3 HSL color strings", () => {
    const colors = computeGradientColors(makeVector());
    expect(colors.length).toBeGreaterThanOrEqual(2);
    expect(colors.length).toBeLessThanOrEqual(3);
    colors.forEach((c) => expect(c).toMatch(/^hsl\(/));
  });

  it("produces warmer hues for high valence", () => {
    const warm = computeGradientColors(makeVector({ valence: 0.9 }));
    const cool = computeGradientColors(makeVector({ valence: 0.1 }));
    const getHue = (hsl: string) => parseInt(hsl.match(/hsl\((\d+)/)?.[1] ?? "0");
    const warmHue = getHue(warm[0]);
    const coolHue = getHue(cool[0]);
    expect(warmHue).toBeLessThan(60);
    expect(coolHue).toBeGreaterThan(200);
  });

  it("produces lower brightness for high timeOfDay (late night)", () => {
    const night = computeGradientColors(makeVector({ timeOfDay: 0.9 }));
    const morning = computeGradientColors(makeVector({ timeOfDay: 0.1 }));
    const getLightness = (hsl: string) =>
      parseInt(hsl.match(/(\d+)%\)$/)?.[1] ?? "50");
    expect(getLightness(night[0])).toBeLessThan(getLightness(morning[0]));
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
npx vitest run src/__tests__/lib/naming.test.ts src/__tests__/lib/cover-art.test.ts
```

Expected: FAIL

- [ ] **Step 4: Implement naming client**

`src/lib/naming.ts`:
```typescript
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
    message.content[0].type === "text" ? message.content[0].text : "";
  return text.trim().replace(/^["']|["']$/g, "");
}

export async function generatePlaylistNames(
  clusters: ClusterSignature[]
): Promise<string[]> {
  return Promise.all(clusters.map(generatePlaylistName));
}
```

- [ ] **Step 5: Implement cover art color generation**

`src/lib/cover-art.ts`:
```typescript
import type { VibeVector } from "./types";

export function computeGradientColors(centroid: VibeVector): string[] {
  const hueBase = centroid.valence > 0.5
    ? 20 + (1 - centroid.valence) * 40
    : 220 + centroid.valence * 60;

  const warmthShift = (centroid.warmth - 0.5) * 30;
  const hue1 = Math.round(hueBase + warmthShift);
  const hue2 = Math.round(hue1 + 40 + centroid.tension * 60);

  const saturation = Math.round(40 + centroid.energy * 50);
  const baseLightness = 55 - centroid.timeOfDay * 30;
  const lightness1 = Math.round(baseLightness);
  const lightness2 = Math.round(baseLightness - 10);

  const colors = [
    `hsl(${hue1}, ${saturation}%, ${lightness1}%)`,
    `hsl(${hue2}, ${saturation}%, ${lightness2}%)`,
  ];

  if (centroid.tension > 0.6) {
    const hue3 = Math.round(hue1 + 120);
    colors.push(`hsl(${hue3}, ${Math.round(saturation * 0.7)}%, ${Math.round(baseLightness - 5)}%)`);
  }

  return colors;
}

export function computeGradientAngle(centroid: VibeVector): number {
  return Math.round(45 + centroid.tension * 90);
}

export function generateCoverArtCSS(centroid: VibeVector): {
  colors: string[];
  angle: number;
} {
  return {
    colors: computeGradientColors(centroid),
    angle: computeGradientAngle(centroid),
  };
}
```

The actual canvas rendering (640×640 JPEG) happens client-side in the push step, since `<canvas>` is a browser API. The server returns the gradient spec (colors + angle), and the client renders it.

- [ ] **Step 6: Run tests to verify they pass**

```bash
npx vitest run src/__tests__/lib/naming.test.ts src/__tests__/lib/cover-art.test.ts
```

Expected: PASS

- [ ] **Step 7: Create name API route**

`src/app/api/name/route.ts`:
```typescript
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

  const { clusters } = (await req.json()) as NameRequest;
  const names = await generatePlaylistNames(clusters);
  return NextResponse.json({ names });
}
```

- [ ] **Step 8: Commit**

```bash
git add src/lib/naming.ts src/lib/cover-art.ts src/app/api/name/route.ts \
  src/__tests__/lib/naming.test.ts src/__tests__/lib/cover-art.test.ts
git commit -m "feat: Claude playlist naming and generative gradient cover art"
```

---

### Task 6: Pipeline Orchestration + Curation Page

**Files:**
- Create: `src/app/curate/page.tsx`
- Create: `src/components/curate-button.tsx`
- Create: `src/components/pipeline-progress.tsx`

**Interfaces:**
- Consumes: All API routes from Tasks 2–5
- Produces: `CurationResult` state in the curate page — clusters with tracks, names, cover art, and 2D positions, ready for the list view and vibe map.

- [ ] **Step 1: Create the pipeline progress component**

`src/components/pipeline-progress.tsx`:
```tsx
"use client";

const STEPS = [
  "Pulling your tracks from Spotify",
  "Reading the vibe of each track",
  "Clustering by feel",
  "Naming your playlists",
] as const;

export function PipelineProgress({ currentStep }: { currentStep: number }) {
  return (
    <div className="flex flex-col items-center gap-6 py-12">
      <div className="w-8 h-8 border-2 border-zinc-600 border-t-green-500 rounded-full animate-spin" />
      <div className="flex flex-col gap-3">
        {STEPS.map((label, i) => (
          <div key={i} className="flex items-center gap-3 text-sm">
            <div
              className={`w-2 h-2 rounded-full ${
                i < currentStep
                  ? "bg-green-500"
                  : i === currentStep
                    ? "bg-green-400 animate-pulse"
                    : "bg-zinc-700"
              }`}
            />
            <span className={i <= currentStep ? "text-zinc-200" : "text-zinc-600"}>
              {label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create the curate button**

`src/components/curate-button.tsx`:
```tsx
"use client";

export function CurateButton({
  onClick,
  disabled,
}: {
  onClick: () => void;
  disabled: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="px-8 py-4 bg-green-600 hover:bg-green-500 disabled:bg-zinc-700 disabled:text-zinc-500
        text-white font-medium text-lg rounded-full transition"
    >
      Curate My Music
    </button>
  );
}
```

- [ ] **Step 3: Create the curation page with full pipeline**

`src/app/curate/page.tsx`:
```tsx
"use client";

import { useSession } from "next-auth/react";
import { redirect } from "next/navigation";
import { useState, useCallback } from "react";
import { CurateButton } from "@/components/curate-button";
import { PipelineProgress } from "@/components/pipeline-progress";
import type {
  TrackWithFeatures,
  VibeVector,
  ClassifiedTrack,
  Cluster,
  CurationResult,
} from "@/lib/types";
import { VIBE_DIMENSIONS } from "@/lib/types";
import { generateCoverArtCSS } from "@/lib/cover-art";

function buildClusters(
  tracks: TrackWithFeatures[],
  vibeVectors: VibeVector[],
  assignments: number[],
  centroids: VibeVector[],
  positions2d: { x: number; y: number }[],
  names: string[]
): Cluster[] {
  const clusterIds = [...new Set(assignments)].sort((a, b) => a - b);

  return clusterIds.map((clusterId, idx) => {
    const clusterTracks: ClassifiedTrack[] = [];
    for (let i = 0; i < assignments.length; i++) {
      if (assignments[i] === clusterId) {
        clusterTracks.push({
          ...tracks[i],
          vibeVector: vibeVectors[i],
          position2d: positions2d[i],
          clusterId: String(clusterId),
        });
      }
    }

    const centroid = centroids[clusterId] ?? centroids[0];
    const { colors, angle } = generateCoverArtCSS(centroid);
    const gradient = `linear-gradient(${angle}deg, ${colors.join(", ")})`;

    return {
      id: String(clusterId),
      name: names[idx] ?? `Playlist ${idx + 1}`,
      tracks: clusterTracks,
      centroid,
      coverArtDataUrl: gradient,
    };
  });
}

export default function CuratePage() {
  const { data: session, status } = useSession();
  const [pipelineStep, setPipelineStep] = useState(-1);
  const [result, setResult] = useState<CurationResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (status === "unauthenticated") redirect("/");

  const runPipeline = useCallback(async () => {
    setError(null);
    setPipelineStep(0);

    const tracksRes = await fetch("/api/tracks");
    if (!tracksRes.ok) { setError("Failed to fetch tracks"); return; }
    const { tracks } = await tracksRes.json() as { tracks: TrackWithFeatures[] };

    setPipelineStep(1);
    const classifyRes = await fetch("/api/classify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tracks }),
    });
    if (!classifyRes.ok) { setError("Failed to classify tracks"); return; }
    const { vibeVectors } = await classifyRes.json() as { vibeVectors: VibeVector[] };

    setPipelineStep(2);
    const clusterRes = await fetch("/api/cluster", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ vibeVectors }),
    });
    if (!clusterRes.ok) { setError("Failed to cluster tracks"); return; }
    const { assignments, centroids, positions2d, k } = await clusterRes.json();

    setPipelineStep(3);
    const clusterIds = [...new Set(assignments as number[])].sort((a, b) => a - b);
    const clusterSignatures = clusterIds.map((clusterId) => {
      const indices = (assignments as number[])
        .map((a, i) => (a === clusterId ? i : -1))
        .filter((i) => i >= 0);
      const clusterTracks = indices.map((i) => tracks[i]);
      const artistCounts = new Map<string, number>();
      const genreSet = new Set<string>();
      for (const t of clusterTracks) {
        for (const a of t.track.artists) {
          artistCounts.set(a.name, (artistCounts.get(a.name) ?? 0) + 1);
        }
        for (const g of t.genres) genreSet.add(g);
      }
      const topArtists = [...artistCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([name]) => name);
      const topGenres = [...genreSet].slice(0, 3);
      return { centroid: centroids[clusterId], topArtists, topGenres };
    });

    const nameRes = await fetch("/api/name", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clusters: clusterSignatures }),
    });
    if (!nameRes.ok) { setError("Failed to name playlists"); return; }
    const { names } = await nameRes.json() as { names: string[] };

    const clusters = buildClusters(tracks, vibeVectors, assignments, centroids, positions2d, names);
    setResult({ clusters, totalTracks: tracks.length });
    setPipelineStep(-1);
  }, []);

  if (status === "loading") return null;

  return (
    <main className="min-h-screen p-8 max-w-7xl mx-auto">
      <header className="flex items-center justify-between mb-12">
        <h1 className="text-2xl font-bold">Playlist Curator</h1>
        <span className="text-zinc-400 text-sm">{session?.user?.name}</span>
      </header>

      {!result && pipelineStep < 0 && (
        <div className="flex flex-col items-center justify-center gap-6 py-24">
          <CurateButton onClick={runPipeline} disabled={false} />
        </div>
      )}

      {pipelineStep >= 0 && <PipelineProgress currentStep={pipelineStep} />}

      {error && (
        <div className="text-center text-red-400 py-8">
          <p>{error}</p>
          <button onClick={runPipeline} className="mt-4 text-sm underline">
            Try again
          </button>
        </div>
      )}

      {result && (
        <div>
          <p className="text-zinc-400 text-sm mb-6">
            {result.totalTracks} tracks → {result.clusters.length} playlists
          </p>
          {/* List view and vibe map rendered by Tasks 7 and 8 */}
          <pre className="text-xs text-zinc-500 overflow-auto">
            {JSON.stringify(result.clusters.map(c => ({ name: c.name, tracks: c.tracks.length })), null, 2)}
          </pre>
        </div>
      )}
    </main>
  );
}
```

- [ ] **Step 4: Verify the full pipeline end-to-end**

```bash
npm run dev
```

Log in, navigate to `/curate`, click "Curate My Music." Verify:
- Progress steps advance as each API call completes
- Final result shows cluster names and track counts
- No errors in browser console or terminal

- [ ] **Step 5: Commit**

```bash
git add src/app/curate/page.tsx src/components/curate-button.tsx src/components/pipeline-progress.tsx
git commit -m "feat: curation pipeline orchestration with progress UI"
```

---

### Task 7: List View + Track Preview + Cluster Editing

**Files:**
- Create: `src/components/list-view.tsx`
- Create: `src/components/cluster-card.tsx`
- Create: `src/components/track-row.tsx`
- Create: `src/components/track-preview.tsx`
- Create: `src/components/view-toggle.tsx`
- Modify: `src/app/curate/page.tsx` — replace JSON dump with list view

**Interfaces:**
- Consumes: `CurationResult` from Task 6's state
- Produces: React components for viewing, previewing, and editing clusters. Editing mutates the `CurationResult` state in the curate page (move tracks between clusters, rename, merge, split, remove tracks).

- [ ] **Step 1: Create the track preview player**

`src/components/track-preview.tsx`:
```tsx
"use client";

import { useRef, useState } from "react";

export function TrackPreview({
  previewUrl,
  spotifyUrl,
}: {
  previewUrl: string | null;
  spotifyUrl: string;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);

  if (!previewUrl) {
    return (
      <a
        href={spotifyUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="text-green-500 hover:text-green-400 text-xs"
      >
        Open in Spotify
      </a>
    );
  }

  const toggle = () => {
    if (!audioRef.current) return;
    if (playing) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
    setPlaying(!playing);
  };

  return (
    <>
      <audio
        ref={audioRef}
        src={previewUrl}
        onEnded={() => setPlaying(false)}
      />
      <button
        onClick={toggle}
        className="w-8 h-8 flex items-center justify-center rounded-full bg-zinc-700 hover:bg-zinc-600 transition"
      >
        {playing ? "⏸" : "▶"}
      </button>
    </>
  );
}
```

- [ ] **Step 2: Create the track row component**

`src/components/track-row.tsx`:
```tsx
import type { ClassifiedTrack } from "@/lib/types";
import { TrackPreview } from "./track-preview";

export function TrackRow({
  track,
  onRemove,
  draggable = true,
  onDragStart,
}: {
  track: ClassifiedTrack;
  onRemove?: () => void;
  draggable?: boolean;
  onDragStart?: (e: React.DragEvent) => void;
}) {
  const albumArt = track.track.album.images[2]?.url ?? track.track.album.images[0]?.url;

  return (
    <div
      draggable={draggable}
      onDragStart={onDragStart}
      className="flex items-center gap-3 py-2 px-3 rounded-lg hover:bg-zinc-800/50 group cursor-grab"
    >
      {albumArt && (
        <img src={albumArt} alt="" className="w-10 h-10 rounded" />
      )}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{track.track.name}</p>
        <p className="text-xs text-zinc-400 truncate">
          {track.track.artists.map((a) => a.name).join(", ")}
        </p>
      </div>
      <TrackPreview
        previewUrl={track.track.preview_url}
        spotifyUrl={track.track.external_urls.spotify}
      />
      {onRemove && (
        <button
          onClick={onRemove}
          className="opacity-0 group-hover:opacity-100 text-zinc-500 hover:text-red-400 text-xs transition"
        >
          ✕
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Create the cluster card component**

`src/components/cluster-card.tsx`:
```tsx
"use client";

import { useState } from "react";
import type { Cluster, ClassifiedTrack } from "@/lib/types";
import { TrackRow } from "./track-row";

export function ClusterCard({
  cluster,
  onRename,
  onRemoveTrack,
  onDrop,
  onDragTrackStart,
}: {
  cluster: Cluster;
  onRename: (name: string) => void;
  onRemoveTrack: (trackId: string) => void;
  onDrop: (trackId: string, fromClusterId: string) => void;
  onDragTrackStart: (trackId: string, clusterId: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(cluster.name);

  const topArtists = (() => {
    const counts = new Map<string, number>();
    for (const t of cluster.tracks) {
      for (const a of t.track.artists) {
        counts.set(a.name, (counts.get(a.name) ?? 0) + 1);
      }
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([n]) => n);
  })();

  return (
    <div
      className="rounded-xl border border-zinc-800 bg-zinc-900 overflow-hidden"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        const data = e.dataTransfer.getData("text/plain");
        const [trackId, fromClusterId] = data.split("|");
        if (fromClusterId !== cluster.id) onDrop(trackId, fromClusterId);
      }}
    >
      <div
        className="h-24 flex items-end p-4"
        style={{ background: cluster.coverArtDataUrl }}
      >
        {editing ? (
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => { onRename(name); setEditing(false); }}
            onKeyDown={(e) => { if (e.key === "Enter") { onRename(name); setEditing(false); } }}
            autoFocus
            className="bg-transparent text-white text-lg font-bold outline-none border-b border-white/50"
          />
        ) : (
          <h3
            className="text-white text-lg font-bold cursor-pointer drop-shadow-lg"
            onClick={() => setEditing(true)}
          >
            {cluster.name}
          </h3>
        )}
      </div>

      <div className="p-4">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs text-zinc-400">
            {cluster.tracks.length} tracks · {topArtists.join(", ")}
          </span>
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-xs text-zinc-500 hover:text-zinc-300"
          >
            {expanded ? "Collapse" : "Expand"}
          </button>
        </div>

        {expanded && (
          <div className="flex flex-col max-h-80 overflow-y-auto">
            {cluster.tracks.map((track) => (
              <TrackRow
                key={track.track.id}
                track={track}
                onRemove={() => onRemoveTrack(track.track.id)}
                onDragStart={(e) => {
                  e.dataTransfer.setData("text/plain", `${track.track.id}|${cluster.id}`);
                  onDragTrackStart(track.track.id, cluster.id);
                }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Create the list view**

`src/components/list-view.tsx`:
```tsx
"use client";

import type { Cluster } from "@/lib/types";
import { ClusterCard } from "./cluster-card";

export function ListView({
  clusters,
  onUpdateClusters,
}: {
  clusters: Cluster[];
  onUpdateClusters: (clusters: Cluster[]) => void;
}) {
  const handleRename = (clusterId: string, newName: string) => {
    onUpdateClusters(
      clusters.map((c) => (c.id === clusterId ? { ...c, name: newName } : c))
    );
  };

  const handleRemoveTrack = (clusterId: string, trackId: string) => {
    onUpdateClusters(
      clusters.map((c) =>
        c.id === clusterId
          ? { ...c, tracks: c.tracks.filter((t) => t.track.id !== trackId) }
          : c
      )
    );
  };

  const handleMoveTrack = (
    targetClusterId: string,
    trackId: string,
    fromClusterId: string
  ) => {
    const sourceCluster = clusters.find((c) => c.id === fromClusterId);
    const track = sourceCluster?.tracks.find((t) => t.track.id === trackId);
    if (!track) return;

    onUpdateClusters(
      clusters.map((c) => {
        if (c.id === fromClusterId) {
          return { ...c, tracks: c.tracks.filter((t) => t.track.id !== trackId) };
        }
        if (c.id === targetClusterId) {
          return { ...c, tracks: [...c.tracks, { ...track, clusterId: targetClusterId }] };
        }
        return c;
      })
    );
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {clusters.map((cluster) => (
        <ClusterCard
          key={cluster.id}
          cluster={cluster}
          onRename={(name) => handleRename(cluster.id, name)}
          onRemoveTrack={(trackId) => handleRemoveTrack(cluster.id, trackId)}
          onDrop={(trackId, fromId) => handleMoveTrack(cluster.id, trackId, fromId)}
          onDragTrackStart={() => {}}
        />
      ))}
    </div>
  );
}
```

- [ ] **Step 5: Create the view toggle**

`src/components/view-toggle.tsx`:
```tsx
"use client";

export function ViewToggle({
  view,
  onToggle,
}: {
  view: "map" | "list";
  onToggle: (view: "map" | "list") => void;
}) {
  return (
    <div className="flex rounded-lg border border-zinc-700 overflow-hidden text-sm">
      <button
        onClick={() => onToggle("map")}
        className={`px-4 py-2 transition ${
          view === "map" ? "bg-zinc-700 text-white" : "text-zinc-400 hover:text-zinc-200"
        }`}
      >
        Vibe Map
      </button>
      <button
        onClick={() => onToggle("list")}
        className={`px-4 py-2 transition ${
          view === "list" ? "bg-zinc-700 text-white" : "text-zinc-400 hover:text-zinc-200"
        }`}
      >
        List
      </button>
    </div>
  );
}
```

- [ ] **Step 6: Wire list view into the curation page**

In `src/app/curate/page.tsx`, replace the JSON dump block (`{result && (...)}`) with:

```tsx
import { ListView } from "@/components/list-view";
import { ViewToggle } from "@/components/view-toggle";
// Add state:
const [view, setView] = useState<"map" | "list">("list");

// Replace the result rendering:
{result && (
  <div>
    <div className="flex items-center justify-between mb-6">
      <p className="text-zinc-400 text-sm">
        {result.totalTracks} tracks → {result.clusters.length} playlists
      </p>
      <ViewToggle view={view} onToggle={setView} />
    </div>
    {view === "list" && (
      <ListView
        clusters={result.clusters}
        onUpdateClusters={(clusters) => setResult({ ...result, clusters })}
      />
    )}
    {view === "map" && (
      <p className="text-zinc-500 text-center py-12">Vibe map coming next</p>
    )}
  </div>
)}
```

- [ ] **Step 7: Add merge and regenerate-name to cluster card**

In `src/components/cluster-card.tsx`, add a "Regenerate name" button inside the card footer (after the expand/collapse button) that calls a new `onRegenerateName` prop. Wire it through `ListView` to call `POST /api/name` with just that cluster's signature.

Add a merge affordance: when a cluster card is dragged and dropped onto another card (not a track, but the card header itself), merge the two clusters. In `ListView`, add a `handleMerge` function that combines the tracks of two clusters into one and removes the empty cluster.

```tsx
// In ClusterCard, add after the expand/collapse button:
<button
  onClick={onRegenerateName}
  className="text-xs text-zinc-500 hover:text-zinc-300"
>
  Regenerate name
</button>

// In ListView, add handler:
const handleMerge = (targetId: string, sourceId: string) => {
  const source = clusters.find((c) => c.id === sourceId);
  if (!source) return;
  onUpdateClusters(
    clusters
      .map((c) => {
        if (c.id === targetId) {
          return { ...c, tracks: [...c.tracks, ...source.tracks] };
        }
        return c;
      })
      .filter((c) => c.id !== sourceId)
  );
};
```

- [ ] **Step 8: Verify in browser**

```bash
npm run dev
```

Run the full pipeline, then verify in the list view:
- Cluster cards show gradient covers and names
- Click a name to edit it inline
- Expand a cluster to see tracks
- Play button works for tracks with preview_url
- "Open in Spotify" link works for tracks without preview_url
- Drag a track from one cluster card and drop it on another
- "Regenerate name" produces a new name for the cluster
- Merging two clusters combines their tracks

- [ ] **Step 9: Commit**

```bash
git add src/components/list-view.tsx src/components/cluster-card.tsx src/components/track-row.tsx \
  src/components/track-preview.tsx src/components/view-toggle.tsx src/app/curate/page.tsx
git commit -m "feat: list view with cluster cards, track preview, drag-and-drop editing"
```

---

### Task 8: Vibe Map Visualization (D3)

**Files:**
- Create: `src/components/vibe-map.tsx`
- Modify: `src/app/curate/page.tsx` — wire vibe map into the "map" view toggle

**Interfaces:**
- Consumes: `CurationResult` (clusters with `position2d` on each track) from the curate page state
- Produces: Interactive D3 force-directed graph with zoom levels, node interaction, and drag-to-move-between-clusters.

- [ ] **Step 1: Create the vibe map component**

`src/components/vibe-map.tsx`:
```tsx
"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import * as d3 from "d3";
import type { Cluster, ClassifiedTrack } from "@/lib/types";

const CLUSTER_COLORS = [
  "#3987e5", "#d95926", "#1baf7a", "#c98500", "#d55181",
  "#008300", "#9085e9", "#e66767", "#5DCAA5", "#F0997B",
  "#AFA9EC", "#ED93B1",
];

interface MapNode {
  track: ClassifiedTrack;
  x: number;
  y: number;
  clusterId: string;
  clusterIndex: number;
}

export function VibeMap({
  clusters,
  onMoveTrack,
}: {
  clusters: Cluster[];
  onMoveTrack: (trackId: string, fromClusterId: string, toClusterId: string) => void;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [focusedCluster, setFocusedCluster] = useState<string | null>(null);
  const [tooltip, setTooltip] = useState<{
    track: ClassifiedTrack;
    x: number;
    y: number;
  } | null>(null);

  const allNodes: MapNode[] = clusters.flatMap((cluster, ci) =>
    cluster.tracks.map((track) => ({
      track,
      x: track.position2d.x,
      y: track.position2d.y,
      clusterId: cluster.id,
      clusterIndex: ci,
    }))
  );

  useEffect(() => {
    if (!svgRef.current || allNodes.length === 0) return;

    const svg = d3.select(svgRef.current);
    const width = svgRef.current.clientWidth;
    const height = svgRef.current.clientHeight;

    svg.selectAll("*").remove();

    const xs = allNodes.map((n) => n.x);
    const ys = allNodes.map((n) => n.y);
    const xScale = d3
      .scaleLinear()
      .domain([Math.min(...xs) - 1, Math.max(...xs) + 1])
      .range([60, width - 60]);
    const yScale = d3
      .scaleLinear()
      .domain([Math.min(...ys) - 1, Math.max(...ys) + 1])
      .range([60, height - 60]);

    const g = svg.append("g");

    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.5, 8])
      .on("zoom", (event) => g.attr("transform", event.transform));
    svg.call(zoom);

    const visibleNodes = focusedCluster
      ? allNodes.filter((n) => n.clusterId === focusedCluster)
      : allNodes;

    g.selectAll("circle")
      .data(visibleNodes)
      .join("circle")
      .attr("cx", (d) => xScale(d.x))
      .attr("cy", (d) => yScale(d.y))
      .attr("r", focusedCluster ? 8 : 4)
      .attr("fill", (d) => CLUSTER_COLORS[d.clusterIndex % CLUSTER_COLORS.length])
      .attr("opacity", 0.8)
      .style("cursor", "pointer")
      .style("filter", (d) => {
        const energy = d.track.vibeVector.energy;
        return `drop-shadow(0 0 ${Math.round(energy * 6)}px ${CLUSTER_COLORS[d.clusterIndex % CLUSTER_COLORS.length]}40)`;
      })
      .on("mouseenter", function (event, d) {
        d3.select(this).attr("r", focusedCluster ? 12 : 6).attr("opacity", 1);
        setTooltip({
          track: d.track,
          x: event.offsetX,
          y: event.offsetY,
        });
      })
      .on("mouseleave", function () {
        d3.select(this).attr("r", focusedCluster ? 8 : 4).attr("opacity", 0.8);
        setTooltip(null);
      })
      .on("click", function (_, d) {
        if (!focusedCluster) {
          setFocusedCluster(d.clusterId);
        }
      });

    if (!focusedCluster) {
      const clusterCentroids = clusters.map((cluster, ci) => {
        const cTracks = allNodes.filter((n) => n.clusterId === cluster.id);
        const cx = d3.mean(cTracks, (t) => xScale(t.x)) ?? 0;
        const cy = d3.mean(cTracks, (t) => yScale(t.y)) ?? 0;
        return { cluster, cx, cy, ci };
      });

      g.selectAll("text.cluster-label")
        .data(clusterCentroids)
        .join("text")
        .attr("class", "cluster-label")
        .attr("x", (d) => d.cx)
        .attr("y", (d) => d.cy - 20)
        .attr("text-anchor", "middle")
        .attr("fill", (d) => CLUSTER_COLORS[d.ci % CLUSTER_COLORS.length])
        .attr("font-size", "13px")
        .attr("font-weight", "500")
        .attr("opacity", 0.9)
        .text((d) => d.cluster.name)
        .style("cursor", "pointer")
        .on("click", (_, d) => setFocusedCluster(d.cluster.id));
    }
  }, [allNodes, focusedCluster, clusters]);

  return (
    <div className="relative w-full rounded-xl border border-zinc-800 bg-zinc-950 overflow-hidden"
      style={{ height: "70vh" }}>
      {focusedCluster && (
        <button
          onClick={() => setFocusedCluster(null)}
          className="absolute top-4 left-4 z-10 px-3 py-1 text-sm rounded-lg
            bg-zinc-800 border border-zinc-700 text-zinc-300 hover:text-white transition"
        >
          ← All clusters
        </button>
      )}
      <svg ref={svgRef} className="w-full h-full" />
      {tooltip && (
        <div
          className="absolute pointer-events-none bg-zinc-800 border border-zinc-700
            rounded-lg px-3 py-2 text-sm shadow-xl z-20"
          style={{ left: tooltip.x + 12, top: tooltip.y - 10 }}
        >
          <p className="font-medium">{tooltip.track.track.name}</p>
          <p className="text-zinc-400 text-xs">
            {tooltip.track.track.artists.map((a) => a.name).join(", ")}
          </p>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Wire vibe map into the curation page**

In `src/app/curate/page.tsx`, import the vibe map and replace the placeholder:

```tsx
import { VibeMap } from "@/components/vibe-map";

// Replace the map placeholder:
{view === "map" && (
  <VibeMap
    clusters={result.clusters}
    onMoveTrack={(trackId, fromId, toId) => {
      const source = result.clusters.find((c) => c.id === fromId);
      const track = source?.tracks.find((t) => t.track.id === trackId);
      if (!track) return;
      setResult({
        ...result,
        clusters: result.clusters.map((c) => {
          if (c.id === fromId) return { ...c, tracks: c.tracks.filter((t) => t.track.id !== trackId) };
          if (c.id === toId) return { ...c, tracks: [...c.tracks, { ...track, clusterId: toId }] };
          return c;
        }),
      });
    }}
  />
)}
```

- [ ] **Step 3: Verify in browser**

```bash
npm run dev
```

Run the pipeline, toggle to "Vibe Map" view. Verify:
- Tracks appear as colored dots grouped into visible clusters
- Cluster names float near their groups
- Dots glow subtly (energy-based)
- Hovering a dot shows track name and artist
- Clicking a cluster zooms into it (dots grow, labels disappear)
- "← All clusters" button returns to full view
- Mouse scroll zooms in/out

- [ ] **Step 4: Commit**

```bash
git add src/components/vibe-map.tsx src/app/curate/page.tsx
git commit -m "feat: D3 vibe map constellation with cluster zoom and track tooltips"
```

---

### Task 9: Push to Spotify

**Files:**
- Create: `src/components/push-dialog.tsx`
- Create: `src/app/api/push/route.ts`
- Modify: `src/app/curate/page.tsx` — add push button and dialog

**Interfaces:**
- Consumes: `Cluster[]` (with names, tracks, cover art) from the curate page state; `auth()` for the access token
- Produces: Creates private playlists on the user's Spotify account with tracks and cover art. API route `POST /api/push` accepts `{ playlists: { name, trackUris, coverGradient }[] }` and returns `{ results: { name, spotifyUrl, trackCount }[] }`.

- [ ] **Step 1: Create the push API route**

`src/app/api/push/route.ts`:
```typescript
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
    const playlist = await createRes.json();

    for (let i = 0; i < pl.trackUris.length; i += 100) {
      await spotifyFetch(`${SPOTIFY_API}/playlists/${playlist.id}/tracks`, accessToken, {
        method: "POST",
        body: JSON.stringify({ uris: pl.trackUris.slice(i, i + 100) }),
      });
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
}
```

- [ ] **Step 2: Add client-side canvas cover art renderer**

Add to `src/lib/cover-art.ts`:
```typescript
export function renderCoverToBase64(
  colors: string[],
  angle: number,
  name: string
): Promise<string> {
  return new Promise((resolve) => {
    const canvas = document.createElement("canvas");
    canvas.width = 640;
    canvas.height = 640;
    const ctx = canvas.getContext("2d")!;

    const rad = (angle * Math.PI) / 180;
    const x0 = 320 + 320 * Math.cos(rad + Math.PI);
    const y0 = 320 + 320 * Math.sin(rad + Math.PI);
    const x1 = 320 + 320 * Math.cos(rad);
    const y1 = 320 + 320 * Math.sin(rad);
    const gradient = ctx.createLinearGradient(x0, y0, x1, y1);
    colors.forEach((c, i) => gradient.addColorStop(i / (colors.length - 1), c));
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 640, 640);

    // Subtle noise
    const imageData = ctx.getImageData(0, 0, 640, 640);
    for (let i = 0; i < imageData.data.length; i += 4) {
      const noise = (Math.random() - 0.5) * 15;
      imageData.data[i] += noise;
      imageData.data[i + 1] += noise;
      imageData.data[i + 2] += noise;
    }
    ctx.putImageData(imageData, 0, 0);

    // Playlist name overlay
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.font = "bold 36px Inter, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(name, 320, 320, 580);

    resolve(canvas.toDataURL("image/jpeg", 0.9).split(",")[1]);
  });
}
```

- [ ] **Step 3: Create the push dialog component**

`src/components/push-dialog.tsx`:
```tsx
"use client";

import { useState } from "react";
import type { Cluster } from "@/lib/types";

interface PushResult {
  name: string;
  spotifyUrl: string;
  trackCount: number;
}

export function PushDialog({
  clusters,
  onClose,
}: {
  clusters: Cluster[];
  onClose: () => void;
}) {
  const [pushing, setPushing] = useState(false);
  const [results, setResults] = useState<PushResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handlePush = async () => {
    setPushing(true);
    setError(null);

    const { generateCoverArtCSS, renderCoverToBase64 } = await import("@/lib/cover-art");

    const playlists = await Promise.all(
      clusters
        .filter((c) => c.tracks.length > 0)
        .map(async (c) => {
          const { colors, angle } = generateCoverArtCSS(c.centroid);
          const coverImageBase64 = await renderCoverToBase64(colors, angle, c.name);
          return {
            name: c.name,
            trackUris: c.tracks.map((t) => `spotify:track:${t.track.id}`),
            coverImageBase64,
          };
        })
    );

    const res = await fetch("/api/push", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ playlists }),
    });

    if (!res.ok) {
      setError("Failed to create playlists");
      setPushing(false);
      return;
    }

    const data = await res.json();
    setResults(data.results);
    setPushing(false);
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 max-w-lg w-full mx-4">
        {!results ? (
          <>
            <h2 className="text-lg font-bold mb-4">Create Playlists on Spotify</h2>
            <div className="space-y-2 mb-6">
              {clusters
                .filter((c) => c.tracks.length > 0)
                .map((c) => (
                  <div key={c.id} className="flex justify-between text-sm">
                    <span>{c.name}</span>
                    <span className="text-zinc-400">{c.tracks.length} tracks</span>
                  </div>
                ))}
            </div>
            <div className="flex gap-3 justify-end">
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm rounded-lg border border-zinc-700 hover:bg-zinc-800 transition"
              >
                Cancel
              </button>
              <button
                onClick={handlePush}
                disabled={pushing}
                className="px-4 py-2 text-sm rounded-lg bg-green-600 hover:bg-green-500
                  disabled:bg-zinc-700 text-white transition"
              >
                {pushing ? "Creating..." : "Create Playlists"}
              </button>
            </div>
          </>
        ) : (
          <>
            <h2 className="text-lg font-bold mb-4">Playlists Created</h2>
            <div className="space-y-3 mb-6">
              {results.map((r) => (
                <div key={r.spotifyUrl} className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">{r.name}</p>
                    <p className="text-xs text-zinc-400">{r.trackCount} tracks</p>
                  </div>
                  <a
                    href={r.spotifyUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-green-500 hover:text-green-400 text-sm"
                  >
                    Open in Spotify →
                  </a>
                </div>
              ))}
            </div>
            <button
              onClick={onClose}
              className="w-full px-4 py-2 text-sm rounded-lg bg-zinc-800 hover:bg-zinc-700 transition"
            >
              Done
            </button>
          </>
        )}
        {error && <p className="text-red-400 text-sm mt-3">{error}</p>}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Add push button to the curation page**

In `src/app/curate/page.tsx`, add state and the push dialog:

```tsx
import { PushDialog } from "@/components/push-dialog";

// Add state:
const [showPush, setShowPush] = useState(false);

// Add button next to the ViewToggle in the result header:
<button
  onClick={() => setShowPush(true)}
  className="px-5 py-2 bg-green-600 hover:bg-green-500 text-white text-sm font-medium rounded-full transition"
>
  Create Playlists
</button>

// Add dialog at the bottom of the component, before closing </main>:
{showPush && result && (
  <PushDialog
    clusters={result.clusters}
    onClose={() => setShowPush(false)}
  />
)}
```

- [ ] **Step 4: Verify end-to-end**

```bash
npm run dev
```

Run the full pipeline, edit some clusters if desired, click "Create Playlists." Verify:
- Dialog shows all playlists with track counts
- "Create Playlists" button triggers API call
- Playlists appear in the user's Spotify account as private playlists
- "Open in Spotify" links work
- Tracks are in the correct playlists

- [ ] **Step 5: Commit**

```bash
git add src/app/api/push/route.ts src/components/push-dialog.tsx src/app/curate/page.tsx
git commit -m "feat: push curated playlists to Spotify with cover art"
```

---

## Post-Implementation

After all tasks are complete:

1. **Run full test suite:** `npm test`
2. **End-to-end manual test:** Login → Curate → edit in both views → push to Spotify
3. **Deploy to Vercel:** Connect the repo, set environment variables, deploy
4. **Set Spotify redirect URI:** Update to the Vercel production URL
5. **Add test users:** Allowlist Spotify emails in the developer dashboard
