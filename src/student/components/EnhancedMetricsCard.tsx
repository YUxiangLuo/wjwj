import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, Sigma, Target, Minus, Plus } from "lucide-react";
import type { SampleSizeMetrics } from "../experiment/sample-plan";

interface EnhancedMetricsCardProps {
    metrics: SampleSizeMetrics | null;
    confidenceLevel?: string;  // "90" | "95" | "99"
    p?: number;                // 估计比例，默认0.5
    finalSampleSize?: number;  // 学生实际选择的样本量（用于对比提示）
}

export function EnhancedMetricsCard({ metrics, confidenceLevel = "95", p = 0.5, finalSampleSize }: EnhancedMetricsCardProps) {
    if (!metrics) return null;

    // 格式化百分比
    const formatPercent = (value: number) => (value * 100).toFixed(2) + "%";

    // 格式化置信区间
    const formatCI = (value: number) => (value * 100).toFixed(1) + "%";

    const sizeDeviation = finalSampleSize !== undefined && finalSampleSize !== metrics.n;

    return (
        <Card className="rounded-2xl border-indigo-200/90 bg-indigo-50/90 shadow-sm dark:border-indigo-900/45 dark:bg-slate-950">
            <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <TrendingUp className="w-5 h-5 text-indigo-500" />
                        <CardTitle className="text-base text-indigo-900 dark:text-indigo-200">
                            精度指标分析
                        </CardTitle>
                    </div>
                    <Badge variant="outline" className="text-xs bg-indigo-100/50 border-indigo-200 text-indigo-700 dark:bg-indigo-900/30 dark:border-indigo-500/30 dark:text-indigo-300">
                        基于 p={p}
                    </Badge>
                </div>
                <CardDescription className="text-indigo-700 dark:text-indigo-300">
                    基于简单随机抽样等效样本量 (n={Math.ceil(metrics.n1)}) 的精度估计
                </CardDescription>
                {sizeDeviation && (
                    <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                        您选择的最终样本量 ({finalSampleSize}) 与公式推荐值 ({metrics.n}) 不同，实际精度可能有偏差
                    </p>
                )}
            </CardHeader>
            <CardContent className="space-y-4">
                {/* 核心指标 */}
                <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-xl border border-indigo-200 bg-white p-3 dark:border-indigo-800/45 dark:bg-slate-950">
                        <div className="flex items-center gap-1.5 mb-1">
                            <Sigma className="w-3.5 h-3.5 text-indigo-500" />
                            <span className="text-xs text-indigo-600 dark:text-indigo-400">标准误差 (SE)</span>
                        </div>
                        <div className="text-lg font-bold text-indigo-900 dark:text-indigo-100">
                            {formatPercent(metrics.standardError)}
                        </div>
                        <div className="text-xs text-indigo-500/70 mt-1">
                            抽样方差的平方根
                        </div>
                    </div>
                    
                    <div className="rounded-xl border border-indigo-200 bg-white p-3 dark:border-indigo-800/45 dark:bg-slate-950">
                        <div className="flex items-center gap-1.5 mb-1">
                            <Target className="w-3.5 h-3.5 text-indigo-500" />
                            <span className="text-xs text-indigo-600 dark:text-indigo-400">变异系数 (CV)</span>
                        </div>
                        <div className="text-lg font-bold text-indigo-900 dark:text-indigo-100">
                            {formatPercent(metrics.relativeStandardError)}
                        </div>
                        <div className="text-xs text-indigo-500/70 mt-1">
                            RSE = SE / p
                        </div>
                    </div>
                </div>

                {/* 置信区间 */}
                <div className="rounded-xl border border-indigo-200 bg-white p-4 dark:border-indigo-800/45 dark:bg-slate-950">
                    <div className="flex items-center gap-2 mb-3">
                        <span className="text-sm font-medium text-indigo-900 dark:text-indigo-100">{confidenceLevel}% 置信区间</span>
                        <Badge variant="outline" className="text-xs text-indigo-600 border-indigo-200 dark:border-indigo-500/30">
                            比例估计
                        </Badge>
                    </div>
                    <div className="flex flex-wrap items-stretch justify-between gap-x-3 gap-y-4 sm:flex-nowrap sm:gap-x-4">
                        <div className="min-w-[5.5rem] flex-1 text-center">
                            <div className="text-xs text-indigo-500 mb-1">下限</div>
                            <div className="flex items-center justify-center gap-1 text-emerald-600 dark:text-emerald-400">
                                <Minus className="w-3 h-3 shrink-0" />
                                <span className="font-bold tabular-nums">{formatCI(metrics.confidenceInterval.lower)}</span>
                            </div>
                        </div>
                        <div className="hidden min-h-[2.5rem] w-px shrink-0 self-center bg-indigo-300 dark:bg-indigo-600 sm:block" aria-hidden />
                        <div className="min-w-[5.5rem] flex-1 text-center">
                            <div className="text-xs text-indigo-500 mb-1">真值 p</div>
                            <div className="font-bold tabular-nums text-indigo-700 dark:text-indigo-300">{formatCI(p)}</div>
                        </div>
                        <div className="hidden min-h-[2.5rem] w-px shrink-0 self-center bg-indigo-300 dark:bg-indigo-600 sm:block" aria-hidden />
                        <div className="min-w-[5.5rem] flex-1 text-center">
                            <div className="text-xs text-indigo-500 mb-1">上限</div>
                            <div className="flex items-center justify-center gap-1 text-emerald-600 dark:text-emerald-400">
                                <Plus className="w-3 h-3 shrink-0" />
                                <span className="font-bold tabular-nums">{formatCI(metrics.confidenceInterval.upper)}</span>
                            </div>
                        </div>
                    </div>
                    <p className="text-xs text-indigo-600/70 mt-3 leading-relaxed">
                        如果重复调查100次，约{confidenceLevel}次的估计值会落入此区间
                    </p>
                </div>

                {/* 样本量计算过程 */}
                <div className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-950">
                    <div className="text-xs font-medium text-slate-800 dark:text-slate-200 mb-2">样本量计算过程</div>
                    <div className="space-y-1.5 text-xs font-mono">
                        <div className="flex justify-between">
                            <span className="text-slate-500">初始样本量 n₀</span>
                            <span className="text-slate-700 dark:text-slate-300">{Math.ceil(metrics.n0).toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-slate-500">有限总体校正 n₁</span>
                            <span className="text-slate-700 dark:text-slate-300">{Math.ceil(metrics.n1).toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between font-medium">
                            <span className="text-indigo-600 dark:text-indigo-400">最终样本量 n</span>
                            <span className="text-indigo-700 dark:text-indigo-300">{metrics.n.toLocaleString()}</span>
                        </div>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
