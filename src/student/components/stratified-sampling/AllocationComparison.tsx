import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { BarChart3, Calculator, AlertCircle, CheckCircle2, ArrowRight, Coins, ChevronDown } from "lucide-react";
import { useState, useMemo } from "react";

import type { LayerInfo, AllocationMethod, AllocationComparison as AllocationComparisonType } from "./types";
import {
    calculateProportionalAllocation,
    calculateEqualAllocation,
    calculateNeymanAllocation,
    calculateSquareRootNAllocation,
    calculateSizeMeasureNAllocation,
    calculateSqrtSizeMeasureNAllocation,
    calculateCostOptimalAllocation,
    calculateEqualVarianceCostAllocation,
} from "./allocation-methods";
import { FIELD_LABELS } from "../sampling-shared";

interface StratifiedAllocationComparisonProps {
    layers: LayerInfo[];
    totalSampleSize: number;
    numericFields?: string[];
    stratumStdDevs?: Record<string, Record<string, { mean: number; stdDev: number }>>;
    onApplyAllocation?: (method: AllocationMethod) => void;
    onApplyAllocationWithOverflow?: (method: AllocationMethod, allocation: { name: string; count: number; sampleCount: number }[]) => void;
}

export function StratifiedAllocationComparison({
    layers,
    totalSampleSize,
    numericFields,
    stratumStdDevs,
    onApplyAllocation,
    onApplyAllocationWithOverflow,
}: StratifiedAllocationComparisonProps) {
    const [targetVariable, setTargetVariable] = useState<string | null>(null);
    const [showOverflowDetails, setShowOverflowDetails] = useState(false);
    const [showCostInputs, setShowCostInputs] = useState(false);
    const [layerCostsRaw, setLayerCostsRaw] = useState<number[]>([]);

    // 费用数组与层同步，默认每单元费用 = 1
    const layerCosts = useMemo(() => {
        return layers.map((_, i) => layerCostsRaw[i] ?? 1);
    }, [layers, layerCostsRaw]);

    const updateLayerCost = (index: number, value: number) => {
        setLayerCostsRaw(prev => {
            const next = layers.map((_, i) => prev[i] ?? 1);
            next[index] = value;
            return next;
        });
    };

    // Extract per-layer std devs for the selected target variable
    const layerStdDevs = useMemo(() => {
        if (!targetVariable || !stratumStdDevs) return undefined;
        const devs = layers.map(l => stratumStdDevs[l.name]?.[targetVariable]?.stdDev);
        return devs.every((s): s is number => s !== undefined && s > 0) ? devs : undefined;
    }, [layers, targetVariable, stratumStdDevs]);

    const layerMeans = useMemo(() => {
        if (!targetVariable || !stratumStdDevs) return undefined;
        const means = layers.map(l => stratumStdDevs[l.name]?.[targetVariable]?.mean);
        return means.every((m): m is number => m !== undefined && m > 0) ? means : undefined;
    }, [layers, targetVariable, stratumStdDevs]);

    const comparisons: AllocationComparisonType[] = useMemo(() => {
        if (!layers.length) return [];
        const raw: AllocationComparisonType[] = [
            calculateProportionalAllocation(layers, totalSampleSize, layerStdDevs),
            calculateEqualAllocation(layers, totalSampleSize, layerStdDevs),
            calculateNeymanAllocation(layers, totalSampleSize, layerStdDevs),
            calculateSquareRootNAllocation(layers, totalSampleSize, layerStdDevs),
        ];
        if (layerMeans) {
            raw.push(
                calculateSizeMeasureNAllocation(layers, totalSampleSize, layerMeans, layerStdDevs),
                calculateSqrtSizeMeasureNAllocation(layers, totalSampleSize, layerMeans, layerStdDevs),
            );
        }
        // 费用相关最优分配（启用费用参数后展示）
        if (showCostInputs) {
            raw.push(
                calculateCostOptimalAllocation(layers, totalSampleSize, layerCosts, layerStdDevs),
                calculateEqualVarianceCostAllocation(layers, totalSampleSize, layerCosts, layerStdDevs),
            );
        }
        // 为所有方法计算总费用（启用费用参数时）
        if (showCostInputs) {
            for (const c of raw) {
                c.totalCost = c.allocation.reduce((sum, a, i) => sum + (layerCosts[i] ?? 1) * a.sampleSize, 0);
            }
        }
        const propVariance = raw[0]?.totalVariance;
        if (!propVariance || propVariance <= 0) return raw;
        return raw.map(c => ({
            ...c,
            efficiency: c.totalVariance > 0 ? propVariance / c.totalVariance : 1,
        }));
    }, [layers, totalSampleSize, layerStdDevs, layerMeans, showCostInputs, layerCosts]);

    const totalPopulation = useMemo(() => layers.reduce((a, l) => a + l.count, 0), [layers]);

    if (!layers.length) return null;

    // 找出最佳（最小方差）
    const bestMethod = comparisons.reduce((best, current) =>
        current.totalVariance < best.totalVariance ? current : best
    );

    // 检测是否存在超额分配
    const hasAnyOverAllocation = comparisons.some(c => c.hasOverAllocation);
    const allOverAllocatedLayers = Array.from(new Set(
        comparisons.flatMap(c => c.overAllocatedLayers)
    ));

    return (
        <Card className="rounded-2xl border-violet-200 bg-violet-50/80 shadow-sm dark:border-violet-500/20 dark:bg-violet-500/10">
            <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <BarChart3 className="w-5 h-5 text-violet-500" />
                        <CardTitle className="text-base text-violet-900 dark:text-violet-200">
                            分配方法对比分析
                        </CardTitle>
                    </div>
                </div>
                <CardDescription className="text-violet-700 dark:text-violet-300">
                    不同分配方法的样本分布与效率比较
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                {/* 目标变量选择器 */}
                {numericFields && numericFields.length > 0 && (
                    <div className="rounded-xl border border-violet-200/50 bg-white/50 p-3 dark:border-violet-500/10 dark:bg-violet-950/20">
                        <div className="flex items-center gap-2 mb-2">
                            <Calculator className="w-4 h-4 text-violet-500" />
                            <span className="text-sm font-medium text-violet-900 dark:text-violet-100">目标估计变量</span>
                        </div>
                        <p className="text-xs text-violet-600/80 dark:text-violet-400/80 mb-2">
                            选择目标变量后，将使用各层的实际标准差计算奈曼最优分配和方差估计
                        </p>
                        <Select
                            value={targetVariable ?? "__none__"}
                            onValueChange={(v) => setTargetVariable(v === "__none__" ? null : v)}
                        >
                            <SelectTrigger className="bg-white dark:bg-violet-950 border-violet-200 dark:border-violet-700 text-violet-900 dark:text-violet-100">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="__none__">使用层规模近似（默认）</SelectItem>
                                {numericFields.map(field => (
                                    <SelectItem key={field} value={field}>
                                        {FIELD_LABELS[field] ?? field}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        {targetVariable && layerStdDevs && (
                            <div className="mt-2 text-xs text-violet-600/70 dark:text-violet-400/70 space-y-0.5">
                                {layers.map((l, i) => (
                                    <div key={l.name} className="flex justify-between">
                                        <span>{l.name}</span>
                                        <span className="font-mono">S = {layerStdDevs[i]?.toFixed(2)}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* 费用参数（最优分配 & 等方差最优分配） */}
                <div className="rounded-xl border border-violet-200/50 bg-white/50 p-3 dark:border-violet-500/10 dark:bg-violet-950/20">
                    <button
                        className="flex items-center gap-2 w-full text-left"
                        onClick={() => setShowCostInputs(!showCostInputs)}
                    >
                        <Coins className="w-4 h-4 text-violet-500" />
                        <span className="text-sm font-medium text-violet-900 dark:text-violet-100">
                            费用参数（最优分配）
                        </span>
                        <ChevronDown className={`w-4 h-4 text-violet-400 ml-auto transition-transform ${showCostInputs ? "rotate-180" : ""}`} />
                    </button>
                    {showCostInputs && (
                        <div className="mt-3 space-y-2">
                            <p className="text-xs text-violet-600/80 dark:text-violet-400/80">
                                输入各层每单元调查费用 c<sub>h</sub>。最优分配公式：a<sub>h</sub> ∝ N<sub>h</sub>S<sub>h</sub>/√c<sub>h</sub>；
                                方差相等时简化为 a<sub>h</sub> ∝ N<sub>h</sub>/√c<sub>h</sub>。
                            </p>
                            <div className="space-y-1.5">
                                {layers.map((layer, i) => (
                                    <div key={layer.name} className="flex items-center gap-2">
                                        <span className="text-xs text-violet-600 dark:text-violet-400 w-20 truncate" title={layer.name}>
                                            {layer.name}
                                        </span>
                                        <span className="text-xs text-violet-400">c =</span>
                                        <Input
                                            type="number"
                                            value={layerCosts[i]}
                                            onChange={(e) => updateLayerCost(i, Math.max(0.01, parseFloat(e.target.value) || 1))}
                                            className="h-7 w-20 text-xs bg-white dark:bg-violet-950 border-violet-200 dark:border-violet-700 text-violet-900 dark:text-violet-100"
                                            min={0.01}
                                            step={0.1}
                                        />
                                    </div>
                                ))}
                            </div>
                            <p className="text-[11px] text-violet-500/70 dark:text-violet-400/60 mt-1">
                                费用不同时，最优分配将更多样本分配给费用低、规模大、变异大的层。
                                总费用函数 C = Σ c<sub>h</sub>×n<sub>h</sub>。
                            </p>
                        </div>
                    )}
                </div>

                {/* 方法卡片 */}
                <div className="space-y-3">
                    {comparisons.map((comparison) => {
                        const isBest = comparison.method === bestMethod.method;

                        return (
                            <div
                                key={comparison.method}
                                className={`rounded-xl border p-4 transition-all ${
                                    isBest
                                        ? "border-violet-400 bg-violet-100/50 dark:border-violet-400/40 dark:bg-violet-900/30"
                                        : "border-violet-200/50 bg-white/50 dark:border-violet-500/10 dark:bg-violet-950/20"
                                }`}
                            >
                                {/* 头部信息 */}
                                <div className="flex items-center justify-between mb-3">
                                    <div className="flex items-center gap-2">
                                        <span className="font-bold text-violet-900 dark:text-violet-100">
                                            {comparison.name}
                                        </span>
                                        {isBest && (
                                            <Badge className="bg-violet-500 text-white text-xs">
                                                最优方差
                                            </Badge>
                                        )}
                                    </div>
                                    {(onApplyAllocationWithOverflow || onApplyAllocation) && (
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => {
                                                if (onApplyAllocationWithOverflow) {
                                                    const allocation = comparison.allocation.map(a => ({
                                                        name: a.layerName,
                                                        count: a.populationSize,
                                                        sampleCount: a.sampleSize,
                                                    }));
                                                    onApplyAllocationWithOverflow(comparison.method, allocation);
                                                } else {
                                                    onApplyAllocation!(comparison.method);
                                                }
                                            }}
                                            className="text-xs h-7 border-violet-300 hover:bg-violet-100 dark:border-violet-700 dark:hover:bg-violet-900/30"
                                        >
                                            应用此分配
                                        </Button>
                                    )}
                                </div>

                                <p className="text-xs text-violet-700/80 dark:text-violet-300/80 mb-3">
                                    {comparison.description}
                                </p>

                                {/* 各层分配可视化 */}
                                <div className="space-y-2 mb-3">
                                    {comparison.allocation.map((layer) => (
                                        <div key={layer.layerName} className="flex items-center gap-3">
                                            <span className="text-xs text-violet-600 dark:text-violet-400 w-16 truncate">
                                                {layer.layerName}
                                            </span>
                                            <div className="flex-1 h-5 rounded-md bg-violet-200/30 dark:bg-violet-900/30 overflow-hidden relative">
                                                {/* 总体占比背景 */}
                                                <div
                                                    className="absolute top-0 left-0 h-full bg-violet-200/50 dark:bg-violet-800/30"
                                                    style={{ width: `${(layer.populationSize / totalPopulation) * 100}%` }}
                                                />
                                                {/* 样本占比前景 */}
                                                <div
                                                    className="absolute top-0 left-0 h-full bg-violet-500 transition-all"
                                                    style={{ width: `${layer.proportion * 100}%` }}
                                                />
                                                <span className="absolute inset-0 flex items-center justify-center text-xs font-medium text-violet-900 dark:text-violet-100 z-10">
                                                    {layer.sampleSize}
                                                </span>
                                            </div>
                                            <span className="text-xs text-violet-500 w-10 text-right">
                                                {Math.round(layer.proportion * 100)}%
                                            </span>
                                        </div>
                                    ))}
                                </div>

                                {/* 指标 */}
                                <div className={`grid gap-3 pt-3 border-t border-violet-200/50 dark:border-violet-700/30 ${comparison.totalCost != null ? "grid-cols-3" : "grid-cols-2"}`}>
                                    <div className="text-center">
                                        <div className="text-xs text-violet-500 mb-1">估计方差（相对）</div>
                                        <div className="font-bold text-violet-700 dark:text-violet-300">
                                            {comparison.totalVariance.toFixed(4)}
                                        </div>
                                    </div>
                                    <div className="text-center">
                                        <div className="text-xs text-violet-500 mb-1">相对效率</div>
                                        <div className={`font-bold ${isBest ? "text-emerald-600 dark:text-emerald-400" : "text-violet-700 dark:text-violet-300"}`}>
                                            {comparison.efficiency.toFixed(2)}×
                                        </div>
                                    </div>
                                    {comparison.totalCost != null && (
                                        <div className="text-center">
                                            <div className="text-xs text-violet-500 mb-1">总费用 Σc<sub>h</sub>n<sub>h</sub></div>
                                            <div className="font-bold text-violet-700 dark:text-violet-300">
                                                {comparison.totalCost.toLocaleString()}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* 效率说明 */}
                <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-3 dark:border-amber-500/20 dark:bg-amber-500/10">
                    <div className="flex gap-2">
                        <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                        <div className="text-xs text-amber-800 dark:text-amber-200 space-y-1">
                            <p className="font-medium">效率解读</p>
                            <p className="text-amber-700/80 dark:text-amber-300/80">
                                相对效率以按比例分配为基准（1.00×）。&gt; 1 表示比按比例分配更精确。
                                奈曼分配通常在层间方差差异大时效果最好，而按比例分配在层规模差异大时表现稳定。
                            </p>
                        </div>
                    </div>
                </div>

                {/* 超额分配检测与处理 */}
                {hasAnyOverAllocation && (
                    <div className="space-y-3">
                        {/* 超额分配警告 - 详细版 */}
                        <div className="rounded-xl border-2 border-rose-300 bg-rose-50 p-4 dark:border-rose-500/40 dark:bg-rose-900/30">
                            <div className="flex items-start gap-3">
                                <AlertCircle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
                                <div className="flex-1">
                                    <p className="font-medium text-rose-900 dark:text-rose-100 mb-2">
                                        检测到超额分配
                                    </p>
                                    <p className="text-xs text-rose-700 dark:text-rose-300 mb-3">
                                        以下层在某些分配方法中分配到的样本量超过了该层总体大小：
                                    </p>
                                    <div className="flex flex-wrap gap-2 mb-3">
                                        {allOverAllocatedLayers.map(layerName => (
                                            <Badge
                                                key={layerName}
                                                variant="outline"
                                                className="bg-rose-100 border-rose-300 text-rose-700 dark:bg-rose-900/30 dark:border-rose-600"
                                            >
                                                {layerName}
                                            </Badge>
                                        ))}
                                    </div>
                                    <p className="text-xs text-rose-600/80 dark:text-rose-400/80">
                                        超额分配意味着需要对该层进行全数调查（抽取全部单元），这可能导致实际总样本量小于计划值。
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* 处理方法建议 */}
                        <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3 dark:border-emerald-500/30 dark:bg-emerald-900/20">
                            <div className="flex items-start gap-2">
                                <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                                <div className="text-xs text-emerald-800 dark:text-emerald-200">
                                    <p className="font-medium mb-1">处理方法建议</p>
                                    <ul className="space-y-1 text-emerald-700/80 dark:text-emerald-300/80 list-disc list-inside">
                                        <li>对超额分配的层进行全数调查（n_h = N_h）</li>
                                        <li>将剩余样本量分配给其他层</li>
                                        <li>考虑使用按比例分配（通常较少出现超额分配）</li>
                                    </ul>
                                </div>
                            </div>
                        </div>

                        {/* 查看详情按钮 */}
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setShowOverflowDetails(!showOverflowDetails)}
                            className="w-full border-rose-300 text-rose-700 hover:bg-rose-50 dark:border-rose-700 dark:text-rose-400 dark:hover:bg-rose-900/30"
                        >
                            {showOverflowDetails ? "隐藏超额分配详情" : "查看超额分配详情及处理"}
                        </Button>

                        {/* 详细处理选项 */}
                        {showOverflowDetails && (
                            <div className="space-y-3">
                                {comparisons.map(comparison => {
                                    if (!comparison.hasOverAllocation) return null;

                                    return (
                                        <div
                                            key={comparison.method}
                                            className="rounded-xl border border-rose-200 bg-white/80 p-3 dark:border-rose-700/50 dark:bg-rose-950/20"
                                        >
                                            <div className="flex items-center justify-between mb-2">
                                                <span className="font-medium text-rose-900 dark:text-rose-100">
                                                    {comparison.name}
                                                </span>
                                                <Badge variant="outline" className="text-xs border-rose-300 text-rose-600">
                                                    {comparison.overAllocatedLayers.length} 层超额
                                                </Badge>
                                            </div>

                                            {/* 超额层列表 */}
                                            <div className="space-y-2 mb-3">
                                                {comparison.allocation
                                                    .filter(a => a.isOverAllocated)
                                                    .map(layer => (
                                                        <div
                                                            key={layer.layerName}
                                                            className="flex items-center justify-between text-xs bg-rose-50 p-2 rounded dark:bg-rose-900/30"
                                                        >
                                                            <span className="text-rose-700 dark:text-rose-300">
                                                                {layer.layerName}
                                                            </span>
                                                            <span className="text-rose-600 dark:text-rose-400">
                                                                分配 {layer.sampleSize} &gt; 总体 {layer.populationSize}
                                                            </span>
                                                        </div>
                                                    ))
                                                }
                                            </div>

                                            {/* 处理建议 */}
                                            <div className="text-xs text-slate-600 dark:text-slate-400 mb-2">
                                                建议处理：对超额层全数调查后，调整后总样本量为
                                                <span className="font-mono font-bold text-rose-600">
                                                    {comparison.adjustedTotalSampleSize?.toLocaleString()}
                                                </span>
                                            </div>

                                            {/* 应用按钮（带超额处理） */}
                                                {onApplyAllocationWithOverflow && (
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    onClick={() => {
                                                        // 构建处理超额分配后的分配方案
                                                        const adjustedAllocation = comparison.allocation.map(a => ({
                                                            name: a.layerName,
                                                            count: a.populationSize,
                                                            sampleCount: a.isOverAllocated ? a.populationSize : a.sampleSize,
                                                        }));
                                                        onApplyAllocationWithOverflow(comparison.method, adjustedAllocation);
                                                    }}
                                                    className="w-full text-xs border-rose-300 text-rose-700 hover:bg-rose-50 dark:border-rose-700 dark:text-rose-400"
                                                >
                                                    应用此分配（自动处理超额层）
                                                    <ArrowRight className="w-3 h-3 ml-1" />
                                                </Button>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
