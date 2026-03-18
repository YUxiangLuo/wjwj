import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { BarChart3, Calculator, Scale, Users, AlertCircle } from "lucide-react";

interface LayerInfo {
    name: string;
    count: number;      // 层总体大小 Nh
    ratio: number;      // 层占比
}

interface AllocationComparison {
    method: "proportional" | "neyman" | "equal" | "optimal";
    name: string;
    description: string;
    allocation: Array<{
        layerName: string;
        populationSize: number;   // Nh
        sampleSize: number;      // nh
        proportion: number;      // nh / 总样本量
    }>;
    totalVariance: number;       // 估计方差（相对值）
    efficiency: number;          // 相对于简单随机抽样的效率
    totalCost?: number;          // 总成本（最优分配时）
}

interface StratifiedAllocationComparisonProps {
    layers: LayerInfo[];
    totalSampleSize: number;
    onApplyAllocation?: (method: "proportional" | "neyman" | "equal" | "optimal") => void;
}

export function StratifiedAllocationComparison({ 
    layers, 
    totalSampleSize,
    onApplyAllocation,
}: StratifiedAllocationComparisonProps) {
    if (!layers.length) return null;

    // 计算三种分配方法
    const comparisons: AllocationComparison[] = [
        calculateProportionalAllocation(layers, totalSampleSize),
        calculateEqualAllocation(layers, totalSampleSize),
        calculateNeymanAllocation(layers, totalSampleSize),
    ];

    // 找出最佳（最小方差）
    const bestMethod = comparisons.reduce((best, current) => 
        current.totalVariance < best.totalVariance ? current : best
    );

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
                                    {onApplyAllocation && (
                                        <Button 
                                            variant="outline" 
                                            size="sm"
                                            onClick={() => onApplyAllocation(comparison.method)}
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
                                相对效率 &gt; 1 表示该分配方法比简单随机抽样更精确。
                                奈曼分配通常在方差差异大的层间效果最好，而按比例分配在层规模差异大时表现稳定。
                            </p>
                        </div>
                    </div>
                </div>

                {/* 超额分配警告 */}
                {(() => {
                    const hasOverflow = comparisons.some(c => 
                        c.allocation.some(a => a.sampleSize > a.populationSize)
                    );
                    if (!hasOverflow) return null;
                    
                    return (
                        <div className="rounded-xl border border-rose-200 bg-rose-50/60 p-3 dark:border-rose-500/20 dark:bg-rose-500/10">
                            <div className="flex gap-2">
                                <Scale className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                                <div className="text-xs text-rose-800 dark:text-rose-200">
                                    <span className="font-medium">超额分配警告：</span>
                                    某些分配方法中某层的样本量超过了该层总体大小。实际应用中应对这些层进行全数调查。
                                </div>
                            </div>
                        </div>
                    );
                })()}
            </CardContent>
        </Card>
    );
}

// 计算按比例分配
function calculateProportionalAllocation(layers: LayerInfo[], totalSampleSize: number): AllocationComparison {
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

    // 计算方差（简化的相对方差估计）
    const totalVariance = calculateVariance(allocation, layers);

    return {
        method: "proportional",
        name: "按比例分配",
        description: "样本量与层总体大小成比例，是最常用且稳健的方法",
        allocation,
        totalVariance,
        efficiency: 1 / totalVariance,
    };
}

// 计算等样本分配
function calculateEqualAllocation(layers: LayerInfo[], totalSampleSize: number): AllocationComparison {
    const equalSize = Math.floor(totalSampleSize / layers.length);
    const remainder = totalSampleSize % layers.length;
    
    let allocation = layers.map((layer, index) => ({
        layerName: layer.name,
        populationSize: layer.count,
        sampleSize: equalSize + (index < remainder ? 1 : 0),
        proportion: (equalSize + (index < remainder ? 1 : 0)) / totalSampleSize,
    }));

    allocation = normalizeAllocation(allocation, totalSampleSize, layers);
    const totalVariance = calculateVariance(allocation, layers);

    return {
        method: "equal",
        name: "等额分配",
        description: "每层分配相同样本量，适合各层方差相近的情况",
        allocation,
        totalVariance,
        efficiency: 1 / totalVariance,
    };
}

// 计算奈曼分配（简化版）
function calculateNeymanAllocation(layers: LayerInfo[], totalSampleSize: number): AllocationComparison {
    const totalPopulation = layers.reduce((a, l) => a + l.count, 0);
    
    // 简化的奈曼分配：使用 N_h * sqrt(N_h) 作为权重（假设方差与规模相关）
    const weights = layers.map(layer => layer.count * Math.sqrt(layer.count));
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
    const totalVariance = calculateVariance(allocation, layers);

    return {
        method: "neyman",
        name: "奈曼分配",
        description: "使估计值方差最小化的最优分配，适合方差差异大的层间",
        allocation,
        totalVariance,
        efficiency: 1 / totalVariance,
    };
}

// 归一化分配（确保总和为totalSampleSize且不超过层总体大小）
function normalizeAllocation(
    allocation: Array<{ layerName: string; populationSize: number; sampleSize: number; proportion: number }>, 
    totalSampleSize: number,
    layers: LayerInfo[]
): Array<{ layerName: string; populationSize: number; sampleSize: number; proportion: number }> {
    // 先确保每个样本量不超过层总体大小
    let adjusted = allocation.map((a, i) => ({
        ...a,
        sampleSize: Math.min(a.sampleSize, layers[i]?.count ?? a.sampleSize),
    }));

    // 计算当前总和
    let currentTotal = adjusted.reduce((sum, a) => sum + a.sampleSize, 0);
    
    // 如果需要调整
    let attempts = 0;
    while (currentTotal !== totalSampleSize && attempts < 100) {
        const diff = totalSampleSize - currentTotal;
        
        if (diff > 0) {
            // 需要增加：按比例增加（但不超过层上限）
            for (let i = 0; i < adjusted.length && currentTotal < totalSampleSize; i++) {
                const layer = layers[i];
                const item = adjusted[i];
                if (!layer || !item) continue;
                const maxAdd = layer.count - item.sampleSize;
                if (maxAdd > 0) {
                    item.sampleSize += 1;
                    currentTotal += 1;
                }
            }
        } else if (diff < 0) {
            // 需要减少：按比例减少（但不低于0）
            for (let i = 0; i < adjusted.length && currentTotal > totalSampleSize; i++) {
                const item = adjusted[i];
                if (item && item.sampleSize > 0) {
                    item.sampleSize -= 1;
                    currentTotal -= 1;
                }
            }
        }
        attempts++;
        
        // 防止死循环：如果一轮循环后没有变化就退出
        if (attempts > 0 && currentTotal === adjusted.reduce((sum, a) => sum + a.sampleSize, 0)) {
            break;
        }
    }

    // 重新计算比例
    return adjusted.map(a => ({
        ...a,
        proportion: totalSampleSize > 0 ? a.sampleSize / totalSampleSize : 0,
    }));
}

// 简化的方差计算
function calculateVariance(
    allocation: Array<{ layerName: string; populationSize: number; sampleSize: number }>,
    layers: LayerInfo[]
): number {
    // 使用简化的方差模型：假设每层内的方差与层大小成正比
    // Var_total = sum((N_h/N)^2 * (S_h^2/n_h) * (1 - n_h/N_h))
    // 简化：假设 S_h^2 ∝ N_h
    
    const totalPopulation = layers.reduce((a, l) => a + l.count, 0);
    
    let totalVariance = 0;
    allocation.forEach((a, i) => {
        const Nh = a.populationSize;
        const nh = a.sampleSize;
        const Wh = totalPopulation > 0 ? Nh / totalPopulation : 0;
        
        // 简化的层方差：S_h^2 = Nh / totalPopulation（归一化）
        const Sh2 = totalPopulation > 0 ? Nh / totalPopulation : 0;
        
        // 层贡献的方差
        if (nh > 0) {
            const layerVariance = Math.pow(Wh, 2) * (Sh2 / nh) * (1 - nh / Nh);
            totalVariance += layerVariance;
        }
    });

    return totalVariance;
}
