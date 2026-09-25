# Playlist Curator — Repair & Rebuild Plan (2026-09-24)

## TL;DR

The app is broken for a structural reason, not a bug-of-the-day reason: it was designed
against a Spotify Web API that no longer exists for Development Mode apps. Every fix so
far has peeled off one 403 only to hit the next. Beyond that, the curation core
(LLM guesses 13 quantized "vibe" scores from title+artist → k-means) is too thin a signal
to produce coherent playlists even when it runs.

Plan: (P0) unbreak the pipeline end-to-end against the *current* API, (P1) replace the lost
Spotify data with real external features, (P2) rebuild clustering around those features,
(P3) fix UX/error states, (P4) caching/infra/tests so it stays fixed.

---

## Evidence

### Prod logs (Vercel, 2026-09-24 ~21:03)
```
GET /api/tracks  error
Spotify audio-features endpoint returned 403 — skipping audio features
Failed to fetch tracks: Error: Spotify API request failed with status 403:
  https://api.spotify.com/v1/artists?ids=7CajNmpb...
```
Recently-played, top tracks, and saved tracks all succeed. It dies on the batch artists call.

### Spotify API state (verified against developer.spotify.com)
**Nov 2024 (new / dev-mode apps):** audio-features, audio-analysis, recommendations,
related-artists removed; `preview_url` is null.

**Feb 2026 (enforced for existing dev-mode apps from 2026-03-09):**
- App owner must have Premium; **max 5 allow-listed users**; 1 dev client ID per developer.
- Removed endpoints this app uses:
  - `GET /artists?ids=` (batch): **the current crash**
  - `POST /users/{id}/playlists` → `POST /me/playlists`
  - `POST /playlists/{id}/tracks` → `POST /playlists/{id}/items`
- Removed fields: track `popularity`, `available_markets`, `linked_from`; artist `popularity`, `followers`;
  album `popularity`, `label`. (`external_ids`/ISRC was removed then **restored** in March 2026.)
- Artist `genres` is marked **deprecated** (often empty).
- Extended Quota (to escape the 5-user cap) now requires an established business with meaningful
  scale, so treat this as a **personal / ≤5-user tool** permanently.

### Replacement data sources (probed live today)
| Source | What it gives | Auth | Result on your real track IDs |
|---|---|---|---|
| **ReccoBeats** `GET api.reccobeats.com/v1/audio-features?ids=<spotify ids>` | acousticness, danceability, energy, instrumentalness, key, liveness, loudness, mode, speechiness, tempo, valence | none | **35/40 hit (88%)**, ~0.4s per 40-id batch, max 40 ids/req. Response keys by `href` (open.spotify.com/track/{id}), not by Spotify id. |
| **Deezer** `GET api.deezer.com/track/isrc:{ISRC}` | `bpm`, `gain`, **30s preview mp3**, release_date, rank | none | Works. Preview URLs are signed and **expire in ~15 min**, so fetch them lazily. Rate limit: 50 req / 5s. |
| **Last.fm** `track.getTopTags` / `artist.getTopTags` | crowd-sourced genre + mood tags (the real replacement for Spotify genres) | free API key | Not probed (needs key). |

---

## Bug inventory (from reading every file)

### Pipeline-breaking
1. `lib/spotify.ts` `fetchArtistGenres` → `GET /artists?ids=` → 403 → whole `/api/tracks` 500s. **(current prod failure)**
2. `lib/jev.ts:buildJevState` reads `track.track.release_date`. Spotify puts that on
   `track.album.release_date`, so this throws `TypeError` on **every real track**. `/api/classify` would
   500 on the next step even after #1 is fixed. Test fixtures put `release_date` on the track, so tests pass while prod breaks.
3. `api/push`: uses removed `POST /users/{id}/playlists` and `POST /playlists/{id}/tracks`. Push would 403.
4. Local files / unavailable items: `is_local` tracks have `id: null` and saved items can have `track: null`.
   Nothing filters them, so they poison dedup, the ReccoBeats batch, and the `spotify:track:null` URIs on push.
5. No `maxDuration` on routes. Classify runs ~30 **sequential** Sonnet calls (batches of 20, 4096 max_tokens)
   for ~600 tracks, which is minutes. It's one timeout away from failing.

### Silent failures / bad error states
6. `curate/page.tsx`: on `!res.ok` it calls `setError` and `return`s **without resetting `pipelineStep`**.
   Result: spinner spins forever next to the error, and the Curate button stays hidden.
7. Server errors are flattened to "Failed to fetch tracks". No distinction between expired session (401),
   user not on dev-mode allowlist (403), Spotify down, and our bug.
8. Token refresh failure sets `accessToken: undefined` but the session still reads as `authenticated`.
   The user gets a generic failure instead of a re-login prompt. No `token.error` is surfaced.
9. `classify-claude.ts`: regex-extracts JSON from free text. On a malformed/short array, missing tracks
   silently become all-2s ("neutral"), so garbage vectors cluster together invisibly.
10. Cover upload: result ignored. A 640×640 JPEG at q=0.9 **with per-pixel noise** is likely > the 256KB
    base64 limit, so covers probably fail silently. All covers go in one POST body (Vercel 4.5MB limit risk).
11. Push is all-or-nothing on the server but side-effecting. A failure on playlist 4 leaves 1–3 created,
    and "retry" duplicates them.
12. `list-view` regenerate-name failure is swallowed with no feedback.

### Dead / misleading code
13. `lib/jev.ts` + `@typesafe-ai/sdk` dependency: unused (route aliases the Claude classifier), signups closed.
14. `VibeMap` accepts `onMoveTrack` and ignores it. Map drag doesn't exist.
15. `topGenres = [...genreSet].slice(0, 3)` is insertion order, not frequency (and genres are empty now anyway).
16. README is create-next-app boilerplate.

---

## Why the curation is "vibes alone" (and why just adding features isn't enough)

Current signal per track: title, artist, year (actually crashes), audio features (always null now),
genres (403 / deprecated). So Claude scores 13 dimensions **from its memory of the song name**, quantized to 0–4.

Problems even when it works:
- **Low information:** 13 dims × 5 levels, heavily correlated (energy≈movement≈social; focus≈−energy;
  intimacy≈−social). Effective dimensionality is ~3–4, so k-means mostly splits along energy/valence.
- **No coherence axes:** real playlists cohere on genre family, era, language, tempo, *and* mood.
  Today Bon Iver and lo-fi city pop share a playlist because both are "warm, intimate".
- **Forced sizes:** min 5 clusters, merge <5, split >30. Playlist boundaries are dictated by constants, not data.
- **No outlier concept:** every track must land somewhere, so each playlist gets a few that obviously don't belong.
- **Hallucination risk:** obscure tracks get confidently invented scores.

---

## The Plan

### P0: Unbreak end-to-end (small, ship first)
Goal: a user can log in → curate → see playlists → push, against today's API.
- [ ] `spotify.ts`: delete `fetchArtistGenres` batch call (genres come from P1). Filter `is_local`, null tracks, null ids.
- [ ] Fix `release_date` → `track.album.release_date` (add `album.release_date` + `external_ids.isrc` to `SpotifyTrack` type; drop `popularity`).
- [ ] `push`: `POST /me/playlists`, `POST /playlists/{id}/items`. Check cover `PUT` status, and log + report it per playlist.
- [ ] `curate/page.tsx`: reset `pipelineStep` on every failure path. Show the server's error `code`/message.
- [ ] Routes return typed errors `{ code: "AUTH_EXPIRED" | "NOT_ALLOWLISTED" | "SPOTIFY_ERROR" | "UPSTREAM_AI" | "INTERNAL", message }`. Map Spotify 401/403 correctly.
- [ ] `auth.ts`: set `token.error = "RefreshFailed"`, expose on session; client forces `signIn("spotify")` on it.
- [ ] `export const maxDuration = 300` on classify/cluster/name/push.
- [ ] Fix test fixtures to match **real** Spotify shapes (capture one real `/api/tracks` payload, redact, commit as fixture).
- [ ] Delete `jev.ts` + `@typesafe-ai/sdk`.

### P1: Real feature ingestion
Goal: each track carries measured audio features + genre/mood tags, not guesses.
- [ ] **ReccoBeats audio features** (batch 40, concurrency ~4, map by href→Spotify id). Best-effort: missing = null.
- [ ] **Last.fm tags** per track (fallback artist tags), top ~8 with weights, normalized/lowercased, junk-filtered ("seen live", "favorites"). Needs `LASTFM_API_KEY`. Cache aggressively (artist tags are stable).
- [ ] **Era**: album release year.
- [ ] **Behavioral signals we already fetch but discard:** which top-tracks ranges a track appears in
      (short/medium/long = current vs. evergreen), saved `added_at`, recently-played `played_at` hour-of-day
      (a *real* time-of-day signal instead of a guessed one).
- [ ] **Claude annotation (Haiku 4.5, structured output via tool use, not regex)**: only for what data can't give:
      primary genre family (controlled vocab ~25), subgenre, language, vocal style, 3–5 mood tags from a fixed
      vocab, plus a `confidence` field. Feed it the ReccoBeats + Last.fm data so it reasons from evidence, not the song title.
      Low-confidence tracks get flagged, not silently defaulted. Concurrent batches, prompt-cached rubric.

### P2: Rebuild the curation engine
Goal: playlists that cohere on genre + era + mood + tempo, with honest leftovers.
- [ ] Feature vector = weighted blocks, each normalized: audio (energy, valence, dance, acoustic, instrumental,
      speech, tempo/200, loudness), era (scaled), genre family (multi-hot), mood tags (multi-hot), language.
      Block weights tunable (genre + mood weighted highest).
- [ ] Replace k-means + magic merge/split with **agglomerative (cosine, average linkage)** cut by distance threshold,
      or HDBSCAN. Clusters form where the data is dense. Tracks that fit nowhere go to an **"Unsorted"** bucket
      (user can drag them anywhere) instead of polluting playlists.
- [ ] **Claude curator pass (Sonnet 5)**: given each cluster's summary (top tags, audio means, era span, 10 sample
      tracks) + outlier candidates, return structured ops: merge A+B, eject track X, rename. Then names are grounded in the actual content.
- [ ] Naming prompt uses tags/era/audio instead of only raw dimension floats. Use `topGenres` by frequency.
- [ ] Keep a 2D projection (UMAP on the new vector) for the map.
- [ ] **New feature, intent playlists:** "make me a playlist for late-night driving" → Claude filters/ranks from the
      annotated library. Cheap once features exist, and probably the most useful thing the app can do.

### P3: UX / UI
- [ ] **Previews:** lazy `/api/preview?isrc=` → Deezer 30s mp3 (fresh signed URL each time). Fallback: Spotify embed iframe.
      One global audio player (playing a new track stops the old), with an inline play button on every row + map tooltip.
- [ ] **Progress:** real counts ("Annotating 240/612"). Stream progress from the server (or client-driven batches) instead of 4 static dots.
- [ ] **Error states:** full-width error card per failure type with the right action (Re-login / "Ask the owner to add you
      in the Spotify dashboard" / Retry step). Retry resumes from the failed step, not from scratch.
- [ ] **Landing:** explain what it does + the 5-user allowlist reality. Handle Spotify's "user not registered" callback error.
- [ ] **List view:** tracks visible by default (first 5 + "show all"), obvious rename affordance, merge via menu (not
      hidden header-drag), undo toast for remove/merge, "Unsorted" column. Show why a cluster exists (top tags, BPM range, era).
- [ ] **Map:** stable colors per cluster id (not index), don't reset zoom on every edit, collision-avoiding labels,
      legend, click dot = play. Either implement drag-to-move or drop the prop.
- [ ] **Push dialog:** checkbox per playlist, public/private toggle, per-playlist progress + result, idempotent retry
      (skip already-created), cover preview. Cover: drop noise, 600×600, q≈0.8, assert < 256KB before sending; one request per playlist.
- [ ] Replace `redirect()` during client render with middleware auth guard.

### P4: Infra, caching, tests
- [ ] **Persist results + per-track annotations.** Annotations keyed by Spotify track id are reusable across runs.
      Store: Upstash Redis via Vercel Marketplace (recommended) or localStorage-only for v1. Reload shouldn't cost a re-run.
- [ ] Don't ship full track objects back and forth. Server keeps state keyed by run id, client sends ids.
- [ ] Tests: real-shape fixtures; ReccoBeats/Deezer/Last.fm clients with mocked fetch; clustering on a golden set
      (e.g. 60 hand-labelled tracks across 4 obvious genres must separate); error-code mapping.
- [ ] Real README (setup, env vars, dev-mode allowlist steps, Premium requirement).

---

## Decisions needed from you
1. **Last.fm API key**: OK to add? It's the best genre/mood source left. (Free, 2 min to get.)
2. **Persistence**: Upstash Redis (Vercel Marketplace) vs. browser-only for now.
3. **Scope**: accept "personal tool, ≤5 users". Extended quota isn't realistic.
4. **Map view**: keep and fix, or drop it and put the effort into the list view + intent playlists?

## Risks
- ReccoBeats and Deezer are third-party, free, and unofficial for this use. Both must stay best-effort, never blocking.
- Spotify could remove more dev-mode endpoints. Keep every Spotify call behind one client with typed errors so the next removal degrades instead of crashing.
