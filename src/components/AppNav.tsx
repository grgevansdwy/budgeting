"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, type JSX } from "react";
import { useBudgetStore } from "@/lib/store/store";
import { selectTodos } from "@/lib/todo/todos";

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/** "2026-10" -> "October 2026". Plain string work, so no timezone can shift the month. */
function monthLabel(month: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(month);
  const name = m ? MONTHS[Number(m[2]) - 1] : undefined;
  return m && name ? `${name} ${m[1]}` : month;
}

const LINK_BASE =
  "flex items-center gap-1.5 rounded px-2.5 py-1 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700";

function linkClass(active: boolean): string {
  return `${LINK_BASE} ${
    active
      ? "bg-emerald-50 text-emerald-800"
      : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
  }`;
}

export function AppNav(): JSX.Element {
  const pathname = usePathname();
  const workingSet = useBudgetStore((s) => s.workingSet);
  const transactions = workingSet?.transactions;
  const todoCount = useMemo(
    () => (transactions ? selectTodos(transactions).length : 0),
    [transactions],
  );

  const onTodo = pathname === "/todo" || pathname.startsWith("/todo/");
  const onMonth = pathname === "/";

  return (
    <header className="border-b border-zinc-200 bg-white">
      <nav
        aria-label="Main"
        className="mx-auto flex w-full max-w-6xl items-center gap-4 px-4 py-2"
      >
        <span className="text-base font-semibold text-zinc-900">Budget</span>
        <ul className="flex items-center gap-1">
          <li>
            <Link
              href="/"
              aria-current={onMonth ? "page" : undefined}
              className={linkClass(onMonth)}
            >
              Month
            </Link>
          </li>
          <li>
            <Link
              href="/todo"
              aria-current={onTodo ? "page" : undefined}
              className={linkClass(onTodo)}
            >
              To-do
              {todoCount > 0 && (
                <span className="rounded-full bg-emerald-700 px-1.5 text-xs font-semibold text-white tabular-nums">
                  {todoCount}
                  <span className="sr-only"> to collect</span>
                </span>
              )}
            </Link>
          </li>
        </ul>
        {workingSet && (
          <span className="ml-auto text-sm text-zinc-600">
            {monthLabel(workingSet.month)}
          </span>
        )}
      </nav>
    </header>
  );
}
