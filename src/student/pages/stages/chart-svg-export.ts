import type { ChartRow, ChartSeries } from "./analysis-utils";
import { chartScale } from "./chart-scale";
import { formatStatistic } from "@/utils/statistic-format";
import { exportEChartSvg } from "@/components/charts/EChartBox";
import type { ECharts } from "@/components/charts/echarts-core";
import { getExecutiveChartTokens } from "@/components/charts/echarts-theme";

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

export interface ChartSvgParams {
    title: string;
    rows: ChartRow[];
    series: ChartSeries[];
    fileName: string;
    unit?: string;
    notes?: string[];
    echartInstance?: ECharts | null;
}

export interface ChartSvgTheme {
    background: string;
    foreground: string;
    mutedForeground: string;
    border: string;
}

function resolveThemeColor(styles: CSSStyleDeclaration | null, token: `--${string}`, fallback: string) {
    const value = styles?.getPropertyValue(token).trim();
    return value || fallback;
}

function resolveSeriesColor(styles: CSSStyleDeclaration | null, color: string) {
    const variable = color.match(/^var\((--[^)]+)\)$/)?.[1] as `--${string}` | undefined;
    if (!variable) return color;
    const raw = styles?.getPropertyValue(variable).trim();
    if (raw) return raw;
    const tokens = getExecutiveChartTokens();
    switch (variable) {
        case "--chart-1":
            return tokens.chart1;
        case "--chart-2":
            return tokens.chart2;
        case "--chart-3":
            return tokens.chart3;
        case "--chart-4":
            return tokens.chart4;
        case "--chart-5":
            return tokens.chart5;
        case "--chart-6":
            return tokens.chart6;
        case "--chart-7":
            return tokens.chart7;
        case "--chart-8":
            return tokens.chart8;
        default:
            return tokens.primary;
    }
}

export function frameEChartSvg(
    rawEchartSvg: string,
    params: { title: string; notes?: string[] },
    theme: ChartSvgTheme,
): string {
    const trimmed = rawEchartSvg.trim();
    const widthMatch = trimmed.match(/\bwidth="([0-9.]+)"/);
    const heightMatch = trimmed.match(/\bheight="([0-9.]+)"/);
    const innerWidth = Math.max(480, Math.round(Number(widthMatch?.[1] ?? 880)));
    const innerHeight = Math.max(240, Math.round(Number(heightMatch?.[1] ?? 360)));

    const padX = 36;
    const headerHeight = 56;
    const noteLines = (params.notes ?? []).flatMap((note) => note.match(/.{1,62}/gu) ?? []);
    const notesBlockHeight = noteLines.length > 0 ? 18 + noteLines.length * 22 : 0;
    const outerWidth = innerWidth + padX * 2;
    const outerHeight = headerHeight + innerHeight + notesBlockHeight + 24;

    return [
        `<svg xmlns="http://www.w3.org/2000/svg" width="${outerWidth}" height="${outerHeight}" viewBox="0 0 ${outerWidth} ${outerHeight}">`,
        `  <rect width="100%" height="100%" fill="${escapeXml(theme.background)}" />`,
        `  <text x="${padX}" y="36" fill="${escapeXml(theme.foreground)}" font-size="20" font-weight="700">${escapeXml(params.title)}</text>`,
        `  <g transform="translate(${padX}, ${headerHeight})">${trimmed}</g>`,
        ...noteLines.map(
            (note, index) =>
                `  <text x="${padX}" y="${headerHeight + innerHeight + 24 + index * 22}" fill="${escapeXml(theme.mutedForeground)}" font-size="13">${escapeXml(note)}</text>`,
        ),
        `</svg>`,
    ].join("\n");
}

export function buildChartSvg(params: ChartSvgParams, theme: ChartSvgTheme) {
    const { title, rows, series, unit = "", notes = [] } = params;
    if (rows.length === 0 || series.length === 0) return null;

    const values = rows.flatMap((row) => series.map((s) => row.values[s.key] ?? 0));
    const scale = chartScale(values);

    const width = 1080;
    const noteLines = notes.flatMap((note) => note.match(/.{1,60}/gu) ?? []);
    const height = 620 + noteLines.length * 24;
    const margin = { top: 90, right: 60, bottom: 150, left: 90 };
    const plotWidth = width - margin.left - margin.right;
    const plotHeight = 620 - margin.top - margin.bottom;
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
  ${noteLines.map((note, index) => `<text x="${margin.left}" y="${620 + index * 24}" fill="${escapeXml(theme.mutedForeground)}" font-size="14">${escapeXml(note)}</text>`).join("\n")}
</svg>`.trim();

    return svg;
}

export function resolveChartExportSvg(params: ChartSvgParams, theme: ChartSvgTheme): string | null {
    const liveEchartSvg = exportEChartSvg(params.echartInstance);
    if (liveEchartSvg) {
        return frameEChartSvg(liveEchartSvg, { title: params.title, notes: params.notes }, theme);
    }
    return buildChartSvg(params, theme);
}

export function downloadChartAsSvg(params: ChartSvgParams) {
    const styles =
        typeof document !== "undefined" && typeof getComputedStyle === "function"
            ? getComputedStyle(document.documentElement)
            : null;
    const fallbackTokens = getExecutiveChartTokens();
    const theme: ChartSvgTheme = {
        background: resolveThemeColor(styles, "--card", fallbackTokens.card),
        foreground: resolveThemeColor(styles, "--foreground", fallbackTokens.foreground),
        mutedForeground: resolveThemeColor(styles, "--muted-foreground", fallbackTokens.mutedForeground),
        border: resolveThemeColor(styles, "--border", fallbackTokens.border),
    };

    const svg = resolveChartExportSvg(
        {
            ...params,
            series: params.series.map((series) => ({
                ...series,
                color: resolveSeriesColor(styles, series.color),
            })),
        },
        theme,
    );

    if (svg) triggerSvgDownload(params.fileName, svg);
}
