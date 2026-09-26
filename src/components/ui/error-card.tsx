"use client";

import Link from "next/link";
import { signIn } from "next-auth/react";
import type { ClientApiError } from "@/lib/client/api";

type Code = ClientApiError["code"];

const TITLES: Partial<Record<Code, string>> = {
  AUTH_EXPIRED: "Spotify session expired",
  NOT_ALLOWLISTED: "Account not on the allowlist",
  SPOTIFY_ERROR: "Spotify had a problem",
  SPOTIFY_RATE_LIMITED: "Spotify is limiting this app",
  EMPTY_LIBRARY: "Nothing to curate yet",
  CURATION_FAILED: "Curation didn't finish",
  CURATOR_MISCONFIGURED: "Curator not configured",
  CURATION_DISABLED: "Curation is paused",
  RATE_LIMITED: "Slow down a little",
  NETWORK: "Connection problem",
};

/** Errors that retrying right away can't fix. */
const NOT_RETRYABLE = new Set<Code>([
  "AUTH_EXPIRED",
  "NOT_ALLOWLISTED",
  "SPOTIFY_RATE_LIMITED",
  "EMPTY_LIBRARY",
  "CURATOR_MISCONFIGURED",
  "CURATION_DISABLED",
  "RATE_LIMITED",
]);

/** Errors where the Spotify-free upload flow is a working alternative. */
const SUGGEST_UPLOAD = new Set<Code>(["NOT_ALLOWLISTED", "SPOTIFY_RATE_LIMITED"]);

const primary = "rounded-full px-5 py-2 text-sm font-medium";

export function ErrorCard({ error, onRetry }: { error: ClientApiError; onRetry: () => void }) {
  return (
    <div role="alert" className="mx-auto max-w-lg rounded-2xl border border-red-900/60 bg-red-950/30 p-6">
      <h2 className="font-semibold text-red-200">{TITLES[error.code] ?? "Something went wrong"}</h2>
      <p className="mt-2 text-sm text-red-100/80">{error.message}</p>
      <div className="mt-5 flex flex-wrap gap-3">
        {error.code === "AUTH_EXPIRED" && (
          <button
            onClick={() => signIn("spotify", { callbackUrl: "/spotify" })}
            className={`${primary} bg-green-600 text-white hover:bg-green-500`}
          >
            Reconnect Spotify
          </button>
        )}
        {SUGGEST_UPLOAD.has(error.code) && (
          <Link href="/upload" className={`${primary} bg-zinc-100 text-zinc-900 hover:bg-white`}>
            Upload your data instead
          </Link>
        )}
        {!NOT_RETRYABLE.has(error.code) && (
          <button onClick={onRetry} className={`${primary} bg-zinc-100 text-zinc-900 hover:bg-white`}>
            Try again
          </button>
        )}
      </div>
    </div>
  );
}
