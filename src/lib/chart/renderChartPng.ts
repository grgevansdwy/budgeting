// Browser only: renders the category chart on an off-screen canvas for the Excel export.

import { buildChartConfig, type CategoryChartData } from "./chartConfig";
import { Chart } from "./register";

export const EXPORT_CHART_WIDTH = 900;
export const EXPORT_CHART_HEIGHT = 480;

/** Renders the same config on an off-screen canvas (900x480, white background, devicePixelRatio forced to 2) and returns a PNG data URL. Returns null when there is no data. */
export async function renderChartPng(
  data: CategoryChartData,
  title?: string,
): Promise<string | null> {
  if (data.labels.length === 0) return null;
  const canvas = document.createElement("canvas");
  canvas.width = EXPORT_CHART_WIDTH;
  canvas.height = EXPORT_CHART_HEIGHT;
  // Animation is off, so the chart is fully drawn when the constructor returns.
  const chart = new Chart(
    canvas,
    buildChartConfig(data, { forExport: true, title }),
  );
  try {
    return chart.toBase64Image("image/png");
  } finally {
    chart.destroy();
  }
}
