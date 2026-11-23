import { useMemo } from "react";
import { EChartBox } from "@/components/charts/EChartBox";
import type { EChartsCoreOption } from "@/components/charts/echarts-core";
import {
    CHART_FONT_FAMILY,
    buildExecutiveGrid,
    buildExecutiveLegend,
    buildExecutiveTooltip,
    buildExecutiveValueAxis,
    getExecutiveChartTokens,
} from "@/components/charts/echarts-theme";
import { formatStatistic } from "@/utils/statistic-format";
import type { CostPrecisionPoint } from "../experiment/cost-precision-curve";

export function CostPrecisionChart({
    points,
    referencePoints,
    targetMarginOfError,
    budget,
}: {
    points: CostPrecisionPoint[];
    referencePoints: CostPrecisionPoint[];
    targetMarginOfError: number;
    budget: number;
}) {
    const validPoints = points.filter(
        (point) =>
            Number.isFinite(point.sampleSize)
            && Number.isFinite(point.totalCost)
            && point.totalCost >= 0
            && Number.isFinite(point.marginOfError)
            && point.marginOfError >= 0,
    );
    const validReferencePoints = referencePoints.filter(
        (point) =>
            Number.isFinite(point.sampleSize)
            && Number.isFinite(point.totalCost)
            && point.totalCost >= 0
            && Number.isFinite(point.marginOfError)
            && point.marginOfError >= 0,
    );

    const safeTarget =
        Number.isFinite(targetMarginOfError) && targetMarginOfError > 0 ? targetMarginOfError : 0;
    const safeBudget = Number.isFinite(budget) && budget >= 0 ? budget : 0;

    const minCost = validPoints.length > 0 ? Math.min(...validPoints.map((p) => p.totalCost)) : 0;
    const maxCost = validPoints.length > 0 ? Math.max(...validPoints.map((p) => p.totalCost)) : 0;
    const hasCostSpan = maxCost > minCost;
    const budgetInFullRange = safeBudget >= minCost && safeBudget <= maxCost;

    // Focus horizontal axis on the decision-relevant frontier window when population census cost is many multiples above budget/target
    const targetReachPoint =
        safeTarget > 0 ? validPoints.find((p) => p.marginOfError <= safeTarget) : undefined;
    const targetReachCost = targetReachPoint?.totalCost ?? minCost;
    const desiredFocusMax = Math.max(
        budgetInFullRange ? safeBudget * 1.55 : minCost,
        targetReachCost > minCost ? targetReachCost * 2.4 : minCost,
        minCost + (maxCost - minCost) * 0.15,
    );
    const isFocusedWindow = hasCostSpan && budgetInFullRange && maxCost > desiredFocusMax * 1.6;
    const xAxisMin = minCost;
    const xAxisMax = !hasCostSpan
        ? Math.max(minCost + 100, safeBudget > minCost ? safeBudget * 1.1 : minCost + 100)
        : isFocusedWindow
            ? Math.ceil(desiredFocusMax / 1000) * 1000
            : maxCost;
    const budgetInChartRange = safeBudget >= xAxisMin && safeBudget <= xAxisMax;

    const visiblePoints = validPoints.filter((p) => p.totalCost <= xAxisMax * 1.02);
    const plottedPoints = visiblePoints.length >= 2 ? visiblePoints : validPoints;
    const visibleReferencePoints = validReferencePoints.filter((p) => p.totalCost <= xAxisMax);

    const rawMaxError = plottedPoints.length > 0 ? Math.max(...plottedPoints.map((p) => p.marginOfError)) : 1;
    const practicalErrorCap = safeTarget > 0 ? Math.max(safeTarget * 3.6, 18) : rawMaxError;
    const effectiveMaxError = rawMaxError > practicalErrorCap * 1.5 ? practicalErrorCap : rawMaxError;
    const yAxisMax = Math.max(
        1,
        Math.ceil(Math.max(safeTarget * 1.25, effectiveMaxError, 1) * 1.08),
    );

    const frontierOption = useMemo<EChartsCoreOption>(() => {
        const tokens = getExecutiveChartTokens();

        const markLines: Record<string, unknown>[] = [];
        if (safeTarget > 0) {
            markLines.push({
                yAxis: safeTarget,
                name: "目标误差限",
                lineStyle: {
                    color: tokens.chart5,
                    width: 1.75,
                    type: "dashed",
                },
                label: {
                    show: true,
                    position: "insideEndTop",
                    distance: 4,
                    formatter: () => `目标 ±${formatStatistic(safeTarget, 1)} pp`,
                    color: tokens.warning,
                    backgroundColor: tokens.warningMuted,
                    borderColor: tokens.warningBorder,
                    borderWidth: 1,
                    borderRadius: 4,
                    padding: [2, 6],
                    fontFamily: CHART_FONT_FAMILY,
                    fontSize: 11,
                },
            });
        }
        if (budgetInChartRange) {
            markLines.push({
                xAxis: safeBudget,
                name: "参考预算",
                lineStyle: {
                    color: tokens.chart4,
                    width: 1.75,
                    type: "dashed",
                },
                label: {
                    show: true,
                    position: "end",
                    distance: 6,
                    rotate: 0,
                    formatter: () => `预算 ¥${safeBudget.toLocaleString()}`,
                    color: tokens.auxiliaryStrong,
                    backgroundColor: tokens.auxiliaryMuted,
                    borderColor: tokens.auxiliaryBorder,
                    borderWidth: 1,
                    borderRadius: 4,
                    padding: [2, 6],
                    fontFamily: CHART_FONT_FAMILY,
                    fontSize: 11,
                },
            });
        }

        const feasibleUpperX = Math.min(safeBudget, xAxisMax);
        const showFeasibleRegion = safeTarget > 0 && feasibleUpperX > xAxisMin;

        return {
            legend: buildExecutiveLegend(
                {
                    top: 0,
                    left: 0,
                    right: "auto",
                    data: ["成本—精度前沿", "参考样本量锚点"],
                },
                tokens,
            ),
            grid: buildExecutiveGrid({
                top: 56,
                left: 12,
                right: 24,
                bottom: 28,
            }),
            tooltip: buildExecutiveTooltip(
                {
                    trigger: "axis",
                    axisPointer: {
                        type: "cross",
                        lineStyle: {
                            color: tokens.border,
                            type: "dashed",
                            width: 1,
                        },
                        crossStyle: {
                            color: tokens.border,
                            type: "dashed",
                            width: 1,
                        },
                    },
                    formatter: (params: unknown) => {
                        const list = Array.isArray(params) ? params : [params];
                        const first = list[0] as { value?: unknown } | undefined;
                        const tuple = Array.isArray(first?.value) ? (first.value as number[]) : null;
                        if (!tuple || tuple.length < 3) return "";
                        const [costVal = 0, errorVal = 0, sampleVal = 0] = tuple;
                        const withinBudget = costVal <= safeBudget;
                        const meetsPrecision = safeTarget > 0 ? errorVal <= safeTarget + 1e-9 : true;

                        return [
                            `<div style="min-width:208px;">`,
                            `<div style="font-weight:600;color:${tokens.foreground};margin-bottom:4px;">成本—精度权衡前沿点</div>`,
                            `<div style="display:flex;justify-content:space-between;gap:14px;"><span>规划发放样本量</span><strong style="color:${tokens.foreground};">${Math.round(sampleVal).toLocaleString()} 份</strong></div>`,
                            `<div style="display:flex;justify-content:space-between;gap:14px;"><span>预计总成本</span><strong style="color:${withinBudget ? tokens.primary : tokens.destructive};">¥${Math.round(costVal).toLocaleString()}</strong></div>`,
                            `<div style="display:flex;justify-content:space-between;gap:14px;"><span>预期误差限</span><strong style="color:${meetsPrecision ? tokens.success : tokens.warning};">±${errorVal.toFixed(2)} 个百分点</strong></div>`,
                            `<div style="margin-top:4px;padding-top:4px;border-top:1px dashed ${tokens.border};display:flex;justify-content:space-between;gap:10px;color:${withinBudget && meetsPrecision ? tokens.success : tokens.mutedForeground};">`,
                            `<span>${withinBudget ? "预算内可执行" : "超出当前预算"}</span>`,
                            `<span>${meetsPrecision ? "满足目标精度" : "未达目标精度"}</span>`,
                            `</div>`,
                            `</div>`,
                        ].join("");
                    },
                },
                tokens,
            ),
            xAxis: buildExecutiveValueAxis(
                {
                    name: "总成本（元）",
                    nameLocation: "middle",
                    nameGap: 28,
                    min: xAxisMin,
                    max: xAxisMax,
                    splitNumber: 4,
                    axisLabel: {
                        hideOverlap: true,
                        formatter: (val: number) =>
                            val >= 10000
                                ? `¥${formatStatistic(val / 10000, val % 10000 === 0 ? 0 : 1)}万`
                                : `¥${Math.round(val).toLocaleString()}`,
                    },
                },
                tokens,
            ),
            yAxis: buildExecutiveValueAxis(
                {
                    name: "误差限 (±pp)",
                    nameGap: 12,
                    nameTextStyle: {
                        align: "left",
                        padding: [0, 0, 0, -24],
                    },
                    min: 0,
                    max: yAxisMax,
                    splitNumber: 4,
                    axisLabel: {
                        formatter: (val: number) => `±${formatStatistic(val, val < 1 && val > 0 ? 1 : 0)}`,
                    },
                },
                tokens,
            ),
            series: [
                {
                    name: "成本—精度前沿",
                    type: "line",
                    showSymbol: false,
                    smooth: false,
                    clip: true,
                    z: 3,
                    lineStyle: {
                        color: tokens.chart2,
                        width: 2.5,
                    },
                    areaStyle: {
                        color: tokens.primaryMuted,
                        opacity: 0.5,
                    },
                    encode: { x: 0, y: 1 },
                    data: validPoints.map((point) => [point.totalCost, point.marginOfError, point.sampleSize]),
                    ...(markLines.length > 0
                        ? {
                              markLine: {
                                  silent: true,
                                  symbol: ["none", "none"],
                                  data: markLines,
                              },
                          }
                        : {}),
                    ...(showFeasibleRegion
                        ? {
                              markArea: {
                                  silent: true,
                                  itemStyle: {
                                      color: tokens.successMuted,
                                      opacity: 0.65,
                                      borderColor: tokens.successBorder,
                                      borderWidth: 1,
                                      borderType: "dashed",
                                  },
                                  label: {
                                      show: true,
                                      position: "insideBottomLeft",
                                      distance: 6,
                                      color: tokens.success,
                                      fontFamily: CHART_FONT_FAMILY,
                                      fontSize: 11,
                                  },
                                  data: [
                                      [
                                          { name: "预算·精度可行域", xAxis: xAxisMin, yAxis: 0 },
                                          { xAxis: feasibleUpperX, yAxis: safeTarget },
                                      ],
                                  ],
                              },
                          }
                        : {}),
                },
                {
                    name: "参考样本量锚点",
                    type: "scatter",
                    clip: true,
                    z: 5,
                    symbol: "circle",
                    symbolSize: 7,
                    itemStyle: {
                        color: tokens.card,
                        borderColor: tokens.chart2,
                        borderWidth: 2,
                    },
                    emphasis: {
                        scale: 1.35,
                        itemStyle: {
                            color: tokens.chart2,
                            borderColor: tokens.card,
                            borderWidth: 2,
                        },
                    },
                    encode: { x: 0, y: 1 },
                    data: visibleReferencePoints.map((point) => [
                        point.totalCost,
                        point.marginOfError,
                        point.sampleSize,
                    ]),
                },
            ],
        };
    }, [validPoints, visibleReferencePoints, safeTarget, safeBudget, budgetInChartRange, xAxisMin, xAxisMax, yAxisMax]);

    if (validPoints.length === 0) return null;

    return (
        <div className="space-y-2.5 text-meta" data-testid="cost-precision-frontier">
            <div className="rounded-control border border-border bg-card p-2.5">
                <EChartBox
                    option={frontierOption}
                    height={256}
                    fallbackWidth={500}
                    ariaLabel="精度与成本曲线，横轴为总成本，纵轴为预期误差限"
                    testId="cost-precision-echart"
                    srSummary={
                        <p>
                            成本精度前沿曲线共 {validPoints.length} 个采样点，总成本范围 ¥{minCost.toLocaleString()} 至 ¥{maxCost.toLocaleString()}，
                            目标误差限 ±{formatStatistic(safeTarget, 1)} 个百分点，参考预算 ¥{safeBudget.toLocaleString()}。
                        </p>
                    }
                />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 tabular-nums">
                <span className="text-muted-foreground">
                    {isFocusedWindow
                        ? `决策聚焦区间：¥${minCost.toLocaleString()} ～ ¥${xAxisMax.toLocaleString()}（全总体上限 ¥${maxCost.toLocaleString()}）`
                        : `成本范围：¥${minCost.toLocaleString()} ～ ¥${maxCost.toLocaleString()}`}
                </span>
                <div className="flex flex-wrap items-center gap-3">
                    {safeTarget > 0 && (
                        <span className="font-medium text-warning">
                            水平虚线：目标 ±{formatStatistic(safeTarget, 1)} 个百分点
                        </span>
                    )}
                    <span className="font-medium text-auxiliary-strong">
                        参考预算：¥{safeBudget.toLocaleString()}
                        {budgetInFullRange ? "（竖直虚线）" : "（在横轴范围之外）"}
                    </span>
                </div>
            </div>

            <details className="rounded-control border border-border bg-card px-3 py-2">
                <summary className="cursor-pointer font-medium text-primary">
                    查看参考样本量、成本与精度数值
                </summary>
                <div className="mt-2 overflow-x-auto">
                    <table className="w-full text-right tabular-nums" aria-label="参考样本量、成本与精度数值表">
                        <thead className="border-b border-border text-muted-foreground">
                            <tr>
                                <th scope="col" className="py-1.5 pr-3 font-medium">发放量</th>
                                <th scope="col" className="px-3 py-1.5 font-medium">总成本（元）</th>
                                <th scope="col" className="py-1.5 pl-3 font-medium">误差限（百分点）</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                            {validReferencePoints.map((point) => (
                                <tr key={point.sampleSize}>
                                    <td className="py-1.5 pr-3">{point.sampleSize}</td>
                                    <td className="px-3 py-1.5">{point.totalCost.toLocaleString()}</td>
                                    <td className="py-1.5 pl-3">±{point.marginOfError.toFixed(2)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </details>

            <p className="leading-relaxed text-muted-foreground">
                曲线按 p=0.5、当前设计效应和预期回答率计算，包含有限总体校正；浅绿色虚线框标识「预算内且满足目标误差限」的可行域。临近总体上限时，精度与成本的关系可能不同于小抽样比近似。
            </p>
        </div>
    );
}
