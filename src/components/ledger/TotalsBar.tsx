import { formatCents } from "@/lib/money";
import type { Cents } from "@/lib/types";

function Figure({
  label,
  cents,
  tone = "text-zinc-900",
}: {
  label: string;
  cents: Cents;
  tone?: string;
}) {
  return (
    <div className="px-4 py-3">
      <dt className="text-xs font-medium text-zinc-500">{label}</dt>
      <dd className={`mt-0.5 text-xl font-semibold tabular-nums ${tone}`}>
        {formatCents(cents)}
      </dd>
    </div>
  );
}

/** Month totals. Both inputs already leave out transfers and count only the user's share of splits. */
export function TotalsBar({
  expenseCents,
  incomeCents,
}: {
  expenseCents: Cents;
  incomeCents: Cents;
}) {
  const netCents = incomeCents - expenseCents;
  return (
    <dl className="grid grid-cols-1 divide-y divide-zinc-200 rounded-lg border border-zinc-200 bg-white sm:grid-cols-3 sm:divide-x sm:divide-y-0">
      <Figure label="Total spending" cents={expenseCents} />
      <Figure label="Total income" cents={incomeCents} />
      <Figure
        label="Net (income minus spending)"
        cents={netCents}
        tone={netCents >= 0 ? "text-emerald-700" : "text-red-700"}
      />
    </dl>
  );
}
