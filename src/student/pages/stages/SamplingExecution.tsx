import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
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
import {
    Select,
    SelectContent,
    SelectGroup,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { AlertCircle, CheckCircle2, Play, Loader2, Target, Layers, ArrowRight, Database } from "lucide-react";
import { cn } from "@/lib/utils";
import { useExperiment } from "../ExperimentLayout";
import { experimentApi, type SamplingResultsData, type SamplePlanData } from "../../api-client";
import type { MethodKey as SamplingMethod } from "../../api-client";
import { ImmersiveSamplingAnimation } from "../../components/ImmersiveSamplingAnimation";
import { ImmersiveExperimentLaunch } from "../../components/ImmersiveExperimentLaunch";
import { SamplingSuccessState } from "../../components/SamplingSuccessState";
import { SamplePreviewTable } from "../../components/SamplePreviewTable";
import { StratifiedSamplingTab, type StratifiedLayer } from "../../components/StratifiedSamplingTab";
import {
    PPS_UNAVAILABLE_REASON,
    PPS_UNAVAILABLE_STATUS_MESSAGE,
} from "../../experiment/sampling-messages";
import {
    formatSystematicRange,
    findBestSystematicKValue,
    getSystematicAcceptedRange,
    getSystematicSampleCountRange,
    isSystematicRangeWithinAcceptedRange,
} from "../../experiment/systematic-sampling";

interface SamplingExecutionProps {
    onPrev: () => void;
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

export function SamplingExecution({ onPrev }: SamplingExecutionProps) {
    const { populationSize, experiment, registerStageSave, saveExperiment } = useExperiment();

    // Get sample size from sample plan
    const samplePlan = experiment?.samplePlan as SamplePlanData | null;
    const hasValidSamplePlan = Number.isInteger(samplePlan?.finalSampleSize) && (samplePlan?.finalSampleSize ?? 0) > 0;
    const n = hasValidSamplePlan ? samplePlan!.finalSampleSize : 0;
    const N = populationSize;
    const preferredSystematicK = useMemo(
        () => (hasValidSamplePlan ? findBestSystematicKValue(N, n) : null),
        [N, hasValidSamplePlan, n],
    );
    const hasAnyValidSystematicK = preferredSystematicK !== null;
    const defaultSystematicK = useMemo(() => {
        if (!hasValidSamplePlan || N < 1) {
            return 1;
        }

        if (preferredSystematicK !== null) {
            return preferredSystematicK;
        }

        return Math.max(1, Math.min(N, Math.round(N / n)));
    }, [N, hasValidSamplePlan, n, preferredSystematicK]);

    // Initialize from saved data
    const initialResults = experiment?.samplingResults as SamplingResultsData | null;

    const [simpleResult, setSimpleResult] = useState(initialResults?.simple ?? null);
    const [systematicResult, setSystematicResult] = useState(initialResults?.systematic ?? null);
    const [ppsResult, setPpsResult] = useState(initialResults?.pps ?? null);
    const [stratifiedResult, setStratifiedResult] = useState(initialResults?.stratified ?? null);

    const [kValue, setKValue] = useState(initialResults?.systematic?.kValue ?? defaultSystematicK);
    const [ppsSizeField, setPpsSizeField] = useState(initialResults?.pps?.sizeField ?? "");
    const [ppsSampleSize, setPpsSampleSize] = useState(initialResults?.pps?.sampleCount ?? n);
    const [simpleSeed, setSimpleSeed] = useState(initialResults?.simple?.seed ? String(initialResults.simple.seed) : "");
    const [systematicSeed, setSystematicSeed] = useState(initialResults?.systematic?.seed ? String(initialResults.systematic.seed) : "");
    const [ppsSeed, setPpsSeed] = useState(initialResults?.pps?.seed ? String(initialResults.pps.seed) : "");
    const [executionTimes, setExecutionTimes] = useState<Record<SamplingMethod, number | null>>({ simple: null, systematic: null, pps: null, stratified: null });
    const [populationStats, setPopulationStats] = useState<Record<string, Record<string, number>>>({});
    const [numericFields, setNumericFields] = useState<string[]>([]);
    const [ppsEligibleFields, setPpsEligibleFields] = useState<string[]>([]);
    const [stratumNumericStats, setStratumNumericStats] = useState<Record<string, Record<string, Record<string, { mean: number; stdDev: number }>>>>({});
    const [statsLoaded, setStatsLoaded] = useState(false);

    /** 从经典样本量规划「确认并进入下一阶段」进入时播放一次（sessionStorage 由 SamplePlanning 设置） */
    const [showSamplingStageIntro, setShowSamplingStageIntro] = useState(false);
    useEffect(() => {
        if (!experiment) return;

        const savedResults = experiment.samplingResults as SamplingResultsData | null;
        setSimpleResult(savedResults?.simple ?? null);
        setSystematicResult(savedResults?.systematic ?? null);
        setPpsResult(savedResults?.pps ?? null);
        setStratifiedResult(savedResults?.stratified ?? null);
        setKValue(savedResults?.systematic?.kValue ?? defaultSystematicK);
        setPpsSizeField(savedResults?.pps?.sizeField ?? "");
        setPpsSampleSize(savedResults?.pps?.sampleCount ?? n);
        setSimpleSeed(savedResults?.simple?.seed ? String(savedResults.simple.seed) : "");
        setSystematicSeed(savedResults?.systematic?.seed ? String(savedResults.systematic.seed) : "");
        setPpsSeed(savedResults?.pps?.seed ? String(savedResults.pps.seed) : "");
    }, [defaultSystematicK, experiment?.id, experiment?.samplingResults, n]);

    useEffect(() => {
        if (!experiment?.id) return;
        const key = `wj-sampling-intro-${experiment.id}`;
        try {
            if (sessionStorage.getItem(key) === "1") {
                try {
                    sessionStorage.removeItem(key);
                } catch {
                    /* remove 失败不阻断开场 */
                }
                setShowSamplingStageIntro(true);
            }
        } catch {
            /* 隐私模式等可能导致 getItem 不可用，跳过开场动画 */
        }
    }, [experiment?.id]);

    // Fetch stats on mount
    useEffect(() => {
        setStatsLoaded(false);
        if (experiment?.taskId) {
            experimentApi.getStats(experiment.taskId).then(res => {
                if (res.success && res.data?.stats) {
                    setPopulationStats(res.data.stats);
                    if (res.data.stratumNumericStats) setStratumNumericStats(res.data.stratumNumericStats);
                }
                if (res.success && res.data?.numericFields) {
                    setNumericFields(res.data.numericFields);
                }
                if (res.success && res.data?.ppsEligibleFields) {
                    setPpsEligibleFields(res.data.ppsEligibleFields);
                }
            }).catch((e) => {
                console.error("Failed to load population stats:", e);
            }).finally(() => {
                setStatsLoaded(true);
            });
        }
    }, [experiment?.taskId]);

    useEffect(() => {
        if (!statsLoaded) return;

        if (ppsEligibleFields.length === 0) {
            setPpsSizeField("");
            return;
        }

        if (!ppsSizeField || !ppsEligibleFields.includes(ppsSizeField)) {
            setPpsSizeField(ppsEligibleFields[0] ?? "");
        }
    }, [ppsEligibleFields, ppsSizeField, statsLoaded]);

    useEffect(() => {
        if (!hasValidSamplePlan || !statsLoaded) return;

        if (ppsEligibleFields.length === 0) {
            setPpsResult((current) => current?.unavailable
                || current?.completed
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
    const [confirmNextOpen, setConfirmNextOpen] = useState(false);
    const [animatingMethod, setAnimatingMethod] = useState<SamplingMethod | null>(null);
    const [animationSampledData, setAnimationSampledData] = useState<{ data: Array<Record<string, unknown>>; total: number } | null>(null);
    const [stratifiedAnimationLayers, setStratifiedAnimationLayers] = useState<StratifiedLayer[]>([]);
    const [stratifiedAnimationStratifyBy, setStratifiedAnimationStratifyBy] = useState("gender");
    const stratifiedExecuteRef = useRef<(() => void) | null>(null);

    const parseSeed = useCallback((seedText: string): { seed: number | undefined; error: string | null } => {
        const trimmed = seedText.trim();
        if (!trimmed) return { seed: undefined, error: null };
        if (!/^-?\d+$/.test(trimmed)) return { seed: undefined, error: "随机种子需为整数" };
        const parsed = Number.parseInt(trimmed, 10);
        if (!Number.isSafeInteger(parsed)) return { seed: undefined, error: "随机种子值超出安全整数范围" };
        return { seed: parsed, error: null };
    }, []);

    const buildSamplingResultsPayload = useCallback((next?: Partial<SamplingResultsData>) => {
        const payload: SamplingResultsData = {};
        if (simpleResult) payload.simple = simpleResult;
        if (systematicResult) payload.systematic = systematicResult;
        if (ppsResult) payload.pps = ppsResult;
        if (stratifiedResult) payload.stratified = stratifiedResult;
        return next ? { ...payload, ...next } : payload;
    }, [simpleResult, systematicResult, ppsResult, stratifiedResult]);

    // Save results when they change
    const saveResults = useCallback(async () => {
        if (!hasValidSamplePlan) {
            toast.error("缺少有效的样本量规划，无法保存抽样执行结果");
            return false;
        }
        const payload = buildSamplingResultsPayload();
        if (Object.keys(payload).length === 0) {
            return true;
        }
        return saveExperiment({ samplingResults: payload });
    }, [buildSamplingResultsPayload, hasValidSamplePlan, saveExperiment]);

    useEffect(() => {
        registerStageSave(saveResults);
        return () => {
            registerStageSave(null);
        };
    }, [registerStageSave, saveResults]);


    const taskId = experiment?.taskId;

    // Execute sampling with real API
    const executeSimple = async () => {
        if (!taskId || !hasValidSamplePlan) return;
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
                try {
                    await saveExperiment({ samplingResults: buildSamplingResultsPayload({ simple: nextSimple }) });
                } catch {
                    toast.error("抽样结果保存失败");
                }
            } else {
                toast.error(res.error?.message || "简单随机抽样执行失败");
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
        if (!taskId || !hasValidSamplePlan || kValue < 1) return;
        setExecuting("systematic");
        setAnimationSampledData(null);
        const startTime = performance.now();
        try {
            const { seed, error: seedError } = parseSeed(systematicSeed);
            if (seedError) { toast.error(seedError); setExecuting(null); return; }
            const res = await experimentApi.executeSampling(taskId, "systematic", {
                kValue,
                sampleSize: Math.ceil(N / kValue),
                seed,
            });
            if (res.success && res.data?.result) {
                const nextSystematic = res.data.result;
                setSystematicResult(nextSystematic);
                setExecutionTimes(prev => ({ ...prev, systematic: Math.round(performance.now() - startTime) }));
                const dataArr = (nextSystematic.data ?? []) as Array<Record<string, unknown>>;
                setAnimationSampledData({ data: dataArr, total: nextSystematic.sampleCount ?? dataArr.length });
                try {
                    await saveExperiment({ samplingResults: buildSamplingResultsPayload({ systematic: nextSystematic }) });
                } catch {
                    toast.error("抽样结果保存失败");
                }
            } else {
                toast.error(res.error?.message || "系统抽样执行失败");
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
                try {
                    await saveExperiment({ samplingResults: buildSamplingResultsPayload({ pps: nextPps }) });
                } catch {
                    toast.error("抽样结果保存失败");
                }
            } else {
                toast.error(res.error?.message || "PPS抽样执行失败");
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
    const systematicAcceptedRange = getSystematicAcceptedRange(n);
    const systematicSampleCountRange = getSystematicSampleCountRange(N, kValue);
    const isKValid = kValue >= 1 && kValue <= N &&
        isSystematicRangeWithinAcceptedRange(systematicSampleCountRange, systematicAcceptedRange);

    const ppsMinSize = systematicAcceptedRange?.min ?? 1;
    const ppsMaxSize = systematicAcceptedRange?.max ?? N;
    const isPpsSizeValid = ppsSampleSize >= ppsMinSize && ppsSampleSize <= ppsMaxSize && ppsSampleSize >= 1 && ppsSampleSize <= N;
    const hasPpsNumericField = ppsEligibleFields.length > 0;
    const ppsCompletedOrUnavailable = Boolean(ppsResult?.completed || ppsResult?.unavailable || !hasPpsNumericField);
    const ppsPreviewTotal = ppsResult?.sampleCount ?? ppsResult?.data?.length ?? 0;
    const ppsSummaryFieldLabel = ppsResult?.sizeField
        ? FIELD_LABELS[ppsResult.sizeField] || ppsResult.sizeField
        : "所选规模变量";
    const allCompleted = Boolean(simpleResult?.completed && systematicResult?.completed && ppsCompletedOrUnavailable && stratifiedResult?.completed);
    const completedMethodCount = [
        Boolean(simpleResult?.completed),
        Boolean(systematicResult?.completed),
        ppsCompletedOrUnavailable,
        Boolean(stratifiedResult?.completed),
    ].filter(Boolean).length;

    const handleConfirmNext = async () => {
        const saved = await saveResults();
        if (!saved) return;

        await saveExperiment({ currentStage: 4 });
    };

    if (!hasValidSamplePlan) {
        return (
            <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-right-4 duration-300" data-testid="student-stage-sampling-blocked">
                <Card className="border-destructive/20 bg-destructive/5">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-destructive">
                            <AlertCircle className="size-5" />
                            无法开始抽样执行
                        </CardTitle>
                        <CardDescription>
                            当前实验缺少有效的最终样本量，抽样执行必须建立在已确认的样本量规划之上。
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-4">
                        <div className="rounded-lg border border-border bg-card/70 px-4 py-3 text-sm text-foreground">
                            请返回“样本量规划”阶段，重新确认并保存最终样本量后，再进入本阶段。
                        </div>
                        <div className="flex justify-between">
                            <Button variant="outline" onClick={onPrev} data-testid="student-sampling-blocked-prev">
                                上一阶段
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-right-4 duration-300" data-testid="student-stage-sampling">
            {showSamplingStageIntro && samplePlan && (
                <ImmersiveExperimentLaunch
                    populationSize={N}
                    sampleSize={n}
                    estimationType={samplePlan.estimationType ?? "proportion"}
                    confidenceLevel={String(samplePlan.confidenceLevel ?? "95")}
                    marginOfError={samplePlan.marginOfError ?? 5}
                    onComplete={() => setShowSamplingStageIntro(false)}
                    onClose={() => setShowSamplingStageIntro(false)}
                />
            )}
            <Card>
                <CardContent className="px-6 py-6">
                    <div className="flex flex-wrap items-center justify-between gap-6">
                        <div className="flex items-center gap-3">
                            <div className="rounded-lg border border-border bg-muted/50 p-2.5">
                                <Target className="size-5 text-primary" />
                            </div>
                            <div>
                                <div className="text-sm font-medium text-muted-foreground">规划样本量</div>
                                <div className="text-xl font-bold text-foreground">{n}</div>
                            </div>
                        </div>
                        <Separator orientation="vertical" className="hidden h-10 sm:block" />
                        <div className="flex items-center gap-3">
                            <div className="rounded-lg border border-border bg-muted/50 p-2.5">
                                <Database className="size-5 text-primary" />
                            </div>
                            <div>
                                <div className="text-sm font-medium text-muted-foreground">总体规模</div>
                                <div className="text-xl font-bold text-foreground">{N.toLocaleString()}</div>
                            </div>
                        </div>
                        <Separator orientation="vertical" className="hidden h-10 sm:block" />
                        <div className="flex items-center gap-3">
                            <div className="rounded-lg border border-border bg-muted/50 p-2.5">
                                <Layers className="size-5 text-primary" />
                            </div>
                            <div>
                                <div className="text-sm font-medium text-muted-foreground">完成进度</div>
                                <div className="flex items-center gap-2">
                                    <span className="text-xl font-bold text-foreground">
                                        {completedMethodCount}/4
                                    </span>
                                    <span className="text-sm text-muted-foreground">种方法</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Sampling methods tabs */}
            <Tabs defaultValue="simple" className="flex flex-col gap-6">
                <TabsList className="flex h-auto w-full" data-testid="student-sampling-tabs">
                    <TabsTrigger value="simple" data-testid="student-sampling-tab-simple" className="flex-1 py-2.5">
                        <div className="flex items-center gap-2">
                            <span>简单随机抽样</span>
                            {simpleResult?.completed && <CheckCircle2 data-icon="inline-end" />}
                        </div>
                    </TabsTrigger>
                    <TabsTrigger value="systematic" data-testid="student-sampling-tab-systematic" className="flex-1 py-2.5">
                        <div className="flex items-center gap-2">
                            <span>系统抽样</span>
                            {systematicResult?.completed && <CheckCircle2 data-icon="inline-end" />}
                        </div>
                    </TabsTrigger>
                    <TabsTrigger value="pps" data-testid="student-sampling-tab-pps" className="flex-1 py-2.5">
                        <div className="flex items-center gap-2">
                            <span>PPS抽样</span>
                            {ppsResult?.completed && <CheckCircle2 data-icon="inline-end" />}
                        </div>
                    </TabsTrigger>
                    <TabsTrigger value="stratified" data-testid="student-sampling-tab-stratified" className="flex-1 py-2.5">
                        <div className="flex items-center gap-2">
                            <span>分层抽样</span>
                            {stratifiedResult?.completed && <CheckCircle2 data-icon="inline-end" />}
                        </div>
                    </TabsTrigger>
                </TabsList>

                {/* Simple Random Sampling */}
                <TabsContent value="simple" className="mt-0 focus-visible:outline-none">
                    <div className="grid grid-cols-1 gap-6 animate-in fade-in slide-in-from-bottom-2 duration-300 lg:grid-cols-3">
                        <div className="flex flex-col gap-4 lg:col-span-2">
                            <Card>
                                <CardHeader>
                                    <CardTitle className="flex items-center gap-2 text-foreground">
                                        <div className="mr-2 h-6 min-w-2 rounded-full bg-primary" />
                                        简单随机抽样
                                    </CardTitle>
                                    <CardDescription className="pt-1">
                                        从 {N.toLocaleString()} 个总体中随机抽取 {n} 个样本，每个个体被抽中的概率相等。
                                    </CardDescription>
                                </CardHeader>
                                <CardContent className="flex flex-col gap-6 pt-4">
                                    <Field className="rounded-lg border border-border bg-muted/30 p-4">
                                        <FieldLabel htmlFor="simpleSeed" className="text-xs">随机种子（可选）</FieldLabel>
                                        <Input
                                            id="simpleSeed"
                                            type="number"
                                            value={simpleSeed}
                                            onChange={(e) => setSimpleSeed(e.target.value)}
                                            placeholder="留空则每次随机"
                                            data-testid="student-sampling-simple-seed"
                                        />
                                        <FieldDescription className="text-xs">设置后可复现同一组抽样结果。</FieldDescription>
                                    </Field>
                                    {!simpleResult?.completed ? (
                                        <div className="rounded-lg border border-dashed border-border bg-muted/20 p-8 text-center">
                                            <div className="mb-4 text-muted-foreground">尚未执行抽样</div>
                                            <Button onClick={() => setAnimatingMethod("simple")} disabled={executing !== null} data-testid="student-sampling-simple-run">
                                                {executing === "simple" ? (
                                                    <Loader2 data-icon="inline-start" className="animate-spin" />
                                                ) : (
                                                    <Play data-icon="inline-start" />
                                                )}
                                                开始随机抽样
                                            </Button>
                                        </div>
                                    ) : (
                                        <SamplingSuccessState
                                            summary={`共成功抽取 ${simpleResult.sampleCount} 个样本${executionTimes.simple !== null ? `，耗时 ${executionTimes.simple} ms` : ""}${simpleResult.seed ? `，Seed ${simpleResult.seed}` : ""}`}
                                            onRerun={() => setAnimatingMethod("simple")}
                                            disabled={executing !== null}
                                            rerunTestId="student-sampling-simple-rerun"
                                        />
                                    )}
                                </CardContent>
                            </Card>
                        </div>
                        <div className="flex flex-col gap-4">
                            <Card className="h-full">
                                <CardHeader>
                                    <div className="flex items-center justify-between">
                                        <CardTitle className="text-base text-foreground">抽样预览</CardTitle>
                                        <Badge variant="outline">分页预览</Badge>
                                    </div>
                                    <CardDescription>展示部分抽样结果数据</CardDescription>
                                </CardHeader>
                                <CardContent className="h-[300px] overflow-hidden">
                                    {!simpleResult?.completed ? (
                                        <div className="flex h-full items-center justify-center text-sm italic text-muted-foreground">
                                            完成抽样后展示
                                        </div>
                                    ) : (
                                        <SamplePreviewTable data={simpleResult.data ?? []} total={simpleResult.sampleCount} />
                                    )}
                                </CardContent>
                            </Card>
                        </div>
                    </div>
                </TabsContent>

                {/* Systematic Sampling */}
                <TabsContent value="systematic" className="mt-0 focus-visible:outline-none">
                    <div className="grid grid-cols-1 gap-6 animate-in fade-in slide-in-from-bottom-2 duration-300 lg:grid-cols-3">
                        <div className="flex flex-col gap-4 lg:col-span-2">
                            <Card>
                                <CardHeader>
                                    <CardTitle className="flex items-center gap-2 text-foreground">
                                        <div className="mr-2 h-6 min-w-2 rounded-full bg-primary" />
                                        系统抽样
                                    </CardTitle>
                                    <CardDescription className="pt-1">
                                        按固定间隔 K 从总体中抽取样本。规划样本量为 {n}，实际样本量会随 K 值和随机起点在小范围内波动。
                                    </CardDescription>
                                </CardHeader>
                                <CardContent className="flex flex-col gap-6 pt-4">
                                    <FieldGroup className="grid grid-cols-1 gap-6 rounded-lg border border-border bg-muted/30 p-4 md:grid-cols-3">
                                        <Field>
                                            <FieldLabel htmlFor="kValue">间隔 K 值 (步长)</FieldLabel>
                                            <div className="relative">
                                                <Input
                                                    id="kValue"
                                                    type="number"
                                                    value={kValue}
                                                    onChange={(e) => setKValue(parseInt(e.target.value) || 1)}
                                                    min={1}
                                                    max={N}
                                                    data-testid="student-sampling-systematic-k"
                                                    className="pr-10"
                                                />
                                                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">Steps</span>
                                            </div>
                                        </Field>
                                        <Field data-invalid={!isKValid || undefined}>
                                            <FieldLabel>预计抽取数量</FieldLabel>
                                            <div className={cn(
                                                "flex items-center justify-between rounded-md border p-2.5",
                                                isKValid ? "border-border bg-background" : "border-destructive/50 bg-destructive/10",
                                            )}>
                                                <span className={cn("font-mono font-bold", isKValid ? "text-foreground" : "text-destructive")}>{formatSystematicRange(systematicSampleCountRange)}</span>
                                                <span className="text-xs text-muted-foreground">允许范围: {formatSystematicRange(systematicAcceptedRange)}</span>
                                            </div>
                                            {systematicSampleCountRange.min !== systematicSampleCountRange.max && (
                                                <FieldDescription className="text-xs">
                                                    随机起点不同，实际抽取数量会在 {formatSystematicRange(systematicSampleCountRange)} 之间波动。
                                                </FieldDescription>
                                            )}
                                            {!hasAnyValidSystematicK && (
                                                <FieldDescription className="text-xs text-destructive">
                                                    当前总体规模与目标样本量下，没有任何 K 值能满足允许范围，请返回上一阶段调整样本量规划。
                                                </FieldDescription>
                                            )}
                                            {hasAnyValidSystematicK && !isKValid && (
                                                <FieldDescription className="text-xs text-destructive">
                                                    当前 K 值的实际样本量可能超出允许范围，请调整 K 值
                                                </FieldDescription>
                                            )}
                                        </Field>
                                        <Field>
                                            <FieldLabel htmlFor="systematicSeed">随机种子（可选）</FieldLabel>
                                            <Input
                                                id="systematicSeed"
                                                type="number"
                                                value={systematicSeed}
                                                onChange={(e) => setSystematicSeed(e.target.value)}
                                                placeholder="留空则每次随机"
                                                data-testid="student-sampling-systematic-seed"
                                            />
                                            <FieldDescription className="text-xs">
                                                设置后可复现系统抽样结果。
                                            </FieldDescription>
                                        </Field>
                                    </FieldGroup>

                                    {!systematicResult?.completed ? (
                                        <div className="flex justify-end">
                                            <Button onClick={() => setAnimatingMethod("systematic")} disabled={executing !== null || !isKValid} data-testid="student-sampling-systematic-run" className="w-auto px-8">
                                                {executing === "systematic" ? (
                                                    <Loader2 data-icon="inline-start" className="animate-spin" />
                                                ) : (
                                                    <Play data-icon="inline-start" />
                                                )}
                                                执行系统抽样
                                            </Button>
                                        </div>
                                    ) : (
                                        <SamplingSuccessState
                                            summary={`K=${systematicResult.kValue}，共抽取 ${systematicResult.sampleCount} 个样本${executionTimes.systematic !== null ? `，耗时 ${executionTimes.systematic} ms` : ""}`}
                                            onRerun={() => setAnimatingMethod("systematic")}
                                            disabled={executing !== null || !isKValid}
                                            rerunTestId="student-sampling-systematic-rerun"
                                        />
                                    )}
                                </CardContent>
                            </Card>
                        </div>
                        <div className="flex flex-col gap-4">
                            <Card className="h-full">
                                <CardHeader>
                                    <div className="flex items-center justify-between">
                                        <CardTitle className="text-base text-foreground">抽样预览</CardTitle>
                                        <Badge variant="outline">分页预览</Badge>
                                    </div>
                                    <CardDescription>展示部分抽样结果数据</CardDescription>
                                </CardHeader>
                                <CardContent className="h-[300px] overflow-hidden">
                                    {!systematicResult?.completed ? (
                                        <div className="flex h-full items-center justify-center text-sm italic text-muted-foreground">
                                            完成抽样后展示
                                        </div>
                                    ) : (
                                        <SamplePreviewTable data={systematicResult.data ?? []} total={systematicResult.sampleCount} />
                                    )}
                                </CardContent>
                            </Card>
                        </div>
                    </div>
                </TabsContent>

                {/* PPS Sampling */}
                <TabsContent value="pps" className="mt-0 focus-visible:outline-none">
                    <div className="grid grid-cols-1 gap-6 animate-in fade-in slide-in-from-bottom-2 duration-300 lg:grid-cols-3">
                        <div className="flex flex-col gap-4 lg:col-span-2">
                            <Card>
                                <CardHeader>
                                    <CardTitle className="flex items-center gap-2 text-foreground">
                                        <div className="mr-2 h-6 min-w-2 rounded-full bg-primary" />
                                        PPS抽样（概率与规模成比例抽样）
                                    </CardTitle>
                                    <CardDescription className="pt-1">
                                        每个单位被抽中的概率与其"规模"指标成正比。选择一个数值型变量作为规模度量，并指定抽样数量（允许在目标样本量的 80%-120% 范围内调整）。
                                    </CardDescription>
                                </CardHeader>
                                <CardContent className="flex flex-col gap-6 pt-4">
                                    <FieldGroup className="grid grid-cols-1 gap-6 rounded-lg border border-border bg-muted/30 p-4 md:grid-cols-3">
                                        <Field data-invalid={!hasPpsNumericField || undefined}>
                                            <FieldLabel>选择规模变量</FieldLabel>
                                            {hasPpsNumericField ? (
                                                <Select value={ppsSizeField} onValueChange={setPpsSizeField}>
                                                    <SelectTrigger data-testid="student-sampling-pps-size-field" className="w-full">
                                                        <SelectValue placeholder="选择数值变量" />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <SelectGroup>
                                                            {ppsEligibleFields.map(key => (
                                                                <SelectItem key={key} value={key}>
                                                                    {FIELD_LABELS[key] || key}
                                                                </SelectItem>
                                                            ))}
                                                        </SelectGroup>
                                                    </SelectContent>
                                                </Select>
                                            ) : (
                                                <div className="flex h-10 items-center rounded-md border border-destructive/20 bg-destructive/10 px-3 text-sm text-destructive" data-testid="student-sampling-pps-unavailable">
                                                    {PPS_UNAVAILABLE_STATUS_MESSAGE}
                                                </div>
                                            )}
                                            <FieldDescription className={cn("text-xs leading-relaxed", !hasPpsNumericField && "text-destructive")}>
                                                {hasPpsNumericField
                                                    ? "选择一个规模变量（如收入、人口等），该字段必须在总体中对每个单位都为正数。"
                                                    : PPS_UNAVAILABLE_REASON}
                                            </FieldDescription>
                                        </Field>
                                        <Field data-invalid={!isPpsSizeValid || undefined}>
                                            <FieldLabel htmlFor="ppsSampleSize">抽样数量</FieldLabel>
                                            <Input
                                                id="ppsSampleSize"
                                                type="number"
                                                value={ppsSampleSize}
                                                onChange={(e) => setPpsSampleSize(Math.max(1, Number.parseInt(e.target.value, 10) || 0))}
                                                min={ppsMinSize}
                                                max={ppsMaxSize}
                                                data-testid="student-sampling-pps-sample-size"
                                                aria-invalid={!isPpsSizeValid || undefined}
                                                className={cn(!isPpsSizeValid && "border-destructive")}
                                            />
                                            <FieldDescription className="text-xs leading-relaxed">
                                                允许范围: {ppsMinSize}-{ppsMaxSize}（目标值 {n} 的 80%-120%）
                                            </FieldDescription>
                                        </Field>
                                        <Field>
                                            <FieldLabel htmlFor="ppsSeed">随机种子（可选）</FieldLabel>
                                            <Input
                                                id="ppsSeed"
                                                type="number"
                                                value={ppsSeed}
                                                onChange={(e) => setPpsSeed(e.target.value)}
                                                placeholder="留空则每次随机"
                                                data-testid="student-sampling-pps-seed"
                                            />
                                            <FieldDescription className="text-xs leading-relaxed">
                                                设置后可复现同一组PPS抽样结果。
                                            </FieldDescription>
                                        </Field>
                                    </FieldGroup>

                                    {!ppsResult?.completed ? (
                                        <div className="flex justify-end">
                                            <Button onClick={() => setAnimatingMethod("pps")} disabled={executing !== null || !hasPpsNumericField || !ppsSizeField || !isPpsSizeValid} data-testid="student-sampling-pps-run" className="w-auto px-8">
                                                {executing === "pps" ? (
                                                    <Loader2 data-icon="inline-start" className="animate-spin" />
                                                ) : (
                                                    <Play data-icon="inline-start" />
                                                )}
                                                执行PPS抽样
                                            </Button>
                                        </div>
                                    ) : (
                                        <SamplingSuccessState
                                            summary={`按 ${ppsSummaryFieldLabel} 进行PPS抽样，共抽取 ${ppsPreviewTotal} 个样本${executionTimes.pps !== null ? `，耗时 ${executionTimes.pps} ms` : ""}`}
                                            onRerun={() => setAnimatingMethod("pps")}
                                            disabled={executing !== null || !hasPpsNumericField || !ppsSizeField || !isPpsSizeValid}
                                            rerunTestId="student-sampling-pps-rerun"
                                        />
                                    )}
                                </CardContent>
                            </Card>
                        </div>
                        <div className="flex flex-col gap-4">
                            <Card className="h-full">
                                <CardHeader>
                                    <div className="flex items-center justify-between">
                                        <CardTitle className="text-base text-foreground">抽样预览</CardTitle>
                                        <Badge variant="outline">分页预览</Badge>
                                    </div>
                                    <CardDescription>展示部分抽样结果数据</CardDescription>
                                </CardHeader>
                                <CardContent className="h-[300px] overflow-hidden">
                                    {!ppsResult?.completed ? (
                                        <div className="flex h-full items-center justify-center text-sm italic text-muted-foreground">
                                            完成抽样后展示
                                        </div>
                                    ) : (
                                        <SamplePreviewTable data={ppsResult.data ?? []} total={ppsPreviewTotal} />
                                    )}
                                </CardContent>
                            </Card>
                        </div>
                    </div>
                </TabsContent>

                {/* Stratified Sampling */}
                <TabsContent value="stratified" className="mt-0 focus-visible:outline-none">
                    <StratifiedSamplingTab
                        n={n}
                        N={N}
                        taskId={taskId}
                        populationStats={populationStats}
                        numericFields={numericFields}
                        stratumNumericStats={stratumNumericStats}
                        initialResult={initialResults?.stratified ?? null}
                        executing={executing}
                        setExecuting={setExecuting}
                        onResult={(result) => {
                            setStratifiedResult(result);
                            const dataArr = (result.data ?? []) as Array<Record<string, unknown>>;
                            setAnimationSampledData({ data: dataArr, total: result.layers?.reduce((a, l) => a + l.sampleCount, 0) ?? dataArr.length });
                        }}
                        onAnimate={(animLayers, animStratifyBy) => {
                            setStratifiedAnimationLayers(animLayers);
                            setStratifiedAnimationStratifyBy(animStratifyBy);
                            setAnimatingMethod("stratified");
                        }}
                        onRegisterExecute={(fn) => { stratifiedExecuteRef.current = fn; }}
                        onExecutionError={() => { setAnimatingMethod(null); setAnimationSampledData(null); }}
                        buildSavePayload={async (result) => {
                            try {
                                await saveExperiment({ samplingResults: buildSamplingResultsPayload({ stratified: result }) });
                            } catch {
                                toast.error("抽样结果保存失败");
                            }
                        }}
                        executionTime={executionTimes.stratified}
                        setExecutionTime={(ms) => setExecutionTimes(prev => ({ ...prev, stratified: ms }))}
                    />
                </TabsContent>
            </Tabs>

            {/* Navigation */}
            <div className="flex flex-col gap-6">
                <Separator />
                <div className="flex justify-between gap-3">
                    <Button variant="outline" onClick={onPrev} data-testid="student-sampling-prev">
                        上一阶段
                    </Button>
                    <Button onClick={() => setConfirmNextOpen(true)} disabled={!allCompleted} data-testid="student-sampling-next">
                        {allCompleted ? "完成本阶段" : `请完成所有抽样方法 (${completedMethodCount}/4)`}
                        <ArrowRight data-icon="inline-end" />
                    </Button>
                </div>
            </div>

            {/* Confirm Next Stage Dialog */}
            <AlertDialog open={confirmNextOpen} onOpenChange={setConfirmNextOpen}>
                <AlertDialogContent data-testid="student-sampling-confirm-dialog">
                    <AlertDialogHeader>
                        <AlertDialogTitle>确认完成抽样执行</AlertDialogTitle>
                        <AlertDialogDescription asChild>
                            <div className="text-sm text-muted-foreground">
                                您已完成四种抽样方法的执行：
                                <div className="mb-3 mt-3 flex flex-col gap-2 rounded-lg border border-border bg-card/70 p-4">
                                    <div className="flex justify-between gap-4"><span>简单随机抽样:</span> <span className="text-foreground">{simpleResult?.sampleCount} 样本</span></div>
                                    <div className="flex justify-between gap-4"><span>系统抽样:</span> <span className="text-foreground">{systematicResult?.sampleCount} 样本 (K={systematicResult?.kValue})</span></div>
                                    <div className="flex justify-between">
                                        <span>PPS抽样:</span>
                                        <span className="text-foreground">
                                            {ppsResult?.unavailable
                                                ? PPS_UNAVAILABLE_STATUS_MESSAGE
                                                : `${ppsResult?.sampleCount} 样本`}
                                        </span>
                                    </div>
                                    <div className="flex justify-between gap-4"><span>分层抽样:</span> <span className="text-foreground">{stratifiedResult?.layers?.reduce((a, l) => a + l.sampleCount, 0)} 样本</span></div>
                                </div>
                                <p>确认后将进入分析与报告阶段。</p>
                            </div>
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>取消</AlertDialogCancel>
                        <AlertDialogAction onClick={handleConfirmNext} data-testid="student-sampling-confirm">确认</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* Immersive Sampling Animation Overlay */}
            {animatingMethod && (
                <ImmersiveSamplingAnimation
                    method={animatingMethod}
                    populationSize={N}
                    sampleSize={animatingMethod === "systematic" ? Math.ceil(N / kValue) : animatingMethod === "pps" ? ppsSampleSize : n}
                    kValue={animatingMethod === "systematic" ? kValue : undefined}
                    sizeField={animatingMethod === "pps" ? ppsSizeField : undefined}
                    stratifyBy={animatingMethod === "stratified" ? stratifiedAnimationStratifyBy : undefined}
                    layers={animatingMethod === "stratified" ? stratifiedAnimationLayers : undefined}
                    onAnimationComplete={() => {
                        if (animatingMethod === "simple") executeSimple();
                        else if (animatingMethod === "systematic") executeSystematic();
                        else if (animatingMethod === "pps") executePPS();
                        else if (animatingMethod === "stratified") stratifiedExecuteRef.current?.();
                    }}
                    onClose={() => { setAnimatingMethod(null); setAnimationSampledData(null); }}
                    sampledData={animationSampledData?.data}
                    sampledTotal={animationSampledData?.total}
                />
            )}
        </div>
    );
}

export default SamplingExecution;
