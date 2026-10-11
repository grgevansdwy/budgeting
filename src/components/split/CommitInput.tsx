"use client";

import { useState, type JSX } from "react";

interface CommitInputProps {
  /** The committed value. Shown whenever the user is not in the middle of typing. */
  value: string;
  /** Called with the typed text on blur or Enter. The field then shows `value` again. */
  onCommit: (text: string) => void;
  ariaLabel: string;
  className?: string;
  inputMode?: "text" | "decimal";
  invalid?: boolean;
  describedBy?: string;
  autoFocus?: boolean;
}

/**
 * A text input that keeps what is being typed to itself and hands it over on blur or Enter.
 * After a commit it shows `value` again, so a rejected entry falls back to the previous value.
 */
export function CommitInput({
  value,
  onCommit,
  ariaLabel,
  className,
  inputMode = "text",
  invalid = false,
  describedBy,
  autoFocus = false,
}: CommitInputProps): JSX.Element {
  const [text, setText] = useState<string | null>(null);

  function commit() {
    if (text === null) return;
    setText(null);
    onCommit(text);
  }

  return (
    <input
      type="text"
      inputMode={inputMode}
      autoComplete="off"
      autoFocus={autoFocus}
      aria-label={ariaLabel}
      aria-invalid={invalid || undefined}
      aria-describedby={describedBy}
      className={className}
      value={text ?? value}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          commit();
        }
      }}
    />
  );
}
