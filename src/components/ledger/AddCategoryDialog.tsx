"use client";

import { useId, useState } from "react";
import { Modal } from "./Modal";
import { focusRing, primaryButton, secondaryButton } from "./styles";

/** Asks for a category name. The caller creates the category and closes the dialog. */
export function AddCategoryDialog({
  onAdd,
  onClose,
}: {
  onAdd: (name: string) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const inputId = useId();
  const errorId = useId();

  return (
    <Modal title="Add category" onClose={onClose}>
      <form
        className="mt-3"
        onSubmit={(e) => {
          e.preventDefault();
          const trimmed = name.trim();
          if (trimmed === "") {
            setError("Give the category a name.");
            return;
          }
          onAdd(trimmed);
        }}
      >
        <label
          htmlFor={inputId}
          className="block text-sm font-medium text-zinc-700"
        >
          Name
        </label>
        <input
          id={inputId}
          type="text"
          value={name}
          maxLength={40}
          autoComplete="off"
          aria-invalid={error !== null}
          aria-describedby={error ? errorId : undefined}
          onChange={(e) => {
            setName(e.target.value);
            setError(null);
          }}
          className={`mt-1 w-full rounded-md border border-zinc-300 px-2.5 py-1.5 text-sm ${focusRing}`}
        />
        {error && (
          <p id={errorId} role="alert" className="mt-1 text-xs text-red-700">
            {error}
          </p>
        )}
        <p className="mt-2 text-xs text-zinc-500">
          If a category with this name already exists, the row is moved to it.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className={secondaryButton} onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className={primaryButton}>
            Add category
          </button>
        </div>
      </form>
    </Modal>
  );
}
