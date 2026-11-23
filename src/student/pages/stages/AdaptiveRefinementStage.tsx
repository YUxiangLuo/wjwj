import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
    AlertCircle, ArrowDown, ArrowRight, ArrowUp, Calculator, CheckCircle2,
    ChevronLeft, Coins, Edit2, FileEdit, Layers, Loader2, Play, Plus,
    RefreshCw, Send, Sparkles, Trash2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StatusBadge } from "@/components/StatusBadge";
import { QuestionEditor } from "@/components/questionnaire/QuestionEditor";
import { VariableBindingDialog } from "@/components/questionnaire/VariableBindingDialog";
import { FieldworkFunnelChart } from "@/components/charts/FieldworkFunnelChart";
import { StratumComparisonChart } from "@/components/charts/StratumComparisonChart";
import { WaveDeltaScorecard } from "@/components/charts/WaveDeltaScorecard";
import { ADJUSTMENT_ACTION_LABELS, ADJUSTMENT_ISSUE_LABELS, buildWaveSnapshotMetric } from "@/components/WaveLoopSnapshot";
import { StageActions } from "../../components/StageActions";
import { SamplePreviewTable } from "../../components/SamplePreviewTable";
import { StratifiedSamplingTab } from "../../components/StratifiedSamplingTab";
import { PpsProbabilityExplanation } from "@/components/PpsProbabilityExplanation";
import { useExperiment } from "../ExperimentLayout";
import { experimentApi } from "../../api-client";
import { createApiClient } from "@/lib/api-client";
import type { MethodKey, SamplePlanData, SamplingResultsData } from "@/domain/experiment/types";
import type { VariableDictionary } from "@/domain/variables/types";
import type { Question, QuestionnaireData } from "@/lib/questionnaire-types";
import {
    autoBindQuestionnaireVariables,
    evaluateQuestionnaireBurden,
    resolveFieldworkConfig,
    type CleaningConfig,
} from "@/domain/fieldwork";
import { calculateSampleSizeStepDetails, finitePopulationS2ToSigma2 } from "../../experiment/sample-plan";
import { getRequiredStratifiedMinimum } from "../../experiment/final-sample-bounds";
import { getFinalSampleSizeBounds } from "../../components/immersive-sample-planning/types";
import { getSamplingAcceptedRange } from "../../experiment/sampling-tolerance";
import { getSamplingResultCount } from "../../experiment/sampling-results";
import { pickDefaultPpsSizeField } from "../../experiment/pps-size-field";
import { formatSystematicInterval, getSystematicInterval } from "../../experiment/systematic-sampling";
import {
    applyPpsAvailability,
    evaluateSamplingPolicy,
    isCompletedSamplingResult,
    resolveSamplingPolicy,
    SAMPLING_METHODS,
} from "@/lib/sampling-policy";
import { formatStatistic } from "@/utils/statistic-format";

const studentClient = createApiClient("student");

const METHOD_LABELS: Record<MethodKey, string> = {
    simple: "简单随机抽样",
    stratified: "分层抽样",
    pps: "PPS抽样",
    systematic: "系统抽样",
};

type RefinementTab = "questionnaire" | "plan" | "sampling";

export function AdaptiveRefinementStage({ onPrev }: { onPrev: () => void }) {
    const {
        experiment,
        populationSize: N,
        completeStage,
        updateExperiment,
        reloadExperiment,
        refreshRequired,
        requireRefresh,
    } = useExperiment();

    const taskId = experiment?.taskId;
    const analysisTarget = experiment?.analysisTarget?.target ?? null;
    const estimationType: "mean" | "proportion" = analysisTarget?.kind === "mean" ? "mean" : "proportion";
    const basePolicy = resolveSamplingPolicy(experiment?.samplingPolicy);
    const fieldworkConfig = resolveFieldworkConfig(experiment?.fieldworkConfig);

    const wave1 = useMemo(
        () => experiment?.waves?.find((w) => w.waveNumber === 1) ?? null,
        [experiment?.waves],
    );
    const activeWaveNum = Math.max(2, experiment?.activeWaveNumber ?? 2);
    const activeWave = useMemo(
        () => experiment?.waves?.find((w) => w.waveNumber === activeWaveNum)
            ?? experiment?.waves?.filter((w) => w.waveNumber >= 2).at(-1)
            ?? null,
        [experiment?.waves, activeWaveNum],
    );

    const wave1Diag = useMemo(() => {
        if (!wave1?.diagnostics) return null;
        for (const m of ["simple", "stratified", "systematic", "pps"] as const) {
            if (wave1.diagnostics[m]) return wave1.diagnostics[m]!;
        }
        return null;
    }, [wave1?.diagnostics]);

    const [activeTab, setActiveTab] = useState<RefinementTab>("plan");
    const [dictionary, setDictionary] = useState<VariableDictionary | null>(null);

    // Wave 2+ Questionnaire State
    const sourceQ = activeWave?.questionnaire ?? experiment?.questionnaire ?? {
        title: "",
        welcomeText: "",
        endingText: "",
        questions: [],
    };
    const [qTitle, setQTitle] = useState<string>(sourceQ.title);
    const [qWelcome, setQWelcome] = useState<string>(sourceQ.welcomeText);
    const [qEnding, setQEnding] = useState<string>(sourceQ.endingText);
    const [qList, setQList] = useState<Question[]>(sourceQ.questions);
    const [editingQuestion, setEditingQuestion] = useState<Question | undefined>(undefined);
    const [questionEditorOpen, setQuestionEditorOpen] = useState(false);
    const [bindingQuestion, setBindingQuestion] = useState<Question | null>(null);
    const [savingQuestionnaire, setSavingQuestionnaire] = useState(false);

    useEffect(() => {
        const latest = activeWave?.questionnaire ?? experiment?.questionnaire;
        if (!latest) return;
        setQTitle(latest.title);
        setQWelcome(latest.welcomeText);
        setQEnding(latest.endingText);
        setQList(latest.questions);
    }, [activeWave?.waveNumber]);

    useEffect(() => {
        if (!taskId) return;
        const controller = new AbortController();
        studentClient.request<{ dictionary: VariableDictionary | null }>(`/api/student/tasks/${taskId}/variables`, { signal: controller.signal })
            .then((res) => { if (res.success) setDictionary(res.data?.dictionary ?? null); })
            .catch(() => undefined);
        return () => controller.abort();
    }, [taskId]);

    // Population Stats State
    const [statsLoading, setStatsLoading] = useState(true);
    const [statsError, setStatsError] = useState("");
    const [statsReloadKey, setStatsReloadKey] = useState(0);
    const [populationVariance, setPopulationVariance] = useState<number | null>(null);
    const [minimumSampleSize, setMinimumSampleSize] = useState<number>(1);
    const [populationStats, setPopulationStats] = useState<Record<string, Record<string, number>>>({});
    const [numericFields, setNumericFields] = useState<string[]>([]);
    const [ppsEligibleFields, setPpsEligibleFields] = useState<string[]>([]);
    const [stratumNumericStats, setStratumNumericStats] = useState<Record<string, Record<string, Record<string, { mean: number; stdDev: number }>>>>({});

    // Wave 2+ Sample Plan State
    const savedWavePlan = activeWave?.samplePlan ?? experiment?.samplePlan ?? null;
    const [confidenceLevel, setConfidenceLevel] = useState<string>(savedWavePlan?.confidenceLevel ?? "95");
    const [marginOfError, setMarginOfError] = useState<number>(
        savedWavePlan?.marginOfError ?? (estimationType === "mean" ? 2 : 5),
    );
    const [varianceSource, setVarianceSource] = useState<"wave1_empirical" | "population">(
        savedWavePlan?.varianceSource === "wave1_empirical" ? "wave1_empirical" : "population",
    );
    const [designEffect, setDesignEffect] = useState<number>(savedWavePlan?.designEffect ?? 1);
    const [nonResponsePct, setNonResponsePct] = useState<number>(
        savedWavePlan ? Math.round(savedWavePlan.nonResponseRate * 100) : (wave1Diag?.empiricalNonResponseRatePct ?? 20),
    );
    const [customFinalSize, setCustomFinalSize] = useState<number | null>(savedWavePlan?.finalSampleSize ?? null);
    const [savingPlan, setSavingPlan] = useState(false);

    // Wave 2+ Sampling & Dispatch State
    const waveSampling = (activeWave?.samplingResults ?? null) as SamplingResultsData | null;
    const effectivePolicy = useMemo(() => applyPpsAvailability(basePolicy, waveSampling), [basePolicy, waveSampling]);
    const enabledMethods = useMemo(
        () => SAMPLING_METHODS.filter((m) => effectivePolicy.methods[m] !== "disabled"),
        [effectivePolicy],
    );
    const [activeMethod, setActiveMethod] = useState<MethodKey>(() => {
        const reqMethod = enabledMethods.find((m) => effectivePolicy.methods[m] === "required" && m !== "simple");
        return reqMethod ?? "simple";
    });
    const [executingMethod, setExecutingMethod] = useState<MethodKey | null>(null);
    const [executionTime, setExecutionTime] = useState<number | null>(null);
    const [ppsSizeField, setPpsSizeField] = useState<string>(waveSampling?.pps?.sizeField ?? "");
    const [ppsSampleSize, setPpsSampleSize] = useState<number>(waveSampling?.pps?.sampleCount ?? (savedWavePlan?.finalSampleSize ?? 30));
    const [samplingSeed, setSamplingSeed] = useState<string>("");
    const [dispatchSeed, setDispatchSeed] = useState<string>("");
    const [dispatching, setDispatching] = useState(false);
    const [creatingNewWave, setCreatingNewWave] = useState(false);
    const [completing, setCompleting] = useState(false);

    useEffect(() => {
        if (!taskId) return;
        let active = true;
        const controller = new AbortController();
        setStatsLoading(true);
        setStatsError("");
        void experimentApi.getStats(taskId, controller.signal).then((res) => {
            if (!active) return;
            if (!res.success || !res.data) {
                setStatsError(res.error?.message ?? "抽样框统计信息加载失败");
                setStatsLoading(false);
                return;
            }
            setPopulationStats(res.data.stats ?? {});
            setStratumNumericStats(res.data.stratumNumericStats ?? {});
            setNumericFields(res.data.numericFields ?? []);
            const targetField = experiment?.analysisTarget?.inferred ? undefined : analysisTarget?.field;
            const eligible = (res.data.ppsEligibleFields ?? []).filter((f) => f !== targetField);
            setPpsEligibleFields(eligible);
            if (eligible.length > 0 && !ppsSizeField) {
                setPpsSizeField(pickDefaultPpsSizeField(eligible));
            }
            if (basePolicy.methods.stratified === "required") {
                const minStrat = getRequiredStratifiedMinimum(res.data.stats, basePolicy, N);
                if (minStrat != null) setMinimumSampleSize(minStrat);
            }
            if (estimationType === "mean" && analysisTarget?.field) {
                const stat = res.data.populationNumericStats?.[analysisTarget.field];
                const sigma2 = stat ? finitePopulationS2ToSigma2(stat.variance, stat.count) : null;
                if (sigma2 != null && sigma2 > 0) setPopulationVariance(sigma2);
            }
            setStatsLoading(false);
        }).catch(() => {
            if (active) {
                setStatsError("抽样框统计信息加载失败，请重试");
                setStatsLoading(false);
            }
        });
        return () => {
            active = false;
            controller.abort();
        };
    }, [taskId, statsReloadKey, estimationType, analysisTarget?.field, experiment?.analysisTarget?.inferred, N]);

    const waveQuestionnaire = useMemo<QuestionnaireData>(
        () => ({ title: qTitle, welcomeText: qWelcome, endingText: qEnding, questions: qList }),
        [qTitle, qWelcome, qEnding, qList],
    );

    const wave1Burden = useMemo(
        () => evaluateQuestionnaireBurden(wave1?.questionnaire, dictionary, analysisTarget),
        [wave1?.questionnaire, dictionary, analysisTarget],
    );
    const currentBurden = useMemo(
        () => evaluateQuestionnaireBurden(waveQuestionnaire, dictionary, analysisTarget),
        [waveQuestionnaire, dictionary, analysisTarget],
    );

    const activeVariance = useMemo(() => {
        if (estimationType !== "mean") return undefined;
        if (varianceSource === "wave1_empirical" && wave1Diag?.empiricalTargetVariance) {
            return wave1Diag.empiricalTargetVariance;
        }
        return populationVariance ?? savedWavePlan?.populationVariance ?? 100;
    }, [estimationType, varianceSource, wave1Diag?.empiricalTargetVariance, populationVariance, savedWavePlan?.populationVariance]);

    const bounds = useMemo(() => getFinalSampleSizeBounds(N, minimumSampleSize), [N, minimumSampleSize]);
    const stepDetails = useMemo(() => calculateSampleSizeStepDetails({
        estimationType,
        confidenceLevel,
        marginOfError: marginOfError > 0 ? marginOfError : 1,
        populationSize: N,
        populationVariance: activeVariance,
        designEffect: designEffect > 0 ? designEffect : 1,
        nonResponseRate: Math.min(0.5, Math.max(0, nonResponsePct / 100)),
    }), [estimationType, confidenceLevel, marginOfError, N, activeVariance, designEffect, nonResponsePct]);

    const recommendedSize = Math.max(bounds.min, Math.min(bounds.max, stepDetails.n3 || bounds.min));
    const effectiveFinalSize = customFinalSize ?? recommendedSize;
    const isFinalSizeValid = Number.isInteger(effectiveFinalSize)
        && effectiveFinalSize >= bounds.min
        && effectiveFinalSize <= bounds.max;

    const handleImportWave1Empirical = () => {
        if (!wave1Diag) return;
        setNonResponsePct(wave1Diag.empiricalNonResponseRatePct);
        if (estimationType === "mean" && wave1Diag.empiricalTargetVariance && wave1Diag.empiricalTargetVariance > 0) {
            setVarianceSource("wave1_empirical");
        }
        setCustomFinalSize(null);
        toast.success(`已代入首轮实测无回答率（${wave1Diag.empiricalNonResponseRatePct}%）${estimationType === "mean" && wave1Diag.empiricalTargetStdDev ? `与实测样本标准差（s=${formatStatistic(wave1Diag.empiricalTargetStdDev, 2)}）` : ""}！`);
    };

    const buildFormalPlanPayload = useCallback((): SamplePlanData => ({
        estimationType,
        confidenceLevel,
        marginOfError,
        ...(estimationType === "mean" && activeVariance ? {
            populationVariance: activeVariance,
            varianceSource,
        } : {}),
        designEffect,
        nonResponseRate: Math.min(0.5, Math.max(0, nonResponsePct / 100)),
        recommendedSize,
        finalSampleSize: effectiveFinalSize,
    }), [estimationType, confidenceLevel, marginOfError, activeVariance, varianceSource, designEffect, nonResponsePct, recommendedSize, effectiveFinalSize]);

    const handleSaveWavePlan = async () => {
        if (!taskId || !experiment || savingPlan || !isFinalSizeValid || refreshRequired) return;
        setSavingPlan(true);
        try {
            const payload = buildFormalPlanPayload();
            const res = await experimentApi.saveWavePlan(taskId, experiment.version, payload);
            if (res.success && res.data) {
                updateExperiment(res.data);
                const nextN = res.data.samplePlan?.finalSampleSize ?? payload.finalSampleSize;
                setCustomFinalSize(nextN);
                setPpsSampleSize(nextN);
                toast.success("正式轮样本量规划已保存，现在可执行升级后的抽样设计");
                setActiveTab("sampling");
            } else if (res.error?.code === "VERSION_CONFLICT") {
                requireRefresh();
            } else {
                toast.error(res.error?.message ?? "保存正式轮样本量失败");
            }
        } finally {
            setSavingPlan(false);
        }
    };

    const handleSaveQuestionnaire = async () => {
        if (!taskId || !experiment || savingQuestionnaire || refreshRequired) return;
        setSavingQuestionnaire(true);
        try {
            const res = await experimentApi.saveWaveQuestionnaire(taskId, experiment.version, waveQuestionnaire);
            if (res.success && res.data) {
                updateExperiment(res.data);
                toast.success("正式轮修订问卷已保存（需在步骤 3 重新执行问卷发放）");
            } else if (res.error?.code === "VERSION_CONFLICT") {
                requireRefresh();
            } else {
                toast.error(res.error?.message ?? "修订问卷保存失败");
            }
        } finally {
            setSavingQuestionnaire(false);
        }
    };

    const handleAutoBindWaveQuestions = () => {
        if (!dictionary || !taskId) return;
        const result = autoBindQuestionnaireVariables({
            questionnaire: waveQuestionnaire,
            dictionary,
            taskId,
            targetField: analysisTarget?.field,
        });
        if (result.newlyBoundCount > 0) {
            setQList(result.questionnaire.questions);
            toast.success(`已自动补齐 ${result.newlyBoundCount} 道题目的数据字典绑定`);
        } else {
            toast.info("所有可自动匹配的题目均已关联变量");
        }
    };

    const lockedTargetN = activeWave?.samplePlan?.finalSampleSize ?? savedWavePlan?.finalSampleSize ?? 0;
    useEffect(() => {
        if (lockedTargetN > 0) {
            const range = getSamplingAcceptedRange(lockedTargetN, N);
            if (range && (ppsSampleSize < range.min || ppsSampleSize > range.max)) {
                setPpsSampleSize(lockedTargetN);
            }
        }
    }, [lockedTargetN, N]);

    const parseOptionalSeed = (raw: string): number | undefined | null => {
        const trimmed = raw.trim();
        if (!trimmed) return undefined;
        if (!/^-?\d+$/.test(trimmed)) return null;
        const parsed = Number.parseInt(trimmed, 10);
        return Number.isSafeInteger(parsed) ? parsed : null;
    };

    const handleRunMethod = async (method: Exclude<MethodKey, "stratified">) => {
        if (!taskId || lockedTargetN <= 0 || executingMethod || refreshRequired) return;
        const parsedSeed = parseOptionalSeed(samplingSeed);
        if (parsedSeed === null) {
            toast.error("随机种子需为整数");
            return;
        }
        setExecutingMethod(method);
        const start = performance.now();
        try {
            const params =
                method === "simple"
                    ? { sampleSize: lockedTargetN, seed: parsedSeed }
                    : method === "systematic"
                        ? { seed: parsedSeed }
                        : { sizeField: ppsSizeField, sampleSize: ppsSampleSize, seed: parsedSeed };
            const res = await experimentApi.executeSampling(taskId, method, params);
            if (res.success) {
                setExecutionTime(Math.round(performance.now() - start));
                await reloadExperiment();
                toast.success(`正式轮${METHOD_LABELS[method]}已执行保存`);
            } else if (res.error?.code === "VERSION_CONFLICT" || res.error?.code === "INVALID_STAGE_ORDER") {
                requireRefresh();
            } else {
                toast.error(res.error?.message ?? "抽样执行失败");
            }
        } finally {
            setExecutingMethod(null);
        }
    };

    const completedFormalMethods = useMemo(() => {
        return enabledMethods.filter((m) => {
            const r = waveSampling?.[m];
            if (!isCompletedSamplingResult(r)) return false;
            if (m === "systematic") return r?.sampleCount === lockedTargetN;
            return true;
        });
    }, [enabledMethods, waveSampling, lockedTargetN]);

    const policyProgress = useMemo(
        () => evaluateSamplingPolicy(effectivePolicy, completedFormalMethods),
        [effectivePolicy, completedFormalMethods],
    );

    const allCompletedMethodsDispatched = useMemo(() => {
        if (completedFormalMethods.length === 0) return false;
        return completedFormalMethods.every((m) => Boolean(activeWave?.diagnostics?.[m]));
    }, [completedFormalMethods, activeWave?.diagnostics]);

    const handleDispatchFormal = async () => {
        if (!taskId || !experiment || completedFormalMethods.length === 0 || dispatching || refreshRequired) return;
        const parsedSeed = parseOptionalSeed(dispatchSeed);
        if (parsedSeed === null) {
            toast.error("发放随机种子需为整数");
            return;
        }
        setDispatching(true);
        try {
            const res = await experimentApi.dispatchFieldwork(taskId, experiment.version, parsedSeed);
            if (res.success && res.data) {
                updateExperiment(res.data);
                toast.success("正式轮问卷已投放回收，已自动生成首轮 vs 正式轮调优对比卡！");
            } else if (res.error?.code === "VERSION_CONFLICT") {
                requireRefresh();
            } else {
                toast.error(res.error?.message ?? "正式轮问卷投放失败");
            }
        } finally {
            setDispatching(false);
        }
    };

    const handleToggleWaveCleaning = async (patch: Partial<CleaningConfig>) => {
        if (!taskId || !experiment || !activeWave || refreshRequired) return;
        const nextCleaning: CleaningConfig = { ...activeWave.cleaningConfig, ...patch };
        const res = await experimentApi.updateCleaningConfig(taskId, experiment.version, nextCleaning, activeWave.waveNumber);
        if (res.success && res.data) {
            updateExperiment(res.data);
            toast.success("正式轮质检清洗规则已更新");
        } else if (res.error?.code === "VERSION_CONFLICT") {
            requireRefresh();
        }
    };

    const handleCreateExtraWave = async () => {
        if (!taskId || !experiment || creatingNewWave || refreshRequired) return;
        setCreatingNewWave(true);
        try {
            const res = await experimentApi.createRefinementWave(taskId, experiment.version);
            if (res.success && res.data) {
                updateExperiment(res.data);
                toast.success(`已创建第 ${res.data.activeWaveNumber} 轮进阶微调波次`);
            } else if (res.error?.code === "VERSION_CONFLICT") {
                requireRefresh();
            } else {
                toast.error(res.error?.message ?? "无法创建新一轮微调波次");
            }
        } finally {
            setCreatingNewWave(false);
        }
    };

    const canCompleteStage4 =
        lockedTargetN >= bounds.min
        && policyProgress.canComplete
        && allCompletedMethodsDispatched;

    const handleCompleteStage4 = async () => {
        if (!canCompleteStage4 || !activeWave?.samplePlan || completing || refreshRequired) return;
        setCompleting(true);
        try {
            await completeStage(4, {
                questionnaire: waveQuestionnaire,
                samplePlan: activeWave.samplePlan,
            });
        } finally {
            setCompleting(false);
        }
    };

    const unitLabel = analysisTarget?.kind === "proportion" ? "%" : "";
    const firstWaveMetric = wave1 ? buildWaveSnapshotMetric(wave1, "simple", unitLabel) ?? buildWaveSnapshotMetric(wave1, undefined, unitLabel) : null;
    const activeWaveMetric = activeWave ? buildWaveSnapshotMetric(activeWave, activeMethod, unitLabel) ?? buildWaveSnapshotMetric(activeWave, undefined, unitLabel) : null;
    const activeDiag = activeWave?.diagnostics?.[activeMethod] ?? (completedFormalMethods[0] ? activeWave?.diagnostics?.[completedFormalMethods[0]] : null) ?? null;

    const ppsAcceptedRange = lockedTargetN > 0 ? getSamplingAcceptedRange(lockedTargetN, N) : null;
    const ppsMin = ppsAcceptedRange?.min ?? 1;
    const ppsMax = ppsAcceptedRange?.max ?? N;
    const systematicInterval = lockedTargetN > 0 ? getSystematicInterval(N, lockedTargetN) : null;

    const expectedFormalCompletes = Math.round(effectiveFinalSize * (1 - Math.min(0.5, Math.max(0, nonResponsePct / 100))));
    const estimatedFormalCost =
        effectiveFinalSize * fieldworkConfig.contactCostPerUnit
        + expectedFormalCompletes * fieldworkConfig.incentiveCostPerComplete;

    return (
        <div className="space-y-6" data-testid="student-stage-refinement">
            {statsError && (
                <div role="alert" className="flex items-center justify-between gap-3 rounded-surface border border-destructive-border bg-destructive-muted p-4 text-label text-destructive">
                    <span>{statsError}</span>
                    <Button variant="outline" size="sm" onClick={() => setStatsReloadKey((k) => k + 1)}>
                        <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                        重试加载
                    </Button>
                </div>
            )}

            {/* Top Closed-Loop Adjustment Brief Banner */}
            <section className="rounded-surface border border-primary-border bg-primary-muted p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                            <StatusBadge intent="primary">
                                <Layers className="h-3.5 w-3.5" />
                                当前执行：{activeWave?.label ?? `第 ${activeWaveNum} 轮 · 调优正式投放`}
                            </StatusBadge>
                            {experiment?.adjustmentPlan?.identifiedIssues.map((issue) => (
                                <StatusBadge key={issue} intent="warning">
                                    问题：{ADJUSTMENT_ISSUE_LABELS[issue] ?? issue}
                                </StatusBadge>
                            ))}
                        </div>
                        <p className="text-label text-foreground">
                            <strong>本轮调优动作：</strong>
                            {experiment?.adjustmentPlan?.plannedActions.map((a) => ADJUSTMENT_ACTION_LABELS[a] ?? a).join("；") || "结合首轮实测参数优化问卷、样本量与抽样策略"}
                        </p>
                    </div>
                    {(experiment?.waves?.length ?? 0) < 4 && activeWave?.fieldwork && (
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => void handleCreateExtraWave()}
                            disabled={creatingNewWave || refreshRequired}
                            data-testid="student-refinement-new-wave"
                            className="bg-card"
                        >
                            {creatingNewWave ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Plus className="mr-1.5 h-3.5 w-3.5" />}
                            追加第 {(experiment?.waves?.length ?? 2) + 1} 轮进阶微调
                        </Button>
                    )}
                </div>
            </section>

            {/* Live Wave 1 -> Wave 2+ Delta Scorecard when dispatched */}
            {firstWaveMetric && activeWaveMetric && (
                <WaveDeltaScorecard firstWave={firstWaveMetric} finalWave={activeWaveMetric} />
            )}

            {/* Three Studio Sub-Tabs */}
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as RefinementTab)} className="space-y-5">
                <TabsList className="grid h-auto w-full grid-cols-3 gap-1 rounded-surface border border-border bg-card p-1.5">
                    <TabsTrigger value="questionnaire" className="gap-2 py-2.5 text-label" data-testid="student-refinement-tab-questionnaire">
                        <FileEdit className="h-4 w-4" />
                        1. 问卷精简与规则修订（按需）
                    </TabsTrigger>
                    <TabsTrigger value="plan" className="gap-2 py-2.5 text-label" data-testid="student-refinement-tab-plan">
                        <Calculator className="h-4 w-4" />
                        2. 代入实测参数重算样本量
                        {lockedTargetN >= bounds.min && <CheckCircle2 className="h-4 w-4 text-success" />}
                    </TabsTrigger>
                    <TabsTrigger value="sampling" className="gap-2 py-2.5 text-label" data-testid="student-refinement-tab-sampling">
                        <Send className="h-4 w-4" />
                        3. 升级抽样设计与正式投放
                        {canCompleteStage4 && <CheckCircle2 className="h-4 w-4 text-success" />}
                    </TabsTrigger>
                </TabsList>

                {/* Sub-Tab 1: Questionnaire Refinement */}
                <TabsContent value="questionnaire" className="space-y-4">
                    <Card className="rounded-surface border-border bg-card">
                        <CardHeader className="border-b border-border pb-4">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                                <div>
                                    <CardTitle className="text-section-title text-foreground">修订正式轮问卷（降低弃答率与修复量程边界）</CardTitle>
                                    <CardDescription className="mt-1">
                                        首轮预计耗时 {wave1Burden.estimatedDurationSec}s（{wave1Burden.questionCount} 题） → 当前正式轮预计耗时{" "}
                                        <strong className="text-foreground">{currentBurden.estimatedDurationSec}s（{currentBurden.questionCount} 题）</strong>
                                    </CardDescription>
                                </div>
                                <div className="flex items-center gap-2">
                                    {dictionary && (
                                        <Button type="button" variant="outline" size="sm" onClick={handleAutoBindWaveQuestions}>
                                            <Sparkles className="mr-1.5 h-3.5 w-3.5 text-primary" />
                                            一键智能绑定变量
                                        </Button>
                                    )}
                                    <Button
                                        type="button"
                                        size="sm"
                                        onClick={() => {
                                            setEditingQuestion(undefined);
                                            setQuestionEditorOpen(true);
                                        }}
                                        variant="outline"
                                    >
                                        <Plus className="mr-1 h-4 w-4" />
                                        新增题目
                                    </Button>
                                    <Button
                                        type="button"
                                        size="sm"
                                        onClick={() => void handleSaveQuestionnaire()}
                                        disabled={savingQuestionnaire || qList.length < 5 || refreshRequired}
                                        data-testid="student-refinement-save-questionnaire"
                                    >
                                        {savingQuestionnaire ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />}
                                        保存修订问卷
                                    </Button>
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent className="divide-y divide-border pt-2">
                            {qList.map((q, idx) => (
                                <div key={q.id} className="flex items-start justify-between gap-3 py-3.5">
                                    <div className="min-w-0 flex-1 space-y-1">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <span className="font-mono text-meta font-semibold text-muted-foreground">Q{idx + 1}</span>
                                            <span className="text-label font-medium text-foreground">{q.content}</span>
                                            {q.variableBinding ? (
                                                <StatusBadge intent="success">已绑定 {q.variableBinding.mappings.map((m) => m.field).join(",")}</StatusBadge>
                                            ) : (
                                                <StatusBadge intent="neutral">未绑定变量</StatusBadge>
                                            )}
                                            {q.type === "numeric" && (q.numericMin !== undefined || q.numericMax !== undefined) && (
                                                <span className="text-meta text-muted-foreground">
                                                    范围 [{q.numericMin ?? "-∞"}, {q.numericMax ?? "+∞"}]
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    <div className="flex shrink-0 items-center gap-1">
                                        {dictionary && (
                                            <Button variant="ghost" size="sm" onClick={() => setBindingQuestion(q)}>
                                                {q.variableBinding ? "改绑" : "关联变量"}
                                            </Button>
                                        )}
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            aria-label={`上移第 ${idx + 1} 题`}
                                            disabled={idx === 0}
                                            onClick={() => {
                                                const next = [...qList];
                                                const [item] = next.splice(idx, 1);
                                                if (item) next.splice(idx - 1, 0, item);
                                                setQList(next);
                                            }}
                                        >
                                            <ArrowUp className="h-4 w-4" />
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            aria-label={`下移第 ${idx + 1} 题`}
                                            disabled={idx === qList.length - 1}
                                            onClick={() => {
                                                const next = [...qList];
                                                const [item] = next.splice(idx, 1);
                                                if (item) next.splice(idx + 1, 0, item);
                                                setQList(next);
                                            }}
                                        >
                                            <ArrowDown className="h-4 w-4" />
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            aria-label={`编辑第 ${idx + 1} 题`}
                                            onClick={() => {
                                                setEditingQuestion(q);
                                                setQuestionEditorOpen(true);
                                            }}
                                        >
                                            <Edit2 className="h-4 w-4" />
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            aria-label={`删除第 ${idx + 1} 题`}
                                            disabled={qList.length <= 5}
                                            className="text-destructive hover:bg-destructive-muted hover:text-destructive"
                                            onClick={() => setQList((prev) => prev.filter((item) => item.id !== q.id))}
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    </div>
                                </div>
                            ))}
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* Sub-Tab 2: Empirical Parameter Sample Recalculation */}
                <TabsContent value="plan" className="space-y-4">
                    <Card className="rounded-surface border-border bg-card">
                        <CardHeader className="border-b border-border pb-4">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                                <div>
                                    <CardTitle className="text-section-title text-foreground">基于首轮实测参数重算正式投放样本量</CardTitle>
                                    <CardDescription className="mt-1">
                                        用首轮试投获得的实测无回答率与样本标准差替代盲目猜测，确保质检清洗后仍满足目标商业决策精度
                                    </CardDescription>
                                </div>
                                {wave1Diag && (
                                    <Button
                                        type="button"
                                        variant="outline"
                                        onClick={handleImportWave1Empirical}
                                        data-testid="student-refinement-import-empirical"
                                        className="border-primary-border bg-primary-muted text-primary hover:bg-primary-muted hover:text-primary"
                                    >
                                        <Sparkles className="mr-1.5 h-4 w-4" />
                                        一键代入首轮实测无回答率与样本方差
                                    </Button>
                                )}
                            </div>
                        </CardHeader>
                        <CardContent className="space-y-5 pt-5">
                            <div className="grid grid-cols-3 gap-4">
                                <div className="space-y-2">
                                    <Label className="text-foreground">正式轮置信水平</Label>
                                    <Select
                                        value={confidenceLevel}
                                        onValueChange={(v) => {
                                            setConfidenceLevel(v);
                                            setCustomFinalSize(null);
                                        }}
                                    >
                                        <SelectTrigger aria-label="选择正式轮置信水平" className="bg-background">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="90">90% (Z = 1.645)</SelectItem>
                                            <SelectItem value="95">95% (Z = 1.960)</SelectItem>
                                            <SelectItem value="99">99% (Z = 2.576)</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="formal-margin-error" className="text-foreground">
                                        {estimationType === "mean" ? "正式轮目标误差限 e" : "正式轮目标误差限 E (%)"}
                                    </Label>
                                    <Input
                                        id="formal-margin-error"
                                        type="number"
                                        min={0.1}
                                        step={estimationType === "mean" ? 0.5 : 1}
                                        value={marginOfError}
                                        onChange={(e) => {
                                            setMarginOfError(Number(e.target.value));
                                            setCustomFinalSize(null);
                                        }}
                                        className="bg-background tabular-nums"
                                    />
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="formal-nrr" className="text-foreground">
                                        预期无回答/损耗率 (%)
                                        {wave1Diag && <span className="ml-1 text-meta text-primary">（首轮实测 {wave1Diag.empiricalNonResponseRatePct}%）</span>}
                                    </Label>
                                    <Input
                                        id="formal-nrr"
                                        type="number"
                                        min={0}
                                        max={50}
                                        step={1}
                                        value={nonResponsePct}
                                        onChange={(e) => {
                                            setNonResponsePct(Math.min(50, Math.max(0, Math.round(Number(e.target.value) || 0))));
                                            setCustomFinalSize(null);
                                        }}
                                        className="bg-background tabular-nums"
                                    />
                                </div>
                            </div>

                            {estimationType === "mean" && (
                                <div className="grid grid-cols-2 gap-4 rounded-surface border border-border bg-background p-4">
                                    <div className="space-y-2">
                                        <Label className="text-foreground">正式轮方差参数依据</Label>
                                        <Select
                                            value={varianceSource}
                                            onValueChange={(v) => {
                                                setVarianceSource(v as "wave1_empirical" | "population");
                                                setCustomFinalSize(null);
                                            }}
                                        >
                                            <SelectTrigger aria-label="选择正式轮方差参数依据" className="bg-card">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="wave1_empirical" disabled={!wave1Diag?.empiricalTargetVariance}>
                                                    首轮质检后实测样本方差 s²（闭环实证推荐）
                                                </SelectItem>
                                                <SelectItem value="population" disabled={!populationVariance}>
                                                    抽样框已知总体方差 σ²（教学基准）
                                                </SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="space-y-2">
                                        <Label className="text-foreground">当前代入方差数值</Label>
                                        <div className="flex h-9 items-center justify-between rounded-control border border-border bg-card px-3 font-mono text-label tabular-nums">
                                            <span>{activeVariance ? formatStatistic(activeVariance, 2) : "—"}</span>
                                            {activeVariance && (
                                                <span className="text-meta text-muted-foreground">
                                                    标准差 ≈ {formatStatistic(Math.sqrt(activeVariance), 2)}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )}

                            <div className="grid grid-cols-2 gap-4 rounded-surface border border-border bg-muted p-4">
                                <div className="space-y-2">
                                    <div className="flex items-center justify-between text-meta text-muted-foreground">
                                        <span>四步推导（{stepDetails.formulaLabel}）</span>
                                        <span className="font-mono tabular-nums text-foreground">
                                            n₀={stepDetails.n0} → FPC={stepDetails.n2} → 推荐 {recommendedSize} 份
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Label htmlFor="formal-final-size" className="shrink-0 text-label font-semibold text-foreground">
                                            正式轮发放样本量：
                                        </Label>
                                        <Input
                                            id="formal-final-size"
                                            type="number"
                                            min={bounds.min}
                                            max={bounds.max}
                                            value={effectiveFinalSize}
                                            onChange={(e) => setCustomFinalSize(Math.round(Number(e.target.value) || 0))}
                                            data-testid="student-refinement-final-size"
                                            className="h-9 w-28 bg-card font-mono font-bold tabular-nums"
                                        />
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            onClick={() => setCustomFinalSize(recommendedSize)}
                                            className="bg-card text-meta"
                                        >
                                            采用推荐值 {recommendedSize}
                                        </Button>
                                    </div>
                                    <p className="text-meta text-muted-foreground">
                                        首轮发放：{wave1?.samplePlan?.finalSampleSize ?? "—"} 份 → 正式轮规划：{effectiveFinalSize} 份（范围 {bounds.min}–{bounds.max}）
                                    </p>
                                </div>

                                <div className="flex flex-col justify-between rounded-control border border-info-border bg-info-muted p-3">
                                    <div className="flex items-center justify-between text-meta font-semibold text-info">
                                        <span className="flex items-center gap-1.5">
                                            <Coins className="h-4 w-4" />
                                            正式轮参考经费预估
                                        </span>
                                        <span className="tabular-nums">¥{formatStatistic(estimatedFormalCost, 0)}</span>
                                    </div>
                                    <p className="mt-1 text-meta text-muted-foreground tabular-nums">
                                        首轮实际参考成本 ¥{formatStatistic(wave1Diag?.totalEstimatedCost ?? 0, 0)} · 本轮预期有效完答约 {expectedFormalCompletes} 份
                                    </p>
                                </div>
                            </div>

                            <div className="flex items-center justify-between pt-1">
                                <div className="flex items-center gap-2 text-meta text-muted-foreground">
                                    <Label htmlFor="formal-deff" className="text-meta">设计效应 deff：</Label>
                                    <Input
                                        id="formal-deff"
                                        type="number"
                                        step={0.1}
                                        min={0.5}
                                        max={5}
                                        value={designEffect}
                                        onChange={(e) => {
                                            setDesignEffect(Math.max(0.5, Number(e.target.value) || 1));
                                            setCustomFinalSize(null);
                                        }}
                                        className="h-8 w-20 bg-background text-center font-mono text-meta"
                                    />
                                </div>
                                <Button
                                    type="button"
                                    onClick={() => void handleSaveWavePlan()}
                                    disabled={savingPlan || !isFinalSizeValid || statsLoading || refreshRequired}
                                    data-testid="student-refinement-save-plan"
                                >
                                    {savingPlan ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
                                    保存正式轮样本量并去抽样
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* Sub-Tab 3: Upgraded Sampling Design & Formal Fieldwork Dispatch */}
                <TabsContent value="sampling" className="space-y-5">
                    {lockedTargetN < bounds.min ? (
                        <Card className="rounded-surface border-warning-border bg-warning-muted p-6">
                            <p className="text-body font-medium text-warning">请先在「2. 代入实测参数重算样本量」保存正式轮样本量，再执行正式抽样。</p>
                            <Button variant="outline" className="mt-3 bg-card" onClick={() => setActiveTab("plan")}>前往保存样本量</Button>
                        </Card>
                    ) : (
                        <>
                            <div className="flex flex-wrap items-center justify-between gap-3 rounded-surface border border-border bg-card px-4 py-3 text-label">
                                <div className="flex flex-wrap items-center gap-5">
                                    <span>正式轮目标样本量：<strong className="font-mono tabular-nums">{lockedTargetN} 份</strong></span>
                                    <span>
                                        已完成抽样方法：
                                        <strong className={`ml-1 font-mono tabular-nums ${policyProgress.canComplete ? "text-success" : "text-warning"}`}>
                                            {completedFormalMethods.length} / {enabledMethods.length}
                                        </strong>
                                    </span>
                                </div>
                                <span className="text-meta text-muted-foreground">
                                    {policyProgress.canComplete
                                        ? "抽样策略要求已满足，请点击下方「执行正式问卷投放与质检」"
                                        : policyProgress.missingRequired.length > 0
                                            ? `还需完成必做方法：${policyProgress.missingRequired.map((m) => METHOD_LABELS[m]).join("、")}`
                                            : `还需再完成 ${policyProgress.minimumCompleted - completedFormalMethods.length} 种启用方法用于效率对照`}
                                </span>
                            </div>

                            <Tabs value={activeMethod} onValueChange={(v) => setActiveMethod(v as MethodKey)} className="space-y-4">
                                <TabsList className="flex h-auto w-full flex-wrap gap-1 rounded-surface border border-border bg-card p-1">
                                    {enabledMethods.map((method) => {
                                        const req = effectivePolicy.methods[method];
                                        const done = completedFormalMethods.includes(method);
                                        return (
                                            <TabsTrigger
                                                key={method}
                                                value={method}
                                                data-testid={`student-refinement-method-${method}`}
                                                className="flex-1 gap-2 py-2.5 text-label"
                                            >
                                                <span>{METHOD_LABELS[method]}</span>
                                                <StatusBadge intent={req === "required" ? "primary" : "neutral"}>
                                                    {req === "required" ? "必做" : "选做"}
                                                </StatusBadge>
                                                {done && <CheckCircle2 className="h-4 w-4 text-success" />}
                                            </TabsTrigger>
                                        );
                                    })}
                                </TabsList>

                                {(["simple", "systematic", "pps"] as const)
                                    .filter((m) => enabledMethods.includes(m))
                                    .map((method) => {
                                        const currentRes = waveSampling?.[method];
                                        const done = completedFormalMethods.includes(method);
                                        return (
                                            <TabsContent key={method} value={method} className="space-y-4">
                                                <Card className="rounded-surface border-border bg-card">
                                                    <CardHeader className="pb-3">
                                                        <CardTitle className="text-subheading text-foreground">{METHOD_LABELS[method]}</CardTitle>
                                                        <CardDescription>
                                                            {method === "simple"
                                                                ? `从总体 N=${N} 中等概率无放回抽取 ${lockedTargetN} 个受访单元作为比较基准。`
                                                                : method === "systematic"
                                                                    ? `按间距 K=${formatSystematicInterval(systematicInterval)} 等距抽取 ${lockedTargetN} 个单元（注意检查周末/门店周期性共振风险）。`
                                                                    : "按规模辅助变量成比例分配入样概率（πps），适合门店客单量或企业规模差异悬殊的商业总体。"}
                                                        </CardDescription>
                                                    </CardHeader>
                                                    <CardContent className="space-y-4">
                                                        <div className="flex flex-wrap items-end justify-between gap-4 rounded-surface border border-border bg-background p-4">
                                                            <div className="flex flex-wrap items-end gap-4">
                                                                {method === "pps" && (
                                                                    <>
                                                                        <div className="space-y-1.5">
                                                                            <Label className="text-meta">规模变量</Label>
                                                                            <Select value={ppsSizeField} onValueChange={setPpsSizeField}>
                                                                                <SelectTrigger aria-label="选择正式轮PPS规模变量" data-testid="student-sampling-pps-size-field" className="w-48 bg-card">
                                                                                    <SelectValue placeholder="选择规模字段" />
                                                                                </SelectTrigger>
                                                                                <SelectContent>
                                                                                    {ppsEligibleFields.map((f) => (
                                                                                        <SelectItem key={f} value={f}>{f}</SelectItem>
                                                                                    ))}
                                                                                </SelectContent>
                                                                            </Select>
                                                                        </div>
                                                                        <div className="space-y-1.5">
                                                                            <Label htmlFor="formal-pps-n" className="text-meta">
                                                                                抽取数量（{ppsMin}–{ppsMax}）
                                                                            </Label>
                                                                            <Input
                                                                                id="formal-pps-n"
                                                                                type="number"
                                                                                min={ppsMin}
                                                                                max={ppsMax}
                                                                                value={ppsSampleSize}
                                                                                onChange={(e) => setPpsSampleSize(Number(e.target.value))}
                                                                                data-testid="student-sampling-pps-sample-size"
                                                                                className="h-9 w-28 bg-card font-mono"
                                                                            />
                                                                        </div>
                                                                    </>
                                                                )}
                                                                <div className="space-y-1.5">
                                                                    <Label htmlFor={`formal-seed-${method}`} className="text-meta">随机种子（可选）</Label>
                                                                    <Input
                                                                        id={`formal-seed-${method}`}
                                                                        type="number"
                                                                        placeholder="留空随机"
                                                                        value={samplingSeed}
                                                                        onChange={(e) => setSamplingSeed(e.target.value)}
                                                                        className="h-9 w-36 bg-card"
                                                                    />
                                                                </div>
                                                            </div>
                                                            <Button
                                                                type="button"
                                                                onClick={() => void handleRunMethod(method)}
                                                                disabled={
                                                                    executingMethod !== null
                                                                    || refreshRequired
                                                                    || (method === "pps" && (!ppsSizeField || ppsSampleSize < ppsMin || ppsSampleSize > ppsMax))
                                                                }
                                                                data-testid={`student-sampling-${method}-run`}
                                                            >
                                                                {executingMethod === method ? (
                                                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                                                ) : (
                                                                    <Play className="mr-2 h-4 w-4" />
                                                                )}
                                                                {done ? `重新执行${METHOD_LABELS[method]}` : `执行${METHOD_LABELS[method]}`}
                                                            </Button>
                                                        </div>

                                                        {method === "pps" && <PpsProbabilityExplanation result={waveSampling?.pps ?? null} />}

                                                        {done && currentRes && (
                                                            <div className="h-[260px] overflow-hidden rounded-control border border-border">
                                                                <SamplePreviewTable
                                                                    priorityField={analysisTarget?.field}
                                                                    data={(currentRes.data ?? []) as Array<Record<string, unknown>>}
                                                                    total={getSamplingResultCount(method, currentRes)}
                                                                />
                                                            </div>
                                                        )}
                                                    </CardContent>
                                                </Card>
                                            </TabsContent>
                                        );
                                    })}

                                {enabledMethods.includes("stratified") && (
                                    <TabsContent value="stratified" forceMount className="data-[state=inactive]:hidden">
                                        <StratifiedSamplingTab
                                            n={lockedTargetN}
                                            N={N}
                                            taskId={taskId}
                                            populationStats={populationStats}
                                            numericFields={numericFields}
                                            analysisTarget={analysisTarget}
                                            stratumNumericStats={stratumNumericStats}
                                            initialResult={waveSampling?.stratified ?? null}
                                            executing={executingMethod}
                                            setExecuting={setExecutingMethod}
                                            onResult={() => { void reloadExperiment(); }}
                                            onAnimate={() => undefined}
                                            buildSavePayload={() => undefined}
                                            executionTime={executionTime}
                                            setExecutionTime={setExecutionTime}
                                            refreshRequired={refreshRequired}
                                            onRefreshRequired={requireRefresh}
                                        />
                                    </TabsContent>
                                )}
                            </Tabs>

                            {/* Formal Fieldwork Dispatch & QC Card */}
                            <Card className="rounded-surface border-primary-border bg-card" data-testid="student-refinement-dispatch-card">
                                <CardHeader className="border-b border-border pb-4">
                                    <div className="flex flex-wrap items-center justify-between gap-3">
                                        <div>
                                            <CardTitle className="flex items-center gap-2 text-section-title text-foreground">
                                                <Send className="h-5 w-5 text-primary" />
                                                执行正式问卷投放与回收质检
                                            </CardTitle>
                                            <CardDescription className="mt-1">
                                                向当前轮次已完成的所有抽样方法名单同步发放问卷，检验调优后的有效样本留存率与客群结构平衡度
                                            </CardDescription>
                                        </div>
                                        {allCompletedMethodsDispatched ? (
                                            <StatusBadge intent="success">正式轮全部名单已发放回收</StatusBadge>
                                        ) : (
                                            <StatusBadge intent="warning">待执行正式轮问卷发放</StatusBadge>
                                        )}
                                    </div>
                                </CardHeader>
                                <CardContent className="space-y-4 pt-4">
                                    <div className="flex flex-wrap items-center justify-between gap-4 rounded-surface border border-border bg-background p-4">
                                        <div className="flex flex-wrap items-center gap-5">
                                            <div className="flex items-center gap-2">
                                                <Switch
                                                    id="formal-clean-speeder"
                                                    checked={activeWave?.cleaningConfig.removeSpeeders ?? true}
                                                    onCheckedChange={(val) => void handleToggleWaveCleaning({ removeSpeeders: val })}
                                                />
                                                <Label htmlFor="formal-clean-speeder" className="cursor-pointer text-meta">剔除闪电卷</Label>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <Switch
                                                    id="formal-clean-straight"
                                                    checked={activeWave?.cleaningConfig.removeStraightliners ?? true}
                                                    onCheckedChange={(val) => void handleToggleWaveCleaning({ removeStraightliners: val })}
                                                />
                                                <Label htmlFor="formal-clean-straight" className="cursor-pointer text-meta">剔除直线卷</Label>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <Label htmlFor="formal-dispatch-seed" className="text-meta text-muted-foreground">发放种子：</Label>
                                                <Input
                                                    id="formal-dispatch-seed"
                                                    type="number"
                                                    placeholder="可选"
                                                    value={dispatchSeed}
                                                    onChange={(e) => setDispatchSeed(e.target.value)}
                                                    className="h-8 w-28 bg-card text-meta"
                                                />
                                            </div>
                                        </div>
                                        <Button
                                            type="button"
                                            size="lg"
                                            onClick={() => void handleDispatchFormal()}
                                            disabled={completedFormalMethods.length === 0 || dispatching || refreshRequired}
                                            data-testid="student-refinement-dispatch"
                                        >
                                            {dispatching ? (
                                                <><Loader2 className="mr-2 h-4 w-4 animate-spin" />正在投放并质检…</>
                                            ) : (
                                                <><Sparkles className="mr-2 h-4 w-4" />{allCompletedMethodsDispatched ? "重新发放当前正式轮问卷" : "执行正式问卷投放与回收"}</>
                                            )}
                                        </Button>
                                    </div>

                                    {!allCompletedMethodsDispatched && completedFormalMethods.length > 0 && (
                                        <p className="flex items-center gap-2 text-meta text-warning">
                                            <AlertCircle className="h-4 w-4 shrink-0" />
                                            您已更新抽样名单或问卷，请点击「执行正式问卷投放与回收」获取最新实证答卷后再进入第五阶段。
                                        </p>
                                    )}

                                    {activeDiag && (
                                        <div className="grid grid-cols-2 gap-4 pt-2">
                                            <FieldworkFunnelChart
                                                totalEstimatedCost={activeDiag.totalEstimatedCost}
                                                unitEffectiveCost={activeDiag.unitEffectiveCost}
                                                stages={[
                                                    { key: "inv", label: "1. 正式发放邀约", count: activeDiag.invitedCount, description: `${METHOD_LABELS[activeDiag.method]}名单`, tone: "primary" },
                                                    { key: "con", label: "2. 成功触达", count: activeDiag.contactedCount, description: `失联 ${activeDiag.notContactedCount} 份`, tone: "info" },
                                                    { key: "raw", label: "3. 原始完答", count: activeDiag.completedRawCount, description: `拒访 ${activeDiag.refusedCount} · 弃答 ${activeDiag.breakoffCount}`, tone: "warning" },
                                                    { key: "val", label: "4. 质检有效卷", count: activeDiag.cleanedValidCount, description: `有效率 ${formatStatistic(activeDiag.effectiveRatePct, 1)}%`, tone: "success" },
                                                ]}
                                            />
                                            {activeDiag.stratumField && activeDiag.strata.length > 0 && (
                                                <StratumComparisonChart
                                                    stratumField={activeDiag.stratumField}
                                                    rows={activeDiag.strata}
                                                />
                                            )}
                                        </div>
                                    )}
                                </CardContent>
                            </Card>
                        </>
                    )}
                </TabsContent>
            </Tabs>

            <StageActions>
                <Button variant="outline" onClick={onPrev} disabled={completing} data-testid="student-refinement-prev">
                    <ChevronLeft className="mr-1 h-4 w-4" />
                    查看质检诊断单
                </Button>
                <Button
                    onClick={() => void handleCompleteStage4()}
                    disabled={!canCompleteStage4 || completing || refreshRequired}
                    data-testid="student-refinement-complete"
                >
                    {completing ? (
                        <><Loader2 className="mr-2 h-4 w-4 animate-spin" />正在汇总正式数据…</>
                    ) : (
                        <>完成正式投放，进入商务决策报告<ArrowRight className="ml-2 h-4 w-4" /></>
                    )}
                </Button>
            </StageActions>

            <QuestionEditor
                open={questionEditorOpen}
                onOpenChange={setQuestionEditorOpen}
                question={editingQuestion}
                onSave={(saved) => {
                    setQList((prev) => {
                        const exists = prev.some((item) => item.id === saved.id);
                        return exists ? prev.map((item) => (item.id === saved.id ? saved : item)) : [...prev, saved];
                    });
                }}
            />

            {bindingQuestion && dictionary && taskId && (
                <VariableBindingDialog
                    open
                    onOpenChange={(open) => { if (!open) setBindingQuestion(null); }}
                    question={bindingQuestion}
                    dictionary={dictionary}
                    taskId={taskId}
                    onConfirm={(updated) => setQList((prev) => prev.map((item) => (item.id === updated.id ? updated : item)))}
                />
            )}
        </div>
    );
}

export default AdaptiveRefinementStage;
