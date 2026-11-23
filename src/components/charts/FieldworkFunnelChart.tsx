import { useMemo } from "react";
import { StatusBadge } from "@/components/StatusBadge";
import { formatStatistic } from "@/utils/statistic-format";
import { EChartBox } from "./EChartBox";
import type { EChartsCoreOption } from "./echarts-core";
import {
    CHART_FONT_FAMILY,
    buildExecutiveCategoryAxis,
    buildExecutiveGrid,
    buildExecutiveLegend,
    buildExecutiveTooltip,
    buildExecutiveValueAxis,
    getExecutiveChartTokens,
    resolveChartToneColor,
} from "./echarts-theme";

export interface FunnelStageItem {
    key: string;
    label: string;
    count: number;
    description: string;
    tone?: "primary" | "info" | "success" | "warning" | "destructive";
}

function escapeHtml(value: string): string {
    return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function shortenStageAxisLabel(label: string, maxChars = 10): string {
    const trimmed = label.trim();
    if (trimmed.length <= maxChars) return trimmed;
    return `${trimmed.slice(0, maxChars - 1)}…`;
}

export function FieldworkFunnelChart({
    stages,
    targetRequiredCount,
    unitEffectiveCost,
    totalEstimatedCost,
}: {
    stages: FunnelStageItem[];
    targetRequiredCount?: number | null;
    unitEffectiveCost?: number | null;
    totalEstimatedCost?: number | null;
}) {
    const safeCounts = stages.map((stage) =>
        Number.isFinite(stage.count) ? Math.max(0, Math.round(stage.count * 100) / 100) : 0,
    );
    const topCount = Math.max(1, ...safeCounts);
    const firstCount = safeCounts[0] ?? 0;
    const finalCount = safeCounts.length > 0 ? (safeCounts[safeCounts.length - 1] ?? 0) : 0;
    const hasPositiveBase = firstCount > 0;
    const overallConversionPct = hasPositiveBase
        ? Math.max(0, Math.min(100, (finalCount / firstCount) * 100))
        : 0;

    const hasValidTarget =
        targetRequiredCount != null && Number.isFinite(targetRequiredCount) && targetRequiredCount > 0;
    const safeTarget = hasValidTarget ? targetRequiredCount : null;
    const targetReached = safeTarget !== null ? finalCount >= safeTarget : null;
    const targetGap = safeTarget !== null ? Math.max(0, Math.ceil(safeTarget - finalCount)) : 0;

    const hasValidTotalCost =
        totalEstimatedCost != null && Number.isFinite(totalEstimatedCost) && totalEstimatedCost >= 0;
    const hasValidUnitCost =
        unitEffectiveCost != null && Number.isFinite(unitEffectiveCost) && unitEffectiveCost >= 0;

    const stageMetrics = stages.map((stage, index) => {
        const safeCount = safeCounts[index] ?? 0;
        const displayRatio = hasPositiveBase
            ? Math.max(0, Math.min(100, (safeCount / firstCount) * 100))
            : 0;
        const prevCount = index > 0 ? (safeCounts[index - 1] ?? 0) : safeCount;
        const stepConversion =
            index === 0
                ? (hasPositiveBase ? 100 : null)
                : prevCount > 0
                    ? Math.min(100, Math.max(0, (safeCount / prevCount) * 100))
                    : null;
        const stepDropCount = index > 0 ? Math.max(0, prevCount - safeCount) : 0;
        const stepDropPct =
            index > 0 && prevCount > 0
                ? Math.min(100, Math.max(0, (stepDropCount / prevCount) * 100))
                : 0;
        return {
            stage,
            index,
            safeCount,
            displayRatio,
            prevCount,
            stepConversion,
            stepDropCount,
            stepDropPct,
        };
    });

    const chartHeight = Math.max(220, stages.length * 52 + 16);

    const { funnelOption, retentionOption } = useMemo(() => {
        const tokens = getExecutiveChartTokens();

        const renderStageTooltip = (index: number) => {
            const metric = stageMetrics[index];
            if (!metric) return "";
            const { stage, safeCount, displayRatio, stepConversion, stepDropCount, stepDropPct } = metric;
            const toneColor = resolveChartToneColor(stage.tone ?? "primary", tokens);
            const stepText =
                index === 0
                    ? "初始发放基准（100%）"
                    : stepConversion !== null
                        ? `${formatStatistic(stepConversion, 1)}%（本步损耗 ${stepDropCount} 份 / -${formatStatistic(stepDropPct, 1)}%）`
                        : "—（上步基数为 0）";
            const targetLine =
                safeTarget !== null && index === stageMetrics.length - 1
                    ? `<div style="margin-top:4px;padding-top:4px;border-top:1px dashed ${tokens.border};color:${safeCount >= safeTarget ? tokens.success : tokens.warning};font-weight:600;">规划有效目标：${safeTarget} 份（${safeCount >= safeTarget ? "已达标" : `差 ${Math.max(0, safeTarget - safeCount)} 份`}）</div>`
                    : "";

            return [
                `<div style="min-width:210px;">`,
                `<div style="display:flex;align-items:center;gap:6px;font-weight:600;color:${tokens.foreground};margin-bottom:4px;">`,
                `<span style="display:inline-block;width:8px;height:8px;border-radius:4px;background:${toneColor};"></span>`,
                `<span>${escapeHtml(stage.label)}</span>`,
                `</div>`,
                `<div style="display:flex;justify-content:space-between;gap:12px;"><span>本级留存样本</span><strong style="color:${tokens.foreground};">${safeCount} 份</strong></div>`,
                `<div style="display:flex;justify-content:space-between;gap:12px;"><span>占初始发放量</span><strong>${formatStatistic(displayRatio, 1)}%</strong></div>`,
                `<div style="display:flex;justify-content:space-between;gap:12px;"><span>环比留存转化</span><strong>${stepText}</strong></div>`,
                stage.description
                    ? `<div style="margin-top:4px;color:${tokens.mutedForeground};">环节诊断：${escapeHtml(stage.description)}</div>`
                    : "",
                targetLine,
                `</div>`,
            ].join("");
        };

        const builtFunnelOption: EChartsCoreOption = {
            tooltip: buildExecutiveTooltip(
                {
                    trigger: "item",
                    formatter: (params: unknown) => {
                        const item = params as { dataIndex?: number };
                        return renderStageTooltip(item.dataIndex ?? 0);
                    },
                },
                tokens,
            ),
            series: [
                {
                    name: "投放回收转化漏斗",
                    type: "funnel",
                    left: "4%",
                    width: "92%",
                    top: 12,
                    bottom: 12,
                    min: 0,
                    max: topCount,
                    minSize: "34%",
                    maxSize: "96%",
                    sort: "none",
                    gap: 4,
                    label: {
                        show: true,
                        position: "inside",
                        fontFamily: CHART_FONT_FAMILY,
                        fontSize: 12,
                        fontWeight: 600,
                        color: "#ffffff",
                        formatter: (params: unknown) => {
                            const item = params as { dataIndex?: number };
                            const metric = stageMetrics[item.dataIndex ?? 0];
                            if (!metric) return "";
                            return `${metric.safeCount} 份 (${formatStatistic(metric.displayRatio, 1)}%)`;
                        },
                    },
                    itemStyle: {
                        borderColor: tokens.card,
                        borderWidth: 2,
                    },
                    emphasis: {
                        itemStyle: {
                            opacity: 0.92,
                        },
                    },
                    data: stageMetrics.map((metric) => ({
                        name: metric.stage.label,
                        value: metric.safeCount,
                        itemStyle: {
                            color: resolveChartToneColor(metric.stage.tone ?? "primary", tokens),
                        },
                    })),
                },
            ],
        };

        const barAxisMax = Math.max(
            topCount,
            safeTarget !== null && safeTarget <= topCount * 1.35 ? Math.ceil(safeTarget * 1.08) : topCount,
        );
        const showTargetMarkLine = safeTarget !== null && safeTarget <= barAxisMax;

        const builtRetentionOption: EChartsCoreOption = {
            legend: buildExecutiveLegend(
                {
                    top: 0,
                    left: 0,
                    right: "auto",
                    data: ["本级留存样本", "本环节损耗/剔除"],
                },
                tokens,
            ),
            grid: buildExecutiveGrid({
                top: showTargetMarkLine ? 44 : 34,
                left: 8,
                right: 24,
                bottom: 8,
            }),
            tooltip: buildExecutiveTooltip(
                {
                    trigger: "axis",
                    formatter: (params: unknown) => {
                        const list = Array.isArray(params) ? params : [params];
                        const first = list[0] as { dataIndex?: number } | undefined;
                        return renderStageTooltip(first?.dataIndex ?? 0);
                    },
                },
                tokens,
            ),
            xAxis: buildExecutiveValueAxis(
                {
                    min: 0,
                    max: barAxisMax,
                    splitNumber: 4,
                },
                tokens,
            ),
            yAxis: buildExecutiveCategoryAxis(
                {
                    inverse: true,
                    data: stageMetrics.map((m) => shortenStageAxisLabel(m.stage.label, 10)),
                    axisLabel: {
                        color: tokens.foreground,
                        fontWeight: 500,
                    },
                },
                tokens,
            ),
            series: [
                {
                    name: "本级留存样本",
                    type: "bar",
                    stack: "stage",
                    barMaxWidth: 20,
                    itemStyle: {
                        color: tokens.chart2,
                    },
                    data: stageMetrics.map((metric) => ({
                        value: metric.safeCount,
                        itemStyle: {
                            color: resolveChartToneColor(metric.stage.tone ?? "primary", tokens),
                            borderRadius: metric.stepDropCount > 0 ? [4, 0, 0, 4] : [4, 4, 4, 4],
                        },
                    })),
                    ...(showTargetMarkLine && safeTarget !== null
                        ? {
                              markLine: {
                                  silent: true,
                                  symbol: ["none", "none"],
                                  lineStyle: {
                                      color: tokens.foreground,
                                      width: 1.5,
                                      type: "dashed",
                                  },
                                  label: {
                                      show: true,
                                      position: "start",
                                      distance: 6,
                                      rotate: 0,
                                      formatter: () => `目标 ${safeTarget} 份`,
                                      color: tokens.foreground,
                                      backgroundColor: tokens.card,
                                      borderColor: tokens.border,
                                      borderWidth: 1,
                                      borderRadius: 4,
                                      padding: [1, 5],
                                      fontFamily: CHART_FONT_FAMILY,
                                      fontSize: 11,
                                  },
                                  data: [{ xAxis: safeTarget }],
                              },
                          }
                        : {}),
                },
                {
                    name: "本环节损耗/剔除",
                    type: "bar",
                    stack: "stage",
                    barMaxWidth: 20,
                    itemStyle: {
                        color: tokens.destructiveBorder,
                        borderRadius: [0, 4, 4, 0],
                    },
                    data: stageMetrics.map((metric) => metric.stepDropCount),
                },
            ],
        };

        return {
            funnelOption: builtFunnelOption,
            retentionOption: builtRetentionOption,
        };
    }, [stageMetrics, topCount, safeTarget]);

    return (
        <div className="rounded-surface border border-border bg-card p-5" data-testid="fieldwork-funnel-chart">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
                <div>
                    <h3 className="text-subheading font-semibold text-foreground">问卷投放—回收—质检转化漏斗</h3>
                    <p className="text-meta text-muted-foreground">追踪从入样邀约到剔除无效废卷后的真实可用样本留存与环节损耗</p>
                </div>
                <div className="flex flex-wrap items-center gap-2.5">
                    {stages.length > 0 && (
                        <StatusBadge intent={!hasPositiveBase ? "neutral" : overallConversionPct >= 65 ? "success" : "warning"}>
                            总有效留存率 {hasPositiveBase ? `${formatStatistic(overallConversionPct, 1)}%` : "0.0%"}
                        </StatusBadge>
                    )}
                    {safeTarget !== null && (
                        <span className="rounded-control border border-border bg-muted px-3 py-1 text-meta font-medium tabular-nums text-foreground">
                            规划目标有效量：{safeTarget} 份
                            {stages.length > 0 ? (targetReached ? "（已达标）" : `（缺口 ${targetGap} 份）`) : ""}
                        </span>
                    )}
                    {hasValidTotalCost && (
                        <span className="rounded-control border border-info-border bg-info-muted px-3 py-1 text-meta font-medium tabular-nums text-info">
                            参考总经费：¥{formatStatistic(totalEstimatedCost, 0)}
                            {hasValidUnitCost ? `（有效单价 ¥${formatStatistic(unitEffectiveCost, 1)}/份）` : ""}
                        </span>
                    )}
                </div>
            </div>

            {stages.length === 0 ? (
                <p className="py-6 text-center text-label text-muted-foreground">暂无投放转化漏斗数据</p>
            ) : (
                <div className="space-y-4">
                    <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,16.5rem),1fr))] items-center gap-4">
                        <div className="min-w-0 rounded-control border border-border bg-background p-3">
                            <p className="mb-1 text-meta font-medium text-muted-foreground">梯形转化漏斗（逐级占初始发放比例）</p>
                            <EChartBox
                                option={funnelOption}
                                height={chartHeight}
                                fallbackWidth={340}
                                ariaLabel="问卷投放—回收—质检梯形转化漏斗图"
                                testId="fieldwork-funnel-echart"
                                srSummary={
                                    <table aria-label="问卷投放回收质检转化漏斗数据表">
                                        <thead>
                                            <tr>
                                                <th scope="col">环节</th>
                                                <th scope="col">留存样本数</th>
                                                <th scope="col">占初始发放比例</th>
                                                <th scope="col">上步转化率</th>
                                                <th scope="col">环节损耗说明</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {stageMetrics.map((metric) => (
                                                <tr key={metric.stage.key}>
                                                    <th scope="row">阶段 {metric.index + 1}：{metric.stage.label}</th>
                                                    <td>{metric.safeCount} 份</td>
                                                    <td>{formatStatistic(metric.displayRatio, 1)}%</td>
                                                    <td>
                                                        {metric.stepConversion !== null
                                                            ? `${formatStatistic(metric.stepConversion, 0)}%`
                                                            : "—"}
                                                    </td>
                                                    <td>{metric.stage.description}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                }
                            />
                        </div>

                        <div className="min-w-0 rounded-control border border-border bg-background p-3">
                            <p className="mb-1 text-meta font-medium text-muted-foreground">各环节样本留存与步间损耗分解</p>
                            <EChartBox
                                option={retentionOption}
                                height={chartHeight}
                                fallbackWidth={360}
                                ariaLabel="各环节样本留存与步间损耗横向柱状图"
                                testId="fieldwork-retention-echart"
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,13.5rem),1fr))] gap-2.5">
                        {stageMetrics.map((metric) => {
                            const { stage, index, safeCount, displayRatio, stepConversion, stepDropCount } = metric;
                            return (
                                <div
                                    key={stage.key}
                                    className="flex flex-col justify-between gap-1.5 rounded-control border border-border bg-background px-3.5 py-2.5"
                                >
                                    <div className="flex items-start justify-between gap-2">
                                        <p className="min-w-0 break-words text-label font-semibold text-foreground" title={stage.label}>
                                            {stage.label}
                                        </p>
                                        {index > 0 && stepDropCount > 0 && (
                                            <span className="shrink-0 text-meta font-medium tabular-nums text-destructive">
                                                -{stepDropCount} 份
                                            </span>
                                        )}
                                    </div>
                                    <div className="flex flex-wrap items-baseline justify-between gap-1.5 tabular-nums">
                                        <span className="text-subheading font-bold text-foreground">{safeCount} 份</span>
                                        <span className="text-meta text-muted-foreground">
                                            ({formatStatistic(displayRatio, 1)}%
                                            {index > 0
                                                ? ` · 环比 ${stepConversion !== null ? `${formatStatistic(stepConversion, 0)}%` : "—"}`
                                                : ""})
                                        </span>
                                    </div>
                                    <p className="break-words text-meta leading-snug text-muted-foreground" title={stage.description}>
                                        {stage.description}
                                    </p>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
}
