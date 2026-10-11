"use client";

import type { ReactNode } from "react";
import { Modal } from "./Modal";
import { dangerButton, secondaryButton } from "./styles";

/** In-app replacement for window.confirm. Cancel comes first, so it gets the initial focus. */
export function ConfirmDialog({
  title,
  confirmLabel,
  onConfirm,
  onCancel,
  children,
}: {
  title: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  children: ReactNode;
}) {
  return (
    <Modal title={title} onClose={onCancel}>
      <div className="mt-2 text-sm text-zinc-600">{children}</div>
      <div className="mt-5 flex justify-end gap-2">
        <button type="button" className={secondaryButton} onClick={onCancel}>
          Cancel
        </button>
        <button type="button" className={dangerButton} onClick={onConfirm}>
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
