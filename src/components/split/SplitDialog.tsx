"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type JSX,
} from "react";
import {
  centsToDecimalString,
  formatCents,
  parseAmountToCents,
} from "@/lib/money";
import {
  MAX_PEOPLE,
  MIN_PEOPLE,
  addPerson,
  createEqualSplit,
  hasRequestedShares,
  removePerson,
  renamePerson,
  resetToEqual,
  setShareAmount,
  setTotal,
  type SplitResult,
} from "@/lib/split/split";
import { useBudgetStore } from "@/lib/store/store";
import type { Split, Transaction } from "@/lib/types";
import { CommitInput } from "./CommitInput";

const FOCUS =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700";
const INPUT = `rounded border border-zinc-300 bg-white px-2 py-1 text-sm text-zinc-900 aria-[invalid=true]:border-red-500 ${FOCUS}`;
const BTN = `rounded px-3 py-1.5 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS}`;
const BTN_PRIMARY = `${BTN} bg-emerald-700 text-white hover:bg-emerald-800`;
const BTN_SECONDARY = `${BTN} border border-zinc-300 bg-white text-zinc-800 hover:bg-zinc-50`;
const BTN_DANGER = `${BTN} border border-red-200 bg-white text-red-700 hover:bg-red-50`;

type Stage = "count" | "names" | "amounts";

// Which control an error belongs to: a share id, or one of the fixed areas below.
type ErrorTarget = "count" | "names" | "total" | "add" | "general" | string;
interface DialogError {
  target: ErrorTarget;
  message: string;
}

/** The lib's sentence, plus the maximum when the lib gave one and did not already say it. */
function errorText(result: Extract<SplitResult, { ok: false }>): string {
  if (result.maxCents === undefined) return result.error;
  const max = formatCents(result.maxCents);
  return result.error.includes(max)
    ? result.error
    : `${result.error} The most it can be is ${max}.`;
}

/** Unparseable text becomes NaN so the split lib rejects it with its own message. */
function typedCents(text: string): number {
  return parseAmountToCents(text) ?? Number.NaN;
}

export function SplitDialog(props: {
  transactionId: string;
  onClose: () => void;
}): JSX.Element | null {
  const transaction = useBudgetStore((s) =>
    s.workingSet?.transactions.find((t) => t.id === props.transactionId),
  );
  if (!transaction || transaction.kind !== "expense" || transaction.isTransfer)
    return null;
  return (
    <SplitDialogBody
      key={transaction.id}
      transaction={transaction}
      onClose={props.onClose}
    />
  );
}

function SplitDialogBody({
  transaction,
  onClose,
}: {
  transaction: Transaction;
  onClose: () => void;
}): JSX.Element {
  const setSplit = useBudgetStore((s) => s.setSplit);
  const dialogRef = useRef<HTMLDialogElement>(null);
  // Set when an entry was just rejected, so the click that blurred the field does not also save.
  const justRejected = useRef(false);
  const titleId = useId();
  const errorId = useId();

  const isExisting = transaction.split !== null;
  const [draft, setDraft] = useState<Split | null>(transaction.split);
  const [stage, setStage] = useState<Stage>(
    transaction.split ? "amounts" : "count",
  );
  const [countText, setCountText] = useState(String(MIN_PEOPLE));
  const [names, setNames] = useState<string[]>([""]);
  const [newName, setNewName] = useState("");
  const [error, setError] = useState<DialogError | null>(null);
  const [confirmingRemove, setConfirmingRemove] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  // Closing the native dialog fires its close event, which calls onClose.
  function close() {
    const dialog = dialogRef.current;
    if (dialog?.open) dialog.close();
    else onClose();
  }

  function apply(result: SplitResult, target: ErrorTarget): boolean {
    if (result.ok) {
      setDraft(result.split);
      setError(null);
      return true;
    }
    justRejected.current = true;
    setError({ target, message: errorText(result) });
    return false;
  }

  function submitCount(e: FormEvent) {
    e.preventDefault();
    const text = countText.trim();
    const count = /^\d+$/.test(text) ? Number(text) : Number.NaN;
    if (!(count >= MIN_PEOPLE && count <= MAX_PEOPLE)) {
      setError({
        target: "count",
        message: `Enter a whole number from ${MIN_PEOPLE} to ${MAX_PEOPLE}.`,
      });
      return;
    }
    setNames((prev) =>
      Array.from({ length: count - 1 }, (_, i) => prev[i] ?? ""),
    );
    setError(null);
    setStage("names");
  }

  function submitNames(e: FormEvent) {
    e.preventDefault();
    if (apply(createEqualSplit(transaction.amountCents, names), "names")) {
      setStage("amounts");
    }
  }

  function submitNewPerson(e: FormEvent) {
    e.preventDefault();
    if (draft && apply(addPerson(draft, newName), "add")) setNewName("");
  }

  function save() {
    if (justRejected.current) {
      justRejected.current = false;
      return;
    }
    if (!draft) return;
    try {
      setSplit(transaction.id, draft);
    } catch {
      setError({
        target: "general",
        message:
          "These shares do not add up to the total, so nothing was saved.",
      });
      return;
    }
    close();
  }

  function removeSplit() {
    if (
      !confirmingRemove &&
      transaction.split &&
      hasRequestedShares(transaction.split)
    ) {
      setConfirmingRemove(true);
      return;
    }
    setSplit(transaction.id, null);
    close();
  }

  const sumCents = draft
    ? draft.shares.reduce((sum, sh) => sum + sh.amountCents, 0)
    : 0;
  const sumMatches = draft !== null && sumCents === draft.totalCents;
  const errorFor = (target: ErrorTarget) =>
    error?.target === target ? error.message : null;

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      onClose={onClose}
      className="m-auto w-[calc(100%-2rem)] max-w-lg rounded-lg border border-zinc-200 bg-white p-0 text-zinc-900 shadow-xl backdrop:bg-zinc-900/40"
    >
      <div
        className="flex max-h-[85vh] flex-col"
        onPointerDownCapture={() => {
          justRejected.current = false;
        }}
        onKeyDownCapture={() => {
          justRejected.current = false;
        }}
      >
        <header className="border-b border-zinc-200 px-5 py-4">
          <h2 id={titleId} className="text-base font-semibold">
            {isExisting ? "Edit split" : "Split this expense"}
          </h2>
          <p className="mt-1 flex items-baseline justify-between gap-4 text-sm text-zinc-600">
            <span className="min-w-0 truncate">{transaction.description}</span>
            {stage !== "amounts" && (
              <span className="shrink-0 tabular-nums">
                Total {formatCents(transaction.amountCents)}
              </span>
            )}
          </p>
        </header>

        {stage === "count" && (
          <form onSubmit={submitCount} noValidate>
            <div className="px-5 py-4">
              <label className="flex items-center justify-between gap-4 text-sm">
                <span>How many people, including you?</span>
                <input
                  type="number"
                  min={MIN_PEOPLE}
                  max={MAX_PEOPLE}
                  step={1}
                  autoFocus
                  value={countText}
                  onChange={(e) => setCountText(e.target.value)}
                  aria-invalid={errorFor("count") !== null || undefined}
                  aria-describedby={errorFor("count") ? errorId : undefined}
                  className={`${INPUT} w-20 text-right tabular-nums`}
                />
              </label>
              <ErrorLine id={errorId} message={errorFor("count")} />
            </div>
            <footer className="flex justify-end gap-2 border-t border-zinc-200 px-5 py-3">
              <button type="button" className={BTN_SECONDARY} onClick={close}>
                Cancel
              </button>
              <button type="submit" className={BTN_PRIMARY}>
                Next
              </button>
            </footer>
          </form>
        )}

        {stage === "names" && (
          <form onSubmit={submitNames} noValidate>
            <div className="space-y-2 overflow-y-auto px-5 py-4">
              <p className="text-sm text-zinc-600">
                Who are you splitting with?
              </p>
              {names.map((name, i) => (
                <label key={i} className="flex items-center gap-3 text-sm">
                  <span className="w-20 shrink-0 text-zinc-600">
                    Person {i + 2}
                  </span>
                  <input
                    type="text"
                    required
                    autoComplete="off"
                    autoFocus={i === 0}
                    value={name}
                    onChange={(e) =>
                      setNames((prev) =>
                        prev.map((n, j) => (j === i ? e.target.value : n)),
                      )
                    }
                    aria-describedby={errorFor("names") ? errorId : undefined}
                    className={`${INPUT} min-w-0 flex-1`}
                  />
                </label>
              ))}
              <ErrorLine id={errorId} message={errorFor("names")} />
            </div>
            <footer className="flex justify-between gap-2 border-t border-zinc-200 px-5 py-3">
              <button
                type="button"
                className={BTN_SECONDARY}
                onClick={() => {
                  setError(null);
                  setStage("count");
                }}
              >
                Back
              </button>
              <span className="flex gap-2">
                <button type="button" className={BTN_SECONDARY} onClick={close}>
                  Cancel
                </button>
                <button type="submit" className={BTN_PRIMARY}>
                  Next
                </button>
              </span>
            </footer>
          </form>
        )}

        {stage === "amounts" && draft && (
          <>
            <div className="space-y-4 overflow-y-auto px-5 py-4">
              <div>
                <div className="flex items-center justify-between gap-4 text-sm">
                  <span className="font-medium">Original total</span>
                  <span className="flex items-center gap-1">
                    <span aria-hidden="true" className="text-zinc-500">
                      $
                    </span>
                    <CommitInput
                      value={centsToDecimalString(draft.totalCents)}
                      onCommit={(text) =>
                        apply(setTotal(draft, typedCents(text)), "total")
                      }
                      ariaLabel="Original total"
                      inputMode="decimal"
                      invalid={errorFor("total") !== null}
                      describedBy={errorFor("total") ? errorId : undefined}
                      className={`${INPUT} w-28 text-right tabular-nums`}
                    />
                  </span>
                </div>
                <ErrorLine id={errorId} message={errorFor("total")} />
              </div>

              <ul className="divide-y divide-zinc-100 border-y border-zinc-200">
                {draft.shares.map((share) => {
                  const rowError = errorFor(share.id);
                  return (
                    <li key={share.id} className="py-2">
                      <div className="flex items-center gap-2 text-sm">
                        {share.isUser ? (
                          <span className="min-w-0 flex-1 px-2 font-medium">
                            {share.name}{" "}
                            <span className="font-normal text-zinc-500">
                              (your share)
                            </span>
                          </span>
                        ) : (
                          <CommitInput
                            value={share.name}
                            onCommit={(text) =>
                              apply(
                                renamePerson(draft, share.id, text),
                                share.id,
                              )
                            }
                            ariaLabel={`Name of ${share.name}`}
                            invalid={rowError !== null}
                            describedBy={rowError ? errorId : undefined}
                            className={`${INPUT} min-w-0 flex-1`}
                          />
                        )}
                        {share.manual && (
                          <span
                            title="You set this amount by hand"
                            className="shrink-0 rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-800"
                          >
                            manual
                          </span>
                        )}
                        {share.requested && (
                          <span
                            title="You already asked for this money"
                            className="shrink-0 rounded bg-zinc-100 px-1.5 py-0.5 text-xs text-zinc-600"
                          >
                            requested
                          </span>
                        )}
                        {share.isUser ? (
                          <span
                            aria-label={`Your share: ${formatCents(share.amountCents)}`}
                            className="w-28 shrink-0 px-2 text-right font-medium tabular-nums"
                          >
                            {formatCents(share.amountCents)}
                          </span>
                        ) : (
                          <CommitInput
                            value={centsToDecimalString(share.amountCents)}
                            onCommit={(text) =>
                              apply(
                                setShareAmount(
                                  draft,
                                  share.id,
                                  typedCents(text),
                                ),
                                share.id,
                              )
                            }
                            ariaLabel={`${share.name}'s share`}
                            inputMode="decimal"
                            invalid={rowError !== null}
                            describedBy={rowError ? errorId : undefined}
                            className={`${INPUT} w-28 shrink-0 text-right tabular-nums`}
                          />
                        )}
                        {share.isUser ? (
                          <span className="w-7 shrink-0" />
                        ) : (
                          <button
                            type="button"
                            aria-label={`Remove ${share.name}`}
                            title={`Remove ${share.name}`}
                            onClick={() =>
                              apply(removePerson(draft, share.id), share.id)
                            }
                            className={`flex h-7 w-7 shrink-0 items-center justify-center rounded text-zinc-500 hover:bg-zinc-100 hover:text-red-700 ${FOCUS}`}
                          >
                            <svg
                              aria-hidden="true"
                              viewBox="0 0 16 16"
                              className="h-3.5 w-3.5"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                            >
                              <path d="M3 3l10 10M13 3L3 13" />
                            </svg>
                          </button>
                        )}
                      </div>
                      <ErrorLine id={errorId} message={rowError} />
                    </li>
                  );
                })}
              </ul>

              <p
                aria-live="polite"
                className={`text-right text-sm tabular-nums ${sumMatches ? "text-emerald-800" : "text-red-700"}`}
              >
                {sumMatches
                  ? `Shares add up to ${formatCents(sumCents)}`
                  : `Shares add up to ${formatCents(sumCents)}, not ${formatCents(draft.totalCents)}`}
              </p>

              <div>
                <form
                  onSubmit={submitNewPerson}
                  noValidate
                  className="flex flex-wrap items-center gap-2"
                >
                  <input
                    type="text"
                    autoComplete="off"
                    placeholder="Name"
                    aria-label="Name of the person to add"
                    aria-invalid={errorFor("add") !== null || undefined}
                    aria-describedby={errorFor("add") ? errorId : undefined}
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    className={`${INPUT} min-w-0 flex-1`}
                  />
                  <button type="submit" className={BTN_SECONDARY}>
                    Add person
                  </button>
                  <button
                    type="button"
                    className={BTN_SECONDARY}
                    onClick={() => {
                      setDraft(resetToEqual(draft));
                      setError(null);
                    }}
                  >
                    Reset to equal
                  </button>
                </form>
                <ErrorLine id={errorId} message={errorFor("add")} />
              </div>

              <ErrorLine id={errorId} message={errorFor("general")} />

              {confirmingRemove && (
                <div
                  role="alert"
                  aria-label="Confirm removing the split"
                  className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-900"
                >
                  <p>
                    You already asked for some of this money. Removing the split
                    puts the full {formatCents(draft.totalCents)} back on you
                    and drops those shares.
                  </p>
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      autoFocus
                      className={BTN_DANGER}
                      onClick={removeSplit}
                    >
                      Yes, remove split
                    </button>
                    <button
                      type="button"
                      className={BTN_SECONDARY}
                      onClick={() => setConfirmingRemove(false)}
                    >
                      Keep split
                    </button>
                  </div>
                </div>
              )}
            </div>

            <footer className="flex items-center justify-between gap-2 border-t border-zinc-200 px-5 py-3">
              <span>
                {isExisting && !confirmingRemove && (
                  <button
                    type="button"
                    className={BTN_DANGER}
                    onClick={removeSplit}
                  >
                    Remove split
                  </button>
                )}
              </span>
              <span className="flex gap-2">
                <button type="button" className={BTN_SECONDARY} onClick={close}>
                  Cancel
                </button>
                <button
                  type="button"
                  className={BTN_PRIMARY}
                  disabled={!sumMatches}
                  onClick={save}
                >
                  Save
                </button>
              </span>
            </footer>
          </>
        )}
      </div>
    </dialog>
  );
}

function ErrorLine({
  id,
  message,
}: {
  id: string;
  message: string | null;
}): JSX.Element | null {
  if (!message) return null;
  return (
    <p id={id} role="alert" className="mt-1 text-sm text-red-700">
      {message}
    </p>
  );
}
