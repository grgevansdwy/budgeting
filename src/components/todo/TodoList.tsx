"use client";

import Link from "next/link";
import { useMemo, type JSX } from "react";
import { formatCents } from "@/lib/money";
import { useBudgetStore } from "@/lib/store/store";
import { formatTodo, selectTodos } from "@/lib/todo/todos";
import type { Cents, TodoItem } from "@/lib/types";

const FOCUS =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700";
const LINK = `rounded font-medium text-emerald-800 underline underline-offset-2 hover:text-emerald-900 ${FOCUS}`;

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/** "2026-10-03" -> "Oct 3". Plain string work, so no timezone can shift the day. */
function shortDate(iso: string): string {
  const m = /^\d{4}-(\d{2})-(\d{2})$/.exec(iso);
  const month = m ? MONTHS[Number(m[1]) - 1] : undefined;
  return m && month ? `${month} ${Number(m[2])}` : iso;
}

interface PersonGroup {
  key: string;
  name: string;
  subtotalCents: Cents;
  items: TodoItem[];
}

function groupByPerson(todos: TodoItem[]): PersonGroup[] {
  const groups = new Map<string, PersonGroup>();
  for (const item of todos) {
    const key = item.name.trim().toLowerCase();
    let group = groups.get(key);
    if (!group) {
      group = { key, name: item.name.trim(), subtotalCents: 0, items: [] };
      groups.set(key, group);
    }
    group.subtotalCents += item.amountCents;
    group.items.push(item);
  }
  return [...groups.values()];
}

export function TodoList(): JSX.Element {
  const workingSet = useBudgetStore((s) => s.workingSet);
  const markShareRequested = useBudgetStore((s) => s.markShareRequested);

  const transactions = workingSet?.transactions;
  const todos = useMemo(
    () => (transactions ? selectTodos(transactions) : []),
    [transactions],
  );
  const groups = useMemo(() => groupByPerson(todos), [todos]);
  const dates = useMemo(
    () => new Map((transactions ?? []).map((t) => [t.id, t.date])),
    [transactions],
  );

  if (!workingSet) {
    return (
      <p className="rounded-lg border border-dashed border-zinc-300 bg-white p-6 text-sm text-zinc-600">
        Import a statement first.{" "}
        <Link href="/" className={LINK}>
          Go to the month
        </Link>
      </p>
    );
  }

  if (todos.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-zinc-300 bg-white p-6 text-sm text-zinc-600">
        Nothing left to collect. You can export the month now.{" "}
        <Link href="/" className={LINK}>
          Back to the month
        </Link>
      </p>
    );
  }

  const totalCents = groups.reduce((sum, g) => sum + g.subtotalCents, 0);

  return (
    <div className="space-y-4">
      <p className="flex items-baseline justify-between gap-4 rounded-lg border border-zinc-200 bg-white px-4 py-3 text-sm">
        <span>
          {todos.length} {todos.length === 1 ? "request" : "requests"} still to
          send
        </span>
        <span className="text-base font-semibold tabular-nums">
          {formatCents(totalCents)}
        </span>
      </p>

      {groups.map((group) => (
        <section
          key={group.key}
          aria-label={`To collect from ${group.name}`}
          className="rounded-lg border border-zinc-200 bg-white"
        >
          <h2 className="flex items-baseline justify-between gap-4 border-b border-zinc-200 px-4 py-2 text-sm font-semibold">
            <span className="min-w-0 truncate">{group.name}</span>
            <span className="shrink-0 tabular-nums">
              {formatCents(group.subtotalCents)}
            </span>
          </h2>
          <ul className="divide-y divide-zinc-100">
            {group.items.map((item) => (
              <li
                key={`${item.transactionId}:${item.shareId}`}
                className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-2 text-sm"
              >
                <span className="min-w-0 flex-1">
                  <span className="block break-words">{formatTodo(item)}</span>
                  <span className="block text-xs text-zinc-500">
                    {shortDate(dates.get(item.transactionId) ?? "")}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() =>
                    markShareRequested(item.transactionId, item.shareId)
                  }
                  className={`shrink-0 rounded border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-800 hover:bg-zinc-50 ${FOCUS}`}
                >
                  Requested, remove
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
