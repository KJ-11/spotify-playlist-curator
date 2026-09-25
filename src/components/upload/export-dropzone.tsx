"use client";

import { useRef, useState } from "react";

/** Drop target for the Spotify data export (.zip or the .json files inside it). */
export function ExportDropzone({ onFiles, disabled }: { onFiles: (files: File[]) => void; disabled?: boolean }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const accept = (list: FileList | null) => {
    const files = [...(list ?? [])].filter((f) => /\.(zip|json)$/i.test(f.name));
    if (files.length) onFiles(files);
  };

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => inputRef.current?.click()}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        accept(e.dataTransfer.files);
      }}
      className={`flex w-full flex-col items-center gap-2 rounded-2xl border-2 border-dashed px-6 py-14 text-center transition ${
        dragging ? "border-green-500 bg-green-500/5" : "border-zinc-700 hover:border-zinc-500"
      } disabled:opacity-50`}
    >
      <span className="text-lg font-medium">Drop your Spotify data here</span>
      <span className="text-sm text-zinc-400">The .zip from Spotify, or the .json files inside it</span>
      <input
        ref={inputRef}
        type="file"
        accept=".zip,.json,application/zip,application/json"
        multiple
        hidden
        onChange={(e) => accept(e.target.files)}
      />
    </button>
  );
}
