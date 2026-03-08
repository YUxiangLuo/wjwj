import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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
import { CheckCircle2, Play, RefreshCw, Loader2, Users, Target, Layers, ArrowRight, BarChart3, Database } from "lucide-react";
import { useExperiment } from "../ExperimentLayout";
import { experimentApi, type SamplingResultsData, type SamplePlanData } from "../../api-client";
import { ImmersiveSamplingAnimation } from "../../components/ImmersiveSamplingAnimation";
import {
    formatSystematicRange,
    getSystematicAcceptedRange,
    getSystematicSampleCountRange,
    isSystematicRangeWithinAcceptedRange,
} from "../../experiment/systematic-sampling";

interface SamplingExecutionProps {
    onNext: () => void;
    onPrev: () => void;
}

type SamplingMethod = "simple" | "systematic" | "stratified";

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

export function SamplingExecution({ onNext, onPrev }: SamplingExecutionProps) {
    const { populationSize, experiment, saveExperiment } = useExperiment();

    // Get sample size from sample plan
    const samplePlan = experiment?.samplePlan as SamplePlanData | null;
    const n = samplePlan?.finalSampleSize ?? 384;
    const N = populationSize;

    // Initialize from saved data
    const initialResults = experiment?.samplingResults as SamplingResultsData | null;

    const [simpleResult, setSimpleResult] = useState(initialResults?.simple ?? null);
    const [systematicResult, setSystematicResult] = useState(initialResults?.systematic ?? null);
    const [stratifiedResult, setStratifiedResult] = useState(initialResults?.stratified ?? null);

    const [kValue, setKValue] = useState(initialResults?.systematic?.kValue ?? Math.round(N / n));
    const [stratifyBy, setStratifyBy] = useState(initialResults?.stratified?.stratifyBy ?? "gender");
    const [simpleSeed, setSimpleSeed] = useState(initialResults?.simple?.seed ? String(initialResults.simple.seed) : "");
    const [systematicSeed, setSystematicSeed] = useState(initialResults?.systematic?.seed ? String(initialResults.systematic.seed) : "");
    const [stratifiedSeed, setStratifiedSeed] = useState(initialResults?.stratified?.seed ? String(initialResults.stratified.seed) : "");
    const [executionTimes, setExecutionTimes] = useState<Record<SamplingMethod, number | null>>({ simple: null, systematic: null, stratified: null });
    // Stats state
    const [populationStats, setPopulationStats] = useState<Record<string, Record<string, number>>>({});
    const [layers, setLayers] = useState<Array<{ name: string; count: number; ratio: number }>>([]);
    const [layerSampleCounts, setLayerSampleCounts] = useState<number[]>([]);

    // Fetch stats on mount
    useEffect(() => {
        if (experiment?.taskId) {
            experimentApi.getStats(experiment.taskId).then(res => {
                if (res.success && res.data?.stats) {
                    setPopulationStats(res.data.stats);
                }
            }).catch((e) => {
                console.error("Failed to load population stats:", e);
            });
        }
    }, [experiment?.taskId]);

    // Update layers when stratifyBy changes or stats load
    useEffect(() => {
        const stats = populationStats[stratifyBy];

        if (!stats) {
            if (initialResults?.stratified?.stratifyBy === stratifyBy && initialResults.stratified.layers?.length) {
                const savedLayers = initialResults.stratified.layers.map((layer) => {
                    const ratio = Number.isFinite(layer.ratio)
                        ? layer.ratio
                        : layer.count > 0
                            ? parseFloat(((layer.count / N) * 100).toFixed(1))
                            : 0;
                    return {
                        name: layer.name,
                        count: layer.count,
                        ratio,
                        sampleCount: layer.sampleCount,
                    };
                });
                setLayers(savedLayers);
                setLayerSampleCounts(savedLayers.map((layer) => layer.sampleCount ?? 0));
                return;
            }
            setLayers([]);
            return;
        }

        const total = Object.values(stats).reduce((a, b) => a + b, 0);
        const newLayers = Object.entries(stats).map(([name, count]) => ({
            name,
            count,
            ratio: total > 0 ? parseFloat(((count / total) * 100).toFixed(1)) : 0,
        }));

        setLayers(newLayers);

        if (initialResults?.stratified?.stratifyBy === stratifyBy && initialResults.stratified.layers) {
            const savedMap = new Map(initialResults.stratified.layers.map((l) => [l.name, l.sampleCount]));
            setLayerSampleCounts(newLayers.map((l) => savedMap.get(l.name) ?? 0));
        } else {
            setLayerSampleCounts(newLayers.map((l) => Math.round(n * l.ratio / 100)));
        }
    }, [stratifyBy, populationStats, n, N, initialResults?.stratified]);

    const [executing, setExecuting] = useState<SamplingMethod | null>(null);
    const [confirmNextOpen, setConfirmNextOpen] = useState(false);
    const [animatingMethod, setAnimatingMethod] = useState<SamplingMethod | null>(null);

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
        if (stratifiedResult) payload.stratified = stratifiedResult;
        return next ? { ...payload, ...next } : payload;
    }, [simpleResult, systematicResult, stratifiedResult]);

    // Save results when they change
    const saveResults = useCallback(async () => {
        await saveExperiment({ samplingResults: buildSamplingResultsPayload() });
    }, [buildSamplingResultsPayload, saveExperiment]);


    // Execute sampling with real API
    const executeSimple = async () => {
        setExecuting("simple");
        setAnimatingMethod(null);
        const startTime = performance.now();
        try {
            const { seed, error: seedError } = parseSeed(simpleSeed);
            if (seedError) { toast.error(seedError); setExecuting(null); return; }
            const res = await experimentApi.executeSampling(experiment?.taskId!, "simple", {
                sampleSize: n,
                seed,
            });
            if (res.success && res.data?.result) {
                const nextSimple = res.data.result;
                setSimpleResult(nextSimple);
                setExecutionTimes(prev => ({ ...prev, simple: Math.round(performance.now() - startTime) }));
                await saveExperiment({ samplingResults: buildSamplingResultsPayload({ simple: nextSimple }) });
            } else {
                toast.error(res.message || "简单随机抽样执行失败");
            }
        } catch (e) {
            toast.error("简单随机抽样执行失败，请检查网络后重试");
        } finally {
            setExecuting(null);
        }
    };

    const executeSystematic = async () => {
        if (kValue < 1) return;
        setExecuting("systematic");
        setAnimatingMethod(null);
        const startTime = performance.now();
        try {
            const { seed, error: seedError } = parseSeed(systematicSeed);
            if (seedError) { toast.error(seedError); setExecuting(null); return; }
            const res = await experimentApi.executeSampling(experiment?.taskId!, "systematic", {
                kValue,
                sampleSize: Math.ceil(N / kValue),
                seed,
            });
            if (res.success && res.data?.result) {
                const nextSystematic = res.data.result;
                setSystematicResult(nextSystematic);
                setExecutionTimes(prev => ({ ...prev, systematic: Math.round(performance.now() - startTime) }));
                await saveExperiment({ samplingResults: buildSamplingResultsPayload({ systematic: nextSystematic }) });
            } else {
                toast.error(res.message || "系统抽样执行失败");
            }
        } catch (e) {
            toast.error("系统抽样执行失败，请检查网络后重试");
        } finally {
            setExecuting(null);
        }
    };

    const executeStratified = async () => {
        setExecuting("stratified");
        setAnimatingMethod(null);
        const startTime = performance.now();
        // Construct layers payload mapping current counts to layer names
        const layersPayload = layers.map((layer, i) => ({
            name: layer.name,
            count: layer.count,
            ratio: layer.ratio,
            sampleCount: layerSampleCounts[i] ?? 0,
        }));

        try {
            const { seed, error: seedError } = parseSeed(stratifiedSeed);
            if (seedError) { toast.error(seedError); setExecuting(null); return; }
            const res = await experimentApi.executeSampling(experiment?.taskId!, "stratified", {
                stratifyBy,
                layers: layersPayload,
                seed,
            });
            if (res.success && res.data?.result) {
                const nextStratified = res.data.result;
                setStratifiedResult(nextStratified);
                setExecutionTimes(prev => ({ ...prev, stratified: Math.round(performance.now() - startTime) }));
                await saveExperiment({ samplingResults: buildSamplingResultsPayload({ stratified: nextStratified }) });
            } else {
                toast.error(res.message || "分层抽样执行失败");
            }
        } catch (e) {
            toast.error("分层抽样执行失败，请检查网络后重试");
        } finally {
            setExecuting(null);
        }
    };

    // Validation
    const systematicAcceptedRange = getSystematicAcceptedRange(n);
    const systematicSampleCountRange = getSystematicSampleCountRange(N, kValue);
    const isKValid = kValue >= 1 && kValue <= N &&
        isSystematicRangeWithinAcceptedRange(systematicSampleCountRange, systematicAcceptedRange);

    const stratifiedTotal = layerSampleCounts.reduce((a, b) => a + b, 0);
    const isStratifiedValid = layers.length > 0 && stratifiedTotal === n;

    const allCompleted = simpleResult?.completed && systematicResult?.completed && stratifiedResult?.completed;

    const handleConfirmNext = async () => {
        await saveResults();
        await saveExperiment({ currentStage: 4 });
        onNext();
    };

    // Allocation helpers
    const normalizeCountsToTarget = (counts: number[]) => {
        const normalized = counts.map((count) => Math.max(0, Math.round(count)));
        if (normalized.length === 0) return normalized;

        let total = normalized.reduce((sum, count) => sum + count, 0);
        let cursor = 0;
        while (total < n) {
            const idx = cursor % normalized.length;
            const current = normalized[idx] ?? 0;
            normalized[idx] = current + 1;
            total += 1;
            cursor += 1;
        }

        cursor = 0;
        while (total > n) {
            const idx = cursor % normalized.length;
            const current = normalized[idx] ?? 0;
            if (current > 0) {
                normalized[idx] = current - 1;
                total -= 1;
            }
            cursor += 1;
        }

        return normalized;
    };

    const applyProportionalAllocation = () => {
        setLayerSampleCounts(normalizeCountsToTarget(layers.map((l) => n * l.ratio / 100)));
    };

    const applyEqualAllocation = () => {
        if (layers.length === 0) return;
        const equalCount = Math.floor(n / layers.length);
        const remainder = n % layers.length;
        setLayerSampleCounts(normalizeCountsToTarget(layers.map((_, i) => equalCount + (i < remainder ? 1 : 0))));
    };

    const updateLayerCount = (index: number, value: number) => {
        const newCounts = [...layerSampleCounts];
        newCounts[index] = Math.max(0, value);
        setLayerSampleCounts(newCounts);
    };

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300" data-testid="student-stage-sampling">
            <Card className="rounded-2xl border-slate-800 bg-slate-900/50 shadow-sm">
                <CardContent className="py-6 px-6">
                    <div className="flex flex-wrap items-center justify-between gap-6">
                        <div className="flex items-center gap-3">
                            <div className="bg-slate-800 p-2.5 rounded-xl border border-slate-700">
                                <Target className="w-5 h-5 text-indigo-500" />
                            </div>
                            <div>
                                <div className="text-sm font-medium text-slate-400">规划样本量</div>
                                <div className="text-xl font-bold text-slate-100">{n}</div>
                            </div>
                        </div>
                        <div className="w-px h-10 bg-slate-800 hidden sm:block"></div>
                        <div className="flex items-center gap-3">
                            <div className="bg-slate-800 p-2.5 rounded-xl border border-slate-700">
                                <Database className="w-5 h-5 text-teal-400" />
                            </div>
                            <div>
                                <div className="text-sm font-medium text-slate-400">总体规模</div>
                                <div className="text-xl font-bold text-slate-100">{N.toLocaleString()}</div>
                            </div>
                        </div>
                        <div className="w-px h-10 bg-slate-800 hidden sm:block"></div>
                        <div className="flex items-center gap-3">
                            <div className="bg-slate-800 p-2.5 rounded-xl border border-slate-700">
                                <Layers className="w-5 h-5 text-amber-600" />
                            </div>
                            <div>
                                <div className="text-sm font-medium text-slate-400">完成进度</div>
                                <div className="flex items-center gap-2">
                                    <span className="text-xl font-bold text-slate-100">
                                        {[simpleResult?.completed, systematicResult?.completed, stratifiedResult?.completed].filter(Boolean).length}/3
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
                <TabsList className="bg-slate-900 border border-slate-800 p-1 rounded-xl w-full flex h-auto" data-testid="student-sampling-tabs">
                    <TabsTrigger value="simple" data-testid="student-sampling-tab-simple" className="flex-1 rounded-lg py-2.5 data-[state=active]:bg-slate-800 data-[state=active]:text-slate-50 text-slate-400">
                        <div className="flex items-center gap-2">
                            <span>简单随机抽样</span>
                            {simpleResult?.completed && <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
                        </div>
                    </TabsTrigger>
                    <TabsTrigger value="systematic" data-testid="student-sampling-tab-systematic" className="flex-1 rounded-lg py-2.5 data-[state=active]:bg-slate-800 data-[state=active]:text-slate-50 text-slate-400">
                        <div className="flex items-center gap-2">
                            <span>系统抽样</span>
                            {systematicResult?.completed && <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
                        </div>
                    </TabsTrigger>
                    <TabsTrigger value="stratified" data-testid="student-sampling-tab-stratified" className="flex-1 rounded-lg py-2.5 data-[state=active]:bg-slate-800 data-[state=active]:text-slate-50 text-slate-400">
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
                            <Card className="rounded-2xl border-slate-800 bg-slate-900/50 shadow-sm">
                                <CardHeader>
                                    <CardTitle className="text-slate-100 flex items-center gap-2">
                                        <div className="w-2 h-6 bg-indigo-500 rounded-full mr-2"></div>
                                        简单随机抽样
                                    </CardTitle>
                                    <CardDescription className="text-slate-400 pt-1">
                                        从 {N.toLocaleString()} 个总体中随机抽取 {n} 个样本，每个个体被抽中的概率相等。
                                    </CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-6 pt-4">
                                    <div className="p-4 bg-slate-950/30 rounded-xl border border-slate-800/50">
                                        <Label htmlFor="simpleSeed" className="text-slate-300 text-xs">随机种子（可选）</Label>
                                        <Input
                                            id="simpleSeed"
                                            type="number"
                                            value={simpleSeed}
                                            onChange={(e) => setSimpleSeed(e.target.value)}
                                            placeholder="留空则每次随机"
                                            data-testid="student-sampling-simple-seed"
                                            className="mt-2 bg-slate-900 border-slate-700 text-slate-200 focus:border-indigo-500"
                                        />
                                        <p className="text-xs text-slate-500 mt-2">设置后可复现同一组抽样结果。</p>
                                    </div>
                                    {!simpleResult?.completed ? (
                                        <div className="bg-slate-950/50 rounded-xl p-8 text-center border border-slate-800 border-dashed">
                                            <div className="mb-4 text-slate-400">尚未执行抽样</div>
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
                                        <>
                                            <div className="p-5 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl flex items-center gap-4">
                                                <div className="bg-emerald-500/20 p-3 rounded-full">
                                                    <CheckCircle2 className="w-6 h-6 text-emerald-600" />
                                                </div>
                                                <div>
                                                    <p className="text-emerald-600 font-medium text-lg">抽样完成</p>
                                                    <p className="text-emerald-200/70 text-sm mt-1">共成功抽取 {simpleResult.sampleCount} 个样本{executionTimes.simple !== null && `，耗时 ${executionTimes.simple} ms`}</p>
                                                    {simpleResult.seed && (
                                                        <p className="text-xs text-emerald-500/50 mt-1 font-mono">Random Seed: {simpleResult.seed}</p>
                                                    )}
                                                </div>
                                            </div>
                                            <Button variant="outline" size="sm" onClick={executeSimple} disabled={executing !== null} data-testid="student-sampling-simple-rerun" className="border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-slate-100 w-full">
                                                <RefreshCw className="w-4 h-4 mr-2" />
                                                重新抽样
                                            </Button>
                                        </>
                                    )}
                                </CardContent>
                            </Card>
                        </div>
                        <div className="space-y-4">
                            <Card className="rounded-2xl border-slate-800 bg-slate-900/50 shadow-sm h-full">
                                <CardHeader>
                                    <div className="flex items-center justify-between">
                                        <CardTitle className="text-base text-slate-200">抽样预览</CardTitle>
                                        <Badge variant="outline" className="border-slate-700 text-slate-400">分页预览</Badge>
                                    </div>
                                    <CardDescription className="text-slate-400">展示部分抽样结果数据</CardDescription>
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
                            <Card className="rounded-2xl border-slate-800 bg-slate-900/50 shadow-sm">
                                <CardHeader>
                                    <CardTitle className="text-slate-100 flex items-center gap-2">
                                        <div className="w-2 h-6 bg-teal-500 rounded-full mr-2"></div>
                                        系统抽样
                                    </CardTitle>
                                    <CardDescription className="text-slate-400 pt-1">
                                        按固定间隔 K 从总体中抽取样本。规划样本量为 {n}，实际样本量会随 K 值和随机起点在小范围内波动。
                                    </CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-6 pt-4">
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 p-4 bg-slate-950/30 rounded-xl border border-slate-800/50">
                                        <div className="space-y-3">
                                            <Label htmlFor="kValue" className="text-slate-300">间隔 K 值 (步长)</Label>
                                            <div className="relative">
                                                <Input
                                                    id="kValue"
                                                    type="number"
                                                    value={kValue}
                                                    onChange={(e) => setKValue(parseInt(e.target.value) || 1)}
                                                    min={1}
                                                    max={N}
                                                    data-testid="student-sampling-systematic-k"
                                                    className="bg-slate-900 border-slate-700 text-slate-200 focus:border-teal-500 pr-10"
                                                />
                                                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 text-xs">Steps</span>
                                            </div>
                                        </div>
                                        <div className="space-y-3">
                                            <Label className="text-slate-300">预计抽取数量</Label>
                                            <div className={`p-2.5 border rounded-md flex items-center justify-between ${isKValid ? "border-slate-700 bg-slate-900" : "border-rose-500/50 bg-rose-500/10"}`}>
                                                <span className={`font-mono font-bold ${isKValid ? "text-slate-200" : "text-rose-600"}`}>{formatSystematicRange(systematicSampleCountRange)}</span>
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
                                            <Label htmlFor="systematicSeed" className="text-slate-300">随机种子（可选）</Label>
                                            <Input
                                                id="systematicSeed"
                                                type="number"
                                                value={systematicSeed}
                                                onChange={(e) => setSystematicSeed(e.target.value)}
                                                placeholder="留空则每次随机"
                                                data-testid="student-sampling-systematic-seed"
                                                className="bg-slate-900 border-slate-700 text-slate-200 focus:border-teal-500"
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
                                        <div className="space-y-4">
                                            <div className="p-5 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl flex items-center gap-4">
                                                <div className="bg-emerald-500/20 p-3 rounded-full">
                                                    <CheckCircle2 className="w-6 h-6 text-emerald-600" />
                                                </div>
                                                <div>
                                                    <p className="text-emerald-600 font-medium text-lg">抽样完成</p>
                                                    <p className="text-emerald-200/70 text-sm mt-1">K={systematicResult.kValue}，共抽取 {systematicResult.sampleCount} 个样本{executionTimes.systematic !== null && `，耗时 ${executionTimes.systematic} ms`}</p>
                                                </div>
                                                <Button variant="ghost" size="sm" onClick={executeSystematic} disabled={executing !== null || !isKValid} data-testid="student-sampling-systematic-rerun" className="ml-auto text-slate-400 hover:text-slate-100 hover:bg-slate-800">
                                                    <RefreshCw className="w-4 h-4" />
                                                </Button>
                                            </div>
                                        </div>
                                    )}
                                </CardContent>
                            </Card>
                        </div>
                        <div className="space-y-4">
                            <Card className="rounded-2xl border-slate-800 bg-slate-900/50 shadow-sm h-full">
                                <CardHeader>
                                    <div className="flex items-center justify-between">
                                        <CardTitle className="text-base text-slate-200">抽样预览</CardTitle>
                                        <Badge variant="outline" className="border-slate-700 text-slate-400">分页预览</Badge>
                                    </div>
                                    <CardDescription className="text-slate-400">展示部分抽样结果数据</CardDescription>
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

                {/* Stratified Sampling */}
                <TabsContent value="stratified" className="mt-0 focus-visible:outline-none">
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                        <div className="lg:col-span-2 space-y-4">
                            <Card className="rounded-2xl border-slate-800 bg-slate-900/50 shadow-sm">
                                <CardHeader>
                                    <CardTitle className="text-slate-100 flex items-center gap-2">
                                        <div className="w-2 h-6 bg-amber-500 rounded-full mr-2"></div>
                                        分层抽样
                                    </CardTitle>
                                    <CardDescription className="text-slate-400 pt-1">
                                        按分层变量将总体分层，然后从各层中抽取样本。
                                    </CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-6 pt-4">
                                    <div className="flex flex-wrap items-end gap-4">
                                        <div className="space-y-2">
                                            <Label className="text-slate-300 text-xs">选择分层变量</Label>
                                            <Select value={stratifyBy} onValueChange={setStratifyBy}>
                                                <SelectTrigger data-testid="student-sampling-stratify-by" className="w-48 bg-slate-900 border-slate-700 text-slate-200">
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent className="bg-slate-900 border-slate-800 text-slate-200">
                                                    {Object.keys(populationStats).length > 0 ? (
                                                        Object.keys(populationStats).map(key => (
                                                            <SelectItem key={key} value={key}>
                                                                {FIELD_LABELS[key] || key}
                                                            </SelectItem>
                                                        ))
                                                    ) : (
                                                        <>
                                                            <SelectItem value="gender">性别</SelectItem>
                                                            <SelectItem value="education">学历</SelectItem>
                                                        </>
                                                    )}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <div className="space-y-2">
                                            <Label htmlFor="stratifiedSeed" className="text-slate-300 text-xs">随机种子（可选）</Label>
                                            <Input
                                                id="stratifiedSeed"
                                                type="number"
                                                value={stratifiedSeed}
                                                onChange={(e) => setStratifiedSeed(e.target.value)}
                                                placeholder="留空则每次随机"
                                                data-testid="student-sampling-stratified-seed"
                                                className="w-48 bg-slate-900 border-slate-700 text-slate-200"
                                            />
                                        </div>

                                        <div className="flex gap-2 mb-0.5">
                                            <Button variant="outline" size="sm" data-testid="student-sampling-alloc-proportional" className="border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-slate-100" onClick={applyProportionalAllocation} disabled={layers.length === 0}>
                                                按比例分配
                                            </Button>
                                            <Button variant="outline" size="sm" data-testid="student-sampling-alloc-equal" className="border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-slate-100" onClick={applyEqualAllocation} disabled={layers.length === 0}>
                                                等额分配
                                            </Button>
                                        </div>
                                    </div>

                                    <div className="rounded-xl border border-slate-800 overflow-hidden">
                                        <Table>
                                            <TableHeader className="bg-slate-950/50">
                                                <TableRow className="border-slate-800 hover:bg-transparent">
                                                    <TableHead className="text-slate-400">层 (Layer)</TableHead>
                                                    <TableHead className="text-slate-400">人数 (N_h)</TableHead>
                                                    <TableHead className="text-slate-400">占比</TableHead>
                                                    <TableHead className="text-slate-400 w-[120px]">样本数 (n_h)</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {layers.length > 0 ? layers.map((layer, index) => (
                                                    <TableRow key={layer.name} className="border-slate-800 hover:bg-slate-800/30">
                                                        <TableCell className="font-medium text-slate-300">{layer.name}</TableCell>
                                                        <TableCell className="text-slate-400">{layer.count.toLocaleString()}</TableCell>
                                                        <TableCell className="text-slate-400">{layer.ratio}%</TableCell>
                                                        <TableCell>
                                                            <Input
                                                                type="number"
                                                                value={layerSampleCounts[index] ?? 0}
                                                                onChange={(e) => updateLayerCount(index, parseInt(e.target.value) || 0)}
                                                                data-testid={`student-sampling-layer-count-${index + 1}`}
                                                                className="w-20 h-8 bg-slate-900 border-slate-700 text-slate-200 text-center"
                                                                min={0}
                                                            />
                                                        </TableCell>
                                                    </TableRow>
                                                )) : (
                                                    <TableRow>
                                                        <TableCell colSpan={4} className="text-center text-slate-500 h-32">
                                                            正在加载统计数据或该变量无数据...
                                                        </TableCell>
                                                    </TableRow>
                                                )}
                                                <TableRow className="bg-slate-950/30 border-t border-slate-700 font-medium hover:bg-slate-950/30">
                                                    <TableCell colSpan={3} className="text-right text-slate-300 pr-4">合计 Total</TableCell>
                                                    <TableCell>
                                                        <div className="flex items-center gap-2">
                                                            <span className={isStratifiedValid ? "text-emerald-600" : "text-rose-600"}>
                                                                {stratifiedTotal}
                                                            </span>
                                                            <span className="text-slate-500 text-xs">/ {n}</span>
                                                        </div>
                                                    </TableCell>
                                                </TableRow>
                                            </TableBody>
                                        </Table>
                                    </div>

                                    {!isStratifiedValid && layers.length > 0 && (
                                        <div className="p-3 bg-amber-500/10 text-amber-600 border border-amber-500/20 rounded-xl text-xs flex items-center gap-2">
                                            <Target className="w-4 h-4 shrink-0" />
                                            各层样本数之和必须等于目标样本量 {n}（当前：{stratifiedTotal}）
                                        </div>
                                    )}

                                    {!stratifiedResult?.completed ? (
                                        <div className="flex justify-end">
                                            <Button onClick={() => setAnimatingMethod("stratified")} disabled={executing !== null || !isStratifiedValid || layers.length === 0} data-testid="student-sampling-stratified-run" className="bg-amber-600 hover:bg-amber-700 text-white shadow-lg shadow-amber-500/20 w-auto px-8">
                                                {executing === "stratified" ? (
                                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                                ) : (
                                                    <Play className="w-4 h-4 mr-2" />
                                                )}
                                                执行分层抽样
                                            </Button>
                                        </div>
                                    ) : (
                                        <div className="space-y-4">
                                            <div className="p-5 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl flex items-center gap-4">
                                                <div className="bg-emerald-500/20 p-3 rounded-full">
                                                    <CheckCircle2 className="w-6 h-6 text-emerald-600" />
                                                </div>
                                                <div>
                                                    <p className="text-emerald-600 font-medium text-lg">抽样完成</p>
                                                    <p className="text-emerald-200/70 text-sm mt-1">按 {FIELD_LABELS[stratifyBy] || stratifyBy} 分层，共抽取 {stratifiedResult.layers?.reduce((a, l) => a + l.sampleCount, 0)} 个样本{executionTimes.stratified !== null && `，耗时 ${executionTimes.stratified} ms`}</p>
                                                </div>
                                                <Button variant="ghost" size="sm" onClick={executeStratified} disabled={executing !== null || !isStratifiedValid || layers.length === 0} data-testid="student-sampling-stratified-rerun" className="ml-auto text-slate-400 hover:text-slate-100 hover:bg-slate-800">
                                                    <RefreshCw className="w-4 h-4" />
                                                </Button>
                                            </div>
                                        </div>
                                    )}
                                </CardContent>
                            </Card>
                        </div>
                        <div className="space-y-4">
                            <Card className="rounded-2xl border-slate-800 bg-slate-900/50 shadow-sm h-full">
                                <CardHeader>
                                    <div className="flex items-center justify-between">
                                        <CardTitle className="text-base text-slate-200">抽样预览</CardTitle>
                                        <Badge variant="outline" className="border-slate-700 text-slate-400">分页预览</Badge>
                                    </div>
                                    <CardDescription className="text-slate-400">展示部分抽样结果数据</CardDescription>
                                </CardHeader>
                                <CardContent className="h-[300px] overflow-hidden">
                                    {!stratifiedResult?.completed ? (
                                        <div className="h-full flex items-center justify-center text-sm text-slate-500 italic">
                                            完成抽样后展示
                                        </div>
                                    ) : (
                                        <SamplePreviewTable data={stratifiedResult.data ?? []} total={stratifiedResult.layers?.reduce((a, l) => a + l.sampleCount, 0) ?? 0} />
                                    )}
                                </CardContent>
                            </Card>
                        </div>
                    </div>
                </TabsContent>
            </Tabs>

            {/* Navigation */}
            <div className="flex justify-between pt-6 border-t border-slate-800/50">
                <Button variant="outline" onClick={onPrev} data-testid="student-sampling-prev" className="border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-slate-100">
                    上一阶段
                </Button>
                <Button onClick={() => setConfirmNextOpen(true)} disabled={!allCompleted} data-testid="student-sampling-next" className={allCompleted ? "bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg shadow-indigo-500/20" : "bg-slate-800 text-slate-500"}>
                    {allCompleted ? "完成本阶段" : `请完成所有抽样方法 (${[simpleResult?.completed, systematicResult?.completed, stratifiedResult?.completed].filter(Boolean).length}/3)`}
                    <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
            </div>

            {/* Confirm Next Stage Dialog */}
            <AlertDialog open={confirmNextOpen} onOpenChange={setConfirmNextOpen}>
                <AlertDialogContent className="bg-slate-900 border-slate-800 text-slate-200" data-testid="student-sampling-confirm-dialog">
                    <AlertDialogHeader>
                        <AlertDialogTitle className="text-slate-100">确认完成抽样执行</AlertDialogTitle>
                        <AlertDialogDescription asChild>
                            <div className="text-sm text-slate-400">
                                您已完成三种抽样方法的执行：
                                <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 mt-3 mb-3 space-y-2">
                                    <div className="flex justify-between"><span>简单随机抽样:</span> <span className="text-slate-200">{simpleResult?.sampleCount} 样本</span></div>
                                    <div className="flex justify-between"><span>系统抽样:</span> <span className="text-slate-200">{systematicResult?.sampleCount} 样本 (K={systematicResult?.kValue})</span></div>
                                    <div className="flex justify-between"><span>分层抽样:</span> <span className="text-slate-200">{stratifiedResult?.layers?.reduce((a, l) => a + l.sampleCount, 0)} 样本</span></div>
                                </div>
                                <p>确认后将进入分析与报告阶段。</p>
                            </div>
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel className="bg-slate-950 border-slate-800 text-slate-300 hover:bg-slate-800 hover:text-slate-100">取消</AlertDialogCancel>
                        <AlertDialogAction onClick={handleConfirmNext} data-testid="student-sampling-confirm" className="bg-indigo-600 hover:bg-indigo-700 text-white">确认</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* Immersive Sampling Animation Overlay */}
            {animatingMethod && (
                <ImmersiveSamplingAnimation
                    method={animatingMethod}
                    populationSize={N}
                    sampleSize={animatingMethod === "systematic" ? Math.ceil(N / kValue) : n}
                    kValue={animatingMethod === "systematic" ? kValue : undefined}
                    stratifyBy={animatingMethod === "stratified" ? stratifyBy : undefined}
                    layers={animatingMethod === "stratified" ? layers.map((l, i) => ({ ...l, sampleCount: layerSampleCounts[i] ?? 0 })) : undefined}
                    onAnimationComplete={() => {
                        if (animatingMethod === "simple") executeSimple();
                        else if (animatingMethod === "systematic") executeSystematic();
                        else if (animatingMethod === "stratified") executeStratified();
                    }}
                    onClose={() => setAnimatingMethod(null)}
                />
            )}
        </div>
    );
}



// Sample preview table component
function SamplePreviewTable({ data, total }: { data: unknown[]; total: number }) {
    const samples = (data as Array<Record<string, unknown>>) ?? [];
    const pageSize = 20;
    const [page, setPage] = useState(1);

    useEffect(() => {
        setPage(1);
    }, [data]);

    if (samples.length === 0) {
        return <div className="h-full flex items-center justify-center text-sm text-slate-500 italic">暂无抽样数据</div>;
    }

    const keys = Object.keys(samples[0] ?? {});
    const totalPages = Math.max(1, Math.ceil(samples.length / pageSize));
    const currentPage = Math.min(page, totalPages);
    const start = (currentPage - 1) * pageSize;
    const end = Math.min(start + pageSize, samples.length);
    const rows = samples.slice(start, end);

    return (
        <div className="w-full h-full flex flex-col">
            <div className="flex-1 overflow-auto rounded-xl border border-slate-800">
                <Table>
                    <TableHeader className="bg-slate-950/50 sticky top-0">
                        <TableRow className="border-slate-800 hover:bg-transparent">
                            {keys.map((key) => (
                                <TableHead key={key} className="text-xs text-slate-500 h-8 whitespace-nowrap">
                                    {FIELD_LABELS[key] || key}
                                </TableHead>
                            ))}
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {rows.map((row, rowIndex) => (
                            <TableRow key={`${start + rowIndex}`} className="border-slate-800 hover:bg-slate-800/50">
                                {keys.map((key) => (
                                    <TableCell key={`${start + rowIndex}-${key}`} className="py-2 text-slate-300 text-xs whitespace-nowrap">
                                        {String(row[key] ?? "")}
                                    </TableCell>
                                ))}
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </div>
            <div className="mt-3 flex items-center justify-between gap-2">
                <p className="text-xs text-slate-500">
                    显示第 {start + 1}-{end} 条，共 {Math.max(total, samples.length)} 条
                </p>
                <div className="flex items-center gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        className="h-7 px-2 text-xs border-slate-700 bg-slate-900 text-slate-300 hover:bg-slate-800"
                        onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                        disabled={currentPage <= 1}
                    >
                        上一页
                    </Button>
                    <span className="text-xs text-slate-500">{currentPage}/{totalPages}</span>
                    <Button
                        variant="outline"
                        size="sm"
                        className="h-7 px-2 text-xs border-slate-700 bg-slate-900 text-slate-300 hover:bg-slate-800"
                        onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
                        disabled={currentPage >= totalPages}
                    >
                        下一页
                    </Button>
                </div>
            </div>
        </div>
    );
}

export default SamplingExecution;
