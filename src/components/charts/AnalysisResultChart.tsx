import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type {
    CategoricalAnalysisResult,
    CrossTabAnalysisResult,
    NumericAnalysisResult,
    RawValue,
    SavedAnalysisView,
} from "@/domain/variables/types";
import { formatStatistic } from "@/utils/statistic-format";
import { EChartBox } from "./EChartBox";
import { disambiguateAxisLabels, truncateAxisLabel } from "./axis-label";
import type { EChartsCoreOption } from "./echarts-core";
import {
    CHART_FONT_FAMILY,
    buildExecutiveCategoryAxis,
    buildExecutiveGrid,
    buildExecutiveLegend,
    buildExecutiveTooltip,
    buildExecutiveValueAxis,
    getExecutiveChartTokens,
    type ExecutiveChartTokens,
} from "./echarts-theme";

export interface AnalysisResultChartProps {
    record: SavedAnalysisView;
    className?: string;
    testId?: string;
}

function escapeHtml(text: string): string {
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function describeRawType(input: RawValue): string {
    if (typeof input === "string") return `文本“${input}”`;
    if (typeof input === "number") return `数字 ${input}`;
    if (typeof input === "boolean") return `布尔 ${input}`;
    return "空值 null";
}

function formatMetric(val: number | null | undefined, digits = 2, unit = ""): string {
    if (val == null || !Number.isFinite(val)) return "—";
    const formatted = formatStatistic(val, digits);
    return unit ? `${formatted} ${unit}` : formatted;
}

function computeNiceStep(rawSpan: number, targetSplits = 5): number {
    const safeSpan = Number.isFinite(rawSpan) && rawSpan > 0 ? rawSpan : 1;
    const rough = safeSpan / targetSplits;
    const pow10 = 10 ** Math.floor(Math.log10(rough));
    const fraction = rough / pow10;
    let niceFraction: number;
    if (fraction <= 1) niceFraction = 1;
    else if (fraction <= 2) niceFraction = 2;
    else if (fraction <= 2.5) niceFraction = 2.5;
    else if (fraction <= 5) niceFraction = 5;
    else niceFraction = 10;
    return niceFraction * pow10;
}

function computePaddedDomain(
    values: number[],
    includeZero = false,
): { min: number; max: number; interval: number } {
    const finite = values.filter((v) => Number.isFinite(v));
    if (includeZero) finite.push(0);
    if (finite.length === 0) return { min: 0, max: 1, interval: 0.2 };
    let rawMin = Math.min(...finite);
    let rawMax = Math.max(...finite);
    const span = Math.max(
        Math.abs(rawMax - rawMin),
        Math.max(Math.abs(rawMax), Math.abs(rawMin)) * 0.16,
        1e-6,
    );
    rawMin = includeZero && rawMin >= 0 ? 0 : rawMin - span * 0.1;
    rawMax = includeZero && rawMax <= 0 ? 0 : rawMax + span * 0.14;
    const step = computeNiceStep(rawMax - rawMin, 4);
    const niceMin = rawMin === 0 ? 0 : Math.floor(rawMin / step) * step;
    const niceMax = rawMax === 0 ? 0 : Math.ceil(rawMax / step) * step;
    const finalMax = niceMax <= niceMin ? niceMin + step : niceMax;
    return {
        min: Number(niceMin.toPrecision(10)),
        max: Number(finalMax.toPrecision(10)),
        interval: Number(step.toPrecision(10)),
    };
}

function buildNumericBoxplotOption(
    result: NumericAnalysisResult,
    variableLabel: string,
    unit: string,
    tokens: ExecutiveChartTokens,
): EChartsCoreOption {
    const min = result.min!;
    const q1 = result.q1!;
    const median = result.median!;
    const q3 = result.q3!;
    const max = result.max!;
    const mean = result.mean;
    const sd = result.sampleStandardDeviation;

    const domainPoints = [min, q1, median, q3, max];
    if (mean != null && Number.isFinite(mean)) domainPoints.push(mean);
    const domain = computePaddedDomain(domainPoints, false);
    const shortVarLabel = truncateAxisLabel(variableLabel, 12);

    const tooltipHtml = [
        `<div style="font-weight:600;margin-bottom:4px;">${escapeHtml(variableLabel)}（五数分位与均值）</div>`,
        `<div>样本均值 Mean：<b>${escapeHtml(formatMetric(mean, 3, unit))}</b></div>`,
        `<div>样本标准差 SD：<b>${escapeHtml(formatMetric(sd, 3, unit))}</b></div>`,
        `<div style="margin-top:4px;border-top:1px solid ${tokens.border};padding-top:4px;">`,
        `<div>最小值 Min：${escapeHtml(formatMetric(min, 3, unit))}</div>`,
        `<div>下四分位 Q1：${escapeHtml(formatMetric(q1, 3, unit))}</div>`,
        `<div>中位数 Median：<b>${escapeHtml(formatMetric(median, 3, unit))}</b></div>`,
        `<div>上四分位 Q3：${escapeHtml(formatMetric(q3, 3, unit))}</div>`,
        `<div>最大值 Max：${escapeHtml(formatMetric(max, 3, unit))}</div>`,
        `</div>`,
    ].join("");

    return {
        grid: buildExecutiveGrid({ left: 12, right: 24, top: 38, bottom: 14 }),
        legend: buildExecutiveLegend({
            data: ["五数分位箱线", ...(mean != null && Number.isFinite(mean) ? ["样本均值"] : [])],
        }, tokens),
        tooltip: buildExecutiveTooltip({
            trigger: "axis",
            formatter: () => tooltipHtml,
        }, tokens),
        xAxis: buildExecutiveValueAxis({
            min: domain.min,
            max: domain.max,
            interval: domain.interval,
        }, tokens),
        yAxis: buildExecutiveCategoryAxis({
            data: [shortVarLabel],
        }, tokens),
        series: [
            {
                name: "五数分位箱线",
                type: "boxplot",
                layout: "horizontal",
                boxWidth: [20, 36],
                itemStyle: {
                    color: tokens.primaryMuted,
                    borderColor: tokens.chart2,
                    borderWidth: 2,
                },
                data: [[min, q1, median, q3, max]],
                z: 3,
            },
            ...(mean != null && Number.isFinite(mean)
                ? [
                      {
                          name: "样本均值",
                          type: "scatter",
                          symbol: "diamond",
                          symbolSize: 13,
                          itemStyle: {
                              color: tokens.chart5,
                              borderColor: tokens.card,
                              borderWidth: 2,
                          },
                          data: [[mean, 0]],
                          z: 6,
                      },
                  ]
                : []),
        ],
    };
}

function buildWeightedMeanOption(
    result: NumericAnalysisResult,
    variableLabel: string,
    unit: string,
    tokens: ExecutiveChartTokens,
): EChartsCoreOption {
    const mean = result.mean!;
    const domain = computePaddedDomain([mean], true);
    const shortVarLabel = truncateAxisLabel(variableLabel, 12);
    const formattedMean = formatMetric(mean, 3, unit);

    return {
        grid: buildExecutiveGrid({ left: 12, right: 36, top: 28, bottom: 14 }),
        tooltip: buildExecutiveTooltip({
            trigger: "axis",
            formatter: () =>
                `<div style="font-weight:600;margin-bottom:4px;">${escapeHtml(variableLabel)}</div>`
                + `<div>设计加权均值估计：<b>${escapeHtml(formattedMean)}</b></div>`
                + `<div>有效样本量：<b>${result.validCount}</b> / 总样本 ${result.sampleCount}</div>`,
        }, tokens),
        xAxis: buildExecutiveValueAxis({
            min: domain.min,
            max: domain.max,
            interval: domain.interval,
        }, tokens),
        yAxis: buildExecutiveCategoryAxis({
            data: [shortVarLabel],
        }, tokens),
        series: [
            {
                name: "加权均值",
                type: "bar",
                barWidth: 22,
                data: [mean],
                itemStyle: {
                    color: tokens.chart2,
                    borderRadius: mean >= 0 ? [0, 6, 6, 0] : [6, 0, 0, 6],
                },
                label: {
                    show: true,
                    position: mean >= 0 ? "right" : "left",
                    formatter: () => formattedMean,
                    color: tokens.foreground,
                    fontFamily: CHART_FONT_FAMILY,
                    fontSize: 12,
                    fontWeight: 600,
                },
            },
            {
                name: "点估计标记",
                type: "scatter",
                symbol: "diamond",
                symbolSize: 12,
                itemStyle: {
                    color: tokens.chart4,
                    borderColor: tokens.card,
                    borderWidth: 2,
                },
                data: [[mean, 0]],
                z: 5,
            },
        ],
    };
}

interface NormalizedCategorySlice {
    displayLabel: string;
    shortLabel: string;
    count: number;
    pct: number;
}

function pickAggregatedAxisShortLabel(tailLength: number, occupied: ReadonlySet<string>): string {
    const primary = `其余 ${tailLength} 类`;
    if (!occupied.has(primary)) return primary;
    const secondary = `其余${tailLength}类汇总`;
    if (!occupied.has(secondary)) return secondary;
    let suffix = 2;
    while (occupied.has(`其余${tailLength}类(${suffix})`)) {
        suffix += 1;
    }
    return `其余${tailLength}类(${suffix})`;
}

function pickAggregatedDisplayLabel(tailLength: number, occupied: ReadonlySet<string>): string {
    const primary = `其余 ${tailLength} 类合计`;
    if (!occupied.has(primary)) return primary;
    const secondary = `其余 ${tailLength} 类汇总`;
    if (!occupied.has(secondary)) return secondary;
    let suffix = 2;
    while (occupied.has(`其余 ${tailLength} 类合计 (${suffix})`)) {
        suffix += 1;
    }
    return `其余 ${tailLength} 类合计 (${suffix})`;
}

function normalizeCategories(result: CategoricalAnalysisResult): NormalizedCategorySlice[] {
    const duplicateLabels = new Set(
        result.categories
            .filter((item, idx, arr) => arr.some((other, oIdx) => oIdx !== idx && other.label === item.label))
            .map((item) => item.label),
    );

    const validRaw = result.categories
        .filter((item) => item.proportion != null && Number.isFinite(item.proportion))
        .map((item) => {
            const fullLabel = duplicateLabels.has(item.label)
                ? `${item.label}（${describeRawType(item.value)}）`
                : item.label;
            return {
                displayLabel: fullLabel,
                count: item.count,
                pct: Math.max(0, (item.proportion ?? 0) * 100),
            };
        })
        .sort((a, b) => b.pct - a.pct || b.count - a.count);

    if (validRaw.length <= 8) {
        const shortLabels = disambiguateAxisLabels(validRaw.map((item) => item.displayLabel), 10);
        return validRaw.map((item, idx) => ({
            ...item,
            shortLabel: shortLabels[idx] ?? truncateAxisLabel(item.displayLabel, 10),
        }));
    }

    const headRaw = validRaw.slice(0, 7);
    const tail = validRaw.slice(7);
    const headShortLabels = disambiguateAxisLabels(headRaw.map((item) => item.displayLabel), 10);
    const head = headRaw.map((item, idx) => ({
        ...item,
        shortLabel: headShortLabels[idx] ?? truncateAxisLabel(item.displayLabel, 10),
    }));
    const occupiedShortLabels = new Set(head.map((item) => item.shortLabel.trim()));
    const occupiedDisplayLabels = new Set(head.map((item) => item.displayLabel.trim()));
    const tailCount = tail.reduce((sum, item) => sum + item.count, 0);
    const tailPct = tail.reduce((sum, item) => sum + item.pct, 0);
    return [
        ...head,
        {
            displayLabel: pickAggregatedDisplayLabel(tail.length, occupiedDisplayLabels),
            shortLabel: pickAggregatedAxisShortLabel(tail.length, occupiedShortLabels),
            count: tailCount,
            pct: tailPct,
        },
    ];
}

function buildCategoricalDualOption(
    slices: NormalizedCategorySlice[],
    validCount: number,
    weighted: boolean,
    tokens: ExecutiveChartTokens,
): EChartsCoreOption {
    const maxPct = Math.max(...slices.map((s) => s.pct), 10);
    const rawTargetMax = Math.min(120, Math.max(25, maxPct * 1.28));
    const pctStep = rawTargetMax <= 40 ? 10 : 20;
    const xMax = Math.ceil(rawTargetMax / pctStep) * pctStep;
    const barColors = slices.map((_, idx) => tokens.palette[idx % tokens.palette.length]!);

    return {
        grid: buildExecutiveGrid({ left: 10, right: "38%", top: 28, bottom: 12 }),
        tooltip: buildExecutiveTooltip({
            trigger: "item",
            formatter: (params: unknown) => {
                const p = params as { dataIndex?: number };
                const idx = typeof p.dataIndex === "number" ? p.dataIndex : 0;
                const slice = slices[idx];
                if (!slice) return "";
                const shareTitle = weighted ? "设计加权占比" : "样本有效占比";
                return [
                    `<div style="font-weight:600;margin-bottom:4px;">${escapeHtml(slice.displayLabel)}</div>`,
                    `<div>${shareTitle}：<b>${formatStatistic(slice.pct, 2)}%</b></div>`,
                    `<div>原始频数：<b>${slice.count}</b>（有效 n = ${validCount}）</div>`,
                ].join("");
            },
        }, tokens),
        xAxis: buildExecutiveValueAxis({
            min: 0,
            max: xMax,
            interval: pctStep,
            axisLabel: {
                formatter: "{value}%",
            },
        }, tokens),
        yAxis: buildExecutiveCategoryAxis({
            inverse: true,
            data: slices.map((s) => s.shortLabel),
        }, tokens),
        series: [
            {
                name: weighted ? "加权比例" : "样本比例",
                type: "bar",
                barMaxWidth: 20,
                data: slices.map((s, idx) => ({
                    value: Number(s.pct.toFixed(4)),
                    name: s.displayLabel,
                    itemStyle: {
                        color: barColors[idx],
                        borderRadius: [0, 5, 5, 0],
                    },
                })),
                label: {
                    show: true,
                    position: "right",
                    formatter: (params: unknown) => {
                        const p = params as { dataIndex?: number };
                        const slice = slices[p.dataIndex ?? 0];
                        return slice ? `${formatStatistic(slice.pct, 1)}%` : "";
                    },
                    color: tokens.foreground,
                    fontFamily: CHART_FONT_FAMILY,
                    fontSize: 12,
                },
            },
            {
                name: "类别构成环图",
                type: "pie",
                center: ["82%", "52%"],
                radius: ["40%", "68%"],
                avoidLabelOverlap: true,
                itemStyle: {
                    borderColor: tokens.card,
                    borderWidth: 2,
                },
                label: {
                    show: true,
                    position: "center",
                    formatter: () => `n = ${validCount}\n有效构成`,
                    color: tokens.mutedForeground,
                    fontFamily: CHART_FONT_FAMILY,
                    fontSize: 12,
                    lineHeight: 16,
                },
                emphasis: {
                    scale: true,
                    scaleSize: 4,
                },
                labelLine: {
                    show: false,
                },
                data: slices.map((s, idx) => ({
                    name: s.displayLabel,
                    value: Number(s.pct.toFixed(4)),
                    itemStyle: {
                        color: barColors[idx],
                    },
                })),
            },
        ],
    };
}

function buildCrosstabNumericOption(
    result: CrossTabAnalysisResult,
    variableLabel: string,
    unit: string,
    tokens: ExecutiveChartTokens,
): EChartsCoreOption {
    const groups = result.groups.filter((grp) => grp.validCount > 0 && grp.mean != null && Number.isFinite(grp.mean));
    const hasSd =
        !result.weighted
        && groups.some((grp) => grp.sampleStandardDeviation != null && Number.isFinite(grp.sampleStandardDeviation));

    const boundValues: number[] = [];
    for (const grp of groups) {
        const mean = grp.mean!;
        boundValues.push(mean);
        if (hasSd && grp.sampleStandardDeviation != null && Number.isFinite(grp.sampleStandardDeviation)) {
            boundValues.push(mean - grp.sampleStandardDeviation, mean + grp.sampleStandardDeviation);
        }
    }
    const domain = computePaddedDomain(boundValues, true);

    const totalValid = groups.reduce((sum, g) => sum + g.validCount, 0);
    const overallMean =
        groups.length >= 2 && totalValid > 0
            ? groups.reduce((sum, g) => sum + g.mean! * g.validCount, 0) / totalValid
            : null;

    const customWhiskerData = groups
        .map((grp, idx) => {
            const sd = grp.sampleStandardDeviation;
            if (sd == null || !Number.isFinite(sd)) return null;
            return [idx, grp.mean! - sd, grp.mean! + sd, grp.mean!];
        })
        .filter((entry): entry is [number, number, number, number] => entry !== null);

    const overallLegendName =
        overallMean != null && Number.isFinite(overallMean)
            ? `总体组均值 (${formatStatistic(overallMean, 2)})`
            : null;

    return {
        grid: buildExecutiveGrid({ left: 12, right: 20, top: 46, bottom: 14 }),
        legend: buildExecutiveLegend({
            type: "scroll",
            left: 0,
            right: 0,
            itemGap: 12,
            data: [
                result.weighted ? "客群加权均值" : "客群组内均值",
                ...(hasSd ? ["±1 SD 离散区间"] : []),
                ...(overallLegendName ? [overallLegendName] : []),
            ],
        }, tokens),
        tooltip: buildExecutiveTooltip({
            trigger: "axis",
            formatter: (params: unknown) => {
                const list = Array.isArray(params) ? params : [params];
                const first = list[0] as { dataIndex?: number } | undefined;
                const grp = groups[first?.dataIndex ?? 0];
                if (!grp) return "";
                const sdLine =
                    !result.weighted && grp.sampleStandardDeviation != null
                        ? `<div>组内标准差 SD：<b>±${escapeHtml(formatMetric(grp.sampleStandardDeviation, 2, unit))}</b></div>`
                        : "";
                return [
                    `<div style="font-weight:600;margin-bottom:4px;">${escapeHtml(result.groupLabel)}：${escapeHtml(grp.groupLabel)}</div>`,
                    `<div>${result.weighted ? "加权均值" : "组内均值"}（${escapeHtml(variableLabel)}）：<b>${escapeHtml(formatMetric(grp.mean, 2, unit))}</b></div>`,
                    sdLine,
                    `<div>组内有效样本：<b>n = ${grp.validCount}</b></div>`,
                ].join("");
            },
        }, tokens),
        xAxis: buildExecutiveCategoryAxis({
            data: disambiguateAxisLabels(groups.map((g) => g.groupLabel), 10),
        }, tokens),
        yAxis: buildExecutiveValueAxis({
            min: domain.min,
            max: domain.max,
            interval: domain.interval,
        }, tokens),
        series: [
            {
                name: result.weighted ? "客群加权均值" : "客群组内均值",
                type: "bar",
                barMaxWidth: 44,
                data: groups.map((g, idx) => ({
                    value: g.mean!,
                    itemStyle: {
                        color: tokens.palette[idx % tokens.palette.length],
                        borderRadius: g.mean! >= 0 ? [6, 6, 0, 0] : [0, 0, 6, 6],
                    },
                })),
                ...(overallMean != null && Number.isFinite(overallMean)
                    ? {
                          markLine: {
                              silent: true,
                              symbol: "none",
                              lineStyle: {
                                  color: tokens.chart1,
                                  width: 1.5,
                                  type: "dashed",
                              },
                              label: { show: false },
                              data: [{ yAxis: overallMean }],
                          },
                      }
                    : {}),
            },
            ...(overallLegendName
                ? [
                      {
                          name: overallLegendName,
                          type: "line",
                          data: [],
                          lineStyle: { color: tokens.chart1, width: 1.5, type: "dashed" },
                          itemStyle: { color: tokens.chart1 },
                      },
                  ]
                : []),
            ...(hasSd && customWhiskerData.length > 0
                ? [
                      {
                          name: "±1 SD 离散区间",
                          type: "custom",
                          z: 8,
                          encode: { x: 0, y: [1, 2, 3] },
                          data: customWhiskerData,
                          renderItem: (
                              _params: unknown,
                              api: {
                                  value: (idx: number) => number;
                                  coord: (pt: [number, number]) => [number, number];
                              },
                          ) => {
                              const xIndex = api.value(0);
                              const lowPt = api.coord([xIndex, api.value(1)]);
                              const highPt = api.coord([xIndex, api.value(2)]);
                              const meanPt = api.coord([xIndex, api.value(3)]);
                              const capHalf = 6;
                              return {
                                  type: "group",
                                  children: [
                                      {
                                          type: "line",
                                          shape: {
                                              x1: lowPt[0],
                                              y1: lowPt[1],
                                              x2: highPt[0],
                                              y2: highPt[1],
                                          },
                                          style: {
                                              stroke: tokens.foreground,
                                              lineWidth: 2,
                                          },
                                      },
                                      {
                                          type: "line",
                                          shape: {
                                              x1: highPt[0] - capHalf,
                                              y1: highPt[1],
                                              x2: highPt[0] + capHalf,
                                              y2: highPt[1],
                                          },
                                          style: {
                                              stroke: tokens.foreground,
                                              lineWidth: 2,
                                          },
                                      },
                                      {
                                          type: "line",
                                          shape: {
                                              x1: lowPt[0] - capHalf,
                                              y1: lowPt[1],
                                              x2: lowPt[0] + capHalf,
                                              y2: lowPt[1],
                                          },
                                          style: {
                                              stroke: tokens.foreground,
                                              lineWidth: 2,
                                          },
                                      },
                                      {
                                          type: "circle",
                                          shape: {
                                              cx: meanPt[0],
                                              cy: meanPt[1],
                                              r: 3.5,
                                          },
                                          style: {
                                              fill: tokens.card,
                                              stroke: tokens.foreground,
                                              lineWidth: 1.8,
                                          },
                                      },
                                  ],
                              };
                          },
                      },
                  ]
                : []),
        ],
    };
}

function buildCrosstabCategoricalOption(
    result: CrossTabAnalysisResult,
    mode: "stacked" | "grouped",
    tokens: ExecutiveChartTokens,
): EChartsCoreOption {
    const groups = result.groups.filter((grp) => grp.validCount > 0 && (grp.categories?.length ?? 0) > 0);
    const categoryHeaders = groups[0]?.categories ?? [];
    const disambiguatedCategories = disambiguateAxisLabels(categoryHeaders.map((cat) => cat.label), 12);

    return {
        grid: buildExecutiveGrid({ left: 12, right: 20, top: 44, bottom: 14 }),
        legend: buildExecutiveLegend({
            type: "scroll",
            left: 0,
            right: 0,
            itemGap: 12,
            data: disambiguatedCategories,
        }, tokens),
        tooltip: buildExecutiveTooltip({
            trigger: "axis",
            formatter: (params: unknown) => {
                const list = Array.isArray(params) ? params : [params];
                const first = list[0] as { dataIndex?: number } | undefined;
                const grp = groups[first?.dataIndex ?? 0];
                if (!grp) return "";
                const rows = (grp.categories ?? []).map((cat, idx) => {
                    const color = tokens.palette[idx % tokens.palette.length]!;
                    const pctText = cat.proportion == null ? "—" : `${formatStatistic(cat.proportion * 100, 1)}%`;
                    return (
                        `<div style="display:flex;justify-content:space-between;gap:14px;">`
                        + `<span><span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:${color};margin-right:6px;"></span>${escapeHtml(cat.label)}</span>`
                        + `<b>${pctText}（n=${cat.count}）</b>`
                        + `</div>`
                    );
                });
                return [
                    `<div style="font-weight:600;margin-bottom:4px;">${escapeHtml(result.groupLabel)}：${escapeHtml(grp.groupLabel)}（有效 n=${grp.validCount}）</div>`,
                    ...rows,
                ].join("");
            },
        }, tokens),
        xAxis: buildExecutiveCategoryAxis({
            data: disambiguateAxisLabels(groups.map((g) => g.groupLabel), 10),
        }, tokens),
        yAxis: buildExecutiveValueAxis({
            min: 0,
            max: mode === "stacked" ? 100 : undefined,
            axisLabel: {
                formatter: "{value}%",
            },
        }, tokens),
        series: categoryHeaders.map((header, cIdx) => ({
            name: disambiguatedCategories[cIdx] ?? truncateAxisLabel(header.label, 12),
            type: "bar",
            ...(mode === "stacked" ? { stack: "segment-total" } : {}),
            barMaxWidth: mode === "stacked" ? 48 : 28,
            itemStyle: {
                color: tokens.palette[cIdx % tokens.palette.length],
                borderRadius:
                    mode === "stacked"
                        ? cIdx === categoryHeaders.length - 1
                            ? [5, 5, 0, 0]
                            : [0, 0, 0, 0]
                        : [4, 4, 0, 0],
            },
            data: groups.map((grp) => {
                const rawProp = grp.categories?.[cIdx]?.proportion;
                if (rawProp == null || !Number.isFinite(rawProp)) return 0;
                return Number(Math.min(100, Math.max(0, rawProp * 100)).toFixed(3));
            }),
        })),
    };
}

export function AnalysisResultChart({ record, className, testId }: AnalysisResultChartProps) {
    const [crosstabMode, setCrosstabMode] = useState<"stacked" | "grouped">("stacked");
    const { result, variable } = record;

    const chartDescriptor = useMemo(() => {
        if (result.validCount <= 0) return null;
        const tokens = getExecutiveChartTokens();
        const unit = variable.unit ?? "";

        if (result.kind === "numeric") {
            const hasFiveNum =
                result.min != null
                && Number.isFinite(result.min)
                && result.q1 != null
                && Number.isFinite(result.q1)
                && result.median != null
                && Number.isFinite(result.median)
                && result.q3 != null
                && Number.isFinite(result.q3)
                && result.max != null
                && Number.isFinite(result.max);

            if (hasFiveNum) {
                return {
                    kind: "numeric-boxplot" as const,
                    title: `${variable.label} 五数分位箱线与均值分布图`,
                    subtitle: `R7 四分位箱线 · 菱形标记为样本均值 ${formatMetric(result.mean, 2, unit)}`,
                    height: 204,
                    option: buildNumericBoxplotOption(result, variable.label, unit, tokens),
                };
            }

            if (result.mean != null && Number.isFinite(result.mean)) {
                return {
                    kind: "numeric-weighted-mean" as const,
                    title: `${variable.label} 设计加权均值指示图`,
                    subtitle: `设计加权均值点估计：${formatMetric(result.mean, 3, unit)}（有效 n = ${result.validCount}）`,
                    height: 172,
                    option: buildWeightedMeanOption(result, variable.label, unit, tokens),
                };
            }

            return null;
        }

        if (result.kind === "categorical") {
            const slices = normalizeCategories(result);
            if (slices.length === 0) return null;
            return {
                kind: "categorical-dual" as const,
                title: `${variable.label} 类别排序占比与构成双视图`,
                subtitle: `${result.weighted ? "设计加权占比" : "未加权样本占比"} · 左侧降序条形图对照右侧构成环图`,
                height: Math.max(216, Math.min(336, 72 + slices.length * 32)),
                option: buildCategoricalDualOption(slices, result.validCount, result.weighted, tokens),
            };
        }

        if (result.kind === "crosstab") {
            if (result.targetKind === "numeric") {
                const validGroups = result.groups.filter(
                    (grp) => grp.validCount > 0 && grp.mean != null && Number.isFinite(grp.mean),
                );
                if (validGroups.length === 0) return null;
                return {
                    kind: "crosstab-numeric" as const,
                    title: `按「${result.groupLabel}」细分客群 ${variable.label} 均值对比图`,
                    subtitle: result.weighted
                        ? "各细分客群设计加权均值对比"
                        : "各细分客群组内均值及 ±1 SD 样本离散区间对比",
                    height: 248,
                    option: buildCrosstabNumericOption(result, variable.label, unit, tokens),
                };
            }

            const validGroups = result.groups.filter(
                (grp) => grp.validCount > 0 && (grp.categories?.length ?? 0) > 0,
            );
            if (validGroups.length === 0) return null;
            return {
                kind: "crosstab-categorical" as const,
                title: `按「${result.groupLabel}」细分客群 ${variable.label} 构成对比图`,
                subtitle:
                    crosstabMode === "stacked"
                        ? "100% 堆叠视图展示各细分客群内部类别构成结构差异"
                        : "分组柱状视图横向并列比较各客群在同一类别上的占比高低",
                height: 264,
                option: buildCrosstabCategoricalOption(result, crosstabMode, tokens),
            };
        }

        return null;
    }, [result, variable.label, variable.unit, crosstabMode]);

    if (!chartDescriptor) return null;

    return (
        <div
            className={cn("rounded-surface border border-border bg-background p-3.5", className)}
            data-testid={testId ?? `analysis-result-chart-${record.id}`}
        >
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                    <p className="text-label font-semibold text-foreground">{chartDescriptor.title}</p>
                    <p className="text-meta text-muted-foreground">{chartDescriptor.subtitle}</p>
                </div>
                {chartDescriptor.kind === "crosstab-categorical" && (
                    <div
                        role="group"
                        aria-label="交叉构成图展示模式"
                        className="inline-flex items-center gap-1 rounded-control border border-border bg-card p-0.5"
                    >
                        <Button
                            type="button"
                            size="sm"
                            variant={crosstabMode === "stacked" ? "secondary" : "ghost"}
                            className="h-7 px-2.5 text-meta"
                            aria-pressed={crosstabMode === "stacked"}
                            onClick={() => setCrosstabMode("stacked")}
                        >
                            100% 堆叠
                        </Button>
                        <Button
                            type="button"
                            size="sm"
                            variant={crosstabMode === "grouped" ? "secondary" : "ghost"}
                            className="h-7 px-2.5 text-meta"
                            aria-pressed={crosstabMode === "grouped"}
                            onClick={() => setCrosstabMode("grouped")}
                        >
                            分组柱状
                        </Button>
                    </div>
                )}
            </div>
            <EChartBox
                option={chartDescriptor.option}
                height={chartDescriptor.height}
                fallbackWidth={620}
                ariaLabel={chartDescriptor.title}
            />
        </div>
    );
}
