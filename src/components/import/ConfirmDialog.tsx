"use client";

import { useEffect, useRef } from "react";

interface ConfirmDialogProps {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
  /** Styles the confirm button as a destructive action. */
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * An in-page confirmation. Mount it to open it and unmount it to close it. It is a native
 * <dialog>, so focus is trapped and Escape cancels, without a blocking browser prompt.
 */
export function ConfirmDialog({
  title,
  message,
  confirmLabel,
  cancelLabel = "Cancel",
  destructive = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (!dialog.open) dialog.showModal();
    return () => {
      if (dialog.open) dialog.close();
    };
  }, []);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="import-confirm-title"
      aria-describedby="import-confirm-message"
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
      className="m-auto w-[min(28rem,calc(100vw-2rem))] rounded-xl border border-zinc-200 bg-white p-5 text-zinc-900 shadow-xl backdrop:bg-zinc-900/40"
    >
      <h2 id="import-confirm-title" className="text-base font-semibold">
        {title}
      </h2>
      <p id="import-confirm-message" className="mt-2 text-sm text-zinc-600">
        {message}
      </p>
      <div className="mt-5 flex justify-end gap-2">
        {/* Cancel comes first so it takes the initial focus. */}
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2 focus-visible:outline-none"
        >
          {cancelLabel}
        </button>
        <button
          type="button"
          onClick={onConfirm}
          className={`rounded-md px-3 py-1.5 text-sm font-medium text-white focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none ${
            destructive
              ? "bg-red-600 hover:bg-red-700 focus-visible:ring-red-600"
              : "bg-emerald-600 hover:bg-emerald-700 focus-visible:ring-emerald-600"
          }`}
        >
          {confirmLabel}
        </button>
      </div>
    </dialog>
  );
}
