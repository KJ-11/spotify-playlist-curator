# Spotify Playlist Curator — v1 Design Spec

## Overview

A multi-user web app that turns messy Spotify listening habits into curated playlists. Users authenticate with Spotify, the app pulls their listening data, classifies tracks on 13 vibe dimensions using Jev, clusters them into proposed playlists, and lets users preview/edit/push playlists back to their Spotify account.

**Target:** Deployed web app on Vercel. Spotify Development Mode (25 manually allowlisted users) for v1.

## Stack

- **Framework:** Next.js (App Router) + TypeScript
- **Styling:** Tailwind CSS, dark theme default
- **Auth:** NextAuth with Spotify provider
- **Deployment:** Vercel (free tier)
- **Classification:** Jev (TypeSafe AI) — 13-dimension vibe scoring
- **Naming:** Claude API — playlist name generation
- **Visualization:** D3.js force simulation + umap-js for dimensionality reduction
- **Database:** None. Spotify is the persistence layer; all session state lives in React state.

## Spotify App Setup

### Registration

1. Create app at developer.spotify.com/dashboard
2. Redirect URI: `<vercel-url>/api/auth/callback/spotify`
3. Client ID + Client Secret in `.env.local`
4. Development Mode (default) — add users by Spotify email, max 25

### OAuth Scopes

| Scope | Purpose |
|-------|---------|
| `user-read-recently-played` | Paginate listening history |
| `user-top-read` | Top tracks/artists (short/medium/long term) |
| `user-library-read` | Saved/liked tracks |
| `playlist-modify-public` | Create public playlists |
| `playlist-modify-private` | Create private playlists |
| `ugc-image-upload` | Upload generated cover art |

### Token Management

Access tokens expire after 1 hour. NextAuth handles refresh automatically via refresh token rotation configured in the NextAuth Spotify provider.

## Data Ingestion

### Sources (pulled on-demand when user clicks "Curate")

1. **Recently played** — paginate backwards using `before` cursor until exhausted (yields a few hundred tracks from recent weeks)
2. **Top tracks** — all 3 time ranges (short ~4wk, medium ~6mo, long ~all-time), paginated to their limits (~100 per range, ~300 total)
3. **Saved/liked tracks** — paginated, capped at 500 for v1

### Processing

- Deduplicate across all sources by track ID
- Fetch audio features via `/audio-features` endpoint (batched 100 per request): energy, valence, tempo, danceability, acousticness, instrumentalness, liveness, speechiness
- Collect metadata: genre tags (from artist endpoint), release year, popularity

### Caveats

- **Audio features endpoint:** Currently available but was briefly deprecated in late 2024. The fetch is isolated into its own module so it's swappable if the endpoint goes away — Jev classification on metadata alone would be the fallback.
- **Rate limiting:** Spotify allows ~180 requests/30s per app. Fine for 25 users. Basic retry-with-backoff on 429 responses.

## Classification — Jev Vibe Scoring

For each track, Jev receives audio features + metadata (genre tags, release year, popularity, artist info) and returns a 13-dimension vibe vector, each scored 0.0–1.0.

### Feeling Dimensions (8)

| # | Dimension | 0.0 | 1.0 |
|---|-----------|-----|-----|
| 1 | Energy | Still, ambient | Explosive, maximal |
| 2 | Valence | Dark, aching | Bright, buoyant |
| 3 | Tension | Resolved, at peace | Restless, uneasy |
| 4 | Depth | Surface, breezy | Heavy, hits different |
| 5 | Warmth | Cold, clinical | Warm, organic |
| 6 | Swagger | Vulnerable, soft | Commanding, strutting |
| 7 | Sensuality | Cerebral, heady | Bodily, groove-first |
| 8 | Nostalgia | Present, fresh | Wistful, throwback |

### Context Dimensions (5)

| # | Dimension | 0.0 | 1.0 |
|---|-----------|-----|-----|
| 9 | Movement | Stillness, seated | Running, dancing |
| 10 | Focus | Attention-demanding | Background-able |
| 11 | Social | Solitary, headphones | Shared, communal |
| 12 | Intimacy | Arena-scale | Whispered, private |
| 13 | Time of day | Morning, sunrise | Late night, 2am |

### Inference Confidence

- **HIGH** (reliable from audio features alone): Energy, Valence, Movement, Focus
- **MEDIUM-HIGH** (strong with audio + metadata): Tension, Sensuality, Social, Intimacy
- **MEDIUM** (depends on genre tags + release year): Depth, Warmth, Swagger, Time of Day, Nostalgia

Genre tags and artist metadata are passed to Jev alongside audio features to support MEDIUM-confidence dimensions.

### Cost

~$0.04 per million input tokens, free output. Classifying 500 tracks costs effectively nothing.

## Clustering

### Method

K-means on the 13-dimension vibe vectors. Runs server-side in an API route alongside UMAP. Target 5–12 clusters.

### Post-Processing

- **Merge** clusters with < 5 tracks into their nearest neighbor by centroid distance
- **Split** clusters with > 30 tracks by highest-variance dimension
- Final target: 5–12 clusters, each with 15–60 tracks

### Dimensionality Reduction (for visualization)

UMAP (via `umap-js`) projects the 13D vectors to 2D for the vibe map. Runs server-side in an API route. UMAP preserves global structure — similar clusters stay near each other on the map.

## Playlist Naming

Claude API generates names from each cluster's signature:
- Average scores across all 13 dimensions
- Top 5 artists and top 3 genres in the cluster

**Style:** Short (2–4 words), atmospheric, evocative — like album titles or film scenes. Not lifestyle blog headings. "2am Highway" not "Sunday Slow Burn."

One API call per cluster. User can rename inline before pushing.

### Cost

~$0.01 per batch of 10 clusters.

## Cover Art Generation

Generative gradient covers, no image gen API. Each cluster's dimension scores map to visual properties:

| Dimension | Visual property |
|-----------|----------------|
| Valence | Hue — warm oranges/pinks (bright) ↔ cool blues/purples (dark) |
| Energy | Saturation + contrast — vivid (high) ↔ muted/pastel (low) |
| Warmth | Color temperature shift |
| Time of Day | Brightness — light (morning) ↔ deep/dark (late night) |
| Tension | Gradient angle + sharpness — smooth blends (resolved) ↔ sharp transitions (tense) |

- Rendered as 640×640 canvas (Spotify's playlist cover size)
- 2–3 color gradient with subtle noise texture
- Playlist name overlaid in clean type
- Generated client-side, exported as JPEG for Spotify API upload

## UI & User Flow

### Step 1: Login

"Connect Spotify" button → OAuth redirect → land back authenticated.

### Step 2: Pull & Classify

"Curate My Music" button. Loading state while the pipeline runs:
fetch tracks → deduplicate → audio features → Jev classify → k-means cluster → Claude names → generate covers → render results.

### Step 3: Review & Edit

Two views (toggle between them):

#### Vibe Map (default)

Interactive force-directed graph visualization (D3 + UMAP).

**Zoomed out:**
- Each track is a small dot, colored by cluster
- Clusters form visible nebulae — similar clusters positioned near each other
- Cluster names float nearby, generated cover art as subtle background
- Dark background, nodes glow subtly based on energy score
- Thin connecting lines between most similar tracks within a cluster
- Subtle parallax/depth effect on mouse move

**Click a cluster → zoom in:**
- Smooth zoom transition
- Individual track nodes grow, show album art thumbnails
- Track names on hover
- Play preview button (preview_url, falls back to Spotify link)
- Drag tracks to other clusters

#### List View

Clusters as cards:
- Generated cover art + editable name
- Track count and top artists
- Expandable track list with title, artist, album art, play button
- Drag-and-drop tracks between clusters
- Remove tracks from a cluster
- Merge clusters (drag card onto another)
- Split cluster (select tracks → "Move to new playlist")
- "Regenerate name" button per cluster

### Step 4: Push to Spotify

"Create Playlists" button. For each cluster:
1. Create private playlist on user's account
2. Add tracks
3. Upload generated cover art

Confirmation screen with links to open each playlist in Spotify.

### Design Notes

- All state in React state — no persistence between sessions
- Desktop-first, responsive
- Dark theme default (matches Spotify aesthetic)
- Tailwind CSS

## Track Preview

- Try `preview_url` first (30-second clip, played in a simple `<audio>` element)
- If `preview_url` is null, fall back to a Spotify deep link that opens the track in the user's Spotify app
- Preview availability has been declining — many tracks return null. The fallback ensures every track is still accessible.

## External Services

| Service | Purpose | Cost |
|---------|---------|------|
| Spotify Web API | Music data + playlist creation | Free |
| Jev (TypeSafe) | 13-dimension vibe classification | ~$0.04/M input tokens |
| Claude API | Playlist naming | ~$0.01 per session |
| Vercel | Hosting | Free tier |

All API keys in environment variables, called from server-side API routes only.

## Not in v1

- AI-generated cover art (image gen API)
- Persistent history / session storage
- Mobile-optimized layout
- Public quota (Spotify Extended Quota Mode)
- Collaborative playlist editing
- Scheduled/automatic curation runs
