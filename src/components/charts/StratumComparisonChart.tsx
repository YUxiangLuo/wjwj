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

function clampPercentage(value: number): number {
    return Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0;
}

export function StratumComparisonChart({
    stratumField,
    rows,
}: {
    stratumField: string;
    rows: StratumResponseRow[];
}) {
    const normalizedRows = rows.map((row) => ({
        stratum: row.stratum?.trim() ? row.stratum : "（未命名层）",
        frameSharePct: clampPercentage(row.frameSharePct),
        validSharePct: clampPercentage(row.validSharePct),
        invitedCount: Number.isFinite(row.invitedCount) ? Math.max(0, Math.round(row.invitedCount)) : 0,
        validCount: Number.isFinite(row.validCount) ? Math.max(0, Math.round(row.validCount)) : 0,
        responseRatePct: clampPercentage(row.responseRatePct),
    }));
    const maxShare = Math.max(25, ...normalizedRows.flatMap((row) => [row.frameSharePct, row.validSharePct]));
    const maxBarWidth = 328;

    return (
        <div className="rounded-surface border border-border bg-card p-5" data-testid="stratum-comparison-chart">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
                <div className="min-w-0">
                    <h3 className="break-words text-subheading font-semibold text-foreground">
                        细分客群应答率与样本结构偏倚诊断（{stratumField || "未指定字段"}）
                    </h3>
                    <p className="text-meta text-muted-foreground">对比抽样框真实客群占比 vs 质检有效答卷占比，定位低响应欠代表客群</p>
                </div>
                <div className="flex flex-wrap items-center gap-4 text-meta text-muted-foreground">
                    <span className="inline-flex items-center gap-1.5">
                        <span className="inline-block h-2.5 w-2.5 rounded-circle bg-muted-foreground" />
                        抽样框客群占比
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                        <span className="inline-block h-2.5 w-2.5 rounded-circle bg-primary" />
                        有效回收占比
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                        <span className="inline-block h-2.5 w-2.5 rounded-circle bg-warning" />
                        欠代表 / 低响应预警
                    </span>
                </div>
            </div>

            {normalizedRows.length === 0 ? (
                <p className="py-6 text-center text-label text-muted-foreground">当前课题未配置框内客群分层字段</p>
            ) : (
                <div className="space-y-3.5">
                    {normalizedRows.map((row, index) => {
                        const diff = row.validSharePct - row.frameSharePct;
                        const hasInvited = row.invitedCount > 0;
                        const lowResponse = hasInvited && row.responseRatePct < 60;
                        const underRepresented = diff <= -4 || lowResponse;
                        const overRepresented = diff >= 4;
                        const frameBarW = Math.max(4, (row.frameSharePct / maxShare) * maxBarWidth);
                        const validBarW = Math.max(4, (row.validSharePct / maxShare) * maxBarWidth);
                        return (
                            <div key={`${row.stratum}-${index}`} className="rounded-control border border-border bg-background p-3.5">
                                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                                    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                                        <span
                                            className="max-w-full break-words text-label font-semibold text-foreground"
                                            title={row.stratum}
                                        >
                                            {row.stratum}
                                        </span>
                                        <StatusBadge intent={!hasInvited ? "neutral" : lowResponse ? "warning" : "success"}>
                                            有效回收率 {hasInvited ? `${formatStatistic(row.responseRatePct, 1)}%` : "—"}（{row.validCount}/{row.invitedCount}）
                                        </StatusBadge>
                                    </div>
                                    <span className={`shrink-0 text-meta font-medium tabular-nums ${Math.abs(diff) >= 4 ? "text-warning" : "text-muted-foreground"}`}>
                                        结构偏差 {diff >= 0 ? "+" : ""}{formatStatistic(diff, 1)} pp{diff <= -4 ? "（欠代表）" : overRepresented ? "（超代表）" : ""}
                                    </span>
                                </div>
                                <svg
                                    viewBox="0 0 440 32"
                                    className="h-7 w-full"
                                    role="img"
                                    aria-label={`${row.stratum} 抽样框占比 ${formatStatistic(row.frameSharePct, 1)}%，有效回收占比 ${formatStatistic(row.validSharePct, 1)}%`}
                                >
                                    <rect x="0" y="3" width={frameBarW} height="9" rx="4" fill="var(--chart-1)" />
                                    <text x={frameBarW + 8} y="11" fill="var(--muted-foreground)" fontSize="12">
                                        框 {formatStatistic(row.frameSharePct, 1)}%
                                    </text>
                                    <rect x="0" y="18" width={validBarW} height="9" rx="4" fill={underRepresented ? "var(--chart-5)" : "var(--chart-2)"} />
                                    <text x={validBarW + 8} y="26" fill="var(--foreground)" fontSize="12">
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
