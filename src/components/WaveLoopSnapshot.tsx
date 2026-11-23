import { useState } from "react";
import { ClipboardCheck, Layers, ShieldCheck, Sparkles } from "lucide-react";
import { StatusBadge } from "@/components/StatusBadge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ConfidenceIntervalPlot } from "@/components/charts/ConfidenceIntervalPlot";
import { FieldworkFunnelChart } from "@/components/charts/FieldworkFunnelChart";
import { StratumComparisonChart } from "@/components/charts/StratumComparisonChart";
import { WaveDeltaScorecard, type WaveSnapshotMetric } from "@/components/charts/WaveDeltaScorecard";
import type { ExperimentWaveView } from "@/domain/experiment/types";
import type {
    AdjustmentActionKey,
    AdjustmentIssueKey,
    AdjustmentPlan,
    MethodFieldworkDiagnostics,
} from "@/domain/fieldwork";
import type { ResolvedAnalysisTarget } from "@/lib/analysis-target";
import { SAMPLING_METHODS, type SamplingMethod } from "@/lib/sampling-policy";

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
    const diag = wave.diagnostics[method];
    if (!diag) return null;
    const cleanedEst = diag.estimates.find((e) => e.key === "cleaned_design");
    const isPct = unitLabel === "%";
    const scale = isPct ? 100 : 1;
    return {
        waveNumber: wave.waveNumber,
        label: wave.label,
        methodLabel: METHOD_NAMES[method],
        invitedCount: diag.invitedCount,
        validCount: diag.cleanedValidCount,
        effectiveRatePct: diag.effectiveRatePct,
        invalidCleanedCount: Math.max(0, diag.completedRawCount - diag.cleanedValidCount),
        maxStratumBiasPp: diag.maxStratumBiasPp,
        primaryStandardError: cleanedEst?.standardError != null ? cleanedEst.standardError * scale : null,
        unitLabel,
    };
}

function renderWaveMethodDiagnostics(
    diag: MethodFieldworkDiagnostics,
    targetKind?: "mean" | "proportion",
    unitLabel?: string,
) {
    const isPct = targetKind === "proportion";
    return (
        <div className="space-y-4">
            <FieldworkFunnelChart
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

            {diag.stratumField && diag.strata.length > 0 && (
                <StratumComparisonChart
                    stratumField={diag.stratumField}
                    rows={diag.strata}
                />
            )}

            {diag.estimates.length > 0 && (
                <ConfidenceIntervalPlot
                    title="多口径点估计与置信区间森林对比图"
                    subtitle="同屏检验废卷清洗前后、客群无回答权重校准后与完整入样基准的估计差异"
                    populationValue={diag.populationTruth}
                    isPercentage={isPct}
                    unit={unitLabel ?? ""}
                    rows={diag.estimates.map((item) => ({
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
    const effectiveUnit = analysisTarget?.target.kind === "proportion" ? "%" : unitLabel;

    const firstMetric = firstWave ? buildWaveSnapshotMetric(firstWave, "simple", effectiveUnit) ?? buildWaveSnapshotMetric(firstWave, undefined, effectiveUnit) : null;
    const finalMetric = finalWave ? buildWaveSnapshotMetric(finalWave, undefined, effectiveUnit) : null;

    const [selectedWave, setSelectedWave] = useState<string>(() => String(finalWave?.waveNumber ?? firstWave?.waveNumber ?? 1));

    return (
        <div className="space-y-5" data-testid="wave-loop-snapshot">
            {firstMetric && finalMetric && firstMetric.waveNumber !== finalMetric.waveNumber && (
                <WaveDeltaScorecard firstWave={firstMetric} finalWave={finalMetric} />
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
                                {adjustmentPlan.identifiedIssues.map((issue) => (
                                    <StatusBadge key={issue} intent="warning" className="whitespace-normal text-left">
                                        {ADJUSTMENT_ISSUE_LABELS[issue] ?? issue}
                                    </StatusBadge>
                                ))}
                            </div>
                        </div>
                        <div className="min-w-0 space-y-2">
                            <p className="text-meta font-semibold text-muted-foreground">正式轮采取的调优动作</p>
                            <div className="flex flex-wrap gap-1.5">
                                {adjustmentPlan.plannedActions.map((action) => (
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
                <Tabs value={selectedWave} onValueChange={setSelectedWave} className="space-y-4">
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
                                            {wave.cleaningConfig.removeSpeeders ? "剔除闪电卷" : "保留闪电卷"} ·{" "}
                                            {wave.cleaningConfig.removeStraightliners ? "剔除直线卷" : "保留直线卷"}
                                        </span>
                                    </div>
                                </div>

                                {diagMethods.length === 0 ? (
                                    <div className="rounded-surface border border-border bg-card p-6 text-center text-label text-muted-foreground">
                                        该波次尚未执行虚拟问卷发放
                                    </div>
                                ) : diagMethods.length === 1 ? (
                                    renderWaveMethodDiagnostics(
                                        wave.diagnostics[diagMethods[0]!]!,
                                        analysisTarget?.target.kind,
                                        unitLabel,
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
                                                    wave.diagnostics[m]!,
                                                    analysisTarget?.target.kind,
                                                    unitLabel,
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
