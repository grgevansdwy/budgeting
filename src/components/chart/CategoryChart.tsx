"use client";

import { useEffect, useRef } from "react";
import type { JSX } from "react";
import {
  buildChartConfig,
  type CategoryChartData,
} from "@/lib/chart/chartConfig";
import { Chart } from "@/lib/chart/register";
import { formatCents } from "@/lib/money";

const ROW_HEIGHT_PX = 40;
const AXIS_HEIGHT_PX = 56;

export function CategoryChart(props: { data: CategoryChartData }): JSX.Element {
  const { data } = props;
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const isEmpty = data.labels.length === 0;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || data.labels.length === 0) return;
    const chart = new Chart(canvas, buildChartConfig(data));
    return () => chart.destroy();
  }, [data]);

  if (isEmpty) {
    return (
      <p className="rounded-md border border-dashed border-zinc-300 px-4 py-8 text-center text-sm text-zinc-500">
        No spending to chart yet.
      </p>
    );
  }

  const summary = data.labels
    .map((label, i) => `${label} ${formatCents(data.valuesCents[i] ?? 0)}`)
    .join(", ");

  return (
    <div
      className="relative w-full"
      style={{ height: data.labels.length * ROW_HEIGHT_PX + AXIS_HEIGHT_PX }}
    >
      <canvas
        ref={canvasRef}
        role="img"
        aria-label={`Spending by category: ${summary}`}
      />
    </div>
  );
}
