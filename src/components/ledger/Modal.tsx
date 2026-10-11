"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";

/**
 * A native modal <dialog>: the browser traps focus, makes the page behind inert and sends Escape
 * as a cancel event. Mount it to open it, unmount it to close it. Focus starts on the first
 * focusable element inside.
 */
export function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        // The panel below covers the whole dialog box, so a direct hit is the backdrop.
        if (e.target === e.currentTarget) onClose();
      }}
      className="m-auto w-[min(92vw,26rem)] rounded-lg border border-zinc-200 bg-white p-0 text-zinc-900 shadow-xl backdrop:bg-zinc-900/40"
    >
      <div className="p-5">
        <h2 id={titleId} className="text-base font-semibold">
          {title}
        </h2>
        {children}
      </div>
    </dialog>
  );
}
