import type { ChartRow, ChartSeries } from "./analysis-utils";
import { chartScale } from "./chart-scale";
import { formatStatistic } from "@/utils/statistic-format";

export function sanitizeFileName(input: string) {
    return input.replace(/[\\/:*?"<>|\s]+/g, "_").replace(/_+/g, "_");
}

function escapeXml(input: string) {
    return input
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&apos;");
}

function triggerSvgDownload(fileName: string, svgContent: string) {
    const blob = new Blob([svgContent], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
}

interface ChartSvgParams {
    title: string;
    rows: ChartRow[];
    series: ChartSeries[];
    fileName: string;
    unit?: string;
}

export interface ChartSvgTheme {
    background: string;
    foreground: string;
    mutedForeground: string;
    border: string;
}

function requiredThemeColor(styles: CSSStyleDeclaration, token: string) {
    const value = styles.getPropertyValue(token).trim();
    if (!value) throw new Error(`缺少图表导出主题变量 ${token}`);
    return value;
}

function resolveSeriesColor(styles: CSSStyleDeclaration, color: string) {
    const variable = color.match(/^var\((--[^)]+)\)$/)?.[1];
    return variable ? requiredThemeColor(styles, variable) : color;
}

export function buildChartSvg(params: ChartSvgParams, theme: ChartSvgTheme) {
    const { title, rows, series, unit = "" } = params;
    if (rows.length === 0 || series.length === 0) return null;

    const values = rows.flatMap((row) => series.map((s) => row.values[s.key] ?? 0));
    const scale = chartScale(values);

    const width = 1080;
    const height = 620;
    const margin = { top: 90, right: 60, bottom: 150, left: 90 };
    const plotWidth = width - margin.left - margin.right;
    const plotHeight = height - margin.top - margin.bottom;
    const zeroY = margin.top + scale.max / scale.range * plotHeight;
    const groupWidth = plotWidth / rows.length;
    const barGroupWidth = groupWidth * 0.72;
    const barWidth = barGroupWidth / Math.max(series.length, 1);

    const gridLines = Array.from({ length: 6 }, (_, i) => {
        const ratio = i / 5;
        const y = margin.top + plotHeight * (1 - ratio);
        const value = scale.min + scale.range * ratio;
        return { y, value };
    });

    const legend = series
        .map((s, index) => {
            const x = margin.left + index * 180;
            return `
      <rect x="${x}" y="38" width="14" height="14" rx="3" fill="${s.color}" />
      <text x="${x + 22}" y="49" fill="${escapeXml(theme.mutedForeground)}" font-size="14">${escapeXml(s.label)}</text>
    `;
        })
        .join("\n");

    const bars = rows
        .map((row, rowIndex) => {
            const groupStart = margin.left + rowIndex * groupWidth + (groupWidth - barGroupWidth) / 2;
            const rowBars = series
                .map((s, seriesIndex) => {
                    const value = row.values[s.key] ?? 0;
                    const barHeight = Math.abs(value) / scale.range * plotHeight;
                    const x = groupStart + seriesIndex * barWidth;
                    const y = value >= 0 ? zeroY - barHeight : zeroY;
                    const labelY = value >= 0 ? y - 8 : y + barHeight + 14;
                    return `
          <rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${Math.max(barWidth - 4, 1).toFixed(2)}" height="${barHeight.toFixed(2)}" rx="4" fill="${s.color}" />
          <text x="${(x + (barWidth - 4) / 2).toFixed(2)}" y="${labelY.toFixed(2)}" text-anchor="middle" fill="${escapeXml(theme.mutedForeground)}" font-size="11">${formatStatistic(value, 2)}${escapeXml(unit)}</text>
        `;
                })
                .join("\n");

            const labelX = groupStart + barGroupWidth / 2;
            return `
        ${rowBars}
        <text x="${labelX.toFixed(2)}" y="${(margin.top + plotHeight + 28).toFixed(2)}" text-anchor="middle" fill="${escapeXml(theme.mutedForeground)}" font-size="12">${escapeXml(row.label)}</text>
      `;
        })
        .join("\n");

    const grid = gridLines
        .map((line) => `
      <line x1="${margin.left}" y1="${line.y.toFixed(2)}" x2="${(margin.left + plotWidth).toFixed(2)}" y2="${line.y.toFixed(2)}" stroke="${escapeXml(theme.border)}" stroke-width="1" />
      <text x="${margin.left - 12}" y="${(line.y + 4).toFixed(2)}" text-anchor="end" fill="${escapeXml(theme.mutedForeground)}" font-size="11">${formatStatistic(line.value, 1)}${escapeXml(unit)}</text>
    `)
        .join("\n");

    const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="100%" height="100%" fill="${escapeXml(theme.background)}" />
  <text x="${margin.left}" y="30" fill="${escapeXml(theme.foreground)}" font-size="22" font-weight="700">${escapeXml(title)}</text>
  ${legend}
  ${grid}
  <line x1="${margin.left}" y1="${zeroY}" x2="${margin.left + plotWidth}" y2="${zeroY}" stroke="${escapeXml(theme.mutedForeground)}" stroke-width="1.2" />
  <line x1="${margin.left}" y1="${margin.top}" x2="${margin.left}" y2="${margin.top + plotHeight}" stroke="${escapeXml(theme.mutedForeground)}" stroke-width="1.2" />
  ${bars}
</svg>`.trim();

    return svg;
}

export function downloadChartAsSvg(params: ChartSvgParams) {
    const styles = getComputedStyle(document.documentElement);
    const svg = buildChartSvg({
        ...params,
        series: params.series.map((series) => ({
            ...series,
            color: resolveSeriesColor(styles, series.color),
        })),
    }, {
        background: requiredThemeColor(styles, "--background"),
        foreground: requiredThemeColor(styles, "--foreground"),
        mutedForeground: requiredThemeColor(styles, "--muted-foreground"),
        border: requiredThemeColor(styles, "--border"),
    });

    if (svg) triggerSvgDownload(params.fileName, svg);
}
