"use client";

import { useRef, useState, type DragEvent } from "react";

export const ACCEPTED_TYPES = "application/pdf,image/png,image/jpeg,image/webp";

export const PRIVACY_NOTE =
  "Files are read in your browser. Nothing is uploaded.";

interface UploadDropzoneProps {
  onFiles: (files: File[]) => void;
  /** A shorter zone, used once files are listed or a month is already loaded. */
  compact?: boolean;
}

export function UploadDropzone({
  onFiles,
  compact = false,
}: UploadDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    onFiles(Array.from(event.dataTransfer.files));
  }

  function handleDragOver(event: DragEvent<HTMLDivElement>) {
    // Without this the browser opens the dropped file instead of handing it to the page.
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    if (!dragging) setDragging(true);
  }

  function handleDragLeave(event: DragEvent<HTMLDivElement>) {
    const next = event.relatedTarget;
    if (next instanceof Node && event.currentTarget.contains(next)) return;
    setDragging(false);
  }

  return (
    <div
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      className={`flex flex-col items-center justify-center rounded-lg border-2 border-dashed text-center transition-colors ${
        compact ? "gap-2 px-4 py-5" : "gap-3 px-6 py-12"
      } ${
        dragging
          ? "border-emerald-500 bg-emerald-50"
          : "border-zinc-300 bg-zinc-50"
      }`}
    >
      {!compact && (
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className="h-8 w-8 text-zinc-400"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 16V4" />
          <path d="m7 9 5-5 5 5" />
          <path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" />
        </svg>
      )}
      <p
        className={
          compact
            ? "text-sm text-zinc-700"
            : "text-base font-medium text-zinc-800"
        }
      >
        {compact ? "Drop more statements here" : "Drop your statements here"}
      </p>
      <p className="text-xs text-zinc-500">
        PDF, PNG, JPEG or WebP. Several files at once is fine.
      </p>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className={`rounded-md font-medium focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2 focus-visible:outline-none ${
          compact
            ? "border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-50"
            : "bg-emerald-600 px-4 py-2 text-sm text-white hover:bg-emerald-700"
        }`}
      >
        Choose files
      </button>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={ACCEPTED_TYPES}
        aria-label="Choose statement files"
        className="sr-only"
        tabIndex={-1}
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          // Cleared so choosing the same file again still fires a change.
          event.target.value = "";
          onFiles(files);
        }}
      />
      <p className="text-xs text-zinc-500">{PRIVACY_NOTE}</p>
    </div>
  );
}
