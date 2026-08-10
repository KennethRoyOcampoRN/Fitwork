import { createCanvas, SKRSContext2D } from "@napi-rs/canvas";
import { Tally } from "./stats";

// Chart rendering for the APE Comprehensive report — @napi-rs/canvas
// (prebuilt binaries, no native compilation, unlike node-canvas) rendering
// straight to PNG, embedded via docx's ImageRun in docBuilder.ts. Explicitly
// set to "DejaVu Sans" (confirmed present on this system) rather than
// relying on a default font, since department/employee names may contain ñ
// and other diacritics that a narrower font could render as tofu boxes.
const FONT = "DejaVu Sans";

export interface ChartBranding {
  primaryColor: string;
  accentColor: string;
}

// primaryColor mirrors the app's default brand Primary (teal) so an
// unbranded install's charts match its unbranded UI. accentColor is a
// fixed second-series color, deliberately NOT the brand Accent (see
// resolveChartBranding in apeComprehensiveReport.ts) — kept as the old
// brand orange specifically so it stays visually distinct from
// primaryColor in the common case where neither has been customized.
export const DEFAULT_CHART_BRANDING: ChartBranding = { primaryColor: "#08514E", accentColor: "#D2571A" };

export interface RenderedChart {
  buffer: Buffer;
  width: number;
  height: number;
}

const CHART_WIDTH = 620;
const CHART_HEIGHT = 360;
const MARGIN = { top: 30, right: 20, bottom: 70, left: 50 };

function truncateLabel(label: string, maxChars: number): string {
  return label.length > maxChars ? `${label.slice(0, maxChars - 1)}…` : label;
}

// A single-series bar chart — used for every demographic breakdown and
// per-component classification tally. Returns null when there's nothing to
// plot (zero-n): the caller skips the chart/table entirely rather than
// rendering an empty axis, per the zero-n handling rule.
export function renderBarChart(title: string, data: Tally[], branding: ChartBranding = DEFAULT_CHART_BRANDING): RenderedChart | null {
  if (data.length === 0) return null;

  const canvas = createCanvas(CHART_WIDTH, CHART_HEIGHT);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, CHART_WIDTH, CHART_HEIGHT);

  ctx.fillStyle = "#222222";
  ctx.font = `bold 15px "${FONT}"`;
  ctx.textAlign = "center";
  ctx.fillText(title, CHART_WIDTH / 2, 20);

  const plotWidth = CHART_WIDTH - MARGIN.left - MARGIN.right;
  const plotHeight = CHART_HEIGHT - MARGIN.top - MARGIN.bottom;
  const maxValue = Math.max(...data.map((d) => d.count), 1);
  const barSlot = plotWidth / data.length;
  const barWidth = Math.min(barSlot * 0.6, 70);

  // Axis line
  ctx.strokeStyle = "#CCCCCC";
  ctx.beginPath();
  ctx.moveTo(MARGIN.left, MARGIN.top + plotHeight);
  ctx.lineTo(MARGIN.left + plotWidth, MARGIN.top + plotHeight);
  ctx.stroke();

  data.forEach((d, i) => {
    const barHeight = maxValue > 0 ? (d.count / maxValue) * (plotHeight - 20) : 0;
    const x = MARGIN.left + i * barSlot + (barSlot - barWidth) / 2;
    const y = MARGIN.top + plotHeight - barHeight;

    ctx.fillStyle = i === 0 ? branding.primaryColor : branding.accentColor;
    ctx.fillRect(x, y, barWidth, barHeight);

    ctx.fillStyle = "#222222";
    ctx.font = `12px "${FONT}"`;
    ctx.textAlign = "center";
    ctx.fillText(String(d.count), x + barWidth / 2, y - 6);

    ctx.save();
    ctx.translate(x + barWidth / 2, MARGIN.top + plotHeight + 14);
    ctx.rotate(data.length > 5 ? -Math.PI / 6 : 0);
    ctx.textAlign = data.length > 5 ? "right" : "center";
    ctx.fillText(truncateLabel(d.label, 18), 0, 0);
    ctx.restore();
  });

  return { buffer: canvas.toBuffer("image/png"), width: CHART_WIDTH, height: CHART_HEIGHT };
}

// Grouped bar chart for year-over-year comparison — one group of bars per
// classification label, one bar per year within the group.
export function renderGroupedBarChart(
  title: string,
  years: number[],
  seriesByLabel: { label: string; counts: number[] }[], // counts[i] corresponds to years[i]
  branding: ChartBranding = DEFAULT_CHART_BRANDING,
): RenderedChart | null {
  if (seriesByLabel.length === 0 || years.length === 0) return null;

  const canvas = createCanvas(CHART_WIDTH, CHART_HEIGHT);
  const ctx: SKRSContext2D = canvas.getContext("2d");
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, CHART_WIDTH, CHART_HEIGHT);

  ctx.fillStyle = "#222222";
  ctx.font = `bold 15px "${FONT}"`;
  ctx.textAlign = "center";
  ctx.fillText(title, CHART_WIDTH / 2, 20);

  const plotWidth = CHART_WIDTH - MARGIN.left - MARGIN.right;
  const plotHeight = CHART_HEIGHT - MARGIN.top - MARGIN.bottom;
  const maxValue = Math.max(...seriesByLabel.flatMap((s) => s.counts), 1);
  const groupSlot = plotWidth / seriesByLabel.length;
  const barWidth = Math.min((groupSlot * 0.8) / years.length, 30);
  const colors = [branding.primaryColor, branding.accentColor, "#999999", "#CCCCCC", "#666666", "#333333"];

  ctx.strokeStyle = "#CCCCCC";
  ctx.beginPath();
  ctx.moveTo(MARGIN.left, MARGIN.top + plotHeight);
  ctx.lineTo(MARGIN.left + plotWidth, MARGIN.top + plotHeight);
  ctx.stroke();

  seriesByLabel.forEach((series, groupIdx) => {
    const groupX = MARGIN.left + groupIdx * groupSlot + (groupSlot - barWidth * years.length) / 2;
    years.forEach((year, yearIdx) => {
      const count = series.counts[yearIdx] ?? 0;
      const barHeight = maxValue > 0 ? (count / maxValue) * (plotHeight - 20) : 0;
      const x = groupX + yearIdx * barWidth;
      const y = MARGIN.top + plotHeight - barHeight;
      ctx.fillStyle = colors[yearIdx % colors.length];
      ctx.fillRect(x, y, barWidth - 2, barHeight);
    });

    ctx.fillStyle = "#222222";
    ctx.font = `11px "${FONT}"`;
    ctx.textAlign = "center";
    ctx.fillText(truncateLabel(series.label, 16), groupX + (barWidth * years.length) / 2, MARGIN.top + plotHeight + 16);
  });

  // Legend (one swatch per year)
  let legendX = MARGIN.left;
  const legendY = CHART_HEIGHT - 16;
  ctx.font = `11px "${FONT}"`;
  years.forEach((year, i) => {
    ctx.fillStyle = colors[i % colors.length];
    ctx.fillRect(legendX, legendY, 10, 10);
    ctx.fillStyle = "#222222";
    ctx.textAlign = "left";
    ctx.fillText(String(year), legendX + 14, legendY + 9);
    legendX += 60;
  });

  return { buffer: canvas.toBuffer("image/png"), width: CHART_WIDTH, height: CHART_HEIGHT };
}
