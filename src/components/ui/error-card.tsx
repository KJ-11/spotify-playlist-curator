"use client";

import { signIn } from "next-auth/react";
import type { ClientApiError } from "@/lib/client/api";

const TITLES: Partial<Record<ClientApiError["code"], string>> = {
  AUTH_EXPIRED: "Spotify session expired",
  NOT_ALLOWLISTED: "Account not on the allowlist",
  SPOTIFY_ERROR: "Spotify had a problem",
  EMPTY_LIBRARY: "Nothing to curate yet",
  CURATION_FAILED: "Curation didn't finish",
  CURATOR_MISCONFIGURED: "Curator not configured",
  CURATION_DISABLED: "Curation is paused",
  RATE_LIMITED: "Slow down a little",
  NETWORK: "Connection problem",
};

export function ErrorCard({ error, onRetry }: { error: ClientApiError; onRetry: () => void }) {
  const reconnect = error.code === "AUTH_EXPIRED";
  const canRetry =
    !reconnect &&
    !["NOT_ALLOWLISTED", "EMPTY_LIBRARY", "CURATOR_MISCONFIGURED", "CURATION_DISABLED", "RATE_LIMITED"].includes(
      error.code
    );

  return (
    <div role="alert" className="mx-auto max-w-lg rounded-2xl border border-red-900/60 bg-red-950/30 p-6">
      <h2 className="font-semibold text-red-200">{TITLES[error.code] ?? "Something went wrong"}</h2>
      <p className="mt-2 text-sm text-red-100/80">{error.message}</p>
      <div className="mt-5 flex gap-3">
        {reconnect && (
          <button
            onClick={() => signIn("spotify", { callbackUrl: "/curate" })}
            className="rounded-full bg-green-600 px-5 py-2 text-sm font-medium text-white hover:bg-green-500"
          >
            Reconnect Spotify
          </button>
        )}
        {canRetry && (
          <button
            onClick={onRetry}
            className="rounded-full bg-zinc-100 px-5 py-2 text-sm font-medium text-zinc-900 hover:bg-white"
          >
            Try again
          </button>
        )}
      </div>
    </div>
  );
}
