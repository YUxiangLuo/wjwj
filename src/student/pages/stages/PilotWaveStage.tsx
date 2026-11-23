import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
    AlertCircle, ArrowRight, Calculator, CheckCircle2, ChevronLeft,
    Coins, Loader2, Play, RefreshCw, Send, Sparkles, Users
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StatusBadge } from "@/components/StatusBadge";
import { FieldworkFunnelChart } from "@/components/charts/FieldworkFunnelChart";
import { StageActions } from "../../components/StageActions";
import { SamplePreviewTable } from "../../components/SamplePreviewTable";
import { StratifiedSamplingTab } from "../../components/StratifiedSamplingTab";
import { useExperiment } from "../ExperimentLayout";
import { experimentApi } from "../../api-client";
import type { MethodKey, SamplePlanData, SamplingResultsData } from "@/domain/experiment/types";
import { resolveFieldworkConfig } from "@/domain/fieldwork";
import { calculateSampleSizeStepDetails, finitePopulationS2ToSigma2 } from "../../experiment/sample-plan";
import { getFinalSampleSizeBounds } from "../../components/immersive-sample-planning/types";
import { getSamplingResultCount } from "../../experiment/sampling-results";
import { pickDefaultPpsSizeField } from "../../experiment/pps-size-field";
import { formatSystematicInterval, getSystematicInterval } from "../../experiment/systematic-sampling";
import { isCompletedSamplingResult, resolveSamplingPolicy, SAMPLING_METHODS } from "@/lib/sampling-policy";
import { formatStatistic } from "@/utils/statistic-format";

const METHOD_LABELS: Record<MethodKey, string> = {
    simple: "简单随机抽样",
    stratified: "分层抽样",
    pps: "PPS抽样",
    systematic: "系统抽样",
};

export function PilotWaveStage({ onPrev }: { onPrev: () => void }) {
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
    const samplingPolicy = resolveSamplingPolicy(experiment?.samplingPolicy);
    const fieldworkConfig = resolveFieldworkConfig(experiment?.fieldworkConfig);

    const wave1 = useMemo(
        () => experiment?.waves?.find((w) => w.waveNumber === 1) ?? null,
        [experiment?.waves],
    );
    const savedPlan = wave1?.samplePlan ?? experiment?.samplePlan ?? null;
    const waveSampling = (wave1?.samplingResults ?? experiment?.samplingResults ?? null) as SamplingResultsData | null;

    // Stats state
    const [statsLoading, setStatsLoading] = useState(true);
    const [statsError, setStatsError] = useState("");
    const [statsReloadKey, setStatsReloadKey] = useState(0);
    const [populationVariance, setPopulationVariance] = useState<number | null>(null);
    const [populationStats, setPopulationStats] = useState<Record<string, Record<string, number>>>({});
    const [numericFields, setNumericFields] = useState<string[]>([]);
    const [ppsEligibleFields, setPpsEligibleFields] = useState<string[]>([]);
    const [stratumNumericStats, setStratumNumericStats] = useState<Record<string, Record<string, Record<string, { mean: number; stdDev: number }>>>>({});

    // Pilot Plan Form State
    const [confidenceLevel, setConfidenceLevel] = useState<string>(savedPlan?.confidenceLevel ?? "95");
    const [marginOfError, setMarginOfError] = useState<number>(
        savedPlan?.marginOfError ?? (estimationType === "mean" ? 3 : 8),
    );
    const [varianceSource, setVarianceSource] = useState<"prior_estimate" | "population">(
        savedPlan?.varianceSource === "population" ? "population" : "prior_estimate",
    );
    const [priorStdDev, setPriorStdDev] = useState<number>(() => {
        if (savedPlan?.populationVariance && savedPlan.populationVariance > 0) {
            return Number(Math.sqrt(savedPlan.populationVariance).toFixed(2));
        }
        return 12;
    });
    const [designEffect, setDesignEffect] = useState<number>(savedPlan?.designEffect ?? 1);
    const [nonResponsePct, setNonResponsePct] = useState<number>(
        savedPlan ? Math.round(savedPlan.nonResponseRate * 100) : 10,
    );
    const [customFinalSize, setCustomFinalSize] = useState<number | null>(savedPlan?.finalSampleSize ?? null);
    const [savingPlan, setSavingPlan] = useState(false);

    // Sampling & Dispatch State
    const enabledMethods = useMemo(
        () => SAMPLING_METHODS.filter((m) => samplingPolicy.methods[m] !== "disabled"),
        [samplingPolicy],
    );
    const [activeMethod, setActiveMethod] = useState<MethodKey>("simple");
    const [executingMethod, setExecutingMethod] = useState<MethodKey | null>(null);
    const [executionTime, setExecutionTime] = useState<number | null>(null);
    const [ppsSizeField, setPpsSizeField] = useState<string>(waveSampling?.pps?.sizeField ?? "");
    const [samplingSeed, setSamplingSeed] = useState<string>("");
    const [dispatchSeed, setDispatchSeed] = useState<string>("");
    const [dispatching, setDispatching] = useState(false);
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
            if (estimationType === "mean" && analysisTarget?.field) {
                const stat = res.data.populationNumericStats?.[analysisTarget.field];
                const sigma2 = stat ? finitePopulationS2ToSigma2(stat.variance, stat.count) : null;
                if (sigma2 != null && sigma2 > 0) {
                    setPopulationVariance(sigma2);
                    if (!savedPlan?.populationVariance) {
                        setPriorStdDev(Number(Math.max(1, Math.sqrt(sigma2) * 0.8).toFixed(1)));
                    }
                }
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
    }, [taskId, statsReloadKey, estimationType, analysisTarget?.field, experiment?.analysisTarget?.inferred]);

    const activeVariance = useMemo(() => {
        if (estimationType !== "mean") return undefined;
        if (varianceSource === "population" && populationVariance && populationVariance > 0) {
            return populationVariance;
        }
        return priorStdDev > 0 ? Number((priorStdDev * priorStdDev).toFixed(4)) : 100;
    }, [estimationType, varianceSource, populationVariance, priorStdDev]);

    const stepDetails = useMemo(() => calculateSampleSizeStepDetails({
        estimationType,
        confidenceLevel,
        marginOfError: marginOfError > 0 ? marginOfError : 1,
        populationSize: N,
        populationVariance: activeVariance,
        designEffect: designEffect > 0 ? designEffect : 1,
        nonResponseRate: Math.min(0.5, Math.max(0, nonResponsePct / 100)),
    }), [estimationType, confidenceLevel, marginOfError, N, activeVariance, designEffect, nonResponsePct]);

    const bounds = useMemo(() => getFinalSampleSizeBounds(N, 1), [N]);
    const recommendedSize = Math.max(bounds.min, Math.min(bounds.max, stepDetails.n3 || bounds.min));
    const effectiveFinalSize = customFinalSize ?? recommendedSize;
    const isFinalSizeValid = Number.isInteger(effectiveFinalSize)
        && effectiveFinalSize >= bounds.min
        && effectiveFinalSize <= bounds.max;

    // Reference Pilot Cost Calculation
    const expectedCompletes = Math.round(effectiveFinalSize * (1 - Math.min(0.5, Math.max(0, nonResponsePct / 100))));
    const estimatedPilotCost =
        effectiveFinalSize * fieldworkConfig.contactCostPerUnit
        + expectedCompletes * fieldworkConfig.incentiveCostPerComplete;
    const estimatedUnitCost = expectedCompletes > 0 ? estimatedPilotCost / expectedCompletes : null;

    const buildPlanPayload = useCallback((): SamplePlanData => ({
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

    const handleSavePilotPlan = async () => {
        if (!taskId || !experiment || refreshRequired || !isFinalSizeValid) return;
        if (marginOfError <= 0 || (estimationType === "proportion" && marginOfError > 50)) {
            toast.error("请输入有效的允许误差限");
            return;
        }
        setSavingPlan(true);
        try {
            const payload = buildPlanPayload();
            const res = await experimentApi.saveWavePlan(taskId, experiment.version, payload);
            if (res.success && res.data) {
                updateExperiment(res.data);
                setCustomFinalSize(res.data.samplePlan?.finalSampleSize ?? payload.finalSampleSize);
                toast.success("首轮试投样本量方案已保存");
            } else if (res.error?.code === "VERSION_CONFLICT") {
                requireRefresh();
            } else {
                toast.error(res.error?.message ?? "保存试投方案失败");
            }
        } finally {
            setSavingPlan(false);
        }
    };

    const planSavedSize = savedPlan?.finalSampleSize ?? 0;
    const hasSavedPlan = planSavedSize >= 1;

    const parseOptionalSeed = (raw: string): number | undefined | null => {
        const trimmed = raw.trim();
        if (!trimmed) return undefined;
        if (!/^-?\d+$/.test(trimmed)) return null;
        const parsed = Number.parseInt(trimmed, 10);
        return Number.isSafeInteger(parsed) ? parsed : null;
    };

    const handleRunSampling = async (method: Exclude<MethodKey, "stratified">) => {
        if (!taskId || !hasSavedPlan || executingMethod || refreshRequired) return;
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
                    ? { sampleSize: planSavedSize, seed: parsedSeed }
                    : method === "systematic"
                        ? { seed: parsedSeed }
                        : { sizeField: ppsSizeField, sampleSize: planSavedSize, seed: parsedSeed };
            const res = await experimentApi.executeSampling(taskId, method, params);
            if (res.success) {
                setExecutionTime(Math.round(performance.now() - start));
                await reloadExperiment();
                toast.success(`首轮${METHOD_LABELS[method]}名单已抽取（${planSavedSize} 份）`);
            } else if (res.error?.code === "VERSION_CONFLICT" || res.error?.code === "INVALID_STAGE_ORDER") {
                requireRefresh();
            } else {
                toast.error(res.error?.message ?? "抽样执行失败");
            }
        } finally {
            setExecutingMethod(null);
        }
    };

    const completedPilotMethods = useMemo(
        () => enabledMethods.filter((m) => isCompletedSamplingResult(waveSampling?.[m])),
        [enabledMethods, waveSampling],
    );

    const handleDispatchPilot = async () => {
        if (!taskId || !experiment || completedPilotMethods.length === 0 || dispatching || refreshRequired) return;
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
                toast.success("首轮试投问卷已发放并完成虚拟受访者回收！");
            } else if (res.error?.code === "VERSION_CONFLICT") {
                requireRefresh();
            } else {
                toast.error(res.error?.message ?? "问卷发放模拟失败");
            }
        } finally {
            setDispatching(false);
        }
    };

    const dispatchedDiagMethod = useMemo(
        () => completedPilotMethods.find((m) => Boolean(wave1?.diagnostics?.[m])) ?? null,
        [completedPilotMethods, wave1?.diagnostics],
    );
    const pilotDiag = dispatchedDiagMethod ? wave1?.diagnostics?.[dispatchedDiagMethod] ?? null : null;
    const canCompletePilot = hasSavedPlan && completedPilotMethods.length > 0 && Boolean(pilotDiag);

    const handleCompleteStage = async () => {
        if (!canCompletePilot || !savedPlan || completing || refreshRequired) return;
        setCompleting(true);
        try {
            await completeStage(2, { samplePlan: savedPlan });
        } finally {
            setCompleting(false);
        }
    };

    const systematicInterval = hasSavedPlan ? getSystematicInterval(N, planSavedSize) : null;

    return (
        <div className="space-y-6" data-testid="student-stage-pilot-wave">
            {statsError && (
                <div role="alert" className="flex items-center justify-between gap-3 rounded-surface border border-destructive-border bg-destructive-muted p-4 text-label text-destructive">
                    <span>{statsError}</span>
                    <Button variant="outline" size="sm" onClick={() => setStatsReloadKey((k) => k + 1)}>
                        <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                        重试加载
                    </Button>
                </div>
            )}

            <div className="grid grid-cols-[minmax(0,1fr)_21rem] items-start gap-5">
                {/* Left Studio Canvas: 3 Sequential Pilot Steps */}
                <div className="min-w-0 space-y-5">
                    {/* Step 1: Pilot Sample Size & Reference Cost */}
                    <Card className="rounded-surface border-border bg-card" data-testid="student-pilot-plan-card">
                        <CardHeader className="border-b border-border pb-4">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <div>
                                    <CardTitle className="flex items-center gap-2 text-section-title text-foreground">
                                        <Calculator className="h-5 w-5 text-primary" />
                                        步骤 1 · 首轮试投样本量与经费评估（Wave 1）
                                    </CardTitle>
                                    <CardDescription className="mt-1">
                                        正式大规模调研前，通常缺乏真实的拒访率与客群方差参数。请基于经验假设确定首轮试投发放规模。
                                    </CardDescription>
                                </div>
                                {hasSavedPlan ? (
                                    <StatusBadge intent="success">已锁定试投量 {planSavedSize} 份</StatusBadge>
                                ) : (
                                    <StatusBadge intent="warning">待保存试投方案</StatusBadge>
                                )}
                            </div>
                        </CardHeader>
                        <CardContent className="space-y-5 pt-5">
                            <div className="grid grid-cols-3 gap-4">
                                <div className="space-y-2">
                                    <Label className="text-foreground">置信水平 (1 - α)</Label>
                                    <Select
                                        value={confidenceLevel}
                                        onValueChange={(v) => {
                                            setConfidenceLevel(v);
                                            setCustomFinalSize(null);
                                        }}
                                    >
                                        <SelectTrigger aria-label="选择试投置信水平" className="bg-background">
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
                                    <Label htmlFor="pilot-margin-error" className="text-foreground">
                                        {estimationType === "mean" ? "试投允许绝对误差 e" : "试投允许比例误差 E (%)"}
                                    </Label>
                                    <Input
                                        id="pilot-margin-error"
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
                                    <Label htmlFor="pilot-nrr-input" className="text-foreground">
                                        先验预估无回答率 (%)
                                    </Label>
                                    <Input
                                        id="pilot-nrr-input"
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
                                        <Label className="text-foreground">均值规划的先验离散度来源</Label>
                                        <Select
                                            value={varianceSource}
                                            onValueChange={(v) => {
                                                setVarianceSource(v as "prior_estimate" | "population");
                                                setCustomFinalSize(null);
                                            }}
                                        >
                                            <SelectTrigger aria-label="选择方差来源" className="bg-card">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="prior_estimate">行业经验先验标准差 σ₀（真实试投常用）</SelectItem>
                                                <SelectItem value="population" disabled={!populationVariance}>
                                                    抽样框总体基准方差 σ²（教学参考）
                                                </SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>

                                    {varianceSource === "prior_estimate" ? (
                                        <div className="space-y-2">
                                            <Label htmlFor="pilot-prior-sd" className="text-foreground">
                                                经验先验标准差 σ₀（方差 = {formatStatistic(priorStdDev * priorStdDev, 1)}）
                                            </Label>
                                            <Input
                                                id="pilot-prior-sd"
                                                type="number"
                                                min={0.1}
                                                step={0.5}
                                                value={priorStdDev}
                                                onChange={(e) => {
                                                    setPriorStdDev(Math.max(0.1, Number(e.target.value) || 1));
                                                    setCustomFinalSize(null);
                                                }}
                                                className="bg-card tabular-nums"
                                            />
                                        </div>
                                    ) : (
                                        <div className="space-y-2">
                                            <Label className="text-foreground">抽样框已知总体方差 σ²</Label>
                                            <div className="flex h-9 items-center rounded-control border border-border bg-muted px-3 font-mono text-label tabular-nums text-foreground">
                                                {populationVariance ? formatStatistic(populationVariance, 2) : "加载中…"}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                            <div className="grid grid-cols-2 gap-4 rounded-surface border border-border bg-muted p-4">
                                <div className="space-y-2">
                                    <div className="flex items-center justify-between text-meta text-muted-foreground">
                                        <span>公式四步推导（{stepDetails.formulaLabel}）</span>
                                        <span className="font-mono tabular-nums text-foreground">
                                            n₀={stepDetails.n0} → FPC={stepDetails.n2} → 推荐邀约 {recommendedSize} 份
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Label htmlFor="pilot-final-size" className="shrink-0 text-label font-semibold text-foreground">
                                            首轮试投发放量：
                                        </Label>
                                        <Input
                                            id="pilot-final-size"
                                            type="number"
                                            min={bounds.min}
                                            max={bounds.max}
                                            value={effectiveFinalSize}
                                            onChange={(e) => setCustomFinalSize(Math.round(Number(e.target.value) || 0))}
                                            data-testid="student-pilot-final-size"
                                            className="h-9 w-28 bg-card font-mono font-bold tabular-nums"
                                        />
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            onClick={() => setCustomFinalSize(recommendedSize)}
                                            className="bg-card text-meta"
                                        >
                                            设为推荐值 {recommendedSize}
                                        </Button>
                                    </div>
                                    <p className="text-meta text-muted-foreground">
                                        允许范围：{bounds.min} – {bounds.max.toLocaleString()} 份（总体 N = {N.toLocaleString()}）
                                    </p>
                                </div>

                                <div className="flex flex-col justify-between rounded-control border border-info-border bg-info-muted p-3">
                                    <div className="flex items-center justify-between text-meta font-semibold text-info">
                                        <span className="flex items-center gap-1.5">
                                            <Coins className="h-4 w-4" />
                                            首轮参考调研经费估算
                                        </span>
                                        <span className="tabular-nums">¥{formatStatistic(estimatedPilotCost, 0)}</span>
                                    </div>
                                    <p className="mt-1 text-meta text-muted-foreground tabular-nums">
                                        触达 ¥{fieldworkConfig.contactCostPerUnit}×{effectiveFinalSize} + 预期完答礼金 ¥{fieldworkConfig.incentiveCostPerComplete}×{expectedCompletes}
                                        {estimatedUnitCost !== null ? `（单份预期有效成本 ¥${formatStatistic(estimatedUnitCost, 1)}）` : ""}
                                    </p>
                                </div>
                            </div>

                            <div className="flex items-center justify-between gap-3 pt-1">
                                <div className="flex items-center gap-2 text-meta text-muted-foreground">
                                    <Label htmlFor="pilot-deff" className="text-meta">设计效应 deff：</Label>
                                    <Input
                                        id="pilot-deff"
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
                                    onClick={() => void handleSavePilotPlan()}
                                    disabled={savingPlan || !isFinalSizeValid || statsLoading || refreshRequired}
                                    data-testid="student-pilot-save-plan"
                                >
                                    {savingPlan ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
                                    {hasSavedPlan ? "更新首轮样本量方案" : "保存首轮样本量方案"}
                                </Button>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Step 2: Pilot Respondent Sampling */}
                    <Card className="rounded-surface border-border bg-card" data-testid="student-pilot-sampling-card">
                        <CardHeader className="border-b border-border pb-4">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <div>
                                    <CardTitle className="flex items-center gap-2 text-section-title text-foreground">
                                        <Users className="h-5 w-5 text-primary" />
                                        步骤 2 · 抽取首轮试投受访者名单
                                    </CardTitle>
                                    <CardDescription className="mt-1">
                                        试投轮通常可先采用简单随机抽样快速探底，也可尝试其他启用方法抽取 {hasSavedPlan ? `${planSavedSize} 份` : "目标数量"} 受访者名单。
                                    </CardDescription>
                                </div>
                                {completedPilotMethods.length > 0 ? (
                                    <StatusBadge intent="success">已抽取 {completedPilotMethods.length} 种名单</StatusBadge>
                                ) : (
                                    <StatusBadge intent="neutral">待抽取名单</StatusBadge>
                                )}
                            </div>
                        </CardHeader>
                        <CardContent className="space-y-4 pt-5">
                            {!hasSavedPlan ? (
                                <div className="rounded-control border border-dashed border-border bg-background p-6 text-center text-label text-muted-foreground">
                                    请先完成上方「步骤 1 · 保存首轮样本量方案」，再抽取试投受访者名单。
                                </div>
                            ) : (
                                <Tabs value={activeMethod} onValueChange={(v) => setActiveMethod(v as MethodKey)} className="space-y-4">
                                    <TabsList className="h-auto flex-wrap gap-1 rounded-surface border border-border bg-background p-1">
                                        {enabledMethods.map((method) => (
                                            <TabsTrigger key={method} value={method} className="gap-1.5 px-3.5 py-2 text-label" data-testid={`student-pilot-tab-${method}`}>
                                                <span>{METHOD_LABELS[method]}</span>
                                                {isCompletedSamplingResult(waveSampling?.[method]) && (
                                                    <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                                                )}
                                            </TabsTrigger>
                                        ))}
                                    </TabsList>

                                    {(["simple", "systematic", "pps"] as const)
                                        .filter((m) => enabledMethods.includes(m))
                                        .map((method) => {
                                            const currentRes = waveSampling?.[method];
                                            const completed = isCompletedSamplingResult(currentRes);
                                            return (
                                                <TabsContent key={method} value={method} className="space-y-4">
                                                    <div className="flex flex-wrap items-end justify-between gap-4 rounded-surface border border-border bg-background p-4">
                                                        <div className="flex flex-wrap items-end gap-4">
                                                            {method === "pps" && (
                                                                <div className="space-y-1.5">
                                                                    <Label className="text-meta">规模辅助变量</Label>
                                                                    <Select value={ppsSizeField} onValueChange={setPpsSizeField}>
                                                                        <SelectTrigger aria-label="选择PPS规模变量" className="w-48 bg-card">
                                                                            <SelectValue placeholder="选择规模字段" />
                                                                        </SelectTrigger>
                                                                        <SelectContent>
                                                                            {ppsEligibleFields.map((f) => (
                                                                                <SelectItem key={f} value={f}>{f}</SelectItem>
                                                                            ))}
                                                                        </SelectContent>
                                                                    </Select>
                                                                </div>
                                                            )}
                                                            {method === "systematic" && (
                                                                <div className="space-y-1.5">
                                                                    <Label className="text-meta">抽样间距 K = N/n</Label>
                                                                    <div className="flex h-9 items-center rounded-control border border-border bg-card px-3 font-mono text-label">
                                                                        {formatSystematicInterval(systematicInterval)}
                                                                    </div>
                                                                </div>
                                                            )}
                                                            <div className="space-y-1.5">
                                                                <Label htmlFor={`pilot-seed-${method}`} className="text-meta">
                                                                    随机种子（可选，留空自动随机）
                                                                </Label>
                                                                <Input
                                                                    id={`pilot-seed-${method}`}
                                                                    type="number"
                                                                    placeholder="可选整数种子"
                                                                    value={samplingSeed}
                                                                    onChange={(e) => setSamplingSeed(e.target.value)}
                                                                    className="h-9 w-40 bg-card"
                                                                />
                                                            </div>
                                                        </div>
                                                        <Button
                                                            type="button"
                                                            onClick={() => void handleRunSampling(method)}
                                                            disabled={
                                                                executingMethod !== null
                                                                || refreshRequired
                                                                || (method === "pps" && !ppsSizeField)
                                                            }
                                                            data-testid={`student-pilot-sample-${method}`}
                                                        >
                                                            {executingMethod === method ? (
                                                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                                            ) : (
                                                                <Play className="mr-2 h-4 w-4" />
                                                            )}
                                                            {completed ? `重新抽取${METHOD_LABELS[method]}` : `执行${METHOD_LABELS[method]}`}
                                                        </Button>
                                                    </div>

                                                    {completed && currentRes && (
                                                        <div className="space-y-3">
                                                            <p className="text-meta text-success font-medium">
                                                                已成功抽取 {getSamplingResultCount(method, currentRes)} 名试投受访者
                                                                {executionTime !== null ? `（耗时 ${executionTime} ms）` : ""}。
                                                            </p>
                                                            <div className="h-[260px] overflow-hidden rounded-control border border-border">
                                                                <SamplePreviewTable
                                                                    priorityField={analysisTarget?.field}
                                                                    data={(currentRes.data ?? []) as Array<Record<string, unknown>>}
                                                                    total={getSamplingResultCount(method, currentRes)}
                                                                />
                                                            </div>
                                                        </div>
                                                    )}
                                                </TabsContent>
                                            );
                                        })}

                                    {enabledMethods.includes("stratified") && (
                                        <TabsContent value="stratified">
                                            <StratifiedSamplingTab
                                                n={planSavedSize}
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
                            )}
                        </CardContent>
                    </Card>

                    {/* Step 3: Virtual Questionnaire Dispatch */}
                    <Card
                        className={`rounded-surface border ${pilotDiag ? "border-success-border bg-card" : "border-primary-border bg-card"}`}
                        data-testid="student-pilot-dispatch-card"
                    >
                        <CardHeader className="border-b border-border pb-4">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <div>
                                    <CardTitle className="flex items-center gap-2 text-section-title text-foreground">
                                        <Send className="h-5 w-5 text-primary" />
                                        步骤 3 · 向试投名单发放问卷并模拟市场回收
                                    </CardTitle>
                                    <CardDescription className="mt-1">
                                        系统将按您设计的阶段一问卷题量、隐私说明、变量绑定和数值范围，模拟受访者的真实触达、拒访、弃答及敷衍作答行为。
                                    </CardDescription>
                                </div>
                                {pilotDiag ? (
                                    <StatusBadge intent="success">首轮问卷已回收</StatusBadge>
                                ) : (
                                    <StatusBadge intent="primary">待发放回收</StatusBadge>
                                )}
                            </div>
                        </CardHeader>
                        <CardContent className="space-y-4 pt-5">
                            <div className="flex flex-wrap items-end justify-between gap-4 rounded-surface border border-border bg-background p-4">
                                <div className="space-y-1.5">
                                    <Label htmlFor="pilot-dispatch-seed" className="text-meta text-muted-foreground">
                                        实地发放模拟种子（可选，留空自动生成随机回执流）
                                    </Label>
                                    <Input
                                        id="pilot-dispatch-seed"
                                        type="number"
                                        placeholder="留空随机模拟"
                                        value={dispatchSeed}
                                        onChange={(e) => setDispatchSeed(e.target.value)}
                                        className="h-9 w-48 bg-card"
                                    />
                                </div>
                                <Button
                                    type="button"
                                    size="lg"
                                    onClick={() => void handleDispatchPilot()}
                                    disabled={completedPilotMethods.length === 0 || dispatching || refreshRequired}
                                    data-testid="student-pilot-dispatch"
                                >
                                    {dispatching ? (
                                        <><Loader2 className="mr-2 h-4 w-4 animate-spin" />正在发放并回收答卷…</>
                                    ) : (
                                        <><Sparkles className="mr-2 h-4 w-4" />{pilotDiag ? "重新模拟发放试投问卷" : "发放首轮试投问卷"}</>
                                    )}
                                </Button>
                            </div>

                            {pilotDiag && (
                                <div className="space-y-4" data-testid="student-pilot-dispatch-result">
                                    <FieldworkFunnelChart
                                        targetRequiredCount={savedPlan ? Math.round(savedPlan.finalSampleSize * (1 - savedPlan.nonResponseRate)) : undefined}
                                        totalEstimatedCost={pilotDiag.totalEstimatedCost}
                                        unitEffectiveCost={pilotDiag.unitEffectiveCost}
                                        stages={[
                                            {
                                                key: "invited",
                                                label: "1. 发出试投问卷",
                                                count: pilotDiag.invitedCount,
                                                description: `按${METHOD_LABELS[pilotDiag.method]}名单触达`,
                                                tone: "primary",
                                            },
                                            {
                                                key: "contacted",
                                                label: "2. 成功触达受访者",
                                                count: pilotDiag.contactedCount,
                                                description: `渠道失联 ${pilotDiag.notContactedCount} 份`,
                                                tone: "info",
                                            },
                                            {
                                                key: "completed_raw",
                                                label: "3. 原始回收完答卷",
                                                count: pilotDiag.completedRawCount,
                                                description: `拒访 ${pilotDiag.refusedCount} 份 · 中途弃答 ${pilotDiag.breakoffCount} 份`,
                                                tone: "warning",
                                            },
                                            {
                                                key: "cleaned_valid",
                                                label: "4. 初步有效答卷",
                                                count: pilotDiag.cleanedValidCount,
                                                description: `检出可疑闪电卷 ${pilotDiag.speederCount} 份 · 直线卷 ${pilotDiag.straightlinerCount} 份`,
                                                tone: "success",
                                            },
                                        ]}
                                    />

                                    <div className="flex items-start gap-2.5 rounded-surface border border-warning-border bg-warning-muted p-4 text-label text-warning">
                                        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                                        <div>
                                            <p className="font-semibold">首轮试投已完成回收！请进入下一阶段深入质检与诊断：</p>
                                            <p className="mt-1 text-meta leading-relaxed">
                                                首轮实测综合无回答/损耗率达 <strong>{pilotDiag.empiricalNonResponseRatePct}%</strong>
                                                {pilotDiag.speederCount + pilotDiag.straightlinerCount > 0
                                                    ? `，且混入 ${pilotDiag.speederCount + pilotDiag.straightlinerCount} 份疑似敷衍废卷`
                                                    : ""}
                                                {pilotDiag.maxStratumBiasPp != null && pilotDiag.maxStratumBiasPp >= 4
                                                    ? `，最大客群结构偏倚达 ${formatStatistic(pilotDiag.maxStratumBiasPp, 1)} 个百分点`
                                                    : ""}
                                                。下一步我们将执行废卷清洗并制定二轮抽样调优方案！
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>

                {/* Right Sticky Inspector: Pilot Readiness Checklist */}
                <aside className="sticky top-28 space-y-4">
                    <Card className="rounded-surface border-border bg-card">
                        <CardHeader className="border-b border-border pb-3">
                            <CardTitle className="text-subheading text-foreground">首轮试投通关清单</CardTitle>
                            <CardDescription>完成三步闭环即可进入阶段三质检台</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-3 pt-4 text-label">
                            <div className={`flex items-center gap-2.5 rounded-control border p-3 ${hasSavedPlan ? "border-success-border bg-success-muted text-success" : "border-border bg-background text-muted-foreground"}`}>
                                <CheckCircle2 className="h-4 w-4 shrink-0" />
                                <span>1. 保存试投样本量规划{hasSavedPlan ? `（${planSavedSize} 份）` : ""}</span>
                            </div>
                            <div className={`flex items-center gap-2.5 rounded-control border p-3 ${completedPilotMethods.length > 0 ? "border-success-border bg-success-muted text-success" : "border-border bg-background text-muted-foreground"}`}>
                                <CheckCircle2 className="h-4 w-4 shrink-0" />
                                <span>2. 抽取首轮受访者名单{completedPilotMethods.length > 0 ? "（已就绪）" : ""}</span>
                            </div>
                            <div className={`flex items-center gap-2.5 rounded-control border p-3 ${pilotDiag ? "border-success-border bg-success-muted text-success" : "border-border bg-background text-muted-foreground"}`}>
                                <CheckCircle2 className="h-4 w-4 shrink-0" />
                                <span>3. 发放问卷并回收试投答卷{pilotDiag ? `（有效 ${pilotDiag.cleanedValidCount} 份）` : ""}</span>
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="rounded-surface border-border bg-muted">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-label font-semibold text-foreground">为什么商业调研必须先试投？</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-2 text-meta leading-relaxed text-muted-foreground">
                            <p>1. 检验问卷长度与题序是否引发受访者中途弃答或闪电敷衍作答。</p>
                            <p>2. 检验数值题上下限是否误截断真实极端值或零值客户。</p>
                            <p>3. 获取实测有效回收率与样本标准差 s，避免正式大规模投放盲目拍脑袋。</p>
                        </CardContent>
                    </Card>
                </aside>
            </div>

            <StageActions>
                <Button variant="outline" onClick={onPrev} disabled={completing} data-testid="student-pilot-prev">
                    <ChevronLeft className="mr-1 h-4 w-4" />
                    查看阶段一问卷
                </Button>
                <Button
                    onClick={() => void handleCompleteStage()}
                    disabled={!canCompletePilot || completing || refreshRequired}
                    data-testid="student-pilot-complete"
                >
                    {completing ? (
                        <><Loader2 className="mr-2 h-4 w-4 animate-spin" />正在推进阶段…</>
                    ) : (
                        <>进入回收质检与诊断<ArrowRight className="ml-2 h-4 w-4" /></>
                    )}
                </Button>
            </StageActions>
        </div>
    );
}

export default PilotWaveStage;
