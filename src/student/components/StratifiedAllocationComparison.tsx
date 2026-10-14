import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { BarChart3, Calculator, AlertCircle } from "lucide-react";
import { useState, useMemo } from "react";
import { allocateNeymanSampleCounts, allocateStratifiedSampleCounts } from "./stratified-allocation";
import { formatStatistic } from "@/utils/statistic-format";

interface LayerInfo {
    name: string;
    count: number;   // 层总体大小 Nh
    ratio: number;   // 层占比
}

type AllocationMethod = "proportional" | "neyman" | "equal" | "optimal" | "sqrt" | "sizeMeasure" | "sqrtSizeMeasure";

interface AllocationComparison {
    method: AllocationMethod;
    name: string;
    description: string;
    allocation: Array<{
        layerName: string;
        populationSize: number;  // Nh
        sampleSize: number;   // nh
        proportion: number;   // nh / 总样本量
    }>;
    totalVariance: number | null; // 估计方差；有正总体层未抽样时不可计算
    efficiency: number | null;  // 相对于按比例分配的效率（Var_prop / Var_method）
    totalCost?: number;     // 总成本（最优分配时）
}

const FIELD_LABELS: Record<string, string> = {
    "age": "年龄",
    "income": "收入水平",
    "monthly_expense": "月支出",
    "spending": "消费支出",
    "salary": "薪资",
    "price": "价格",
    "quantity": "数量",
    "gender": "性别",
    "education": "学历",
    "age_group": "年龄段",
    "city": "城市",
    "city_tier": "城市等级",
};

interface StratifiedAllocationComparisonProps {
    layers: LayerInfo[];
    totalSampleSize: number;
    numericFields?: string[];
    stratumStdDevs?: Record<string, Record<string, { mean: number; stdDev: number }>>;
    onApplyAllocation?: (allocation: { name: string; count: number; sampleCount: number }[]) => void;
}

export function StratifiedAllocationComparison({
    layers,
    totalSampleSize,
    numericFields,
    stratumStdDevs,
    onApplyAllocation,
}: StratifiedAllocationComparisonProps) {
    const [targetVariable, setTargetVariable] = useState<string | null>(null);
    const [showExtraMethods, setShowExtraMethods] = useState(false);

    // Extract per-layer std devs for the selected target variable
    const layerStdDevs = useMemo(() => {
        if (!targetVariable || !stratumStdDevs) return undefined;
        const devs = layers.map(l => stratumStdDevs[l.name]?.[targetVariable]?.stdDev);
        return devs.every((s): s is number => s !== undefined && Number.isFinite(s) && s >= 0) ? devs : undefined;
    }, [layers, targetVariable, stratumStdDevs]);

    const layerMeans = useMemo(() => {
        if (!targetVariable || !stratumStdDevs) return undefined;
        const means = layers.map(l => stratumStdDevs[l.name]?.[targetVariable]?.mean);
        return means.every((m): m is number => m !== undefined && m > 0) ? means : undefined;
    }, [layers, targetVariable, stratumStdDevs]);

    const canCompareVariance = Boolean(layerStdDevs);

    const comparisons: AllocationComparison[] = useMemo(() => {
        if (!layers.length) return [];
        const raw: AllocationComparison[] = [
            calculateProportionalAllocation(layers, totalSampleSize, layerStdDevs),
            calculateEqualAllocation(layers, totalSampleSize, layerStdDevs),
            ...(layerStdDevs ? [calculateNeymanAllocation(layers, totalSampleSize, layerStdDevs)] : []),
            calculateSquareRootNAllocation(layers, totalSampleSize, layerStdDevs),
        ];
        if (layerMeans) {
            raw.push(
                calculateSizeMeasureNAllocation(layers, totalSampleSize, layerMeans, layerStdDevs),
                calculateSqrtSizeMeasureNAllocation(layers, totalSampleSize, layerMeans, layerStdDevs),
            );
        }
        const propVariance = raw[0]?.totalVariance;
        return raw.map((comparison) => ({
            ...comparison,
            efficiency: canCompareVariance
                && propVariance != null
                && propVariance > 0
                && comparison.totalVariance != null
                && comparison.totalVariance > 0
                ? propVariance / comparison.totalVariance
                : null,
        }));
    }, [canCompareVariance, layers, totalSampleSize, layerStdDevs, layerMeans]);

    if (!layers.length) return null;

    const primaryComparisons = comparisons.filter((comparison) => comparison.method === "proportional" || comparison.method === "neyman");
    const extraComparisons = comparisons.filter((comparison) => comparison.method !== "proportional" && comparison.method !== "neyman");
    const visibleComparisons = showExtraMethods ? comparisons : primaryComparisons;
    const validVarianceComparisons = canCompareVariance
        ? visibleComparisons.filter((comparison) => comparison.totalVariance != null)
        : [];
    const bestMethod = validVarianceComparisons.reduce<AllocationComparison | null>(
        (best, current) => best == null || current.totalVariance! < best.totalVariance! ? current : best,
        null,
    );
    const hasIncompleteAllocation = visibleComparisons.some((comparison) => comparison.totalVariance == null);

    return (
        <Card className="rounded-surface border-auxiliary-border bg-auxiliary-muted ">
            <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <BarChart3 className="w-5 h-5 text-auxiliary" />
                        <CardTitle className="text-body text-auxiliary-strong">
                            分配方法对比分析
                        </CardTitle>
                    </div>
                </div>
                <CardDescription className="text-auxiliary-strong">
                    不同分配方法的样本分布与效率比较
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                {/* 目标变量选择器 */}
                {numericFields && numericFields.length > 0 && (
                    <div className="rounded-surface border border-auxiliary-border bg-background p-3">
                        <div className="flex items-center gap-2 mb-2">
                            <Calculator className="w-4 h-4 text-auxiliary" />
                            <span className="text-label font-medium text-auxiliary-strong">目标估计变量</span>
                        </div>
                        <p className="text-meta text-auxiliary mb-2">
                            选择目标变量后才会计算奈曼分配，并用真实层内标准差比较相对效率。未选择时只比较分配份额，不展示效率。
                        </p>
                        <Select
                            value={targetVariable ?? "__none__"}
                            onValueChange={(v) => setTargetVariable(v === "__none__" ? null : v)}
                        >
                            <SelectTrigger aria-label="分层分配目标估计变量" className="bg-card border-auxiliary-border text-auxiliary-strong">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="__none__">请选择目标变量后计算奈曼分配</SelectItem>
                                {numericFields.map(field => (
                                    <SelectItem key={field} value={field}>
                                        {FIELD_LABELS[field] ?? field}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        {targetVariable && layerStdDevs && (
                            <div className="mt-2 text-meta text-auxiliary space-y-0.5">
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

                {/* 方法卡片 */}
                <div className="space-y-3">
                    {visibleComparisons.map((comparison) => {
                        const isBest = bestMethod != null && comparison.method === bestMethod.method;

                        return (
                            <div
                                key={comparison.method}
                                className={`rounded-surface border p-4 transition-colors ${
                                    isBest
                                        ? "border-auxiliary bg-auxiliary-muted"
                                        : "border-auxiliary-border bg-background"
                                }`}
                            >
                                {/* 头部信息 */}
                                <div className="flex items-center justify-between mb-3">
                                    <div className="flex items-center gap-2">
                                        <span className="font-bold text-auxiliary-strong">
                                            {comparison.name}
                                        </span>
                                        {isBest && (
                                            <Badge className="bg-auxiliary text-auxiliary-foreground text-meta">
                                                当前对比最低
                                            </Badge>
                                        )}
                                    </div>
                                    {onApplyAllocation && comparison.method !== "optimal" && (
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            disabled={comparison.totalVariance == null}
                                            onClick={() => {
                                                onApplyAllocation(comparison.allocation.map(a => ({
                                                    name: a.layerName,
                                                    count: a.populationSize,
                                                    sampleCount: a.sampleSize,
                                                })));
                                            }}
                                            className="text-meta h-7 border-auxiliary-border hover:bg-auxiliary-muted hover:text-foreground hover:border-auxiliary-border"
                                        >
                                            应用此分配
                                        </Button>
                                    )}
                                </div>

                                <p className="text-meta text-auxiliary-strong mb-3">
                                    {comparison.description}
                                </p>

                                {/* 各层分配可视化 */}
                                <div className="space-y-2 mb-3">
                                    {comparison.allocation.map((layer) => (
                                        <div key={layer.layerName} className="flex items-center gap-3">
                                            <span className="text-meta text-auxiliary w-16 truncate">
                                                {layer.layerName}
                                            </span>
                                            <div className="flex-1 h-5 rounded-control bg-auxiliary-muted overflow-hidden relative">
                                                {/* 总体占比背景 */}
                                                <div
                                                    className="absolute top-0 left-0 h-full bg-auxiliary-muted"
                                                    style={{ width: `${(layer.populationSize / layers.reduce((a, l) => a + l.count, 0)) * 100}%` }}
                                                />
                                                {/* 样本占比前景 */}
                                                <div
                                                    className="absolute top-0 left-0 h-full bg-auxiliary transition-[width]"
                                                    style={{ width: `${layer.proportion * 100}%` }}
                                                />
                                                <span className="absolute inset-0 flex items-center justify-center text-meta font-medium text-auxiliary-strong z-10">
                                                    {layer.sampleSize}
                                                </span>
                                            </div>
                                            <span className="text-meta text-auxiliary w-10 text-right">
                                                {Math.round(layer.proportion * 100)}%
                                            </span>
                                        </div>
                                    ))}
                                </div>

                                {/* 指标 */}
                                <div className="grid grid-cols-2 gap-3 pt-3 border-t border-auxiliary-border">
                                    <div className="text-center">
                                        <div className="text-meta text-auxiliary mb-1">设计方差</div>
                                        <div className="font-bold text-auxiliary-strong">
                                            {canCompareVariance && comparison.totalVariance != null
                                                ? formatStatistic(comparison.totalVariance)
                                                : "—"}
                                        </div>
                                    </div>
                                    <div className="text-center">
                                        <div className="text-meta text-auxiliary mb-1">相对效率</div>
                                        <div className={`font-bold ${isBest ? "text-success" : "text-auxiliary-strong"}`}>
                                            {canCompareVariance && comparison.efficiency != null
                                                ? `${comparison.efficiency.toFixed(2)}×`
                                                : "—"}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>

                {hasIncompleteAllocation && (
                    <div className="rounded-surface border border-warning-border bg-warning-muted p-3">
                        <div className="flex gap-2">
                            <AlertCircle className="w-4 h-4 text-warning shrink-0 mt-0.5" />
                            <p className="text-meta text-warning leading-relaxed">
                                当前总样本量不足以让每个正总体层至少获得 1 个样本。普通分层均值无法估计，
                                因此相关方案不计算方差或效率，也不能应用；请把总样本量至少提高到正总体层数。
                            </p>
                        </div>
                    </div>
                )}

                {extraComparisons.length > 0 && (
                    <Button
                        type="button"
                        variant="outline"
                        className="w-full border-auxiliary-border text-auxiliary-strong"
                        onClick={() => setShowExtraMethods((value) => !value)}
                    >
                        {showExtraMethods ? "收起更多方法" : `更多方法（${extraComparisons.length}）`}
                    </Button>
                )}

                {canCompareVariance && !hasIncompleteAllocation && (
                    <div className="rounded-surface border border-warning-border bg-warning-muted p-3">
                        <div className="flex gap-2">
                            <AlertCircle className="w-4 h-4 text-warning shrink-0 mt-0.5" />
                            <div className="text-meta text-warning space-y-1">
                                <p className="font-medium">效率解读</p>
                                <p className="text-warning">
                                    相对效率以按比例分配为基准（1.00×）。&gt; 1 表示比按比例分配更精确。
                                    奈曼方案在固定总样本量、层内 SRS 和等单位成本下，用边际方差下降量求整数最优分配；改变目标变量、成本或域精度目标后，结论也会改变。已知层内方差为零时仍保留该层的最低覆盖样本。
                                </p>
                            </div>
                        </div>
                    </div>
                )}

                <p className="text-meta leading-relaxed text-auxiliary">
                    所有方案都遵守层容量和总样本量约束。奈曼按边际方差下降量分配，其他方法在某层达到 Nₕ 后重新分配剩余份额；当非空层数≤n≤ΣNₕ 时，各层样本量合计等于计划 n，并覆盖每层。
                </p>
            </CardContent>
        </Card>
    );
}

// 计算按比例分配
function calculateProportionalAllocation(layers: LayerInfo[], totalSampleSize: number, stdDevs?: number[]): AllocationComparison {
    const totalPopulation = layers.reduce((sum, layer) => sum + layer.count, 0);
    // 按比例分配
    let allocation = layers.map(layer => {
        const proportion = totalPopulation > 0 ? layer.count / totalPopulation : 0;
        return {
            layerName: layer.name,
            populationSize: layer.count,
            sampleSize: Math.round(totalSampleSize * proportion),
            proportion,
        };
    });

    // 调整总和为 totalSampleSize
    allocation = normalizeAllocation(allocation, totalSampleSize, layers);

    const totalVariance = calculateStratifiedMeanVariance(allocation, layers, stdDevs);

    return {
        method: "proportional",
        name: "按比例分配",
        description: "样本量与层总体大小成比例，是最常用且稳健的方法",
        allocation,
        totalVariance,
        efficiency: null, // overridden by comparisons useMemo with relative-to-proportional ratio
    };
}

// 计算等样本分配
function calculateEqualAllocation(layers: LayerInfo[], totalSampleSize: number, stdDevs?: number[]): AllocationComparison {
    const equalSize = Math.floor(totalSampleSize / layers.length);
    const remainder = totalSampleSize % layers.length;

    let allocation = layers.map((layer, index) => ({
        layerName: layer.name,
        populationSize: layer.count,
        sampleSize: equalSize + (index < remainder ? 1 : 0),
        proportion: (equalSize + (index < remainder ? 1 : 0)) / totalSampleSize,
    }));

    allocation = normalizeAllocation(allocation, totalSampleSize, layers);

    const totalVariance = calculateStratifiedMeanVariance(allocation, layers, stdDevs);

    return {
        method: "equal",
        name: "等额分配",
        description: "每层尽量分配相同样本量，适合重视各层分别估计或有意增加小层样本的场景",
        allocation,
        totalVariance,
        efficiency: null, // overridden by comparisons useMemo with relative-to-proportional ratio
    };
}

// 计算奈曼分配
function calculateNeymanAllocation(layers: LayerInfo[], totalSampleSize: number, stdDevs: number[]): AllocationComparison {
    // Neyman allocation: n_h ∝ N_h × S_h；必须使用真实层内标准差
    const weights = layers.map((layer, i) => layer.count * (stdDevs[i] ?? 0));
    const totalWeight = weights.reduce((a, b) => a + b, 0);

    let allocation = layers.map((layer, index) => {
        const weight = weights[index] ?? 0;
        const proportion = totalWeight > 0 ? weight / totalWeight : 0;
        return {
            layerName: layer.name,
            populationSize: layer.count,
            sampleSize: Math.round(totalSampleSize * proportion),
            proportion,
        };
    });

    const exactCounts = allocateNeymanSampleCounts({
        targetSampleSize: totalSampleSize,
        populationCounts: layers.map((layer) => layer.count),
        stdDevs,
    });
    allocation = exactCounts ? allocation.map((item, index) => ({
        ...item, sampleSize: exactCounts[index]!, proportion: exactCounts[index]! / totalSampleSize,
    })) : normalizeAllocation(allocation, totalSampleSize, layers);

    const totalVariance = calculateStratifiedMeanVariance(allocation, layers, stdDevs);

    return {
        method: "neyman",
        name: "奈曼分配",
        description: "连续份额与 NₕSₕ 成比例；在每层至少 1 个样本和容量上限内，用边际方差下降量求等成本整数最优分配",
        allocation,
        totalVariance,
        efficiency: null, // overridden by comparisons useMemo with relative-to-proportional ratio
    };
}

// 所有比较方法共用同一个有上限分配器；小层封顶后会循环重分配，直到保住目标总量或总体已用尽。
function normalizeAllocation(
    allocation: Array<{ layerName: string; populationSize: number; sampleSize: number; proportion: number }>,
    totalSampleSize: number,
    layers: LayerInfo[]
): Array<{ layerName: string; populationSize: number; sampleSize: number; proportion: number }> {
    const feasibleTarget = Math.min(
        Math.max(0, Math.round(totalSampleSize)),
        layers.reduce((sum, layer) => sum + Math.max(0, Math.floor(layer.count)), 0),
    );
    const positiveLayerCount = layers.filter((layer) => layer.count > 0).length;
    const counts = allocateStratifiedSampleCounts({
        targetSampleSize: feasibleTarget,
        rawCounts: allocation.map((item) => feasibleTarget * item.proportion),
        caps: layers.map((layer) => layer.count),
        minPerLayer: feasibleTarget >= positiveLayerCount ? 1 : 0,
    });

    return allocation.map((item, index) => ({
        ...item,
        sampleSize: counts[index] ?? 0,
        proportion: feasibleTarget > 0 ? (counts[index] ?? 0) / feasibleTarget : 0,
    }));
}

// 方差计算
// Var(ȳ_st) = Σ (W_h² × S_h² / n_h) × (1 − n_h / N_h)
export function calculateStratifiedMeanVariance(
    allocation: Array<{ layerName: string; populationSize: number; sampleSize: number }>,
    layers: LayerInfo[],
    stdDevs?: number[],
): number | null {
    const totalPopulation = layers.reduce((sum, layer) => sum + Math.max(0, layer.count), 0);
    if (!(totalPopulation > 0)) return null;

    let totalVariance = 0;
    for (let i = 0; i < layers.length; i += 1) {
        const Nh = Math.max(0, layers[i]?.count ?? 0);
        if (Nh === 0) continue;

        const nh = allocation[i]?.sampleSize ?? 0;
        if (!Number.isInteger(nh) || nh < 1 || nh > Nh) return null;
        const Wh = Nh / totalPopulation;

        // Use actual S_h² when available, otherwise fall back to heuristic S_h² ∝ N_h/N
        const Sh2 = stdDevs
            ? (stdDevs[i] ?? Number.NaN) ** 2
            : Nh / totalPopulation;
        if (!Number.isFinite(Sh2) || Sh2 < 0) return null;

        const layerVariance = Wh ** 2 * (Sh2 / nh) * (1 - nh / Nh);
        totalVariance += layerVariance;
    }

    return totalVariance;
}

// 与 Nh×Yh（层规模×层均值）成比例分配（课件第25页）
function calculateSizeMeasureNAllocation(layers: LayerInfo[], totalSampleSize: number, layerMeans: number[], stdDevs?: number[]): AllocationComparison {
    const weights = layers.map((layer, i) => layer.count * (layerMeans[i] ?? 1));
    const totalWeight = weights.reduce((a, b) => a + b, 0);

    let allocation = layers.map((layer, index) => {
        const weight = weights[index] ?? 0;
        const proportion = totalWeight > 0 ? weight / totalWeight : 0;
        return {
            layerName: layer.name,
            populationSize: layer.count,
            sampleSize: Math.round(totalSampleSize * proportion),
            proportion,
        };
    });

    allocation = normalizeAllocation(allocation, totalSampleSize, layers);

    const totalVariance = calculateStratifiedMeanVariance(allocation, layers, stdDevs);

    return {
        method: "sizeMeasure",
        name: "与 Nₕ×Ȳₕ 成比例",
        description: "各层样本量按层规模与层均值的乘积分配；不是一般估计问题的通用最优分配",
        allocation,
        totalVariance,
        efficiency: null,
    };
}

// 与 √(Nh×Yh)（层规模×层均值的平方根）成比例分配（课件第25页）
function calculateSqrtSizeMeasureNAllocation(layers: LayerInfo[], totalSampleSize: number, layerMeans: number[], stdDevs?: number[]): AllocationComparison {
    const weights = layers.map((layer, i) => Math.sqrt(layer.count * (layerMeans[i] ?? 1)));
    const totalWeight = weights.reduce((a, b) => a + b, 0);

    let allocation = layers.map((layer, index) => {
        const weight = weights[index] ?? 0;
        const proportion = totalWeight > 0 ? weight / totalWeight : 0;
        return {
            layerName: layer.name,
            populationSize: layer.count,
            sampleSize: Math.round(totalSampleSize * proportion),
            proportion,
        };
    });

    allocation = normalizeAllocation(allocation, totalSampleSize, layers);

    const totalVariance = calculateStratifiedMeanVariance(allocation, layers, stdDevs);

    return {
        method: "sqrtSizeMeasure",
        name: "与 √(Nₕ×Ȳₕ) 成比例",
        description: "各层样本量按层规模与层均值乘积的平方根分配；不代表普遍方差最优",
        allocation,
        totalVariance,
        efficiency: null,
    };
}

// 与N的平方根成比例分配
function calculateSquareRootNAllocation(layers: LayerInfo[], totalSampleSize: number, stdDevs?: number[]): AllocationComparison {
    const weights = layers.map(layer => Math.sqrt(layer.count));
    const totalWeight = weights.reduce((a, b) => a + b, 0);

    let allocation = layers.map((layer, index) => {
        const weight = weights[index] ?? 0;
        const proportion = totalWeight > 0 ? weight / totalWeight : 0;
        return {
            layerName: layer.name,
            populationSize: layer.count,
            sampleSize: Math.round(totalSampleSize * proportion),
            proportion,
        };
    });

    allocation = normalizeAllocation(allocation, totalSampleSize, layers);

    const totalVariance = calculateStratifiedMeanVariance(allocation, layers, stdDevs);

    return {
        method: "sqrt" as const,
        name: "平方根分配",
        description: "与层规模的平方根成比例，在按比例和等额份额之间折中；不代表普遍方差最优",
        allocation,
        totalVariance,
        efficiency: null, // overridden by comparisons useMemo with relative-to-proportional ratio
    };
}
