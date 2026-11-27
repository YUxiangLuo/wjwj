import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
    AlertTriangle, ArrowRight, CheckCircle2, ChevronLeft, ClipboardCheck,
    Coins, Filter, Loader2, ShieldAlert, Users
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge } from "@/components/StatusBadge";
import { KpiStatCard } from "@/components/KpiStatCard";
import { FieldworkFunnelChart } from "@/components/charts/FieldworkFunnelChart";
import { StratumComparisonChart } from "@/components/charts/StratumComparisonChart";
import { ConfidenceIntervalPlot } from "@/components/charts/ConfidenceIntervalPlot";
import { ADJUSTMENT_ACTION_LABELS, ADJUSTMENT_ISSUE_LABELS, inferTargetUnitFromExperiment } from "@/components/WaveLoopSnapshot";
import { StageActions } from "../../components/StageActions";
import { useExperiment } from "../ExperimentLayout";
import { experimentApi } from "../../api-client";
import { createApiClient } from "@/lib/api-client";
import { readExperimentDraft, useExperimentDraft } from "../../experiment/experiment-draft";
import type { VariableDictionary } from "@/domain/variables/types";
import {
    validateAdjustmentPlan,
    type AdjustmentActionKey,
    type AdjustmentIssueKey,
    type AdjustmentPlan,
    type CleaningConfig,
    type MethodFieldworkDiagnostics,
} from "@/domain/fieldwork";
import { SAMPLING_METHODS, type SamplingMethod } from "@/lib/sampling-policy";
import { formatStatistic } from "@/utils/statistic-format";

const studentClient = createApiClient("student");

const METHOD_NAMES: Record<SamplingMethod, string> = {
    simple: "简单随机抽样",
    stratified: "分层抽样",
    pps: "PPS抽样",
    systematic: "系统抽样",
};

const ALL_ISSUES: AdjustmentIssueKey[] = [
    "unit_nonresponse_gap",
    "stratum_response_bias",
    "careless_responses",
    "questionnaire_burden_or_range",
    "periodic_or_frame_risk",
    "unmeasured_variables",
];

const ALL_ACTIONS: AdjustmentActionKey[] = [
    "revise_questionnaire",
    "recalibrate_sample_size",
    "upgrade_sampling_design",
    "apply_nonresponse_weighting",
];

const DISPOSITION_BADGES: Record<string, { label: string; intent: "warning" | "destructive" | "info" | "neutral" }> = {
    careless_speeder: { label: "闪电敷衍卷", intent: "warning" },
    careless_straightliner: { label: "直线机械卷", intent: "warning" },
    breakoff: { label: "中途弃答", intent: "destructive" },
    refused: { label: "受访拒答", intent: "destructive" },
    not_contacted: { label: "渠道失联", intent: "neutral" },
};

export function FieldworkDiagnosticsStage({ onPrev }: { onPrev: () => void }) {
    const {
        experiment,
        completeStage,
        updateExperiment,
        refreshRequired,
        requireRefresh,
    } = useExperiment();

    const taskId = experiment?.taskId;
    const wave1 = useMemo(
        () => experiment?.waves?.find((w) => w.waveNumber === 1) ?? experiment?.waves?.[0] ?? null,
        [experiment?.waves],
    );
    const availableMethods = useMemo(
        () => SAMPLING_METHODS.filter((m) => Boolean(wave1?.diagnostics?.[m])),
        [wave1?.diagnostics],
    );
    const [selectedMethod, setSelectedMethod] = useState<SamplingMethod>(() => availableMethods[0] ?? "simple");

    useEffect(() => {
        if (availableMethods.length > 0 && !availableMethods.includes(selectedMethod)) {
            setSelectedMethod(availableMethods[0]!);
        }
    }, [availableMethods, selectedMethod]);

    const diag: MethodFieldworkDiagnostics | null = wave1?.diagnostics?.[selectedMethod] ?? null;
    const cleaningConfig = wave1?.cleaningConfig ?? {
        removeSpeeders: true,
        removeStraightliners: true,
        requirePrimaryTargetValid: true,
    };

    const restoredDraft = useMemo(
        () => readExperimentDraft<AdjustmentPlan>({
            experimentId: experiment?.id,
            experimentVersion: experiment?.version,
            stage: 3,
        }),
        [experiment?.id, experiment?.version],
    );

    const initialPlan = restoredDraft ?? experiment?.adjustmentPlan ?? {
        identifiedIssues: [],
        plannedActions: [],
        rationale: "",
    };

    const [identifiedIssues, setIdentifiedIssues] = useState<AdjustmentIssueKey[]>(initialPlan.identifiedIssues);
    const [plannedActions, setPlannedActions] = useState<AdjustmentActionKey[]>(initialPlan.plannedActions);
    const [rationale, setRationale] = useState<string>(initialPlan.rationale);
    const [updatingCleaning, setUpdatingCleaning] = useState(false);
    const [cleaningError, setCleaningError] = useState<string | null>(null);
    const [completing, setCompleting] = useState(false);
    const [dictionary, setDictionary] = useState<VariableDictionary | null>(null);

    const isPct = experiment?.analysisTarget?.target.kind === "proportion";
    const syncInferredUnit = useMemo(
        () => inferTargetUnitFromExperiment({
            analysisTarget: experiment?.analysisTarget,
            waves: experiment?.waves,
            questionnaire: experiment?.questionnaire,
        }),
        [experiment?.analysisTarget, experiment?.waves, experiment?.questionnaire],
    );

    useEffect(() => {
        if (!taskId || isPct || syncInferredUnit) return;
        const controller = new AbortController();
        studentClient.request<{ dictionary: VariableDictionary | null }>(`/api/student/tasks/${taskId}/variables`, { signal: controller.signal })
            .then((res) => { if (res.success) setDictionary(res.data?.dictionary ?? null); })
            .catch(() => undefined);
        return () => controller.abort();
    }, [taskId, isPct, syncInferredUnit]);

    const unitLabel = useMemo(() => {
        if (syncInferredUnit) return syncInferredUnit;
        const targetField = experiment?.analysisTarget?.target.field;
        return (targetField ? dictionary?.variables.find((v) => v.field === targetField)?.unit?.trim() : "") ?? "";
    }, [syncInferredUnit, dictionary, experiment?.analysisTarget?.target.field]);

    const draftPlan = useMemo<AdjustmentPlan>(
        () => ({ identifiedIssues, plannedActions, rationale }),
        [identifiedIssues, plannedActions, rationale],
    );
    const baselinePlan = useMemo<AdjustmentPlan>(
        () => experiment?.adjustmentPlan ?? { identifiedIssues: [], plannedActions: [], rationale: "" },
        [experiment?.adjustmentPlan],
    );

    const clearDraft = useExperimentDraft({
        experimentId: experiment?.id,
        experimentVersion: experiment?.version,
        stage: 3,
        data: draftPlan,
        baseline: baselinePlan,
        enabled: Boolean(experiment),
    });

    const handleToggleCleaning = async (patch: Partial<CleaningConfig>) => {
        if (!taskId || !experiment || updatingCleaning || refreshRequired) return;
        const nextConfig: CleaningConfig = { ...cleaningConfig, ...patch };
        setUpdatingCleaning(true);
        setCleaningError(null);
        try {
            const res = await experimentApi.updateCleaningConfig(taskId, experiment.version, nextConfig, 1);
            if (res.success && res.data) {
                updateExperiment(res.data);
                toast.success("答卷质检清洗规则已实时生效");
            } else if (res.error?.code === "VERSION_CONFLICT") {
                requireRefresh();
            } else {
                const msg = res.error?.message ?? "更新质检规则失败，请重试";
                setCleaningError(msg);
                toast.error(msg);
            }
        } catch {
            const msg = "网络连接失败，更新质检规则未成功，请重试";
            setCleaningError(msg);
            toast.error(msg);
        } finally {
            setUpdatingCleaning(false);
        }
    };

    const toggleIssue = (key: AdjustmentIssueKey) => {
        setIdentifiedIssues((prev) =>
            prev.includes(key) ? prev.filter((item) => item !== key) : [...prev, key],
        );
    };

    const toggleAction = (key: AdjustmentActionKey) => {
        setPlannedActions((prev) =>
            prev.includes(key) ? prev.filter((item) => item !== key) : [...prev, key],
        );
    };

    const handleSmartExtractFindings = () => {
        if (!diag) return;
        const autoIssues: AdjustmentIssueKey[] = [];
        const autoActions: AdjustmentActionKey[] = ["recalibrate_sample_size"];
        const notes: string[] = [];

        if (diag.empiricalNonResponseRatePct >= 15) {
            autoIssues.push("unit_nonresponse_gap");
            notes.push(`首轮实测综合无回答与废卷损耗率为 ${diag.empiricalNonResponseRatePct}%，导致有效样本仅 ${diag.cleanedValidCount} 份`);
        }
        if (diag.speederCount + diag.straightlinerCount > 0) {
            autoIssues.push("careless_responses");
            notes.push(`检出闪电敷衍卷 ${diag.speederCount} 份、直线作答卷 ${diag.straightlinerCount} 份，需保持严格质检剔除`);
        }
        if (diag.maxStratumBiasPp != null && diag.maxStratumBiasPp >= 3.5) {
            autoIssues.push("stratum_response_bias");
            autoActions.push("upgrade_sampling_design", "apply_nonresponse_weighting");
            notes.push(`细分客群（${diag.stratumField}）存在明显应答率差异，最大结构偏倚达 ${formatStatistic(diag.maxStratumBiasPp, 1)} 个百分点`);
        } else {
            autoActions.push("upgrade_sampling_design");
        }
        const hasRangeOrBreakoff = diag.questionDiagnostics.some((q) => q.rangeBlockedCount > 0 || q.breakoffHereCount >= 2);
        const hasUnbound = diag.questionDiagnostics.some((q) => q.boundFields.length === 0);
        if (hasRangeOrBreakoff || diag.breakoffCount >= 2) {
            autoIssues.push("questionnaire_burden_or_range");
            autoActions.push("revise_questionnaire");
            notes.push("部分题目出现中途弃答或数值上下限拦截真实值，需在二轮精简题量并修正量程");
        }
        if (hasUnbound) {
            autoIssues.push("unmeasured_variables");
            if (!autoActions.includes("revise_questionnaire")) autoActions.push("revise_questionnaire");
        }
        if (autoIssues.length === 0) {
            autoIssues.push("unit_nonresponse_gap");
        }

        setIdentifiedIssues([...new Set(autoIssues)]);
        setPlannedActions([...new Set(autoActions)]);
        const sdSuffix = unitLabel && !isPct ? unitLabel : "";
        if (rationale.trim().length < 15) {
            setRationale(
                `${notes.join("；")}。因此在第 2 轮正式投放中，拟代入首轮实测无回答率（${diag.empiricalNonResponseRatePct}%）${diag.empiricalTargetStdDev ? `与实测样本标准差（s=${formatStatistic(diag.empiricalTargetStdDev, 2)}${sdSuffix}）` : ""}重新核算样本量，并升级抽样设计与分层配额以提升估计精度。`,
            );
            toast.success("已根据首轮实测诊断指标提取调优要点，请复核补充");
        } else {
            toast.info("已同步勾选诊断问题与调优动作；为保留您已撰写的说明文字，未覆盖下方文本框");
        }
    };

    const planValidationError = validateAdjustmentPlan(draftPlan);
    const canComplete = Boolean(diag) && planValidationError === null;

    const handleComplete = async () => {
        if (!canComplete || completing || refreshRequired) return;
        setCompleting(true);
        try {
            const ok = await completeStage(3, { adjustmentPlan: draftPlan });
            if (ok) clearDraft.clear();
        } finally {
            setCompleting(false);
        }
    };

    if (!wave1 || !diag) {
        return (
            <div className="space-y-4" data-testid="student-stage-diagnostics-empty">
                <Card className="rounded-surface border-warning-border bg-warning-muted p-6">
                    <p className="text-body font-medium text-warning">尚未检测到首轮试投回收数据，请返回上一阶段发放问卷。</p>
                    <Button variant="outline" className="mt-4 bg-card" onClick={onPrev}>返回首轮试投</Button>
                </Card>
            </div>
        );
    }

    const trimmedRationaleLen = rationale.trim().length;
    const meanUnitSuffix = unitLabel && !isPct ? ` ${unitLabel}` : "";

    return (
        <div className="space-y-6" data-testid="student-stage-diagnostics">
            {availableMethods.length > 1 && (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-surface border border-border bg-card px-4 py-2.5">
                    <span className="text-label font-medium text-foreground">切换查看首轮试投方法：</span>
                    <div role="group" aria-label="切换查看首轮试投方法" className="inline-flex flex-wrap gap-1 rounded-control bg-muted p-1">
                        {availableMethods.map((m) => (
                            <Button
                                key={m}
                                type="button"
                                size="sm"
                                variant={selectedMethod === m ? "default" : "ghost"}
                                aria-pressed={selectedMethod === m}
                                onClick={() => setSelectedMethod(m)}
                                className="h-7 px-3 text-meta"
                            >
                                {METHOD_NAMES[m]}
                            </Button>
                        ))}
                    </div>
                </div>
            )}

            {/* Top Diagnostic KPI Strip */}
            <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,13rem),1fr))] gap-4">
                <KpiStatCard
                    label="质检后有效回收率"
                    value={`${formatStatistic(diag.effectiveRatePct, 1)}%`}
                    hint={`有效 ${diag.cleanedValidCount} / 发放 ${diag.invitedCount} 份`}
                    icon={CheckCircle2}
                    intent={diag.effectiveRatePct >= 75 ? "success" : "warning"}
                />
                <KpiStatCard
                    label="实测总无回答与废卷率"
                    value={`${diag.empiricalNonResponseRatePct}%`}
                    hint="可直接代入二轮样本量公式"
                    icon={ShieldAlert}
                    intent="warning"
                />
                <KpiStatCard
                    label={diag.empiricalTargetStdDev != null ? "清洗后实测样本标准差 s" : "客群最大结构偏倚"}
                    value={
                        diag.empiricalTargetStdDev != null
                            ? `${formatStatistic(diag.empiricalTargetStdDev, 2)}${meanUnitSuffix}`
                            : diag.maxStratumBiasPp != null
                                ? `${formatStatistic(diag.maxStratumBiasPp, 1)} pp`
                                : "—"
                    }
                    hint={
                        diag.empiricalTargetVariance != null
                            ? `实测样本方差 s² = ${formatStatistic(diag.empiricalTargetVariance, 2)}`
                            : "抽样框占比 vs 有效回收占比最大差"
                    }
                    icon={Users}
                    intent="primary"
                />
                <KpiStatCard
                    label="首轮单份有效样本成本"
                    value={diag.unitEffectiveCost != null ? `¥${formatStatistic(diag.unitEffectiveCost, 1)}` : "—"}
                    hint={`参考总成本 ¥${formatStatistic(diag.totalEstimatedCost, 0)}`}
                    icon={Coins}
                    intent="info"
                />
            </div>

            {/* Funnel Chart */}
            <FieldworkFunnelChart
                targetRequiredCount={wave1.samplePlan ? Math.round(wave1.samplePlan.finalSampleSize * (1 - wave1.samplePlan.nonResponseRate)) : undefined}
                totalEstimatedCost={diag.totalEstimatedCost}
                unitEffectiveCost={diag.unitEffectiveCost}
                stages={[
                    {
                        key: "invited",
                        label: "1. 入样发放邀约",
                        count: diag.invitedCount,
                        description: "首轮试投总发出量",
                        tone: "primary",
                    },
                    {
                        key: "contacted",
                        label: "2. 成功触达受访者",
                        count: diag.contactedCount,
                        description: `失联未触达 ${diag.notContactedCount} 份`,
                        tone: "info",
                    },
                    {
                        key: "completed_raw",
                        label: "3. 原始完答回收卷",
                        count: diag.completedRawCount,
                        description: `拒访 ${diag.refusedCount} 份 · 中途弃答 ${diag.breakoffCount} 份`,
                        tone: "warning",
                    },
                    {
                        key: "cleaned_valid",
                        label: "4. 质检清洗有效卷",
                        count: diag.cleanedValidCount,
                        description: `闪电敷衍卷 ${diag.speederCount} 份 · 直线机械卷 ${diag.straightlinerCount} 份`,
                        tone: "success",
                    },
                ]}
            />

            {/* Interactive QC Cleaning Workbench + Multi-Layer Forest Comparison */}
            <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,26rem),1fr))] gap-5">
                <Card className="scroll-mt-36 rounded-surface border-border bg-card" data-testid="student-diagnostics-cleaning-card">
                    <CardHeader className="border-b border-border pb-4">
                        <div className="flex items-center justify-between gap-2">
                            <div>
                                <CardTitle className="flex items-center gap-2 text-subheading text-foreground">
                                    <Filter className="h-5 w-5 text-primary" />
                                    交互式答卷质检与废卷清洗台
                                </CardTitle>
                                <CardDescription className="mt-1">
                                    切换清洗规则，实时观察右侧森林图中「清洗后有效估计」相对「未质检含噪估计」的误差变化
                                </CardDescription>
                            </div>
                            {updatingCleaning && <Loader2 className="h-4 w-4 animate-spin text-primary" aria-label="正在更新质检规则" />}
                        </div>
                    </CardHeader>
                    <CardContent className="space-y-4 pt-4">
                        {cleaningError && (
                            <div role="alert" className="rounded-control border border-destructive-border bg-destructive-muted px-3 py-2 text-meta text-destructive">
                                {cleaningError}
                            </div>
                        )}
                        <div className="divide-y divide-border rounded-surface bg-muted px-4">
                            <div className="flex items-center justify-between gap-3 py-3">
                                <div>
                                    <Label htmlFor="clean-speeder-switch" className="cursor-pointer text-label font-medium text-foreground">
                                        剔除「闪电敷衍卷」（Speeder）
                                    </Label>
                                    <p className="text-meta text-muted-foreground">
                                        作答时长远低于正常阅读底线（本轮检出 {diag.speederCount} 份）
                                    </p>
                                </div>
                                <Switch
                                    id="clean-speeder-switch"
                                    checked={cleaningConfig.removeSpeeders}
                                    disabled={updatingCleaning || refreshRequired}
                                    onCheckedChange={(val) => void handleToggleCleaning({ removeSpeeders: val })}
                                />
                            </div>

                            <div className="flex items-center justify-between gap-3 py-3">
                                <div>
                                    <Label htmlFor="clean-straight-switch" className="cursor-pointer text-label font-medium text-foreground">
                                        剔除「直线机械作答卷」（Straight-liner）
                                    </Label>
                                    <p className="text-meta text-muted-foreground">
                                        量表/多题连续机械勾选同一位置选项（本轮检出 {diag.straightlinerCount} 份）
                                    </p>
                                </div>
                                <Switch
                                    id="clean-straight-switch"
                                    checked={cleaningConfig.removeStraightliners}
                                    disabled={updatingCleaning || refreshRequired}
                                    onCheckedChange={(val) => void handleToggleCleaning({ removeStraightliners: val })}
                                />
                            </div>

                            <div className="flex items-center justify-between gap-3 py-3">
                                <div>
                                    <Label htmlFor="clean-target-switch" className="cursor-pointer text-label font-medium text-foreground">
                                        强制要求核心商业指标有效完答
                                    </Label>
                                    <p className="text-meta text-muted-foreground">
                                        剔除主指标漏答或被数值上下限拦截的残缺记录
                                    </p>
                                </div>
                                <Switch
                                    id="clean-target-switch"
                                    checked={cleaningConfig.requirePrimaryTargetValid}
                                    disabled={updatingCleaning || refreshRequired}
                                    onCheckedChange={(val) => void handleToggleCleaning({ requirePrimaryTargetValid: val })}
                                />
                            </div>
                        </div>

                        {diag.sampleAnomalies.length > 0 && (
                            <div className="space-y-2 pt-1">
                                <p className="text-meta font-semibold text-muted-foreground">异常与未完答样本抽检日志（前 {diag.sampleAnomalies.length} 条）</p>
                                <div
                                    role="region"
                                    aria-label="异常样本抽检日志"
                                    tabIndex={0}
                                    className="max-h-52 overflow-auto rounded-control border border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                >
                                    <table className="w-full caption-bottom text-meta" aria-label="异常样本抽检日志表">
                                        <TableHeader className="bg-muted">
                                            <TableRow>
                                                <TableHead>受访单元</TableHead>
                                                <TableHead>状态分类</TableHead>
                                                <TableHead>质检诊断说明</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {diag.sampleAnomalies.map((item) => {
                                                const badge = DISPOSITION_BADGES[item.disposition] ?? { label: item.disposition, intent: "neutral" as const };
                                                return (
                                                    <TableRow key={`${item.populationIndex}-${item.disposition}`}>
                                                        <TableCell className="font-mono text-meta">{item.unitId}</TableCell>
                                                        <TableCell>
                                                            <StatusBadge intent={badge.intent}>{badge.label}</StatusBadge>
                                                        </TableCell>
                                                        <TableCell className="whitespace-normal break-words text-meta text-muted-foreground">{item.reason}</TableCell>
                                                    </TableRow>
                                                );
                                            })}
                                        </TableBody>
                                    </table>
                                </div>
                            </div>
                        )}
                    </CardContent>
                </Card>

                <ConfidenceIntervalPlot
                    title="首轮试投多口径点估计与误差对比"
                    subtitle="观察废卷污染、差异化拒访与事后分层权重校准对商业指标推断的影响"
                    confidenceLevel={wave1.samplePlan?.confidenceLevel ?? experiment?.samplePlan?.confidenceLevel}
                    populationValue={diag.populationTruth}
                    isPercentage={Boolean(isPct)}
                    unit={unitLabel}
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
            </div>

            {/* Stratum Response Bias Chart */}
            {diag.stratumField && diag.strata.length > 0 && (
                <StratumComparisonChart stratumField={diag.stratumField} rows={diag.strata} />
            )}

            {/* Question-by-Question Diagnostics Table */}
            <Card className="scroll-mt-36 rounded-surface border-border bg-card">
                <CardHeader className="border-b border-border pb-3">
                    <CardTitle className="text-subheading text-foreground">逐题填答完答率、弃答点与量程截断诊断</CardTitle>
                    <CardDescription>检查是否存在未绑定变量、中途弃答集中题或数值范围拦截真实客户值的问题</CardDescription>
                </CardHeader>
                <CardContent className="pt-4">
                    <div
                        role="region"
                        aria-label="逐题填答质量诊断区域"
                        tabIndex={0}
                        className="overflow-x-auto rounded-control border border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                        <table aria-label="逐题填答质量诊断表" className="w-full caption-bottom text-meta">
                            <TableHeader className="bg-muted">
                                <TableRow>
                                    <TableHead className="w-16">题号</TableHead>
                                    <TableHead>题目内容</TableHead>
                                    <TableHead>绑定字段</TableHead>
                                    <TableHead className="text-right">有效作答率</TableHead>
                                    <TableHead className="text-right">此处弃答</TableHead>
                                    <TableHead className="text-right">量程受阻</TableHead>
                                    <TableHead>诊断建议</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {diag.questionDiagnostics.map((q) => (
                                    <TableRow key={q.questionId}>
                                        <TableCell className="font-mono font-semibold">Q{q.questionIndex + 1}</TableCell>
                                        <TableCell className="max-w-xs truncate text-label text-foreground" title={q.title}>{q.title}</TableCell>
                                        <TableCell>
                                            {q.boundFields.length > 0 ? (
                                                <StatusBadge intent="success">{q.boundFields.join(", ")}</StatusBadge>
                                            ) : (
                                                <StatusBadge intent="neutral">未绑定</StatusBadge>
                                            )}
                                        </TableCell>
                                        <TableCell className="text-right font-mono tabular-nums">{formatStatistic(q.answerRatePct, 1)}%</TableCell>
                                        <TableCell className={`text-right font-mono tabular-nums ${q.breakoffHereCount > 0 ? "text-warning font-semibold" : "text-muted-foreground"}`}>
                                            {q.breakoffHereCount}
                                        </TableCell>
                                        <TableCell className={`text-right font-mono tabular-nums ${q.rangeBlockedCount > 0 ? "text-destructive font-semibold" : "text-muted-foreground"}`}>
                                            {q.rangeBlockedCount}
                                        </TableCell>
                                        <TableCell className="text-meta">
                                            {q.warnings.length === 0 ? (
                                                <span className="text-success">正常</span>
                                            ) : (
                                                <div className="space-y-1 text-warning">
                                                    {q.warnings.map((w, i) => (
                                                        <p key={i} className="flex items-start gap-1">
                                                            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                                                            <span>{w}</span>
                                                        </p>
                                                    ))}
                                                </div>
                                            )}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </table>
                    </div>
                </CardContent>
            </Card>

            {/* Stage 3 Structured Adjustment Decision Form */}
            <Card className="scroll-mt-36 rounded-surface border-border bg-card" data-testid="student-adjustment-plan-form">
                <CardHeader className="border-b border-border pb-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                            <CardTitle className="flex items-center gap-2 text-section-title text-foreground">
                                <ClipboardCheck className="h-5 w-5 text-primary" />
                                填写《抽样与投放调优决策单》
                            </CardTitle>
                            <CardDescription className="mt-1 text-muted-foreground">
                                总结首轮试投暴露的统计与测量缺陷，明确二轮正式投放的改进策略（将记入提交快照供教师批阅）
                            </CardDescription>
                        </div>
                        <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            onClick={handleSmartExtractFindings}
                            data-testid="student-adjustment-auto-fill"
                        >
                            <ClipboardCheck className="mr-1.5 h-3.5 w-3.5" />
                            智能提取首轮诊断要点
                        </Button>
                    </div>
                </CardHeader>
                <CardContent className="space-y-5 pt-5">
                    <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,20rem),1fr))] gap-6">
                        <div className="space-y-2.5">
                            <div className="flex items-center justify-between gap-2">
                                <Label className="text-foreground font-medium">1. 首轮试投识别的数据与抽样问题（至少勾选 1 项）</Label>
                                <StatusBadge intent={identifiedIssues.length > 0 ? "success" : "neutral"}>
                                    已选 {identifiedIssues.length} 项
                                </StatusBadge>
                            </div>
                            <div className="space-y-2">
                                {ALL_ISSUES.map((issue) => {
                                    const checked = identifiedIssues.includes(issue);
                                    return (
                                        <label
                                            key={issue}
                                            className={`flex cursor-pointer items-start gap-2.5 rounded-control border p-3 text-label ${
                                                checked
                                                    ? "border-primary-border bg-primary-muted text-foreground"
                                                    : "border-border bg-card text-foreground hover:bg-muted"
                                            }`}
                                        >
                                            <input
                                                type="checkbox"
                                                checked={checked}
                                                onChange={() => toggleIssue(issue)}
                                                data-testid={`student-adjustment-issue-${issue}`}
                                                className="mt-1 accent-primary"
                                            />
                                            <span>{ADJUSTMENT_ISSUE_LABELS[issue]}</span>
                                        </label>
                                    );
                                })}
                            </div>
                        </div>

                        <div className="space-y-2.5">
                            <div className="flex items-center justify-between gap-2">
                                <Label className="text-foreground font-medium">2. 二轮正式投放拟采取的调优动作（至少勾选 1 项）</Label>
                                <StatusBadge intent={plannedActions.length > 0 ? "success" : "neutral"}>
                                    已选 {plannedActions.length} 项
                                </StatusBadge>
                            </div>
                            <div className="space-y-2">
                                {ALL_ACTIONS.map((action) => {
                                    const checked = plannedActions.includes(action);
                                    return (
                                        <label
                                            key={action}
                                            className={`flex cursor-pointer items-start gap-2.5 rounded-control border p-3 text-label ${
                                                checked
                                                    ? "border-primary-border bg-primary-muted text-foreground"
                                                    : "border-border bg-card text-foreground hover:bg-muted"
                                            }`}
                                        >
                                            <input
                                                type="checkbox"
                                                checked={checked}
                                                onChange={() => toggleAction(action)}
                                                data-testid={`student-adjustment-action-${action}`}
                                                className="mt-1 accent-primary"
                                            />
                                            <span>{ADJUSTMENT_ACTION_LABELS[action]}</span>
                                        </label>
                                    );
                                })}
                            </div>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <Label htmlFor="adjustment-rationale" className="text-foreground font-medium">
                                3. 调优依据与二轮抽样统计思路说明（15–2000 字）
                            </Label>
                            <span className={`text-meta tabular-nums ${
                                trimmedRationaleLen > 2000
                                    ? "text-destructive font-medium"
                                    : trimmedRationaleLen >= 15
                                        ? "text-success"
                                        : trimmedRationaleLen > 0
                                            ? "text-warning"
                                            : "text-muted-foreground"
                            }`}>
                                {trimmedRationaleLen > 2000
                                    ? `已超出 ${trimmedRationaleLen - 2000} 字 · `
                                    : trimmedRationaleLen >= 15
                                        ? "字数已达标 · "
                                        : trimmedRationaleLen > 0
                                            ? `还差 ${15 - trimmedRationaleLen} 字达标 · `
                                            : "至少 15 字 · "}
                                {trimmedRationaleLen} / 2000 字
                            </span>
                        </div>
                        <Textarea
                            id="adjustment-rationale"
                            rows={4}
                            placeholder="请结合上方转化漏斗、客群结构偏差或逐题诊断数据，说明为什么需要修订问卷、重算样本量或调整分层/PPS/系统抽样策略…"
                            value={rationale}
                            onChange={(e) => setRationale(e.target.value)}
                            data-testid="student-adjustment-rationale"
                            className="bg-card"
                        />
                        {planValidationError && (
                            <p className="text-meta text-warning" role="status">{planValidationError}</p>
                        )}
                    </div>
                </CardContent>
            </Card>

            <StageActions>
                <Button variant="outline" onClick={onPrev} disabled={completing} data-testid="student-diagnostics-prev">
                    <ChevronLeft className="mr-1 h-4 w-4" />
                    查看首轮试投
                </Button>
                <div className="flex flex-wrap items-center justify-end gap-3">
                    {planValidationError && (
                        <span className="text-meta text-muted-foreground" data-testid="student-diagnostics-blocker-hint">
                            待完成：{planValidationError}（可点击“智能提取首轮诊断要点”辅助起草）
                        </span>
                    )}
                    <Button
                        onClick={() => void handleComplete()}
                        disabled={!canComplete || completing || refreshRequired}
                        data-testid="student-diagnostics-complete"
                    >
                        {completing ? (
                            <><Loader2 className="mr-2 h-4 w-4 animate-spin" />正在立项二轮投放…</>
                        ) : (
                            <>确认调优方案，进入二轮正式投放<ArrowRight className="ml-2 h-4 w-4" /></>
                        )}
                    </Button>
                </div>
            </StageActions>
        </div>
    );
}

export default FieldworkDiagnosticsStage;
