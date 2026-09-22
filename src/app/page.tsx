import { LoginButton } from "@/components/login-button";

export default function Home() {
  return (
    <main className="flex flex-col items-center justify-center min-h-screen gap-8">
      <div className="text-center">
        <h1 className="text-5xl font-bold tracking-tight mb-4">Playlist Curator</h1>
        <p className="text-zinc-400 text-lg max-w-md">
          Turn your messy Spotify listening into curated playlists, organized by vibe.
        </p>
      </div>
      <LoginButton />
    </main>
  );
}
