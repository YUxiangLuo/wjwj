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
import { allocateStratifiedSampleCounts } from "./stratified-allocation";

interface LayerInfo {
    name: string;
    count: number;      // 层总体大小 Nh
    ratio: number;      // 层占比
}

type AllocationMethod = "proportional" | "neyman" | "equal" | "optimal" | "sqrt" | "sizeMeasure" | "sqrtSizeMeasure";

interface AllocationComparison {
    method: AllocationMethod;
    name: string;
    description: string;
    allocation: Array<{
        layerName: string;
        populationSize: number;   // Nh
        sampleSize: number;      // nh
        proportion: number;      // nh / 总样本量
    }>;
    totalVariance: number;       // 估计方差（相对值）
    efficiency: number;          // 相对于按比例分配的效率（Var_prop / Var_method）
    totalCost?: number;          // 总成本（最优分配时）
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
            efficiency: canCompareVariance && propVariance && propVariance > 0 && comparison.totalVariance > 0
                ? propVariance / comparison.totalVariance
                : 1,
        }));
    }, [canCompareVariance, layers, totalSampleSize, layerStdDevs, layerMeans]);

    if (!layers.length) return null;

    const bestMethod = canCompareVariance
        ? comparisons.reduce((best, current) =>
            current.totalVariance < best.totalVariance ? current : best
        )
        : null;

    return (
        <Card className="rounded-2xl border-auxiliary-border bg-auxiliary-muted/80 shadow-sm">
            <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <BarChart3 className="w-5 h-5 text-auxiliary" />
                        <CardTitle className="text-base text-auxiliary-strong">
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
                    <div className="rounded-xl border border-auxiliary-border/50 bg-background/50 p-3">
                        <div className="flex items-center gap-2 mb-2">
                            <Calculator className="w-4 h-4 text-auxiliary" />
                            <span className="text-sm font-medium text-auxiliary-strong">目标估计变量</span>
                        </div>
                        <p className="text-xs text-auxiliary mb-2">
                            选择目标变量后才会计算奈曼分配，并用真实层内标准差比较相对效率。未选择时只比较分配份额，不展示效率。
                        </p>
                        <Select
                            value={targetVariable ?? "__none__"}
                            onValueChange={(v) => setTargetVariable(v === "__none__" ? null : v)}
                        >
                            <SelectTrigger aria-label="分层分配目标估计变量" className="bg-background border-auxiliary-border text-auxiliary-strong">
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
                            <div className="mt-2 text-xs text-auxiliary space-y-0.5">
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
                    {comparisons.map((comparison) => {
                        const isBest = bestMethod != null && comparison.method === bestMethod.method;

                        return (
                            <div
                                key={comparison.method}
                                className={`rounded-xl border p-4 transition-all ${
                                    isBest
                                        ? "border-auxiliary bg-auxiliary-muted/50"
                                        : "border-auxiliary-border/50 bg-background/50"
                                }`}
                            >
                                {/* 头部信息 */}
                                <div className="flex items-center justify-between mb-3">
                                    <div className="flex items-center gap-2">
                                        <span className="font-bold text-auxiliary-strong">
                                            {comparison.name}
                                        </span>
                                        {isBest && (
                                            <Badge className="bg-auxiliary text-auxiliary-foreground text-xs">
                                                当前对比最低
                                            </Badge>
                                        )}
                                    </div>
                                    {onApplyAllocation && comparison.method !== "optimal" && (
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => {
                                                onApplyAllocation(comparison.allocation.map(a => ({
                                                    name: a.layerName,
                                                    count: a.populationSize,
                                                    sampleCount: a.sampleSize,
                                                })));
                                            }}
                                            className="text-xs h-7 border-auxiliary-border hover:bg-auxiliary-muted"
                                        >
                                            应用此分配
                                        </Button>
                                    )}
                                </div>

                                <p className="text-xs text-auxiliary-strong/80 mb-3">
                                    {comparison.description}
                                </p>

                                {/* 各层分配可视化 */}
                                <div className="space-y-2 mb-3">
                                    {comparison.allocation.map((layer) => (
                                        <div key={layer.layerName} className="flex items-center gap-3">
                                            <span className="text-xs text-auxiliary w-16 truncate">
                                                {layer.layerName}
                                            </span>
                                            <div className="flex-1 h-5 rounded-md bg-auxiliary-muted/30 overflow-hidden relative">
                                                {/* 总体占比背景 */}
                                                <div
                                                    className="absolute top-0 left-0 h-full bg-auxiliary-muted/50"
                                                    style={{ width: `${(layer.populationSize / layers.reduce((a, l) => a + l.count, 0)) * 100}%` }}
                                                />
                                                {/* 样本占比前景 */}
                                                <div
                                                    className="absolute top-0 left-0 h-full bg-auxiliary transition-all"
                                                    style={{ width: `${layer.proportion * 100}%` }}
                                                />
                                                <span className="absolute inset-0 flex items-center justify-center text-xs font-medium text-auxiliary-strong z-10">
                                                    {layer.sampleSize}
                                                </span>
                                            </div>
                                            <span className="text-xs text-auxiliary w-10 text-right">
                                                {Math.round(layer.proportion * 100)}%
                                            </span>
                                        </div>
                                    ))}
                                </div>

                                {/* 指标 */}
                                <div className="grid grid-cols-2 gap-3 pt-3 border-t border-auxiliary-border/50">
                                    <div className="text-center">
                                        <div className="text-xs text-auxiliary mb-1">估计方差（相对）</div>
                                        <div className="font-bold text-auxiliary-strong">
                                            {canCompareVariance ? comparison.totalVariance.toFixed(4) : "—"}
                                        </div>
                                    </div>
                                    <div className="text-center">
                                        <div className="text-xs text-auxiliary mb-1">相对效率</div>
                                        <div className={`font-bold ${isBest ? "text-success" : "text-auxiliary-strong"}`}>
                                            {canCompareVariance ? `${comparison.efficiency.toFixed(2)}×` : "—"}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>

                {canCompareVariance && (
                <div className="rounded-xl border border-warning/20 bg-warning/10 p-3">
                    <div className="flex gap-2">
                        <AlertCircle className="w-4 h-4 text-warning shrink-0 mt-0.5" />
                        <div className="text-xs text-warning space-y-1">
                            <p className="font-medium">效率解读</p>
                            <p className="text-warning">
                                相对效率以按比例分配为基准（1.00×）。&gt; 1 表示比按比例分配更精确。
                                在固定总样本量、层内 SRS 和等单位成本下，奈曼分配针对所选变量最小化总体均值估计方差；改变目标变量、成本或域精度目标后，结论也会改变。
                            </p>
                        </div>
                    </div>
                </div>
                )}

                <p className="text-xs leading-relaxed text-auxiliary">
                    所有方法都使用同一容量约束分配器：某层达到 Nₕ 后，剩余名额会继续分配给未满层；只要 n≤ΣNₕ，最终各层样本量之和就等于计划 n。
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

    const totalVariance = calculateVariance(allocation, layers, stdDevs);

    return {
        method: "proportional",
        name: "按比例分配",
        description: "样本量与层总体大小成比例，是最常用且稳健的方法",
        allocation,
        totalVariance,
        efficiency: 1, // overridden by comparisons useMemo with relative-to-proportional ratio
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

    const totalVariance = calculateVariance(allocation, layers, stdDevs);

    return {
        method: "equal",
        name: "等额分配",
        description: "每层尽量分配相同样本量，适合重视各层分别估计或有意增加小层样本的场景",
        allocation,
        totalVariance,
        efficiency: 1, // overridden by comparisons useMemo with relative-to-proportional ratio
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

    allocation = normalizeAllocation(allocation, totalSampleSize, layers);

    const totalVariance = calculateVariance(allocation, layers, stdDevs);

    return {
        method: "neyman",
        name: "奈曼分配",
        description: "在固定总样本量、层内 SRS 和等单位成本下，按 NₕSₕ 分配使目标均值估计的方差最小",
        allocation,
        totalVariance,
        efficiency: 1, // overridden by comparisons useMemo with relative-to-proportional ratio
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
function calculateVariance(
    allocation: Array<{ layerName: string; populationSize: number; sampleSize: number }>,
    layers: LayerInfo[],
    stdDevs?: number[],
): number {
    const totalPopulation = layers.reduce((a, l) => a + l.count, 0);

    let totalVariance = 0;
    allocation.forEach((a, i) => {
        const Nh = a.populationSize;
        const nh = a.sampleSize;
        const Wh = totalPopulation > 0 ? Nh / totalPopulation : 0;

        // Use actual S_h² when available, otherwise fall back to heuristic S_h² ∝ N_h/N
        const Sh2 = stdDevs
            ? stdDevs[i]! ** 2
            : (totalPopulation > 0 ? Nh / totalPopulation : 0);

        if (nh > 0) {
            const layerVariance = Wh ** 2 * (Sh2 / nh) * (1 - nh / Nh);
            totalVariance += layerVariance;
        }
    });

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

    const totalVariance = calculateVariance(allocation, layers, stdDevs);

    return {
        method: "sizeMeasure",
        name: "与 Nₕ×Ȳₕ 成比例",
        description: "按课件模型使各层样本量与 Nₕ×Ȳₕ 成比例；不是一般估计问题的通用最优分配",
        allocation,
        totalVariance,
        efficiency: 1,
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

    const totalVariance = calculateVariance(allocation, layers, stdDevs);

    return {
        method: "sqrtSizeMeasure",
        name: "与 √(Nₕ×Ȳₕ) 成比例",
        description: "按课件模型与 √(Nₕ×Ȳₕ) 成比例，在两种份额规则间折中；不代表普遍方差最优",
        allocation,
        totalVariance,
        efficiency: 1,
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

    const totalVariance = calculateVariance(allocation, layers, stdDevs);

    return {
        method: "sqrt" as const,
        name: "平方根分配",
        description: "与层规模的平方根成比例，在按比例和等额份额之间折中；不代表普遍方差最优",
        allocation,
        totalVariance,
        efficiency: 1, // overridden by comparisons useMemo with relative-to-proportional ratio
    };
}
