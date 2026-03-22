import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { 
    Target, 
    Calculator, 
    TrendingDown, 
    Info,
    ArrowRight,
    BarChart3
} from "lucide-react";
import { calculateSampleSizeByCV, type CVBasedSampleSizeResult } from "../experiment/sample-plan";

interface CVBasedSampleSizeCalculatorProps {
    populationSize: number;
    confidenceLevel: string;
    onApplySampleSize?: (sampleSize: number) => void;
}

export function CVBasedSampleSizeCalculator({
    populationSize,
    confidenceLevel,
    onApplySampleSize
}: CVBasedSampleSizeCalculatorProps) {
    const sliderIndigo =
        "py-2 [&_[data-slot=slider-range]]:!bg-indigo-600 [&_[data-slot=slider-track]]:!bg-indigo-100 dark:[&_[data-slot=slider-track]]:!bg-indigo-950/80 [&_[data-slot=slider-thumb]]:!border-indigo-600 [&_[data-slot=slider-thumb]]:!bg-white dark:[&_[data-slot=slider-thumb]]:!bg-slate-950 [&_[data-slot=slider-thumb]]:!ring-indigo-500/25";

    const [targetCV, setTargetCV] = useState(5);  // 目标变异系数 (%)
    const [estimatedCV, setEstimatedCV] = useState(30);  // 估计变异系数 (%)
    const [designEffect, setDesignEffect] = useState(1);
    const [nonResponseRate, setNonResponseRate] = useState(0);
    const [result, setResult] = useState<CVBasedSampleSizeResult | null>(null);

    // 计算样本量
    useEffect(() => {
        const newResult = calculateSampleSizeByCV({
            confidenceLevel,
            targetCV: targetCV / 100,  // 转换为小数
            populationSize,
            estimatedCV: estimatedCV / 100,
            designEffect,
            nonResponseRate: nonResponseRate / 100,
        });
        setResult(newResult);
    }, [targetCV, estimatedCV, confidenceLevel, populationSize, designEffect, nonResponseRate]);

    return (
        <Card className="rounded-2xl border-indigo-200/90 bg-indigo-50/90 shadow-sm dark:border-indigo-900/45 dark:bg-slate-950">
            <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Target className="w-5 h-5 text-indigo-500" />
                        <CardTitle className="text-base text-indigo-900 dark:text-indigo-200">
                            基于变异系数(CV)的样本量计算
                        </CardTitle>
                    </div>
                    <Badge 
                        variant="outline" 
                        className="text-xs bg-indigo-100/50 border-indigo-200 text-indigo-700 dark:bg-indigo-900/30 dark:border-indigo-500/30 dark:text-indigo-300"
                    >
                        高级方法
                    </Badge>
                </div>
                <CardDescription className="text-slate-700 dark:text-slate-300">
                    根据目标变异系数(CV)反推所需样本量
                </CardDescription>
            </CardHeader>

            <CardContent className="space-y-4">
                {/* 说明 */}
                <div className="rounded-xl border border-teal-200/90 bg-teal-50/70 p-3 dark:border-teal-800/40 dark:bg-teal-950/25">
                    <div className="flex gap-2">
                        <Info className="w-4 h-4 text-teal-600 dark:text-teal-400 shrink-0 mt-0.5" />
                        <div className="text-xs text-teal-950 dark:text-teal-100 space-y-1">
                            <p className="font-medium">什么时候使用CV计算？</p>
                            <p>
                                当你关注估计值的<strong>相对精度</strong>（变异系数）而非绝对误差限时，
                                例如要求"估计值的变异系数不超过5%"时。
                            </p>
                        </div>
                    </div>
                </div>

                {/* 参数设置 */}
                <div className="space-y-4">
                    {/* 目标CV */}
                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <Label className="text-xs text-indigo-700 dark:text-indigo-300">
                                目标变异系数 (CV)
                            </Label>
                            <span className="text-sm font-bold tabular-nums text-teal-700 dark:text-teal-300">
                                {targetCV}%
                            </span>
                        </div>
                        <Slider
                            value={[targetCV]}
                            onValueChange={(v) => setTargetCV(v[0] ?? 5)}
                            min={1}
                            max={20}
                            step={0.5}
                            className={sliderIndigo}
                        />
                        <div className="flex justify-between text-xs text-slate-600 dark:text-slate-400">
                            <span>1% (高精度)</span>
                            <span>10% (中等)</span>
                            <span>20% (较低)</span>
                        </div>
                    </div>

                    {/* 估计CV */}
                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <Label className="text-xs text-indigo-700 dark:text-indigo-300">
                                估计总体变异系数
                            </Label>
                            <div className="flex items-center gap-1">
                                <Input
                                    type="number"
                                    value={estimatedCV}
                                    onChange={(e) => setEstimatedCV(parseFloat(e.target.value) || 0)}
                                    className="w-16 h-7 text-xs bg-white dark:bg-slate-950 border-indigo-200 dark:border-indigo-700 text-slate-900 dark:text-slate-100"
                                    min={1}
                                    max={100}
                                    step={1}
                                />
                                <span className="text-xs text-indigo-600">%</span>
                            </div>
                        </div>
                        <p className="text-xs text-indigo-800 dark:text-indigo-100">
                            基于以往调查或预调查数据估计
                        </p>
                    </div>

                    {/* 其他参数 */}
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                            <Label className="text-xs text-indigo-700 dark:text-indigo-300">设计效应</Label>
                            <Input
                                type="number"
                                value={designEffect}
                                onChange={(e) => setDesignEffect(parseFloat(e.target.value) || 1)}
                                className="bg-white dark:bg-slate-950 border-indigo-200 dark:border-indigo-700 text-slate-900 dark:text-slate-100"
                                min={0.5}
                                max={5}
                                step={0.1}
                            />
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
                            <div className="flex items-center justify-between">
                                <span className="text-sm text-slate-700 dark:text-slate-300">所需样本量</span>
                                <span className="text-2xl font-bold tabular-nums text-teal-700 dark:text-teal-300">
                                    {result.requiredSampleSize.toLocaleString()}
                                </span>
                            </div>

                            {/* 能达到的CV */}
                            <div className="flex items-center justify-between text-sm">
                                <span className="text-slate-700 dark:text-slate-300 flex items-center gap-1">
                                    <TrendingDown className="w-4 h-4 text-teal-600" />
                                    实际能达到的CV
                                </span>
                                <span className="font-mono font-bold tabular-nums text-teal-700 dark:text-teal-300">
                                    {(result.achievedCV * 100).toFixed(2)}%
                                </span>
                            </div>

                            {/* 公式展示 */}
                            <div className="rounded-lg border border-indigo-200 bg-white p-2 dark:border-indigo-800/50 dark:bg-slate-950">
                                <p className="text-xs font-mono text-indigo-900 dark:text-indigo-100">
                                    {result.formula}
                                </p>
                                <p className="text-xs text-indigo-800 dark:text-indigo-100 mt-1">
                                    目标CV={targetCV}%, 估计CV={estimatedCV}%
                                </p>
                                <p className="text-xs text-indigo-800 dark:text-indigo-100 mt-0.5">
                                    若需置信区间相对半宽，可用 Z×CV(ȳ)（{confidenceLevel}% 置信水平下 Z={result.z}）
                                </p>
                            </div>

                            {/* 对比误差限方法 */}
                            <div className="rounded-lg border border-amber-200 bg-amber-50/90 p-2 dark:border-amber-800/40 dark:bg-slate-950">
                                <div className="flex items-start gap-2 text-xs">
                                    <BarChart3 className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                                    <div className="text-amber-800 dark:text-amber-200">
                                        <span className="font-medium">CV vs 误差限：</span>
                                        CV是相对指标（变异系数 = SE/均值），适合比较不同规模总体的精度；
                                        误差限是绝对指标，适合有明确误差容忍度的场景。
                                    </div>
                                </div>
                            </div>

                            {/* 应用按钮 */}
                            {onApplySampleSize && (
                                <Button
                                    onClick={() => onApplySampleSize(result.requiredSampleSize)}
                                    className="w-full bg-indigo-600 text-white hover:bg-indigo-500"
                                >
                                    应用此样本量
                                    <ArrowRight className="w-4 h-4 ml-2" />
                                </Button>
                            )}
                        </div>
                    </div>
                )}

                {/* 参考值 */}
                <div className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-950">
                    <p className="text-xs font-medium text-slate-800 dark:text-slate-200 mb-2">常见变异系数参考</p>
                    <div className="space-y-1.5 text-xs">
                        <div className="flex justify-between">
                            <span className="text-slate-500">人口特征（如性别比例）</span>
                            <span className="text-slate-700 dark:text-slate-300">20-40%</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-slate-500">经济指标（如收入）</span>
                            <span className="text-slate-700 dark:text-slate-300">50-100%</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-slate-500">比例估计（如支持率）</span>
                            <span className="text-slate-700 dark:text-slate-300">10-30%</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-slate-500">态度量表（如满意度）</span>
                            <span className="text-slate-700 dark:text-slate-300">15-25%</span>
                        </div>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
