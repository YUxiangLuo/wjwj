import { useState, useEffect, useCallback, useRef } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
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
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { AlertCircle, CheckCircle2, Play, Loader2, Target, Layers, ArrowRight, Database, RefreshCw } from "lucide-react";
import { useExperiment } from "../ExperimentLayout";
import { experimentApi, type SamplingResultsData, type SamplePlanData } from "../../api-client";
import type { MethodKey as SamplingMethod } from "../../api-client";
import { ImmersiveSamplingAnimation } from "../../components/ImmersiveSamplingAnimation";
import { SamplingSuccessState } from "../../components/SamplingSuccessState";
import { SamplePreviewTable } from "../../components/SamplePreviewTable";
import { StratifiedSamplingTab, type StratifiedLayer } from "../../components/StratifiedSamplingTab";
import {
    PPS_UNAVAILABLE_REASON,
    PPS_UNAVAILABLE_STATUS_MESSAGE,
} from "../../experiment/sampling-messages";
import { pickDefaultPpsSizeField } from "../../experiment/pps-size-field";
import {
    formatSystematicInterval,
    getStoredSystematicInterval,
    getSystematicInterval,
} from "../../experiment/systematic-sampling";
import { getSamplingAcceptedRange } from "../../experiment/sampling-tolerance";
import { getSamplingResultCount } from "../../experiment/sampling-results";

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
    const { populationSize, experiment, completeStage } = useExperiment();

    // Get sample size from sample plan
    const samplePlan = experiment?.samplePlan as SamplePlanData | null;
    const hasValidSamplePlan = Number.isInteger(samplePlan?.finalSampleSize) && (samplePlan?.finalSampleSize ?? 0) > 0;
    const n = hasValidSamplePlan ? samplePlan!.finalSampleSize : 0;
    const N = populationSize;
    const systematicInterval = getSystematicInterval(N, n);

    // Initialize from saved data
    const initialResults = experiment?.samplingResults as SamplingResultsData | null;

    const [simpleResult, setSimpleResult] = useState(initialResults?.simple ?? null);
    const [systematicResult, setSystematicResult] = useState(initialResults?.systematic ?? null);
    const [ppsResult, setPpsResult] = useState(initialResults?.pps ?? null);
    const [stratifiedResult, setStratifiedResult] = useState(initialResults?.stratified ?? null);

    const [ppsSizeField, setPpsSizeField] = useState(initialResults?.pps?.sizeField ?? "");
    const [ppsSampleSize, setPpsSampleSize] = useState(initialResults?.pps?.sampleCount ?? n);
    const [simpleSeed, setSimpleSeed] = useState(initialResults?.simple?.seed ? String(initialResults.simple.seed) : "");
    const [systematicSeed, setSystematicSeed] = useState(initialResults?.systematic?.seed ? String(initialResults.systematic.seed) : "");
    const [ppsSeed, setPpsSeed] = useState(initialResults?.pps?.seed ? String(initialResults.pps.seed) : "");
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
        setStatsState("loading");
        setStatsError("");
        experimentApi.getStats(experiment.taskId).then(res => {
            if (!active) return;
            if (!res.success || !res.data) {
                setStatsState("error");
                setStatsError(res.error?.message || "总体统计信息加载失败");
                return;
            }
            setPopulationStats(res.data.stats ?? {});
            setStratumNumericStats(res.data.stratumNumericStats ?? {});
            setNumericFields(res.data.numericFields ?? []);
            setPpsEligibleFields(res.data.ppsEligibleFields ?? []);
            setStatsState("ready");
        }).catch((cause) => {
            if (!active) return;
            console.error("Failed to load population stats:", cause);
            setStatsState("error");
            setStatsError("总体统计信息加载失败，请检查网络后重试");
        });

        return () => {
            active = false;
        };
    }, [experiment?.taskId, statsReloadKey]);

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
    const [confirmNextOpen, setConfirmNextOpen] = useState(false);
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
                setAnimatingMethod("simple");
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
                setAnimatingMethod("systematic");
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
                setAnimatingMethod("pps");
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
    const samplingAcceptedRange = getSamplingAcceptedRange(n, N);
    const ppsMinSize = samplingAcceptedRange?.min ?? 1;
    const ppsMaxSize = samplingAcceptedRange?.max ?? N;
    const isPpsSizeValid = ppsSampleSize >= ppsMinSize && ppsSampleSize <= ppsMaxSize && ppsSampleSize >= 1 && ppsSampleSize <= N;
    const hasPpsNumericField = ppsEligibleFields.length > 0;
    const ppsCompletedOrUnavailable = Boolean(
        ppsResult?.completed || ppsResult?.unavailable || (statsLoaded && !hasPpsNumericField),
    );
    const ppsPreviewTotal = ppsResult?.sampleCount ?? ppsResult?.data?.length ?? 0;
    const ppsSummaryFieldLabel = ppsResult?.sizeField
        ? FIELD_LABELS[ppsResult.sizeField] || ppsResult.sizeField
        : "所选规模变量";
    const systematicCompletedForCurrentPlan = Boolean(
        systematicResult?.completed && systematicResult.sampleCount === n,
    );
    const resultSystematicInterval = getStoredSystematicInterval(systematicResult) ?? systematicInterval;
    const allCompleted = Boolean(simpleResult?.completed && systematicCompletedForCurrentPlan && ppsCompletedOrUnavailable && stratifiedResult?.completed);
    const completedMethodCount = [
        Boolean(simpleResult?.completed),
        systematicCompletedForCurrentPlan,
        ppsCompletedOrUnavailable,
        Boolean(stratifiedResult?.completed),
    ].filter(Boolean).length;

    const handleConfirmNext = async () => {
        await completeStage(3, {});
    };

    if (!hasValidSamplePlan) {
        return (
            <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300" data-testid="student-stage-sampling-blocked">
                <Card className="rounded-2xl border-destructive/20 bg-destructive/10 shadow-sm">
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
                        <div className="rounded-xl border border-destructive/80 bg-background/70 px-4 py-3 text-sm text-foreground/90">
                            请返回“样本量规划”阶段，重新确认并保存最终样本量后，再进入本阶段。
                        </div>
                        <div className="flex justify-between">
                            <Button variant="outline" onClick={onPrev} data-testid="student-sampling-blocked-prev" className="border-input bg-muted text-foreground/90 hover:bg-muted hover:text-foreground">
                                上一阶段
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            </div>
        );
    }

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300" data-testid="student-stage-sampling">
            <Card className="rounded-2xl border-border bg-card/50 shadow-sm">
                <CardContent className="py-6 px-6">
                    <div className="flex flex-wrap items-center justify-between gap-6">
                        <div className="flex items-center gap-3">
                            <div className="bg-muted p-2.5 rounded-xl border border-input">
                                <Target className="w-5 h-5 text-primary" />
                            </div>
                            <div>
                                <div className="text-sm font-medium text-muted-foreground">规划样本量</div>
                                <div className="text-xl font-bold text-foreground">{n}</div>
                            </div>
                        </div>
                        <div className="w-px h-10 bg-muted"></div>
                        <div className="flex items-center gap-3">
                            <div className="bg-muted p-2.5 rounded-xl border border-input">
                                <Database className="w-5 h-5 text-info" />
                            </div>
                            <div>
                                <div className="text-sm font-medium text-muted-foreground">总体规模</div>
                                <div className="text-xl font-bold text-foreground">{N.toLocaleString()}</div>
                            </div>
                        </div>
                        <div className="w-px h-10 bg-muted"></div>
                        <div className="flex items-center gap-3">
                            <div className="bg-muted p-2.5 rounded-xl border border-input">
                                <Layers className="w-5 h-5 text-warning" />
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

            {statsState === "loading" && (
                <Card className="rounded-2xl border-info/20 bg-info/10 shadow-sm" data-testid="student-sampling-stats-loading">
                    <CardContent className="flex items-center gap-3 px-4 py-3 text-sm text-info">
                        <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
                        正在加载总体统计信息和 PPS 可用字段…
                    </CardContent>
                </Card>
            )}

            {statsState === "error" && (
                <Card className="rounded-2xl border-destructive/20 bg-destructive/10 shadow-sm" data-testid="student-sampling-stats-error">
                    <CardContent className="flex items-center justify-between gap-4 px-4 py-3">
                        <div className="flex min-w-0 items-center gap-3 text-sm text-destructive">
                            <AlertCircle className="h-4 w-4 shrink-0" />
                            <span>{statsError}</span>
                        </div>
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => setStatsReloadKey((value) => value + 1)}
                            data-testid="student-sampling-stats-retry"
                            className="shrink-0 border-destructive/30 bg-background text-destructive hover:bg-destructive/10 hover:text-destructive"
                        >
                            <RefreshCw className="mr-1.5 h-4 w-4" />
                            重试
                        </Button>
                    </CardContent>
                </Card>
            )}

            {/* Sampling methods tabs */}
            <Tabs defaultValue="simple" className="space-y-6">
                <TabsList className="bg-card border border-border p-1 rounded-xl w-full min-w-0 flex h-auto gap-1" data-testid="student-sampling-tabs">
                    <TabsTrigger value="simple" data-testid="student-sampling-tab-simple" className="min-w-0 flex-1 rounded-lg py-2.5 px-3 text-sm data-[state=active]:bg-muted data-[state=active]:text-foreground text-muted-foreground">
                        <div className="min-w-0 flex items-center justify-center gap-2">
                            <span>简单随机抽样</span>
                            {simpleResult?.completed && <CheckCircle2 className="w-4 h-4 shrink-0 text-success" />}
                        </div>
                    </TabsTrigger>
                    <TabsTrigger value="systematic" data-testid="student-sampling-tab-systematic" className="min-w-0 flex-1 rounded-lg py-2.5 px-3 text-sm data-[state=active]:bg-muted data-[state=active]:text-foreground text-muted-foreground">
                        <div className="min-w-0 flex items-center justify-center gap-2">
                            <span>系统抽样</span>
                            {systematicCompletedForCurrentPlan && <CheckCircle2 className="w-4 h-4 shrink-0 text-success" />}
                        </div>
                    </TabsTrigger>
                    <TabsTrigger value="pps" data-testid="student-sampling-tab-pps" className="min-w-0 flex-1 rounded-lg py-2.5 px-3 text-sm data-[state=active]:bg-muted data-[state=active]:text-foreground text-muted-foreground">
                        <div className="min-w-0 flex items-center justify-center gap-2">
                            <span>PPS抽样</span>
                            {ppsResult?.completed && <CheckCircle2 className="w-4 h-4 shrink-0 text-success" />}
                        </div>
                    </TabsTrigger>
                    <TabsTrigger value="stratified" data-testid="student-sampling-tab-stratified" className="min-w-0 flex-1 rounded-lg py-2.5 px-3 text-sm data-[state=active]:bg-muted data-[state=active]:text-foreground text-muted-foreground">
                        <div className="min-w-0 flex items-center justify-center gap-2">
                            <span>分层抽样</span>
                            {stratifiedResult?.completed && <CheckCircle2 className="w-4 h-4 shrink-0 text-success" />}
                        </div>
                    </TabsTrigger>
                </TabsList>

                {/* Simple Random Sampling */}
                <TabsContent value="simple" className="mt-0 focus-visible:outline-none">
                    <div className="grid grid-cols-3 gap-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                        <div className="col-span-2 space-y-4">
                            <Card className="rounded-2xl border-border bg-card/50 shadow-sm">
                                <CardHeader>
                                    <CardTitle className="text-foreground flex items-center gap-2">
                                        <div className="w-2 h-6 bg-primary rounded-full mr-2"></div>
                                        简单随机抽样
                                    </CardTitle>
                                    <CardDescription className="text-muted-foreground pt-1">
                                        从 {N.toLocaleString()} 个总体中随机抽取 {n} 个样本，每个个体被抽中的概率相等。
                                    </CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-6 pt-4">
                                    <div className="p-4 bg-background/30 rounded-xl border border-border/50">
                                        <Label htmlFor="simpleSeed" className="text-foreground/90 text-xs">随机种子（可选）</Label>
                                        <Input
                                            id="simpleSeed"
                                            type="number"
                                            value={simpleSeed}
                                            onChange={(e) => setSimpleSeed(e.target.value)}
                                            placeholder="留空则每次随机"
                                            data-testid="student-sampling-simple-seed"
                                            className="mt-2 bg-card border-input text-foreground focus:border-ring"
                                        />
                                        <p className="text-xs text-muted-foreground mt-2">设置后可复现同一组软件抽样结果，但这只是复现实验，不足以证明实际调查的随机化质量。</p>
                                    </div>
                                    {!simpleResult?.completed ? (
                                        <div className="bg-background/50 rounded-xl p-8 text-center border border-border border-dashed">
                                            <div className="mb-4 text-muted-foreground">尚未执行抽样</div>
                                            <Button onClick={() => void executeSimple()} disabled={executing !== null} data-testid="student-sampling-simple-run" className="bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/20">
                                                {executing === "simple" ? (
                                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                                ) : (
                                                    <Play className="w-4 h-4 mr-2" />
                                                )}
                                                开始随机抽样
                                            </Button>
                                        </div>
                                    ) : (
                                        <SamplingSuccessState
                                            summary={`共成功抽取 ${simpleResult.sampleCount} 个样本${executionTimes.simple !== null ? `，耗时 ${executionTimes.simple} ms` : ""}${simpleResult.seed ? `，Seed ${simpleResult.seed}` : ""}`}
                                            onRerun={() => void executeSimple()}
                                            disabled={executing !== null}
                                            rerunTestId="student-sampling-simple-rerun"
                                            rerunLabel="重新执行简单随机抽样"
                                        />
                                    )}
                                </CardContent>
                            </Card>
                        </div>
                        <div className="space-y-4">
                            <Card className="rounded-2xl border-border bg-card/50 shadow-sm h-full">
                                <CardHeader>
                                    <div className="flex items-center justify-between">
                                        <CardTitle className="text-base text-foreground">抽样预览</CardTitle>
                                        <Badge variant="outline" className="border-input text-muted-foreground">分页预览</Badge>
                                    </div>
                                    <CardDescription className="text-muted-foreground">展示部分抽样结果数据</CardDescription>
                                </CardHeader>
                                <CardContent className="h-[300px] overflow-hidden">
                                    {!simpleResult?.completed ? (
                                        <div className="h-full flex items-center justify-center text-sm text-muted-foreground italic">
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
                    <div className="grid grid-cols-3 gap-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                        <div className="col-span-2 space-y-4">
                            <Card className="rounded-2xl border-border bg-card/50 shadow-sm">
                                <CardHeader>
                                    <CardTitle className="text-foreground flex items-center gap-2">
                                        <div className="w-2 h-6 bg-info rounded-full mr-2"></div>
                                        系统抽样
                                    </CardTitle>
                                    <CardDescription className="text-muted-foreground pt-1">
                                        使用分数间隔 K=N/n 和随机起点，按当前抽样框顺序抽取并确保样本量等于规划值 {n}。抽样框排序可能影响效率；若周期结构与 K 同步，结果可能失真。
                                    </CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-6 pt-4">
                                    <div className="grid grid-cols-3 gap-6 p-4 bg-background/30 rounded-xl border border-border/50">
                                        <div className="space-y-3">
                                            <p className="text-sm font-medium text-foreground/90">抽样间隔 K=N/n</p>
                                            <div
                                                className="flex h-10 items-center rounded-md border border-input bg-card px-3 font-mono font-semibold text-foreground"
                                                data-testid="student-sampling-systematic-k"
                                            >
                                                {formatSystematicInterval(systematicInterval)}
                                            </div>
                                            <p className="text-xs text-muted-foreground">内部使用完整精度，界面最多显示 4 位小数。</p>
                                        </div>
                                        <div className="space-y-3">
                                            <p className="text-sm font-medium text-foreground/90">精确抽取数量</p>
                                            <div className="flex h-10 items-center justify-between rounded-md border border-input bg-card px-3">
                                                <span className="font-mono font-bold text-foreground">{n}</span>
                                                <span className="text-xs text-success">与规划值一致</span>
                                            </div>
                                            <p className="text-xs text-muted-foreground">随机起点保证随机化，但不能自动消除抽样框中的排序或周期性风险。</p>
                                        </div>
                                        <div className="space-y-3">
                                            <Label htmlFor="systematicSeed" className="text-foreground/90">随机种子（可选）</Label>
                                            <Input
                                                id="systematicSeed"
                                                type="number"
                                                value={systematicSeed}
                                                onChange={(e) => setSystematicSeed(e.target.value)}
                                                placeholder="留空则每次随机"
                                                data-testid="student-sampling-systematic-seed"
                                                className="bg-card border-input text-foreground focus:border-info"
                                            />
                                            <p className="text-xs text-muted-foreground">
                                                设置后可复现软件结果，但不能据此证明实际调查的随机化质量。
                                            </p>
                                        </div>
                                    </div>

                                    {!systematicCompletedForCurrentPlan ? (
                                        <div className="space-y-3">
                                            {systematicResult?.completed && (
                                                <p className="rounded-lg border border-warning/20 bg-warning/10 px-3 py-2 text-sm text-warning">
                                                    已保存的旧系统抽样结果为 {systematicResult.sampleCount} 个样本，与当前规划值 {n} 不一致，请重新执行。
                                                </p>
                                            )}
                                            <div className="flex justify-end">
                                            <Button onClick={() => void executeSystematic()} disabled={executing !== null || systematicInterval === null} data-testid="student-sampling-systematic-run" className="bg-info hover:bg-info/90 text-info-foreground shadow-lg shadow-info/20 w-auto px-8">
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
                        <div className="space-y-4">
                            <Card className="rounded-2xl border-border bg-card/50 shadow-sm h-full">
                                <CardHeader>
                                    <div className="flex items-center justify-between">
                                        <CardTitle className="text-base text-foreground">抽样预览</CardTitle>
                                        <Badge variant="outline" className="border-input text-muted-foreground">分页预览</Badge>
                                    </div>
                                    <CardDescription className="text-muted-foreground">展示部分抽样结果数据</CardDescription>
                                </CardHeader>
                                <CardContent className="h-[300px] overflow-hidden">
                                    {!systematicCompletedForCurrentPlan ? (
                                        <div className="h-full flex items-center justify-center text-sm text-muted-foreground italic">
                                            完成抽样后展示
                                        </div>
                                    ) : (
                                        <SamplePreviewTable data={systematicResult?.data ?? []} total={systematicResult?.sampleCount ?? 0} />
                                    )}
                                </CardContent>
                            </Card>
                        </div>
                    </div>
                </TabsContent>

                {/* PPS Sampling */}
                <TabsContent value="pps" className="mt-0 focus-visible:outline-none">
                    <div className="grid grid-cols-3 gap-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                        <div className="col-span-2 space-y-4">
                            <Card className="rounded-2xl border-border bg-card/50 shadow-sm">
                                <CardHeader>
                                    <CardTitle className="text-foreground flex items-center gap-2">
                                        <div className="w-2 h-6 bg-auxiliary rounded-full mr-2"></div>
                                        PPS抽样（概率与规模成比例抽样）
                                    </CardTitle>
                                    <CardDescription className="text-muted-foreground pt-1">
                                        不放回 πps：一阶包含概率与规模成正比（πᵢ = n xᵢ / X，过大则必然入样）。分析阶段用 Hájek 加权均值，不是 Horvitz–Thompson 均值。规模变量应在抽样前对总体单位可获得；它与目标变量相关时 PPS 才更可能提高效率，相关性弱时未必优于等概率设计。抽取数量允许在规划目标的 80%–120% 调整，这是本实验的操作规则，不是 PPS 理论要求。
                                    </CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-6 pt-4">
                                    <div className="grid grid-cols-3 gap-6 p-4 bg-background/30 rounded-xl border border-border/50">
                                        <div className="space-y-3">
                                            <Label className="text-foreground/90">选择规模变量</Label>
                                            {!statsLoaded ? (
                                                <div className="flex h-10 items-center rounded-md border border-info/30 bg-info/10 px-3 text-sm text-info" data-testid="student-sampling-pps-fields-pending">
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
                                                <div className="flex h-10 items-center rounded-md border border-destructive/70 bg-destructive/10 px-3 text-sm text-destructive" data-testid="student-sampling-pps-unavailable">
                                                    {PPS_UNAVAILABLE_STATUS_MESSAGE}
                                                </div>
                                            )}
                                            <p className={`text-xs leading-relaxed ${statsLoaded && !hasPpsNumericField ? "text-destructive" : "text-muted-foreground"}`}>
                                                {!statsLoaded
                                                    ? "只有统计信息成功加载后，系统才会确认 PPS 是否可用。"
                                                    : hasPpsNumericField
                                                        ? "选择一个抽样前已知的规模变量（如收入、人口等）；本实验执行还要求该字段对总体每个单位均为正数。"
                                                        : PPS_UNAVAILABLE_REASON}
                                            </p>
                                        </div>
                                        <div className="space-y-3">
                                            <Label htmlFor="ppsSampleSize" className="text-foreground/90">抽样数量</Label>
                                            <Input
                                                id="ppsSampleSize"
                                                type="number"
                                                value={ppsSampleSize}
                                                onChange={(e) => setPpsSampleSize(Math.max(1, Number.parseInt(e.target.value, 10) || 0))}
                                                min={ppsMinSize}
                                                max={ppsMaxSize}
                                                aria-invalid={!isPpsSizeValid}
                                                aria-describedby="pps-sample-size-hint"
                                                data-testid="student-sampling-pps-sample-size"
                                                className={`bg-card border-input text-foreground focus:border-auxiliary ${!isPpsSizeValid ? "border-destructive" : ""}`}
                                            />
                                            <p id="pps-sample-size-hint" className={`text-xs leading-relaxed ${isPpsSizeValid ? "text-muted-foreground" : "text-destructive"}`}>
                                                有效范围: {ppsMinSize}-{ppsMaxSize}（本实验按目标值 {n} 的 80%-120%，且无放回抽样不能超过总体 N={N}）
                                                {!isPpsSizeValid && `；请输入 ${ppsMinSize}-${ppsMaxSize} 之间的整数`}
                                            </p>
                                        </div>
                                        <div className="space-y-3">
                                            <Label htmlFor="ppsSeed" className="text-foreground/90">随机种子（可选）</Label>
                                            <Input
                                                id="ppsSeed"
                                                type="number"
                                                value={ppsSeed}
                                                onChange={(e) => setPpsSeed(e.target.value)}
                                                placeholder="留空则每次随机"
                                                data-testid="student-sampling-pps-seed"
                                                className="bg-card border-input text-foreground focus:border-auxiliary"
                                            />
                                            <p className="text-xs leading-relaxed text-muted-foreground">
                                                设置后可复现同一组软件 PPS 结果，但不能据此证明实际调查的随机化质量。
                                            </p>
                                        </div>
                                    </div>

                                    {!ppsResult?.completed ? (
                                        <div className="flex justify-end">
                                            <Button onClick={() => void executePPS()} disabled={executing !== null || !hasPpsNumericField || !ppsSizeField || !isPpsSizeValid} data-testid="student-sampling-pps-run" className="bg-auxiliary hover:bg-auxiliary/90 text-auxiliary-foreground shadow-lg shadow-auxiliary/20 w-auto px-8">
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
                                </CardContent>
                            </Card>
                        </div>
                        <div className="space-y-4">
                            <Card className="rounded-2xl border-border bg-card/50 shadow-sm h-full">
                                <CardHeader>
                                    <div className="flex items-center justify-between">
                                        <CardTitle className="text-base text-foreground">抽样预览</CardTitle>
                                        <Badge variant="outline" className="border-input text-muted-foreground">分页预览</Badge>
                                    </div>
                                    <CardDescription className="text-muted-foreground">展示部分抽样结果数据</CardDescription>
                                </CardHeader>
                                <CardContent className="h-[300px] overflow-hidden">
                                    {!ppsResult?.completed ? (
                                        <div className="h-full flex items-center justify-center text-sm text-muted-foreground italic">
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
                            setAnimationSampledData({ data: dataArr, total: getSamplingResultCount("stratified", result) });
                        }}
                        onAnimate={(animLayers, animStratifyBy, opener) => {
                            animationOpenerRef.current = opener;
                            setStratifiedAnimationLayers(animLayers);
                            setStratifiedAnimationStratifyBy(animStratifyBy);
                            setAnimatingMethod("stratified");
                        }}
                        buildSavePayload={() => undefined}
                        executionTime={executionTimes.stratified}
                        setExecutionTime={(ms) => setExecutionTimes(prev => ({ ...prev, stratified: ms }))}
                    />
                </TabsContent>
            </Tabs>

            {/* Navigation */}
            <div className="flex gap-3 pt-6 border-t border-border/50 flex-row items-center justify-between">
                <Button variant="outline" onClick={onPrev} data-testid="student-sampling-prev" className="border-input bg-muted text-foreground/90 hover:bg-muted hover:text-foreground w-auto">
                    上一阶段
                </Button>
                <Button onClick={() => setConfirmNextOpen(true)} disabled={!allCompleted} data-testid="student-sampling-next" className={`min-w-0 whitespace-normal w-auto ${allCompleted ? "bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/20" : "bg-muted text-muted-foreground"}`}>
                    {allCompleted ? "完成本阶段" : `本实验要求完成四种抽样方法 (${completedMethodCount}/4)`}
                    <ArrowRight className="w-4 h-4 ml-2 shrink-0" />
                </Button>
            </div>

            {/* Confirm Next Stage Dialog */}
            <AlertDialog open={confirmNextOpen} onOpenChange={setConfirmNextOpen}>
                <AlertDialogContent className="bg-card border-border text-foreground" data-testid="student-sampling-confirm-dialog">
                    <AlertDialogHeader>
                        <AlertDialogTitle className="text-foreground">确认完成抽样执行</AlertDialogTitle>
                        <AlertDialogDescription asChild>
                            <div className="text-sm text-muted-foreground">
                                您已完成本实验要求的四种抽样方法：
                                <div className="bg-background p-4 rounded-xl border border-border mt-3 mb-3 space-y-2">
                                    <div className="flex justify-between"><span>简单随机抽样:</span> <span className="text-foreground">{simpleResult?.sampleCount} 样本</span></div>
                                    <div className="flex justify-between"><span>系统抽样:</span> <span className="text-foreground">{systematicResult?.sampleCount} 样本 (K={formatSystematicInterval(resultSystematicInterval)})</span></div>
                                    <div className="flex justify-between">
                                        <span>PPS抽样:</span>
                                        <span className="text-foreground">
                                            {ppsResult?.unavailable
                                                ? PPS_UNAVAILABLE_STATUS_MESSAGE
                                                : `${ppsResult?.sampleCount} 样本`}
                                        </span>
                                    </div>
                                    <div className="flex justify-between"><span>分层抽样:</span> <span className="text-foreground">{getSamplingResultCount("stratified", stratifiedResult)} 样本</span></div>
                                </div>
                                <p>确认后将进入分析与报告阶段。</p>
                            </div>
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel className="bg-background border-border text-foreground/90 hover:bg-muted hover:text-foreground">取消</AlertDialogCancel>
                        <AlertDialogAction onClick={handleConfirmNext} data-testid="student-sampling-confirm" className="bg-primary hover:bg-primary/90 text-primary-foreground">确认</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

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
                    restoreFocusTo={animationOpenerRef.current}
                    sampledData={animationSampledData?.data}
                    sampledTotal={animationSampledData?.total}
                />
            )}
        </div>
    );
}

export default SamplingExecution;
