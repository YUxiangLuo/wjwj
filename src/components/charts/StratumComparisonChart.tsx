import { StatusBadge } from "@/components/StatusBadge";
import { formatStatistic } from "@/utils/statistic-format";

export interface StratumResponseRow {
    stratum: string;
    frameSharePct: number;
    invitedCount: number;
    validCount: number;
    validSharePct: number;
    responseRatePct: number;
}

export function StratumComparisonChart({
    stratumField,
    rows,
}: {
    stratumField: string;
    rows: StratumResponseRow[];
}) {
    const maxShare = Math.max(25, ...rows.flatMap((row) => [row.frameSharePct, row.validSharePct]));

    return (
        <div className="rounded-surface border border-border bg-card p-5" data-testid="stratum-comparison-chart">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
                <div>
                    <h3 className="text-subheading font-semibold text-foreground">细分客群应答率与样本结构偏倚诊断（{stratumField}）</h3>
                    <p className="text-meta text-muted-foreground">对比抽样框真实客群占比 vs 质检有效答卷占比，定位低响应欠代表客群</p>
                </div>
                <div className="flex items-center gap-4 text-meta text-muted-foreground">
                    <span className="inline-flex items-center gap-1.5">
                        <span className="inline-block h-2.5 w-2.5 rounded-circle bg-muted-foreground" />
                        抽样框客群占比
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                        <span className="inline-block h-2.5 w-2.5 rounded-circle bg-primary" />
                        有效回收占比
                    </span>
                </div>
            </div>

            {rows.length === 0 ? (
                <p className="py-6 text-center text-label text-muted-foreground">当前课题未配置框内客群分层字段</p>
            ) : (
                <div className="space-y-3.5">
                    {rows.map((row) => {
                        const diff = row.validSharePct - row.frameSharePct;
                        const underRepresented = diff <= -4 || row.responseRatePct < 60;
                        return (
                            <div key={row.stratum} className="rounded-control border border-border bg-background p-3.5">
                                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                                    <div className="flex items-center gap-2">
                                        <span className="text-label font-semibold text-foreground">{row.stratum}</span>
                                        <StatusBadge intent={underRepresented ? "warning" : "success"}>
                                            有效回收率 {formatStatistic(row.responseRatePct, 1)}%（{row.validCount}/{row.invitedCount}）
                                        </StatusBadge>
                                    </div>
                                    <span className={`text-meta font-medium tabular-nums ${Math.abs(diff) >= 4 ? "text-warning" : "text-muted-foreground"}`}>
                                        结构偏差 {diff >= 0 ? "+" : ""}{formatStatistic(diff, 1)} 百分点
                                    </span>
                                </div>
                                <svg viewBox="0 0 420 30" className="h-7 w-full" role="img" aria-label={`${row.stratum} 抽样框占比 ${formatStatistic(row.frameSharePct, 1)}%，有效回收占比 ${formatStatistic(row.validSharePct, 1)}%`}>
                                    <rect x="0" y="3" width={Math.max(4, (row.frameSharePct / maxShare) * 340)} height="9" rx="4" fill="var(--chart-1)" />
                                    <text x={Math.max(4, (row.frameSharePct / maxShare) * 340) + 8} y="11" fill="var(--muted-foreground)" fontSize="12">
                                        框 {formatStatistic(row.frameSharePct, 1)}%
                                    </text>
                                    <rect x="0" y="17" width={Math.max(4, (row.validSharePct / maxShare) * 340)} height="9" rx="4" fill={underRepresented ? "var(--chart-5)" : "var(--chart-2)"} />
                                    <text x={Math.max(4, (row.validSharePct / maxShare) * 340) + 8} y="25" fill="var(--foreground)" fontSize="12">
                                        回收 {formatStatistic(row.validSharePct, 1)}%
                                    </text>
                                </svg>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
