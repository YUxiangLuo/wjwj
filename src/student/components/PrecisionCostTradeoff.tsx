import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { 
    DollarSign, 
    TrendingUp, 
    AlertCircle, 
    Target, 
    Calculator,
    Info,
    ChevronRight
} from "lucide-react";
import { calculateFinitePopulationSampleSize, calculateSampleSizeMetrics } from "../experiment/sample-plan";

interface CostScenario {
    id: string;
    name: string;
    fixedCost: number;           // 固定成本（培训、督导等）
    variableCostPerUnit: number; // 单位样本成本（元/样本）
    totalBudget: number;         // 总预算
}

interface PrecisionCostTradeoffProps {
    populationSize: number;
    confidenceLevel: string;
    designEffect: number;
    nonResponseRate: number;
    onApplyBudget: (budget: number, maxSampleSize: number) => void;
}

const PRESET_SCENARIOS: CostScenario[] = [
    {
        id: "phone",
        name: "电话调查",
        fixedCost: 5000,
        variableCostPerUnit: 15,
        totalBudget: 50000,
    },
    {
        id: "face",
        name: "面对面访谈",
        fixedCost: 10000,
        variableCostPerUnit: 80,
        totalBudget: 200000,
    },
    {
        id: "online",
        name: "线上问卷",
        fixedCost: 2000,
        variableCostPerUnit: 5,
        totalBudget: 30000,
    },
];

export function PrecisionCostTradeoff({ 
    populationSize,
    confidenceLevel,
    designEffect,
    nonResponseRate,
    onApplyBudget
}: PrecisionCostTradeoffProps) {
    const [selectedScenario, setSelectedScenario] = useState<CostScenario>(PRESET_SCENARIOS[0]!);
    const [customScenario, setCustomScenario] = useState<CostScenario>({
        id: "custom",
        name: "自定义",
        fixedCost: 5000,
        variableCostPerUnit: 20,
        totalBudget: 50000,
    });
    const [useCustom, setUseCustom] = useState(false);
    const [targetMarginOfError, setTargetMarginOfError] = useState(5);

    const currentScenario = useCustom ? customScenario : selectedScenario;

    // 计算预算约束下的最大样本量
    const maxFeasibleSampleSize = useMemo(() => {
        const { fixedCost, variableCostPerUnit, totalBudget } = currentScenario;
        if (variableCostPerUnit <= 0) return populationSize;
        const maxSample = Math.floor((totalBudget - fixedCost) / variableCostPerUnit);
        return Math.min(maxSample, populationSize);
    }, [currentScenario, populationSize]);

    // 计算预算约束下的精度
    const achievablePrecision = useMemo(() => {
        if (maxFeasibleSampleSize <= 0) return null;
        
        const metrics = calculateSampleSizeMetrics({
            confidenceLevel,
            marginOfError: 5,  // 默认值，会被覆盖
            populationSize,
            designEffect,
            nonResponseRate,
        });

        // 反向计算误差限：从样本量反推
        // n = (Z² * p * (1-p)) / E² * adjustment
        // E = sqrt((Z² * p * (1-p)) / n * adjustment)
        const z = confidenceLevel === "90" ? 1.645 : confidenceLevel === "95" ? 1.96 : 2.576;
        const p = 0.5;
        
        // 考虑有限总体校正
        const n0 = (Math.pow(z, 2) * p * (1 - p)) / Math.pow(0.05, 2);
        const n1 = maxFeasibleSampleSize;
        
        // 反推误差限
        const effectiveN = n1 / (designEffect / (1 - nonResponseRate));
        const marginOfError = Math.sqrt((Math.pow(z, 2) * p * (1 - p)) / effectiveN) * 100;

        return {
            marginOfError: Math.min(marginOfError, 50), // 最大50%
            sampleSize: maxFeasibleSampleSize,
            totalCost: currentScenario.fixedCost + maxFeasibleSampleSize * currentScenario.variableCostPerUnit,
        };
    }, [maxFeasibleSampleSize, confidenceLevel, populationSize, designEffect, nonResponseRate, currentScenario]);

    // 生成精度-成本曲线数据
    const curveData = useMemo(() => {
        const points: Array<{ sampleSize: number; marginOfError: number; totalCost: number }> = [];
        
        const sampleSizes = [30, 50, 100, 200, 300, 500, 800, 1000, 1500, 2000, 3000, 5000];
        const z = confidenceLevel === "90" ? 1.645 : confidenceLevel === "95" ? 1.96 : 2.576;
        const p = 0.5;

        sampleSizes.forEach(n => {
            if (n <= populationSize) {
                // 计算误差限
                const effectiveN = n / (designEffect / (1 - nonResponseRate));
                const marginOfError = Math.sqrt((Math.pow(z, 2) * p * (1 - p)) / effectiveN) * 100;
                
                // 计算成本
                const totalCost = currentScenario.fixedCost + n * currentScenario.variableCostPerUnit;
                
                points.push({
                    sampleSize: n,
                    marginOfError: Math.min(marginOfError, 50),
                    totalCost,
                });
            }
        });

        return points;
    }, [populationSize, confidenceLevel, designEffect, nonResponseRate, currentScenario]);

    // 计算目标精度所需的样本量和成本
    const targetAnalysis = useMemo(() => {
        const requiredSampleSize = calculateFinitePopulationSampleSize({
            confidenceLevel,
            marginOfError: targetMarginOfError,
            populationSize,
            designEffect,
            nonResponseRate,
        }) ?? 0;

        const totalCost = currentScenario.fixedCost + requiredSampleSize * currentScenario.variableCostPerUnit;
        const isFeasible = totalCost <= currentScenario.totalBudget;

        return {
            requiredSampleSize,
            totalCost,
            isFeasible,
            budgetGap: totalCost - currentScenario.totalBudget,
        };
    }, [targetMarginOfError, confidenceLevel, populationSize, designEffect, nonResponseRate, currentScenario]);

    return (
        <Card className="rounded-2xl border-amber-200 bg-amber-50/80 shadow-sm dark:border-amber-500/20 dark:bg-amber-500/10">
            <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <DollarSign className="w-5 h-5 text-amber-500" />
                        <CardTitle className="text-base text-amber-900 dark:text-amber-200">
                            精度与成本权衡
                        </CardTitle>
                    </div>
                </div>
                <CardDescription className="text-amber-700 dark:text-amber-300">
                    在给定预算约束下，评估可达到的精度水平
                </CardDescription>
            </CardHeader>

            <CardContent className="space-y-4">
                {/* 场景选择 */}
                <div className="space-y-2">
                    <Label className="text-xs text-amber-700 dark:text-amber-300">调查场景</Label>
                    <div className="grid grid-cols-3 gap-2">
                        {PRESET_SCENARIOS.map(scenario => (
                            <Button
                                key={scenario.id}
                                variant={!useCustom && selectedScenario.id === scenario.id ? "default" : "outline"}
                                size="sm"
                                onClick={() => {
                                    setSelectedScenario(scenario);
                                    setUseCustom(false);
                                }}
                                className={`text-xs h-auto py-2 ${
                                    !useCustom && selectedScenario.id === scenario.id
                                        ? "bg-amber-500 text-white hover:bg-amber-600"
                                        : "border-amber-300 text-amber-700 hover:bg-amber-50 dark:border-amber-700 dark:text-amber-400 dark:hover:bg-amber-900/30"
                                }`}
                            >
                                {scenario.name}
                            </Button>
                        ))}
                    </div>
                    <Button
                        variant={useCustom ? "default" : "outline"}
                        size="sm"
                        onClick={() => setUseCustom(true)}
                        className={`w-full text-xs ${
                            useCustom
                                ? "bg-amber-500 text-white hover:bg-amber-600"
                                : "border-amber-300 text-amber-700 hover:bg-amber-50 dark:border-amber-700 dark:text-amber-400 dark:hover:bg-amber-900/30"
                        }`}
                    >
                        自定义成本参数
                    </Button>
                </div>

                {/* 自定义参数 */}
                {useCustom && (
                    <div className="space-y-3 p-3 rounded-xl border border-amber-200 bg-white/50 dark:border-amber-700/50 dark:bg-amber-950/30">
                        <div className="space-y-2">
                            <Label className="text-xs text-amber-700 dark:text-amber-300">固定成本（元）</Label>
                            <Input
                                type="number"
                                value={customScenario.fixedCost}
                                onChange={(e) => setCustomScenario({
                                    ...customScenario,
                                    fixedCost: parseInt(e.target.value) || 0
                                })}
                                className="bg-white dark:bg-amber-950 border-amber-200 dark:border-amber-700"
                            />
                            <p className="text-xs text-amber-600/60">培训、督导、设备等固定支出</p>
                        </div>
                        <div className="space-y-2">
                            <Label className="text-xs text-amber-700 dark:text-amber-300">单位样本成本（元/样本）</Label>
                            <Input
                                type="number"
                                value={customScenario.variableCostPerUnit}
                                onChange={(e) => setCustomScenario({
                                    ...customScenario,
                                    variableCostPerUnit: parseInt(e.target.value) || 0
                                })}
                                className="bg-white dark:bg-amber-950 border-amber-200 dark:border-amber-700"
                            />
                            <p className="text-xs text-amber-600/60">每个样本的调查费用（访问费、礼品等）</p>
                        </div>
                        <div className="space-y-2">
                            <Label className="text-xs text-amber-700 dark:text-amber-300">总预算（元）</Label>
                            <Input
                                type="number"
                                value={customScenario.totalBudget}
                                onChange={(e) => setCustomScenario({
                                    ...customScenario,
                                    totalBudget: parseInt(e.target.value) || 0
                                })}
                                className="bg-white dark:bg-amber-950 border-amber-200 dark:border-amber-700"
                            />
                        </div>
                    </div>
                )}

                {/* 当前场景摘要 */}
                <div className="rounded-xl border border-amber-200 bg-white/50 p-3 dark:border-amber-700/50 dark:bg-amber-950/30 space-y-2">
                    <div className="flex justify-between text-sm">
                        <span className="text-amber-700 dark:text-amber-300">固定成本</span>
                        <span className="font-mono text-amber-900 dark:text-amber-100">
                            ¥{currentScenario.fixedCost.toLocaleString()}
                        </span>
                    </div>
                    <div className="flex justify-between text-sm">
                        <span className="text-amber-700 dark:text-amber-300">单位成本</span>
                        <span className="font-mono text-amber-900 dark:text-amber-100">
                            ¥{currentScenario.variableCostPerUnit}/样本
                        </span>
                    </div>
                    <div className="flex justify-between text-sm font-medium">
                        <span className="text-amber-700 dark:text-amber-300">总预算</span>
                        <span className="font-mono text-amber-900 dark:text-amber-100">
                            ¥{currentScenario.totalBudget.toLocaleString()}
                        </span>
                    </div>
                </div>

                {/* 预算约束分析 */}
                <div className="rounded-xl border-2 border-amber-300 bg-amber-50 p-4 dark:border-amber-500/40 dark:bg-amber-900/30">
                    <div className="flex items-center gap-2 mb-3">
                        <Target className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                        <span className="font-bold text-amber-900 dark:text-amber-100">预算约束分析</span>
                    </div>

                    <div className="space-y-3">
                        <div className="flex justify-between items-center">
                            <span className="text-sm text-amber-700 dark:text-amber-300">预算可支持的最大样本量</span>
                            <span className="text-xl font-bold text-amber-600 dark:text-amber-400">
                                {maxFeasibleSampleSize.toLocaleString()}
                            </span>
                        </div>

                        {achievablePrecision && (
                            <>
                                <div className="flex justify-between items-center">
                                    <span className="text-sm text-amber-700 dark:text-amber-300">可达到的最佳精度</span>
                                    <span className="text-lg font-bold text-emerald-600 dark:text-emerald-400">
                                        ±{achievablePrecision.marginOfError.toFixed(1)}%
                                    </span>
                                </div>
                                <div className="flex justify-between items-center text-sm">
                                    <span className="text-amber-700 dark:text-amber-300">实际总成本</span>
                                    <span className="font-mono text-amber-900 dark:text-amber-100">
                                        ¥{achievablePrecision.totalCost.toLocaleString()}
                                    </span>
                                </div>
                            </>
                        )}
                    </div>

                    {achievablePrecision && achievablePrecision.totalCost > currentScenario.totalBudget * 0.9 && (
                        <div className="mt-3 rounded-lg bg-rose-50/80 border border-rose-200 p-2 dark:bg-rose-900/30 dark:border-rose-700/50">
                            <div className="flex items-center gap-2 text-xs text-rose-800 dark:text-rose-200">
                                <AlertCircle className="w-4 h-4" />
                                <span>预算已接近上限，无法进一步提高精度</span>
                            </div>
                        </div>
                    )}
                </div>

                {/* 目标精度分析 */}
                <div className="space-y-3">
                    <Label className="text-xs text-amber-700 dark:text-amber-300">
                        设定目标精度：±{targetMarginOfError}%
                    </Label>
                    <Slider
                        value={[targetMarginOfError]}
                        onValueChange={(v) => setTargetMarginOfError(v[0] ?? 5)}
                        min={1}
                        max={15}
                        step={1}
                        className="py-2"
                    />

                    <div className="rounded-xl border border-amber-200 bg-white/50 p-3 dark:border-amber-700/50 dark:bg-amber-950/30">
                        <div className="space-y-2">
                            <div className="flex justify-between text-sm">
                                <span className="text-amber-700 dark:text-amber-300">所需样本量</span>
                                <span className="font-mono text-amber-900 dark:text-amber-100">
                                    {targetAnalysis.requiredSampleSize.toLocaleString()}
                                </span>
                            </div>
                            <div className="flex justify-between text-sm">
                                <span className="text-amber-700 dark:text-amber-300">预估总成本</span>
                                <span className="font-mono text-amber-900 dark:text-amber-100">
                                    ¥{targetAnalysis.totalCost.toLocaleString()}
                                </span>
                            </div>

                            {targetAnalysis.isFeasible ? (
                                <div className="flex items-center gap-2 text-sm text-emerald-600 dark:text-emerald-400">
                                    <Badge className="bg-emerald-500 text-white">可行</Badge>
                                    <span>预算充足，可实现目标精度</span>
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    <div className="flex items-center gap-2 text-sm text-rose-600 dark:text-rose-400">
                                        <Badge variant="destructive">超预算</Badge>
                                        <span>还需 ¥{targetAnalysis.budgetGap.toLocaleString()}</span>
                                    </div>
                                    <p className="text-xs text-rose-600/70 dark:text-rose-400/70">
                                        建议：放宽误差限至 ±{Math.ceil(achievablePrecision?.marginOfError || targetMarginOfError)}% 
                                        或增加预算
                                    </p>
                                </div>
                            )}
                        </div>

                        {targetAnalysis.isFeasible && (
                            <Button
                                onClick={() => onApplyBudget(currentScenario.totalBudget, targetAnalysis.requiredSampleSize)}
                                className="w-full mt-3 bg-amber-500 hover:bg-amber-600 text-white"
                                size="sm"
                            >
                                应用此样本量
                                <ChevronRight className="w-4 h-4 ml-1" />
                            </Button>
                        )}
                    </div>
                </div>

                {/* 精度-成本曲线图 */}
                <div className="rounded-xl border border-amber-200 bg-white/50 p-3 dark:border-amber-700/50 dark:bg-amber-950/30">
                    <div className="flex items-center gap-2 mb-3">
                        <TrendingUp className="w-4 h-4 text-amber-500" />
                        <span className="font-medium text-amber-900 dark:text-amber-100 text-sm">
                            精度-成本关系
                        </span>
                    </div>

                    {/* 简化的可视化 */}
                    <div className="space-y-2">
                        <div className="flex justify-between text-xs text-amber-600/70 dark:text-amber-400/70">
                            <span>样本量 →</span>
                            <span>成本 →</span>
                        </div>
                        <div className="relative h-32 bg-amber-50 dark:bg-amber-900/20 rounded-lg overflow-hidden">
                            {/* 网格线 */}
                            <div className="absolute inset-0 flex flex-col justify-between p-2">
                                {[0, 1, 2, 3].map(i => (
                                    <div key={i} className="border-t border-amber-200/30 dark:border-amber-700/20" />
                                ))}
                            </div>

                            {/* 曲线点 */}
                            <div className="absolute inset-0 p-2 flex items-end justify-between">
                                {curveData.slice(0, 8).map((point, index) => {
                                    const maxCost = Math.max(...curveData.map(p => p.totalCost));
                                    const heightPercent = maxCost > 0 
                                        ? (point.totalCost / maxCost) * 80 + 10 
                                        : 50;
                                    
                                    return (
                                        <div 
                                            key={index}
                                            className="flex flex-col items-center gap-1"
                                            style={{ width: `${100 / 8}%` }}
                                        >
                                            <div 
                                                className="w-2 bg-amber-400 dark:bg-amber-600 rounded-t transition-all"
                                                style={{ height: `${heightPercent}%` }}
                                            />
                                            <span className="text-[10px] text-amber-600/60 dark:text-amber-400/60">
                                                {point.sampleSize < 1000 
                                                    ? point.sampleSize 
                                                    : (point.sampleSize / 1000).toFixed(1) + 'k'
                                                }
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                        <p className="text-xs text-amber-600/70 dark:text-amber-400/70 text-center">
                            随着样本量增加，边际精度收益递减
                        </p>
                    </div>
                </div>

                {/* 决策建议 */}
                <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3 dark:border-emerald-700/50 dark:bg-emerald-900/30">
                    <div className="flex items-start gap-2">
                        <Info className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                        <div className="text-xs text-emerald-800 dark:text-emerald-200 space-y-1">
                            <p className="font-medium">决策建议</p>
                            <ul className="space-y-1 text-emerald-700/80 dark:text-emerald-300/80 list-disc list-inside">
                                <li>在预算约束下，精度与成本呈非线性关系</li>
                                <li>当样本量超过1000后，精度提升的边际效益显著下降</li>
                                <li>建议优先保证 ±3-5% 的误差限，性价比最高</li>
                                <li>如需更高精度（±1-2%），成本将呈指数增长</li>
                            </ul>
                        </div>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
