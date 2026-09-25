"use client";

import Link from "next/link";
import { signIn, useSession } from "next-auth/react";

export function ConnectSpotifyButton() {
  const { status } = useSession();
  const className =
    "inline-block rounded-full bg-green-600 px-6 py-3 font-medium text-white transition hover:bg-green-500";

  if (status === "authenticated") {
    return (
      <Link href="/spotify" className={className}>
        Continue to curator
      </Link>
    );
  }
  return (
    <button onClick={() => signIn("spotify", { callbackUrl: "/spotify" })} className={className}>
      Connect Spotify
    </button>
  );
}
