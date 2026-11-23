import { ArrowRight, CheckCircle2, TrendingDown, TrendingUp } from "lucide-react";
import { StatusBadge } from "@/components/StatusBadge";
import { formatStatistic } from "@/utils/statistic-format";

export interface WaveSnapshotMetric {
    waveNumber: number;
    label: string;
    methodLabel: string;
    invitedCount: number;
    validCount: number;
    effectiveRatePct: number;
    invalidCleanedCount: number;
    maxStratumBiasPp: number | null;
    primaryStandardError: number | null;
    unitLabel?: string;
}

export function WaveDeltaScorecard({
    firstWave,
    finalWave,
}: {
    firstWave: WaveSnapshotMetric;
    finalWave: WaveSnapshotMetric;
}) {
    const rateDelta = finalWave.effectiveRatePct - firstWave.effectiveRatePct;
    const biasDelta = firstWave.maxStratumBiasPp !== null && finalWave.maxStratumBiasPp !== null
        ? finalWave.maxStratumBiasPp - firstWave.maxStratumBiasPp
        : null;
    const seDeltaPct = firstWave.primaryStandardError && finalWave.primaryStandardError && firstWave.primaryStandardError > 0
        ? ((finalWave.primaryStandardError - firstWave.primaryStandardError) / firstWave.primaryStandardError) * 100
        : null;

    return (
        <div className="rounded-surface border border-primary-border bg-primary-muted p-5" data-testid="wave-delta-scorecard">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                    <CheckCircle2 className="h-5 w-5 text-primary" />
                    <h3 className="text-subheading font-bold text-foreground">
                        多轮调研调优演进对比（Wave {firstWave.waveNumber} 试投 → Wave {finalWave.waveNumber} 正式投放）
                    </h3>
                </div>
                <div className="flex items-center gap-2 text-meta font-medium text-primary">
                    <span>{firstWave.methodLabel}</span>
                    <ArrowRight className="h-4 w-4" />
                    <span>{finalWave.methodLabel}</span>
                </div>
            </div>

            <div className="grid grid-cols-[repeat(auto-fit,minmax(12.5rem,1fr))] gap-3">
                <div className="min-w-0 rounded-control border border-border bg-card p-3.5">
                    <p className="text-meta text-muted-foreground">质检后有效样本量</p>
                    <p className="mt-1.5 whitespace-nowrap text-section-title font-bold tabular-nums text-foreground">
                        {firstWave.validCount} <span className="text-meta font-normal text-muted-foreground">→</span> {finalWave.validCount} 份
                    </p>
                    <p className="mt-1 text-meta text-muted-foreground">
                        邀约 {firstWave.invitedCount} → {finalWave.invitedCount} 份
                    </p>
                </div>

                <div className="min-w-0 rounded-control border border-border bg-card p-3.5">
                    <p className="text-meta text-muted-foreground">有效答卷转化率</p>
                    <div className="mt-1.5 flex flex-wrap items-baseline gap-2 tabular-nums">
                        <span className="whitespace-nowrap text-section-title font-bold text-foreground">{formatStatistic(finalWave.effectiveRatePct, 1)}%</span>
                        <StatusBadge intent={rateDelta >= 0 ? "success" : "warning"}>
                            {rateDelta >= 0 ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
                            {rateDelta >= 0 ? "+" : ""}{formatStatistic(rateDelta, 1)}%
                        </StatusBadge>
                    </div>
                    <p className="mt-1 text-meta text-muted-foreground">首轮 {formatStatistic(firstWave.effectiveRatePct, 1)}%</p>
                </div>

                <div className="min-w-0 rounded-control border border-border bg-card p-3.5">
                    <p className="text-meta text-muted-foreground">最大客群结构偏差</p>
                    <div className="mt-1.5 flex flex-wrap items-baseline gap-2 tabular-nums">
                        <span className="whitespace-nowrap text-section-title font-bold text-foreground">
                            {finalWave.maxStratumBiasPp !== null ? `${formatStatistic(finalWave.maxStratumBiasPp, 1)} pp` : "—"}
                        </span>
                        {biasDelta !== null && (
                            <StatusBadge intent={biasDelta <= 0 ? "success" : "warning"}>
                                {biasDelta > 0 ? "+" : ""}{formatStatistic(biasDelta, 1)} pp
                            </StatusBadge>
                        )}
                    </div>
                    <p className="mt-1 text-meta text-muted-foreground">
                        首轮 {firstWave.maxStratumBiasPp !== null ? `${formatStatistic(firstWave.maxStratumBiasPp, 1)} pp` : "—"}
                    </p>
                </div>

                <div className="min-w-0 rounded-control border border-border bg-card p-3.5">
                    <p className="text-meta text-muted-foreground">主指标估计标准误 SE</p>
                    <div className="mt-1.5 flex flex-wrap items-baseline gap-2 tabular-nums">
                        <span className="whitespace-nowrap text-section-title font-bold text-foreground">
                            {finalWave.primaryStandardError !== null
                                ? `${formatStatistic(finalWave.primaryStandardError, 2)}${finalWave.unitLabel ? ` ${finalWave.unitLabel}` : ""}`
                                : "—"}
                        </span>
                        {seDeltaPct !== null && (
                            <StatusBadge intent={seDeltaPct <= 0 ? "success" : "warning"}>
                                {seDeltaPct > 0 ? "+" : ""}{formatStatistic(seDeltaPct, 0)}%
                            </StatusBadge>
                        )}
                    </div>
                    <p className="mt-1 text-meta text-muted-foreground">
                        首轮 {firstWave.primaryStandardError !== null ? `${formatStatistic(firstWave.primaryStandardError, 2)}${finalWave.unitLabel ? ` ${finalWave.unitLabel}` : ""}` : "—"}
                    </p>
                </div>
            </div>
        </div>
    );
}
