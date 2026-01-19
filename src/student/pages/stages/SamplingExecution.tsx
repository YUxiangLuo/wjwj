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
import { CheckCircle, Play, RefreshCw, Loader2 } from "lucide-react";
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

// Mock population data for demonstration
// No mock data generation function needed anymore

// Stratified layers for mock data
// No mock layers needed


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
        experimentApi.getStats(experiment?.taskId!).then(res => {
            if (res.success && res.data?.stats) {
                setPopulationStats(res.data.stats);
            }
        });
    }, [experiment?.taskId]);

    // Update layers when stratifyBy changes or stats load
    useEffect(() => {
        if (!populationStats[stratifyBy]) {
            setLayers([]);
            return;
        }

        const stats = populationStats[stratifyBy];
        const total = Object.values(stats).reduce((a, b) => a + b, 0);

        const newLayers = Object.entries(stats).map(([name, count]) => ({
            name,
            count,
            ratio: total > 0 ? parseFloat(((count / total) * 100).toFixed(1)) : 0
        }));

        setLayers(newLayers);

        // If we have saved results, use them, otherwise init with 0 or proportional
        if (initialResults?.stratified?.stratifyBy === stratifyBy && initialResults.stratified.layers) {
            // Map saved counts to new layers order
            const savedMap = new Map(initialResults.stratified.layers.map(l => [l.name, l.sampleCount]));
            setLayerSampleCounts(newLayers.map(l => savedMap.get(l.name) ?? 0));
        } else {
            // Default to proportional
            setLayerSampleCounts(newLayers.map(l => Math.round(n * l.ratio / 100)));
        }

    }, [stratifyBy, populationStats, n, initialResults?.stratified]);

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

    // Auto-save when results change
    useEffect(() => {
        if (simpleResult || systematicResult || stratifiedResult) {
            const timer = setTimeout(saveResults, 1000);
            return () => clearTimeout(timer);
        }
    }, [simpleResult, systematicResult, stratifiedResult, saveResults]);

    // Execute simple mock delay (removed)
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
    const isStratifiedValid = Math.abs(stratifiedTotal - n) <= layers.length;

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
        <div className="space-y-6">
            {/* Info header */}
            <Card>
                <CardContent className="py-4">
                    <div className="flex justify-between items-center">
                        <div>
                            <span className="text-muted-foreground">目标样本量：</span>
                            <span className="font-bold text-lg ml-1">{n}</span>
                        </div>
                        <div>
                            <span className="text-muted-foreground">总体规模：</span>
                            <span className="font-bold text-lg ml-1">{N.toLocaleString()}</span>
                        </div>
                        <div>
                            <span className="text-muted-foreground">完成进度：</span>
                            <span className="font-bold text-lg ml-1">
                                {[simpleResult?.completed, systematicResult?.completed, stratifiedResult?.completed].filter(Boolean).length}/3
                            </span>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Sampling methods tabs */}
            <Tabs defaultValue="simple" className="space-y-4">
                <TabsList className="grid w-full grid-cols-3">
                    <TabsTrigger value="simple" className="gap-2">
                        简单随机抽样
                        {simpleResult?.completed && <CheckCircle className="w-4 h-4 text-emerald-500" />}
                    </TabsTrigger>
                    <TabsTrigger value="systematic" className="gap-2">
                        系统抽样
                        {systematicResult?.completed && <CheckCircle className="w-4 h-4 text-emerald-500" />}
                    </TabsTrigger>
                    <TabsTrigger value="stratified" className="gap-2">
                        分层抽样
                        {stratifiedResult?.completed && <CheckCircle className="w-4 h-4 text-emerald-500" />}
                    </TabsTrigger>
                </TabsList>

                {/* Simple Random Sampling */}
                <TabsContent value="simple">
                    <Card>
                        <CardHeader>
                            <CardTitle>简单随机抽样</CardTitle>
                            <CardDescription>
                                从 {N.toLocaleString()} 个总体中随机抽取 {n} 个样本，每个个体被抽中的概率相等。
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            {!simpleResult?.completed ? (
                                <Button onClick={executeSimple} disabled={executing !== null}>
                                    {executing === "simple" ? (
                                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                    ) : (
                                        <Play className="w-4 h-4 mr-2" />
                                    )}
                                    执行抽样
                                </Button>
                            ) : (
                                <>
                                    <div className="p-4 bg-emerald-50 rounded-lg">
                                        <p className="text-emerald-700">✓ 抽样完成，共抽取 {simpleResult.sampleCount} 个样本</p>
                                        {simpleResult.seed && (
                                            <p className="text-xs text-emerald-600 mt-1">随机种子: {simpleResult.seed}</p>
                                        )}
                                    </div>
                                    <Button variant="outline" size="sm" onClick={executeSimple} disabled={executing !== null}>
                                        <RefreshCw className="w-4 h-4 mr-1" />
                                        重新抽样
                                    </Button>
                                    <SamplePreviewTable data={simpleResult.data ?? []} total={simpleResult.sampleCount} />
                                </>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* Systematic Sampling */}
                <TabsContent value="systematic">
                    <Card>
                        <CardHeader>
                            <CardTitle>系统抽样</CardTitle>
                            <CardDescription>
                                按固定间隔 K 从总体中抽取样本。建议 K 值：{Math.round(N / n)}
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="kValue">间隔 K 值</Label>
                                    <Input
                                        id="kValue"
                                        type="number"
                                        value={kValue}
                                        onChange={(e) => setKValue(parseInt(e.target.value) || 1)}
                                        min={1}
                                        max={N}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label>预计抽取数量</Label>
                                    <div className={`p-2 border rounded-md ${isKValid ? "" : "border-red-300 bg-red-50"}`}>
                                        <span className={isKValid ? "" : "text-red-600"}>{expectedSystematicCount}</span>
                                        {!isKValid && (
                                            <span className="text-xs text-red-500 ml-2">
                                                (应在 {Math.floor(n * 0.8)} - {Math.floor(n * 1.2)} 之间)
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {!systematicResult?.completed ? (
                                <Button onClick={executeSystematic} disabled={executing !== null || !isKValid}>
                                    {executing === "systematic" ? (
                                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                    ) : (
                                        <Play className="w-4 h-4 mr-2" />
                                    )}
                                    执行抽样
                                </Button>
                            ) : (
                                <>
                                    <div className="p-4 bg-emerald-50 rounded-lg">
                                        <p className="text-emerald-700">✓ 抽样完成，K={systematicResult.kValue}，共抽取 {systematicResult.sampleCount} 个样本</p>
                                    </div>
                                    <Button variant="outline" size="sm" onClick={executeSystematic} disabled={executing !== null || !isKValid}>
                                        <RefreshCw className="w-4 h-4 mr-1" />
                                        重新抽样
                                    </Button>
                                    <SamplePreviewTable data={systematicResult.data ?? []} total={systematicResult.sampleCount} />
                                </>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* Stratified Sampling */}
                <TabsContent value="stratified">
                    <Card>
                        <CardHeader>
                            <CardTitle>分层抽样</CardTitle>
                            <CardDescription>
                                按分层变量将总体分层，然后从各层中抽取样本。
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="space-y-2">
                                <Label>选择分层变量</Label>
                                <Select value={stratifyBy} onValueChange={setStratifyBy}>
                                    <SelectTrigger className="w-48">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
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

                            <div className="flex gap-2">
                                <Button variant="outline" size="sm" onClick={applyProportionalAllocation} disabled={layers.length === 0}>
                                    比例分配
                                </Button>
                                <Button variant="outline" size="sm" onClick={applyEqualAllocation} disabled={layers.length === 0}>
                                    等额分配
                                </Button>
                            </div>

                            <div className="border rounded-md">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>层</TableHead>
                                            <TableHead>人数 (N_h)</TableHead>
                                            <TableHead>占比</TableHead>
                                            <TableHead>样本数 (n_h)</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {layers.map((layer, index) => (
                                            <TableRow key={layer.name}>
                                                <TableCell>{layer.name}</TableCell>
                                                <TableCell>{layer.count.toLocaleString()}</TableCell>
                                                <TableCell>{layer.ratio}%</TableCell>
                                                <TableCell>
                                                    <Input
                                                        type="number"
                                                        value={layerSampleCounts[index] ?? 0}
                                                        onChange={(e) => updateLayerCount(index, parseInt(e.target.value) || 0)}
                                                        className="w-20"
                                                        min={0}
                                                    />
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                        {layers.length === 0 && (
                                            <TableRow>
                                                <TableCell colSpan={4} className="text-center text-muted-foreground h-24">
                                                    正在加载统计数据或该变量无数据...
                                                </TableCell>
                                            </TableRow>
                                        )}
                                        <TableRow>
                                            <TableCell colSpan={3} className="font-medium">合计</TableCell>
                                            <TableCell>
                                                <span className={Math.abs(stratifiedTotal - n) <= layers.length ? "text-emerald-600 font-medium" : "text-red-600"}>
                                                    {stratifiedTotal}
                                                </span>
                                                <span className="text-muted-foreground"> / {n}</span>
                                            </TableCell>
                                        </TableRow>
                                    </TableBody>
                                </Table>
                            </div>

                            {!isStratifiedValid && layers.length > 0 && (
                                <div className="p-3 bg-amber-50 text-amber-700 rounded-lg text-sm">
                                    各层样本数之和应接近目标样本量 {n}（当前：{stratifiedTotal}）
                                </div>
                            )}

                            {!stratifiedResult?.completed ? (
                                <Button onClick={executeStratified} disabled={executing !== null || !isStratifiedValid || layers.length === 0}>
                                    {executing === "stratified" ? (
                                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                    ) : (
                                        <Play className="w-4 h-4 mr-2" />
                                    )}
                                    执行抽样
                                </Button>
                            ) : (
                                <>
                                    <div className="p-4 bg-emerald-50 rounded-lg">
                                        <p className="text-emerald-700">✓ 分层抽样完成，按 {stratifyBy === "education" ? "学历" : "性别"} 分层，共抽取 {stratifiedResult.layers?.reduce((a, l) => a + l.sampleCount, 0)} 个样本</p>
                                    </div>
                                    <Button variant="outline" size="sm" onClick={executeStratified} disabled={executing !== null || !isStratifiedValid || layers.length === 0}>
                                        <RefreshCw className="w-4 h-4 mr-1" />
                                        重新抽样
                                    </Button>
                                    <SamplePreviewTable data={stratifiedResult.data ?? []} total={stratifiedResult.layers?.reduce((a, l) => a + l.sampleCount, 0) ?? 0} />
                                </>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>

            {/* Navigation */}
            <div className="flex justify-between">
                <Button variant="outline" onClick={onPrev}>
                    上一阶段
                </Button>
                <Button onClick={() => setConfirmNextOpen(true)} disabled={!allCompleted}>
                    {allCompleted ? "完成本阶段" : `请完成所有抽样方法 (${[simpleResult?.completed, systematicResult?.completed, stratifiedResult?.completed].filter(Boolean).length}/3)`}
                </Button>
            </div>

            {/* Confirm Next Stage Dialog */}
            <AlertDialog open={confirmNextOpen} onOpenChange={setConfirmNextOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>确认完成抽样执行</AlertDialogTitle>
                        <AlertDialogDescription asChild>
                            <div className="text-sm text-muted-foreground">
                                您已完成三种抽样方法的执行：
                                <ul className="list-disc list-inside mt-2">
                                    <li>简单随机抽样: {simpleResult?.sampleCount} 样本</li>
                                    <li>系统抽样: {systematicResult?.sampleCount} 样本 (K={systematicResult?.kValue})</li>
                                    <li>分层抽样: {stratifiedResult?.layers?.reduce((a, l) => a + l.sampleCount, 0)} 样本</li>
                                </ul>
                                <p className="mt-2">确认后将进入分析与报告阶段。</p>
                            </div>
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>取消</AlertDialogCancel>
                        <AlertDialogAction onClick={handleConfirmNext}>确认</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}

// Sample preview table component
function SamplePreviewTable({ data, total }: { data: unknown[]; total: number }) {
    const samples = data as Array<{ id: number; age: string; gender: string; income: string }>;

    if (samples.length === 0) return null;

    return (
        <div>
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>ID</TableHead>
                        <TableHead>年龄段</TableHead>
                        <TableHead>性别</TableHead>
                        <TableHead>收入</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {samples.slice(0, 5).map((row) => (
                        <TableRow key={row.id}>
                            <TableCell>{row.id}</TableCell>
                            <TableCell>{row.age}</TableCell>
                            <TableCell>{row.gender}</TableCell>
                            <TableCell>{row.income}</TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
            <p className="text-sm text-muted-foreground mt-2">显示前 {Math.min(5, samples.length)} 条，共 {total} 条</p>
        </div>
    );
}

export default SamplingExecution;
