import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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
import { Play, Loader2, Target, BarChart3, Percent, Equal, TrendingUp } from "lucide-react";
import { experimentApi, type MethodKey } from "../api-client";
import { SamplingSuccessState } from "./SamplingSuccessState";
import { SamplePreviewTable } from "./SamplePreviewTable";
import { StratifiedAllocationComparison } from "./StratifiedAllocationComparison";
import { allocateStratifiedSampleCounts } from "./stratified-allocation";

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

export interface StratifiedLayer {
    name: string;
    count: number;
    ratio: number;
    sampleCount: number;
}

interface StratifiedResult {
    completed: boolean;
    stratifyBy: string;
    layers: Array<{ name: string; count: number; ratio: number; sampleCount: number }>;
    seed?: number;
    data?: unknown[];
}

export interface StratifiedSamplingTabProps {
    n: number;
    N: number;
    taskId: number | undefined;
    populationStats: Record<string, Record<string, number>>;
    numericFields: string[];
    stratumNumericStats: Record<string, Record<string, Record<string, { mean: number; stdDev: number }>>>;
    initialResult: StratifiedResult | null;
    executing: MethodKey | null;
    setExecuting: (method: MethodKey | null) => void;
    onResult: (result: StratifiedResult) => void;
    onAnimate: (layers: StratifiedLayer[], stratifyBy: string) => void;
    onRegisterExecute: (executeFn: () => void) => void;
    onExecutionError: () => void;
    buildSavePayload: (stratifiedResult: StratifiedResult) => void;
    executionTime: number | null;
    setExecutionTime: (ms: number) => void;
}

export function StratifiedSamplingTab({
    n,
    N,
    taskId,
    populationStats,
    numericFields,
    stratumNumericStats,
    initialResult,
    executing,
    setExecuting,
    onResult,
    onAnimate,
    onRegisterExecute,
    onExecutionError,
    buildSavePayload,
    executionTime,
    setExecutionTime,
}: StratifiedSamplingTabProps) {
    const [stratifyBy, setStratifyBy] = useState(initialResult?.stratifyBy ?? "gender");
    const [stratifiedSeed, setStratifiedSeed] = useState(initialResult?.seed ? String(initialResult.seed) : "");
    const [layers, setLayers] = useState<StratifiedLayer[]>([]);
    const [result, setResult] = useState<StratifiedResult | null>(initialResult);
    const [showAllocationComparison, setShowAllocationComparison] = useState(false);

    useEffect(() => {
        const stats = populationStats[stratifyBy];

        if (!stats) {
            if (initialResult?.stratifyBy === stratifyBy && initialResult.layers?.length) {
                setLayers(initialResult.layers.map((layer) => ({
                    name: layer.name,
                    count: layer.count,
                    ratio: Number.isFinite(layer.ratio) ? layer.ratio
                        : layer.count > 0 ? parseFloat(((layer.count / N) * 100).toFixed(1))
                        : 0,
                    sampleCount: layer.sampleCount ?? 1,
                })));
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
            sampleCount: 0,
        }));
        const defaultSampleCounts = allocateStratifiedSampleCounts({
            targetSampleSize: n,
            rawCounts: newLayers.map((layer) => n * (total > 0 ? layer.count / total : 1 / Math.max(newLayers.length, 1))),
            caps: newLayers.map((layer) => layer.count),
        });

        if (initialResult?.stratifyBy === stratifyBy && initialResult.layers) {
            const savedMap = new Map(initialResult.layers.map((l) => [l.name, l.sampleCount]));
            setLayers(newLayers.map((l, index) => ({
                ...l,
                sampleCount: savedMap.get(l.name) ?? defaultSampleCounts[index] ?? 1,
            })));
        } else {
            setLayers(newLayers.map((l, index) => ({
                ...l,
                sampleCount: defaultSampleCounts[index] ?? 1,
            })));
        }
    }, [stratifyBy, populationStats, n, N, initialResult]);

    const parseSeed = useCallback((seedText: string): { seed: number | undefined; error: string | null } => {
        const trimmed = seedText.trim();
        if (!trimmed) return { seed: undefined, error: null };
        if (!/^-?\d+$/.test(trimmed)) return { seed: undefined, error: "随机种子需为整数" };
        const parsed = Number.parseInt(trimmed, 10);
        if (!Number.isSafeInteger(parsed)) return { seed: undefined, error: "随机种子值超出安全整数范围" };
        return { seed: parsed, error: null };
    }, []);

    const stratifiedTotal = useMemo(() => layers.reduce((a, l) => a + l.sampleCount, 0), [layers]);
    const layerOverflows = useMemo(() => layers.map((l) => l.sampleCount > l.count), [layers]);
    const layerUnderflows = useMemo(() => layers.map((l) => l.sampleCount < 1), [layers]);
    const hasLayerOverflow = layerOverflows.some(Boolean);
    const hasLayerUnderflow = layerUnderflows.some(Boolean);
    const isStratifiedValid = layers.length > 0
        && stratifiedTotal === n
        && !hasLayerOverflow
        && !hasLayerUnderflow;

    const updateLayerCount = (index: number, value: number) => {
        setLayers((prev) => prev.map((l, i) => i === index ? { ...l, sampleCount: Math.max(0, value) } : l));
    };

    const applyQuickAllocation = (method: "proportional" | "equal" | "neyman") => {
        if (layers.length === 0) return;
        const totalPop = layers.reduce((a, l) => a + l.count, 0);

        let rawCounts: number[];
        if (method === "proportional") {
            rawCounts = layers.map((l) => n * (totalPop > 0 ? l.count / totalPop : 1 / layers.length));
        } else if (method === "equal") {
            rawCounts = layers.map(() => n / layers.length);
        } else {
            const weights = layers.map((l) => {
                const stdDev = stratumNumericStats[stratifyBy]?.[l.name]
                    ? Object.values(stratumNumericStats[stratifyBy]![l.name]!).reduce((max, s) => Math.max(max, s.stdDev), 0)
                    : Math.sqrt(l.count);
                return l.count * stdDev;
            });
            const totalWeight = weights.reduce((a, b) => a + b, 0);
            rawCounts = totalWeight > 0
                ? weights.map((w) => n * w / totalWeight)
                : layers.map(() => n / layers.length);
        }

        const nextCounts = allocateStratifiedSampleCounts({
            targetSampleSize: n,
            rawCounts,
            caps: layers.map((layer) => layer.count),
        });

        setLayers((prev) => prev.map((l, i) => ({ ...l, sampleCount: nextCounts[i]! })));
        const labels = { proportional: "按比例", equal: "等额", neyman: "奈曼" };
        toast.success(`已应用${labels[method]}分配`);
    };

    const executeStratified = useCallback(async () => {
        if (!taskId) return;
        setExecuting("stratified");
        const startTime = performance.now();
        const layersPayload = layers.map((l) => ({
            name: l.name,
            count: l.count,
            ratio: l.ratio,
            sampleCount: l.sampleCount,
        }));

        try {
            const { seed, error: seedError } = parseSeed(stratifiedSeed);
            if (seedError) { toast.error(seedError); setExecuting(null); return; }
            const res = await experimentApi.executeSampling(taskId, "stratified", {
                stratifyBy,
                layers: layersPayload,
                seed,
            });
            if (res.success && res.data?.result) {
                const nextResult = res.data.result as StratifiedResult;
                setResult(nextResult);
                setExecutionTime(Math.round(performance.now() - startTime));
                onResult(nextResult);
                buildSavePayload(nextResult);
            } else {
                toast.error(res.error?.message || "分层抽样执行失败");
                onExecutionError();
            }
        } catch {
            toast.error("分层抽样执行失败，请检查网络后重试");
            onExecutionError();
        } finally {
            setExecuting(null);
        }
    }, [taskId, layers, stratifiedSeed, stratifyBy, parseSeed, setExecuting, setExecutionTime, onResult, onExecutionError, buildSavePayload]);

    const executeRef = useRef(executeStratified);
    executeRef.current = executeStratified;

    useEffect(() => {
        onRegisterExecute(() => executeRef.current());
    }, [onRegisterExecute]);

    const handleAnimateAndExecute = () => {
        onAnimate(layers, stratifyBy);
    };

    const handleApplyFromComparison = (
        _method: string,
        allocation: { name: string; count: number; sampleCount: number }[],
    ) => {
        setLayers((prev) => prev.map((l) => {
            const match = allocation.find((a) => a.name === l.name);
            return match ? { ...l, sampleCount: match.sampleCount } : l;
        }));
        const hasOverflow = allocation.some((a) => a.sampleCount >= a.count);
        toast.success(`已应用分配方案${hasOverflow ? "（自动处理超额层）" : ""}`);
        setShowAllocationComparison(false);
    };

    return (
        <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <Card className="rounded-2xl border-border bg-card/50 shadow-sm">
                <CardHeader>
                    <CardTitle className="text-foreground flex items-center gap-2">
                        <div className="w-2 h-6 bg-warning rounded-full mr-2"></div>
                        分层抽样
                    </CardTitle>
                    <CardDescription className="text-muted-foreground pt-1">
                        按分层变量将总体分层，然后从各层中抽取样本。
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-5 pt-4">
                    {/* 参数区：分层变量 + 随机种子 */}
                    <div className="grid gap-4 rounded-2xl border border-border/70 bg-background/40 p-4 md:grid-cols-2 xl:grid-cols-[220px_220px_1fr] xl:items-end">
                        <div className="space-y-2">
                            <Label className="text-xs text-foreground/90">选择分层变量</Label>
                            <Select value={stratifyBy} onValueChange={setStratifyBy}>
                                <SelectTrigger data-testid="student-sampling-stratify-by" className="w-48 bg-card border-input text-foreground">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="bg-card border-border text-foreground">
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
                            <p className="text-xs leading-relaxed text-muted-foreground">
                                系统会根据该变量的总体分布，自动计算下方每层的占比。
                            </p>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="stratifiedSeed" className="text-xs text-foreground/90">随机种子（可选）</Label>
                            <Input
                                id="stratifiedSeed"
                                type="number"
                                value={stratifiedSeed}
                                onChange={(e) => setStratifiedSeed(e.target.value)}
                                placeholder="留空则每次随机"
                                data-testid="student-sampling-stratified-seed"
                                className="w-48 bg-card border-input text-foreground"
                            />
                            <p className="text-xs leading-relaxed text-muted-foreground">
                                留空时每次重新随机，填写后可复现同一组结果。
                            </p>
                        </div>
                    </div>

                    {/* 层表 */}
                    <div className="rounded-xl border border-border overflow-hidden">
                        <Table>
                            <TableHeader className="bg-background/50">
                                <TableRow className="border-border hover:bg-transparent">
                                    <TableHead className="text-muted-foreground">层 (Layer)</TableHead>
                                    <TableHead className="text-muted-foreground">人数 (N<sub>h</sub>)</TableHead>
                                    <TableHead className="text-muted-foreground">占比（自动）</TableHead>
                                    <TableHead className="text-muted-foreground w-[120px]">样本数 (n<sub>h</sub>)</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {layers.length > 0 ? layers.map((layer, index) => (
                                    <TableRow key={layer.name} className="border-border hover:bg-muted/30">
                                        <TableCell className="font-medium text-foreground/90">{layer.name}</TableCell>
                                        <TableCell className="text-muted-foreground">{layer.count.toLocaleString()}</TableCell>
                                        <TableCell className="text-muted-foreground">{layer.ratio}%</TableCell>
                                        <TableCell>
                                            <Input
                                                type="number"
                                                value={layer.sampleCount}
                                                onChange={(e) => updateLayerCount(index, parseInt(e.target.value) || 0)}
                                                data-testid={`student-sampling-layer-count-${index + 1}`}
                                                className={`w-20 h-8 bg-card text-foreground text-center ${
                                                    layerOverflows[index] || layerUnderflows[index]
                                                        ? "border-destructive"
                                                        : "border-input"
                                                }`}
                                                min={1}
                                            />
                                        </TableCell>
                                    </TableRow>
                                )) : (
                                    <TableRow>
                                        <TableCell colSpan={4} className="text-center text-muted-foreground h-32">
                                            正在加载统计数据或该变量无数据...
                                        </TableCell>
                                    </TableRow>
                                )}
                                <TableRow className="bg-background/30 border-t border-input font-medium hover:bg-background/30">
                                    <TableCell colSpan={3} className="text-right text-foreground/90 pr-4">合计 Total</TableCell>
                                    <TableCell>
                                        <div className="flex items-center gap-2">
                                            <span className={isStratifiedValid ? "text-success" : "text-destructive"}>
                                                {stratifiedTotal}
                                            </span>
                                            <span className="text-muted-foreground text-xs">/ {n}</span>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            </TableBody>
                        </Table>
                    </div>

                    {/* 校验提示 */}
                    {!isStratifiedValid && layers.length > 0 && (
                        <div className="p-3 bg-warning/10 text-warning border border-warning/20 rounded-xl text-xs flex items-center gap-2">
                            <Target className="w-4 h-4 shrink-0" />
                            {hasLayerOverflow
                                ? "部分层的样本数超过了该层总体人数，请调整"
                                : hasLayerUnderflow
                                    ? "每层样本数至少为 1"
                                    : `各层样本数之和必须等于目标样本量 ${n}（当前：${stratifiedTotal}）`}
                        </div>
                    )}

                    {/* 快捷分配按钮 */}
                    {layers.length > 0 && (
                        <div className="flex flex-wrap items-center gap-2">
                            <span className="text-xs text-muted-foreground mr-1">快捷分配:</span>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => applyQuickAllocation("proportional")}
                                className="h-7 text-xs border-warning text-warning hover:bg-warning/10"
                            >
                                <Percent className="w-3 h-3 mr-1" />
                                按比例
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => applyQuickAllocation("equal")}
                                className="h-7 text-xs border-warning text-warning hover:bg-warning/10"
                            >
                                <Equal className="w-3 h-3 mr-1" />
                                等额
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => applyQuickAllocation("neyman")}
                                className="h-7 text-xs border-warning text-warning hover:bg-warning/10"
                            >
                                <TrendingUp className="w-3 h-3 mr-1" />
                                奈曼
                            </Button>
                            <div className="flex-1" />
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setShowAllocationComparison(true)}
                                className="h-7 text-xs border-auxiliary-border text-auxiliary-strong hover:bg-auxiliary-muted"
                            >
                                <BarChart3 className="w-3 h-3 mr-1" />
                                对比分析全部方法
                            </Button>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* 底部区：执行按钮 + 预览 */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <div className="lg:col-span-1 flex items-stretch">
                    <Card className="rounded-2xl border-border bg-card/50 shadow-sm w-full flex flex-col justify-center">
                        <CardContent className="py-6 px-6">
                            {!result?.completed ? (
                                <div className="text-center space-y-3">
                                    <p className="text-sm text-muted-foreground">确认各层样本数后执行</p>
                                    <Button
                                        onClick={handleAnimateAndExecute}
                                        disabled={executing !== null || !isStratifiedValid || layers.length === 0}
                                        data-testid="student-sampling-stratified-run"
                                        className="bg-warning hover:bg-warning text-warning-foreground shadow-lg shadow-warning/20 w-full"
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
                                <SamplingSuccessState
                                    summary={`按 ${FIELD_LABELS[stratifyBy] || stratifyBy} 分层，共抽取 ${result.layers?.reduce((a, l) => a + l.sampleCount, 0)} 个样本${executionTime !== null ? `，耗时 ${executionTime} ms` : ""}`}
                                    onRerun={handleAnimateAndExecute}
                                    disabled={executing !== null || !isStratifiedValid || layers.length === 0}
                                    rerunTestId="student-sampling-stratified-rerun"
                                />
                            )}
                        </CardContent>
                    </Card>
                </div>
                <div className="lg:col-span-2">
                    <Card className="rounded-2xl border-border bg-card/50 shadow-sm h-full">
                        <CardHeader>
                            <div className="flex items-center justify-between">
                                <CardTitle className="text-base text-foreground">抽样预览</CardTitle>
                                <Badge variant="outline" className="border-input text-muted-foreground">分页预览</Badge>
                            </div>
                            <CardDescription className="text-muted-foreground">展示部分抽样结果数据</CardDescription>
                        </CardHeader>
                        <CardContent className="h-[300px] overflow-hidden">
                            {!result?.completed ? (
                                <div className="h-full flex items-center justify-center text-sm text-muted-foreground italic">
                                    完成抽样后展示
                                </div>
                            ) : (
                                <SamplePreviewTable
                                    data={result.data ?? []}
                                    total={result.layers?.reduce((a, l) => a + l.sampleCount, 0) ?? 0}
                                />
                            )}
                        </CardContent>
                    </Card>
                </div>
            </div>

            {/* 分配方法对比 Dialog */}
            <Dialog open={showAllocationComparison} onOpenChange={setShowAllocationComparison}>
                <DialogContent className="bg-card border-border text-foreground sm:max-w-3xl max-h-[85vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle className="text-foreground">分配方法对比分析</DialogTitle>
                        <DialogDescription className="text-muted-foreground">不同分配方法的样本分布与效率比较</DialogDescription>
                    </DialogHeader>
                    <StratifiedAllocationComparison
                        layers={layers}
                        totalSampleSize={n}
                        numericFields={numericFields}
                        stratumStdDevs={stratumNumericStats[stratifyBy]}
                        onApplyAllocation={(allocation) => handleApplyFromComparison("", allocation)}
                    />
                </DialogContent>
            </Dialog>
        </div>
    );
}
