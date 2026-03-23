import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { 
    Users, 
    Calculator, 
    Layers, 
    Info,
    ArrowRight,
    AlertTriangle
} from "lucide-react";
import { calculateClusterSamplingSize, type ClusterSamplingResult } from "../experiment/sample-plan";
import { nonResponseDecimalToFormPercent } from "./inherit-planning-params";

interface ClusterSamplingCalculatorProps {
    populationSize: number;
    /** 决策面板传入，作为本工具内可改的初值 */
    confidenceLevel: string;
    marginOfError: number;
    /** 与决策面板一致，小数形式 0～1（如 0.1 表示 10%） */
    initialNonResponseRate?: number;
    onApplyResult?: (clusters: number, sampleSize: number) => void;
}

export function ClusterSamplingCalculator({
    populationSize,
    confidenceLevel,
    marginOfError,
    initialNonResponseRate,
    onApplyResult
}: ClusterSamplingCalculatorProps) {
    const sliderIndigo =
        "py-2 [&_[data-slot=slider-range]]:!bg-indigo-600 [&_[data-slot=slider-track]]:!bg-indigo-100 dark:[&_[data-slot=slider-track]]:!bg-indigo-950/80 [&_[data-slot=slider-thumb]]:!border-indigo-600 [&_[data-slot=slider-thumb]]:!bg-white dark:[&_[data-slot=slider-thumb]]:!bg-slate-950 [&_[data-slot=slider-thumb]]:!ring-indigo-500/25";

    const [confidenceLevelLocal, setConfidenceLevelLocal] = useState(() => confidenceLevel);
    const [marginOfErrorLocal, setMarginOfErrorLocal] = useState(() => marginOfError);

    const [clusterSize, setClusterSize] = useState(50);  // 群规模（每群平均人数）
    const [deff, setDeff] = useState(2.0);  // 设计效应
    const [nonResponseRate, setNonResponseRate] = useState(() =>
        nonResponseDecimalToFormPercent(initialNonResponseRate),
    );
    const [result, setResult] = useState<ClusterSamplingResult | null>(null);

    // 父级决策参数变化时同步本地
    useEffect(() => {
        setConfidenceLevelLocal(confidenceLevel);
    }, [confidenceLevel]);
    useEffect(() => {
        setMarginOfErrorLocal(marginOfError);
    }, [marginOfError]);
    useEffect(() => {
        setNonResponseRate(nonResponseDecimalToFormPercent(initialNonResponseRate));
    }, [initialNonResponseRate]);

    // 计算整群抽样
    useEffect(() => {
        const newResult = calculateClusterSamplingSize({
            populationSize,
            confidenceLevel: confidenceLevelLocal,
            marginOfError: marginOfErrorLocal,
            clusterSize,
            deff,
            nonResponseRate: nonResponseRate / 100,
        });
        setResult(newResult);
    }, [populationSize, confidenceLevelLocal, marginOfErrorLocal, clusterSize, deff, nonResponseRate]);

    return (
        <Card className="rounded-2xl border-indigo-200/90 bg-indigo-50/90 shadow-sm dark:border-indigo-900/45 dark:bg-slate-950">
            <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Layers className="w-5 h-5 text-indigo-500" />
                        <CardTitle className="text-base text-indigo-900 dark:text-indigo-200">
                            整群抽样样本量计算
                        </CardTitle>
                    </div>
                    <Badge 
                        variant="outline" 
                        className="text-xs bg-indigo-100/50 border-indigo-200 text-indigo-700 dark:bg-indigo-900/30 dark:border-indigo-500/30 dark:text-indigo-300"
                    >
                        设计效应应用
                    </Badge>
                </div>
                <CardDescription className="text-slate-700 dark:text-slate-300">
                    计算整群抽样中所需群数和总样本量
                </CardDescription>
            </CardHeader>

            <CardContent className="space-y-4">
                {/* 说明 */}
                <div className="rounded-xl border border-teal-200/90 bg-teal-50/70 p-3 dark:border-teal-800/40 dark:bg-teal-950/25">
                    <div className="flex gap-2">
                        <Info className="w-4 h-4 text-teal-600 dark:text-teal-400 shrink-0 mt-0.5" />
                        <div className="text-xs text-teal-950 dark:text-teal-100 space-y-1">
                            <p className="font-medium">什么是整群抽样？</p>
                            <p>
                                整群抽样以"群"为单位抽样（如整栋居民楼、整个班级），群内所有单元都调查。
                                由于群内单元通常同质性高，需要更大的样本量来补偿（设计效应 deff &gt; 1）。
                            </p>
                        </div>
                    </div>
                </div>

                {/* 参数设置 */}
                <div className="space-y-4">
                    {/* 群规模 */}
                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <Label className="text-xs text-indigo-700 dark:text-indigo-300">
                                平均群规模（每群人数）
                            </Label>
                            <span className="text-sm font-bold text-indigo-900 dark:text-indigo-100">
                                {clusterSize} 人
                            </span>
                        </div>
                        <Slider
                            value={[clusterSize]}
                            onValueChange={(v) => setClusterSize(v[0] ?? 50)}
                            min={10}
                            max={500}
                            step={10}
                            className={sliderIndigo}
                        />
                        <p className="text-xs text-slate-600 dark:text-slate-400">
                            例如：每栋楼平均50户、每班平均30名学生
                        </p>
                    </div>

                    {/* 设计效应 */}
                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <Label className="text-xs text-indigo-700 dark:text-indigo-300">
                                设计效应 (deff)
                            </Label>
                            <span className="text-sm font-bold text-indigo-900 dark:text-indigo-100">
                                {deff.toFixed(1)}
                            </span>
                        </div>
                        <Slider
                            value={[deff]}
                            onValueChange={(v) => setDeff(v[0] ?? 2)}
                            min={1}
                            max={5}
                            step={0.1}
                            className={sliderIndigo}
                        />
                        <div className="flex justify-between text-xs text-slate-600 dark:text-slate-400">
                            <span>1.0 (简单随机)</span>
                            <span>2.0 (中等)</span>
                            <span>5.0 (高度聚集)</span>
                        </div>
                    </div>

                    {/* 其他参数（继承决策面板，可在本工具内调整） */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                            <Label className="text-xs text-indigo-700 dark:text-indigo-300">置信水平</Label>
                            <Select value={confidenceLevelLocal} onValueChange={setConfidenceLevelLocal}>
                                <SelectTrigger className="h-9 text-sm bg-white dark:bg-slate-950 border-indigo-200 dark:border-indigo-800">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="90">90%</SelectItem>
                                    <SelectItem value="95">95%</SelectItem>
                                    <SelectItem value="99">99%</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1.5">
                            <div className="flex justify-between">
                                <Label className="text-xs text-indigo-700 dark:text-indigo-300">允许误差</Label>
                                <span className="text-xs font-bold text-teal-600 dark:text-teal-400 tabular-nums">
                                    ±{marginOfErrorLocal}%
                                </span>
                            </div>
                            <Slider
                                value={[marginOfErrorLocal]}
                                onValueChange={([v]) => v != null && setMarginOfErrorLocal(v)}
                                min={1}
                                max={10}
                                step={1}
                                className={sliderIndigo}
                            />
                        </div>
                    </div>

                    <div className="space-y-1">
                        <Label className="text-xs text-indigo-700 dark:text-indigo-300">无回答率 (%)</Label>
                        <Input
                            type="number"
                            value={nonResponseRate}
                            onChange={(e) => setNonResponseRate(parseFloat(e.target.value) || 0)}
                            className="bg-white dark:bg-slate-950 border-indigo-200 dark:border-indigo-700 text-slate-900 dark:text-slate-100"
                            min={0}
                            max={50}
                            step={1}
                        />
                    </div>
                </div>

                {/* 计算结果 */}
                {result && (
                    <div className="rounded-xl border-2 border-indigo-300 bg-white p-4 shadow-sm dark:border-indigo-700/50 dark:bg-slate-950">
                        <div className="flex items-center gap-2 mb-4">
                            <Calculator className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                            <span className="font-bold text-indigo-900 dark:text-indigo-100">计算结果</span>
                        </div>

                        <div className="space-y-4">
                            {/* 主要结果 */}
                            <div className="grid grid-cols-2 gap-4">
                                <div className="text-center p-3 rounded-lg bg-white border border-indigo-200/80 dark:border-indigo-800/40 dark:bg-slate-950">
                                    <div className="text-xs text-indigo-600 dark:text-indigo-400 mb-1">所需群数</div>
                                    <div className="text-2xl font-bold tabular-nums text-indigo-800 dark:text-indigo-200">
                                        {result.requiredClusters}
                                    </div>
                                    <div className="text-xs text-indigo-500">个群</div>
                                </div>
                                <div className="text-center p-3 rounded-lg bg-white border border-indigo-200/80 dark:border-indigo-800/40 dark:bg-slate-950">
                                    <div className="text-xs text-indigo-600 dark:text-indigo-400 mb-1">总样本量</div>
                                    <div className="text-2xl font-bold tabular-nums text-teal-700 dark:text-teal-300">
                                        {result.requiredSampleSize.toLocaleString()}
                                    </div>
                                    <div className="text-xs text-indigo-500">人</div>
                                </div>
                            </div>

                            {/* 设计效应说明 */}
                            <div className="rounded-lg border border-indigo-200 bg-white p-3 dark:border-indigo-800/50 dark:bg-slate-950">
                                <div className="space-y-2 text-sm">
                                    <div className="flex items-center justify-between">
                                        <span className="text-indigo-700 dark:text-indigo-300">设计效应 (deff)</span>
                                        <span className="font-mono font-bold text-indigo-900 dark:text-indigo-100">
                                            {result.deff.toFixed(2)}
                                        </span>
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <span className="text-indigo-700 dark:text-indigo-300">估计群内相关系数 (ρ)</span>
                                        <span className="font-mono font-bold text-indigo-900 dark:text-indigo-100">
                                            {result.intraClassCorrelation.toFixed(3)}
                                        </span>
                                    </div>
                                </div>
                            </div>

                            {/* 公式解释 */}
                            <div className="rounded-lg border border-amber-200 bg-amber-50/90 p-2 dark:border-amber-800/40 dark:bg-slate-950">
                                <div className="flex items-start gap-2">
                                    <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                                    <p className="text-xs text-amber-800 dark:text-amber-200">
                                        {result.explanation} 群内相关系数 ρ = (deff-1)/(M-1)，
                                        其中 M={clusterSize} 为群规模。ρ 越大说明群内同质性越高，
                                        需要的补偿样本量越大。
                                    </p>
                                </div>
                            </div>

                            {/* 应用按钮 */}
                            {onApplyResult && (
                                <>
                                    <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                                        「应用」仅将总样本量写入最终样本量。若本工具内参数与左侧不一致，理解此 n 时以本工具为准；左侧不会随本工具更新，勿用左侧参数代回标准公式验算。
                                    </p>
                                    <Button
                                        onClick={() => onApplyResult(result.requiredClusters, result.requiredSampleSize)}
                                        className="w-full bg-indigo-600 text-white hover:bg-indigo-500"
                                    >
                                        应用整群抽样方案
                                        <ArrowRight className="w-4 h-4 ml-2" />
                                    </Button>
                                </>
                            )}
                        </div>
                    </div>
                )}

                {/* 参考值 */}
                <div className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-950">
                    <p className="text-xs font-medium text-slate-800 dark:text-slate-200 mb-2">设计效应参考</p>
                    <div className="space-y-1.5 text-xs">
                        <div className="flex justify-between">
                            <span className="text-slate-500">简单随机抽样 (SRS)</span>
                            <span className="text-slate-700 dark:text-slate-300 font-bold">1.0</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-slate-500">分层抽样（层内同质）</span>
                            <span className="text-emerald-600 dark:text-emerald-400 font-bold">0.7-0.9</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-slate-500">整群抽样（中等聚集）</span>
                            <span className="text-amber-600 dark:text-amber-400 font-bold">1.5-2.5</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-slate-500">整群抽样（高度聚集）</span>
                            <span className="text-rose-600 dark:text-rose-400 font-bold">3.0-5.0</span>
                        </div>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
