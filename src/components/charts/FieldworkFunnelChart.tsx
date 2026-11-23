import { formatStatistic } from "@/utils/statistic-format";

export interface FunnelStageItem {
    key: string;
    label: string;
    count: number;
    description: string;
    tone?: "primary" | "info" | "success" | "warning" | "destructive";
}

const TONE_FILLS: Record<NonNullable<FunnelStageItem["tone"]>, string> = {
    primary: "var(--chart-2)",
    info: "var(--chart-3)",
    success: "var(--chart-7)",
    warning: "var(--chart-5)",
    destructive: "var(--chart-8)",
};

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
    const safeCounts = stages.map((stage) => (Number.isFinite(stage.count) ? Math.max(0, stage.count) : 0));
    const topCount = Math.max(1, ...safeCounts);
    const hasValidTarget = targetRequiredCount != null && Number.isFinite(targetRequiredCount) && targetRequiredCount > 0;
    const hasValidTotalCost = totalEstimatedCost != null && Number.isFinite(totalEstimatedCost) && totalEstimatedCost >= 0;
    const hasValidUnitCost = unitEffectiveCost != null && Number.isFinite(unitEffectiveCost) && unitEffectiveCost >= 0;

    return (
        <div className="rounded-surface border border-border bg-card p-5" data-testid="fieldwork-funnel-chart">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
                <div>
                    <h3 className="text-subheading font-semibold text-foreground">问卷投放—回收—质检转化漏斗</h3>
                    <p className="text-meta text-muted-foreground">追踪从入样邀约到剔除无效废卷后的真实可用样本留存</p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                    {hasValidTarget && (
                        <span className="rounded-control border border-border bg-muted px-3 py-1 text-meta font-medium tabular-nums text-foreground">
                            规划目标有效量：{targetRequiredCount} 份
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
                <div className="space-y-3">
                    {stages.map((stage, index) => {
                        const safeCount = safeCounts[index] ?? 0;
                        const firstCount = safeCounts[0] ?? 0;
                        const hasPositiveBase = firstCount > 0;
                        const barRatio = Math.max(0, Math.min(100, (safeCount / topCount) * 100));
                        const displayRatio = hasPositiveBase
                            ? Math.max(0, Math.min(100, (safeCount / firstCount) * 100))
                            : 0;
                        const prevCount = index > 0 ? (safeCounts[index - 1] ?? 0) : safeCount;
                        const stepConversion = prevCount > 0 ? Math.min(100, Math.max(0, (safeCount / prevCount) * 100)) : null;
                        const fill = TONE_FILLS[stage.tone ?? "primary"];
                        return (
                            <div key={stage.key} className="grid grid-cols-[minmax(9.5rem,14rem)_minmax(5rem,1fr)_auto] items-center gap-3">
                                <div className="min-w-0">
                                    <p className="truncate text-label font-semibold text-foreground" title={stage.label}>{stage.label}</p>
                                    <p className="break-words text-meta leading-snug text-muted-foreground" title={stage.description}>{stage.description}</p>
                                </div>
                                <svg
                                    viewBox="0 0 400 28"
                                    className="h-7 w-full"
                                    role="img"
                                    aria-label={`${stage.label} ${safeCount} 份，占发放总数 ${hasPositiveBase ? `${formatStatistic(displayRatio, 1)}%` : "0.0%"}`}
                                >
                                    <rect x="0" y="4" width="400" height="20" rx="6" fill="var(--muted)" />
                                    <rect
                                        x="0"
                                        y="4"
                                        width={Math.min(400, Math.max(safeCount > 0 ? 8 : 0, (barRatio / 100) * 400))}
                                        height="20"
                                        rx="6"
                                        fill={fill}
                                    />
                                    {hasValidTarget && targetRequiredCount <= topCount && (
                                        <line
                                            x1={(targetRequiredCount / topCount) * 400}
                                            y1="1"
                                            x2={(targetRequiredCount / topCount) * 400}
                                            y2="27"
                                            stroke="var(--foreground)"
                                            strokeWidth="1.5"
                                            strokeDasharray="3 2"
                                        />
                                    )}
                                </svg>
                                <div className="whitespace-nowrap text-right tabular-nums">
                                    <span className="text-subheading font-bold text-foreground">{safeCount}</span>
                                    <span className="ml-1.5 text-meta text-muted-foreground">
                                        ({formatStatistic(displayRatio, 1)}%
                                        {index > 0 ? ` · 环比 ${stepConversion !== null ? `${formatStatistic(stepConversion, 0)}%` : "—"}` : ""})
                                    </span>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
