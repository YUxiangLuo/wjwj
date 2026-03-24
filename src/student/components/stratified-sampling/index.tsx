import { useState, useEffect, useCallback, useImperativeHandle, forwardRef, useRef } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from "@/components/ui/dialog";
import { Play, Loader2, Target, BarChart3, CheckCircle2, RefreshCw } from "lucide-react";

import type { AllocationMethod } from "./types";
import { INLINE_METHODS, ALLOCATION_METHOD_LABELS, ALLOCATION_METHOD_DESCRIPTIONS } from "./types";
import { computeAllocation } from "./allocation-methods";
import { StratifiedAllocationComparison } from "./AllocationComparison";
import { FIELD_LABELS, parseSeed } from "../sampling-shared";
import { SamplePreviewTable } from "../SamplePreviewTable";
import { experimentApi, type SamplingResultsData } from "../../api-client";
import type { MethodKey as SamplingMethod } from "../../api-client";

// ─── Types ───

export interface StratifiedSamplingTabRef {
    execute: () => Promise<void>;
}

export interface StratifiedSamplingTabProps {
    n: number;
    N: number;
    taskId: number | undefined;
    populationStats: Record<string, Record<string, number>>;
    numericFields: string[];
    stratumNumericStats: Record<string, Record<string, Record<string, { mean: number; stdDev: number }>>>;
    initialResult: SamplingResultsData["stratified"] | null;
    stratifiedResult: SamplingResultsData["stratified"] | null;
    executing: SamplingMethod | null;
    executionTime: number | null;
    onRequestAnimation: (data: {
        stratifyBy: string;
        layers: Array<{ name: string; count: number; ratio: number; sampleCount: number }>;
    }) => void;
    onExecuteComplete: (
        result: NonNullable<SamplingResultsData["stratified"]>,
        timeMs: number,
        sampledData: { data: Array<Record<string, unknown>>; total: number },
    ) => void;
    onExecuteFailed: () => void;
    saveExperiment: (data: Record<string, unknown>) => Promise<boolean>;
    buildSamplingResultsPayload: (next?: Partial<SamplingResultsData>) => SamplingResultsData;
}

// ─── Component ───

export const StratifiedSamplingTab = forwardRef<StratifiedSamplingTabRef, StratifiedSamplingTabProps>(
    function StratifiedSamplingTab(props, ref) {
        const {
            n, N, taskId,
            populationStats, numericFields, stratumNumericStats,
            initialResult, stratifiedResult,
            executing, executionTime,
            onRequestAnimation, onExecuteComplete, onExecuteFailed,
            saveExperiment, buildSamplingResultsPayload,
        } = props;

        // ─── Local state ───
        const [stratifyBy, setStratifyBy] = useState(initialResult?.stratifyBy ?? "gender");
        const [stratifiedSeed, setStratifiedSeed] = useState(initialResult?.seed ? String(initialResult.seed) : "");
        const [layers, setLayers] = useState<Array<{ name: string; count: number; ratio: number }>>([]);
        const [layerSampleCounts, setLayerSampleCounts] = useState<number[]>([]);
        const [allocationMethod, setAllocationMethod] = useState<AllocationMethod>("proportional");
        const [manualAdjust, setManualAdjust] = useState(false);
        const [showAllocationComparison, setShowAllocationComparison] = useState(false);

        // ─── Allocation method application ───
        const applyAllocationMethod = useCallback((method: AllocationMethod, currentLayers?: Array<{ name: string; count: number; ratio: number }>) => {
            const ls = currentLayers ?? layers;
            if (!ls.length) return;

            const layerInfos = ls.map(l => ({ name: l.name, count: l.count, ratio: l.ratio }));
            const stdDevs = stratumNumericStats[stratifyBy];
            const layerStdDevArr = stdDevs
                ? ls.map(l => stdDevs[l.name])
                    .map(s => s ? Object.values(s)[0]?.stdDev : undefined)
                    .every((s): s is number => s !== undefined && s > 0)
                    ? ls.map(l => Object.values(stdDevs[l.name] ?? {})[0]?.stdDev ?? 0)
                    : undefined
                : undefined;
            const layerMeansArr = stdDevs
                ? ls.map(l => stdDevs[l.name])
                    .map(s => s ? Object.values(s)[0]?.mean : undefined)
                    .every((m): m is number => m !== undefined && m > 0)
                    ? ls.map(l => Object.values(stdDevs[l.name] ?? {})[0]?.mean ?? 1)
                    : undefined
                : undefined;

            const result = computeAllocation(method, layerInfos, n, {
                stdDevs: layerStdDevArr,
                layerMeans: layerMeansArr,
            });

            setLayerSampleCounts(result.allocation.map(a => a.sampleSize));
        }, [layers, n, stratumNumericStats, stratifyBy]);

        // Ref to latest applyAllocationMethod, avoids stale closures in layer-loading effect
        const applyRef = useRef(applyAllocationMethod);
        useEffect(() => { applyRef.current = applyAllocationMethod; });

        // ─── Layer loading effect ───
        useEffect(() => {
            const stats = populationStats[stratifyBy];

            if (!stats) {
                if (initialResult?.stratifyBy === stratifyBy && initialResult.layers?.length) {
                    const savedLayers = initialResult.layers.map((layer) => {
                        const ratio = Number.isFinite(layer.ratio)
                            ? layer.ratio
                            : layer.count > 0
                                ? parseFloat(((layer.count / N) * 100).toFixed(1))
                                : 0;
                        return { name: layer.name, count: layer.count, ratio };
                    });
                    setLayers(savedLayers);
                    setLayerSampleCounts(savedLayers.map((_, i) => initialResult.layers![i]!.sampleCount ?? 0));
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

            if (initialResult?.stratifyBy === stratifyBy && initialResult.layers) {
                const savedMap = new Map(initialResult.layers.map((l) => [l.name, l.sampleCount]));
                setLayerSampleCounts(newLayers.map((l) => savedMap.get(l.name) ?? 0));
            } else {
                applyRef.current(allocationMethod, newLayers);
            }
        }, [stratifyBy, populationStats, N, initialResult, allocationMethod]);

        // Re-apply allocation when method/n changes (unless in manual mode)
        useEffect(() => {
            if (!manualAdjust && layers.length > 0) {
                applyAllocationMethod(allocationMethod);
            }
        }, [allocationMethod, manualAdjust, applyAllocationMethod]);

        // ─── Manual editing ───
        const updateLayerCount = (index: number, value: number) => {
            const newCounts = [...layerSampleCounts];
            newCounts[index] = Math.max(0, value);
            setLayerSampleCounts(newCounts);
        };

        // ─── Validation ───
        const stratifiedTotal = layerSampleCounts.reduce((a, b) => a + b, 0);
        const layerOverflows = layers.map((l, i) => (layerSampleCounts[i] ?? 0) > l.count);
        const hasLayerOverflow = layerOverflows.some(Boolean);
        const isStratifiedValid = layers.length > 0 && stratifiedTotal === n && !hasLayerOverflow;

        // ─── Execute (called by parent after animation) ───
        const executeStratified = useCallback(async () => {
            if (!taskId) return;
            const startTime = performance.now();
            const layersPayload = layers.map((layer, i) => ({
                name: layer.name,
                count: layer.count,
                ratio: layer.ratio,
                sampleCount: layerSampleCounts[i] ?? 0,
            }));

            try {
                const { seed, error: seedError } = parseSeed(stratifiedSeed);
                if (seedError) { toast.error(seedError); onExecuteFailed(); return; }
                const res = await experimentApi.executeSampling(taskId, "stratified", {
                    stratifyBy,
                    layers: layersPayload,
                    seed,
                });
                if (res.success && res.data?.result) {
                    const nextStratified = res.data.result;
                    const timeMs = Math.round(performance.now() - startTime);
                    const dataArr = (nextStratified.data ?? []) as Array<Record<string, unknown>>;
                    try {
                        await saveExperiment({ samplingResults: buildSamplingResultsPayload({ stratified: nextStratified }) });
                    } catch {
                        toast.error("抽样结果保存失败");
                    }
                    onExecuteComplete(nextStratified as NonNullable<SamplingResultsData["stratified"]>, timeMs, { data: dataArr, total: nextStratified.sampleCount ?? dataArr.length });
                } else {
                    toast.error(res.error?.message || "分层抽样执行失败");
                    onExecuteFailed();
                }
            } catch {
                toast.error("分层抽样执行失败，请检查网络后重试");
                onExecuteFailed();
            }
        }, [taskId, layers, layerSampleCounts, stratifiedSeed, stratifyBy, onExecuteComplete, onExecuteFailed, saveExperiment, buildSamplingResultsPayload]);

        useImperativeHandle(ref, () => ({ execute: executeStratified }), [executeStratified]);

        // ─── Handle "execute" button click ───
        const handleRunClick = () => {
            const layersPayload = layers.map((layer, i) => ({
                ...layer,
                sampleCount: layerSampleCounts[i] ?? 0,
            }));
            onRequestAnimation({ stratifyBy, layers: layersPayload });
        };

        // ─── Apply from comparison dialog ───
        const handleApplyFromComparison = (method: AllocationMethod, allocation: { name: string; count: number; sampleCount: number }[]) => {
            const newCounts = allocation.map(a => a.sampleCount);
            setLayerSampleCounts(newCounts);
            setAllocationMethod(method);
            setManualAdjust(false);
            const hasOverflow = allocation.some(a => a.sampleCount >= a.count);
            const label = ALLOCATION_METHOD_LABELS[method] ?? method;
            toast.success(`已应用${label}分配${hasOverflow ? "（自动处理超额层）" : ""}`);
            setShowAllocationComparison(false);
        };

        // ─── Render ───
        return (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                <div className="lg:col-span-2 space-y-4">
                    <Card className="rounded-2xl border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 shadow-sm">
                        <CardHeader>
                            <CardTitle className="text-slate-900 dark:text-slate-100 flex items-center gap-2">
                                <div className="w-2 h-6 bg-amber-500 rounded-full mr-2"></div>
                                分层抽样
                            </CardTitle>
                            <CardDescription className="text-slate-600 dark:text-slate-400 pt-1">
                                按分层变量将总体分层，然后从各层中抽取样本。
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-6 pt-4">
                            {/* 分层变量 + 随机种子 */}
                            <div className="grid gap-4 rounded-2xl border border-slate-200/70 bg-white/40 p-4 dark:border-slate-800/70 dark:bg-slate-950/20 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] xl:grid-cols-[220px_220px_minmax(0,1fr)] xl:items-end">
                                <div className="space-y-2">
                                    <Label className="text-xs text-slate-700 dark:text-slate-300">选择分层变量</Label>
                                    <Select value={stratifyBy} onValueChange={setStratifyBy}>
                                        <SelectTrigger data-testid="student-sampling-stratify-by" className="w-48 bg-slate-50 dark:bg-slate-900 border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent className="bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200">
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
                                    <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                                        系统会根据该变量的总体分布，自动计算下方每层的占比。
                                    </p>
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="stratifiedSeed" className="text-xs text-slate-700 dark:text-slate-300">随机种子（可选）</Label>
                                    <Input
                                        id="stratifiedSeed"
                                        type="number"
                                        value={stratifiedSeed}
                                        onChange={(e) => setStratifiedSeed(e.target.value)}
                                        placeholder="留空则每次随机"
                                        data-testid="student-sampling-stratified-seed"
                                        className="w-48 bg-slate-50 dark:bg-slate-900 border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200"
                                    />
                                    <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                                        留空时每次重新随机，填写后可复现同一组结果。
                                    </p>
                                </div>
                            </div>

                            {/* 分配方法选择器 (inline) */}
                            <div className="rounded-2xl border border-slate-200/70 bg-white/40 p-4 dark:border-slate-800/70 dark:bg-slate-950/20 space-y-3">
                                <div className="flex items-center justify-between">
                                    <Label className="text-xs text-slate-700 dark:text-slate-300">分配方法</Label>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => setShowAllocationComparison(true)}
                                        disabled={layers.length === 0}
                                        className="h-7 text-xs text-violet-600 hover:text-violet-700 hover:bg-violet-50 dark:text-violet-400 dark:hover:bg-violet-900/30"
                                    >
                                        <BarChart3 className="w-3.5 h-3.5 mr-1" />
                                        查看全部方法及详细对比
                                    </Button>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    {INLINE_METHODS.map(method => (
                                        <button
                                            key={method}
                                            onClick={() => {
                                                setAllocationMethod(method);
                                                setManualAdjust(false);
                                            }}
                                            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all border ${
                                                allocationMethod === method && !manualAdjust
                                                    ? "bg-amber-100 border-amber-400 text-amber-800 dark:bg-amber-900/40 dark:border-amber-500/50 dark:text-amber-200"
                                                    : "bg-white border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-400 dark:hover:border-slate-600"
                                            }`}
                                        >
                                            {ALLOCATION_METHOD_LABELS[method]}
                                        </button>
                                    ))}
                                </div>
                                {!manualAdjust && (
                                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                                        {ALLOCATION_METHOD_DESCRIPTIONS[allocationMethod]}
                                    </p>
                                )}
                            </div>

                            {/* 层分配表格 */}
                            <div className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
                                <Table>
                                    <TableHeader className="bg-white/50 dark:bg-slate-950/50">
                                        <TableRow className="border-slate-200 dark:border-slate-800 hover:bg-transparent">
                                            <TableHead className="text-slate-600 dark:text-slate-400">层 (Layer)</TableHead>
                                            <TableHead className="text-slate-600 dark:text-slate-400">人数 N<sub>h</sub></TableHead>
                                            <TableHead className="text-slate-600 dark:text-slate-400">占比</TableHead>
                                            <TableHead className="text-slate-600 dark:text-slate-400 w-[120px]">
                                                样本数 n<sub>h</sub>
                                            </TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {layers.length > 0 ? layers.map((layer, index) => (
                                            <TableRow key={layer.name} className="border-slate-200 dark:border-slate-800 hover:bg-slate-200/30 dark:hover:bg-slate-800/30">
                                                <TableCell className="font-medium text-slate-700 dark:text-slate-300">{layer.name}</TableCell>
                                                <TableCell className="text-slate-600 dark:text-slate-400">{layer.count.toLocaleString()}</TableCell>
                                                <TableCell className="text-slate-600 dark:text-slate-400">{layer.ratio}%</TableCell>
                                                <TableCell>
                                                    {manualAdjust ? (
                                                        <Input
                                                            type="number"
                                                            value={layerSampleCounts[index] ?? 0}
                                                            onChange={(e) => updateLayerCount(index, parseInt(e.target.value) || 0)}
                                                            data-testid={`student-sampling-layer-count-${index + 1}`}
                                                            className={`w-20 h-8 bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-200 text-center ${layerOverflows[index] ? "border-rose-500" : "border-slate-300 dark:border-slate-700"}`}
                                                            min={0}
                                                        />
                                                    ) : (
                                                        <span className="inline-block w-20 text-center text-sm font-mono text-slate-700 dark:text-slate-300">
                                                            {layerSampleCounts[index] ?? 0}
                                                        </span>
                                                    )}
                                                </TableCell>
                                            </TableRow>
                                        )) : (
                                            <TableRow>
                                                <TableCell colSpan={4} className="text-center text-slate-500 h-32">
                                                    正在加载统计数据或该变量无数据...
                                                </TableCell>
                                            </TableRow>
                                        )}
                                        <TableRow className="bg-white/30 dark:bg-slate-950/30 border-t border-slate-300 dark:border-slate-700 font-medium hover:bg-white/30 dark:hover:bg-slate-950/30">
                                            <TableCell colSpan={3} className="text-right text-slate-700 dark:text-slate-300 pr-4">合计 Total</TableCell>
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

                            {/* 手动调整开关 + 重置 */}
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <Switch
                                        id="manualAdjust"
                                        checked={manualAdjust}
                                        onCheckedChange={(checked) => {
                                            setManualAdjust(checked);
                                            if (!checked) {
                                                applyAllocationMethod(allocationMethod);
                                            }
                                        }}
                                    />
                                    <Label htmlFor="manualAdjust" className="text-xs text-slate-600 dark:text-slate-400 cursor-pointer">
                                        手动调整
                                    </Label>
                                </div>
                                {manualAdjust && (
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => applyAllocationMethod(allocationMethod)}
                                        className="h-7 text-xs text-slate-500 hover:text-slate-700"
                                    >
                                        重置为{ALLOCATION_METHOD_LABELS[allocationMethod]}
                                    </Button>
                                )}
                            </div>

                            {/* 验证提示 */}
                            {!isStratifiedValid && layers.length > 0 && (
                                <div className="p-3 bg-amber-500/10 text-amber-600 border border-amber-500/20 rounded-xl text-xs flex items-center gap-2">
                                    <Target className="w-4 h-4 shrink-0" />
                                    {hasLayerOverflow
                                        ? "部分层的样本数超过了该层总体人数，请调整"
                                        : `各层样本数之和必须等于目标样本量 ${n}（当前：${stratifiedTotal}）`}
                                </div>
                            )}

                            {/* 执行按钮 / 成功状态 */}
                            {!stratifiedResult?.completed ? (
                                <div className="flex justify-end">
                                    <Button
                                        onClick={handleRunClick}
                                        disabled={executing !== null || !isStratifiedValid || layers.length === 0}
                                        data-testid="student-sampling-stratified-run"
                                        className="bg-amber-600 hover:bg-amber-700 text-white shadow-lg shadow-amber-500/20 w-auto px-8"
                                    >
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
                                    <div className="flex items-center gap-4 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-5">
                                        <div className="rounded-full bg-emerald-500/20 p-3">
                                            <CheckCircle2 className="w-6 h-6 text-emerald-600" />
                                        </div>
                                        <div>
                                            <p className="text-lg font-medium text-emerald-600">抽样完成</p>
                                            <p className="text-sm text-slate-600 dark:text-slate-400">
                                                按 {FIELD_LABELS[stratifyBy] || stratifyBy} 分层，共抽取 {stratifiedResult.layers?.reduce((a: number, l: { sampleCount: number }) => a + l.sampleCount, 0)} 个样本
                                                {executionTime !== null ? `，耗时 ${executionTime} ms` : ""}
                                            </p>
                                        </div>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            className="ml-auto border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800"
                                            onClick={handleRunClick}
                                            disabled={executing !== null || !isStratifiedValid || layers.length === 0}
                                            data-testid="student-sampling-stratified-rerun"
                                        >
                                            <RefreshCw className="w-4 h-4" />
                                        </Button>
                                    </div>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>

                {/* 侧栏 */}
                <div className="space-y-4">
                    <Card className="rounded-2xl border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 shadow-sm">
                        <CardHeader>
                            <div className="flex items-center justify-between">
                                <CardTitle className="text-base text-slate-800 dark:text-slate-200">抽样预览</CardTitle>
                                <Badge variant="outline" className="border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-400">分页预览</Badge>
                            </div>
                            <CardDescription className="text-slate-600 dark:text-slate-400">展示部分抽样结果数据</CardDescription>
                        </CardHeader>
                        <CardContent className="h-[300px] overflow-hidden">
                            {!stratifiedResult?.completed ? (
                                <div className="h-full flex items-center justify-center text-sm text-slate-500 italic">
                                    完成抽样后展示
                                </div>
                            ) : (
                                <SamplePreviewTable data={stratifiedResult.data ?? []} total={stratifiedResult.layers?.reduce((a: number, l: { sampleCount: number }) => a + l.sampleCount, 0) ?? 0} />
                            )}
                        </CardContent>
                    </Card>
                </div>

                {/* 分配方法对比 Modal */}
                <Dialog open={showAllocationComparison} onOpenChange={setShowAllocationComparison}>
                    <DialogContent className="bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 sm:max-w-3xl max-h-[85vh] overflow-y-auto">
                        <DialogHeader>
                            <DialogTitle className="text-slate-900 dark:text-slate-100">分配方法对比分析</DialogTitle>
                            <DialogDescription className="text-slate-600 dark:text-slate-400">不同分配方法的样本分布与效率比较</DialogDescription>
                        </DialogHeader>
                        <StratifiedAllocationComparison
                            layers={layers}
                            totalSampleSize={n}
                            numericFields={numericFields}
                            stratumStdDevs={stratumNumericStats[stratifyBy]}
                            onApplyAllocationWithOverflow={handleApplyFromComparison}
                        />
                    </DialogContent>
                </Dialog>
            </div>
        );
    },
);

