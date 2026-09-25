import type { PushState } from "@/hooks/use-push-playlists";

export function PushBadge({ push }: { push: PushState }) {
  if (push.state === "pending") {
    return <span className="rounded-full bg-black/40 px-3 py-1 text-xs text-white">Creating…</span>;
  }
  if (push.state === "failed") {
    return (
      <span title={push.message} className="rounded-full bg-red-600/80 px-3 py-1 text-xs text-white">
        Failed
      </span>
    );
  }
  return (
    <a
      href={push.url}
      target="_blank"
      rel="noopener noreferrer"
      className="rounded-full bg-green-500 px-3 py-1 text-xs font-medium text-black hover:bg-green-400"
    >
      Open in Spotify ↗
    </a>
  );
}
