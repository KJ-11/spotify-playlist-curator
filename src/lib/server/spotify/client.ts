import "server-only";
import { AppError } from "@/lib/errors";
import { describeWait } from "@/lib/format";

export const SPOTIFY_API = "https://api.spotify.com/v1";

/** Short 429s (burst rate limiting) are worth waiting out; anything longer is not. */
const MAX_RETRY_WAIT_S = 10;
const MAX_RETRIES = 3;

const pathOf = (url: string) => url.replace(SPOTIFY_API, "").split("?")[0];

async function toAppError(res: Response, url: string): Promise<AppError> {
  const body = await res.text().catch(() => "");
  console.error(`Spotify ${res.status} on ${pathOf(url)}: ${body.slice(0, 300)}`);

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
  return new AppError("SPOTIFY_ERROR", `Spotify rejected a request (${res.status} on ${pathOf(url)}).`, 502);
}

/**
 * Spotify throttles development-mode apps with a quota shared across the developer's
 * whole account (429, `reason: "QUOTA_EXCEEDED"`), with cooldowns that can last hours.
 * Retrying only burns more quota, so these fail immediately with the reset time.
 */
function quotaError(retryAfterS: number): AppError {
  const when = retryAfterS > 0 ? ` Try again ${describeWait(retryAfterS)}.` : " Try again later.";
  return new AppError(
    "SPOTIFY_RATE_LIMITED",
    `Spotify is temporarily limiting requests from this app.${when} Uploading your Spotify data works in the meantime.`,
    429
  );
}

async function isQuotaExceeded(res: Response): Promise<boolean> {
  const body = (await res
    .clone()
    .json()
    .catch(() => null)) as { error?: { reason?: string } } | null;
  return body?.error?.reason === "QUOTA_EXCEEDED";
}

/** Single entry point for every Spotify call: rides out short 429s, maps failures to typed errors. */
export async function spotifyFetch(url: string, accessToken: string, init: RequestInit = {}): Promise<Response> {
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

    if (res.status === 429) {
      const retryAfterS = parseInt(res.headers.get("Retry-After") ?? "", 10) || 0;
      if ((await isQuotaExceeded(res)) || retryAfterS > MAX_RETRY_WAIT_S || attempt >= MAX_RETRIES) {
        console.error(`Spotify 429 on ${pathOf(fullUrl)} (Retry-After: ${retryAfterS || "none"}s)`);
        throw quotaError(retryAfterS);
      }
      await new Promise((r) => setTimeout(r, Math.max(retryAfterS, 1) * 1000));
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
