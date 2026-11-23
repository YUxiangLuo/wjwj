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
    const firstRate = Number.isFinite(firstWave.effectiveRatePct)
        ? Math.max(0, Math.min(100, firstWave.effectiveRatePct))
        : 0;
    const finalRate = Number.isFinite(finalWave.effectiveRatePct)
        ? Math.max(0, Math.min(100, finalWave.effectiveRatePct))
        : 0;
    const rateDelta = finalRate - firstRate;

    const firstBias = firstWave.maxStratumBiasPp !== null && Number.isFinite(firstWave.maxStratumBiasPp) && firstWave.maxStratumBiasPp >= 0
        ? firstWave.maxStratumBiasPp
        : null;
    const finalBias = finalWave.maxStratumBiasPp !== null && Number.isFinite(finalWave.maxStratumBiasPp) && finalWave.maxStratumBiasPp >= 0
        ? finalWave.maxStratumBiasPp
        : null;
    const rawBiasDelta = firstBias !== null && finalBias !== null
        ? finalBias - firstBias
        : null;
    const biasDelta = rawBiasDelta !== null && Number.isFinite(rawBiasDelta) ? rawBiasDelta : null;

    const firstSe = firstWave.primaryStandardError !== null && Number.isFinite(firstWave.primaryStandardError) && firstWave.primaryStandardError >= 0
        ? firstWave.primaryStandardError
        : null;
    const finalSe = finalWave.primaryStandardError !== null && Number.isFinite(finalWave.primaryStandardError) && finalWave.primaryStandardError >= 0
        ? finalWave.primaryStandardError
        : null;
    const rawSeDeltaPct = firstSe !== null && finalSe !== null && firstSe > 0
        ? ((finalSe - firstSe) / firstSe) * 100
        : null;
    const seDeltaPct = rawSeDeltaPct !== null && Number.isFinite(rawSeDeltaPct) ? rawSeDeltaPct : null;

    const firstValid = Number.isFinite(firstWave.validCount) ? Math.max(0, firstWave.validCount) : 0;
    const finalValid = Number.isFinite(finalWave.validCount) ? Math.max(0, finalWave.validCount) : 0;
    const firstInvited = Number.isFinite(firstWave.invitedCount) ? Math.max(0, firstWave.invitedCount) : 0;
    const finalInvited = Number.isFinite(finalWave.invitedCount) ? Math.max(0, finalWave.invitedCount) : 0;

    const formatSeWithUnit = (val: number, unit?: string) => {
        const cleanUnit = unit?.trim() ?? "";
        if (!cleanUnit) return formatStatistic(val, 2);
        if (cleanUnit === "%") return `${formatStatistic(val, 2)}%`;
        return `${formatStatistic(val, 2)} ${cleanUnit}`;
    };

    return (
        <div className="rounded-surface border border-primary-border bg-primary-muted p-5" data-testid="wave-delta-scorecard">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                    <CheckCircle2 className="h-5 w-5 shrink-0 text-primary" />
                    <h3 className="text-subheading font-bold text-foreground">
                        多轮调研调优演进对比（Wave {firstWave.waveNumber} 试投 → Wave {finalWave.waveNumber} 正式投放）
                    </h3>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-meta font-medium text-primary">
                    <span>{firstWave.methodLabel}</span>
                    <ArrowRight className="h-4 w-4 shrink-0" />
                    <span>{finalWave.methodLabel}</span>
                </div>
            </div>

            <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,10.5rem),1fr))] gap-3">
                <div className="min-w-0 rounded-control border border-border bg-card p-3.5">
                    <p className="text-meta text-muted-foreground">质检后有效样本量</p>
                    <p className="mt-1.5 break-words text-section-title font-bold tabular-nums text-foreground">
                        {firstValid} <span className="text-meta font-normal text-muted-foreground">→</span> {finalValid} 份
                    </p>
                    <p className="mt-1 text-meta tabular-nums text-muted-foreground">
                        邀约 {firstInvited} → {finalInvited} 份
                    </p>
                </div>

                <div className="min-w-0 rounded-control border border-border bg-card p-3.5">
                    <p className="text-meta text-muted-foreground">有效答卷转化率</p>
                    <div className="mt-1.5 flex flex-wrap items-baseline gap-2 tabular-nums">
                        <span className="text-section-title font-bold text-foreground">{formatStatistic(finalRate, 1)}%</span>
                        <StatusBadge intent={rateDelta >= 0 ? "success" : "warning"}>
                            {rateDelta >= 0 ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
                            {rateDelta >= 0 ? "+" : ""}{formatStatistic(rateDelta, 1)} pp
                        </StatusBadge>
                    </div>
                    <p className="mt-1 text-meta tabular-nums text-muted-foreground">首轮 {formatStatistic(firstRate, 1)}%</p>
                </div>

                <div className="min-w-0 rounded-control border border-border bg-card p-3.5">
                    <p className="text-meta text-muted-foreground">最大客群结构偏差</p>
                    <div className="mt-1.5 flex flex-wrap items-baseline gap-2 tabular-nums">
                        <span className="text-section-title font-bold text-foreground">
                            {finalBias !== null ? `${formatStatistic(finalBias, 1)} pp` : "—"}
                        </span>
                        {biasDelta !== null && (
                            <StatusBadge intent={biasDelta <= 0 ? "success" : "warning"}>
                                {biasDelta > 0 ? "+" : ""}{formatStatistic(biasDelta, 1)} pp
                            </StatusBadge>
                        )}
                    </div>
                    <p className="mt-1 text-meta tabular-nums text-muted-foreground">
                        首轮 {firstBias !== null ? `${formatStatistic(firstBias, 1)} pp` : "—"}
                    </p>
                </div>

                <div className="min-w-0 rounded-control border border-border bg-card p-3.5">
                    <p className="text-meta text-muted-foreground">主指标估计标准误 SE</p>
                    <div className="mt-1.5 flex flex-wrap items-baseline gap-2 tabular-nums">
                        <span className="break-words text-section-title font-bold text-foreground">
                            {finalSe !== null ? formatSeWithUnit(finalSe, finalWave.unitLabel) : "—"}
                        </span>
                        {seDeltaPct !== null && (
                            <StatusBadge intent={seDeltaPct <= 0 ? "success" : "warning"}>
                                {seDeltaPct > 0 ? "+" : ""}{formatStatistic(seDeltaPct, 0)}%
                            </StatusBadge>
                        )}
                    </div>
                    <p className="mt-1 break-words text-meta tabular-nums text-muted-foreground">
                        首轮 {firstSe !== null ? formatSeWithUnit(firstSe, firstWave.unitLabel ?? finalWave.unitLabel) : "—"}
                    </p>
                </div>
            </div>
        </div>
    );
}
