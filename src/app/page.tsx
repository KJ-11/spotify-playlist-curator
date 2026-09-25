import { LoginButton } from "@/components/login-button";

const AUTH_ERRORS: Record<string, string> = {
  AccessDenied: "Spotify sign-in was cancelled or denied.",
  Configuration: "Sign-in isn't configured correctly on the server.",
};

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 px-4 text-center">
      <div>
        <h1 className="mb-4 text-5xl font-bold tracking-tight">Playlist Curator</h1>
        <p className="mx-auto max-w-md text-lg text-zinc-400">
          Turn your messy Spotify listening into a handful of playlists that actually hang together —
          named, covered, and pushed to your account in one click.
        </p>
      </div>
      <LoginButton />
      {error && (
        <p role="alert" className="max-w-md text-sm text-red-300">
          {AUTH_ERRORS[error] ?? "Couldn't sign in with Spotify."} This app runs in Spotify
          development mode, so your account must be on the owner&apos;s allowlist.
        </p>
      )}
      <p className="max-w-sm text-xs text-zinc-600">
        Invite-only: Spotify limits apps like this to 5 allowlisted accounts.
      </p>
    </main>
  );
}
