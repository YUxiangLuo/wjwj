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
    const firstCount = stages[0]?.count ?? 1;
    const topCount = Math.max(1, Number.isFinite(firstCount) ? firstCount : 1);

    return (
        <div className="rounded-surface border border-border bg-card p-5" data-testid="fieldwork-funnel-chart">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
                <div>
                    <h3 className="text-subheading font-semibold text-foreground">问卷投放—回收—质检转化漏斗</h3>
                    <p className="text-meta text-muted-foreground">追踪从入样邀约到剔除无效废卷后的真实可用样本留存</p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                    {targetRequiredCount != null && targetRequiredCount > 0 && (
                        <span className="rounded-control border border-border bg-muted px-3 py-1 text-meta font-medium tabular-nums text-foreground">
                            规划目标有效量：{targetRequiredCount} 份
                        </span>
                    )}
                    {totalEstimatedCost != null && (
                        <span className="rounded-control border border-info-border bg-info-muted px-3 py-1 text-meta font-medium tabular-nums text-info">
                            参考总经费：¥{formatStatistic(totalEstimatedCost, 0)}
                            {unitEffectiveCost != null ? `（有效单价 ¥${formatStatistic(unitEffectiveCost, 1)}/份）` : ""}
                        </span>
                    )}
                </div>
            </div>

            <div className="space-y-3">
                {stages.map((stage, index) => {
                    const safeCount = Number.isFinite(stage.count) ? Math.max(0, stage.count) : 0;
                    const ratio = Math.max(0, Math.min(100, (safeCount / topCount) * 100));
                    const rawPrev = index > 0 ? (stages[index - 1]?.count ?? safeCount) : safeCount;
                    const prevCount = Number.isFinite(rawPrev) ? Math.max(0, rawPrev) : 0;
                    const stepConversion = prevCount > 0 ? (safeCount / prevCount) * 100 : 0;
                    const fill = TONE_FILLS[stage.tone ?? "primary"];
                    return (
                        <div key={stage.key} className="grid grid-cols-[13.5rem_minmax(6rem,1fr)_11.5rem] items-center gap-3">
                            <div className="min-w-0">
                                <p className="truncate text-label font-semibold text-foreground">{stage.label}</p>
                                <p className="truncate text-meta text-muted-foreground">{stage.description}</p>
                            </div>
                            <svg viewBox="0 0 400 28" className="h-7 w-full" role="img" aria-label={`${stage.label} ${safeCount} 份，占发放总数 ${formatStatistic(ratio, 1)}%`}>
                                <rect x="0" y="4" width="400" height="20" rx="6" fill="var(--muted)" />
                                <rect
                                    x="0"
                                    y="4"
                                    width={Math.max(safeCount > 0 ? 8 : 0, (ratio / 100) * 400)}
                                    height="20"
                                    rx="6"
                                    fill={fill}
                                />
                                {targetRequiredCount != null && targetRequiredCount > 0 && targetRequiredCount <= topCount && (
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
                                    ({formatStatistic(ratio, 1)}%{index > 0 ? ` · 环比 ${formatStatistic(stepConversion, 0)}%` : ""})
                                </span>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
