// Registers only the Chart.js pieces the category bar chart uses, so the rest tree-shakes away.

import {
  BarController,
  BarElement,
  CategoryScale,
  Chart,
  LinearScale,
  Title,
  Tooltip,
} from "chart.js";

Chart.register(
  BarController,
  BarElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Title,
);

export { Chart };
