import { describe, expect, it } from "vitest";
import type { Category } from "../types";
import {
  buildCategoryChartData,
  buildChartConfig,
  formatDollarsTick,
} from "./chartConfig";

const categories: Category[] = [
  { id: "groceries", name: "Groceries", builtIn: true },
  { id: "dining", name: "Dining", builtIn: true },
  { id: "transport", name: "Transport", builtIn: true },
  { id: "other", name: "Other", builtIn: true },
];

describe("buildCategoryChartData", () => {
  it("orders categories largest first", () => {
    const data = buildCategoryChartData(
      { dining: 4550, groceries: 12345, transport: 900 },
      categories,
    );
    expect(data).toEqual({
      labels: ["Groceries", "Dining", "Transport"],
      valuesCents: [12345, 4550, 900],
    });
  });

  it("omits categories with zero or negative spending", () => {
    const data = buildCategoryChartData(
      { dining: 0, groceries: 500, transport: -100 },
      categories,
    );
    expect(data).toEqual({ labels: ["Groceries"], valuesCents: [500] });
  });

  it("merges unknown ids into Other, together with the real Other category", () => {
    const data = buildCategoryChartData(
      { other: 100, "deleted-1": 250, "deleted-2": 50, groceries: 300 },
      categories,
    );
    expect(data).toEqual({
      labels: ["Other", "Groceries"],
      valuesCents: [400, 300],
    });
  });

  it('labels unknown ids "Other" even when no Other category exists', () => {
    const data = buildCategoryChartData({ gone: 700 }, []);
    expect(data).toEqual({ labels: ["Other"], valuesCents: [700] });
  });

  it("returns empty data when nothing was spent", () => {
    expect(buildCategoryChartData({}, categories)).toEqual({
      labels: [],
      valuesCents: [],
    });
  });

  it("rejects non-integer amounts", () => {
    expect(() => buildCategoryChartData({ dining: 10.5 }, categories)).toThrow(
      /integer cent/,
    );
  });
});

describe("buildChartConfig", () => {
  const data = { labels: ["Groceries", "Dining"], valuesCents: [123456, 1999] };

  it("hands Chart.js dollars and keeps the labels", () => {
    const config = buildChartConfig(data);
    expect(config.type).toBe("bar");
    expect(config.data.labels).toEqual(["Groceries", "Dining"]);
    expect(config.data.datasets[0].data).toEqual([1234.56, 19.99]);
    expect(config.options?.indexAxis).toBe("y");
  });

  it("formats value-axis ticks as money", () => {
    const config = buildChartConfig(data);
    const callback = config.options?.scales?.x?.ticks?.callback as (
      value: number | string,
    ) => string;
    expect(callback(1500)).toBe("$1,500.00");
    expect(callback(0)).toBe("$0.00");
    expect(callback(0.5)).toBe("$0.50");
    expect(formatDollarsTick(19.99)).toBe("$19.99");
    expect(formatDollarsTick("250")).toBe("$250.00");
  });

  it("formats tooltips from the integer cents", () => {
    const config = buildChartConfig(data);
    const label = config.options?.plugins?.tooltip?.callbacks?.label as (item: {
      dataIndex: number;
    }) => string;
    expect(label({ dataIndex: 0 })).toBe("$1,234.56");
    expect(label({ dataIndex: 1 })).toBe("$19.99");
  });

  it("animates on screen and is responsive", () => {
    const config = buildChartConfig(data);
    expect(config.options?.animation).not.toBe(false);
    expect(config.options?.responsive).toBe(true);
    expect(config.options?.plugins?.title?.display).toBe(false);
  });

  it("turns animation off and fixes the pixel ratio for export", () => {
    const config = buildChartConfig(data, {
      forExport: true,
      title: "Spending by category — October 2026",
    });
    expect(config.options?.animation).toBe(false);
    expect(config.options?.responsive).toBe(false);
    expect(config.options?.devicePixelRatio).toBe(2);
    expect(config.options?.plugins?.title?.display).toBe(true);
    expect(config.options?.plugins?.title?.text).toBe(
      "Spending by category — October 2026",
    );
    expect(config.plugins?.map((p) => p.id)).toContain(
      "categoryWhiteBackground",
    );
  });
});
