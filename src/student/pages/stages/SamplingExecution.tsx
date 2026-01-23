import { useState, useEffect, useCallback } from "react";
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

interface SamplingExecutionProps {
    onNext: () => void;
    onPrev: () => void;
}

type SamplingMethod = "simple" | "systematic" | "stratified";

const FIELD_LABELS: Record<string, string> = {
    "gender": "性别",
    "education": "学历",
    "age": "年龄段",
    "income": "收入水平"
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

    // Save results when they change
    const saveResults = useCallback(async () => {
        const samplingResults: SamplingResultsData = {};

        if (simpleResult) {
            samplingResults.simple = simpleResult;
        }
        if (systematicResult) {
            samplingResults.systematic = systematicResult;
        }
        if (stratifiedResult) {
            samplingResults.stratified = stratifiedResult;
        }

        await saveExperiment({ samplingResults });
    }, [simpleResult, systematicResult, stratifiedResult, saveExperiment]);


    // Execute sampling with real API
    const executeSimple = async () => {
        setExecuting("simple");
        try {
            const res = await experimentApi.executeSampling(experiment?.taskId!, "simple", {
                sampleSize: n
            });
            if (res.success && res.data?.result) {
                setSimpleResult(res.data.result);
            }
        } catch (e) {
            console.error(e);
        } finally {
            setExecuting(null);
        }
    };

    const executeSystematic = async () => {
        setExecuting("systematic");
        try {
            const res = await experimentApi.executeSampling(experiment?.taskId!, "systematic", {
                kValue,
                sampleSize: Math.ceil(N / kValue)
            });
            if (res.success && res.data?.result) {
                setSystematicResult(res.data.result);
            }
        } catch (e) {
            console.error(e);
        } finally {
            setExecuting(null);
        }
    };

    const executeStratified = async () => {
        setExecuting("stratified");
        const totalSampleCount = layerSampleCounts.reduce((a, b) => a + b, 0);

        // Construct layers payload mapping current counts to layer names
        const layersPayload = layers.map((layer, i) => ({
            name: layer.name,
            count: layer.count,
            ratio: layer.ratio,
            sampleCount: layerSampleCounts[i] ?? 0,
        }));

        try {
            const res = await experimentApi.executeSampling(experiment?.taskId!, "stratified", {
                stratifyBy,
                layers: layersPayload
            });
            if (res.success && res.data?.result) {
                setStratifiedResult(res.data.result);
            }
        } catch (e) {
            console.error(e);
        } finally {
            setExecuting(null);
        }
    };

    // Validation
    const expectedSystematicCount = Math.ceil(N / kValue);
    const isKValid = kValue >= 1 && kValue <= N &&
        expectedSystematicCount >= n * 0.8 && expectedSystematicCount <= n * 1.2;

    const stratifiedTotal = layerSampleCounts.reduce((a, b) => a + b, 0);
    // Allow small deviation for rounding
    const isStratifiedValid = Math.abs(stratifiedTotal - n) <= layers.length + 5; // Relaxed validation slightly

    const allCompleted = simpleResult?.completed && systematicResult?.completed && stratifiedResult?.completed;

    const handleConfirmNext = async () => {
        await saveResults();
        await saveExperiment({ currentStage: 4 });
        onNext();
    };

    // Allocation helpers
    const applyProportionalAllocation = () => {
        setLayerSampleCounts(layers.map(l => Math.round(n * l.ratio / 100)));
    };

    const applyEqualAllocation = () => {
        if (layers.length === 0) return;
        const equalCount = Math.floor(n / layers.length);
        const remainder = n % layers.length;
        setLayerSampleCounts(layers.map((_, i) => equalCount + (i < remainder ? 1 : 0)));
    };

    const updateLayerCount = (index: number, value: number) => {
        const newCounts = [...layerSampleCounts];
        newCounts[index] = Math.max(0, value);
        setLayerSampleCounts(newCounts);
    };

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
            <Card className="rounded-2xl border-slate-800 bg-slate-900/50 shadow-sm">
                <CardContent className="py-6 px-6">
                    <div className="flex flex-wrap items-center justify-between gap-6">
                        <div className="flex items-center gap-3">
                            <div className="bg-slate-800 p-2.5 rounded-xl border border-slate-700">
                                <Target className="w-5 h-5 text-indigo-400" />
                            </div>
                            <div>
                                <div className="text-sm font-medium text-slate-400">目标样本量</div>
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
                                <Layers className="w-5 h-5 text-amber-400" />
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
                <TabsList className="bg-slate-900 border border-slate-800 p-1 rounded-xl w-full flex h-auto">
                    <TabsTrigger value="simple" className="flex-1 rounded-lg py-2.5 data-[state=active]:bg-slate-800 data-[state=active]:text-white text-slate-400">
                        <div className="flex items-center gap-2">
                            <span>简单随机抽样</span>
                            {simpleResult?.completed && <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
                        </div>
                    </TabsTrigger>
                    <TabsTrigger value="systematic" className="flex-1 rounded-lg py-2.5 data-[state=active]:bg-slate-800 data-[state=active]:text-white text-slate-400">
                        <div className="flex items-center gap-2">
                            <span>系统抽样</span>
                            {systematicResult?.completed && <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
                        </div>
                    </TabsTrigger>
                    <TabsTrigger value="stratified" className="flex-1 rounded-lg py-2.5 data-[state=active]:bg-slate-800 data-[state=active]:text-white text-slate-400">
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
                                    {!simpleResult?.completed ? (
                                        <div className="bg-slate-950/50 rounded-xl p-8 text-center border border-slate-800 border-dashed">
                                            <div className="mb-4 text-slate-400">尚未执行抽样</div>
                                            <Button onClick={executeSimple} disabled={executing !== null} className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg shadow-indigo-500/20">
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
                                                    <CheckCircle2 className="w-6 h-6 text-emerald-400" />
                                                </div>
                                                <div>
                                                    <p className="text-emerald-400 font-medium text-lg">抽样完成</p>
                                                    <p className="text-emerald-200/70 text-sm mt-1">共成功抽取 {simpleResult.sampleCount} 个样本</p>
                                                    {simpleResult.seed && (
                                                        <p className="text-xs text-emerald-500/50 mt-1 font-mono">Random Seed: {simpleResult.seed}</p>
                                                    )}
                                                </div>
                                            </div>
                                            <Button variant="outline" size="sm" onClick={executeSimple} disabled={executing !== null} className="border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white w-full">
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
                                        <Badge variant="outline" className="border-slate-700 text-slate-400">前 5 条</Badge>
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
                                        按固定间隔 K 从总体中抽取样本。建议 K 值：{Math.round(N / n)}
                                    </CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-6 pt-4">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-4 bg-slate-950/30 rounded-xl border border-slate-800/50">
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
                                                    className="bg-slate-900 border-slate-700 text-slate-200 focus:border-teal-500 pr-10"
                                                />
                                                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 text-xs">Steps</span>
                                            </div>
                                        </div>
                                        <div className="space-y-3">
                                            <Label className="text-slate-300">预计抽取数量</Label>
                                            <div className={`p-2.5 border rounded-md flex items-center justify-between ${isKValid ? "border-slate-700 bg-slate-900" : "border-rose-500/50 bg-rose-500/10"}`}>
                                                <span className={`font-mono font-bold ${isKValid ? "text-slate-200" : "text-rose-400"}`}>{expectedSystematicCount}</span>
                                                <span className="text-xs text-slate-500">Target: {Math.floor(n * 0.8)} - {Math.floor(n * 1.2)}</span>
                                            </div>
                                            {!isKValid && (
                                                <p className="text-xs text-rose-400 mt-1">
                                                    样本量偏差过大，请调整 K 值
                                                </p>
                                            )}
                                        </div>
                                    </div>

                                    {!systematicResult?.completed ? (
                                        <div className="flex justify-end">
                                            <Button onClick={executeSystematic} disabled={executing !== null || !isKValid} className="bg-teal-600 hover:bg-teal-700 text-white shadow-lg shadow-teal-500/20 w-auto px-8">
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
                                                    <CheckCircle2 className="w-6 h-6 text-emerald-400" />
                                                </div>
                                                <div>
                                                    <p className="text-emerald-400 font-medium text-lg">抽样完成</p>
                                                    <p className="text-emerald-200/70 text-sm mt-1">K={systematicResult.kValue}，共抽取 {systematicResult.sampleCount} 个样本</p>
                                                </div>
                                                <Button variant="ghost" size="sm" onClick={executeSystematic} disabled={executing !== null || !isKValid} className="ml-auto text-slate-400 hover:text-white hover:bg-slate-800">
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
                                        <Badge variant="outline" className="border-slate-700 text-slate-400">前 5 条</Badge>
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
                                                <SelectTrigger className="w-48 bg-slate-900 border-slate-700 text-slate-200">
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

                                        <div className="flex gap-2 mb-0.5">
                                            <Button variant="outline" size="sm" className="border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white" onClick={applyProportionalAllocation} disabled={layers.length === 0}>
                                                按比例分配
                                            </Button>
                                            <Button variant="outline" size="sm" className="border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white" onClick={applyEqualAllocation} disabled={layers.length === 0}>
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
                                                            <span className={isStratifiedValid ? "text-emerald-400" : "text-rose-400"}>
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
                                        <div className="p-3 bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded-xl text-xs flex items-center gap-2">
                                            <Target className="w-4 h-4 shrink-0" />
                                            各层样本数之和应接近目标样本量 {n}（当前：{stratifiedTotal}）
                                        </div>
                                    )}

                                    {!stratifiedResult?.completed ? (
                                        <div className="flex justify-end">
                                            <Button onClick={executeStratified} disabled={executing !== null || !isStratifiedValid || layers.length === 0} className="bg-amber-600 hover:bg-amber-700 text-white shadow-lg shadow-amber-500/20 w-auto px-8">
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
                                                    <CheckCircle2 className="w-6 h-6 text-emerald-400" />
                                                </div>
                                                <div>
                                                    <p className="text-emerald-400 font-medium text-lg">抽样完成</p>
                                                    <p className="text-emerald-200/70 text-sm mt-1">按 {STRATIFY_LABELS[stratifyBy] || stratifyBy} 分层，共抽取 {stratifiedResult.layers?.reduce((a, l) => a + l.sampleCount, 0)} 个样本</p>
                                                </div>
                                                <Button variant="ghost" size="sm" onClick={executeStratified} disabled={executing !== null || !isStratifiedValid || layers.length === 0} className="ml-auto text-slate-400 hover:text-white hover:bg-slate-800">
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
                                        <Badge variant="outline" className="border-slate-700 text-slate-400">前 5 条</Badge>
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
                <Button variant="outline" onClick={onPrev} className="border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white">
                    上一步
                </Button>
                <Button onClick={() => setConfirmNextOpen(true)} disabled={!allCompleted} className={allCompleted ? "bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg shadow-indigo-500/20" : "bg-slate-800 text-slate-500"}>
                    {allCompleted ? "完成本阶段" : `请完成所有抽样方法 (${[simpleResult?.completed, systematicResult?.completed, stratifiedResult?.completed].filter(Boolean).length}/3)`}
                    <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
            </div>

            {/* Confirm Next Stage Dialog */}
            <AlertDialog open={confirmNextOpen} onOpenChange={setConfirmNextOpen}>
                <AlertDialogContent className="bg-slate-900 border-slate-800 text-slate-200">
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
                        <AlertDialogCancel className="bg-slate-950 border-slate-800 text-slate-300 hover:bg-slate-800 hover:text-white">取消</AlertDialogCancel>
                        <AlertDialogAction onClick={handleConfirmNext} className="bg-indigo-600 hover:bg-indigo-700 text-white">确认</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}

const STRATIFY_LABELS: Record<string, string> = {
    "gender": "性别",
    "education": "学历",
    "age": "年龄段",
    "income": "收入"
};


// Sample preview table component
function SamplePreviewTable({ data, total }: { data: unknown[]; total: number }) {
    const samples = data as Array<{ id: number; age: string; gender: string; income: string }>;

    if (samples.length === 0) return null;

    return (
        <div className="w-full">
            <Table>
                <TableHeader>
                    <TableRow className="border-slate-800 hover:bg-transparent">
                        <TableHead className="text-xs text-slate-500 h-8">ID</TableHead>
                        <TableHead className="text-xs text-slate-500 h-8">年龄段</TableHead>
                        <TableHead className="text-xs text-slate-500 h-8">性别</TableHead>
                        <TableHead className="text-xs text-slate-500 h-8 text-right">收入</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {samples.slice(0, 5).map((row) => (
                        <TableRow key={row.id} className="border-slate-800 hover:bg-slate-800/50">
                            <TableCell className="py-2.5 text-slate-300 font-mono text-xs">{row.id}</TableCell>
                            <TableCell className="py-2.5 text-slate-400 text-xs">{row.age}</TableCell>
                            <TableCell className="py-2.5 text-slate-400 text-xs">{row.gender}</TableCell>
                            <TableCell className="py-2.5 text-slate-400 text-xs text-right">{row.income}</TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
            <p className="text-xs text-slate-600 mt-3 text-center">显示前 {Math.min(5, samples.length)} 条，共 {total} 条</p>
        </div>
    );
}

export default SamplingExecution;
