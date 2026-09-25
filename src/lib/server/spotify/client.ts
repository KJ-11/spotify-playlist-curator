import "server-only";
import { AppError } from "@/lib/errors";

export const SPOTIFY_API = "https://api.spotify.com/v1";

const MAX_RETRY_WAIT_S = 10;

async function toAppError(res: Response, url: string): Promise<AppError> {
  const body = await res.text().catch(() => "");
  const path = url.replace(SPOTIFY_API, "").split("?")[0];
  console.error(`Spotify ${res.status} on ${path}: ${body.slice(0, 300)}`);

  if (res.status === 401) {
    return new AppError("AUTH_EXPIRED", "Your Spotify session expired. Reconnect to continue.", 401);
  }
  // Development-mode apps reject users who aren't on the app's allowlist.
  if (res.status === 403 && /registered|dashboard/i.test(body)) {
    return new AppError(
      "NOT_ALLOWLISTED",
      "This Spotify account isn't on the app's allowlist yet. Ask the app owner to add you in the Spotify Developer Dashboard.",
      403
    );
  }
  return new AppError(
    "SPOTIFY_ERROR",
    `Spotify rejected a request (${res.status} on ${path}).`,
    502
  );
}

// Single entry point for every Spotify call: retries 429s, maps failures to typed errors.
export async function spotifyFetch(
  url: string,
  accessToken: string,
  init: RequestInit = {},
  retries = 3
): Promise<Response> {
  const fullUrl = url.startsWith("http") ? url : `${SPOTIFY_API}${url}`;
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(fullUrl, {
      ...init,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        ...init.headers,
      },
    });
    if (res.status === 429 && attempt < retries) {
      const wait = Math.min(parseInt(res.headers.get("Retry-After") ?? "1", 10) || 1, MAX_RETRY_WAIT_S);
      await new Promise((r) => setTimeout(r, wait * 1000));
      continue;
    }
    if (!res.ok) throw await toAppError(res, fullUrl);
    return res;
  }
}

export async function spotifyJson<T>(url: string, accessToken: string, init?: RequestInit): Promise<T> {
  const res = await spotifyFetch(url, accessToken, init);
  return (await res.json()) as T;
}
