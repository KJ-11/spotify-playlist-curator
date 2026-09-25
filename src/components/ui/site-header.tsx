import Link from "next/link";
import type { ReactNode } from "react";

export function SiteHeader({ children }: { children?: ReactNode }) {
  return (
    <header className="mb-10 flex items-center justify-between">
      <Link href="/" className="text-lg font-bold">
        Playlist Curator
      </Link>
      <div className="flex items-center gap-4 text-sm text-zinc-400">{children}</div>
    </header>
  );
}
