import type { ReactNode } from "react";

/** Sticky bottom bar for a flow's primary action. */
export function ActionBar({ message, children }: { message: ReactNode; children?: ReactNode }) {
  return (
    <div className="fixed inset-x-0 bottom-0 border-t border-zinc-800 bg-zinc-950/95 backdrop-blur">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-8">
        <p className="text-sm text-zinc-400">{message}</p>
        {children}
      </div>
    </div>
  );
}
