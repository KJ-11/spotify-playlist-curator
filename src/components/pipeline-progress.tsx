"use client";

const STEPS = [
  "Pulling your tracks from Spotify",
  "Reading the vibe of each track",
  "Clustering by feel",
  "Naming your playlists",
] as const;

export function PipelineProgress({ currentStep }: { currentStep: number }) {
  return (
    <div className="flex flex-col items-center gap-6 py-12">
      <div className="w-8 h-8 border-2 border-zinc-600 border-t-green-500 rounded-full animate-spin" />
      <div className="flex flex-col gap-3">
        {STEPS.map((label, i) => (
          <div key={i} className="flex items-center gap-3 text-sm">
            <div
              className={`w-2 h-2 rounded-full ${
                i < currentStep
                  ? "bg-green-500"
                  : i === currentStep
                    ? "bg-green-400 animate-pulse"
                    : "bg-zinc-700"
              }`}
            />
            <span className={i <= currentStep ? "text-zinc-200" : "text-zinc-600"}>
              {label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
