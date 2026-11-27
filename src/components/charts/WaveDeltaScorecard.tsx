import { useMemo } from "react";
import { ArrowRight, CheckCircle2, TrendingDown, TrendingUp } from "lucide-react";
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
} from "./echarts-theme";

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

function clampScore(value: number): number {
    return Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0;
}

function escapeHtml(value: string): string {
    return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

export function WaveDeltaScorecard({
    firstWave,
    finalWave,
    targetSampleSize,
}: {
    firstWave: WaveSnapshotMetric;
    finalWave: WaveSnapshotMetric;
    targetSampleSize?: number | null;
}) {
    const firstRate = Number.isFinite(firstWave.effectiveRatePct)
        ? Math.max(0, Math.min(100, firstWave.effectiveRatePct))
        : 0;
    const finalRate = Number.isFinite(finalWave.effectiveRatePct)
        ? Math.max(0, Math.min(100, finalWave.effectiveRatePct))
        : 0;
    const rateDelta = finalRate - firstRate;

    const firstBias =
        firstWave.maxStratumBiasPp !== null && Number.isFinite(firstWave.maxStratumBiasPp) && firstWave.maxStratumBiasPp >= 0
            ? firstWave.maxStratumBiasPp
            : null;
    const finalBias =
        finalWave.maxStratumBiasPp !== null && Number.isFinite(finalWave.maxStratumBiasPp) && finalWave.maxStratumBiasPp >= 0
            ? finalWave.maxStratumBiasPp
            : null;
    const rawBiasDelta = firstBias !== null && finalBias !== null ? finalBias - firstBias : null;
    const biasDelta = rawBiasDelta !== null && Number.isFinite(rawBiasDelta) ? rawBiasDelta : null;

    const firstSe =
        firstWave.primaryStandardError !== null && Number.isFinite(firstWave.primaryStandardError) && firstWave.primaryStandardError >= 0
            ? firstWave.primaryStandardError
            : null;
    const finalSe =
        finalWave.primaryStandardError !== null && Number.isFinite(finalWave.primaryStandardError) && finalWave.primaryStandardError >= 0
            ? finalWave.primaryStandardError
            : null;
    const rawSeDeltaPct =
        firstSe !== null && finalSe !== null && firstSe > 0 ? ((finalSe - firstSe) / firstSe) * 100 : null;
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

    const sampleBenchmark =
        targetSampleSize != null && Number.isFinite(targetSampleSize) && targetSampleSize > 0
            ? targetSampleSize
            : Math.max(1, firstValid, finalValid);
    const firstSampleScore = clampScore((firstValid / sampleBenchmark) * 100);
    const finalSampleScore = clampScore((finalValid / sampleBenchmark) * 100);

    const firstBalanceScore = firstBias !== null ? clampScore(100 - firstBias) : 100;
    const finalBalanceScore = finalBias !== null ? clampScore(100 - finalBias) : 100;

    const [firstPrecisionScore, finalPrecisionScore] = (() => {
        if (firstSe === null && finalSe === null) return [50, 50] as const;
        const maxSe = Math.max(firstSe ?? 0, finalSe ?? 0);
        if (!Number.isFinite(maxSe) || maxSe <= 0) return [100, 100] as const;
        const ceiling = maxSe * 1.4;
        const s1 = firstSe !== null ? clampScore((1 - firstSe / ceiling) * 100) : 50;
        const s2 = finalSe !== null ? clampScore((1 - finalSe / ceiling) * 100) : 50;
        return [s1, s2] as const;
    })();

    const firstSeriesName = `Wave ${firstWave.waveNumber} 试投`;
    const finalSeriesName = `Wave ${finalWave.waveNumber} 正式投放`;

    const dimensionMeta = [
        {
            name: "有效样本达标度",
            firstScore: Number(firstSampleScore.toFixed(1)),
            finalScore: Number(finalSampleScore.toFixed(1)),
            firstRaw: `${firstValid} 份`,
            finalRaw: `${finalValid} 份`,
        },
        {
            name: "有效转化率 %",
            firstScore: Number(firstRate.toFixed(1)),
            finalScore: Number(finalRate.toFixed(1)),
            firstRaw: `${formatStatistic(firstRate, 1)}%`,
            finalRaw: `${formatStatistic(finalRate, 1)}%`,
        },
        {
            name: "客群结构均衡度",
            firstScore: Number(firstBalanceScore.toFixed(1)),
            finalScore: Number(finalBalanceScore.toFixed(1)),
            firstRaw: firstBias !== null ? `${formatStatistic(100 - firstBias, 1)}（偏差 ${formatStatistic(firstBias, 1)} pp）` : "无分层偏差",
            finalRaw: finalBias !== null ? `${formatStatistic(100 - finalBias, 1)}（偏差 ${formatStatistic(finalBias, 1)} pp）` : "无分层偏差",
        },
        {
            name: "精度提升幅度",
            firstScore: Number(firstPrecisionScore.toFixed(1)),
            finalScore: Number(finalPrecisionScore.toFixed(1)),
            firstRaw: firstSe !== null ? `SE ${formatSeWithUnit(firstSe, firstWave.unitLabel ?? finalWave.unitLabel)}` : "—",
            finalRaw: finalSe !== null ? `SE ${formatSeWithUnit(finalSe, finalWave.unitLabel)}` : "—",
        },
    ];

    const { radarOption, groupedBarOption } = useMemo(() => {
        const tokens = getExecutiveChartTokens();

        const builtRadarOption: EChartsCoreOption = {
            legend: buildExecutiveLegend(
                {
                    top: 0,
                    left: 0,
                    right: "auto",
                    data: [firstSeriesName, finalSeriesName],
                },
                tokens,
            ),
            tooltip: buildExecutiveTooltip(
                {
                    trigger: "item",
                    formatter: () => {
                        const rowsHtml = dimensionMeta
                            .map(
                                (d) =>
                                    `<div style="margin-top:4px;"><div style="color:${tokens.mutedForeground};">${escapeHtml(d.name)}</div><div style="display:flex;justify-content:space-between;gap:12px;"><span>${escapeHtml(firstSeriesName)}: <strong>${escapeHtml(d.firstRaw)}</strong></span><span style="color:${tokens.primary};">${escapeHtml(finalSeriesName)}: <strong>${escapeHtml(d.finalRaw)}</strong></span></div></div>`,
                            )
                            .join("");
                        return `<div style="min-width:236px;"><div style="font-weight:600;color:${tokens.foreground};border-bottom:1px solid ${tokens.border};padding-bottom:4px;">多维质量跃升雷达对比</div>${rowsHtml}</div>`;
                    },
                },
                tokens,
            ),
            radar: {
                center: ["50%", "56%"],
                radius: "58%",
                splitNumber: 4,
                axisName: {
                    color: tokens.foreground,
                    fontFamily: CHART_FONT_FAMILY,
                    fontSize: 12,
                },
                splitLine: {
                    lineStyle: { color: tokens.border },
                },
                splitArea: {
                    areaStyle: { color: [tokens.card, tokens.background] },
                },
                axisLine: {
                    lineStyle: { color: tokens.border },
                },
                indicator: dimensionMeta.map((d) => ({
                    name: d.name,
                    max: 100,
                })),
            },
            series: [
                {
                    name: "多轮调研调优雷达",
                    type: "radar",
                    symbolSize: 6,
                    data: [
                        {
                            name: firstSeriesName,
                            value: dimensionMeta.map((d) => d.firstScore),
                            lineStyle: {
                                color: tokens.chart1,
                                width: 2,
                                type: "dashed",
                            },
                            itemStyle: { color: tokens.chart1 },
                            areaStyle: { color: tokens.muted, opacity: 0.5 },
                        },
                        {
                            name: finalSeriesName,
                            value: dimensionMeta.map((d) => d.finalScore),
                            lineStyle: {
                                color: tokens.chart2,
                                width: 2.5,
                            },
                            itemStyle: { color: tokens.chart2 },
                            areaStyle: { color: tokens.primaryMuted, opacity: 0.65 },
                        },
                    ],
                },
            ],
        };

        const builtGroupedBarOption: EChartsCoreOption = {
            legend: buildExecutiveLegend(
                {
                    top: 0,
                    left: 0,
                    right: "auto",
                    data: [firstSeriesName, finalSeriesName],
                },
                tokens,
            ),
            grid: buildExecutiveGrid({
                top: 38,
                left: 8,
                right: 22,
                bottom: 8,
            }),
            tooltip: buildExecutiveTooltip(
                {
                    trigger: "axis",
                    formatter: (params: unknown) => {
                        const list = Array.isArray(params) ? params : [params];
                        const first = list[0] as { dataIndex?: number } | undefined;
                        const dim = dimensionMeta[first?.dataIndex ?? 0];
                        if (!dim) return "";
                        const scoreDiff = dim.finalScore - dim.firstScore;
                        return [
                            `<div style="min-width:210px;">`,
                            `<div style="font-weight:600;color:${tokens.foreground};margin-bottom:4px;">${escapeHtml(dim.name)}</div>`,
                            `<div style="display:flex;justify-content:space-between;gap:12px;"><span>${escapeHtml(firstSeriesName)}</span><strong>${dim.firstScore} 分（${escapeHtml(dim.firstRaw)}）</strong></div>`,
                            `<div style="display:flex;justify-content:space-between;gap:12px;"><span>${escapeHtml(finalSeriesName)}</span><strong style="color:${tokens.primary};">${dim.finalScore} 分（${escapeHtml(dim.finalRaw)}）</strong></div>`,
                            `<div style="margin-top:4px;padding-top:4px;border-top:1px dashed ${tokens.border};display:flex;justify-content:space-between;gap:12px;"><span>综合指数变化</span><strong style="color:${scoreDiff >= 0 ? tokens.success : tokens.warning};">${scoreDiff >= 0 ? "+" : ""}${formatStatistic(scoreDiff, 1)} 分</strong></div>`,
                            `</div>`,
                        ].join("");
                    },
                },
                tokens,
            ),
            xAxis: buildExecutiveValueAxis(
                {
                    min: 0,
                    max: 100,
                    interval: 25,
                },
                tokens,
            ),
            yAxis: buildExecutiveCategoryAxis(
                {
                    inverse: true,
                    data: dimensionMeta.map((d) => d.name),
                    axisLabel: {
                        color: tokens.foreground,
                        fontWeight: 500,
                    },
                },
                tokens,
            ),
            series: [
                {
                    name: firstSeriesName,
                    type: "bar",
                    barMaxWidth: 12,
                    barGap: "24%",
                    itemStyle: {
                        color: tokens.chart1,
                        borderRadius: [0, 4, 4, 0],
                    },
                    data: dimensionMeta.map((d) => d.firstScore),
                },
                {
                    name: finalSeriesName,
                    type: "bar",
                    barMaxWidth: 12,
                    itemStyle: {
                        color: tokens.chart2,
                        borderRadius: [0, 4, 4, 0],
                    },
                    data: dimensionMeta.map((d) => d.finalScore),
                },
            ],
        };

        return {
            radarOption: builtRadarOption,
            groupedBarOption: builtGroupedBarOption,
        };
    }, [dimensionMeta, firstSeriesName, finalSeriesName]);

    return (
        <div className="rounded-surface border border-border bg-card p-5" data-testid="wave-delta-scorecard">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                    <CheckCircle2 className="h-5 w-5 shrink-0 text-primary" />
                    <h3 className="text-subheading font-medium text-foreground">
                        多轮调研调优演进对比（Wave {firstWave.waveNumber} 试投 → Wave {finalWave.waveNumber} 正式投放）
                    </h3>
                </div>
                <div className="flex flex-wrap items-center gap-2 rounded-pill bg-muted px-3 py-1 text-meta font-medium text-foreground">
                    <span>{firstWave.methodLabel}</span>
                    <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span>{finalWave.methodLabel}</span>
                </div>
            </div>

            <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,10.5rem),1fr))] gap-3">
                <div className="min-w-0 rounded-surface bg-muted p-3.5">
                    <p className="text-meta text-muted-foreground">质检后有效样本量</p>
                    <p className="mt-1.5 break-words text-section-title font-medium tabular-nums text-foreground">
                        {firstValid} <span className="text-meta font-normal text-muted-foreground">→</span> {finalValid} 份
                    </p>
                    <p className="mt-1 text-meta tabular-nums text-muted-foreground">
                        邀约 {firstInvited} → {finalInvited} 份
                    </p>
                </div>

                <div className="min-w-0 rounded-surface bg-muted p-3.5">
                    <p className="text-meta text-muted-foreground">有效答卷转化率</p>
                    <div className="mt-1.5 flex flex-wrap items-baseline gap-2 tabular-nums">
                        <span className="text-section-title font-medium text-foreground">{formatStatistic(finalRate, 1)}%</span>
                        <StatusBadge intent={rateDelta >= 0 ? "success" : "warning"}>
                            {rateDelta >= 0 ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
                            {rateDelta >= 0 ? "+" : ""}{formatStatistic(rateDelta, 1)} pp
                        </StatusBadge>
                    </div>
                    <p className="mt-1 text-meta tabular-nums text-muted-foreground">首轮 {formatStatistic(firstRate, 1)}%</p>
                </div>

                <div className="min-w-0 rounded-surface bg-muted p-3.5">
                    <p className="text-meta text-muted-foreground">最大客群结构偏差</p>
                    <div className="mt-1.5 flex flex-wrap items-baseline gap-2 tabular-nums">
                        <span className="text-section-title font-medium text-foreground">
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

                <div className="min-w-0 rounded-surface bg-muted p-3.5">
                    <p className="text-meta text-muted-foreground">主指标估计标准误 SE</p>
                    <div className="mt-1.5 flex flex-wrap items-baseline gap-2 tabular-nums">
                        <span className="break-words text-section-title font-medium text-foreground">
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

            <div className="mt-4 grid grid-cols-[repeat(auto-fit,minmax(min(100%,16.5rem),1fr))] items-center gap-4 border-t border-border pt-4">
                <div className="min-w-0">
                    <p className="mb-1 text-meta font-medium text-muted-foreground">四维调研质量跃升雷达（0–100 标准化指数）</p>
                    <EChartBox
                        option={radarOption}
                        height={232}
                        fallbackWidth={340}
                        ariaLabel="首轮试投与正式投放四维质量改进雷达图"
                        testId="wave-delta-radar-echart"
                        srSummary={
                            <table aria-label="多轮调研四维质量演进对照表">
                                <thead>
                                    <tr>
                                        <th scope="col">评价维度</th>
                                        <th scope="col">{firstSeriesName}</th>
                                        <th scope="col">{finalSeriesName}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {dimensionMeta.map((dim) => (
                                        <tr key={dim.name}>
                                            <th scope="row">{dim.name}</th>
                                            <td>{dim.firstRaw}（指数 {dim.firstScore}）</td>
                                            <td>{dim.finalRaw}（指数 {dim.finalScore}）</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        }
                    />
                </div>
                <div className="min-w-0">
                    <p className="mb-1 text-meta font-medium text-muted-foreground">分维度标准化得分演进对比</p>
                    <EChartBox
                        option={groupedBarOption}
                        height={232}
                        fallbackWidth={360}
                        ariaLabel="首轮试投与正式投放四维标准化得分分组柱状图"
                        testId="wave-delta-bar-echart"
                    />
                </div>
            </div>
        </div>
    );
}
