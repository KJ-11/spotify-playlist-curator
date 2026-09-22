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
