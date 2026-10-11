"use client";

import { useId, useRef, useState, type ReactNode } from "react";
import { focusRing } from "./styles";

/**
 * Click-to-edit text. Enter or leaving the field commits, Escape cancels.
 *
 * `onCommit` saves and returns null, or returns a sentence explaining why the text was rejected.
 * A rejected Enter keeps the field open so the text can be fixed; a rejected blur closes the field,
 * leaves the old value in place and shows the sentence underneath until the next edit.
 */
export function InlineEdit({
  value,
  label,
  onCommit,
  align = "left",
  inputMode,
  children,
}: {
  /** Text the input starts with. */
  value: string;
  /** Accessible name, e.g. "Amount for Corner Shop". */
  label: string;
  onCommit: (text: string) => string | null;
  align?: "left" | "right";
  inputMode?: "text" | "decimal";
  /** What is shown while not editing. */
  children: ReactNode;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Give focus back to the button after a keyboard commit or cancel, but not after a blur.
  const [refocus, setRefocus] = useState(false);
  // Removing a focused input can fire one more blur; this stops a second commit.
  const settled = useRef(false);
  const errorId = useId();
  const alignText = align === "right" ? "text-right" : "text-left";

  const errorLine = error && (
    <p
      id={errorId}
      role="alert"
      className={`mt-0.5 text-[11px] leading-4 text-red-700 ${alignText}`}
    >
      {error}
    </p>
  );

  if (draft === null) {
    return (
      <>
        <button
          type="button"
          autoFocus={refocus}
          title="Click to edit"
          aria-label={`${label}, edit`}
          aria-describedby={error ? errorId : undefined}
          onClick={() => {
            settled.current = false;
            setError(null);
            setDraft(value);
          }}
          className={`-mx-1 block w-[calc(100%+0.5rem)] cursor-text rounded px-1 py-0.5 hover:bg-zinc-100 ${alignText} ${focusRing}`}
        >
          {children}
        </button>
        {errorLine}
      </>
    );
  }

  const finish = (via: "enter" | "blur") => {
    if (settled.current) return;
    const problem = onCommit(draft);
    if (problem && via === "enter") {
      setError(problem);
      return;
    }
    settled.current = true;
    setError(problem);
    setRefocus(via === "enter");
    setDraft(null);
  };

  return (
    <>
      <input
        type="text"
        autoFocus
        value={draft}
        inputMode={inputMode}
        autoComplete="off"
        aria-label={label}
        aria-invalid={error !== null}
        aria-describedby={error ? errorId : undefined}
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => finish("blur")}
        onKeyDown={(e) => {
          if (e.nativeEvent.isComposing) return;
          if (e.key === "Enter") {
            e.preventDefault();
            finish("enter");
          } else if (e.key === "Escape") {
            e.preventDefault();
            settled.current = true;
            setError(null);
            setRefocus(true);
            setDraft(null);
          }
        }}
        className={`-mx-1 block w-[calc(100%+0.5rem)] rounded border border-zinc-300 bg-white px-1 py-0.5 text-zinc-900 ${alignText} ${focusRing}`}
      />
      {errorLine}
    </>
  );
}
