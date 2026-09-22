"use client";

export function ViewToggle({
  view,
  onToggle,
}: {
  view: "map" | "list";
  onToggle: (view: "map" | "list") => void;
}) {
  return (
    <div className="flex rounded-lg border border-zinc-700 overflow-hidden text-sm">
      <button
        onClick={() => onToggle("map")}
        className={`px-4 py-2 transition ${
          view === "map" ? "bg-zinc-700 text-white" : "text-zinc-400 hover:text-zinc-200"
        }`}
      >
        Vibe Map
      </button>
      <button
        onClick={() => onToggle("list")}
        className={`px-4 py-2 transition ${
          view === "list" ? "bg-zinc-700 text-white" : "text-zinc-400 hover:text-zinc-200"
        }`}
      >
        List
      </button>
    </div>
  );
}
