// Class strings shared by the ledger components.

export const focusRing =
  "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-emerald-600";

/** Compact text button used for row actions. */
export const textButton = `rounded px-1.5 py-0.5 text-xs font-medium whitespace-nowrap text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 disabled:cursor-not-allowed disabled:text-zinc-300 disabled:hover:bg-transparent ${focusRing}`;

export const dangerTextButton = `rounded px-1.5 py-0.5 text-xs font-medium whitespace-nowrap text-red-700 hover:bg-red-50 ${focusRing}`;

export const primaryButton = `rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 ${focusRing}`;

export const secondaryButton = `rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 ${focusRing}`;

export const dangerButton = `rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-red-700`;

export const badge =
  "inline-flex items-center rounded px-1.5 py-0.5 text-[11px] leading-4 font-semibold";
