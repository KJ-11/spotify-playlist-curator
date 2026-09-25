import Link from "next/link";
import { ConnectSpotifyButton } from "@/components/connect-spotify-button";

const AUTH_ERRORS: Record<string, string> = {
  AccessDenied: "Spotify sign-in was cancelled or denied.",
  Configuration: "Sign-in isn't configured correctly on the server.",
};

export default async function Home({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col justify-center px-4 py-16">
      <div className="mb-12 text-center">
        <h1 className="mb-4 text-5xl font-bold tracking-tight">Playlist Curator</h1>
        <p className="mx-auto max-w-lg text-lg text-zinc-400">
          Turn your messy Spotify listening into a handful of playlists that actually hang together: grouped by
          genre, era, energy and mood, then named by Claude.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <section className="flex flex-col rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
          <h2 className="mb-2 text-lg font-semibold">Upload your Spotify data</h2>
          <p className="mb-6 flex-1 text-sm text-zinc-400">
            Open to everyone. Drop in your Spotify data export and copy the playlists into Spotify. Your files are
            read in the browser.
          </p>
          <Link
            href="/upload"
            className="self-start rounded-full bg-zinc-100 px-6 py-3 font-medium text-zinc-900 transition hover:bg-white"
          >
            Upload data
          </Link>
        </section>

        <section className="flex flex-col rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
          <h2 className="mb-2 text-lg font-semibold">Connect Spotify</h2>
          <p className="mb-6 flex-1 text-sm text-zinc-400">
            Invite-only. Reads your library directly and creates the playlists on your account in one click.
            Spotify limits apps like this to a handful of allowlisted accounts.
          </p>
          <div className="self-start">
            <ConnectSpotifyButton />
          </div>
        </section>
      </div>

      {error && (
        <p role="alert" className="mx-auto mt-6 max-w-md text-center text-sm text-red-300">
          {AUTH_ERRORS[error] ?? "Couldn't sign in with Spotify."} Connecting requires your account to be on the
          allowlist. Uploading your data works for everyone.
        </p>
      )}

      <footer className="mt-16 text-center text-xs text-zinc-600">
        <a
          href="https://github.com/KJ-11/spotify-playlist-curator"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-zinc-400"
        >
          Open source on GitHub
        </a>
      </footer>
    </main>
  );
}
