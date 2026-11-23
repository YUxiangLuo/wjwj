import { useEffect, useMemo, useState } from "react";
import { ClipboardCheck, Layers, ShieldCheck, Sparkles, TrendingUp } from "lucide-react";
import { StatusBadge } from "@/components/StatusBadge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ConfidenceIntervalPlot } from "@/components/charts/ConfidenceIntervalPlot";
import { EChartBox } from "@/components/charts/EChartBox";
import type { EChartsCoreOption } from "@/components/charts/echarts-core";
import {
    buildExecutiveCategoryAxis,
    buildExecutiveGrid,
    buildExecutiveLegend,
    buildExecutiveTooltip,
    buildExecutiveValueAxis,
    getExecutiveChartTokens,
} from "@/components/charts/echarts-theme";
import { FieldworkFunnelChart } from "@/components/charts/FieldworkFunnelChart";
import { StratumComparisonChart } from "@/components/charts/StratumComparisonChart";
import { WaveDeltaScorecard, type WaveSnapshotMetric } from "@/components/charts/WaveDeltaScorecard";
import type { ExperimentWaveView } from "@/domain/experiment/types";
import type { QuestionnaireData } from "@/lib/questionnaire-types";
import {
    resolveCleaningConfig,
    type AdjustmentActionKey,
    type AdjustmentIssueKey,
    type AdjustmentPlan,
    type MethodFieldworkDiagnostics,
} from "@/domain/fieldwork";
import type { ResolvedAnalysisTarget } from "@/lib/analysis-target";
import { SAMPLING_METHODS, type SamplingMethod } from "@/lib/sampling-policy";
import { formatStatistic } from "@/utils/statistic-format";

function escapeHtml(value: string): string {
    return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

export function inferTargetUnitFromExperiment(params: {
    analysisTarget?: ResolvedAnalysisTarget | null;
    explicitUnit?: string | null;
    waves?: ExperimentWaveView[] | null;
    questionnaire?: QuestionnaireData | null;
}): string {
    if (params.analysisTarget?.target.kind === "proportion") return "%";
    const explicit = params.explicitUnit?.trim();
    if (explicit) return explicit;
    const targetField = params.analysisTarget?.target.field;
    const questionnaires: Array<QuestionnaireData | null | undefined> = [
        ...(params.waves ?? []).map((w) => w.questionnaire),
        params.questionnaire,
    ];
    if (targetField) {
        for (const qData of questionnaires) {
            for (const q of qData?.questions ?? []) {
                const boundToTarget = q.variableBinding?.mappings?.some((m) => m.field === targetField);
                if (boundToTarget && q.unit?.trim()) {
                    return q.unit.trim();
                }
            }
        }
    }
    return "";
}

export const ADJUSTMENT_ISSUE_LABELS: Record<AdjustmentIssueKey, string> = {
    unit_nonresponse_gap: "单元拒访/失联导致有效样本不足",
    stratum_response_bias: "细分客群差异化拒访引发样本结构偏倚",
    careless_responses: "闪电敷衍卷与直线作答污染原始估计",
    questionnaire_burden_or_range: "问卷题量过长中途弃答或数值上下限截断真实值",
    periodic_or_frame_risk: "抽样框周期性波动或规模异质性导致方差偏大",
    unmeasured_variables: "部分业务分析指标未与问卷题目建立测量绑定",
};

export const ADJUSTMENT_ACTION_LABELS: Record<AdjustmentActionKey, string> = {
    revise_questionnaire: "精简修订问卷结构、修复数值量程并补齐变量绑定",
    recalibrate_sample_size: "代入首轮实测有效回收率与样本方差重算样本量",
    upgrade_sampling_design: "升级抽样方法或调整低响应客群分层配额",
    apply_nonresponse_weighting: "采用基于抽样框客群规模的事后分层无回答权重校准",
};

const METHOD_NAMES: Record<SamplingMethod, string> = {
    simple: "简单随机抽样",
    stratified: "分层抽样",
    pps: "PPS抽样",
    systematic: "系统抽样",
};

function pickPrimaryWaveMethod(wave: ExperimentWaveView): SamplingMethod | null {
    const preferredOrder: SamplingMethod[] = ["stratified", "pps", "systematic", "simple"];
    for (const m of preferredOrder) {
        if (wave.diagnostics?.[m]) return m;
    }
    return null;
}

export function buildWaveSnapshotMetric(
    wave: ExperimentWaveView,
    preferredMethod?: SamplingMethod,
    unitLabel?: string,
): WaveSnapshotMetric | null {
    const method = (preferredMethod && wave.diagnostics?.[preferredMethod] ? preferredMethod : pickPrimaryWaveMethod(wave));
    if (!method) return null;
    const diag = wave.diagnostics?.[method];
    if (!diag) return null;
    const cleanedEst = (diag.estimates ?? []).find((e) => e.key === "cleaned_design");
    const isPct = unitLabel === "%";
    const scale = isPct ? 100 : 1;
    const rawSe = cleanedEst?.standardError;
    return {
        waveNumber: wave.waveNumber,
        label: wave.label,
        methodLabel: METHOD_NAMES[method],
        invitedCount: diag.invitedCount,
        validCount: diag.cleanedValidCount,
        effectiveRatePct: diag.effectiveRatePct,
        invalidCleanedCount: Math.max(0, diag.completedRawCount - diag.cleanedValidCount),
        maxStratumBiasPp: diag.maxStratumBiasPp,
        primaryStandardError: rawSe != null && Number.isFinite(rawSe) ? rawSe * scale : null,
        unitLabel,
    };
}

function WaveProgressionChart({ metrics }: { metrics: WaveSnapshotMetric[] }) {
    const hasStratumBias = metrics.some(
        (m) => m.maxStratumBiasPp !== null && Number.isFinite(m.maxStratumBiasPp),
    );

    const progressionOption = useMemo<EChartsCoreOption>(() => {
        const tokens = getExecutiveChartTokens();
        const legendItems = [
            "入样发放量",
            "质检有效样本量",
            "有效转化率 (%)",
            ...(hasStratumBias ? ["客群结构均衡度 (%)"] : []),
        ];

        return {
            legend: buildExecutiveLegend(
                {
                    top: 0,
                    left: 0,
                    right: "auto",
                    data: legendItems,
                },
                tokens,
            ),
            grid: buildExecutiveGrid({
                top: 54,
                left: 12,
                right: 16,
                bottom: 10,
            }),
            tooltip: buildExecutiveTooltip(
                {
                    trigger: "axis",
                    formatter: (params: unknown) => {
                        const list = Array.isArray(params) ? params : [params];
                        const first = list[0] as { dataIndex?: number } | undefined;
                        const item = metrics[first?.dataIndex ?? 0];
                        if (!item) return "";
                        const safeInvited = Number.isFinite(item.invitedCount) ? Math.max(0, item.invitedCount) : 0;
                        const safeValid = Number.isFinite(item.validCount) ? Math.max(0, item.validCount) : 0;
                        const safeCleaned = Number.isFinite(item.invalidCleanedCount) ? Math.max(0, item.invalidCleanedCount) : 0;
                        const safeRate = Number.isFinite(item.effectiveRatePct) ? Math.max(0, Math.min(100, item.effectiveRatePct)) : 0;
                        const cleanUnit = item.unitLabel?.trim() ?? "";
                        const seStr =
                            item.primaryStandardError !== null && Number.isFinite(item.primaryStandardError)
                                ? `${formatStatistic(item.primaryStandardError, 2)}${cleanUnit === "%" ? "%" : cleanUnit ? ` ${cleanUnit}` : ""}`
                                : "—";

                        return [
                            `<div style="min-width:220px;">`,
                            `<div style="font-weight:600;color:${tokens.foreground};margin-bottom:4px;">Wave ${item.waveNumber} · ${escapeHtml(item.methodLabel)}</div>`,
                            `<div style="display:flex;justify-content:space-between;gap:12px;"><span>入样发放量</span><strong>${safeInvited} 份</strong></div>`,
                            `<div style="display:flex;justify-content:space-between;gap:12px;"><span>质检有效样本量</span><strong style="color:${tokens.primary};">${safeValid} 份</strong></div>`,
                            `<div style="display:flex;justify-content:space-between;gap:12px;"><span>清洗剔除废卷</span><strong>${safeCleaned} 份</strong></div>`,
                            `<div style="display:flex;justify-content:space-between;gap:12px;"><span>有效转化率</span><strong style="color:${tokens.success};">${formatStatistic(safeRate, 1)}%</strong></div>`,
                            item.maxStratumBiasPp !== null && Number.isFinite(item.maxStratumBiasPp)
                                ? `<div style="display:flex;justify-content:space-between;gap:12px;"><span>最大客群结构偏差</span><strong>${formatStatistic(item.maxStratumBiasPp, 1)} pp</strong></div>`
                                : "",
                            `<div style="margin-top:4px;padding-top:4px;border-top:1px dashed ${tokens.border};display:flex;justify-content:space-between;gap:12px;"><span>主指标标准误 SE</span><strong>${escapeHtml(seStr)}</strong></div>`,
                            `</div>`,
                        ].join("");
                    },
                },
                tokens,
            ),
            xAxis: buildExecutiveCategoryAxis(
                {
                    data: metrics.map((m) => `Wave ${m.waveNumber}（${m.methodLabel}）`),
                    axisLabel: {
                        color: tokens.foreground,
                        fontWeight: 500,
                    },
                },
                tokens,
            ),
            yAxis: [
                buildExecutiveValueAxis(
                    {
                        name: "样本量 (份)",
                        min: 0,
                        splitNumber: 4,
                    },
                    tokens,
                ),
                buildExecutiveValueAxis(
                    {
                        name: "比率 (%)",
                        nameGap: 12,
                        min: 0,
                        max: 100,
                        interval: 25,
                        splitLine: { show: false },
                        axisLabel: { formatter: "{value}%" },
                    },
                    tokens,
                ),
            ],
            series: [
                {
                    name: "入样发放量",
                    type: "bar",
                    yAxisIndex: 0,
                    barMaxWidth: 26,
                    barGap: "18%",
                    itemStyle: {
                        color: tokens.chart1,
                        borderRadius: [4, 4, 0, 0],
                    },
                    data: metrics.map((m) => (Number.isFinite(m.invitedCount) ? Math.max(0, m.invitedCount) : 0)),
                },
                {
                    name: "质检有效样本量",
                    type: "bar",
                    yAxisIndex: 0,
                    barMaxWidth: 26,
                    itemStyle: {
                        color: tokens.chart2,
                        borderRadius: [4, 4, 0, 0],
                    },
                    data: metrics.map((m) => (Number.isFinite(m.validCount) ? Math.max(0, m.validCount) : 0)),
                },
                {
                    name: "有效转化率 (%)",
                    type: "line",
                    yAxisIndex: 1,
                    smooth: 0.25,
                    symbol: "circle",
                    symbolSize: 8,
                    lineStyle: {
                        color: tokens.chart7,
                        width: 2.5,
                    },
                    itemStyle: {
                        color: tokens.chart7,
                        borderColor: tokens.card,
                        borderWidth: 2,
                    },
                    data: metrics.map((m) =>
                        Number.isFinite(m.effectiveRatePct)
                            ? Number(Math.max(0, Math.min(100, m.effectiveRatePct)).toFixed(1))
                            : 0,
                    ),
                },
                ...(hasStratumBias
                    ? [
                          {
                              name: "客群结构均衡度 (%)",
                              type: "line" as const,
                              yAxisIndex: 1,
                              smooth: 0.25,
                              symbol: "diamond",
                              symbolSize: 8,
                              connectNulls: true,
                              lineStyle: {
                                  color: tokens.chart4,
                                  width: 2,
                                  type: "dashed" as const,
                              },
                              itemStyle: {
                                  color: tokens.chart4,
                                  borderColor: tokens.card,
                                  borderWidth: 2,
                              },
                              data: metrics.map((m) =>
                                  m.maxStratumBiasPp !== null && Number.isFinite(m.maxStratumBiasPp)
                                      ? Number(Math.max(0, Math.min(100, 100 - m.maxStratumBiasPp)).toFixed(1))
                                      : null,
                              ),
                          },
                      ]
                    : []),
            ],
        };
    }, [metrics, hasStratumBias]);

    return (
        <section className="rounded-surface border border-border bg-card p-5" data-testid="wave-progression-chart">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
                <div className="flex items-center gap-2">
                    <TrendingUp className="h-5 w-5 text-primary" />
                    <div>
                        <h3 className="text-subheading font-semibold text-foreground">逐波次样本规模与调查质量演进轨迹</h3>
                        <p className="text-meta text-muted-foreground">追踪各轮抽样方法升级后的发放量、质检有效回收量与客群结构均衡度演进</p>
                    </div>
                </div>
                <StatusBadge intent="info">共 {metrics.length} 个实证波次</StatusBadge>
            </div>
            <EChartBox
                option={progressionOption}
                height={244}
                fallbackWidth={620}
                ariaLabel="多波次样本规模、有效转化率与客群结构均衡度演进趋势图"
                testId="wave-progression-echart"
                srSummary={
                    <table aria-label="逐波次样本规模与调查质量演进数据表">
                        <thead>
                            <tr>
                                <th scope="col">波次</th>
                                <th scope="col">抽样方法</th>
                                <th scope="col">入样发放量</th>
                                <th scope="col">质检有效量</th>
                                <th scope="col">有效转化率</th>
                                <th scope="col">最大客群偏差</th>
                            </tr>
                        </thead>
                        <tbody>
                            {metrics.map((m) => (
                                <tr key={m.waveNumber}>
                                    <th scope="row">第 {m.waveNumber} 波次</th>
                                    <td>方案：{m.methodLabel}</td>
                                    <td>{m.invitedCount} 份</td>
                                    <td>{m.validCount} 份</td>
                                    <td>{formatStatistic(m.effectiveRatePct, 1)}%</td>
                                    <td>{m.maxStratumBiasPp !== null ? `${formatStatistic(m.maxStratumBiasPp, 1)} pp` : "—"}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                }
            />
        </section>
    );
}

function renderWaveMethodDiagnostics(
    diag: MethodFieldworkDiagnostics,
    targetKind?: "mean" | "proportion",
    unitLabel?: string,
    targetRequiredCount?: number,
) {
    const isPct = targetKind === "proportion" || unitLabel === "%";
    return (
        <div className="space-y-4">
            <FieldworkFunnelChart
                targetRequiredCount={targetRequiredCount}
                stages={[
                    {
                        key: "invited",
                        label: "1. 入样发放邀约",
                        count: diag.invitedCount,
                        description: "按抽样方案向目标总体发出的问卷数",
                        tone: "primary",
                    },
                    {
                        key: "contacted",
                        label: "2. 成功触达受访者",
                        count: diag.contactedCount,
                        description: `未触达失联 ${diag.notContactedCount} 份`,
                        tone: "info",
                    },
                    {
                        key: "completed_raw",
                        label: "3. 原始完答回收",
                        count: diag.completedRawCount,
                        description: `拒访 ${diag.refusedCount} 份 · 中途弃答 ${diag.breakoffCount} 份`,
                        tone: "warning",
                    },
                    {
                        key: "cleaned_valid",
                        label: "4. 质检清洗有效卷",
                        count: diag.cleanedValidCount,
                        description: `识别闪电卷 ${diag.speederCount} 份 · 直线作答 ${diag.straightlinerCount} 份`,
                        tone: "success",
                    },
                ]}
                unitEffectiveCost={diag.unitEffectiveCost}
                totalEstimatedCost={diag.totalEstimatedCost}
            />

            {diag.stratumField && (diag.strata ?? []).length > 0 && (
                <StratumComparisonChart
                    stratumField={diag.stratumField}
                    rows={diag.strata}
                />
            )}

            {(diag.estimates ?? []).length > 0 && (
                <ConfidenceIntervalPlot
                    title="多口径点估计与置信区间森林对比图"
                    subtitle="同屏检验废卷清洗前后、客群无回答权重校准后与完整入样基准的估计差异"
                    populationValue={diag.populationTruth}
                    isPercentage={isPct}
                    unit={unitLabel ?? ""}
                    rows={(diag.estimates ?? []).map((item) => ({
                        key: item.key,
                        label: item.label,
                        sublabel: `${item.description}（n=${item.sampleSize}）`,
                        estimate: item.estimate,
                        standardError: item.standardError,
                        halfWidth: item.halfWidth,
                        sampleSize: item.sampleSize,
                        tone: item.key === "cleaned_design"
                            ? "success"
                            : item.key === "nonresponse_calibrated"
                                ? "primary"
                                : item.key === "uncleaned_raw"
                                    ? "warning"
                                    : "info",
                    }))}
                />
            )}
        </div>
    );
}

export function WaveLoopSnapshot({
    waves = [],
    adjustmentPlan,
    analysisTarget,
    unitLabel = "",
}: {
    waves?: ExperimentWaveView[];
    adjustmentPlan?: AdjustmentPlan | null;
    analysisTarget?: ResolvedAnalysisTarget | null;
    unitLabel?: string;
}) {
    const firstWave = waves[0];
    const finalWave = waves.length >= 2 ? waves[waves.length - 1] : undefined;
    const effectiveUnit = inferTargetUnitFromExperiment({
        analysisTarget,
        explicitUnit: unitLabel,
        waves,
    });

    const firstMetric = firstWave ? buildWaveSnapshotMetric(firstWave, "simple", effectiveUnit) ?? buildWaveSnapshotMetric(firstWave, undefined, effectiveUnit) : null;
    const finalMetric = finalWave ? buildWaveSnapshotMetric(finalWave, undefined, effectiveUnit) : null;

    const waveProgressionMetrics = useMemo(
        () =>
            waves
                .map((wave, index) =>
                    index === 0
                        ? buildWaveSnapshotMetric(wave, "simple", effectiveUnit)
                            ?? buildWaveSnapshotMetric(wave, undefined, effectiveUnit)
                        : buildWaveSnapshotMetric(wave, undefined, effectiveUnit),
                )
                .filter((metric): metric is WaveSnapshotMetric => metric !== null),
        [waves, effectiveUnit],
    );

    const plannedTargetValid =
        finalWave?.samplePlan?.finalSampleSize != null && Number.isFinite(finalWave.samplePlan.finalSampleSize)
            ? Math.round(finalWave.samplePlan.finalSampleSize * (1 - (finalWave.samplePlan.nonResponseRate ?? 0)))
            : undefined;

    const defaultWaveKey = String(finalWave?.waveNumber ?? firstWave?.waveNumber ?? 1);
    const [selectedWave, setSelectedWave] = useState<string>(defaultWaveKey);
    const effectiveSelectedWave = waves.some((w) => String(w.waveNumber) === selectedWave)
        ? selectedWave
        : defaultWaveKey;

    useEffect(() => {
        if (waves.length > 0 && !waves.some((w) => String(w.waveNumber) === selectedWave)) {
            setSelectedWave(defaultWaveKey);
        }
    }, [waves, selectedWave, defaultWaveKey]);

    return (
        <div className="space-y-5" data-testid="wave-loop-snapshot">
            {firstMetric && finalMetric && firstMetric.waveNumber !== finalMetric.waveNumber && (
                <WaveDeltaScorecard
                    firstWave={firstMetric}
                    finalWave={finalMetric}
                    targetSampleSize={plannedTargetValid}
                />
            )}

            {waves.length >= 2 && waveProgressionMetrics.length >= 2 && (
                <WaveProgressionChart metrics={waveProgressionMetrics} />
            )}

            {adjustmentPlan && (
                <section className="rounded-surface border border-border bg-card p-5" data-testid="adjustment-plan-snapshot">
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
                        <div className="flex items-center gap-2">
                            <ClipboardCheck className="h-5 w-5 text-primary" />
                            <h3 className="text-subheading font-semibold text-foreground">阶段三 · 抽样与投放调优决策单</h3>
                        </div>
                        <StatusBadge intent="primary">闭环调优依据</StatusBadge>
                    </div>
                    <div className="grid grid-cols-[repeat(auto-fit,minmax(16rem,1fr))] gap-4">
                        <div className="min-w-0 space-y-2">
                            <p className="text-meta font-semibold text-muted-foreground">首轮试投识别的核心问题</p>
                            <div className="flex flex-wrap gap-1.5">
                                {(adjustmentPlan.identifiedIssues ?? []).map((issue) => (
                                    <StatusBadge key={issue} intent="warning" className="whitespace-normal text-left">
                                        {ADJUSTMENT_ISSUE_LABELS[issue] ?? issue}
                                    </StatusBadge>
                                ))}
                            </div>
                        </div>
                        <div className="min-w-0 space-y-2">
                            <p className="text-meta font-semibold text-muted-foreground">正式轮采取的调优动作</p>
                            <div className="flex flex-wrap gap-1.5">
                                {(adjustmentPlan.plannedActions ?? []).map((action) => (
                                    <StatusBadge key={action} intent="success" className="whitespace-normal text-left">
                                        {ADJUSTMENT_ACTION_LABELS[action] ?? action}
                                    </StatusBadge>
                                ))}
                            </div>
                        </div>
                    </div>
                    <div className="mt-4 rounded-control border border-border bg-background p-3.5">
                        <p className="text-meta font-medium text-muted-foreground">统计诊断与调优方案说明</p>
                        <p className="mt-1 whitespace-pre-line text-label leading-relaxed text-foreground">
                            {adjustmentPlan.rationale}
                        </p>
                    </div>
                </section>
            )}

            {waves.length === 0 ? (
                <div className="rounded-surface border border-dashed border-border bg-card p-8 text-center text-label text-muted-foreground">
                    暂无多波次问卷发放与质检记录
                </div>
            ) : (
                <Tabs value={effectiveSelectedWave} onValueChange={setSelectedWave} className="space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                            <Layers className="h-4 w-4 text-primary" />
                            <span className="text-subheading font-semibold text-foreground">各波次发放与质检快照</span>
                        </div>
                        <TabsList className="h-auto flex-wrap gap-1 rounded-surface border border-border bg-card p-1">
                            {waves.map((w) => (
                                <TabsTrigger key={w.waveNumber} value={String(w.waveNumber)} className="px-3.5 py-1.5 text-label">
                                    {w.label}
                                </TabsTrigger>
                            ))}
                        </TabsList>
                    </div>

                    {waves.map((wave) => {
                        const diagMethods = SAMPLING_METHODS.filter((m) => Boolean(wave.diagnostics?.[m]));
                        const cleaning = resolveCleaningConfig(wave.cleaningConfig);
                        const waveTargetValid =
                            wave.samplePlan?.finalSampleSize != null && Number.isFinite(wave.samplePlan.finalSampleSize)
                                ? Math.round(wave.samplePlan.finalSampleSize * (1 - (wave.samplePlan.nonResponseRate ?? 0)))
                                : undefined;
                        return (
                            <TabsContent key={wave.waveNumber} value={String(wave.waveNumber)} className="space-y-4">
                                <div className="flex flex-wrap items-center justify-between gap-3 rounded-surface border border-border bg-muted px-4 py-3 text-meta">
                                    <div className="flex flex-wrap items-center gap-4 text-foreground">
                                        <span>问卷题数：<strong>{wave.questionnaire?.questions?.length ?? 0} 题</strong></span>
                                        <span>规划发放量：<strong>{wave.samplePlan?.finalSampleSize ?? "—"} 份</strong></span>
                                        {wave.samplePlan?.varianceSource && (
                                            <span>
                                                方差来源：
                                                <strong>
                                                    {wave.samplePlan.varianceSource === "wave1_empirical"
                                                        ? "首轮实测样本方差"
                                                        : wave.samplePlan.varianceSource === "prior_estimate"
                                                            ? "先验经验估计"
                                                            : "抽样框总体方差"}
                                                </strong>
                                            </span>
                                        )}
                                    </div>
                                    <div className="flex flex-wrap items-center gap-2">
                                        <ShieldCheck className="h-4 w-4 text-success" />
                                        <span className="text-muted-foreground">
                                            质检规则：
                                            {cleaning.removeSpeeders ? "剔除闪电卷" : "保留闪电卷"} ·{" "}
                                            {cleaning.removeStraightliners ? "剔除直线卷" : "保留直线卷"}
                                        </span>
                                    </div>
                                </div>

                                {diagMethods.length === 0 ? (
                                    <div className="rounded-surface border border-border bg-card p-6 text-center text-label text-muted-foreground">
                                        该波次尚未执行虚拟问卷发放
                                    </div>
                                ) : diagMethods.length === 1 ? (
                                    renderWaveMethodDiagnostics(
                                        wave.diagnostics![diagMethods[0]!]!,
                                        analysisTarget?.target.kind,
                                        effectiveUnit,
                                        waveTargetValid,
                                    )
                                ) : (
                                    <Tabs defaultValue={diagMethods[0]!} className="space-y-4">
                                        <TabsList className="h-auto flex-wrap gap-1 rounded-surface border border-border bg-card p-1">
                                            {diagMethods.map((m) => (
                                                <TabsTrigger key={m} value={m} className="px-3 py-1.5 text-meta">
                                                    <Sparkles className="mr-1.5 h-3.5 w-3.5 text-primary" />
                                                    {METHOD_NAMES[m]}
                                                </TabsTrigger>
                                            ))}
                                        </TabsList>
                                        {diagMethods.map((m) => (
                                            <TabsContent key={m} value={m}>
                                                {renderWaveMethodDiagnostics(
                                                    wave.diagnostics![m]!,
                                                    analysisTarget?.target.kind,
                                                    effectiveUnit,
                                                    waveTargetValid,
                                                )}
                                            </TabsContent>
                                        ))}
                                    </Tabs>
                                )}
                            </TabsContent>
                        );
                    })}
                </Tabs>
            )}
        </div>
    );
}
