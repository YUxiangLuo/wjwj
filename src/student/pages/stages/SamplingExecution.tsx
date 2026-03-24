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
import { CheckCircle2, Play, RefreshCw, Loader2, Target, Layers, ArrowRight, Database } from "lucide-react";
import { useExperiment } from "../ExperimentLayout";
import { experimentApi, type SamplingResultsData, type SamplePlanData } from "../../api-client";
import { ImmersiveSamplingAnimation } from "../../components/ImmersiveSamplingAnimation";
import { ImmersiveExperimentLaunch } from "../../components/ImmersiveExperimentLaunch";
import { StratifiedSamplingTab, type StratifiedSamplingTabRef } from "../../components/stratified-sampling";
import { FIELD_LABELS, parseSeed } from "../../components/sampling-shared";
import { SamplePreviewTable } from "../../components/SamplePreviewTable";
import {
    formatSystematicRange,
    getSystematicAcceptedRange,
    getSystematicSampleCountRange,
    isSystematicRangeWithinAcceptedRange,
} from "../../experiment/systematic-sampling";

interface SamplingExecutionProps {
    onPrev: () => void;
}

import type { MethodKey as SamplingMethod } from "../../api-client";

interface SamplingSuccessStateProps {
    summary: string;
    onRerun: () => void;
    disabled: boolean;
    rerunTestId: string;
}

function SamplingSuccessState({ summary, onRerun, disabled, rerunTestId }: SamplingSuccessStateProps) {
    return (
        <div className="space-y-4">
            <div className="flex items-center gap-4 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-5">
                <div className="rounded-full bg-emerald-500/20 p-3">
                    <CheckCircle2 className="w-6 h-6 text-emerald-600" />
                </div>
                <div>
                    <p className="text-lg font-medium text-emerald-600">抽样完成</p>
                    <p className="mt-1 text-sm text-emerald-800/70 dark:text-emerald-200/70">{summary}</p>
                </div>
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={onRerun}
                    disabled={disabled}
                    data-testid={rerunTestId}
                    className="ml-auto rounded-full text-emerald-700 hover:bg-emerald-500/10 hover:text-emerald-800 dark:text-emerald-300 dark:hover:bg-emerald-500/15 dark:hover:text-emerald-200"
                >
                    <RefreshCw className="w-4 h-4" />
                </Button>
            </div>
        </div>
    );
}

export function SamplingExecution({ onPrev }: SamplingExecutionProps) {
    const { populationSize, experiment, registerStageSave, saveExperiment } = useExperiment();

    // Get sample size from sample plan
    const samplePlan = experiment?.samplePlan as SamplePlanData | null;
    const n = samplePlan?.finalSampleSize ?? 384;
    const N = populationSize;

    // Initialize from saved data
    const initialResults = experiment?.samplingResults as SamplingResultsData | null;

    const [simpleResult, setSimpleResult] = useState(initialResults?.simple ?? null);
    const [systematicResult, setSystematicResult] = useState(initialResults?.systematic ?? null);
    const [ppsResult, setPpsResult] = useState(initialResults?.pps ?? null);
    const [stratifiedResult, setStratifiedResult] = useState(initialResults?.stratified ?? null);

    const [kValue, setKValue] = useState(initialResults?.systematic?.kValue ?? Math.round(N / n));
    const [ppsSizeField, setPpsSizeField] = useState(initialResults?.pps?.sizeField ?? "");
    const [ppsSampleSize, setPpsSampleSize] = useState(initialResults?.pps?.sampleCount ?? n);
    const [simpleSeed, setSimpleSeed] = useState(initialResults?.simple?.seed ? String(initialResults.simple.seed) : "");
    const [systematicSeed, setSystematicSeed] = useState(initialResults?.systematic?.seed ? String(initialResults.systematic.seed) : "");
    const [ppsSeed, setPpsSeed] = useState(initialResults?.pps?.seed ? String(initialResults.pps.seed) : "");
    const [executionTimes, setExecutionTimes] = useState<Record<SamplingMethod, number | null>>({ simple: null, systematic: null, pps: null, stratified: null });
    // Stats state
    const [populationStats, setPopulationStats] = useState<Record<string, Record<string, number>>>({});
    const [numericFields, setNumericFields] = useState<string[]>([]);
    const [stratumNumericStats, setStratumNumericStats] = useState<Record<string, Record<string, Record<string, { mean: number; stdDev: number }>>>>({});

    const stratifiedTabRef = useRef<StratifiedSamplingTabRef>(null);
    const [stratifiedAnimData, setStratifiedAnimData] = useState<{
        stratifyBy: string;
        layers: Array<{ name: string; count: number; ratio: number; sampleCount: number }>;
    } | null>(null);

    /** 从经典样本量规划「确认并进入下一阶段」进入时播放一次（sessionStorage 由 SamplePlanning 设置） */
    const [showSamplingStageIntro, setShowSamplingStageIntro] = useState(false);
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
        if (experiment?.taskId) {
            experimentApi.getStats(experiment.taskId).then(res => {
                if (res.success && res.data?.stats) {
                    setPopulationStats(res.data.stats);
                    if (res.data.stratumNumericStats) setStratumNumericStats(res.data.stratumNumericStats);
                }
                if (res.success && res.data?.numericFields) {
                    setNumericFields(res.data.numericFields);
                    if (!ppsSizeField && res.data.numericFields.length > 0) {
                        setPpsSizeField(res.data.numericFields[0] ?? "");
                    }
                }
            }).catch((e) => {
                console.error("Failed to load population stats:", e);
            });
        }
    }, [experiment?.taskId]);

    const [executing, setExecuting] = useState<SamplingMethod | null>(null);
    const [confirmNextOpen, setConfirmNextOpen] = useState(false);
    const [animatingMethod, setAnimatingMethod] = useState<SamplingMethod | null>(null);
    const [animationSampledData, setAnimationSampledData] = useState<{ data: Array<Record<string, unknown>>; total: number } | null>(null);

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
        const payload = buildSamplingResultsPayload();
        if (Object.keys(payload).length === 0) {
            return true;
        }
        return saveExperiment({ samplingResults: payload });
    }, [buildSamplingResultsPayload, saveExperiment]);

    useEffect(() => {
        registerStageSave(saveResults);
        return () => {
            registerStageSave(null);
        };
    }, [registerStageSave, saveResults]);


    const taskId = experiment?.taskId;

    // Execute sampling with real API
    const executeSimple = async () => {
        if (!taskId) return;
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
        if (!taskId || kValue < 1) return;
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
        if (!taskId) return;
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

    const allCompleted = simpleResult?.completed && systematicResult?.completed && ppsResult?.completed && stratifiedResult?.completed;

    const handleConfirmNext = async () => {
        const saved = await saveResults();
        if (!saved) return;

        await saveExperiment({ currentStage: 4 });
    };

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300" data-testid="student-stage-sampling">
            {showSamplingStageIntro && samplePlan && (
                <ImmersiveExperimentLaunch
                    populationSize={N}
                    sampleSize={n}
                    confidenceLevel={String(samplePlan.confidenceLevel ?? "95")}
                    marginOfError={samplePlan.marginOfError ?? 5}
                    onComplete={() => setShowSamplingStageIntro(false)}
                    onClose={() => setShowSamplingStageIntro(false)}
                />
            )}
            <Card className="rounded-2xl border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 shadow-sm">
                <CardContent className="py-6 px-6">
                    <div className="flex flex-wrap items-center justify-between gap-6">
                        <div className="flex items-center gap-3">
                            <div className="bg-slate-200 dark:bg-slate-800 p-2.5 rounded-xl border border-slate-300 dark:border-slate-700">
                                <Target className="w-5 h-5 text-indigo-500" />
                            </div>
                            <div>
                                <div className="text-sm font-medium text-slate-600 dark:text-slate-400">规划样本量</div>
                                <div className="text-xl font-bold text-slate-900 dark:text-slate-100">{n}</div>
                            </div>
                        </div>
                        <div className="w-px h-10 bg-slate-200 dark:bg-slate-800 hidden sm:block"></div>
                        <div className="flex items-center gap-3">
                            <div className="bg-slate-200 dark:bg-slate-800 p-2.5 rounded-xl border border-slate-300 dark:border-slate-700">
                                <Database className="w-5 h-5 text-teal-600 dark:text-teal-400" />
                            </div>
                            <div>
                                <div className="text-sm font-medium text-slate-600 dark:text-slate-400">总体规模</div>
                                <div className="text-xl font-bold text-slate-900 dark:text-slate-100">{N.toLocaleString()}</div>
                            </div>
                        </div>
                        <div className="w-px h-10 bg-slate-200 dark:bg-slate-800 hidden sm:block"></div>
                        <div className="flex items-center gap-3">
                            <div className="bg-slate-200 dark:bg-slate-800 p-2.5 rounded-xl border border-slate-300 dark:border-slate-700">
                                <Layers className="w-5 h-5 text-amber-600" />
                            </div>
                            <div>
                                <div className="text-sm font-medium text-slate-600 dark:text-slate-400">完成进度</div>
                                <div className="flex items-center gap-2">
                                    <span className="text-xl font-bold text-slate-900 dark:text-slate-100">
                                        {[simpleResult?.completed, systematicResult?.completed, ppsResult?.completed, stratifiedResult?.completed].filter(Boolean).length}/4
                                    </span>
                                    <span className="text-sm text-slate-500">种方法</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Sampling methods tabs */}
            <Tabs defaultValue="simple" className="space-y-6">
                <TabsList className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-1 rounded-xl w-full flex h-auto" data-testid="student-sampling-tabs">
                    <TabsTrigger value="simple" data-testid="student-sampling-tab-simple" className="flex-1 rounded-lg py-2.5 data-[state=active]:bg-slate-200 dark:data-[state=active]:bg-slate-800 data-[state=active]:text-slate-950 dark:data-[state=active]:text-slate-50 text-slate-600 dark:text-slate-400">
                        <div className="flex items-center gap-2">
                            <span>简单随机抽样</span>
                            {simpleResult?.completed && <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
                        </div>
                    </TabsTrigger>
                    <TabsTrigger value="systematic" data-testid="student-sampling-tab-systematic" className="flex-1 rounded-lg py-2.5 data-[state=active]:bg-slate-200 dark:data-[state=active]:bg-slate-800 data-[state=active]:text-slate-950 dark:data-[state=active]:text-slate-50 text-slate-600 dark:text-slate-400">
                        <div className="flex items-center gap-2">
                            <span>系统抽样</span>
                            {systematicResult?.completed && <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
                        </div>
                    </TabsTrigger>
                    <TabsTrigger value="pps" data-testid="student-sampling-tab-pps" className="flex-1 rounded-lg py-2.5 data-[state=active]:bg-slate-200 dark:data-[state=active]:bg-slate-800 data-[state=active]:text-slate-950 dark:data-[state=active]:text-slate-50 text-slate-600 dark:text-slate-400">
                        <div className="flex items-center gap-2">
                            <span>PPS抽样</span>
                            {ppsResult?.completed && <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
                        </div>
                    </TabsTrigger>
                    <TabsTrigger value="stratified" data-testid="student-sampling-tab-stratified" className="flex-1 rounded-lg py-2.5 data-[state=active]:bg-slate-200 dark:data-[state=active]:bg-slate-800 data-[state=active]:text-slate-950 dark:data-[state=active]:text-slate-50 text-slate-600 dark:text-slate-400">
                        <div className="flex items-center gap-2">
                            <span>分层抽样</span>
                            {stratifiedResult?.completed && <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
                        </div>
                    </TabsTrigger>
                </TabsList>

                {/* Simple Random Sampling */}
                <TabsContent value="simple" className="mt-0 focus-visible:outline-none">
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                        <div className="lg:col-span-2 space-y-4">
                            <Card className="rounded-2xl border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 shadow-sm">
                                <CardHeader>
                                    <CardTitle className="text-slate-900 dark:text-slate-100 flex items-center gap-2">
                                        <div className="w-2 h-6 bg-indigo-500 rounded-full mr-2"></div>
                                        简单随机抽样
                                    </CardTitle>
                                    <CardDescription className="text-slate-600 dark:text-slate-400 pt-1">
                                        从 {N.toLocaleString()} 个总体中随机抽取 {n} 个样本，每个个体被抽中的概率相等。
                                    </CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-6 pt-4">
                                    <div className="p-4 bg-white/30 dark:bg-slate-950/30 rounded-xl border border-slate-200/50 dark:border-slate-800/50">
                                        <Label htmlFor="simpleSeed" className="text-slate-700 dark:text-slate-300 text-xs">随机种子（可选）</Label>
                                        <Input
                                            id="simpleSeed"
                                            type="number"
                                            value={simpleSeed}
                                            onChange={(e) => setSimpleSeed(e.target.value)}
                                            placeholder="留空则每次随机"
                                            data-testid="student-sampling-simple-seed"
                                            className="mt-2 bg-slate-50 dark:bg-slate-900 border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200 focus:border-indigo-500"
                                        />
                                        <p className="text-xs text-slate-500 mt-2">设置后可复现同一组抽样结果。</p>
                                    </div>
                                    {!simpleResult?.completed ? (
                                        <div className="bg-white/50 dark:bg-slate-950/50 rounded-xl p-8 text-center border border-slate-200 dark:border-slate-800 border-dashed">
                                            <div className="mb-4 text-slate-600 dark:text-slate-400">尚未执行抽样</div>
                                            <Button onClick={() => setAnimatingMethod("simple")} disabled={executing !== null} data-testid="student-sampling-simple-run" className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg shadow-indigo-500/20">
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
                                            onRerun={() => setAnimatingMethod("simple")}
                                            disabled={executing !== null}
                                            rerunTestId="student-sampling-simple-rerun"
                                        />
                                    )}
                                </CardContent>
                            </Card>
                        </div>
                        <div className="space-y-4">
                            <Card className="rounded-2xl border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 shadow-sm h-full">
                                <CardHeader>
                                    <div className="flex items-center justify-between">
                                        <CardTitle className="text-base text-slate-800 dark:text-slate-200">抽样预览</CardTitle>
                                        <Badge variant="outline" className="border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-400">分页预览</Badge>
                                    </div>
                                    <CardDescription className="text-slate-600 dark:text-slate-400">展示部分抽样结果数据</CardDescription>
                                </CardHeader>
                                <CardContent className="h-[300px] overflow-hidden">
                                    {!simpleResult?.completed ? (
                                        <div className="h-full flex items-center justify-center text-sm text-slate-500 italic">
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
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                        <div className="lg:col-span-2 space-y-4">
                            <Card className="rounded-2xl border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 shadow-sm">
                                <CardHeader>
                                    <CardTitle className="text-slate-900 dark:text-slate-100 flex items-center gap-2">
                                        <div className="w-2 h-6 bg-teal-500 rounded-full mr-2"></div>
                                        系统抽样
                                    </CardTitle>
                                    <CardDescription className="text-slate-600 dark:text-slate-400 pt-1">
                                        按固定间隔 K 从总体中抽取样本。规划样本量为 {n}，实际样本量会随 K 值和随机起点在小范围内波动。
                                    </CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-6 pt-4">
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 p-4 bg-white/30 dark:bg-slate-950/30 rounded-xl border border-slate-200/50 dark:border-slate-800/50">
                                        <div className="space-y-3">
                                            <Label htmlFor="kValue" className="text-slate-700 dark:text-slate-300">间隔 K 值 (步长)</Label>
                                            <div className="relative">
                                                <Input
                                                    id="kValue"
                                                    type="number"
                                                    value={kValue}
                                                    onChange={(e) => setKValue(parseInt(e.target.value) || 1)}
                                                    min={1}
                                                    max={N}
                                                    data-testid="student-sampling-systematic-k"
                                                    className="bg-slate-50 dark:bg-slate-900 border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200 focus:border-teal-500 pr-10"
                                                />
                                                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 text-xs">Steps</span>
                                            </div>
                                        </div>
                                        <div className="space-y-3">
                                            <Label className="text-slate-700 dark:text-slate-300">预计抽取数量</Label>
                                            <div className={`p-2.5 border rounded-md flex items-center justify-between ${isKValid ? "border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900" : "border-rose-500/50 bg-rose-500/10"}`}>
                                                <span className={`font-mono font-bold ${isKValid ? "text-slate-800 dark:text-slate-200" : "text-rose-600"}`}>{formatSystematicRange(systematicSampleCountRange)}</span>
                                                <span className="text-xs text-slate-500">允许范围: {formatSystematicRange(systematicAcceptedRange)}</span>
                                            </div>
                                            {systematicSampleCountRange.min !== systematicSampleCountRange.max && (
                                                <p className="text-xs text-slate-500 mt-1">
                                                    随机起点不同，实际抽取数量会在 {formatSystematicRange(systematicSampleCountRange)} 之间波动。
                                                </p>
                                            )}
                                            {!isKValid && (
                                                <p className="text-xs text-rose-600 mt-1">
                                                    当前 K 值的实际样本量可能超出允许范围，请调整 K 值
                                                </p>
                                            )}
                                        </div>
                                        <div className="space-y-3">
                                            <Label htmlFor="systematicSeed" className="text-slate-700 dark:text-slate-300">随机种子（可选）</Label>
                                            <Input
                                                id="systematicSeed"
                                                type="number"
                                                value={systematicSeed}
                                                onChange={(e) => setSystematicSeed(e.target.value)}
                                                placeholder="留空则每次随机"
                                                data-testid="student-sampling-systematic-seed"
                                                className="bg-slate-50 dark:bg-slate-900 border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200 focus:border-teal-500"
                                            />
                                            <p className="text-xs text-slate-500">
                                                设置后可复现系统抽样结果。
                                            </p>
                                        </div>
                                    </div>

                                    {!systematicResult?.completed ? (
                                        <div className="flex justify-end">
                                            <Button onClick={() => setAnimatingMethod("systematic")} disabled={executing !== null || !isKValid} data-testid="student-sampling-systematic-run" className="bg-teal-600 hover:bg-teal-700 text-white shadow-lg shadow-teal-500/20 w-auto px-8">
                                                {executing === "systematic" ? (
                                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                                ) : (
                                                    <Play className="w-4 h-4 mr-2" />
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
                        <div className="space-y-4">
                            <Card className="rounded-2xl border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 shadow-sm h-full">
                                <CardHeader>
                                    <div className="flex items-center justify-between">
                                        <CardTitle className="text-base text-slate-800 dark:text-slate-200">抽样预览</CardTitle>
                                        <Badge variant="outline" className="border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-400">分页预览</Badge>
                                    </div>
                                    <CardDescription className="text-slate-600 dark:text-slate-400">展示部分抽样结果数据</CardDescription>
                                </CardHeader>
                                <CardContent className="h-[300px] overflow-hidden">
                                    {!systematicResult?.completed ? (
                                        <div className="h-full flex items-center justify-center text-sm text-slate-500 italic">
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
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                        <div className="lg:col-span-2 space-y-4">
                            <Card className="rounded-2xl border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 shadow-sm">
                                <CardHeader>
                                    <CardTitle className="text-slate-900 dark:text-slate-100 flex items-center gap-2">
                                        <div className="w-2 h-6 bg-purple-500 rounded-full mr-2"></div>
                                        PPS抽样（概率与规模成比例抽样）
                                    </CardTitle>
                                    <CardDescription className="text-slate-600 dark:text-slate-400 pt-1">
                                        每个单位被抽中的概率与其"规模"指标成正比。选择一个数值型变量作为规模度量，并指定抽样数量（允许在目标样本量的 80%-120% 范围内调整）。
                                    </CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-6 pt-4">
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 p-4 bg-white/30 dark:bg-slate-950/30 rounded-xl border border-slate-200/50 dark:border-slate-800/50">
                                        <div className="space-y-3">
                                            <Label className="text-slate-700 dark:text-slate-300">选择规模变量</Label>
                                            <Select value={ppsSizeField} onValueChange={setPpsSizeField}>
                                                <SelectTrigger data-testid="student-sampling-pps-size-field" className="w-full bg-slate-50 dark:bg-slate-900 border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200">
                                                    <SelectValue placeholder="选择数值变量" />
                                                </SelectTrigger>
                                                <SelectContent className="bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200">
                                                    {numericFields.length > 0 ? (
                                                        numericFields.map(key => (
                                                            <SelectItem key={key} value={key}>
                                                                {FIELD_LABELS[key] || key}
                                                            </SelectItem>
                                                        ))
                                                    ) : (
                                                        Object.keys(populationStats).length > 0 ? (
                                                            Object.keys(populationStats).map(key => (
                                                                <SelectItem key={key} value={key}>
                                                                    {FIELD_LABELS[key] || key}
                                                                </SelectItem>
                                                            ))
                                                        ) : (
                                                            <SelectItem value="income">收入水平</SelectItem>
                                                        )
                                                    )}
                                                </SelectContent>
                                            </Select>
                                            <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                                                选择一个数值变量（如收入、人口等），取值越大的单位被抽中概率越高。
                                            </p>
                                        </div>
                                        <div className="space-y-3">
                                            <Label htmlFor="ppsSampleSize" className="text-slate-700 dark:text-slate-300">抽样数量</Label>
                                            <Input
                                                id="ppsSampleSize"
                                                type="number"
                                                value={ppsSampleSize}
                                                onChange={(e) => setPpsSampleSize(Math.max(1, Number.parseInt(e.target.value, 10) || 0))}
                                                min={ppsMinSize}
                                                max={ppsMaxSize}
                                                data-testid="student-sampling-pps-sample-size"
                                                className={`bg-slate-50 dark:bg-slate-900 border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200 focus:border-purple-500 ${!isPpsSizeValid ? "border-rose-400 dark:border-rose-500" : ""}`}
                                            />
                                            <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                                                允许范围: {ppsMinSize}-{ppsMaxSize}（目标值 {n} 的 80%-120%）
                                            </p>
                                        </div>
                                        <div className="space-y-3">
                                            <Label htmlFor="ppsSeed" className="text-slate-700 dark:text-slate-300">随机种子（可选）</Label>
                                            <Input
                                                id="ppsSeed"
                                                type="number"
                                                value={ppsSeed}
                                                onChange={(e) => setPpsSeed(e.target.value)}
                                                placeholder="留空则每次随机"
                                                data-testid="student-sampling-pps-seed"
                                                className="bg-slate-50 dark:bg-slate-900 border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200 focus:border-purple-500"
                                            />
                                            <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                                                设置后可复现同一组PPS抽样结果。
                                            </p>
                                        </div>
                                    </div>

                                    {!ppsResult?.completed ? (
                                        <div className="flex justify-end">
                                            <Button onClick={() => setAnimatingMethod("pps")} disabled={executing !== null || !ppsSizeField || !isPpsSizeValid} data-testid="student-sampling-pps-run" className="bg-purple-600 hover:bg-purple-700 text-white shadow-lg shadow-purple-500/20 w-auto px-8">
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
                                            summary={`按 ${FIELD_LABELS[ppsResult.sizeField] || ppsResult.sizeField} 进行PPS抽样，共抽取 ${ppsResult.sampleCount} 个样本${executionTimes.pps !== null ? `，耗时 ${executionTimes.pps} ms` : ""}`}
                                            onRerun={() => setAnimatingMethod("pps")}
                                            disabled={executing !== null || !ppsSizeField || !isPpsSizeValid}
                                            rerunTestId="student-sampling-pps-rerun"
                                        />
                                    )}
                                </CardContent>
                            </Card>
                        </div>
                        <div className="space-y-4">
                            <Card className="rounded-2xl border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 shadow-sm h-full">
                                <CardHeader>
                                    <div className="flex items-center justify-between">
                                        <CardTitle className="text-base text-slate-800 dark:text-slate-200">抽样预览</CardTitle>
                                        <Badge variant="outline" className="border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-400">分页预览</Badge>
                                    </div>
                                    <CardDescription className="text-slate-600 dark:text-slate-400">展示部分抽样结果数据</CardDescription>
                                </CardHeader>
                                <CardContent className="h-[300px] overflow-hidden">
                                    {!ppsResult?.completed ? (
                                        <div className="h-full flex items-center justify-center text-sm text-slate-500 italic">
                                            完成抽样后展示
                                        </div>
                                    ) : (
                                        <SamplePreviewTable data={ppsResult.data ?? []} total={ppsResult.sampleCount} />
                                    )}
                                </CardContent>
                            </Card>
                        </div>
                    </div>
                </TabsContent>

                {/* Stratified Sampling */}
                <TabsContent value="stratified" className="mt-0 focus-visible:outline-none">
                    <StratifiedSamplingTab
                        ref={stratifiedTabRef}
                        n={n}
                        N={N}
                        taskId={taskId}
                        populationStats={populationStats}
                        numericFields={numericFields}
                        stratumNumericStats={stratumNumericStats}
                        initialResult={initialResults?.stratified ?? null}
                        stratifiedResult={stratifiedResult}
                        executing={executing}
                        executionTime={executionTimes.stratified}
                        onRequestAnimation={(data) => {
                            setStratifiedAnimData(data);
                            setAnimatingMethod("stratified");
                        }}
                        onExecuteComplete={(result, timeMs, sampledData) => {
                            setStratifiedResult(result);
                            setExecutionTimes(prev => ({ ...prev, stratified: timeMs }));
                            setAnimationSampledData(sampledData);
                            setExecuting(null);
                        }}
                        onExecuteFailed={() => {
                            setAnimatingMethod(null);
                            setExecuting(null);
                        }}
                        saveExperiment={saveExperiment}
                        buildSamplingResultsPayload={buildSamplingResultsPayload}
                    />
                </TabsContent>
            </Tabs>

            {/* Navigation */}
            <div className="flex justify-between pt-6 border-t border-slate-200/50 dark:border-slate-800/50">
                <Button variant="outline" onClick={onPrev} data-testid="student-sampling-prev" className="border-slate-300 dark:border-slate-700 bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-700 hover:text-slate-900 dark:hover:text-slate-100">
                    上一阶段
                </Button>
                <Button onClick={() => setConfirmNextOpen(true)} disabled={!allCompleted} data-testid="student-sampling-next" className={allCompleted ? "bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg shadow-indigo-500/20" : "bg-slate-200 dark:bg-slate-800 text-slate-500"}>
                    {allCompleted ? "完成本阶段" : `请完成所有抽样方法 (${[simpleResult?.completed, systematicResult?.completed, ppsResult?.completed, stratifiedResult?.completed].filter(Boolean).length}/4)`}
                    <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
            </div>

            {/* Confirm Next Stage Dialog */}
            <AlertDialog open={confirmNextOpen} onOpenChange={setConfirmNextOpen}>
                <AlertDialogContent className="bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200" data-testid="student-sampling-confirm-dialog">
                    <AlertDialogHeader>
                        <AlertDialogTitle className="text-slate-900 dark:text-slate-100">确认完成抽样执行</AlertDialogTitle>
                        <AlertDialogDescription asChild>
                            <div className="text-sm text-slate-600 dark:text-slate-400">
                                您已完成四种抽样方法的执行：
                                <div className="bg-white dark:bg-slate-950 p-4 rounded-xl border border-slate-200 dark:border-slate-800 mt-3 mb-3 space-y-2">
                                    <div className="flex justify-between"><span>简单随机抽样:</span> <span className="text-slate-800 dark:text-slate-200">{simpleResult?.sampleCount} 样本</span></div>
                                    <div className="flex justify-between"><span>系统抽样:</span> <span className="text-slate-800 dark:text-slate-200">{systematicResult?.sampleCount} 样本 (K={systematicResult?.kValue})</span></div>
                                    <div className="flex justify-between"><span>PPS抽样:</span> <span className="text-slate-800 dark:text-slate-200">{ppsResult?.sampleCount} 样本</span></div>
                                    <div className="flex justify-between"><span>分层抽样:</span> <span className="text-slate-800 dark:text-slate-200">{stratifiedResult?.layers?.reduce((a, l) => a + l.sampleCount, 0)} 样本</span></div>
                                </div>
                                <p>确认后将进入分析与报告阶段。</p>
                            </div>
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel className="bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100">取消</AlertDialogCancel>
                        <AlertDialogAction onClick={handleConfirmNext} data-testid="student-sampling-confirm" className="bg-indigo-600 hover:bg-indigo-700 text-white">确认</AlertDialogAction>
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
                    stratifyBy={animatingMethod === "stratified" ? stratifiedAnimData?.stratifyBy : undefined}
                    layers={animatingMethod === "stratified" ? stratifiedAnimData?.layers : undefined}
                    onAnimationComplete={() => {
                        if (animatingMethod === "simple") executeSimple();
                        else if (animatingMethod === "systematic") executeSystematic();
                        else if (animatingMethod === "pps") executePPS();
                        else if (animatingMethod === "stratified") {
                            setExecuting("stratified");
                            setAnimationSampledData(null);
                            stratifiedTabRef.current?.execute();
                        }
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
