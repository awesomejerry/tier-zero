import type { SweepPoint } from "@tier-zero/core";

export const CHART_DISCLAIMER =
  "Mock mode. Latencies are simulated and decisions are scripted. This is not a measurement of the OpenAI or TypeSafe APIs.";

interface Series {
  name: string;
  color: string;
  dashed?: boolean;
  values: number[];
}

function formatTick(value: number, kind: "percent" | "ms" | "usd"): string {
  if (kind === "percent") return `${Math.round(value * 100)}%`;
  if (kind === "usd") {
    if (value >= 10) return `$${value.toFixed(0)}`;
    if (value >= 1) return `$${value.toFixed(1)}`;
    return `$${value.toFixed(2)}`;
  }
  if (value >= 1000) return `${(value / 1000).toFixed(1)}s`;
  return `${Math.round(value)}ms`;
}

function pathFor(
  points: SweepPoint[],
  values: number[],
  x0: number,
  y0: number,
  width: number,
  height: number,
  min: number,
  max: number,
): string {
  const first = points[0]?.threshold ?? 0.5;
  const last = points[points.length - 1]?.threshold ?? 0.98;
  const span = last - first || 1;
  return values
    .map((value, index) => {
      const threshold = points[index]?.threshold ?? first;
      const x = x0 + ((threshold - first) / span) * width;
      const y = y0 + height - ((value - min) / (max - min || 1)) * height;
      return `${index === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

function panel(args: {
  title: string;
  kind: "percent" | "ms" | "usd";
  points: SweepPoint[];
  series: Series[];
  x: number;
  y: number;
  width: number;
  height: number;
}): string {
  const flat = args.series.flatMap((series) => series.values);
  const min = Math.min(...flat);
  const max = Math.max(...flat);
  const pad = (max - min) * 0.12 || 1;
  const low = args.kind === "percent" ? Math.max(0, min - pad) : Math.max(0, min - pad);
  const high = max + pad;
  const plotX = args.x + 52;
  const plotY = args.y + 28;
  const plotW = args.width - 68;
  const plotH = args.height - 52;
  const yTicks = [low, (low + high) / 2, high];
  const first = args.points[0]?.threshold ?? 0.5;
  const last = args.points[args.points.length - 1]?.threshold ?? 0.98;
  const xTicks = [first, Number((((first + last) / 2)).toFixed(2)), last];
  const lines = args.series
    .map((series) => {
      const d = pathFor(args.points, series.values, plotX, plotY, plotW, plotH, low, high);
      return `<path d="${d}" fill="none" stroke="${series.color}" stroke-width="2.2" ${
        series.dashed ? 'stroke-dasharray="5 4"' : ""
      }/>`;
    })
    .join("");
  const legend = args.series
    .map((series, index) => {
      const lx = plotX + 210 + index * 168;
      const ly = args.y + 12;
      return `<line x1="${lx}" y1="${ly}" x2="${lx + 16}" y2="${ly}" stroke="${series.color}" stroke-width="2.2" ${
        series.dashed ? 'stroke-dasharray="5 4"' : ""
      }/>
      <text x="${lx + 20}" y="${ly + 4}" fill="#3c403c" font-size="11">${series.name}</text>`;
    })
    .join("");
  const grid = yTicks
    .map((tick) => {
      const y = plotY + plotH - ((tick - low) / (high - low || 1)) * plotH;
      return `<line x1="${plotX}" y1="${y.toFixed(1)}" x2="${plotX + plotW}" y2="${y.toFixed(
        1,
      )}" stroke="#e4e0d6"/>
      <text x="${plotX - 8}" y="${(y + 4).toFixed(1)}" text-anchor="end" fill="#6d726c" font-size="11">${formatTick(
        tick,
        args.kind,
      )}</text>`;
    })
    .join("");
  const xLabels = xTicks
    .map((threshold) => {
      const span = (args.points[args.points.length - 1]?.threshold ?? 0.98) - (args.points[0]?.threshold ?? 0.5) || 1;
      const x = plotX + ((threshold - (args.points[0]?.threshold ?? 0.5)) / span) * plotW;
      return `<text x="${x.toFixed(1)}" y="${plotY + plotH + 16}" text-anchor="middle" fill="#6d726c" font-size="11">${threshold.toFixed(
        2,
      )}</text>`;
    })
    .join("");
  return `<text x="${args.x}" y="${args.y + 16}" fill="#1c211c" font-size="14" font-weight="600">${args.title}</text>
    ${grid}${lines}${xLabels}${legend}`;
}

export function renderChart(points: SweepPoint[]): string {
  const width = 960;
  const height = 760;
  const accuracy = panel({
    title: "Category accuracy",
    kind: "percent",
    points,
    x: 24,
    y: 78,
    width: 912,
    height: 190,
    series: [
      { name: "Tier Zero", color: "#1f7a4d", values: points.map((point) => point.tierZeroAccuracy) },
      {
        name: "LLM-only baseline",
        color: "#b5762a",
        dashed: true,
        values: points.map((point) => point.baselineAccuracy),
      },
    ],
  });
  const latency = panel({
    title: "Latency",
    kind: "ms",
    points,
    x: 24,
    y: 280,
    width: 912,
    height: 200,
    series: [
      { name: "Tier Zero p50", color: "#1f7a4d", values: points.map((point) => point.tierZeroP50Ms) },
      { name: "Tier Zero p95", color: "#7d9a62", values: points.map((point) => point.tierZeroP95Ms) },
      {
        name: "Baseline p50",
        color: "#b5762a",
        dashed: true,
        values: points.map((point) => point.baselineP50Ms),
      },
    ],
  });
  const cost = panel({
    title: "Cost per 1,000 tickets",
    kind: "usd",
    points,
    x: 24,
    y: 492,
    width: 912,
    height: 190,
    series: [
      {
        name: "Tier Zero",
        color: "#1f7a4d",
        values: points.map((point) => point.tierZeroCostPerThousandUsd),
      },
      {
        name: "LLM-only baseline",
        color: "#b5762a",
        dashed: true,
        values: points.map((point) => point.baselineCostPerThousandUsd),
      },
    ],
  });
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="${width}" height="${height}" fill="#f7f4ee"/>
  <text x="24" y="34" fill="#1c211c" font-size="20" font-family="Georgia, serif">Tier Zero mock benchmark</text>
  <text x="24" y="56" fill="#6d726c" font-size="12" font-family="ui-sans-serif, sans-serif">Confidence threshold on the x-axis. ${CHART_DISCLAIMER}</text>
  <g font-family="ui-sans-serif, sans-serif">
    ${accuracy}
    ${latency}
    ${cost}
  </g>
</svg>
`;
}
