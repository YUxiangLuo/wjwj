import { useMemo } from "react";
import { normalizeConfidenceLevel, zForConfidenceLevel } from "@/domain/statistics/confidence-level";
import { formatStatistic } from "@/utils/statistic-format";
import { EChartBox } from "./EChartBox";
import type { EChartsCoreOption } from "./echarts-core";
import {
    CHART_FONT_FAMILY,
    buildExecutiveCategoryAxis,
    buildExecutiveGrid,
    buildExecutiveTooltip,
    buildExecutiveValueAxis,
    getExecutiveChartTokens,
    resolveChartToneColor,
    type ExecutiveChartTokens,
} from "./echarts-theme";

export interface ConfidenceIntervalRow {
    key: string;
    label: string;
    sublabel?: string;
    estimate: number | null;
    standardError: number | null;
    halfWidth?: number | null;
    sampleSize?: number;
    tone?: "primary" | "info" | "success" | "warning" | "auxiliary";
}

function escapeHtml(value: string): string {
    return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function resolveTonePillSurface(
    tone: NonNullable<ConfidenceIntervalRow["tone"]>,
    tokens: ExecutiveChartTokens,
): { muted: string; border: string } {
    switch (tone) {
        case "success":
            return { muted: tokens.successMuted, border: tokens.successBorder };
        case "warning":
            return { muted: tokens.warningMuted, border: tokens.warningBorder };
        case "info":
            return { muted: tokens.infoMuted, border: tokens.infoBorder };
        case "auxiliary":
            return { muted: tokens.auxiliaryMuted, border: tokens.auxiliaryBorder };
        case "primary":
        default:
            return { muted: tokens.primaryMuted, border: tokens.primaryBorder };
    }
}

function shortenEstimatorLabel(label: string, maxChars = 12): string {
    const trimmed = label.trim();
    if (trimmed.length <= maxChars) return trimmed;
    return `${trimmed.slice(0, maxChars - 1)}…`;
}

export function ConfidenceIntervalPlot({
    title,
    subtitle,
    rows,
    populationValue,
    unit = "",
    isPercentage = false,
    confidenceLevel = "95",
}: {
    title: string;
    subtitle?: string;
    rows: ConfidenceIntervalRow[];
    populationValue?: number | null;
    unit?: string;
    isPercentage?: boolean;
    confidenceLevel?: string | number;
}) {
    const normalizedConfidenceLevel = normalizeConfidenceLevel(String(confidenceLevel ?? "95"));
    const zMultiplier = zForConfidenceLevel(normalizedConfidenceLevel);
    const intervalBandLabel = `${normalizedConfidenceLevel}% 教学误差带（±${zMultiplier} SE，不保证覆盖率）`;
    const trimmedTitle = title.trim();
    const chartAriaLabel = trimmedTitle.endsWith("森林对比图") || trimmedTitle.endsWith("森林图")
        ? trimmedTitle
        : `${trimmedTitle}森林对比图`;

    const resolveRowHalfWidth = (row: ConfidenceIntervalRow): number | null => {
        if (row.halfWidth !== undefined) {
            return row.halfWidth !== null && Number.isFinite(row.halfWidth) && row.halfWidth >= 0
                ? row.halfWidth
                : null;
        }
        if (row.standardError !== null && Number.isFinite(row.standardError) && row.standardError >= 0) {
            const derived = zMultiplier * row.standardError;
            return Number.isFinite(derived) && derived >= 0 ? derived : null;
        }
        return null;
    };

    const scaleFactor = isPercentage ? 100 : 1;
    const validRows = rows.filter(
        (row) => row.estimate !== null && Number.isFinite(row.estimate) && Number.isFinite(row.estimate * scaleFactor),
    );
    const displayUnit = isPercentage ? "%" : unit;
    const scaledPop =
        populationValue != null && Number.isFinite(populationValue) && Number.isFinite(populationValue * scaleFactor)
            ? populationValue * scaleFactor
            : Number.NaN;
    const hasValidPop = Number.isFinite(scaledPop);

    const parsedValidRows = validRows.map((row) => {
        const est = (row.estimate ?? 0) * scaleFactor;
        const resolvedHw = resolveRowHalfWidth(row);
        const rawHw = resolvedHw !== null ? resolvedHw * scaleFactor : 0;
        const hw = Number.isFinite(rawHw) && rawHw >= 0 ? rawHw : 0;
        const lo = Number.isFinite(est - hw) ? est - hw : est;
        const hi = Number.isFinite(est + hw) ? est + hw : est;
        const se =
            row.standardError !== null && Number.isFinite(row.standardError) && row.standardError >= 0
                ? row.standardError * scaleFactor
                : null;
        return {
            row,
            est,
            hw,
            lo,
            hi,
            se: se !== null && Number.isFinite(se) ? se : null,
        };
    });

    const allPoints: number[] = [];
    if (hasValidPop) {
        allPoints.push(scaledPop);
    }
    for (const item of parsedValidRows) {
        allPoints.push(item.lo, item.hi, item.est);
    }

    const rawMin = allPoints.length > 0 ? Math.min(...allPoints) : 0;
    const rawMax = allPoints.length > 0 ? Math.max(...allPoints) : 100;
    const maxAbs = Math.max(Math.abs(rawMin), Math.abs(rawMax));
    const coordDivisor = maxAbs > 1e100 ? maxAbs : 1;

    const normMin = rawMin / coordDivisor;
    const normMax = rawMax / coordDivisor;
    const normRange = normMax - normMin;
    const degenerateThreshold = Math.max(Math.abs(normMax) * 1e-6, 1e-9);

    const [normDomainMin, normDomainMax] = !Number.isFinite(normRange)
        ? [-1, 1]
        : normRange <= degenerateThreshold
            ? (() => {
                  const basePad = coordDivisor === 1
                      ? Math.max(Math.abs(normMax) * 0.1, isPercentage ? 2 : 1)
                      : 0.1;
                  return [normMin - basePad, normMax + basePad] as const;
              })()
            : (() => {
                  const pad = normRange * 0.14;
                  return [normMin - pad, normMax + pad] as const;
              })();

    const realSpanApprox = (normDomainMax - normDomainMin) * coordDivisor;
    const tickDigits =
        Number.isFinite(realSpanApprox) && realSpanApprox < 0.04
            ? 4
            : Number.isFinite(realSpanApprox) && realSpanApprox < 0.4
                ? 2
                : 1;

    const forestHeight = Math.max(196, parsedValidRows.length * 52 + 64);

    const forestOption = useMemo<EChartsCoreOption>(() => {
        const tokens = getExecutiveChartTokens();

        return {
            grid: buildExecutiveGrid({
                top: hasValidPop ? 40 : 20,
                bottom: 12,
                left: 10,
                right: 24,
            }),
            tooltip: buildExecutiveTooltip(
                {
                    trigger: "axis",
                    axisPointer: { type: "none" },
                    formatter: (params: unknown) => {
                        const list = Array.isArray(params) ? params : [params];
                        const first = list[0] as { dataIndex?: number } | undefined;
                        const item = parsedValidRows[first?.dataIndex ?? 0];
                        if (!item) return "";
                        const { row, est, hw, lo, hi, se } = item;
                        const toneColor = resolveChartToneColor(row.tone ?? "primary", tokens);
                        const bias = hasValidPop && Number.isFinite(est - scaledPop) ? est - scaledPop : null;
                        const coversTruth =
                            hasValidPop && hw > 0 ? scaledPop >= lo && scaledPop <= hi : null;

                        return [
                            `<div style="min-width:228px;">`,
                            `<div style="display:flex;align-items:center;gap:6px;font-weight:600;color:${tokens.foreground};">`,
                            `<span style="display:inline-block;width:8px;height:8px;border-radius:4px;background:${toneColor};"></span>`,
                            `<span>${escapeHtml(row.label)}</span>`,
                            `</div>`,
                            row.sublabel
                                ? `<div style="color:${tokens.mutedForeground};margin-bottom:6px;">${escapeHtml(row.sublabel)}</div>`
                                : `<div style="margin-bottom:4px;"></div>`,
                            `<div style="display:flex;justify-content:space-between;gap:14px;"><span>点估计值</span><strong style="color:${tokens.foreground};">${formatStatistic(est, 2)}${escapeHtml(displayUnit)}</strong></div>`,
                            `<div style="display:flex;justify-content:space-between;gap:14px;"><span>标准误 SE</span><strong>${se !== null ? `${formatStatistic(se, 2)}${escapeHtml(displayUnit)}` : "不可用"}</strong></div>`,
                            `<div style="display:flex;justify-content:space-between;gap:14px;"><span>${escapeHtml(intervalBandLabel)}</span><strong>[${formatStatistic(lo, 2)}, ${formatStatistic(hi, 2)}]${escapeHtml(displayUnit)}</strong></div>`,
                            `<div style="display:flex;justify-content:space-between;gap:14px;"><span>区间半宽</span><strong>±${formatStatistic(hw, 2)}${escapeHtml(displayUnit)}</strong></div>`,
                            row.sampleSize != null && Number.isFinite(row.sampleSize)
                                ? `<div style="display:flex;justify-content:space-between;gap:14px;"><span>有效样本量 n</span><strong>${row.sampleSize} 份</strong></div>`
                                : "",
                            bias !== null
                                ? `<div style="margin-top:4px;padding-top:4px;border-top:1px dashed ${tokens.border};display:flex;justify-content:space-between;gap:14px;"><span>较总体真值偏差</span><strong style="color:${Math.abs(bias) <= Math.max(hw, 1e-9) ? tokens.success : tokens.warning};">${bias >= 0 ? "+" : ""}${formatStatistic(bias, 2)}${escapeHtml(displayUnit)}${coversTruth !== null ? (coversTruth ? "（区间覆盖）" : "（区间偏离）") : ""}</strong></div>`
                                : "",
                            `</div>`,
                        ].join("");
                    },
                },
                tokens,
            ),
            xAxis: buildExecutiveValueAxis(
                {
                    min: normDomainMin,
                    max: normDomainMax,
                    splitNumber: 4,
                    axisLabel: {
                        hideOverlap: true,
                        formatter: (val: number) => {
                            const restored = val * coordDivisor;
                            return Number.isFinite(restored)
                                ? `${formatStatistic(restored, tickDigits)}${displayUnit}`
                                : "";
                        },
                    },
                },
                tokens,
            ),
            yAxis: buildExecutiveCategoryAxis(
                {
                    inverse: true,
                    data: parsedValidRows.map((item) => shortenEstimatorLabel(item.row.label, 12)),
                    axisLabel: {
                        color: tokens.foreground,
                        fontWeight: 600,
                    },
                },
                tokens,
            ),
            series: [
                {
                    name: intervalBandLabel,
                    type: "custom",
                    z: 3,
                    renderItem: (
                        _params: unknown,
                        api: {
                            value: (idx: number) => number;
                            coord: (val: [number, number]) => [number, number];
                        },
                    ) => {
                        const rowIndex = Number(api.value(0));
                        const item = parsedValidRows[rowIndex];
                        if (!item) return null;
                        const lowCoord = api.coord([Number(api.value(1)), rowIndex]);
                        const highCoord = api.coord([Number(api.value(2)), rowIndex]);
                        const estCoord = api.coord([Number(api.value(3)), rowIndex]);
                        if (
                            !Number.isFinite(lowCoord[0])
                            || !Number.isFinite(highCoord[0])
                            || !Number.isFinite(estCoord[0])
                            || !Number.isFinite(estCoord[1])
                        ) {
                            return null;
                        }

                        const tone = item.row.tone ?? "primary";
                        const strokeColor = resolveChartToneColor(tone, tokens);
                        const pillSurface = resolveTonePillSurface(tone, tokens);
                        const cy = estCoord[1];
                        const xLeft = Math.min(lowCoord[0], highCoord[0]);
                        const xRight = Math.max(lowCoord[0], highCoord[0]);
                        const spanWidth = Math.max(0, xRight - xLeft);
                        const hasPositiveWhisker = Number(api.value(4)) > 0 && spanWidth >= 1;

                        if (!hasPositiveWhisker) {
                            return {
                                type: "group",
                                children: [
                                    {
                                        type: "circle",
                                        shape: { cx: estCoord[0], cy, r: 9 },
                                        style: {
                                            fill: pillSurface.muted,
                                            stroke: pillSurface.border,
                                            lineWidth: 1.5,
                                        },
                                    },
                                ],
                            };
                        }

                        return {
                            type: "group",
                            children: [
                                {
                                    type: "rect",
                                    shape: {
                                        x: xLeft,
                                        y: cy - 8,
                                        width: spanWidth,
                                        height: 16,
                                        r: 4,
                                    },
                                    style: {
                                        fill: pillSurface.muted,
                                        stroke: pillSurface.border,
                                        lineWidth: 1,
                                    },
                                },
                                {
                                    type: "line",
                                    shape: { x1: xLeft, y1: cy, x2: xRight, y2: cy },
                                    style: { stroke: strokeColor, lineWidth: 2.5 },
                                },
                                {
                                    type: "line",
                                    shape: { x1: xLeft, y1: cy - 6, x2: xLeft, y2: cy + 6 },
                                    style: { stroke: strokeColor, lineWidth: 2 },
                                },
                                {
                                    type: "line",
                                    shape: { x1: xRight, y1: cy - 6, x2: xRight, y2: cy + 6 },
                                    style: { stroke: strokeColor, lineWidth: 2 },
                                },
                            ],
                        };
                    },
                    encode: { x: [1, 2, 3], y: 0 },
                    data: parsedValidRows.map((item, index) => [
                        index,
                        item.lo / coordDivisor,
                        item.hi / coordDivisor,
                        item.est / coordDivisor,
                        item.hw > 0 ? 1 : 0,
                    ]),
                },
                {
                    name: "点估计",
                    type: "scatter",
                    z: 5,
                    data: parsedValidRows.map((item, index) => {
                        const tone = item.row.tone ?? "primary";
                        const isPrimaryEstimator = tone === "success" || tone === "primary";
                        return {
                            name: item.row.label,
                            value: [item.est / coordDivisor, index],
                            symbol: isPrimaryEstimator ? "diamond" : "circle",
                            symbolSize: isPrimaryEstimator ? 12 : 10,
                            itemStyle: {
                                color: resolveChartToneColor(tone, tokens),
                                borderColor: tokens.card,
                                borderWidth: 2,
                            },
                        };
                    }),
                    ...(hasValidPop
                        ? {
                              markLine: {
                                  silent: true,
                                  symbol: ["none", "none"],
                                  lineStyle: {
                                      color: tokens.chart1,
                                      width: 1.75,
                                      type: "dashed",
                                  },
                                  label: {
                                      show: true,
                                      position: "start",
                                      distance: 6,
                                      rotate: 0,
                                      formatter: () => `总体真值 ${formatStatistic(scaledPop, 2)}${displayUnit}`,
                                      color: tokens.foreground,
                                      backgroundColor: tokens.muted,
                                      borderColor: tokens.border,
                                      borderWidth: 1,
                                      borderRadius: 4,
                                      padding: [2, 6],
                                      fontFamily: CHART_FONT_FAMILY,
                                      fontSize: 11,
                                  },
                                  data: [{ xAxis: scaledPop / coordDivisor }],
                              },
                          }
                        : {}),
                },
            ],
        };
    }, [parsedValidRows, hasValidPop, scaledPop, coordDivisor, normDomainMin, normDomainMax, tickDigits, displayUnit, intervalBandLabel]);

    return (
        <div className="rounded-surface border border-border bg-card p-5" data-testid="confidence-interval-plot">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3 border-b border-border pb-3">
                <div className="min-w-0">
                    <h3 className="break-words text-subheading font-semibold text-foreground">{title}</h3>
                    {subtitle && <p className="mt-0.5 text-meta text-muted-foreground">{subtitle}</p>}
                </div>
                {hasValidPop && (
                    <span className="rounded-control border border-border bg-muted px-3 py-1 text-meta tabular-nums text-muted-foreground">
                        教学总体参考基准：{formatStatistic(scaledPop, 2)}{displayUnit}
                    </span>
                )}
            </div>

            {validRows.length === 0 ? (
                <div className="flex h-36 items-center justify-center rounded-control border border-border bg-background text-label text-muted-foreground">
                    完成抽样与问卷回收后将在此展示点估计与教学误差带森林图
                </div>
            ) : (
                <div className="space-y-3">
                    <div className="rounded-control border border-border bg-background px-3 py-2">
                        <EChartBox
                            option={forestOption}
                            height={forestHeight}
                            fallbackWidth={520}
                            ariaLabel={chartAriaLabel}
                            testId="confidence-interval-echart"
                        />
                    </div>
                    <p className="text-meta text-muted-foreground">
                        误差须线口径：{intervalBandLabel}，仅用于同框教学比较。
                    </p>

                    <div
                        role="region"
                        aria-label={`${title}数值明细区域`}
                        tabIndex={0}
                        className="overflow-x-auto rounded-control border border-border bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                        <table className="w-full text-meta tabular-nums" aria-label={`${title}数值明细表`}>
                            <thead className="border-b border-border bg-muted text-muted-foreground">
                                <tr>
                                    <th scope="col" className="px-3.5 py-2 text-left font-medium">估计口径</th>
                                    <th scope="col" className="whitespace-nowrap px-3 py-2 text-right font-medium">点估计</th>
                                    <th scope="col" className="whitespace-nowrap px-3 py-2 text-right font-medium">标准误 SE</th>
                                    <th scope="col" className="whitespace-nowrap px-3.5 py-2 text-right font-medium">
                                        {normalizedConfidenceLevel}% 教学误差带 / 半宽
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                                {rows.map((row) => {
                                    const est =
                                        row.estimate !== null && Number.isFinite(row.estimate) && Number.isFinite(row.estimate * scaleFactor)
                                            ? row.estimate * scaleFactor
                                            : null;
                                    const se =
                                        row.standardError !== null && Number.isFinite(row.standardError) && row.standardError >= 0 && Number.isFinite(row.standardError * scaleFactor)
                                            ? row.standardError * scaleFactor
                                            : null;
                                    const resolvedHw = resolveRowHalfWidth(row);
                                    const hw =
                                        resolvedHw !== null && Number.isFinite(resolvedHw * scaleFactor)
                                            ? resolvedHw * scaleFactor
                                            : null;
                                    const lo = est !== null && hw !== null && Number.isFinite(est - hw) ? est - hw : null;
                                    const hi = est !== null && hw !== null && Number.isFinite(est + hw) ? est + hw : null;
                                    return (
                                        <tr key={row.key}>
                                            <th scope="row" className="min-w-[10rem] px-3.5 py-2.5 text-left font-normal">
                                                <span className="block break-words font-semibold text-foreground" title={row.label}>{row.label}</span>
                                                {row.sublabel && <span className="block break-words text-muted-foreground" title={row.sublabel}>{row.sublabel}</span>}
                                            </th>
                                            <td className="whitespace-nowrap px-3 py-2.5 text-right font-semibold text-foreground">
                                                {est !== null ? `${formatStatistic(est, 2)}${displayUnit}` : "—"}
                                            </td>
                                            <td className="whitespace-nowrap px-3 py-2.5 text-right font-medium text-foreground">
                                                {se !== null ? `${formatStatistic(se, 2)}${displayUnit}` : "不可用"}
                                            </td>
                                            <td className="whitespace-nowrap px-3.5 py-2.5 text-right font-medium text-foreground">
                                                {hw !== null ? (
                                                    <>
                                                        <span className="block">±{formatStatistic(hw, 2)}{displayUnit}</span>
                                                        {lo !== null && hi !== null && (
                                                            <span className="block text-muted-foreground">
                                                                [{formatStatistic(lo, 2)}, {formatStatistic(hi, 2)}]{displayUnit}
                                                            </span>
                                                        )}
                                                    </>
                                                ) : "—"}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}
