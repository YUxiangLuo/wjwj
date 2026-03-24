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
import { BarChart3, Calculator, AlertCircle, CheckCircle2, ArrowRight } from "lucide-react";
import { useState, useMemo } from "react";

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
        isOverAllocated?: boolean; // 是否超额分配
        isFullyEnumerated?: boolean; // 是否全数调查
    }>;
    totalVariance: number;       // 估计方差（相对值）
    efficiency: number;          // 相对于按比例分配的效率（Var_prop / Var_method）
    totalCost?: number;          // 总成本（最优分配时）
    hasOverAllocation: boolean;  // 是否存在超额分配
    overAllocatedLayers: string[]; // 超额分配的层名称
    adjustedTotalSampleSize?: number; // 调整后的总样本量（处理超额分配后）
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
    const [showOverflowDetails, setShowOverflowDetails] = useState(false);

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

    const comparisons: AllocationComparison[] = useMemo(() => {
        if (!layers.length) return [];
        const raw: AllocationComparison[] = [
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
        const propVariance = raw[0]?.totalVariance;
        if (!propVariance || propVariance <= 0) return raw;
        return raw.map(c => ({
            ...c,
            efficiency: c.totalVariance > 0 ? propVariance / c.totalVariance : 1,
        }));
    }, [layers, totalSampleSize, layerStdDevs, layerMeans]);

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

                {/* 方法卡片 */}
                <div className="space-y-3">
                    {comparisons.map((comparison, index) => {
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
                                    {comparison.allocation.map((layer, idx) => (
                                        <div key={layer.layerName} className="flex items-center gap-3">
                                            <span className="text-xs text-violet-600 dark:text-violet-400 w-16 truncate">
                                                {layer.layerName}
                                            </span>
                                            <div className="flex-1 h-5 rounded-md bg-violet-200/30 dark:bg-violet-900/30 overflow-hidden relative">
                                                {/* 总体占比背景 */}
                                                <div 
                                                    className="absolute top-0 left-0 h-full bg-violet-200/50 dark:bg-violet-800/30"
                                                    style={{ width: `${(layer.populationSize / layers.reduce((a, l) => a + l.count, 0)) * 100}%` }}
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
                                <div className="grid grid-cols-2 gap-3 pt-3 border-t border-violet-200/50 dark:border-violet-700/30">
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
                                            {onApplyAllocation && comparison.method !== "optimal" && (
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    onClick={() => {
                                                        onApplyAllocation(comparison.allocation.map(a => ({
                                                            name: a.layerName,
                                                            count: a.populationSize,
                                                            sampleCount: a.isOverAllocated ? a.populationSize : a.sampleSize,
                                                        })));
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

// 检测并标记超额分配
function detectOverAllocation(
    allocation: Array<{ layerName: string; populationSize: number; sampleSize: number; proportion: number }>,
    layers: LayerInfo[]
): {
    markedAllocation: Array<{ layerName: string; populationSize: number; sampleSize: number; proportion: number; isOverAllocated?: boolean; isFullyEnumerated?: boolean }>;
    hasOverAllocation: boolean;
    overAllocatedLayers: string[];
    adjustedTotalSampleSize: number;
} {
    let hasOverAllocation = false;
    const overAllocatedLayers: string[] = [];
    let adjustedTotalSampleSize = 0;

    const markedAllocation = allocation.map((a, i) => {
        const isOverAllocated = a.sampleSize > a.populationSize;
        const isFullyEnumerated = isOverAllocated;
        
        if (isOverAllocated) {
            hasOverAllocation = true;
            overAllocatedLayers.push(a.layerName);
            // 超额层全数调查，使用总体大小作为样本量
            adjustedTotalSampleSize += a.populationSize;
        } else {
            adjustedTotalSampleSize += a.sampleSize;
        }

        return {
            ...a,
            isOverAllocated,
            isFullyEnumerated,
        };
    });

    return {
        markedAllocation,
        hasOverAllocation,
        overAllocatedLayers,
        adjustedTotalSampleSize,
    };
}

// 计算按比例分配
function calculateProportionalAllocation(layers: LayerInfo[], totalSampleSize: number, stdDevs?: number[]): AllocationComparison {
    const totalPopulation = layers.reduce((a, l) => a + l.count, 0);
    
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

    // 检测超额分配
    const { 
        markedAllocation, 
        hasOverAllocation, 
        overAllocatedLayers, 
        adjustedTotalSampleSize 
    } = detectOverAllocation(allocation, layers);

    // 计算方差
    const totalVariance = calculateVariance(markedAllocation, layers, stdDevs);

    return {
        method: "proportional",
        name: "按比例分配",
        description: "样本量与层总体大小成比例，是最常用且稳健的方法",
        allocation: markedAllocation,
        totalVariance,
        efficiency: 1, // overridden by comparisons useMemo with relative-to-proportional ratio
        hasOverAllocation,
        overAllocatedLayers,
        adjustedTotalSampleSize,
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
    
    // 检测超额分配
    const { 
        markedAllocation, 
        hasOverAllocation, 
        overAllocatedLayers, 
        adjustedTotalSampleSize 
    } = detectOverAllocation(allocation, layers);

    const totalVariance = calculateVariance(markedAllocation, layers, stdDevs);

    return {
        method: "equal",
        name: "等额分配",
        description: "每层分配相同样本量，适合各层方差相近的情况",
        allocation: markedAllocation,
        totalVariance,
        efficiency: 1, // overridden by comparisons useMemo with relative-to-proportional ratio
        hasOverAllocation,
        overAllocatedLayers,
        adjustedTotalSampleSize,
    };
}

// 计算奈曼分配
function calculateNeymanAllocation(layers: LayerInfo[], totalSampleSize: number, stdDevs?: number[]): AllocationComparison {
    const totalPopulation = layers.reduce((a, l) => a + l.count, 0);

    // Neyman allocation: n_h ∝ N_h × S_h
    // When actual std devs are provided, use them; otherwise fall back to sqrt(N_h) heuristic
    const weights = layers.map((layer, i) => {
        const sh = stdDevs?.[i] ?? Math.sqrt(layer.count);
        return layer.count * sh;
    });
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
    
    // 检测超额分配
    const { 
        markedAllocation, 
        hasOverAllocation, 
        overAllocatedLayers, 
        adjustedTotalSampleSize 
    } = detectOverAllocation(allocation, layers);

    const totalVariance = calculateVariance(markedAllocation, layers, stdDevs);

    return {
        method: "neyman",
        name: "奈曼分配",
        description: stdDevs
            ? "基于实际层内标准差进行最优分配，使估计方差最小化"
            : "使用层规模近似标准差（选择目标变量可获得更准确的分配）",
        allocation: markedAllocation,
        totalVariance,
        efficiency: 1, // overridden by comparisons useMemo with relative-to-proportional ratio
        hasOverAllocation,
        overAllocatedLayers,
        adjustedTotalSampleSize,
    };
}

// 归一化分配（确保总和为totalSampleSize且不超过层总体大小，使用最大余数法）
function normalizeAllocation(
    allocation: Array<{ layerName: string; populationSize: number; sampleSize: number; proportion: number }>,
    totalSampleSize: number,
    layers: LayerInfo[]
): Array<{ layerName: string; populationSize: number; sampleSize: number; proportion: number }> {
    // 用原始权重比例计算精确分配量
    const exactShares = allocation.map(a => totalSampleSize * a.proportion);

    // Floor 并 cap 到层总体上限
    const floored = exactShares.map((s, i) =>
        Math.min(Math.floor(s), layers[i]?.count ?? Math.floor(s)),
    );

    let remainder = totalSampleSize - floored.reduce((a, b) => a + b, 0);

    // 按小数部分降序排列（最大余数法），分配剩余名额
    const indices = floored.map((_, i) => i);
    indices.sort((a, b) => (exactShares[b]! - floored[b]!) - (exactShares[a]! - floored[a]!));

    for (const idx of indices) {
        if (remainder <= 0) break;
        const maxAdd = (layers[idx]?.count ?? 0) - floored[idx]!;
        if (maxAdd > 0) {
            floored[idx]!++;
            remainder--;
        }
    }

    // 重新计算比例
    return allocation.map((a, i) => ({
        ...a,
        sampleSize: floored[i] ?? 0,
        proportion: totalSampleSize > 0 ? (floored[i] ?? 0) / totalSampleSize : 0,
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

    const {
        markedAllocation,
        hasOverAllocation,
        overAllocatedLayers,
        adjustedTotalSampleSize,
    } = detectOverAllocation(allocation, layers);

    const totalVariance = calculateVariance(markedAllocation, layers, stdDevs);

    return {
        method: "sizeMeasure",
        name: "与 Nₕ×Ȳₕ 成比例",
        description: "各层样本量与 Nₕ×Ȳₕ 成比例，适用于估计总量时",
        allocation: markedAllocation,
        totalVariance,
        efficiency: 1,
        hasOverAllocation,
        overAllocatedLayers,
        adjustedTotalSampleSize,
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

    const {
        markedAllocation,
        hasOverAllocation,
        overAllocatedLayers,
        adjustedTotalSampleSize,
    } = detectOverAllocation(allocation, layers);

    const totalVariance = calculateVariance(markedAllocation, layers, stdDevs);

    return {
        method: "sqrtSizeMeasure",
        name: "与 √(Nₕ×Ȳₕ) 成比例",
        description: "各层样本量与 √(Nₕ×Ȳₕ) 成比例，在按比例和 Nₕ×Ȳₕ 分配之间折中",
        allocation: markedAllocation,
        totalVariance,
        efficiency: 1,
        hasOverAllocation,
        overAllocatedLayers,
        adjustedTotalSampleSize,
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
    
    // 检测超额分配
    const { 
        markedAllocation, 
        hasOverAllocation, 
        overAllocatedLayers, 
        adjustedTotalSampleSize 
    } = detectOverAllocation(allocation, layers);
    
    const totalVariance = calculateVariance(markedAllocation, layers, stdDevs);

    return {
        method: "sqrt" as const,
        name: "平方根分配",
        description: "与层规模的平方根成比例，在按比例和等额分配之间取得平衡",
        allocation: markedAllocation,
        totalVariance,
        efficiency: 1, // overridden by comparisons useMemo with relative-to-proportional ratio
        hasOverAllocation,
        overAllocatedLayers,
        adjustedTotalSampleSize,
    };
}
