// Pure chart configuration: no DOM access at module or build time, so it is unit-testable in Node.
// Sums stay integer cents; division by 100 happens only where numbers are handed to Chart.js.

import type { ChartConfiguration, Plugin } from "chart.js";
import { formatCents } from "../money";
import { OTHER_CATEGORY_ID, type Category, type Cents } from "../types";

export interface CategoryChartData {
  labels: string[];
  valuesCents: Cents[];
}

const BAR_COLOR = "#2a78d6";
const TEXT_COLOR = "#18181b";
const MUTED_TEXT_COLOR = "#52525b";
const GRID_COLOR = "#e4e4e7";
const FONT_FAMILY =
  'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

/** Expense categories with spending > 0, largest first. Unknown category ids are labelled "Other" and merged. */
export function buildCategoryChartData(
  byCategory: Record<string, Cents>,
  categories: Category[],
): CategoryChartData {
  const names = new Map(categories.map((c) => [c.id, c.name]));
  const otherLabel = names.get(OTHER_CATEGORY_ID) ?? "Other";
  const sums = new Map<string, Cents>();
  for (const [id, cents] of Object.entries(byCategory)) {
    if (!Number.isSafeInteger(cents)) {
      throw new Error(`Not an integer cent amount for category ${id}`);
    }
    const label = names.get(id) ?? otherLabel;
    sums.set(label, (sums.get(label) ?? 0) + cents);
  }
  const rows = [...sums.entries()]
    .filter(([, cents]) => cents > 0)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  return {
    labels: rows.map(([label]) => label),
    valuesCents: rows.map(([, cents]) => cents),
  };
}

/** Chart.js hands axis values back in dollars; turn them into cents for formatCents. */
export function formatDollarsTick(value: number | string): string {
  const dollars = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(dollars)) return "";
  return formatCents(Math.round(dollars * 100));
}

/** Draws each bar's exact amount just past its end. Reads the integer cents, not the float. */
function valueLabelPlugin(valuesCents: Cents[]): Plugin<"bar"> {
  return {
    id: "categoryValueLabels",
    afterDatasetsDraw(chart) {
      const { ctx } = chart;
      const meta = chart.getDatasetMeta(0);
      ctx.save();
      ctx.font = `12px ${FONT_FAMILY}`;
      ctx.fillStyle = TEXT_COLOR;
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      meta.data.forEach((bar, i) => {
        const cents = valuesCents[i];
        if (cents === undefined) return;
        ctx.fillText(formatCents(cents), bar.x + 6, bar.y);
      });
      ctx.restore();
    },
  };
}

const whiteBackgroundPlugin: Plugin<"bar"> = {
  id: "categoryWhiteBackground",
  beforeDraw(chart) {
    const { ctx, width, height } = chart;
    ctx.save();
    ctx.globalCompositeOperation = "destination-over";
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
  },
};

/** Horizontal bar chart config; axis ticks and data labels formatted as money via formatCents; animation off when `forExport`. */
export function buildChartConfig(
  data: CategoryChartData,
  opts: { forExport?: boolean; title?: string } = {},
): ChartConfiguration<"bar"> {
  const forExport = opts.forExport ?? false;
  const valuesCents = [...data.valuesCents];
  const plugins: Plugin<"bar">[] = [valueLabelPlugin(valuesCents)];
  if (forExport) plugins.push(whiteBackgroundPlugin);

  return {
    type: "bar",
    data: {
      labels: [...data.labels],
      datasets: [
        {
          label: "Spending",
          // The one cents-to-dollars conversion, at the Chart.js boundary.
          data: valuesCents.map((cents) => cents / 100),
          backgroundColor: BAR_COLOR,
          borderRadius: 4,
          maxBarThickness: 28,
        },
      ],
    },
    options: {
      indexAxis: "y",
      responsive: !forExport,
      maintainAspectRatio: false,
      animation: forExport ? false : { duration: 300 },
      ...(forExport ? { devicePixelRatio: 2 } : {}),
      // Room on the right for the amount drawn past the longest bar.
      layout: { padding: { right: 84, left: 4, top: 4, bottom: 4 } },
      scales: {
        x: {
          beginAtZero: true,
          grid: { color: GRID_COLOR },
          border: { display: false },
          ticks: {
            color: MUTED_TEXT_COLOR,
            font: { family: FONT_FAMILY, size: 12 },
            maxTicksLimit: 6,
            callback: (value) => formatDollarsTick(value),
          },
        },
        y: {
          grid: { display: false },
          ticks: {
            color: TEXT_COLOR,
            font: { family: FONT_FAMILY, size: 13 },
          },
        },
      },
      plugins: {
        title: {
          display: Boolean(opts.title),
          text: opts.title ?? "",
          color: TEXT_COLOR,
          align: "start",
          font: { family: FONT_FAMILY, size: 16, weight: "bold" },
          padding: { bottom: 12 },
        },
        tooltip: {
          enabled: !forExport,
          callbacks: {
            label: (item) => {
              const cents = valuesCents[item.dataIndex];
              return cents === undefined ? "" : formatCents(cents);
            },
          },
        },
      },
    },
    plugins,
  };
}
