/**
 * Pure SVG rendering for the sprint burndown chart.
 * No VS Code dependencies — fully unit testable with Vitest.
 */

import { BurndownDataPoint, formatShortDate, parseISODate, addDays } from './burndownUtils';

// ─── SVG layout constants ───────────────────────────────────────────────────

const CHART_PADDING_TOP = 24;
const CHART_PADDING_BOTTOM = 48;
const CHART_PADDING_LEFT = 44;
const CHART_PADDING_RIGHT = 16;
const VIEWBOX_WIDTH = 360;
const VIEWBOX_HEIGHT = 200;
const PLOT_WIDTH = VIEWBOX_WIDTH - CHART_PADDING_LEFT - CHART_PADDING_RIGHT;
const PLOT_HEIGHT = VIEWBOX_HEIGHT - CHART_PADDING_TOP - CHART_PADDING_BOTTOM;

// ─── Render functions ───────────────────────────────────────────────────────

/**
 * Render the full burndown chart HTML (self-contained, VS Code theme-aware).
 */
export function renderBurndownHtml(
  dataPoints: BurndownDataPoint[],
  sprintName: string,
  locale?: string,
): string {
  const svg = renderBurndownSvg(dataPoints, sprintName, locale);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body {
      margin: 0;
      padding: 8px;
      background: transparent;
      overflow: hidden;
    }
  </style>
</head>
<body>${svg}</body>
</html>`;
}

/**
 * Render an inline SVG for the burndown chart.
 * Uses VS Code CSS variables for theme compatibility.
 */
export function renderBurndownSvg(
  dataPoints: BurndownDataPoint[],
  sprintName: string,
  locale?: string,
): string {
  if (dataPoints.length === 0) {
    return renderPlaceholderSvg('No data for this sprint');
  }

  const maxPoints = Math.max(...dataPoints.map(d => d.ideal), ...dataPoints.filter(d => d.actual !== null).map(d => d.actual!), 1);
  const numDays = dataPoints.length;

  // Helper: data coords → SVG coords
  const x = (dayIndex: number) => CHART_PADDING_LEFT + (dayIndex / Math.max(numDays - 1, 1)) * PLOT_WIDTH;
  const y = (points: number) => CHART_PADDING_TOP + (1 - points / maxPoints) * PLOT_HEIGHT;

  // Build paths
  const idealPath = dataPoints.map((d, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(d.ideal).toFixed(1)}`).join(' ');

  const actualPoints = dataPoints.filter(d => d.actual !== null);
  const actualPath = actualPoints.map((d, i) => {
    const dayIndex = dataPoints.indexOf(d);
    return `${i === 0 ? 'M' : 'L'}${x(dayIndex).toFixed(1)},${y(d.actual!).toFixed(1)}`;
  }).join(' ');

  // Gridlines (horizontal)
  const gridLines: string[] = [];
  const gridSteps = niceGridSteps(maxPoints);
  for (const val of gridSteps) {
    if (val > 0 && val < maxPoints) {
      const gy = y(val).toFixed(1);
      gridLines.push(`<line x1="${CHART_PADDING_LEFT}" y1="${gy}" x2="${VIEWBOX_WIDTH - CHART_PADDING_RIGHT}" y2="${gy}" stroke="var(--vscode-editorWidget-border, #444)" stroke-width="0.5" stroke-dasharray="3,3" />`);
      gridLines.push(`<text x="${CHART_PADDING_LEFT - 4}" y="${gy}" text-anchor="end" dominant-baseline="middle" fill="var(--vscode-descriptionForeground, #888)" font-size="8">${val}</text>`);
    }
  }

  // X-axis date labels (skip some if too dense)
  const xLabels: string[] = [];
  const labelStep = numDays <= 7 ? 1 : numDays <= 14 ? 2 : Math.ceil(numDays / 7);
  for (let i = 0; i < numDays; i += labelStep) {
    const date = parseISODate(dataPoints[i].date);
    const label = formatShortDate(date, locale);
    xLabels.push(`<text x="${x(i).toFixed(1)}" y="${VIEWBOX_HEIGHT - CHART_PADDING_BOTTOM + 14}" text-anchor="middle" fill="var(--vscode-descriptionForeground, #888)" font-size="7">${label}</text>`);
  }
  // Always show last label if not already shown
  if ((numDays - 1) % labelStep !== 0 && numDays > 1) {
    const lastDate = parseISODate(dataPoints[numDays - 1].date);
    xLabels.push(`<text x="${x(numDays - 1).toFixed(1)}" y="${VIEWBOX_HEIGHT - CHART_PADDING_BOTTOM + 14}" text-anchor="middle" fill="var(--vscode-descriptionForeground, #888)" font-size="7">${formatShortDate(lastDate, locale)}</text>`);
  }

  // Today marker (vertical dashed line)
  let todayMarker = '';
  if (actualPoints.length > 0 && actualPoints.length < numDays) {
    const todayIdx = dataPoints.indexOf(actualPoints[actualPoints.length - 1]);
    const tx = x(todayIdx).toFixed(1);
    todayMarker = `<line x1="${tx}" y1="${CHART_PADDING_TOP}" x2="${tx}" y2="${CHART_PADDING_TOP + PLOT_HEIGHT}" stroke="var(--vscode-descriptionForeground, #888)" stroke-width="0.5" stroke-dasharray="2,2" />
    <text x="${tx}" y="${CHART_PADDING_TOP - 4}" text-anchor="middle" fill="var(--vscode-descriptionForeground, #888)" font-size="7">today</text>`;
  }

  // Actual data point dots
  const actualDots = actualPoints.map(d => {
    const dayIndex = dataPoints.indexOf(d);
    return `<circle cx="${x(dayIndex).toFixed(1)}" cy="${y(d.actual!).toFixed(1)}" r="2.5" fill="var(--vscode-charts-red, #f14c4c)" />`;
  }).join('\n    ');

  // Y-axis label
  const yAxisLabel = `<text x="6" y="${CHART_PADDING_TOP + PLOT_HEIGHT / 2}" text-anchor="middle" dominant-baseline="middle" transform="rotate(-90, 6, ${CHART_PADDING_TOP + PLOT_HEIGHT / 2})" fill="var(--vscode-descriptionForeground, #888)" font-size="8">Points</text>`;

  // Axis lines
  const axes = `<line x1="${CHART_PADDING_LEFT}" y1="${CHART_PADDING_TOP}" x2="${CHART_PADDING_LEFT}" y2="${CHART_PADDING_TOP + PLOT_HEIGHT}" stroke="var(--vscode-editorWidget-border, #555)" stroke-width="1" />
    <line x1="${CHART_PADDING_LEFT}" y1="${CHART_PADDING_TOP + PLOT_HEIGHT}" x2="${VIEWBOX_WIDTH - CHART_PADDING_RIGHT}" y2="${CHART_PADDING_TOP + PLOT_HEIGHT}" stroke="var(--vscode-editorWidget-border, #555)" stroke-width="1" />`;

  // 0 and max labels
  const yExtremes = `<text x="${CHART_PADDING_LEFT - 4}" y="${y(0).toFixed(1)}" text-anchor="end" dominant-baseline="middle" fill="var(--vscode-descriptionForeground, #888)" font-size="8">0</text>
    <text x="${CHART_PADDING_LEFT - 4}" y="${y(maxPoints).toFixed(1)}" text-anchor="end" dominant-baseline="middle" fill="var(--vscode-descriptionForeground, #888)" font-size="8">${maxPoints}</text>`;

  // Legend
  const legendY = VIEWBOX_HEIGHT - 10;
  const legend = `<line x1="${CHART_PADDING_LEFT}" y1="${legendY}" x2="${CHART_PADDING_LEFT + 16}" y2="${legendY}" stroke="var(--vscode-foreground, #ccc)" stroke-width="1.5" stroke-dasharray="4,2" />
    <text x="${CHART_PADDING_LEFT + 20}" y="${legendY}" dominant-baseline="middle" fill="var(--vscode-descriptionForeground, #888)" font-size="7">Ideal</text>
    <line x1="${CHART_PADDING_LEFT + 54}" y1="${legendY}" x2="${CHART_PADDING_LEFT + 70}" y2="${legendY}" stroke="var(--vscode-charts-red, #f14c4c)" stroke-width="1.5" />
    <circle cx="${CHART_PADDING_LEFT + 62}" cy="${legendY}" r="2" fill="var(--vscode-charts-red, #f14c4c)" />
    <text x="${CHART_PADDING_LEFT + 74}" y="${legendY}" dominant-baseline="middle" fill="var(--vscode-descriptionForeground, #888)" font-size="7">Actual</text>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}" width="100%" preserveAspectRatio="xMidYMid meet" style="max-width: 100%;">
    <!-- Title -->
    <text x="${VIEWBOX_WIDTH / 2}" y="12" text-anchor="middle" fill="var(--vscode-foreground, #ccc)" font-size="10" font-weight="600">${escapeXml(sprintName)}</text>

    <!-- Grid -->
    ${gridLines.join('\n    ')}

    <!-- Axes -->
    ${axes}
    ${yExtremes}
    ${yAxisLabel}

    <!-- X labels -->
    ${xLabels.join('\n    ')}

    <!-- Today marker -->
    ${todayMarker}

    <!-- Ideal line (dashed black/foreground) -->
    <path d="${idealPath}" fill="none" stroke="var(--vscode-foreground, #ccc)" stroke-width="1.5" stroke-dasharray="4,2" />

    <!-- Actual line (solid red) -->
    ${actualPath ? `<path d="${actualPath}" fill="none" stroke="var(--vscode-charts-red, #f14c4c)" stroke-width="1.5" />` : ''}

    <!-- Actual data dots -->
    ${actualDots}

    <!-- Legend -->
    ${legend}
  </svg>`;
}

/**
 * Render a placeholder SVG when the chart cannot be shown.
 */
export function renderPlaceholderSvg(message: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}" width="100%" preserveAspectRatio="xMidYMid meet">
    <text x="${VIEWBOX_WIDTH / 2}" y="${VIEWBOX_HEIGHT / 2}" text-anchor="middle" dominant-baseline="middle" fill="var(--vscode-descriptionForeground, #888)" font-size="10">${escapeXml(message)}</text>
  </svg>`;
}

/**
 * Render placeholder HTML page.
 */
export function renderPlaceholderHtml(message: string): string {
  const svg = renderPlaceholderSvg(message);
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body {
      margin: 0;
      padding: 8px;
      background: transparent;
      overflow: hidden;
    }
  </style>
</head>
<body>${svg}</body>
</html>`;
}

// ─── Internal helpers ───────────────────────────────────────────────────────

/**
 * Calculate nice grid step values for the Y axis.
 */
function niceGridSteps(maxVal: number): number[] {
  if (maxVal <= 0) { return []; }

  // Target ~4 gridlines
  const rough = maxVal / 4;
  const magnitude = Math.pow(10, Math.floor(Math.log10(rough)));
  const residual = rough / magnitude;

  let step: number;
  if (residual <= 1.5) { step = 1 * magnitude; }
  else if (residual <= 3.5) { step = 2 * magnitude; }
  else if (residual <= 7.5) { step = 5 * magnitude; }
  else { step = 10 * magnitude; }

  const steps: number[] = [];
  for (let v = step; v < maxVal; v += step) {
    steps.push(Math.round(v * 100) / 100);
  }
  return steps;
}

/**
 * Escape XML special characters for safe SVG text content.
 */
function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
