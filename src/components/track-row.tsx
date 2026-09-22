import type { ClassifiedTrack } from "@/lib/types";
import { TrackPreview } from "./track-preview";

export function TrackRow({
  track,
  onRemove,
  draggable = true,
  onDragStart,
}: {
  track: ClassifiedTrack;
  onRemove?: () => void;
  draggable?: boolean;
  onDragStart?: (e: React.DragEvent) => void;
}) {
  const albumArt = track.track.album.images[2]?.url ?? track.track.album.images[0]?.url;

  return (
    <div
      draggable={draggable}
      onDragStart={onDragStart}
      className="flex items-center gap-3 py-2 px-3 rounded-lg hover:bg-zinc-800/50 group cursor-grab"
    >
      {albumArt && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={albumArt} alt="" className="w-10 h-10 rounded" />
      )}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{track.track.name}</p>
        <p className="text-xs text-zinc-400 truncate">
          {track.track.artists.map((a) => a.name).join(", ")}
        </p>
      </div>
      <TrackPreview
        previewUrl={track.track.preview_url}
        spotifyUrl={track.track.external_urls.spotify}
      />
      {onRemove && (
        <button
          onClick={onRemove}
          className="opacity-0 group-hover:opacity-100 text-zinc-500 hover:text-red-400 text-xs transition"
        >
          ✕
        </button>
      )}
    </div>
  );
}
