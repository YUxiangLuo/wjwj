import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { 
    DollarSign, 
    Calculator, 
    BarChart3, 
    Info,
    CheckCircle2,
    ArrowRight
} from "lucide-react";
import { calculateSquareRootAllocation, calculateOptimalAllocationWithCost, type LayerWithCost } from "../experiment/sample-plan";

interface AdvancedStratifiedAllocationProps {
    layers: Array<{ name: string; count: number; ratio: number }>;
    totalSampleSize: number;
    onApplySquareRootAllocation?: (allocation: { name: string; sampleSize: number }[]) => void;
    onApplyCostOptimizedAllocation?: (allocation: { name: string; sampleSize: number; cost: number }[]) => void;
}

export function AdvancedStratifiedAllocation({
    layers,
    totalSampleSize,
    onApplySquareRootAllocation,
    onApplyCostOptimizedAllocation,
}: AdvancedStratifiedAllocationProps) {
    const [showCostOptimization, setShowCostOptimization] = useState(false);
    const [totalBudget, setTotalBudget] = useState(50000);
    const [fixedCost, setFixedCost] = useState(5000);
    const [layerCosts, setLayerCosts] = useState<number[]>(layers.map(() => 20));

    // 计算平方根分配
    const squareRootAllocation = calculateSquareRootAllocation(
        layers.map(l => ({ name: l.name, populationSize: l.count })),
        totalSampleSize
    );

    // 计算费用最优分配
    const costOptimizedResult = (() => {
        if (!showCostOptimization) return null;
        
        const layersWithCost: LayerWithCost[] = layers.map((layer, index) => ({
            name: layer.name,
            populationSize: layer.count,
            stdDev: Math.sqrt(layer.count),  // 简化估计：标准差与规模正相关
            unitCost: layerCosts[index] ?? 20,
        }));
        
        return calculateOptimalAllocationWithCost(layersWithCost, totalBudget, fixedCost);
    })();

    return (
        <Card className="rounded-2xl border-indigo-200 bg-indigo-50/80 shadow-sm dark:border-indigo-500/20 dark:bg-indigo-500/10">
            <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <BarChart3 className="w-5 h-5 text-indigo-500" />
                        <CardTitle className="text-base text-indigo-900 dark:text-indigo-200">
                            高级分配方法
                        </CardTitle>
                    </div>
                </div>
                <CardDescription className="text-indigo-700 dark:text-indigo-300">
                    平方根分配与费用最优分配
                </CardDescription>
            </CardHeader>

            <CardContent className="space-y-4">
                {/* 平方根分配 */}
                <div className="rounded-xl border border-indigo-200 bg-white/50 p-4 dark:border-indigo-700/50 dark:bg-indigo-950/30">
                    <div className="flex items-center justify-between mb-3">
                        <div>
                            <h4 className="font-bold text-indigo-900 dark:text-indigo-100">平方根分配</h4>
                            <p className="text-xs text-indigo-600/70 dark:text-indigo-400/70">
                                n_h ∝ √N_h，平衡按比例和等额分配
                            </p>
                        </div>
                        {onApplySquareRootAllocation && (
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => onApplySquareRootAllocation(squareRootAllocation)}
                                className="text-xs border-indigo-300 hover:bg-indigo-50 dark:border-indigo-700 dark:hover:bg-indigo-900/30"
                            >
                                应用
                            </Button>
                        )}
                    </div>

                    <div className="space-y-2">
                        {squareRootAllocation.map((layer) => (
                            <div key={layer.name} className="flex items-center gap-3">
                                <span className="text-xs text-indigo-600 dark:text-indigo-400 w-20 truncate">
                                    {layer.name}
                                </span>
                                <div className="flex-1 h-4 rounded bg-indigo-200/30 dark:bg-indigo-900/30 overflow-hidden">
                                    <div 
                                        className="h-full bg-indigo-500 rounded"
                                        style={{ width: `${layer.proportion * 100}%` }}
                                    />
                                </div>
                                <span className="text-xs font-mono w-8 text-right text-indigo-700 dark:text-indigo-300">
                                    {layer.sampleSize}
                                </span>
                            </div>
                        ))}
                    </div>

                    <div className="mt-3 p-2 rounded bg-indigo-50/50 dark:bg-indigo-900/20 border border-indigo-200/50 dark:border-indigo-700/30">
                        <p className="text-xs text-indigo-700/80 dark:text-indigo-300/80">
                            <Info className="w-3 h-3 inline mr-1" />
                            当各层规模差异很大时，平方根分配比按比例分配更均衡，比等额分配更考虑层规模。
                        </p>
                    </div>
                </div>

                {/* 费用最优分配 */}
                <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4 dark:border-emerald-700/50 dark:bg-emerald-950/30">
                    <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                            <DollarSign className="w-5 h-5 text-emerald-500" />
                            <div>
                                <h4 className="font-bold text-emerald-900 dark:text-emerald-100">费用最优分配</h4>
                                <p className="text-xs text-emerald-600/70 dark:text-emerald-400/70">
                                    在给定预算下达到最佳精度
                                </p>
                            </div>
                        </div>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setShowCostOptimization(!showCostOptimization)}
                            className={`text-xs ${
                                showCostOptimization 
                                    ? "bg-emerald-100 border-emerald-300 text-emerald-700" 
                                    : "border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-700 dark:text-emerald-400"
                            }`}
                        >
                            {showCostOptimization ? "隐藏费用优化" : "配置费用参数"}
                        </Button>
                    </div>

                    {showCostOptimization && (
                        <div className="space-y-4 mb-4">
                            {/* 预算设置 */}
                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1">
                                    <Label className="text-xs text-emerald-700 dark:text-emerald-300">总预算 (元)</Label>
                                    <Input
                                        type="number"
                                        value={totalBudget}
                                        onChange={(e) => setTotalBudget(parseInt(e.target.value) || 0)}
                                        className="bg-white dark:bg-emerald-950 border-emerald-200 dark:border-emerald-700"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <Label className="text-xs text-emerald-700 dark:text-emerald-300">固定成本 (元)</Label>
                                    <Input
                                        type="number"
                                        value={fixedCost}
                                        onChange={(e) => setFixedCost(parseInt(e.target.value) || 0)}
                                        className="bg-white dark:bg-emerald-950 border-emerald-200 dark:border-emerald-700"
                                    />
                                </div>
                            </div>

                            {/* 各层单位成本 */}
                            <div className="space-y-2">
                                <Label className="text-xs text-emerald-700 dark:text-emerald-300">各层单位调查成本 (元/样本)</Label>
                                <div className="grid grid-cols-2 gap-2">
                                    {layers.map((layer, index) => (
                                        <div key={layer.name} className="flex items-center gap-2">
                                            <span className="text-xs text-emerald-600 w-16 truncate">{layer.name}</span>
                                            <Input
                                                type="number"
                                                value={layerCosts[index]}
                                                onChange={(e) => {
                                                    const newCosts = [...layerCosts];
                                                    newCosts[index] = parseInt(e.target.value) || 0;
                                                    setLayerCosts(newCosts);
                                                }}
                                                className="flex-1 h-7 text-xs bg-white dark:bg-emerald-950 border-emerald-200 dark:border-emerald-700"
                                            />
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}

                    {costOptimizedResult && (
                        <div className="space-y-3">
                            <div className="grid grid-cols-2 gap-3 text-sm">
                                <div className="p-2 rounded bg-white dark:bg-emerald-950 border border-emerald-200 dark:border-emerald-700">
                                    <div className="text-xs text-emerald-600 dark:text-emerald-400">总样本量</div>
                                    <div className="font-bold text-emerald-900 dark:text-emerald-100">
                                        {costOptimizedResult.totalSampleSize.toLocaleString()}
                                    </div>
                                </div>
                                <div className="p-2 rounded bg-white dark:bg-emerald-950 border border-emerald-200 dark:border-emerald-700">
                                    <div className="text-xs text-emerald-600 dark:text-emerald-400">总成本</div>
                                    <div className="font-bold text-emerald-900 dark:text-emerald-100">
                                        ¥{costOptimizedResult.totalCost.toLocaleString()}
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-2">
                                {costOptimizedResult.allocation.map((layer) => (
                                    <div key={layer.layerName} className="flex items-center justify-between text-sm p-2 rounded bg-white/50 dark:bg-emerald-950/30">
                                        <span className="text-emerald-700 dark:text-emerald-300">{layer.layerName}</span>
                                        <div className="flex items-center gap-3">
                                            <span className="font-mono text-emerald-900 dark:text-emerald-100">
                                                n={layer.sampleSize}
                                            </span>
                                            <span className="text-xs text-emerald-600">
                                                ¥{layer.cost.toLocaleString()}
                                            </span>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            <div className="p-2 rounded bg-emerald-100/30 dark:bg-emerald-900/20 border border-emerald-200/50 dark:border-emerald-700/30">
                                <p className="text-xs text-emerald-700/80 dark:text-emerald-300/80">
                                    <CheckCircle2 className="w-3 h-3 inline mr-1" />
                                    公式: n_h = n × (N_h × S_h / √c_h) / Σ(N_i × S_i / √c_i)
                                </p>
                            </div>

                            {onApplyCostOptimizedAllocation && (
                                <Button
                                    onClick={() => onApplyCostOptimizedAllocation(
                                        costOptimizedResult.allocation.map(a => ({
                                            name: a.layerName,
                                            sampleSize: a.sampleSize,
                                            cost: a.cost,
                                        }))
                                    )}
                                    className="w-full bg-emerald-500 hover:bg-emerald-600 text-white"
                                    size="sm"
                                >
                                    应用费用最优分配
                                    <ArrowRight className="w-4 h-4 ml-2" />
                                </Button>
                            )}
                        </div>
                    )}

                    {!showCostOptimization && (
                        <div className="p-2 rounded bg-amber-50/50 dark:bg-amber-900/20 border border-amber-200/50 dark:border-amber-700/30">
                            <p className="text-xs text-amber-700/80 dark:text-amber-300/80">
                                <Info className="w-3 h-3 inline mr-1" />
                                费用最优分配考虑各层调查成本差异，在预算约束下实现估计方差最小化。
                                成本较高的层分配较少样本，成本较低的层分配较多样本。
                            </p>
                        </div>
                    )}
                </div>
            </CardContent>
        </Card>
    );
}
