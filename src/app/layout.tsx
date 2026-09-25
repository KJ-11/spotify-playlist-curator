import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Providers } from "@/components/providers";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

const description =
  "Turn your messy Spotify listening into playlists that actually hang together, grouped by genre, era, energy and mood, then named by Claude.";

export const metadata: Metadata = {
  title: "Playlist Curator",
  description,
  openGraph: { title: "Playlist Curator", description, type: "website" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${inter.className} bg-zinc-950 text-zinc-100 min-h-screen`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
