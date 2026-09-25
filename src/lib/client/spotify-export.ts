import { unzipSync, strFromU8 } from "fflate";
import type { LibraryTrack, TrackSource } from "@/lib/types";

/**
 * Parses a Spotify "Download your data" export entirely in the browser. Only the derived
 * track list (ids, titles, artists, play counts) ever leaves the device; raw history,
 * which includes IP addresses and devices, stays local.
 *
 * Supported files (detected by content, since Spotify renames them over time):
 * - Extended streaming history: entries with `spotify_track_uri`, `ms_played`, `ts`
 * - Account streaming history: entries with `trackName`, `artistName`, `msPlayed`, `endTime` (no URIs)
 * - YourLibrary.json: `{ tracks: [{ track, artist, album, uri }] }`
 */

/** Plays shorter than this are skips, matching Spotify's own "stream" threshold. */
const MIN_PLAY_MS = 30_000;
/** Tracks played within this window of the newest play in the export count as recent. */
const RECENT_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
/** How many of the most-played tracks get the long-term "top" tag. */
const TOP_LONG_COUNT = 150;

interface ExtendedEntry {
  ts?: string;
  ms_played?: number;
  spotify_track_uri?: string | null;
  master_metadata_track_name?: string | null;
  master_metadata_album_artist_name?: string | null;
  master_metadata_album_album_name?: string | null;
}

interface AccountEntry {
  endTime?: string;
  msPlayed?: number;
  trackName?: string;
  artistName?: string;
}

interface LibraryFile {
  tracks?: { track?: string; artist?: string; album?: string; uri?: string }[];
}

interface Aggregate {
  id: string;
  name: string;
  artist: string;
  album: string;
  plays: number;
  msPlayed: number;
  lastPlayed: number;
  saved: boolean;
}

export interface ExportSummary {
  tracks: LibraryTrack[];
  filesRead: number;
  totalPlays: number;
  /** Plays from account-level history that couldn't be matched to a track id. */
  unmatchedPlays: number;
}

export class ExportParseError extends Error {}

const TRACK_URI = /^spotify:track:([A-Za-z0-9]{22})$/;
const matchKey = (artist: string, track: string) => `${artist.toLowerCase()}\u0000${track.toLowerCase()}`;

/** Reads dropped files (the export .zip, or loose .json files) into raw JSON documents. */
export async function readExportFiles(files: File[]): Promise<unknown[]> {
  const docs: unknown[] = [];
  for (const file of files) {
    if (file.name.toLowerCase().endsWith(".zip")) {
      const entries = unzipSync(new Uint8Array(await file.arrayBuffer()), {
        filter: (f) => f.name.toLowerCase().endsWith(".json") && !f.name.includes("__MACOSX"),
      });
      for (const [name, data] of Object.entries(entries)) {
        const doc = tryParse(strFromU8(data));
        if (doc !== undefined) docs.push(doc);
        else console.warn(`Skipping unreadable file in export: ${name}`);
      }
    } else if (file.name.toLowerCase().endsWith(".json")) {
      const doc = tryParse(await file.text());
      if (doc !== undefined) docs.push(doc);
    }
  }
  return docs;
}

function tryParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function isExtended(doc: unknown): doc is ExtendedEntry[] {
  return Array.isArray(doc) && doc.some((e) => e && typeof e === "object" && "ms_played" in e);
}

function isAccountHistory(doc: unknown): doc is AccountEntry[] {
  return Array.isArray(doc) && doc.some((e) => e && typeof e === "object" && "msPlayed" in e && "trackName" in e);
}

function isLibrary(doc: unknown): doc is LibraryFile {
  return !!doc && typeof doc === "object" && !Array.isArray(doc) && Array.isArray((doc as LibraryFile).tracks);
}

/** Turns parsed export documents into a ranked library. Pure, so it's unit-tested directly. */
export function buildLibraryFromExport(docs: unknown[]): ExportSummary {
  const byId = new Map<string, Aggregate>();
  const idByName = new Map<string, string>();
  const pendingAccountPlays: AccountEntry[] = [];
  let filesRead = 0;
  let totalPlays = 0;
  let unmatchedPlays = 0;

  const upsert = (id: string, name: string, artist: string, album: string) => {
    let agg = byId.get(id);
    if (!agg) {
      agg = { id, name, artist, album, plays: 0, msPlayed: 0, lastPlayed: 0, saved: false };
      byId.set(id, agg);
    }
    idByName.set(matchKey(artist, name), id);
    return agg;
  };

  const recordPlay = (agg: Aggregate, ms: number, when: number) => {
    agg.msPlayed += ms;
    if (ms >= MIN_PLAY_MS) {
      agg.plays += 1;
      totalPlays += 1;
    }
    if (when > agg.lastPlayed) agg.lastPlayed = when;
  };

  for (const doc of docs) {
    if (isLibrary(doc)) {
      filesRead++;
      for (const t of doc.tracks ?? []) {
        const id = t.uri?.match(TRACK_URI)?.[1];
        if (!id || !t.track || !t.artist) continue;
        upsert(id, t.track, t.artist, t.album ?? "").saved = true;
      }
    } else if (isExtended(doc)) {
      filesRead++;
      for (const e of doc) {
        const id = e.spotify_track_uri?.match(TRACK_URI)?.[1];
        if (!id || !e.master_metadata_track_name || !e.master_metadata_album_artist_name) continue;
        const agg = upsert(
          id,
          e.master_metadata_track_name,
          e.master_metadata_album_artist_name,
          e.master_metadata_album_album_name ?? ""
        );
        recordPlay(agg, e.ms_played ?? 0, Date.parse(e.ts ?? "") || 0);
      }
    } else if (isAccountHistory(doc)) {
      filesRead++;
      // No URIs here; resolve by artist + title once every id-bearing file has been seen.
      pendingAccountPlays.push(...doc);
    }
  }

  for (const e of pendingAccountPlays) {
    if (!e.trackName || !e.artistName) continue;
    const id = idByName.get(matchKey(e.artistName, e.trackName));
    const when = Date.parse(`${e.endTime?.replace(" ", "T")}Z`) || 0;
    if (id) recordPlay(byId.get(id)!, e.msPlayed ?? 0, when);
    else if ((e.msPlayed ?? 0) >= MIN_PLAY_MS) unmatchedPlays++;
  }

  if (filesRead === 0) {
    throw new ExportParseError(
      "No Spotify data found. Upload the .zip from Spotify, or the StreamingHistory / YourLibrary .json files inside it."
    );
  }

  // reduce, not Math.max(...spread): exports can hold 100k+ tracks, beyond the arg limit.
  const newest = [...byId.values()].reduce((max, a) => Math.max(max, a.lastPlayed), 0);
  const topLong = new Set(
    [...byId.values()]
      .sort((a, b) => b.msPlayed - a.msPlayed)
      .slice(0, TOP_LONG_COUNT)
      .filter((a) => a.plays > 0)
      .map((a) => a.id)
  );

  const tracks = [...byId.values()]
    // Keep liked songs, and anything actually listened to rather than skipped.
    .filter((a) => a.saved || a.plays > 0)
    .sort((a, b) => b.msPlayed - a.msPlayed || Number(b.saved) - Number(a.saved))
    .map((a): LibraryTrack => {
      const sources: TrackSource[] = [];
      if (newest && a.lastPlayed && newest - a.lastPlayed <= RECENT_WINDOW_MS) sources.push("recent");
      if (topLong.has(a.id)) sources.push("top_long");
      if (a.saved) sources.push("saved");
      return {
        id: a.id,
        uri: `spotify:track:${a.id}`,
        name: a.name,
        artists: [a.artist],
        album: a.album,
        imageUrl: null,
        year: null,
        isrc: null,
        spotifyUrl: `https://open.spotify.com/track/${a.id}`,
        sources,
        playCount: a.plays || undefined,
        features: null,
      };
    });

  return { tracks, filesRead, totalPlays, unmatchedPlays };
}
