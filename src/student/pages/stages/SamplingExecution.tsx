import { SamplingObservationNotice } from "../../components/SamplingObservationNotice";
import { StageActions } from "../../components/StageActions";
import { IconTile } from "@/components/IconTile";
import { StatusBadge } from "@/components/StatusBadge";
import { Switch } from "@/components/ui/switch";
import { useState, useEffect, useCallback, useRef } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { AlertCircle, CheckCircle2, Play, Loader2, Target, Layers, ArrowRight, Database, RefreshCw } from "lucide-react";
import { useExperiment } from "../ExperimentLayout";
import { experimentApi } from "../../api-client";
import type { SamplingResultsData, SamplePlanData } from "@/domain/experiment/types";
import type { MethodKey as SamplingMethod } from "@/domain/experiment/types";
import { ImmersiveSamplingAnimation } from "../../components/ImmersiveSamplingAnimation";
import { SamplingSuccessState } from "../../components/SamplingSuccessState";
import { SamplePreviewTable } from "../../components/SamplePreviewTable";
import { StratifiedSamplingTab, type StratifiedLayer } from "../../components/StratifiedSamplingTab";
import {
    PPS_UNAVAILABLE_REASON,
    PPS_UNAVAILABLE_STATUS_MESSAGE,
} from "../../experiment/sampling-messages";
import { pickDefaultPpsSizeField } from "../../experiment/pps-size-field";
import { PpsProbabilityExplanation } from "@/components/PpsProbabilityExplanation";
import {
    formatSystematicInterval,
    getStoredSystematicInterval,
    getSystematicInterval,
} from "../../experiment/systematic-sampling";
import { getSamplingAcceptedRange } from "../../experiment/sampling-tolerance";
import { getSamplingResultCount } from "../../experiment/sampling-results";
import {
    evaluateSamplingPolicy,
    resolveSamplingPolicy,
    type SamplingMethod as PolicySamplingMethod,
    type SamplingMethodRequirement,
} from "@/lib/sampling-policy";

interface SamplingExecutionProps {
    onPrev: () => void;
}

const SAMPLING_ANIMATION_SKIP_KEY = "wj-skip-sampling-animation";

function shouldSkipSamplingAnimation() {
    try {
        return sessionStorage.getItem(SAMPLING_ANIMATION_SKIP_KEY) === "1";
    } catch {
        return false;
    }
}

function persistSkipSamplingAnimation() {
    try {
        sessionStorage.setItem(SAMPLING_ANIMATION_SKIP_KEY, "1");
    } catch {
        // ignore quota / private mode
    }
}

const FIELD_LABELS: Record<string, string> = {
    "gender": "性别",
    "education": "学历",
    "age": "年龄段",
    "age_group": "年龄段",
    "income": "收入水平",
    "city": "城市",
    "city_tier": "城市等级",
    "monthly_expense": "月支出",
    "spending": "消费支出",
};

const METHOD_LABELS: Record<PolicySamplingMethod, string> = {
    simple: "简单随机抽样",
    systematic: "系统抽样",
    pps: "PPS抽样",
    stratified: "分层抽样",
};

function RequirementLabel({ value }: { value: SamplingMethodRequirement }) {
    return <StatusBadge intent={value === "required" ? "primary" : "neutral"}>{value === "required" ? "必做" : "选做"}</StatusBadge>;
}

export function SamplingExecution({ onPrev }: SamplingExecutionProps) {
    const { populationSize, experiment, completeStage, reloadLatestVersion } = useExperiment();
    const [staleNotice, setStaleNotice] = useState<string | null>(null);
    const samplingPolicy = resolveSamplingPolicy(experiment?.samplingPolicy);
    const enabledMethods = (Object.keys(samplingPolicy.methods) as PolicySamplingMethod[])
        .filter((method) => samplingPolicy.methods[method] !== "disabled");

    // Get sample size from sample plan
    const samplePlan = experiment?.samplePlan as SamplePlanData | null;
    const hasValidSamplePlan = Number.isInteger(samplePlan?.finalSampleSize) && (samplePlan?.finalSampleSize ?? 0) > 0;
    const n = hasValidSamplePlan ? samplePlan!.finalSampleSize : 0;
    const N = populationSize;
    const censusPlan = hasValidSamplePlan && N > 0 && n >= N;
    const systematicInterval = getSystematicInterval(N, n);

    // Initialize from saved data
    const initialResults = experiment?.samplingResults as SamplingResultsData | null;
    const [activeMethod, setActiveMethod] = useState<PolicySamplingMethod>(() => enabledMethods.find(method => samplingPolicy.methods[method] === "required" && !initialResults?.[method]?.completed) ?? enabledMethods[0] ?? "simple");
    const [showAnimation, setShowAnimation] = useState(() => !shouldSkipSamplingAnimation());

    const [simpleResult, setSimpleResult] = useState(initialResults?.simple ?? null);
    const [systematicResult, setSystematicResult] = useState(initialResults?.systematic ?? null);
    const [ppsResult, setPpsResult] = useState(initialResults?.pps ?? null);
    const [stratifiedResult, setStratifiedResult] = useState(initialResults?.stratified ?? null);

    const [ppsSizeField, setPpsSizeField] = useState(initialResults?.pps?.sizeField ?? "");
    const [ppsSampleSize, setPpsSampleSize] = useState(initialResults?.pps?.sampleCount ?? n);
    const [simpleSeed, setSimpleSeed] = useState(String(initialResults?.simple?.seed ?? ""));
    const [systematicSeed, setSystematicSeed] = useState(String(initialResults?.systematic?.seed ?? ""));
    const [ppsSeed, setPpsSeed] = useState(String(initialResults?.pps?.seed ?? ""));
    const [executionTimes, setExecutionTimes] = useState<Record<SamplingMethod, number | null>>({ simple: null, systematic: null, pps: null, stratified: null });
    const [populationStats, setPopulationStats] = useState<Record<string, Record<string, number>>>({});
    const [numericFields, setNumericFields] = useState<string[]>([]);
    const [ppsEligibleFields, setPpsEligibleFields] = useState<string[]>([]);
    const [statsState, setStatsState] = useState<"loading" | "ready" | "error">("loading");
    const [statsError, setStatsError] = useState("");
    const [statsReloadKey, setStatsReloadKey] = useState(0);
    const statsLoaded = statsState === "ready";
    const [stratumNumericStats, setStratumNumericStats] = useState<Record<string, Record<string, Record<string, { mean: number; stdDev: number }>>>>({});

    // Fetch stats on mount. Keep loading distinct from a confirmed empty eligible-field list:
    // otherwise a persisted completed PPS result is briefly marked unavailable and then erased.
    useEffect(() => {
        if (!experiment?.taskId) return;

        let active = true;
        const controller = new AbortController();
        setStatsState("loading");
        setStatsError("");
        experimentApi.getStats(experiment.taskId, controller.signal).then(res => {
            if (!active) return;
            if (!res.success || !res.data) {
                setStatsState("error");
                setStatsError(res.error?.message || "总体统计信息加载失败");
                return;
            }
            setPopulationStats(res.data.stats ?? {});
            setStratumNumericStats(res.data.stratumNumericStats ?? {});
            setNumericFields(res.data.numericFields ?? []);
            const analysisField = experiment?.analysisTarget?.inferred
                ? undefined
                : experiment?.analysisTarget?.target.field;
            setPpsEligibleFields((res.data.ppsEligibleFields ?? []).filter((field) => field !== analysisField));
            setStatsState("ready");
        }).catch((cause) => {
            if (!active) return;
            console.error("Failed to load population stats:", cause);
            setStatsState("error");
            setStatsError("总体统计信息加载失败，请检查网络后重试");
        });

        return () => {
            active = false;
            controller.abort();
        };
    }, [experiment?.analysisTarget?.target.field, experiment?.taskId, statsReloadKey]);

    useEffect(() => {
        if (!statsLoaded) return;
        if (ppsEligibleFields.length === 0) {
            setPpsSizeField("");
            return;
        }

        if (!ppsSizeField || !ppsEligibleFields.includes(ppsSizeField)) {
            setPpsSizeField(pickDefaultPpsSizeField(ppsEligibleFields));
        }
    }, [ppsEligibleFields, ppsSizeField, statsLoaded]);

    useEffect(() => {
        if (!hasValidSamplePlan || !statsLoaded) return;

        if (ppsEligibleFields.length === 0) {
            setPpsResult((current) => current?.unavailable
                ? current
                : {
                    unavailable: true,
                    unavailableReason: PPS_UNAVAILABLE_REASON,
                });
            return;
        }

        setPpsResult((current) => current?.unavailable ? null : current);
    }, [hasValidSamplePlan, ppsEligibleFields.length, statsLoaded]);

    const [executing, setExecuting] = useState<SamplingMethod | null>(null);
    const [isCompleting, setIsCompleting] = useState(false);
    const [animatingMethod, setAnimatingMethod] = useState<SamplingMethod | null>(null);
    const [animationSampledData, setAnimationSampledData] = useState<{ data: Array<Record<string, unknown>>; total: number } | null>(null);
    const [stratifiedAnimationLayers, setStratifiedAnimationLayers] = useState<StratifiedLayer[]>([]);
    const [stratifiedAnimationStratifyBy, setStratifiedAnimationStratifyBy] = useState("gender");
    const animationOpenerRef = useRef<HTMLElement | null>(null);

    const rememberAnimationOpener = () => {
        animationOpenerRef.current = typeof document !== "undefined"
            && document.activeElement instanceof HTMLElement
            && document.activeElement !== document.body
            ? document.activeElement
            : null;
    };


    /** Server-side stage/version conflicts need a way forward, not a passing toast. */
    const reportSamplingFailure = (errorCode: string | undefined, message: string | undefined, fallback: string) => {
        if (errorCode === "INVALID_STAGE_ORDER" || errorCode === "VERSION_CONFLICT") {
            setStaleNotice(message ?? "检测到其他页面已更新，请加载最新版本后重试。");
            return;
        }
        toast.error(message || fallback);
    };

    const parseSeed = useCallback((seedText: string): { seed: number | undefined; error: string | null } => {
        const trimmed = seedText.trim();
        if (!trimmed) return { seed: undefined, error: null };
        if (!/^-?\d+$/.test(trimmed)) return { seed: undefined, error: "随机种子需为整数" };
        const parsed = Number.parseInt(trimmed, 10);
        if (!Number.isSafeInteger(parsed)) return { seed: undefined, error: "随机种子值超出安全整数范围" };
        return { seed: parsed, error: null };
    }, []);

    const taskId = experiment?.taskId;

    // Execute sampling with real API
    const executeSimple = async () => {
        if (!taskId || !hasValidSamplePlan) return;
        rememberAnimationOpener();
        setExecuting("simple");
        setAnimationSampledData(null);
        const startTime = performance.now();
        try {
            const { seed, error: seedError } = parseSeed(simpleSeed);
            if (seedError) { toast.error(seedError); setExecuting(null); return; }
            const res = await experimentApi.executeSampling(taskId, "simple", {
                sampleSize: n,
                seed,
            });
            if (res.success && res.data?.result) {
                const nextSimple = res.data.result;
                setSimpleResult(nextSimple);
                setExecutionTimes(prev => ({ ...prev, simple: Math.round(performance.now() - startTime) }));
                const dataArr = (nextSimple.data ?? []) as Array<Record<string, unknown>>;
                setAnimationSampledData({ data: dataArr, total: nextSimple.sampleCount ?? dataArr.length });
                if (showAnimation) setAnimatingMethod("simple");
            } else {
                reportSamplingFailure(res.error?.code, res.error?.message, "简单随机抽样执行失败");
                setAnimatingMethod(null);
            }
        } catch (e) {
            toast.error("简单随机抽样执行失败，请检查网络后重试");
            setAnimatingMethod(null);
        } finally {
            setExecuting(null);
        }
    };

    const executeSystematic = async () => {
        if (!taskId || !hasValidSamplePlan || systematicInterval === null) return;
        rememberAnimationOpener();
        setExecuting("systematic");
        setAnimationSampledData(null);
        const startTime = performance.now();
        try {
            const { seed, error: seedError } = parseSeed(systematicSeed);
            if (seedError) { toast.error(seedError); setExecuting(null); return; }
            const res = await experimentApi.executeSampling(taskId, "systematic", {
                seed,
            });
            if (res.success && res.data?.result) {
                const nextSystematic = res.data.result;
                setSystematicResult(nextSystematic);
                setExecutionTimes(prev => ({ ...prev, systematic: Math.round(performance.now() - startTime) }));
                const dataArr = (nextSystematic.data ?? []) as Array<Record<string, unknown>>;
                setAnimationSampledData({ data: dataArr, total: nextSystematic.sampleCount ?? dataArr.length });
                if (showAnimation) setAnimatingMethod("systematic");
            } else {
                reportSamplingFailure(res.error?.code, res.error?.message, "系统抽样执行失败");
                setAnimatingMethod(null);
            }
        } catch (e) {
            toast.error("系统抽样执行失败，请检查网络后重试");
            setAnimatingMethod(null);
        } finally {
            setExecuting(null);
        }
    };

    const executePPS = async () => {
        if (!taskId || !hasValidSamplePlan || !ppsSizeField || ppsEligibleFields.length === 0) return;
        rememberAnimationOpener();
        setExecuting("pps");
        setAnimationSampledData(null);
        const startTime = performance.now();
        try {
            const { seed, error: seedError } = parseSeed(ppsSeed);
            if (seedError) { toast.error(seedError); setExecuting(null); return; }
            const res = await experimentApi.executeSampling(taskId, "pps", {
                sizeField: ppsSizeField,
                sampleSize: ppsSampleSize,
                seed,
            });
            if (res.success && res.data?.result) {
                const nextPps = res.data.result;
                setPpsResult(nextPps);
                setExecutionTimes(prev => ({ ...prev, pps: Math.round(performance.now() - startTime) }));
                const dataArr = (nextPps.data ?? []) as Array<Record<string, unknown>>;
                setAnimationSampledData({ data: dataArr, total: nextPps.sampleCount ?? dataArr.length });
                if (showAnimation) setAnimatingMethod("pps");
            } else {
                reportSamplingFailure(res.error?.code, res.error?.message, "PPS抽样执行失败");
                setAnimatingMethod(null);
            }
        } catch (e) {
            toast.error("PPS抽样执行失败，请检查网络后重试");
            setAnimatingMethod(null);
        } finally {
            setExecuting(null);
        }
    };

    // Validation
    const samplingAcceptedRange = getSamplingAcceptedRange(n, N);
    const ppsMinSize = samplingAcceptedRange?.min ?? 1;
    const ppsMaxSize = samplingAcceptedRange?.max ?? N;
    const isPpsSizeValid = Number.isInteger(ppsSampleSize) && ppsSampleSize >= ppsMinSize && ppsSampleSize <= ppsMaxSize && ppsSampleSize >= 1 && ppsSampleSize <= N;
    const hasPpsNumericField = ppsEligibleFields.length > 0;
    const ppsPreviewTotal = ppsResult?.sampleCount ?? ppsResult?.data?.length ?? 0;
    const ppsSummaryFieldLabel = ppsResult?.sizeField
        ? FIELD_LABELS[ppsResult.sizeField] || ppsResult.sizeField
        : "所选规模变量";
    const systematicCompletedForCurrentPlan = Boolean(
        systematicResult?.completed && systematicResult.sampleCount === n,
    );
    const resultSystematicInterval = getStoredSystematicInterval(systematicResult) ?? systematicInterval;
    const completedMethods = ([
        ["simple", Boolean(simpleResult?.completed)],
        ["systematic", systematicCompletedForCurrentPlan],
        ["pps", Boolean(ppsResult?.completed)],
        ["stratified", Boolean(stratifiedResult?.completed)],
    ] as const).filter(([, completed]) => completed).map(([method]) => method);
    const samplingProgress = evaluateSamplingPolicy(samplingPolicy, completedMethods);
    const allCompleted = samplingProgress.canComplete;
    const completedMethodCount = samplingProgress.completed.length;
    const nextMethod = samplingProgress.missingRequired[0] ?? (!allCompleted ? enabledMethods.find(method => !completedMethods.includes(method)) : undefined);
    const completionHint = allCompleted ? "已满足本阶段要求。可以进入分析，也可以继续尝试选做方法。"
        : samplingProgress.missingRequired.length > 0 ? "还需完成必做方法：" + samplingProgress.missingRequired.map(method => METHOD_LABELS[method]).join("、")
            : `还需再完成 ${samplingProgress.minimumCompleted - completedMethodCount} 种启用方法，才能比较抽样结果。`;

    const handleConfirmNext = async () => {
        if (!allCompleted || isCompleting || executing) return;
        setIsCompleting(true);
        try { await completeStage(3, {}); } finally { setIsCompleting(false); }
    };

    if (!hasValidSamplePlan) {
        return (
            <div className="min-w-0 space-y-5" data-testid="student-stage-sampling-blocked">
                <Card className="rounded-surface border-destructive-border bg-destructive-muted ">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-destructive">
                            <AlertCircle className="h-5 w-5" />
                            无法开始抽样执行
                        </CardTitle>
                        <CardDescription className="text-destructive">
                            当前实验缺少有效的最终样本量，抽样执行必须建立在已确认的样本量规划之上。
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="rounded-surface border border-destructive-border bg-background px-4 py-3 text-label text-foreground">
                            请返回“样本量规划”阶段，重新确认并保存最终样本量后，再进入本阶段。
                        </div>
                        <div className="flex justify-between">
                            <Button variant="outline" onClick={onPrev} data-testid="student-sampling-blocked-prev" className="border-input bg-muted text-foreground hover:bg-muted hover:text-foreground">
                                上一阶段
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            </div>
        );
    }

    return (
        <div className="min-w-0 space-y-4" data-testid="student-stage-sampling">
            <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,15rem),1fr))] gap-3">
                <div className="flex items-center gap-3 rounded-surface border border-border bg-card p-3"><IconTile intent="primary"><Target className="h-5 w-5"/></IconTile><div><p className="text-meta text-muted-foreground">规划样本量</p><p className="text-section-title font-semibold tabular-nums">{n} <span className="text-label font-normal">个单位</span></p></div></div>
                <div className="flex items-center gap-3 rounded-surface border border-border bg-card p-3"><IconTile intent="info"><Database className="h-5 w-5"/></IconTile><div><p className="text-meta text-muted-foreground">调查总体</p><p className="text-section-title font-semibold tabular-nums">{N.toLocaleString()} <span className="text-label font-normal">个单位</span></p></div></div>
                <div className="flex items-center gap-3 rounded-surface border border-border bg-card p-3"><IconTile intent={allCompleted ? "success" : "neutral"}><Layers className="h-5 w-5"/></IconTile><div><p className="text-meta text-muted-foreground">已保存的抽样结果</p><p className="text-section-title font-semibold tabular-nums">{completedMethodCount} <span className="text-label font-normal">种方法</span></p></div></div>
            </div>
            {censusPlan && (
                <p role="status" data-testid="student-sampling-census-notice" className="rounded-surface border border-warning-border bg-warning-muted p-3 text-label text-warning">
                    规划样本量等于总体规模，本次执行是完整普查：各方法都会抽满全部单位，估计结果与抽样误差相同，无法比较方法差异。
                </p>
            )}
            {statsState === "loading" && (
                <Card role="status" aria-live="polite" className="rounded-surface border-info-border bg-info-muted " data-testid="student-sampling-stats-loading">
                    <CardContent className="flex items-center gap-3 px-4 py-3 text-label text-info">
                        <Loader2 aria-hidden="true" className="h-4 w-4 shrink-0 animate-spin" />
                        正在加载总体统计信息和 PPS 可用字段…
                    </CardContent>
                </Card>
            )}

            {statsState === "error" && (
                <Card className="rounded-surface border-destructive-border bg-destructive-muted " data-testid="student-sampling-stats-error">
                    <CardContent className="flex items-center justify-between gap-4 px-4 py-3">
                        <div className="flex min-w-0 items-center gap-3 text-label text-destructive">
                            <AlertCircle className="h-4 w-4 shrink-0" />
                            <span>{statsError}</span>
                        </div>
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => setStatsReloadKey((value) => value + 1)}
                            data-testid="student-sampling-stats-retry"
                            className="shrink-0 border-destructive-border bg-background text-destructive hover:bg-destructive-muted hover:text-destructive"
                        >
                            <RefreshCw className="mr-1.5 h-4 w-4" />
                            重试
                        </Button>
                    </CardContent>
                </Card>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3 rounded-surface border border-border bg-card p-3" data-testid="student-sampling-policy-summary">
                <div className="min-w-0 space-y-1 text-label">
                    <p className="font-medium">必做：{samplingProgress.required.map(method => METHOD_LABELS[method]).join("、")}。须完成全部必做，且至少完成 {samplingProgress.minimumCompleted} 种启用方法。已保存 {completedMethodCount} 种，至少需 {samplingProgress.minimumCompleted} 种。</p>
                    <p className="text-meta text-muted-foreground">{enabledMethods.some(method => samplingPolicy.methods[method] === "optional") ? "其他标为“选做”的方法可按需尝试。" : "本任务没有选做方法。"}每次抽样后结果会立即保存。</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                    <Switch id="show-sampling-animation" checked={showAnimation} onCheckedChange={value => {setShowAnimation(value); try {sessionStorage.setItem(SAMPLING_ANIMATION_SKIP_KEY, value ? "0" : "1");} catch { /* Session preference is optional. */ }}}/>
                    <Label htmlFor="show-sampling-animation" className="cursor-pointer text-label">抽样后播放演示</Label>
                </div>
            </div>
            {/* Sampling methods tabs */}
            <Tabs value={activeMethod} onValueChange={value => setActiveMethod(value as PolicySamplingMethod)} className="min-w-0 space-y-5">
                <TabsList className="scroll-mt-48 bg-card border border-border p-1 rounded-surface w-full min-w-0 flex flex-wrap h-auto gap-1" data-testid="student-sampling-tabs">
                    <TabsTrigger value="simple" data-testid="student-sampling-tab-simple" className="scroll-mt-48 min-w-0 flex-1 basis-48 rounded-surface py-2.5 px-3 text-label data-[state=active]:bg-muted data-[state=active]:text-foreground text-muted-foreground">
                        <span>简单随机抽样</span>
                        <RequirementLabel value={samplingPolicy.methods.simple} />
                        {simpleResult?.completed && <CheckCircle2 className="w-4 h-4 shrink-0 text-success" />}
                    </TabsTrigger>
                    {samplingPolicy.methods.systematic !== "disabled" && (
                    <TabsTrigger value="systematic" data-testid="student-sampling-tab-systematic" className="scroll-mt-48 min-w-0 flex-1 basis-48 rounded-surface py-2.5 px-3 text-label data-[state=active]:bg-muted data-[state=active]:text-foreground text-muted-foreground">
                        <span>系统抽样</span>
                        <RequirementLabel value={samplingPolicy.methods.systematic} />
                        {systematicCompletedForCurrentPlan && <CheckCircle2 className="w-4 h-4 shrink-0 text-success" />}
                    </TabsTrigger>
                    )}
                    {samplingPolicy.methods.pps !== "disabled" && (
                    <TabsTrigger value="pps" data-testid="student-sampling-tab-pps" className="scroll-mt-48 min-w-0 flex-1 basis-48 rounded-surface py-2.5 px-3 text-label data-[state=active]:bg-muted data-[state=active]:text-foreground text-muted-foreground">
                        <span>PPS抽样</span>
                        <RequirementLabel value={samplingPolicy.methods.pps} />
                        {ppsResult?.completed && <CheckCircle2 className="w-4 h-4 shrink-0 text-success" />}
                    </TabsTrigger>
                    )}
                    {samplingPolicy.methods.stratified !== "disabled" && (
                    <TabsTrigger value="stratified" data-testid="student-sampling-tab-stratified" className="scroll-mt-48 min-w-0 flex-1 basis-48 rounded-surface py-2.5 px-3 text-label data-[state=active]:bg-muted data-[state=active]:text-foreground text-muted-foreground">
                        <span>分层抽样</span>
                        <RequirementLabel value={samplingPolicy.methods.stratified} />
                        {stratifiedResult?.completed && <CheckCircle2 className="w-4 h-4 shrink-0 text-success" />}
                    </TabsTrigger>
                    )}
                </TabsList>

                {/* Simple Random Sampling */}
                <TabsContent value="simple" className="mt-0 focus-visible:outline-none">
                    <div className="min-w-0 space-y-4">
                        <div className="min-w-0 space-y-4">
                            {staleNotice && (
                                <div
                                    role="alert"
                                    data-testid="student-sampling-stale-notice"
                                    className="flex flex-wrap items-center justify-between gap-3 rounded-surface border border-warning-border bg-warning-muted p-4 text-label text-warning"
                                >
                                    <span>{staleNotice}</span>
                                    <Button
                                        type="button"
                                        size="sm"
                                        variant="outline"
                                        data-testid="student-sampling-load-latest"
                                        onClick={() => { setStaleNotice(null); void reloadLatestVersion(); }}
                                        className="border-warning-border bg-background text-warning hover:bg-warning-muted hover:text-warning"
                                    >
                                        <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                                        加载最新版本
                                    </Button>
                                </div>
                            )}
                            <Card className="gap-0 rounded-surface border-border bg-card py-0">
                                <CardHeader className="flex flex-wrap items-center justify-between gap-4 p-5">
                                    <div className="min-w-0 flex-1 basis-80 space-y-2">
                                    <CardTitle className="text-foreground flex items-center gap-2">
                                        <div className="w-2 h-6 bg-primary rounded-control mr-2"></div>
                                        简单随机抽样
                                    </CardTitle>
                                    <CardDescription className="text-muted-foreground pt-1">
                                        从 {N.toLocaleString()} 个总体单位中不放回抽取 {n} 个。每个单位的入样概率相等，且不会重复入样。
                                    </CardDescription>
                                    </div>
                                    {!simpleResult?.completed && <Button onClick={() => void executeSimple()} disabled={executing !== null} data-testid="student-sampling-simple-run">
                                        {executing === "simple" ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Play className="mr-2 h-4 w-4"/>}
                                        开始随机抽样
                                    </Button>}
                                </CardHeader>
                                <CardContent className="space-y-4 px-5 pb-5">
                                    <details className="max-w-xl">
                                        <summary className="cursor-pointer text-meta font-medium text-muted-foreground">复现同一组结果（可选）</summary>
                                        <div className="mt-3">
                                        <Label htmlFor="simpleSeed" className="text-foreground text-meta">随机种子（可选）</Label>
                                        <Input
                                            id="simpleSeed"
                                            type="number"
                                            value={simpleSeed}
                                            onChange={(e) => setSimpleSeed(e.target.value)}
                                            placeholder="留空则每次随机"
                                            data-testid="student-sampling-simple-seed"
                                            className="mt-2 bg-card border-input text-foreground focus:border-ring"
                                        />
                                        <p className="text-meta text-muted-foreground mt-2">设置后可复现同一组软件抽样结果，但这只是复现实验，不足以证明实际调查的随机化质量。</p>
                                        </div>
                                    </details>
                                    {simpleResult?.completed && (
                                        <SamplingSuccessState
                                            summary={`共成功抽取 ${simpleResult.sampleCount} 个样本${executionTimes.simple !== null ? `，耗时 ${executionTimes.simple} ms` : ""}${simpleResult.seed != null ? `，随机种子 ${simpleResult.seed}` : ""}`}
                                            onRerun={() => void executeSimple()}
                                            disabled={executing !== null}
                                            rerunTestId="student-sampling-simple-rerun"
                                            rerunLabel="重新执行简单随机抽样"
                                        />
                                    )}
                                </CardContent>
                            </Card>
                        </div>
                        <div className="min-w-0 space-y-4">
                            <Card className="min-w-0 rounded-surface border-border bg-card">
                                <CardHeader>
                                    <div className="flex items-center justify-between">
                                        <CardTitle className="text-body text-foreground">已保存的入样记录</CardTitle>
                                        <Badge variant="outline" className="border-input text-muted-foreground">分页预览</Badge>
                                    </div>
                                    <CardDescription className="text-muted-foreground">每页查看 20 条记录，完整数据可在分析阶段导出。</CardDescription>
                                </CardHeader>
                                <CardContent className="h-[360px] min-w-0 overflow-hidden">
                                    {!simpleResult?.completed ? (
                                        <div className="h-full flex items-center justify-center text-label text-muted-foreground italic">
                                            执行上方抽样后，在这里查看入样单位和记录。
                                        </div>
                                    ) : (
                                        <SamplePreviewTable priorityField={experiment?.analysisTarget?.target.field} data={simpleResult.data ?? []} total={simpleResult.sampleCount} />
                                    )}
                                </CardContent>
                            </Card>
                        </div>
                    </div>
                </TabsContent>

                {/* Systematic Sampling */}
                {samplingPolicy.methods.systematic !== "disabled" && (
                <TabsContent value="systematic" className="mt-0 focus-visible:outline-none">
                    <div className="min-w-0 space-y-4">
                        <div className="min-w-0 space-y-4">
                            <Card className="rounded-surface border-border bg-card ">
                                <CardHeader>
                                    <CardTitle className="text-foreground flex items-center gap-2">
                                        <div className="w-2 h-6 bg-info rounded-control mr-2"></div>
                                        系统抽样
                                    </CardTitle>
                                    <CardDescription className="text-muted-foreground pt-1">
                                        使用分数间隔 K=N/n 和随机起点，按当前抽样框顺序抽取并确保样本量等于规划值 {n}。抽样框排序可能影响效率；若周期结构与 K 同步，结果可能失真。
                                    </CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-6 pt-4">
                                    <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,16rem),1fr))] gap-4 p-4 bg-background rounded-surface border border-border">
                                        <div className="space-y-3">
                                            <p className="text-label font-medium text-foreground">抽样间隔 K=N/n</p>
                                            <div
                                                className="flex h-10 items-center rounded-control border border-input bg-card px-3 font-mono font-semibold text-foreground"
                                                data-testid="student-sampling-systematic-k"
                                            >
                                                {formatSystematicInterval(systematicInterval)}
                                            </div>
                                            <p className="text-meta text-muted-foreground">按总体规模除以规划样本量计算，间隔可以是小数。</p>
                                        </div>
                                        <div className="space-y-3">
                                            <p className="text-label font-medium text-foreground">精确抽取数量</p>
                                            <div className="flex h-10 items-center justify-between rounded-control border border-input bg-card px-3">
                                                <span className="font-mono font-bold text-foreground">{n}</span>
                                                <span className="text-meta text-success">与规划值一致</span>
                                            </div>
                                            <p className="text-meta text-muted-foreground">随机起点保证随机化，但不能自动消除抽样框中的排序或周期性风险。</p>
                                        </div>
                                        <div className="space-y-3">
                                            <Label htmlFor="systematicSeed" className="text-foreground">随机种子（可选）</Label>
                                            <Input
                                                id="systematicSeed"
                                                type="number"
                                                value={systematicSeed}
                                                onChange={(e) => setSystematicSeed(e.target.value)}
                                                placeholder="留空则每次随机"
                                                data-testid="student-sampling-systematic-seed"
                                                className="bg-card border-input text-foreground focus:border-info"
                                            />
                                            <p className="text-meta text-muted-foreground">
                                                设置后可复现软件结果，但不能据此证明实际调查的随机化质量。
                                            </p>
                                        </div>
                                    </div>

                                    {!systematicCompletedForCurrentPlan ? (
                                        <div className="space-y-3">
                                            {systematicResult?.completed && (
                                                <p className="rounded-surface border border-warning-border bg-warning-muted px-3 py-2 text-label text-warning">
                                                    已保存的旧系统抽样结果为 {systematicResult.sampleCount} 个样本，与当前规划值 {n} 不一致，请重新执行。
                                                </p>
                                            )}
                                            <div className="flex justify-end">
                                            <Button onClick={() => void executeSystematic()} disabled={executing !== null || systematicInterval === null} data-testid="student-sampling-systematic-run" className="w-auto bg-info px-8 text-info-foreground hover:bg-info-hover">
                                                {executing === "systematic" ? (
                                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                                ) : (
                                                    <Play className="w-4 h-4 mr-2" />
                                                )}
                                                执行系统抽样
                                            </Button>
                                            </div>
                                        </div>
                                    ) : (
                                        <SamplingSuccessState
                                            summary={`K=${formatSystematicInterval(resultSystematicInterval)}，共抽取 ${systematicResult?.sampleCount} 个样本${executionTimes.systematic !== null ? `，耗时 ${executionTimes.systematic} ms` : ""}`}
                                            onRerun={() => void executeSystematic()}
                                            disabled={executing !== null || systematicInterval === null}
                                            rerunTestId="student-sampling-systematic-rerun"
                                            rerunLabel="重新执行系统抽样"
                                        />
                                    )}
                                </CardContent>
                            </Card>
                        </div>
                        <div className="min-w-0 space-y-4">
                            <Card className="min-w-0 rounded-surface border-border bg-card">
                                <CardHeader>
                                    <div className="flex items-center justify-between">
                                        <CardTitle className="text-body text-foreground">已保存的入样记录</CardTitle>
                                        <Badge variant="outline" className="border-input text-muted-foreground">分页预览</Badge>
                                    </div>
                                    <CardDescription className="text-muted-foreground">每页查看 20 条记录，完整数据可在分析阶段导出。</CardDescription>
                                </CardHeader>
                                <CardContent className="h-[360px] min-w-0 overflow-hidden">
                                    {!systematicCompletedForCurrentPlan ? (
                                        <div className="h-full flex items-center justify-center text-label text-muted-foreground italic">
                                            执行上方抽样后，在这里查看入样单位和记录。
                                        </div>
                                    ) : (
                                        <SamplePreviewTable priorityField={experiment?.analysisTarget?.target.field} data={systematicResult?.data ?? []} total={systematicResult?.sampleCount ?? 0} />
                                    )}
                                </CardContent>
                            </Card>
                        </div>
                    </div>
                </TabsContent>
                )}

                {/* PPS Sampling */}
                {samplingPolicy.methods.pps !== "disabled" && (
                <TabsContent value="pps" className="mt-0 focus-visible:outline-none">
                    <div className="min-w-0 space-y-4">
                        <div className="min-w-0 space-y-4">
                            <Card className="rounded-surface border-border bg-card ">
                                <CardHeader>
                                    <CardTitle className="text-foreground flex items-center gap-2">
                                        <div className="w-2 h-6 bg-auxiliary rounded-control mr-2"></div>
                                        PPS抽样（概率与规模成比例抽样）
                                    </CardTitle>
                                    <CardDescription>选择与研究目标有关的规模变量，再设置抽取数量。规模较大的单位通常有更高的入样概率。</CardDescription>
                                    <details className="rounded-surface border border-border bg-background p-3"><summary className="cursor-pointer text-label font-medium">了解 PPS 的条件与本实验规则</summary>                                    <p className="mt-3 text-meta leading-relaxed text-muted-foreground">
                                        不放回 πps：普通单位的一阶包含概率与规模成正比；若初始 n·xᵢ/Σxᵢ 达到 1，该单位必然入样，剩余名额会在其他单位间重新按规模分配。分析阶段用 Hájek 加权均值，不是 Horvitz–Thompson 均值。规模变量应在抽样前对总体单位可获得；它与目标变量相关时 PPS 才更可能提高效率，相关性弱时未必优于等概率设计。抽取数量允许在规划目标的 80%–120% 调整，这是本实验的操作规则，不是 PPS 理论要求。
                                    </p></details>
                                </CardHeader>
                                <CardContent className="space-y-6 pt-4">
                                    <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,16rem),1fr))] gap-4 p-4 bg-background rounded-surface border border-border">
                                        <div className="space-y-3">
                                            <Label className="text-foreground">选择规模变量</Label>
                                            {!statsLoaded ? (
                                                <div className="flex h-10 items-center rounded-control border border-info-border bg-info-muted px-3 text-label text-info" data-testid="student-sampling-pps-fields-pending">
                                                    {statsState === "loading" ? "正在加载可用规模变量…" : "规模变量信息加载失败，请先重试"}
                                                </div>
                                            ) : hasPpsNumericField ? (
                                                <Select value={ppsSizeField} onValueChange={setPpsSizeField}>
                                                    <SelectTrigger aria-label="选择 PPS 规模度量字段" data-testid="student-sampling-pps-size-field" className="w-full bg-card border-input text-foreground">
                                                        <SelectValue placeholder="选择数值变量" />
                                                    </SelectTrigger>
                                                    <SelectContent className="bg-card border-border text-foreground">
                                                        {ppsEligibleFields.map(key => (
                                                            <SelectItem key={key} value={key}>
                                                                {FIELD_LABELS[key] || key}
                                                            </SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                            ) : (
                                                <div className="flex h-10 items-center rounded-control border border-destructive-border bg-destructive-muted px-3 text-label text-destructive" data-testid="student-sampling-pps-unavailable">
                                                    {PPS_UNAVAILABLE_STATUS_MESSAGE}
                                                </div>
                                            )}
                                            <p className={`text-meta leading-relaxed ${statsLoaded && !hasPpsNumericField ? "text-destructive" : "text-muted-foreground"}`}>
                                                {!statsLoaded
                                                    ? "只有统计信息成功加载后，系统才会确认 PPS 是否可用。"
                                                    : hasPpsNumericField
                                                        ? "选择一个抽样前已知的规模变量（如收入、人口等）；本实验执行还要求该字段对总体每个单位均为正数。"
                                                        : PPS_UNAVAILABLE_REASON}
                                            </p>
                                        </div>
                                        <div className="space-y-3">
                                            <Label htmlFor="ppsSampleSize" className="text-foreground">抽样数量</Label>
                                            <Input
                                                id="ppsSampleSize"
                                                type="number"
                                                value={ppsSampleSize === 0 ? "" : ppsSampleSize}
                                                onChange={(e) => setPpsSampleSize(Number(e.target.value))}
                                                inputMode="numeric" step={1}
                                                min={ppsMinSize}
                                                max={ppsMaxSize}
                                                aria-invalid={!isPpsSizeValid}
                                                aria-describedby="pps-sample-size-hint"
                                                data-testid="student-sampling-pps-sample-size"
                                                className={`bg-card border-input text-foreground focus:border-auxiliary ${!isPpsSizeValid ? "border-destructive" : ""}`}
                                            />
                                            <p id="pps-sample-size-hint" className={`text-meta leading-relaxed ${isPpsSizeValid ? "text-muted-foreground" : "text-destructive"}`}>
                                                有效范围: {ppsMinSize}-{ppsMaxSize}（本实验按目标值 {n} 的 80%-120%，且无放回抽样不能超过总体 N={N}）
                                                {!isPpsSizeValid && `；请输入 ${ppsMinSize}-${ppsMaxSize} 之间的整数`}
                                            </p>
                                        </div>
                                        <div className="space-y-3">
                                            <Label htmlFor="ppsSeed" className="text-foreground">随机种子（可选）</Label>
                                            <Input
                                                id="ppsSeed"
                                                type="number"
                                                value={ppsSeed}
                                                onChange={(e) => setPpsSeed(e.target.value)}
                                                placeholder="留空则每次随机"
                                                data-testid="student-sampling-pps-seed"
                                                className="bg-card border-input text-foreground focus:border-auxiliary"
                                            />
                                            <p className="text-meta leading-relaxed text-muted-foreground">
                                                设置后可复现同一组软件 PPS 结果，但不能据此证明实际调查的随机化质量。
                                            </p>
                                        </div>
                                    </div>

                                    {!ppsResult?.completed ? (
                                        <div className="flex justify-end">
                                            <Button onClick={() => void executePPS()} disabled={executing !== null || !hasPpsNumericField || !ppsSizeField || !isPpsSizeValid} data-testid="student-sampling-pps-run" className="w-auto bg-auxiliary px-8 text-auxiliary-foreground hover:bg-auxiliary-hover">
                                                {executing === "pps" ? (
                                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                                ) : (
                                                    <Play className="w-4 h-4 mr-2" />
                                                )}
                                                执行PPS抽样
                                            </Button>
                                        </div>
                                    ) : (
                                        <SamplingSuccessState
                                            summary={`按 ${ppsSummaryFieldLabel} 进行PPS抽样，共抽取 ${ppsPreviewTotal} 个样本${executionTimes.pps !== null ? `，耗时 ${executionTimes.pps} ms` : ""}`}
                                            onRerun={() => void executePPS()}
                                            disabled={executing !== null || !hasPpsNumericField || !ppsSizeField || !isPpsSizeValid}
                                            rerunTestId="student-sampling-pps-rerun"
                                            rerunLabel="重新执行 PPS 抽样"
                                        />
                                    )}
                                    <PpsProbabilityExplanation result={ppsResult} />
                                </CardContent>
                            </Card>
                        </div>
                        <div className="min-w-0 space-y-4">
                            <Card className="min-w-0 rounded-surface border-border bg-card">
                                <CardHeader>
                                    <div className="flex items-center justify-between">
                                        <CardTitle className="text-body text-foreground">已保存的入样记录</CardTitle>
                                        <Badge variant="outline" className="border-input text-muted-foreground">分页预览</Badge>
                                    </div>
                                    <CardDescription className="text-muted-foreground">每页查看 20 条记录，完整数据可在分析阶段导出。</CardDescription>
                                </CardHeader>
                                <CardContent className="h-[360px] min-w-0 overflow-hidden">
                                    {!ppsResult?.completed ? (
                                        <div className="h-full flex items-center justify-center text-label text-muted-foreground italic">
                                            执行上方抽样后，在这里查看入样单位和记录。
                                        </div>
                                    ) : (
                                        <SamplePreviewTable priorityField={experiment?.analysisTarget?.target.field} data={ppsResult.data ?? []} total={ppsPreviewTotal} />
                                    )}
                                </CardContent>
                            </Card>
                        </div>
                    </div>
                </TabsContent>
                )}

                {/* Stratified Sampling */}
                {samplingPolicy.methods.stratified !== "disabled" && (
                <TabsContent value="stratified" className="mt-0 focus-visible:outline-none">
                    <StratifiedSamplingTab
                        n={n}
                        N={N}
                        taskId={taskId}
                        populationStats={populationStats}
                        numericFields={numericFields}
                        analysisTarget={experiment?.analysisTarget?.target}
                        stratumNumericStats={stratumNumericStats}
                        initialResult={initialResults?.stratified ?? null}
                        executing={executing}
                        setExecuting={setExecuting}
                        onResult={(result) => {
                            setStratifiedResult(result);
                            const dataArr = (result.data ?? []) as Array<Record<string, unknown>>;
                            setAnimationSampledData({ data: dataArr, total: getSamplingResultCount("stratified", result) });
                        }}
                        onAnimate={(animLayers, animStratifyBy, opener) => {
                            animationOpenerRef.current = opener;
                            setStratifiedAnimationLayers(animLayers);
                            setStratifiedAnimationStratifyBy(animStratifyBy);
                            if (showAnimation) setAnimatingMethod("stratified");
                        }}
                        buildSavePayload={() => undefined}
                        executionTime={executionTimes.stratified}
                        setExecutionTime={(ms) => setExecutionTimes(prev => ({ ...prev, stratified: ms }))}
                    />
                </TabsContent>
                )}
            </Tabs>

            <details className="rounded-surface border border-border bg-card p-4">
                <summary className="cursor-pointer text-label font-medium">抽样与观测的教学约定</summary>
                <div className="mt-3"><SamplingObservationNotice nonResponseRate={samplePlan?.nonResponseRate}/></div>
            </details>
            <StageActions>
                <div className="min-w-0 space-y-2">
                    <p className="text-meta text-muted-foreground" role="status">{completionHint}</p>
                    <Button variant="outline" onClick={onPrev} data-testid="student-sampling-prev" disabled={isCompleting}>查看样本量规划</Button>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                    {nextMethod && nextMethod !== activeMethod && <Button variant="outline" onClick={() => {setActiveMethod(nextMethod); document.querySelector('[data-testid=student-sampling-tabs]')?.scrollIntoView({block:"start",behavior:"smooth"});}}>继续：{METHOD_LABELS[nextMethod]}</Button>}
                    <Button onClick={() => void handleConfirmNext()} disabled={!allCompleted || isCompleting || executing !== null} data-testid="student-sampling-next" className="w-auto">
                        {isCompleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <ArrowRight className="mr-2 h-4 w-4"/>}进入分析与报告
                    </Button>
                </div>
            </StageActions>

            {/* Immersive Sampling Animation Overlay */}
            {animatingMethod && (
                <ImmersiveSamplingAnimation
                    method={animatingMethod}
                    populationSize={N}
                    sampleSize={animatingMethod === "pps" ? ppsSampleSize : n}
                    interval={animatingMethod === "systematic" ? resultSystematicInterval ?? undefined : undefined}
                    sizeField={animatingMethod === "pps" ? ppsSizeField : undefined}
                    stratifyBy={animatingMethod === "stratified" ? stratifiedAnimationStratifyBy : undefined}
                    layers={animatingMethod === "stratified" ? stratifiedAnimationLayers : undefined}
                    onClose={() => { setAnimatingMethod(null); setAnimationSampledData(null); }}
                    onSkipRest={() => { persistSkipSamplingAnimation(); setShowAnimation(false); }}
                    restoreFocusTo={animationOpenerRef.current}
                    sampledData={animationSampledData?.data}
                    sampledTotal={animationSampledData?.total}
                />
            )}
        </div>
    );
}

export default SamplingExecution;
