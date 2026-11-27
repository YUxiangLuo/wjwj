import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
    AlertCircle, ArrowDown, ArrowRight, ArrowUp, Calculator, CheckCircle2,
    ChevronLeft, Coins, Edit2, FileEdit, Layers, Link2, Loader2, Play, Plus,
    RefreshCw, Send, Trash2
} from "lucide-react";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
import { ADJUSTMENT_ACTION_LABELS, ADJUSTMENT_ISSUE_LABELS, buildWaveSnapshotMetric, inferTargetUnitFromExperiment, WaveLoopSnapshot } from "@/components/WaveLoopSnapshot";
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

function parseStrictNumber(raw: string): number {
    const trimmed = raw.trim();
    if (!trimmed) return Number.NaN;
    return Number(trimmed);
}

function parseStrictInteger(raw: string): number {
    const trimmed = raw.trim();
    if (!trimmed || !/^-?\d+$/.test(trimmed)) return Number.NaN;
    return Number.parseInt(trimmed, 10);
}

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
    const formalWaves = useMemo(
        () => (experiment?.waves ?? []).filter((w) => w.waveNumber >= 2),
        [experiment?.waves],
    );
    const activeWave = useMemo(
        () => experiment?.waves?.find((w) => w.waveNumber === activeWaveNum)
            ?? formalWaves.at(-1)
            ?? null,
        [experiment?.waves, activeWaveNum, formalWaves],
    );
    const [viewingWaveNum, setViewingWaveNum] = useState<number>(activeWave?.waveNumber ?? activeWaveNum);
    useEffect(() => {
        setViewingWaveNum(activeWave?.waveNumber ?? activeWaveNum);
    }, [activeWave?.waveNumber, activeWaveNum]);
    const inspectedPriorWave = useMemo(
        () => (viewingWaveNum !== (activeWave?.waveNumber ?? activeWaveNum)
            ? formalWaves.find((w) => w.waveNumber === viewingWaveNum) ?? null
            : null),
        [viewingWaveNum, activeWave?.waveNumber, activeWaveNum, formalWaves],
    );

    const wave1Diag = useMemo(() => {
        if (!wave1?.diagnostics) return null;
        for (const m of ["simple", "stratified", "systematic", "pps"] as const) {
            if (wave1.diagnostics[m]) return wave1.diagnostics[m]!;
        }
        return null;
    }, [wave1?.diagnostics]);

    const verifiedEmpiricalVariance = useMemo<number | null>(() => {
        if (!wave1?.diagnostics) return null;
        for (const m of ["simple", "stratified", "systematic", "pps"] as const) {
            const v = wave1.diagnostics[m]?.empiricalTargetVariance;
            if (v != null && Number.isFinite(v) && v > 0) return v;
        }
        return null;
    }, [wave1?.diagnostics]);

    const [activeTab, setActiveTab] = useState<RefinementTab>(() => {
        const plannedRevise = Boolean(experiment?.adjustmentPlan?.plannedActions?.includes("revise_questionnaire"));
        const hasFormalSampling = Object.keys(activeWave?.samplingResults ?? {}).length > 0;
        if (plannedRevise && !hasFormalSampling) return "questionnaire";
        return "plan";
    });
    const [hasConfirmedPlanInSession, setHasConfirmedPlanInSession] = useState(false);
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
    const [questionToDelete, setQuestionToDelete] = useState<Question | null>(null);
    const [bindingQuestion, setBindingQuestion] = useState<Question | null>(null);
    const [savingQuestionnaire, setSavingQuestionnaire] = useState(false);
    const addWaveQuestionBtnRef = useRef<HTMLButtonElement>(null);

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

    // Wave 2+ Sample Plan State (string-backed to guard 0 / negative / NaN / empty)
    const savedWavePlan = activeWave?.samplePlan ?? experiment?.samplePlan ?? null;
    const isPlanInheritedPrior = estimationType === "mean" && activeWave?.samplePlan?.varianceSource === "prior_estimate";
    const [confidenceLevel, setConfidenceLevel] = useState<string>(savedWavePlan?.confidenceLevel ?? "95");
    const [marginOfErrorInput, setMarginOfErrorInput] = useState<string>(
        String(savedWavePlan?.marginOfError ?? (estimationType === "mean" ? 2 : 5)),
    );
    const [varianceSource, setVarianceSource] = useState<"wave1_empirical" | "population">(
        savedWavePlan?.varianceSource === "wave1_empirical" && verifiedEmpiricalVariance !== null
            ? "wave1_empirical"
            : "population",
    );
    const [designEffectInput, setDesignEffectInput] = useState<string>(String(savedWavePlan?.designEffect ?? 1));
    const [nonResponsePctInput, setNonResponsePctInput] = useState<string>(
        String(
            savedWavePlan
                ? Number((savedWavePlan.nonResponseRate * 100).toPrecision(12))
                : (wave1Diag?.empiricalNonResponseRatePct ?? 20),
        ),
    );
    const [customFinalSizeInput, setCustomFinalSizeInput] = useState<string | null>(
        !isPlanInheritedPrior && savedWavePlan?.finalSampleSize != null ? String(savedWavePlan.finalSampleSize) : null,
    );
    const [savingPlan, setSavingPlan] = useState(false);

    useEffect(() => {
        if (varianceSource === "wave1_empirical" && verifiedEmpiricalVariance === null) {
            setVarianceSource("population");
        }
    }, [varianceSource, verifiedEmpiricalVariance]);

    useEffect(() => {
        setHasConfirmedPlanInSession(false);
        const plan = activeWave?.samplePlan;
        if (!plan) return;
        const inheritedPrior = estimationType === "mean" && plan.varianceSource === "prior_estimate";
        setConfidenceLevel(plan.confidenceLevel ?? "95");
        setMarginOfErrorInput(String(plan.marginOfError ?? (estimationType === "mean" ? 2 : 5)));
        setVarianceSource(
            plan.varianceSource === "wave1_empirical" && verifiedEmpiricalVariance !== null
                ? "wave1_empirical"
                : "population",
        );
        setDesignEffectInput(String(plan.designEffect ?? 1));
        setNonResponsePctInput(String(Number(((plan.nonResponseRate ?? 0.2) * 100).toPrecision(12))));
        setCustomFinalSizeInput(!inheritedPrior && plan.finalSampleSize != null ? String(plan.finalSampleSize) : null);
    }, [activeWave?.waveNumber]);

    const marginOfError = parseStrictNumber(marginOfErrorInput);
    const designEffect = parseStrictNumber(designEffectInput);
    const nonResponsePct = parseStrictNumber(nonResponsePctInput);

    // Wave 2+ Sampling & Dispatch State
    const waveSampling = (activeWave?.samplingResults ?? null) as SamplingResultsData | null;
    const effectivePolicy = useMemo(() => applyPpsAvailability(basePolicy, waveSampling), [basePolicy, waveSampling]);
    const enabledMethods = useMemo(
        () => SAMPLING_METHODS.filter((m) => effectivePolicy.methods[m] !== "disabled"),
        [effectivePolicy],
    );
    const [activeMethod, setActiveMethod] = useState<MethodKey>(() => {
        const reqMethod = enabledMethods.find((m) => effectivePolicy.methods[m] === "required" && m !== "simple");
        return reqMethod ?? enabledMethods[0] ?? "simple";
    });
    useEffect(() => {
        if (enabledMethods.length > 0 && !enabledMethods.includes(activeMethod)) {
            setActiveMethod(enabledMethods[0]!);
        }
    }, [enabledMethods, activeMethod]);
    const [executingMethod, setExecutingMethod] = useState<MethodKey | null>(null);
    const [executionTime, setExecutionTime] = useState<number | null>(null);
    const [ppsSizeField, setPpsSizeField] = useState<string>(waveSampling?.pps?.sizeField ?? "");
    const [ppsSampleSizeInput, setPpsSampleSizeInput] = useState<string>(
        String(waveSampling?.pps?.sampleCount ?? (savedWavePlan?.finalSampleSize ?? 30)),
    );
    const ppsSampleSize = parseStrictInteger(ppsSampleSizeInput);
    const [samplingSeed, setSamplingSeed] = useState<string>("");
    const [dispatchSeed, setDispatchSeed] = useState<string>("");
    const [dispatching, setDispatching] = useState(false);
    const [updatingWaveCleaning, setUpdatingWaveCleaning] = useState(false);
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

    const canonicalJson = useCallback((value: unknown): string => {
        if (value === null || typeof value !== "object") return JSON.stringify(value);
        if (Array.isArray(value)) return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
        const record = value as Record<string, unknown>;
        const keys = Object.keys(record)
            .filter((k) => record[k] !== undefined)
            .sort();
        return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(record[k])}`).join(",")}}`;
    }, []);

    const waveQuestionnaire = useMemo<QuestionnaireData>(
        () => ({ title: qTitle, welcomeText: qWelcome, endingText: qEnding, questions: qList }),
        [qTitle, qWelcome, qEnding, qList],
    );
    const isQuestionnaireDirty = useMemo(
        () => canonicalJson(waveQuestionnaire) !== canonicalJson(sourceQ),
        [canonicalJson, waveQuestionnaire, sourceQ],
    );

    const wave1Burden = useMemo(
        () => evaluateQuestionnaireBurden(wave1?.questionnaire, dictionary, analysisTarget),
        [wave1?.questionnaire, dictionary, analysisTarget],
    );
    const currentBurden = useMemo(
        () => evaluateQuestionnaireBurden(waveQuestionnaire, dictionary, analysisTarget),
        [waveQuestionnaire, dictionary, analysisTarget],
    );
    const primaryTargetField = experiment?.analysisTarget && !experiment.analysisTarget.inferred
        ? experiment.analysisTarget.target.field
        : null;
    const requiresTargetBinding = Boolean(dictionary && primaryTargetField);
    const targetBindingPassed = !requiresTargetBinding || currentBurden.primaryTargetBound;

    const activeVariance = useMemo<number | null | undefined>(() => {
        if (estimationType !== "mean") return undefined;
        if (varianceSource === "wave1_empirical" && verifiedEmpiricalVariance !== null) {
            return verifiedEmpiricalVariance;
        }
        if (populationVariance && populationVariance > 0) return populationVariance;
        if (!isPlanInheritedPrior && savedWavePlan?.populationVariance && savedWavePlan.populationVariance > 0) {
            return savedWavePlan.populationVariance;
        }
        return null;
    }, [estimationType, varianceSource, verifiedEmpiricalVariance, populationVariance, isPlanInheritedPrior, savedWavePlan?.populationVariance]);

    const bounds = useMemo(() => getFinalSampleSizeBounds(N, minimumSampleSize), [N, minimumSampleSize]);
    const safeNrrFraction = Number.isFinite(nonResponsePct)
        ? Math.min(0.5, Math.max(0, Number((nonResponsePct / 100).toPrecision(12))))
        : 0.2;
    const stepDetails = useMemo(() => calculateSampleSizeStepDetails({
        estimationType,
        confidenceLevel,
        marginOfError: Number.isFinite(marginOfError) && marginOfError > 0 ? marginOfError : 1,
        populationSize: N,
        populationVariance: activeVariance ?? 100,
        designEffect: Number.isFinite(designEffect) && designEffect >= 0.5 && designEffect <= 5 ? designEffect : 1,
        nonResponseRate: safeNrrFraction,
    }), [estimationType, confidenceLevel, marginOfError, N, activeVariance, designEffect, safeNrrFraction]);

    const recommendedSize = Math.max(bounds.min, Math.min(bounds.max, stepDetails.n3 || bounds.min));
    const effectiveFinalSize = customFinalSizeInput === null
        ? recommendedSize
        : parseStrictInteger(customFinalSizeInput);
    const isFinalSizeValid = Number.isSafeInteger(effectiveFinalSize)
        && effectiveFinalSize >= bounds.min
        && effectiveFinalSize <= bounds.max;

    const planValidationError = useMemo<string | null>(() => {
        if (!Number.isFinite(marginOfError) || marginOfError <= 0) {
            return "请输入大于 0 的正式轮目标误差限";
        }
        if (estimationType === "proportion" && (marginOfError < 1 || marginOfError > 10)) {
            return "比例估计目标误差限 E 需在 1%–10% 之间";
        }
        if (!Number.isFinite(nonResponsePct) || nonResponsePct < 0 || nonResponsePct > 50) {
            return "预期无回答/损耗率需在 0%–50% 之间";
        }
        if (estimationType === "mean" && (activeVariance == null || activeVariance <= 0)) {
            return statsLoading ? null : "当前方差参数不可用，请检查总体或首轮有效样本数据";
        }
        if (!Number.isFinite(designEffect) || designEffect < 0.5 || designEffect > 5) {
            return "设计效应 deff 需在 0.5–5 之间";
        }
        if (!isFinalSizeValid) {
            return `正式轮发放样本量需为 ${bounds.min}–${bounds.max.toLocaleString()} 之间的整数`;
        }
        return null;
    }, [marginOfError, estimationType, nonResponsePct, activeVariance, statsLoading, designEffect, isFinalSizeValid, bounds]);

    const handleImportWave1Empirical = () => {
        if (!wave1Diag) return;
        setNonResponsePctInput(String(wave1Diag.empiricalNonResponseRatePct));
        setCustomFinalSizeInput(null);
        if (estimationType === "proportion") {
            toast.success(`已代入首轮实测无回答率（${wave1Diag.empiricalNonResponseRatePct}%）！`);
            return;
        }
        if (verifiedEmpiricalVariance !== null) {
            setVarianceSource("wave1_empirical");
            toast.success(`已代入首轮实测无回答率（${wave1Diag.empiricalNonResponseRatePct}%）与实测样本标准差（s=${formatStatistic(Math.sqrt(verifiedEmpiricalVariance), 2)}）！`);
        } else {
            setVarianceSource("population");
            toast.info(`已代入首轮实测无回答率（${wave1Diag.empiricalNonResponseRatePct}%）；因首轮有效样本不足以计算正样本方差 s²，方差依据已采用抽样框总体方差。`);
        }
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
        nonResponseRate: safeNrrFraction,
        recommendedSize,
        finalSampleSize: effectiveFinalSize,
    }), [estimationType, confidenceLevel, marginOfError, activeVariance, varianceSource, designEffect, safeNrrFraction, recommendedSize, effectiveFinalSize]);

    const handleSaveWavePlan = async () => {
        if (!taskId || !experiment || savingPlan || planValidationError !== null || refreshRequired) {
            if (planValidationError) toast.error(planValidationError);
            return;
        }
        setSavingPlan(true);
        try {
            const payload = buildFormalPlanPayload();
            const res = await experimentApi.saveWavePlan(taskId, experiment.version, payload);
            if (res.success && res.data) {
                updateExperiment(res.data);
                setHasConfirmedPlanInSession(true);
                const nextN = res.data.samplePlan?.finalSampleSize ?? payload.finalSampleSize;
                setCustomFinalSizeInput(String(nextN));
                setPpsSampleSizeInput(String(nextN));
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
        if (!taskId || !experiment || savingQuestionnaire || !targetBindingPassed || refreshRequired) return;
        setSavingQuestionnaire(true);
        try {
            const res = await experimentApi.saveWaveQuestionnaire(taskId, experiment.version, waveQuestionnaire);
            if (res.success && res.data) {
                updateExperiment(res.data);
                const updatedWave = res.data.waves?.find((w) => w.waveNumber === (res.data?.activeWaveNumber ?? activeWaveNum));
                const persistedQ = updatedWave?.questionnaire ?? res.data.questionnaire;
                if (persistedQ) {
                    setQTitle(persistedQ.title);
                    setQWelcome(persistedQ.welcomeText);
                    setQEnding(persistedQ.endingText);
                    setQList(persistedQ.questions);
                }
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

    const lockedTargetN = !isPlanInheritedPrior
        ? (activeWave?.samplePlan?.finalSampleSize ?? 0)
        : 0;
    useEffect(() => {
        if (lockedTargetN > 0) {
            const range = getSamplingAcceptedRange(lockedTargetN, N);
            if (range && (!Number.isSafeInteger(ppsSampleSize) || ppsSampleSize < range.min || ppsSampleSize > range.max)) {
                setPpsSampleSizeInput(String(lockedTargetN));
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
            const count = getSamplingResultCount(m, r);
            if (count <= 0 || lockedTargetN <= 0) return true;
            if (m === "pps") {
                const range = getSamplingAcceptedRange(lockedTargetN, N);
                return range ? count >= range.min && count <= range.max : true;
            }
            return count === lockedTargetN;
        });
    }, [enabledMethods, waveSampling, lockedTargetN, N]);

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
        if (!taskId || !experiment || !activeWave || updatingWaveCleaning || refreshRequired) return;
        const nextCleaning: CleaningConfig = { ...activeWave.cleaningConfig, ...patch };
        setUpdatingWaveCleaning(true);
        try {
            const res = await experimentApi.updateCleaningConfig(taskId, experiment.version, nextCleaning, activeWave.waveNumber);
            if (res.success && res.data) {
                updateExperiment(res.data);
                toast.success("正式轮质检清洗规则已更新");
            } else if (res.error?.code === "VERSION_CONFLICT") {
                requireRefresh();
            } else {
                toast.error(res.error?.message ?? "更新正式轮质检规则失败");
            }
        } catch {
            toast.error("网络异常，更新质检规则失败，请重试");
        } finally {
            setUpdatingWaveCleaning(false);
        }
    };

    const handleCreateExtraWave = async () => {
        if (!taskId || !experiment || creatingNewWave || refreshRequired) return;
        setCreatingNewWave(true);
        try {
            const res = await experimentApi.createRefinementWave(taskId, experiment.version);
            if (res.success && res.data) {
                updateExperiment(res.data);
                setActiveTab("plan");
                toast.success(`已创建第 ${res.data.activeWaveNumber} 轮进阶微调波次，请核对样本量后重新抽样与投放`);
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
        !isQuestionnaireDirty
        && targetBindingPassed
        && lockedTargetN >= bounds.min
        && policyProgress.canComplete
        && allCompletedMethodsDispatched;

    const handleCompleteStage4 = async () => {
        if (!canCompleteStage4 || !activeWave?.samplePlan || completing || refreshRequired) return;
        setCompleting(true);
        try {
            await completeStage(4, {
                questionnaire: activeWave.questionnaire,
                samplePlan: activeWave.samplePlan,
            });
        } finally {
            setCompleting(false);
        }
    };

    const unitLabel = useMemo(() => {
        const dictUnit = analysisTarget?.field && dictionary
            ? dictionary.variables.find((v) => v.field === analysisTarget.field)?.unit
            : "";
        return inferTargetUnitFromExperiment({
            analysisTarget: experiment?.analysisTarget,
            explicitUnit: dictUnit,
            waves: experiment?.waves,
            questionnaire: experiment?.questionnaire,
        });
    }, [analysisTarget?.field, dictionary, experiment?.analysisTarget, experiment?.waves, experiment?.questionnaire]);
    const isPlanUnconfirmedFromPilot = useMemo(() => {
        if (hasConfirmedPlanInSession) return false;
        if (!activeWave || activeWave.waveNumber !== 2 || !wave1?.samplePlan || !activeWave.samplePlan) return false;
        if (Object.keys(activeWave.samplingResults ?? {}).length > 0 || activeWave.fieldwork) return false;
        return canonicalJson(activeWave.samplePlan) === canonicalJson(wave1.samplePlan);
    }, [hasConfirmedPlanInSession, activeWave, wave1?.samplePlan, canonicalJson]);
    const isPlanDirty = useMemo(() => {
        if (isPlanInheritedPrior || !activeWave?.samplePlan || planValidationError !== null) return false;
        const p = activeWave.samplePlan;
        return (
            effectiveFinalSize !== p.finalSampleSize
            || confidenceLevel !== p.confidenceLevel
            || Math.abs(marginOfError - p.marginOfError) > 1e-6
            || Math.abs(designEffect - (p.designEffect ?? 1)) > 1e-6
            || Math.abs(safeNrrFraction - (p.nonResponseRate ?? 0)) > 1e-6
            || (estimationType === "mean" && varianceSource !== p.varianceSource)
        );
    }, [isPlanInheritedPrior, activeWave?.samplePlan, planValidationError, safeNrrFraction, effectiveFinalSize, confidenceLevel, marginOfError, designEffect, estimationType, varianceSource]);
    const needsFormalPlanSave = lockedTargetN < bounds.min || isPlanDirty || isPlanUnconfirmedFromPilot;
    const needsFormalDispatch = policyProgress.canComplete && !isQuestionnaireDirty && targetBindingPassed && !allCompletedMethodsDispatched;
    const firstWaveMetric = wave1 ? buildWaveSnapshotMetric(wave1, "simple", unitLabel) ?? buildWaveSnapshotMetric(wave1, undefined, unitLabel) : null;
    const activeWaveHasDiagnostics = Boolean(activeWave && Object.keys(activeWave.diagnostics ?? {}).length > 0);
    const scorecardPreferredMethod = activeMethod !== "simple" && activeWave?.diagnostics?.[activeMethod]
        ? activeMethod
        : undefined;
    const activeWaveMetric = !inspectedPriorWave && activeWave && activeWaveHasDiagnostics
        ? buildWaveSnapshotMetric(activeWave, scorecardPreferredMethod, unitLabel) ?? buildWaveSnapshotMetric(activeWave, undefined, unitLabel)
        : null;
    const activeDiag = activeWave?.diagnostics?.[activeMethod] ?? (completedFormalMethods[0] ? activeWave?.diagnostics?.[completedFormalMethods[0]] : null) ?? null;

    const stage4Blocker = useMemo<{ text: string; targetTab?: RefinementTab } | null>(() => {
        if (canCompleteStage4) return null;
        if (!targetBindingPassed) {
            return { text: `请先在步骤 1 绑定核心研究指标「${primaryTargetField ?? ""}」并保存问卷`, targetTab: "questionnaire" };
        }
        if (isQuestionnaireDirty) {
            return { text: "步骤 1 存在未保存的问卷修订，请先保存问卷", targetTab: "questionnaire" };
        }
        if (lockedTargetN < bounds.min) {
            return { text: "请先在步骤 2 保存正式轮样本量规划", targetTab: "plan" };
        }
        if (!policyProgress.canComplete) {
            const missingText = policyProgress.missingRequired.length > 0
                ? `还需完成必做：${policyProgress.missingRequired.map((m) => METHOD_LABELS[m]).join("、")}`
                : `还需再完成 ${Math.max(1, policyProgress.minimumCompleted - completedFormalMethods.length)} 种抽样方法`;
            return { text: `步骤 3 ${missingText}`, targetTab: "sampling" };
        }
        if (!allCompletedMethodsDispatched) {
            return { text: "请在步骤 3 点击「执行正式问卷投放与回收」", targetTab: "sampling" };
        }
        return null;
    }, [canCompleteStage4, targetBindingPassed, primaryTargetField, isQuestionnaireDirty, lockedTargetN, bounds.min, policyProgress, completedFormalMethods.length, allCompletedMethodsDispatched]);

    const ppsAcceptedRange = lockedTargetN > 0 ? getSamplingAcceptedRange(lockedTargetN, N) : null;
    const ppsMin = ppsAcceptedRange?.min ?? 1;
    const ppsMax = ppsAcceptedRange?.max ?? N;
    const isPpsSampleSizeValid = Number.isSafeInteger(ppsSampleSize) && ppsSampleSize >= ppsMin && ppsSampleSize <= ppsMax;
    const systematicInterval = lockedTargetN > 0 ? getSystematicInterval(N, lockedTargetN) : null;

    const displayFormalSize = isFinalSizeValid ? effectiveFinalSize : recommendedSize;
    const expectedFormalCompletes = Math.round(displayFormalSize * (1 - safeNrrFraction));
    const estimatedFormalCost =
        displayFormalSize * fieldworkConfig.contactCostPerUnit
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
            <section className="rounded-surface border border-border bg-card p-5">
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
                            <strong className="font-medium">本轮调优动作：</strong>
                            {experiment?.adjustmentPlan?.plannedActions.map((a) => ADJUSTMENT_ACTION_LABELS[a] ?? a).join("；") || "结合首轮实测参数优化问卷、样本量与抽样策略"}
                        </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        {formalWaves.length >= 2 && (
                            <div className="flex flex-wrap items-center gap-1 rounded-control bg-muted p-1" data-testid="student-refinement-wave-switcher">
                                {formalWaves.map((fw) => {
                                    const isCurrentActive = fw.waveNumber === (activeWave?.waveNumber ?? activeWaveNum);
                                    const isSelected = fw.waveNumber === viewingWaveNum;
                                    return (
                                        <button
                                            key={fw.waveNumber}
                                            type="button"
                                            aria-pressed={isSelected}
                                            onClick={() => setViewingWaveNum(fw.waveNumber)}
                                            data-testid={`student-refinement-switch-wave-${fw.waveNumber}`}
                                            className={`rounded-pill px-3 py-1 text-meta font-medium ${
                                                isSelected
                                                    ? "bg-accent text-accent-foreground"
                                                    : "text-muted-foreground hover:bg-card hover:text-foreground"
                                            }`}
                                        >
                                            Wave {fw.waveNumber}{isCurrentActive ? "（当前）" : "（历史）"}
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                        {(experiment?.waves?.length ?? 0) < 4 && canCompleteStage4 && (
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
                </div>
            </section>

            {/* Live Wave 1 -> Active Wave Delta Scorecard when dispatched */}
            {firstWaveMetric && activeWaveMetric && (
                <WaveDeltaScorecard firstWave={firstWaveMetric} finalWave={activeWaveMetric} />
            )}

            {/* Newly created Wave 3+ onboarding banner before its first dispatch */}
            {!inspectedPriorWave && activeWave && activeWave.waveNumber >= 3 && !activeWaveHasDiagnostics && (
                <div
                    role="status"
                    data-testid="student-refinement-wave3-onboarding"
                    className="flex flex-wrap items-center justify-between gap-3 rounded-surface bg-muted px-4 py-3 text-label text-foreground"
                >
                    <span>
                        已进入<strong className="font-medium">第 {activeWave.waveNumber} 轮进阶微调工作台</strong>：已继承上一轮问卷与样本量基线。请按需调整问卷（步骤 1）或样本量（步骤 2），随后在步骤 3 重新执行抽样与问卷投放。
                    </span>
                    {formalWaves.length >= 2 && (
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="bg-card text-meta"
                            onClick={() => setViewingWaveNum(formalWaves[formalWaves.length - 2]!.waveNumber)}
                        >
                            对照查看 Wave {formalWaves[formalWaves.length - 2]!.waveNumber} 历史结果
                        </Button>
                    )}
                </div>
            )}

            {inspectedPriorWave ? (
                <Card className="rounded-surface border-border bg-card p-5" data-testid="student-refinement-prior-wave-view">
                    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
                        <div>
                            <h3 className="text-subheading font-semibold text-foreground">
                                只读复盘：{inspectedPriorWave.label}
                            </h3>
                            <p className="text-meta text-muted-foreground">
                                此波次已归档锁定，可对照查看历史漏斗与估计结果；返回当前第 {activeWave?.waveNumber ?? activeWaveNum} 轮可继续编辑与投放。
                            </p>
                        </div>
                        <Button
                            type="button"
                            variant={canCompleteStage4 ? "outline" : "secondary"}
                            size="sm"
                            onClick={() => setViewingWaveNum(activeWave?.waveNumber ?? activeWaveNum)}
                            data-testid="student-refinement-back-to-active-wave"
                        >
                            返回当前 Wave {activeWave?.waveNumber ?? activeWaveNum} 工作台
                        </Button>
                    </div>
                    <WaveLoopSnapshot
                        waves={wave1 ? [wave1, inspectedPriorWave] : [inspectedPriorWave]}
                        analysisTarget={experiment?.analysisTarget}
                        unitLabel={unitLabel}
                    />
                </Card>
            ) : (
            /* Three Studio Sub-Tabs */
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as RefinementTab)} className="space-y-5">
                <TabsList className="grid h-auto w-full grid-cols-3 gap-1 rounded-control bg-muted p-1">
                    <TabsTrigger value="questionnaire" className="gap-2 py-2.5 text-label" data-testid="student-refinement-tab-questionnaire">
                        <FileEdit className="h-4 w-4" />
                        1. 问卷精简与规则修订（按需）
                        {!targetBindingPassed ? (
                            <StatusBadge intent="destructive">待绑定主指标</StatusBadge>
                        ) : isQuestionnaireDirty ? (
                            <StatusBadge intent="warning">未保存</StatusBadge>
                        ) : null}
                    </TabsTrigger>
                    <TabsTrigger value="plan" className="gap-2 py-2.5 text-label" data-testid="student-refinement-tab-plan">
                        <Calculator className="h-4 w-4" />
                        2. 代入实测参数重算样本量
                        {isPlanDirty || isPlanUnconfirmedFromPilot ? (
                            <StatusBadge intent="warning">{isPlanDirty ? "未保存" : "待确认"}</StatusBadge>
                        ) : lockedTargetN >= bounds.min ? (
                            <CheckCircle2 className="h-4 w-4 text-success" />
                        ) : null}
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
                            <div className="flex flex-wrap items-start justify-between gap-3">
                                <div>
                                    <CardTitle className="text-section-title text-foreground">修订正式轮问卷（降低弃答率与修复量程边界）</CardTitle>
                                    <CardDescription className="mt-1">
                                        首轮预计耗时 {wave1Burden.estimatedDurationSec}s（{wave1Burden.questionCount} 题） → 当前正式轮预计耗时{" "}
                                        <strong className="text-foreground">{currentBurden.estimatedDurationSec}s（{currentBurden.questionCount} 题）</strong>
                                    </CardDescription>
                                </div>
                                <div className="flex flex-wrap items-center gap-2">
                                    {dictionary && (
                                        <Button type="button" variant={canCompleteStage4 ? "outline" : "secondary"} size="sm" onClick={handleAutoBindWaveQuestions}>
                                            <Link2 className="h-3.5 w-3.5" />
                                            一键智能绑定变量
                                        </Button>
                                    )}
                                    <Button
                                        ref={addWaveQuestionBtnRef}
                                        type="button"
                                        size="sm"
                                        disabled={qList.length >= 50}
                                        onClick={() => {
                                            setEditingQuestion(undefined);
                                            setQuestionEditorOpen(true);
                                        }}
                                        variant="outline"
                                    >
                                        <Plus className="h-4 w-4" />
                                        新增题目
                                    </Button>
                                    <Button
                                        type="button"
                                        size="sm"
                                        variant={isQuestionnaireDirty ? "default" : "outline"}
                                        onClick={() => void handleSaveQuestionnaire()}
                                        disabled={savingQuestionnaire || qList.length < 5 || qList.length > 50 || !targetBindingPassed || refreshRequired}
                                        data-testid="student-refinement-save-questionnaire"
                                    >
                                        {savingQuestionnaire ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                                        保存修订问卷
                                    </Button>
                                    {!isQuestionnaireDirty && targetBindingPassed && (
                                        <Button
                                            type="button"
                                            variant={canCompleteStage4 ? "outline" : "secondary"}
                                            size="sm"
                                            onClick={() => setActiveTab("plan")}
                                            data-testid="student-refinement-skip-questionnaire"
                                        >
                                            无需改卷，进入实测样本量重算
                                            <ArrowRight className="h-4 w-4" />
                                        </Button>
                                    )}
                                </div>
                            </div>
                            {!targetBindingPassed && primaryTargetField && (
                                <p role="alert" className="mt-3 rounded-control border border-destructive-border bg-destructive-muted px-3 py-2 text-meta text-destructive">
                                    核心商业研究指标「{primaryTargetField}」尚未关联到题目，请点击「一键智能绑定变量」或题目右侧「关联变量」后再保存。
                                </p>
                            )}
                            {isQuestionnaireDirty && targetBindingPassed && (
                                <p role="status" className="mt-3 rounded-control border border-warning-border bg-warning-muted px-3 py-2 text-meta text-warning">
                                    当前问卷有未保存的修订，请点击右上角「保存修订问卷」并在步骤 3 重新执行正式问卷投放。
                                </p>
                            )}
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
                                            onClick={() => setQuestionToDelete(q)}
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    </div>
                                </div>
                            ))}
                            <div className="flex flex-wrap items-center justify-between gap-3 pt-4">
                                <span className="text-meta text-muted-foreground">
                                    {isQuestionnaireDirty
                                        ? "已修改问卷题目，请先点击「保存修订问卷」再进入下一步样本量重算。"
                                        : "若当前问卷题量与量程已满足要求，可直接跳过改卷进入步骤 2 重算样本量。"}
                                </span>
                                <Button
                                    type="button"
                                    variant={!canCompleteStage4 && !isQuestionnaireDirty && targetBindingPassed ? "default" : "outline"}
                                    disabled={isQuestionnaireDirty || !targetBindingPassed}
                                    onClick={() => setActiveTab("plan")}
                                    data-testid="student-refinement-next-to-plan"
                                    className="px-5"
                                >
                                    下一步：代入实测参数重算样本量
                                    <ArrowRight className="h-4 w-4" />
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* Sub-Tab 2: Empirical Parameter Sample Recalculation */}
                <TabsContent value="plan" className="space-y-4">
                    <Card className="rounded-surface border-border bg-card">
                        <CardHeader className="border-b border-border pb-4">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                                <div>
                                    <CardTitle className="text-section-title text-foreground">基于首轮实测参数重算正式投放样本量</CardTitle>
                                    <CardDescription className="mt-1">
                                        用首轮试投获得的实测无回答率与样本标准差替代盲目猜测，确保质检清洗后仍满足目标商业决策精度
                                    </CardDescription>
                                </div>
                                {wave1Diag && (
                                    <Button
                                        type="button"
                                        variant="secondary"
                                        size="sm"
                                        onClick={handleImportWave1Empirical}
                                        data-testid="student-refinement-import-empirical"
                                        className="shrink-0"
                                    >
                                        <RefreshCw className="h-4 w-4" />
                                        {estimationType === "proportion" ? "一键代入首轮实测无回答率" : "一键代入首轮实测无回答率与样本方差"}
                                    </Button>
                                )}
                            </div>
                        </CardHeader>
                        <CardContent className="space-y-5 pt-5">
                            {isPlanInheritedPrior && (
                                <p role="status" className="rounded-control bg-muted px-3.5 py-2.5 text-meta text-muted-foreground">
                                    正式投放阶段须采用首轮实测样本方差 s² 或抽样框总体方差 σ²（不能沿用试投轮的先验猜测值），请核对下方参数并保存正式轮样本量。
                                </p>
                            )}
                            {!isPlanInheritedPrior && isPlanUnconfirmedFromPilot && (
                                <p role="status" data-testid="student-refinement-pilot-plan-notice" className="rounded-control bg-muted px-3.5 py-2.5 text-meta text-muted-foreground">
                                    当前表单初始沿用了首轮试投参数（n={wave1?.samplePlan?.finalSampleSize}）。建议点击右上角「一键代入首轮实测无回答率」并收紧正式轮目标误差限，随后点击底部「保存正式轮样本量并去抽样」。
                                </p>
                            )}
                            <div className="grid grid-cols-3 gap-4">
                                <div className="space-y-2">
                                    <Label className="text-foreground">正式轮置信水平</Label>
                                    <Select
                                        value={confidenceLevel}
                                        onValueChange={(v) => {
                                            setConfidenceLevel(v);
                                            setCustomFinalSizeInput(null);
                                        }}
                                    >
                                        <SelectTrigger aria-label="选择正式轮置信水平" className="bg-card">
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
                                        {estimationType === "mean"
                                            ? `正式轮目标误差限 e${unitLabel ? `（${unitLabel}）` : ""}`
                                            : "正式轮目标误差限 E (1%–10%)"}
                                    </Label>
                                    <Input
                                        id="formal-margin-error"
                                        type="number"
                                        min={estimationType === "proportion" ? 1 : 0.1}
                                        max={estimationType === "proportion" ? 10 : undefined}
                                        step={estimationType === "mean" ? 0.5 : 1}
                                        value={marginOfErrorInput}
                                        aria-invalid={!Number.isFinite(marginOfError) || marginOfError <= 0 || (estimationType === "proportion" && (marginOfError < 1 || marginOfError > 10)) || undefined}
                                        onChange={(e) => {
                                            setMarginOfErrorInput(e.target.value);
                                            setCustomFinalSizeInput(null);
                                        }}
                                        className="bg-card tabular-nums"
                                    />
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="formal-nrr" className="text-foreground">
                                        预期无回答/损耗率 (%)
                                        {wave1Diag && <span className="ml-1 text-meta text-muted-foreground">（首轮实测 {wave1Diag.empiricalNonResponseRatePct}%）</span>}
                                    </Label>
                                    <Input
                                        id="formal-nrr"
                                        type="number"
                                        min={0}
                                        max={50}
                                        step="any"
                                        value={nonResponsePctInput}
                                        aria-invalid={!Number.isFinite(nonResponsePct) || nonResponsePct < 0 || nonResponsePct > 50 || undefined}
                                        onChange={(e) => {
                                            setNonResponsePctInput(e.target.value);
                                            setCustomFinalSizeInput(null);
                                        }}
                                        className="bg-card tabular-nums"
                                    />
                                </div>
                            </div>

                            {estimationType === "mean" && (
                                <div className="grid grid-cols-2 gap-4 rounded-surface bg-muted p-4">
                                    <div className="space-y-2">
                                        <Label className="text-foreground">正式轮方差参数依据</Label>
                                        <Select
                                            value={varianceSource}
                                            onValueChange={(v) => {
                                                setVarianceSource(v as "wave1_empirical" | "population");
                                                setCustomFinalSizeInput(null);
                                            }}
                                        >
                                            <SelectTrigger aria-label="选择正式轮方差参数依据" className="bg-card">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="wave1_empirical" disabled={verifiedEmpiricalVariance === null}>
                                                    首轮质检后实测样本方差 s²{verifiedEmpiricalVariance === null ? "（首轮有效样本不足以计算）" : "（闭环实证推荐）"}
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
                                                    标准差 ≈ {formatStatistic(Math.sqrt(activeVariance), 2)}{unitLabel ? ` ${unitLabel}` : ""}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )}

                            <div className="grid grid-cols-2 gap-4 rounded-surface bg-muted p-4">
                                <div className="space-y-2">
                                    <div className="flex flex-wrap items-center justify-between gap-2 text-meta text-muted-foreground">
                                        <span>四步推导（{stepDetails.formulaLabel}）</span>
                                        <span className="font-mono tabular-nums text-foreground">
                                            n₀={stepDetails.n0} → FPC={stepDetails.n2} → 推荐 {recommendedSize} 份
                                        </span>
                                    </div>
                                    <div className="flex flex-wrap items-center gap-2">
                                        <Label htmlFor="formal-final-size" className="shrink-0 text-label font-medium text-foreground">
                                            正式轮发放样本量：
                                        </Label>
                                        <Input
                                            id="formal-final-size"
                                            type="number"
                                            min={bounds.min}
                                            max={bounds.max}
                                            value={customFinalSizeInput ?? String(recommendedSize)}
                                            aria-invalid={!isFinalSizeValid || undefined}
                                            onChange={(e) => setCustomFinalSizeInput(e.target.value)}
                                            data-testid="student-refinement-final-size"
                                            className="h-9 w-28 bg-card font-mono font-medium tabular-nums"
                                        />
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            onClick={() => setCustomFinalSizeInput(null)}
                                            className="bg-card text-meta"
                                        >
                                            采用推荐值 {recommendedSize}
                                        </Button>
                                    </div>
                                    <p className="text-meta text-muted-foreground">
                                        首轮发放：{wave1?.samplePlan?.finalSampleSize ?? "—"} 份 → 正式轮规划：{isFinalSizeValid ? effectiveFinalSize : "—"} 份（范围 {bounds.min}–{bounds.max}）
                                    </p>
                                    {wave1?.samplePlan?.finalSampleSize != null && isFinalSizeValid && effectiveFinalSize <= wave1.samplePlan.finalSampleSize && effectiveFinalSize < N && (
                                        <p className="text-meta text-warning">
                                            提示：当前正式轮样本量（{effectiveFinalSize} 份）未高于首轮试投（{wave1.samplePlan.finalSampleSize} 份）；正式投放建议适当收紧目标误差限以提升决策精度。
                                        </p>
                                    )}
                                </div>

                                <div className="flex flex-col justify-between rounded-control border border-border bg-card p-3">
                                    <div className="flex items-center justify-between text-meta font-medium text-foreground">
                                        <span className="flex items-center gap-1.5">
                                            <Coins className="h-4 w-4 text-muted-foreground" />
                                            正式轮参考经费预估
                                        </span>
                                        <span className="tabular-nums">¥{formatStatistic(estimatedFormalCost, 0)}</span>
                                    </div>
                                    <p className="mt-1 text-meta text-muted-foreground tabular-nums">
                                        首轮实际参考成本 ¥{formatStatistic(wave1Diag?.totalEstimatedCost ?? 0, 0)} · 本轮预期有效完答约 {expectedFormalCompletes} 份
                                    </p>
                                </div>
                            </div>

                            {planValidationError && (
                                <p role="alert" data-testid="student-refinement-plan-error" className="text-meta font-medium text-destructive">
                                    {planValidationError}
                                </p>
                            )}

                            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                                <div className="flex items-center gap-2 text-meta text-muted-foreground">
                                    <Label htmlFor="formal-deff" className="text-meta">设计效应 deff：</Label>
                                    <Input
                                        id="formal-deff"
                                        type="number"
                                        step={0.1}
                                        min={0.5}
                                        max={5}
                                        value={designEffectInput}
                                        aria-invalid={!Number.isFinite(designEffect) || designEffect < 0.5 || designEffect > 5 || undefined}
                                        onChange={(e) => {
                                            setDesignEffectInput(e.target.value);
                                            setCustomFinalSizeInput(null);
                                        }}
                                        className="h-8 w-20 bg-card text-center font-mono text-meta"
                                    />
                                </div>
                                <Button
                                    type="button"
                                    variant={needsFormalPlanSave && !canCompleteStage4 ? "default" : "outline"}
                                    onClick={() => void handleSaveWavePlan()}
                                    disabled={savingPlan || planValidationError !== null || statsLoading || refreshRequired}
                                    data-testid="student-refinement-save-plan"
                                    className="px-5"
                                >
                                    {savingPlan ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
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
                            {isPlanDirty && (
                                <div
                                    role="status"
                                    data-testid="student-refinement-unsaved-plan-warning"
                                    className="flex flex-wrap items-center justify-between gap-3 rounded-surface border border-warning-border bg-warning-muted px-4 py-3 text-meta text-warning"
                                >
                                    <span className="flex items-center gap-2">
                                        <AlertCircle className="h-4 w-4 shrink-0" />
                                        步骤 2 样本量参数已修改但尚未保存（待保存 {effectiveFinalSize} 份，当前抽样仍按旧值 {lockedTargetN} 份执行）。
                                    </span>
                                    <div className="flex items-center gap-2">
                                        <Button type="button" variant="outline" size="sm" className="h-8 bg-card px-3 text-meta" onClick={() => setActiveTab("plan")}>
                                            返回步骤 2 核对
                                        </Button>
                                        <Button type="button" variant="secondary" size="sm" className="h-8 px-3 text-meta" disabled={savingPlan} onClick={() => void handleSaveWavePlan()}>
                                            保存新样本量（{effectiveFinalSize} 份）
                                        </Button>
                                    </div>
                                </div>
                            )}
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
                                <TabsList className="flex h-auto w-full flex-wrap gap-1 rounded-control bg-muted p-1">
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
                                                        <div className="flex flex-wrap items-end justify-between gap-4 rounded-surface bg-muted p-4">
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
                                                                                value={ppsSampleSizeInput}
                                                                                aria-invalid={!isPpsSampleSizeValid || undefined}
                                                                                onChange={(e) => setPpsSampleSizeInput(e.target.value)}
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
                                                                variant={
                                                                    done
                                                                        ? "outline"
                                                                        : !policyProgress.canComplete
                                                                            ? "default"
                                                                            : canCompleteStage4
                                                                                ? "outline"
                                                                                : "secondary"
                                                                }
                                                                onClick={() => void handleRunMethod(method)}
                                                                disabled={
                                                                    executingMethod !== null
                                                                    || refreshRequired
                                                                    || (method === "pps" && (!ppsSizeField || !isPpsSampleSizeValid))
                                                                }
                                                                data-testid={`student-sampling-${method}-run`}
                                                                className="px-5"
                                                            >
                                                                {executingMethod === method ? (
                                                                    <Loader2 className="h-4 w-4 animate-spin" />
                                                                ) : (
                                                                    <Play className="h-4 w-4" />
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
                                            key={`wave-${activeWave?.waveNumber ?? 2}-n-${lockedTargetN}-${Boolean(waveSampling?.stratified?.completed)}`}
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
                                            runButtonVariant={activeMethod === "stratified" && !policyProgress.canComplete ? "default" : canCompleteStage4 ? "outline" : "secondary"}
                                        />
                                    </TabsContent>
                                )}
                            </Tabs>

                            {/* Formal Fieldwork Dispatch & QC Card */}
                            <Card className="rounded-surface border-border bg-card" data-testid="student-refinement-dispatch-card">
                                <CardHeader className="border-b border-border pb-4">
                                    <div className="flex flex-wrap items-start justify-between gap-3">
                                        <div>
                                            <CardTitle className="flex items-center gap-2 text-section-title text-foreground">
                                                <Send className="h-5 w-5 text-primary" />
                                                执行正式问卷投放与回收质检
                                            </CardTitle>
                                            <CardDescription className="mt-1">
                                                向当前轮次已完成的所有抽样方法名单同步发放问卷，检验调优后的有效样本留存率与客群结构平衡度
                                            </CardDescription>
                                        </div>
                                        {allCompletedMethodsDispatched && !isQuestionnaireDirty ? (
                                            <StatusBadge intent="success">正式轮全部名单已发放回收</StatusBadge>
                                        ) : (
                                            <StatusBadge intent="neutral">待执行正式轮问卷发放</StatusBadge>
                                        )}
                                    </div>
                                </CardHeader>
                                <CardContent className="space-y-4 pt-4">
                                    <div className="flex flex-wrap items-center justify-between gap-4 rounded-surface bg-muted p-4">
                                        <div className="flex flex-wrap items-center gap-5">
                                            <div className="flex items-center gap-2">
                                                <Switch
                                                    id="formal-clean-speeder"
                                                    checked={activeWave?.cleaningConfig.removeSpeeders ?? true}
                                                    disabled={updatingWaveCleaning || refreshRequired}
                                                    onCheckedChange={(val) => void handleToggleWaveCleaning({ removeSpeeders: val })}
                                                />
                                                <Label htmlFor="formal-clean-speeder" className="cursor-pointer text-meta">剔除闪电卷</Label>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <Switch
                                                    id="formal-clean-straight"
                                                    checked={activeWave?.cleaningConfig.removeStraightliners ?? true}
                                                    disabled={updatingWaveCleaning || refreshRequired}
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
                                            variant={needsFormalDispatch ? "default" : "outline"}
                                            onClick={() => void handleDispatchFormal()}
                                            disabled={!policyProgress.canComplete || isQuestionnaireDirty || !targetBindingPassed || dispatching || refreshRequired}
                                            data-testid="student-refinement-dispatch"
                                            className="px-5"
                                        >
                                            {dispatching ? (
                                                <><Loader2 className="h-4 w-4 animate-spin" />正在投放并质检…</>
                                            ) : (
                                                <><Send className="h-4 w-4" />{allCompletedMethodsDispatched ? "重新发放当前正式轮问卷" : "执行正式问卷投放与回收"}</>
                                            )}
                                        </Button>
                                    </div>

                                    {!policyProgress.canComplete && (
                                        <p className="flex items-center gap-2 text-meta text-muted-foreground" data-testid="student-refinement-dispatch-policy-hint">
                                            <AlertCircle className="h-4 w-4 shrink-0 text-warning" />
                                            {policyProgress.missingRequired.length > 0
                                                ? `请先在上方完成必做抽样方法（${policyProgress.missingRequired.map((m) => METHOD_LABELS[m]).join("、")}），再统一发放正式轮问卷。`
                                                : `请先完成至少 ${policyProgress.minimumCompleted} 种启用抽样方法（当前已完成 ${completedFormalMethods.length} 种），再统一发放正式轮问卷。`}
                                        </p>
                                    )}

                                    {!targetBindingPassed && primaryTargetField && (
                                        <div
                                            role="alert"
                                            data-testid="student-refinement-unbound-target-warning"
                                            className="flex flex-wrap items-center justify-between gap-2 rounded-control border border-destructive-border bg-destructive-muted px-3.5 py-2 text-meta text-destructive"
                                        >
                                            <span className="flex items-center gap-2">
                                                <AlertCircle className="h-4 w-4 shrink-0" />
                                                核心商业研究指标「{primaryTargetField}」尚未关联到问卷题目，请先前往步骤 1 绑定并保存问卷。
                                            </span>
                                            <Button type="button" variant="outline" size="sm" className="h-7 bg-card px-2 text-meta" onClick={() => setActiveTab("questionnaire")}>
                                                前往关联主指标
                                            </Button>
                                        </div>
                                    )}

                                    {isQuestionnaireDirty && targetBindingPassed && (
                                        <div
                                            role="status"
                                            data-testid="student-refinement-unsaved-questionnaire-warning"
                                            className="flex flex-wrap items-center justify-between gap-2 rounded-control border border-warning-border bg-warning-muted px-3.5 py-2 text-meta text-warning"
                                        >
                                            <span className="flex items-center gap-2">
                                                <AlertCircle className="h-4 w-4 shrink-0" />
                                                步骤 1 问卷存在未保存的修订，请先保存修订问卷再执行正式问卷投放。
                                            </span>
                                            <Button type="button" variant="outline" size="sm" className="h-7 bg-card px-2 text-meta" onClick={() => setActiveTab("questionnaire")}>
                                                前往保存修订问卷
                                            </Button>
                                        </div>
                                    )}

                                    {!isQuestionnaireDirty && !allCompletedMethodsDispatched && completedFormalMethods.length > 0 && (
                                        <p className="flex items-center gap-2 text-meta text-warning">
                                            <AlertCircle className="h-4 w-4 shrink-0" />
                                            您已更新抽样名单或问卷，请点击「执行正式问卷投放与回收」获取最新实证答卷后再进入第五阶段。
                                        </p>
                                    )}

                                    {activeDiag && (
                                        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,28rem),1fr))] gap-4 pt-2">
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
            )}

            <StageActions>
                <Button variant="outline" onClick={onPrev} disabled={completing} data-testid="student-refinement-prev">
                    <ChevronLeft className="mr-1 h-4 w-4" />
                    查看质检诊断单
                </Button>
                <div className="flex flex-wrap items-center justify-end gap-3">
                    {stage4Blocker && (
                        <div className="flex flex-wrap items-center gap-2 text-meta text-muted-foreground" data-testid="student-refinement-blocker-hint">
                            <span>待完成：{stage4Blocker.text}</span>
                            {stage4Blocker.targetTab && (inspectedPriorWave !== null || activeTab !== stage4Blocker.targetTab) && (
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="h-7 px-2.5 text-meta"
                                    onClick={() => {
                                        if (inspectedPriorWave) setViewingWaveNum(activeWave?.waveNumber ?? activeWaveNum);
                                        setActiveTab(stage4Blocker.targetTab!);
                                    }}
                                >
                                    前往处理
                                </Button>
                            )}
                        </div>
                    )}
                    <Button
                        type="button"
                        variant={canCompleteStage4 ? "default" : "outline"}
                        onClick={() => void handleCompleteStage4()}
                        disabled={!canCompleteStage4 || completing || refreshRequired}
                        data-testid="student-refinement-complete"
                    >
                        {completing ? (
                            <><Loader2 className="h-4 w-4 animate-spin" />正在汇总正式数据…</>
                        ) : (
                            <>完成正式投放，进入商务决策报告<ArrowRight className="h-4 w-4" /></>
                        )}
                    </Button>
                </div>
            </StageActions>

            <QuestionEditor
                open={questionEditorOpen}
                onOpenChange={setQuestionEditorOpen}
                question={editingQuestion}
                onSave={(saved) => {
                    if (editingQuestion?.variableBinding && !saved.variableBinding) {
                        toast.info("题意或作答规则已修改，原变量关联已清除，请重新确认");
                    }
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

            <AlertDialog
                open={questionToDelete !== null}
                onOpenChange={(open) => {
                    if (!open) setQuestionToDelete(null);
                }}
                fallbackFocusRef={addWaveQuestionBtnRef}
            >
                <AlertDialogContent className="border-border bg-card text-foreground" data-testid="student-refinement-delete-question-dialog">
                    <AlertDialogHeader>
                        <AlertDialogTitle className="text-foreground">确认删除</AlertDialogTitle>
                        <AlertDialogDescription className="text-muted-foreground">
                            {questionToDelete
                                ? `确定要删除题目「${questionToDelete.content}」吗？删除后需点击「保存修订问卷」生效。`
                                : "确定要删除这道题目吗？"}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>取消</AlertDialogCancel>
                        <AlertDialogAction
                            variant="destructive"
                            data-testid="student-refinement-delete-question-confirm"
                            onClick={() => {
                                if (questionToDelete) {
                                    setQList((prev) => prev.filter((item) => item.id !== questionToDelete.id));
                                    setQuestionToDelete(null);
                                }
                            }}
                        >
                            删除
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}

export default AdaptiveRefinementStage;
