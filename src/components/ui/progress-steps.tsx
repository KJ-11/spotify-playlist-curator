"use client";

export interface Step {
  label: string;
  detail?: string;
  state: "done" | "active" | "pending";
}

export function ProgressSteps({ steps }: { steps: Step[] }) {
  return (
    <div className="mx-auto flex max-w-md flex-col gap-4 py-16" aria-live="polite">
      {steps.map((s) => (
        <div key={s.label} className="flex items-start gap-3">
          <div className="mt-0.5 flex h-5 w-5 items-center justify-center">
            {s.state === "done" && <span className="text-green-500">✓</span>}
            {s.state === "active" && (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-700 border-t-green-500" />
            )}
            {s.state === "pending" && <span className="h-2 w-2 rounded-full bg-zinc-700" />}
          </div>
          <div>
            <p className={s.state === "pending" ? "text-zinc-600" : "text-zinc-100"}>{s.label}</p>
            {s.detail && <p className="text-sm text-zinc-500">{s.detail}</p>}
          </div>
        </div>
      ))}
    </div>
  );
}
