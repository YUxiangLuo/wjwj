import { useState, useMemo, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
import { zForConfidenceLevel } from "../experiment/confidence-level";
import { calculateFinitePopulationSampleSize } from "../experiment/sample-plan";

interface CostScenario {
    id: string;
    name: string;
    fixedCost: number;           // 固定成本（培训、督导等）
    variableCostPerUnit: number; // 单位样本成本（元/样本）
    totalBudget: number;         // 总预算
}

interface PrecisionCostTradeoffProps {
    populationSize: number;
    /** 决策面板传入，作为本工具内可改的初值 */
    confidenceLevel: string;
    designEffect: number;
    nonResponseRate: number;
    /** 与决策面板「允许误差」一致（%），用于「目标精度」滑块初值 */
    initialMarginOfError?: number;
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
    initialMarginOfError = 5,
    onApplyBudget,
}: PrecisionCostTradeoffProps) {
    /** 与左侧决策面板解耦：继承为初值，在工具内可任意调整 */
    const [confidenceLevelLocal, setConfidenceLevelLocal] = useState(() => confidenceLevel);
    const [designEffectLocal, setDesignEffectLocal] = useState(() => designEffect);
    const [nonResponseRateLocal, setNonResponseRateLocal] = useState(() => nonResponseRate);

    const [selectedScenario, setSelectedScenario] = useState<CostScenario>(PRESET_SCENARIOS[0]!);
    const [customScenario, setCustomScenario] = useState<CostScenario>({
        id: "custom",
        name: "自定义",
        fixedCost: 5000,
        variableCostPerUnit: 20,
        totalBudget: 50000,
    });
    const [useCustom, setUseCustom] = useState(false);
    const [targetMarginOfError, setTargetMarginOfError] = useState(() => {
        const m = initialMarginOfError;
        if (m == null || !Number.isFinite(m)) return 5;
        // 与下方「目标精度」滑块 min/max 一致
        return Math.min(15, Math.max(1, Math.round(m)));
    });

    // 父级决策参数变化时同步本地（避免挂载后 props 更新而演算仍用旧初值）
    useEffect(() => {
        setConfidenceLevelLocal(confidenceLevel);
    }, [confidenceLevel]);
    useEffect(() => {
        setDesignEffectLocal(designEffect);
    }, [designEffect]);
    useEffect(() => {
        setNonResponseRateLocal(nonResponseRate);
    }, [nonResponseRate]);
    useEffect(() => {
        const m = initialMarginOfError;
        if (m == null || !Number.isFinite(m)) return;
        setTargetMarginOfError(Math.min(15, Math.max(1, Math.round(m))));
    }, [initialMarginOfError]);

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

        // 反向计算误差限：从样本量反推
        // 正向: n_final = (z²p(1-p)/E²) / (1+(n₀-1)/N) * deff / (1-nrr)
        // 反推: effectiveN = n_final * (1-nrr) / deff，然后含FPC反推E
        const z = zForConfidenceLevel(confidenceLevelLocal);
        const p = 0.5;
        
        // 去除deff和nrr调整，得到有限总体校正后的有效样本量
        // designEffect > 0 由UI slider下限保证（最小0.5）
        const safeDeff = designEffectLocal > 0 ? designEffectLocal : 1;
        const effectiveN = maxFeasibleSampleSize * (1 - nonResponseRateLocal) / safeDeff;
        // 含有限总体校正 (FPC) 的反推误差限: E = z * sqrt(p(1-p)/n * (1-n/N))
        const fpc = Math.max(0, 1 - effectiveN / populationSize);
        const marginOfError = z * Math.sqrt(p * (1 - p) / effectiveN * fpc) * 100;

        return {
            marginOfError: Math.min(marginOfError, 50), // 最大50%
            sampleSize: maxFeasibleSampleSize,
            totalCost: currentScenario.fixedCost + maxFeasibleSampleSize * currentScenario.variableCostPerUnit,
        };
    }, [maxFeasibleSampleSize, confidenceLevelLocal, populationSize, designEffectLocal, nonResponseRateLocal, currentScenario]);

    // 生成精度-成本曲线数据
    const curveData = useMemo(() => {
        const points: Array<{ sampleSize: number; marginOfError: number; totalCost: number }> = [];
        
        const sampleSizes = [30, 50, 100, 200, 300, 500, 800, 1000, 1500, 2000, 3000, 5000];
        const z = zForConfidenceLevel(confidenceLevelLocal);
        const p = 0.5;

        const safeDeff = designEffectLocal > 0 ? designEffectLocal : 1;

        sampleSizes.forEach(n => {
            if (n <= populationSize) {
                // 去除deff和nrr调整，得到有效样本量
                const effectiveN = n * (1 - nonResponseRateLocal) / safeDeff;
                // 含FPC反推误差限
                const fpc = Math.max(0, 1 - effectiveN / populationSize);
                const marginOfError = z * Math.sqrt(p * (1 - p) / effectiveN * fpc) * 100;
                
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
    }, [populationSize, confidenceLevelLocal, designEffectLocal, nonResponseRateLocal, currentScenario]);

    // 计算目标精度所需的样本量和成本
    const targetAnalysis = useMemo(() => {
        const requiredSampleSize = calculateFinitePopulationSampleSize({
            confidenceLevel: confidenceLevelLocal,
            marginOfError: targetMarginOfError,
            populationSize,
            designEffect: designEffectLocal,
            nonResponseRate: nonResponseRateLocal,
        }) ?? 0;

        const totalCost = currentScenario.fixedCost + requiredSampleSize * currentScenario.variableCostPerUnit;
        const isFeasible = totalCost <= currentScenario.totalBudget;

        return {
            requiredSampleSize,
            totalCost,
            isFeasible,
            budgetGap: totalCost - currentScenario.totalBudget,
        };
    }, [targetMarginOfError, confidenceLevelLocal, populationSize, designEffectLocal, nonResponseRateLocal, currentScenario]);

    /** 与「高级分析（SE/CV/敏感性）」一致：靛蓝主结构 + 青绿强调精度数值 + 白底内容区 */
    const sliderIndigo =
        "py-2 [&_[data-slot=slider-range]]:!bg-indigo-600 [&_[data-slot=slider-track]]:!bg-indigo-100 dark:[&_[data-slot=slider-track]]:!bg-indigo-950/80 [&_[data-slot=slider-thumb]]:!border-indigo-600 [&_[data-slot=slider-thumb]]:!bg-white dark:[&_[data-slot=slider-thumb]]:!bg-slate-950 [&_[data-slot=slider-thumb]]:!ring-indigo-500/25";

    return (
        <Card className="rounded-2xl border-indigo-200/90 bg-indigo-50/80 shadow-sm dark:border-indigo-900/50 dark:bg-slate-950">
            <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <DollarSign className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                        <CardTitle className="text-base text-indigo-950 dark:text-indigo-100">
                            精度与成本权衡
                        </CardTitle>
                    </div>
                </div>
                <CardDescription className="text-slate-700 dark:text-slate-300">
                    在给定预算约束下，评估可达到的精度水平
                </CardDescription>
            </CardHeader>

            <CardContent className="space-y-4">
                {/* 场景选择 */}
                <div className="space-y-2">
                    <Label className="text-xs font-medium text-slate-800 dark:text-slate-200">调查场景</Label>
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
                                        ? "bg-indigo-600 text-white hover:bg-indigo-500 shadow-sm"
                                        : "border-indigo-200 bg-white text-indigo-900 hover:bg-indigo-50 dark:border-indigo-800 dark:bg-slate-950 dark:text-indigo-100 dark:hover:bg-indigo-950/50"
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
                                ? "bg-indigo-600 text-white hover:bg-indigo-500"
                                : "border-indigo-200 bg-white text-indigo-900 hover:bg-indigo-50 dark:border-indigo-800 dark:bg-slate-950 dark:text-indigo-100 dark:hover:bg-indigo-950/50"
                        }`}
                    >
                        自定义成本参数
                    </Button>
                </div>

                {/* 自定义参数 */}
                {useCustom && (
                    <div className="space-y-3 p-3 rounded-xl border border-indigo-200/90 bg-white dark:border-indigo-800/50 dark:bg-slate-950">
                        <div className="space-y-2">
                            <Label className="text-xs text-slate-800 dark:text-slate-200">固定成本（元）</Label>
                            <Input
                                type="number"
                                value={customScenario.fixedCost}
                                onChange={(e) => setCustomScenario({
                                    ...customScenario,
                                    fixedCost: parseInt(e.target.value) || 0
                                })}
                                className="bg-white dark:bg-slate-950 border-indigo-200 dark:border-indigo-800 text-slate-900 dark:text-slate-100"
                            />
                            <p className="text-xs text-slate-600 dark:text-slate-400">培训、督导、设备等固定支出</p>
                        </div>
                        <div className="space-y-2">
                            <Label className="text-xs text-slate-800 dark:text-slate-200">单位样本成本（元/样本）</Label>
                            <Input
                                type="number"
                                value={customScenario.variableCostPerUnit}
                                onChange={(e) => setCustomScenario({
                                    ...customScenario,
                                    variableCostPerUnit: parseInt(e.target.value) || 0
                                })}
                                className="bg-white dark:bg-slate-950 border-indigo-200 dark:border-indigo-800 text-slate-900 dark:text-slate-100"
                            />
                            <p className="text-xs text-slate-600 dark:text-slate-400">每个样本的调查费用（访问费、礼品等）</p>
                        </div>
                        <div className="space-y-2">
                            <Label className="text-xs text-slate-800 dark:text-slate-200">总预算（元）</Label>
                            <Input
                                type="number"
                                value={customScenario.totalBudget}
                                onChange={(e) => setCustomScenario({
                                    ...customScenario,
                                    totalBudget: parseInt(e.target.value) || 0
                                })}
                                className="bg-white dark:bg-slate-950 border-indigo-200 dark:border-indigo-800 text-slate-900 dark:text-slate-100"
                            />
                        </div>
                    </div>
                )}

                {/* 当前场景摘要 */}
                <div className="rounded-xl border border-indigo-200/90 bg-white p-3 dark:border-indigo-800/50 dark:bg-slate-950 space-y-2">
                    <div className="flex justify-between text-sm">
                        <span className="text-slate-700 dark:text-slate-300">固定成本</span>
                        <span className="font-mono text-indigo-900 dark:text-indigo-100">
                            ¥{currentScenario.fixedCost.toLocaleString()}
                        </span>
                    </div>
                    <div className="flex justify-between text-sm">
                        <span className="text-slate-700 dark:text-slate-300">单位成本</span>
                        <span className="font-mono text-indigo-900 dark:text-indigo-100">
                            ¥{currentScenario.variableCostPerUnit}/样本
                        </span>
                    </div>
                    <div className="flex justify-between text-sm font-medium">
                        <span className="text-slate-700 dark:text-slate-300">总预算</span>
                        <span className="font-mono text-indigo-900 dark:text-indigo-100">
                            ¥{currentScenario.totalBudget.toLocaleString()}
                        </span>
                    </div>
                </div>

                {/* 抽样假设：继承决策面板初值，仅影响本工具内演算 */}
                <div className="rounded-xl border border-indigo-200/90 bg-white p-3 dark:border-indigo-800/50 dark:bg-slate-950 space-y-4">
                    <p className="text-xs font-medium text-slate-800 dark:text-slate-200">抽样假设（可在此调整）</p>
                    <div className="space-y-1.5">
                        <Label className="text-xs text-slate-600 dark:text-slate-400">置信水平</Label>
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
                        <div className="flex justify-between text-xs">
                            <span className="text-slate-600 dark:text-slate-400">设计效应</span>
                            <span className="font-bold tabular-nums text-indigo-800 dark:text-indigo-200">
                                {designEffectLocal.toFixed(1)}
                            </span>
                        </div>
                        <Slider
                            value={[Math.round(designEffectLocal * 10)]}
                            onValueChange={([v]) => v != null && setDesignEffectLocal(Math.round(v) / 10)}
                            min={10}
                            max={50}
                            step={1}
                            className={sliderIndigo}
                        />
                    </div>
                    <div className="space-y-1.5">
                        <div className="flex justify-between text-xs">
                            <span className="text-slate-600 dark:text-slate-400">无回答率</span>
                            <span className="font-bold tabular-nums text-rose-700 dark:text-rose-300">
                                {Math.round(nonResponseRateLocal * 100)}%
                            </span>
                        </div>
                        <Slider
                            value={[Math.round(nonResponseRateLocal * 100)]}
                            onValueChange={([v]) => v != null && setNonResponseRateLocal((v ?? 0) / 100)}
                            min={0}
                            max={50}
                            step={5}
                            className={sliderIndigo}
                        />
                    </div>
                </div>

                {/* 预算约束分析 */}
                <div className="rounded-xl border-2 border-indigo-300/90 bg-white p-4 shadow-sm dark:border-indigo-700/60 dark:bg-slate-950">
                    <div className="flex items-center gap-2 mb-3">
                        <Target className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                        <span className="font-bold text-indigo-950 dark:text-indigo-50">预算约束分析</span>
                    </div>

                    <div className="space-y-3">
                        <div className="flex justify-between items-center">
                            <span className="text-sm text-slate-700 dark:text-slate-300">预算可支持的最大样本量</span>
                            <span className="text-xl font-bold tabular-nums text-indigo-700 dark:text-indigo-300">
                                {maxFeasibleSampleSize.toLocaleString()}
                            </span>
                        </div>

                        {achievablePrecision && (
                            <>
                                <div className="flex justify-between items-center">
                                    <span className="text-sm text-slate-700 dark:text-slate-300">可达到的最佳精度</span>
                                    <span className="text-lg font-bold tabular-nums text-teal-700 dark:text-teal-300">
                                        ±{achievablePrecision.marginOfError.toFixed(1)}%
                                    </span>
                                </div>
                                <div className="flex justify-between items-center text-sm">
                                    <span className="text-slate-700 dark:text-slate-300">实际总成本</span>
                                    <span className="font-mono text-indigo-900 dark:text-indigo-100">
                                        ¥{achievablePrecision.totalCost.toLocaleString()}
                                    </span>
                                </div>
                            </>
                        )}
                    </div>

                    {achievablePrecision && achievablePrecision.totalCost > currentScenario.totalBudget * 0.9 && (
                        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-2 dark:border-amber-800/50 dark:bg-amber-950/40">
                            <div className="flex items-center gap-2 text-xs text-amber-950 dark:text-amber-100">
                                <AlertCircle className="w-4 h-4 shrink-0 text-amber-700 dark:text-amber-300" />
                                <span>预算已接近上限，无法进一步提高精度</span>
                            </div>
                        </div>
                    )}
                </div>

                {/* 目标精度分析（与决策面板「允许误差」1～10% 可保存值不同，此处为工具内试算 1～15%） */}
                <div className="space-y-3">
                    <div>
                        <Label className="text-xs font-medium text-slate-800 dark:text-slate-200">
                            目标精度（工具内试算，1～15%）
                        </Label>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                            左侧决策面板的「允许误差」为可保存的 1～10%；此处滑块仅用于在本工具中估算所需样本量与成本，不会单独写入保存记录。
                        </p>
                    </div>
                    <p className="text-xs font-medium text-slate-700 dark:text-slate-300 tabular-nums">
                        当前设定：±{targetMarginOfError}%
                    </p>
                    <Slider
                        value={[targetMarginOfError]}
                        onValueChange={(v) => setTargetMarginOfError(v[0] ?? 5)}
                        min={1}
                        max={15}
                        step={1}
                        className={sliderIndigo}
                    />

                    <div className="rounded-xl border border-indigo-200/90 bg-white p-3 dark:border-indigo-800/50 dark:bg-slate-950">
                        <div className="space-y-2">
                            <div className="flex justify-between text-sm">
                                <span className="text-slate-700 dark:text-slate-300">所需样本量</span>
                                <span className="font-mono text-indigo-900 dark:text-indigo-100">
                                    {targetAnalysis.requiredSampleSize.toLocaleString()}
                                </span>
                            </div>
                            <div className="flex justify-between text-sm">
                                <span className="text-slate-700 dark:text-slate-300">预估总成本</span>
                                <span className="font-mono text-indigo-900 dark:text-indigo-100">
                                    ¥{targetAnalysis.totalCost.toLocaleString()}
                                </span>
                            </div>

                            {targetAnalysis.isFeasible ? (
                                <div className="flex items-center gap-2 text-sm text-teal-800 dark:text-teal-200">
                                    <Badge className="border-0 bg-teal-600 text-white hover:bg-teal-600">可行</Badge>
                                    <span>预算充足，可实现目标精度</span>
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    <div className="flex items-center gap-2 text-sm text-rose-700 dark:text-rose-200">
                                        <Badge variant="destructive">超预算</Badge>
                                        <span>还需 ¥{targetAnalysis.budgetGap.toLocaleString()}</span>
                                    </div>
                                    <p className="text-xs text-rose-800 dark:text-rose-100">
                                        建议：放宽误差限至 ±{Math.ceil(achievablePrecision?.marginOfError || targetMarginOfError)}% 
                                        或增加预算
                                    </p>
                                </div>
                            )}
                        </div>

                        {targetAnalysis.isFeasible && (
                            <>
                                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed mt-3">
                                    「应用」仅将样本量写入最终样本量。若抽样假设与左侧不一致，理解此 n 时以本工具为准；左侧不会随本工具更新，勿用左侧参数代回验算。
                                </p>
                                <Button
                                    onClick={() => onApplyBudget(currentScenario.totalBudget, targetAnalysis.requiredSampleSize)}
                                    className="w-full mt-2 bg-indigo-600 text-white hover:bg-indigo-500"
                                    size="sm"
                                >
                                    应用此样本量
                                    <ChevronRight className="w-4 h-4 ml-1" />
                                </Button>
                            </>
                        )}
                    </div>
                </div>

                {/* 精度-成本曲线图 */}
                <div className="rounded-xl border border-indigo-200/90 bg-white p-3 dark:border-indigo-800/50 dark:bg-slate-950">
                    <div className="flex items-center gap-2 mb-3">
                        <TrendingUp className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                        <span className="font-medium text-indigo-950 dark:text-indigo-50 text-sm">
                            精度-成本关系
                        </span>
                    </div>

                    {/* 简化的可视化 */}
                    <div className="space-y-2">
                        <div className="flex justify-between text-xs text-slate-600 dark:text-slate-400">
                            <span>样本量 →</span>
                            <span>成本 →</span>
                        </div>
                        <div className="relative h-32 rounded-lg overflow-hidden border border-indigo-200/70 bg-indigo-50/80 dark:border-indigo-800/40 dark:bg-indigo-950/30">
                            {/* 网格线 */}
                            <div className="absolute inset-0 flex flex-col justify-between p-2">
                                {[0, 1, 2, 3].map(i => (
                                    <div key={i} className="border-t border-indigo-200/50 dark:border-indigo-800/30" />
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
                                                className="w-2 rounded-t bg-indigo-500 transition-all dark:bg-indigo-400"
                                                style={{ height: `${heightPercent}%` }}
                                            />
                                            <span className="text-[10px] text-slate-700 dark:text-slate-300">
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
                        <p className="text-xs text-slate-600 dark:text-slate-400 text-center">
                            随着样本量增加，边际精度收益递减
                        </p>
                    </div>
                </div>

                {/* 决策建议（与比例对比卡片的说明区一致：浅青绿提示框） */}
                <div className="rounded-xl border border-teal-200/90 bg-teal-50/70 p-3 dark:border-teal-800/40 dark:bg-teal-950/25">
                    <div className="flex items-start gap-2">
                        <Info className="w-4 h-4 text-teal-600 dark:text-teal-400 shrink-0 mt-0.5" />
                        <div className="text-xs space-y-1 text-teal-950 dark:text-teal-100">
                            <p className="font-medium">决策建议</p>
                            <ul className="space-y-1 list-disc list-inside text-teal-900/95 dark:text-teal-100/95">
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
