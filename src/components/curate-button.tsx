"use client";

export function CurateButton({
  onClick,
  disabled,
}: {
  onClick: () => void;
  disabled: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="px-8 py-4 bg-green-600 hover:bg-green-500 disabled:bg-zinc-700 disabled:text-zinc-500
        text-white font-medium text-lg rounded-full transition"
    >
      Curate My Music
    </button>
  );
}
