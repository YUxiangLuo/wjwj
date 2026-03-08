import type { ChartRow, ChartSeries } from "./analysis-utils";

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

export function downloadChartAsSvg(params: {
    title: string;
    rows: ChartRow[];
    series: ChartSeries[];
    fileName: string;
    unit?: string;
}) {
    const { title, rows, series, fileName, unit = "" } = params;
    if (rows.length === 0 || series.length === 0) return;

    const values = rows.flatMap((row) => series.map((s) => row.values[s.key] ?? 0));
    const maxValue = Math.max(...values, 1);

    const width = 1080;
    const height = 620;
    const margin = { top: 90, right: 60, bottom: 150, left: 90 };
    const plotWidth = width - margin.left - margin.right;
    const plotHeight = height - margin.top - margin.bottom;
    const groupWidth = plotWidth / rows.length;
    const barGroupWidth = groupWidth * 0.72;
    const barWidth = barGroupWidth / Math.max(series.length, 1);

    const gridLines = Array.from({ length: 6 }, (_, i) => {
        const ratio = i / 5;
        const y = margin.top + plotHeight * (1 - ratio);
        const value = maxValue * ratio;
        return { y, value };
    });

    const legend = series
        .map((s, index) => {
            const x = margin.left + index * 180;
            return `
      <rect x="${x}" y="38" width="14" height="14" rx="3" fill="${s.color}" />
      <text x="${x + 22}" y="49" fill="#cbd5e1" font-size="14">${escapeXml(s.label)}</text>
    `;
        })
        .join("\n");

    const bars = rows
        .map((row, rowIndex) => {
            const groupStart = margin.left + rowIndex * groupWidth + (groupWidth - barGroupWidth) / 2;
            const rowBars = series
                .map((s, seriesIndex) => {
                    const value = row.values[s.key] ?? 0;
                    const barHeight = maxValue > 0 ? (value / maxValue) * plotHeight : 0;
                    const x = groupStart + seriesIndex * barWidth;
                    const y = margin.top + plotHeight - barHeight;
                    const labelY = y - 8;
                    return `
          <rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${Math.max(barWidth - 4, 1).toFixed(2)}" height="${barHeight.toFixed(2)}" rx="4" fill="${s.color}" />
          <text x="${(x + (barWidth - 4) / 2).toFixed(2)}" y="${labelY.toFixed(2)}" text-anchor="middle" fill="#94a3b8" font-size="11">${value.toFixed(2)}${escapeXml(unit)}</text>
        `;
                })
                .join("\n");

            const labelX = groupStart + barGroupWidth / 2;
            return `
        ${rowBars}
        <text x="${labelX.toFixed(2)}" y="${(margin.top + plotHeight + 28).toFixed(2)}" text-anchor="middle" fill="#cbd5e1" font-size="12">${escapeXml(row.label)}</text>
      `;
        })
        .join("\n");

    const grid = gridLines
        .map((line) => `
      <line x1="${margin.left}" y1="${line.y.toFixed(2)}" x2="${(margin.left + plotWidth).toFixed(2)}" y2="${line.y.toFixed(2)}" stroke="#334155" stroke-width="1" />
      <text x="${margin.left - 12}" y="${(line.y + 4).toFixed(2)}" text-anchor="end" fill="#64748b" font-size="11">${line.value.toFixed(1)}${escapeXml(unit)}</text>
    `)
        .join("\n");

    const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="100%" height="100%" fill="#020617" />
  <text x="${margin.left}" y="30" fill="#e2e8f0" font-size="22" font-weight="700">${escapeXml(title)}</text>
  ${legend}
  ${grid}
  <line x1="${margin.left}" y1="${margin.top + plotHeight}" x2="${margin.left + plotWidth}" y2="${margin.top + plotHeight}" stroke="#475569" stroke-width="1.2" />
  <line x1="${margin.left}" y1="${margin.top}" x2="${margin.left}" y2="${margin.top + plotHeight}" stroke="#475569" stroke-width="1.2" />
  ${bars}
</svg>`.trim();

    triggerSvgDownload(fileName, svg);
}
