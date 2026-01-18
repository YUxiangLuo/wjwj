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
import type { SamplingResultsData, SamplePlanData } from "../../api-client";

interface SamplingExecutionProps {
    onNext: () => void;
    onPrev: () => void;
}

type SamplingMethod = "simple" | "systematic" | "stratified";

// Mock population data for demonstration
function generateMockSample(count: number): unknown[] {
    const genders = ["男", "女"];
    const incomes = ["3000以下", "3000-5000", "5000-8000", "8000-12000", "12000-20000", "20000以上"];
    const ages = ["18-25", "26-35", "36-45", "46-55", "56以上"];

    return Array.from({ length: count }, (_, i) => ({
        id: i + 1,
        age: ages[Math.floor(Math.random() * ages.length)],
        gender: genders[Math.floor(Math.random() * genders.length)],
        income: incomes[Math.floor(Math.random() * incomes.length)],
    }));
}

// Stratified layers for mock data
const mockLayers = [
    { name: "18-25岁", count: 2500, ratio: 25 },
    { name: "26-35岁", count: 3500, ratio: 35 },
    { name: "36-45岁", count: 2500, ratio: 25 },
    { name: "46岁以上", count: 1500, ratio: 15 },
];

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
    const [stratifyBy, setStratifyBy] = useState(initialResults?.stratified?.stratifyBy ?? "age");
    const [layerSampleCounts, setLayerSampleCounts] = useState<number[]>(
        initialResults?.stratified?.layers?.map(l => l.sampleCount) ?? mockLayers.map(l => Math.round(n * l.ratio / 100))
    );

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

    // Execute sampling with mock delay
    const executeSimple = async () => {
        setExecuting("simple");
        await new Promise(resolve => setTimeout(resolve, 800));

        const sample = generateMockSample(n);
        setSimpleResult({
            completed: true,
            sampleCount: n,
            seed: Math.floor(Math.random() * 1000000),
            data: sample.slice(0, 20),
        });
        setExecuting(null);
    };

    const executeSystematic = async () => {
        setExecuting("systematic");
        await new Promise(resolve => setTimeout(resolve, 600));

        const actualCount = Math.ceil(N / kValue);
        const sample = generateMockSample(actualCount);
        setSystematicResult({
            completed: true,
            kValue,
            sampleCount: actualCount,
            data: sample.slice(0, 20),
        });
        setExecuting(null);
    };

    const executeStratified = async () => {
        setExecuting("stratified");
        await new Promise(resolve => setTimeout(resolve, 1000));

        const totalSampleCount = layerSampleCounts.reduce((a, b) => a + b, 0);
        const layers = mockLayers.map((layer, i) => ({
            name: layer.name,
            count: layer.count,
            ratio: layer.ratio,
            sampleCount: layerSampleCounts[i] ?? 0,
        }));

        setStratifiedResult({
            completed: true,
            stratifyBy,
            layers,
            data: generateMockSample(totalSampleCount).slice(0, 20),
        });
        setExecuting(null);
    };

    // Validation
    const expectedSystematicCount = Math.ceil(N / kValue);
    const isKValid = kValue >= 1 && kValue <= N &&
        expectedSystematicCount >= n * 0.8 && expectedSystematicCount <= n * 1.2;

    const stratifiedTotal = layerSampleCounts.reduce((a, b) => a + b, 0);
    const isStratifiedValid = stratifiedTotal === n;

    const allCompleted = simpleResult?.completed && systematicResult?.completed && stratifiedResult?.completed;

    const handleConfirmNext = async () => {
        await saveResults();
        await saveExperiment({ currentStage: 4 });
        onNext();
    };

    // Allocation helpers
    const applyProportionalAllocation = () => {
        setLayerSampleCounts(mockLayers.map(l => Math.round(n * l.ratio / 100)));
    };

    const applyEqualAllocation = () => {
        const equalCount = Math.floor(n / mockLayers.length);
        const remainder = n % mockLayers.length;
        setLayerSampleCounts(mockLayers.map((_, i) => equalCount + (i < remainder ? 1 : 0)));
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
                                        <SelectItem value="age">年龄段</SelectItem>
                                        <SelectItem value="gender">性别</SelectItem>
                                        <SelectItem value="income">收入水平</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="flex gap-2">
                                <Button variant="outline" size="sm" onClick={applyProportionalAllocation}>
                                    比例分配
                                </Button>
                                <Button variant="outline" size="sm" onClick={applyEqualAllocation}>
                                    等额分配
                                </Button>
                            </div>

                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>层</TableHead>
                                        <TableHead>人数</TableHead>
                                        <TableHead>占比</TableHead>
                                        <TableHead>样本数</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {mockLayers.map((layer, index) => (
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
                                    <TableRow>
                                        <TableCell colSpan={3} className="font-medium">合计</TableCell>
                                        <TableCell>
                                            <span className={stratifiedTotal === n ? "text-emerald-600 font-medium" : "text-red-600"}>
                                                {stratifiedTotal}
                                            </span>
                                            <span className="text-muted-foreground"> / {n}</span>
                                        </TableCell>
                                    </TableRow>
                                </TableBody>
                            </Table>

                            {!isStratifiedValid && (
                                <div className="p-3 bg-amber-50 text-amber-700 rounded-lg text-sm">
                                    各层样本数之和必须等于目标样本量 {n}（当前：{stratifiedTotal}）
                                </div>
                            )}

                            {!stratifiedResult?.completed ? (
                                <Button onClick={executeStratified} disabled={executing !== null || !isStratifiedValid}>
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
                                        <p className="text-emerald-700">✓ 分层抽样完成，按 {stratifyBy === "age" ? "年龄段" : stratifyBy === "gender" ? "性别" : "收入水平"} 分层，共抽取 {stratifiedResult.layers?.reduce((a, l) => a + l.sampleCount, 0)} 个样本</p>
                                    </div>
                                    <Button variant="outline" size="sm" onClick={executeStratified} disabled={executing !== null || !isStratifiedValid}>
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
