import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { TrendingUp, Sigma, Target, Minus, Plus } from "lucide-react";
import type { MeanSampleSizeMetrics, SampleSizeMetrics } from "../experiment/sample-plan";
import { formatMarginOfError } from "../experiment/sample-plan-display";

interface EnhancedMetricsCardProps {
    metrics: SampleSizeMetrics | MeanSampleSizeMetrics | null;
    estimationType?: "proportion" | "mean";
    confidenceLevel?: string;  // "90" | "95" | "99"
    p?: number;                // 估计比例，默认0.5
    populationVariance?: number;
    finalSampleSize?: number;  // 学生实际选择的样本量（用于对比提示）
}

export function EnhancedMetricsCard({
    metrics,
    estimationType = "proportion",
    confidenceLevel = "95",
    p = 0.5,
    populationVariance,
    finalSampleSize,
}: EnhancedMetricsCardProps) {
    if (!metrics) return null;
    const isMeanEstimation = estimationType === "mean";
    const formattedMeanMetricMargin = formatMarginOfError(Number(metrics.marginOfError.toFixed(4)), "mean");

    // 格式化百分比
    const formatPercent = (value: number) => (value * 100).toFixed(2) + "%";

    // 格式化置信区间
    const formatCI = (value: number) => (value * 100).toFixed(1) + "%";

    const sizeDeviation = finalSampleSize !== undefined && finalSampleSize !== metrics.n;
    const metricTileClass = "rounded-xl border bg-background p-3";
    const metricLabelClass = "text-xs text-muted-foreground";
    const metricValueClass = "text-lg font-bold text-foreground";

    return (
        <Card className="rounded-2xl border-primary/20 bg-primary/10 shadow-sm">
            <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <TrendingUp className="size-5 text-primary" />
                        <CardTitle className="text-base text-foreground">
                            精度指标分析
                        </CardTitle>
                    </div>
                    <Badge variant="outline" className="bg-background text-xs text-primary">
                        {isMeanEstimation ? `基于 σ²=${populationVariance ?? "—"}` : `基于 p=${p}`}
                    </Badge>
                </div>
                <CardDescription className="text-muted-foreground">
                    基于简单随机抽样等效样本量 (n₁={Math.ceil(metrics.n1)}) 的精度估计
                </CardDescription>
                {sizeDeviation && (
                    <p className="mt-1 text-xs text-chart-4">
                        您选择的最终样本量 ({finalSampleSize}) 与公式推荐值 ({metrics.n}) 不同，实际精度可能有偏差
                    </p>
                )}
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
                {/* 核心指标 */}
                <div className={cn("grid gap-3", isMeanEstimation ? "grid-cols-3" : "grid-cols-2")}>
                    <div className={metricTileClass}>
                        <div className="mb-1 flex items-center gap-1.5">
                            <Sigma className="size-3.5 text-primary" />
                            <span className={metricLabelClass}>标准误差 (SE)</span>
                        </div>
                        <div className={metricValueClass}>
                            {isMeanEstimation ? metrics.standardError.toFixed(4) : formatPercent(metrics.standardError)}
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">
                            {isMeanEstimation ? "SE(ȳ) = √(σ²/n × FPC)" : "抽样方差的平方根"}
                        </div>
                    </div>

                    {isMeanEstimation ? (
                        <>
                            <div className={metricTileClass}>
                                <div className="mb-1 flex items-center gap-1.5">
                                    <Target className="size-3.5 text-primary" />
                                    <span className={metricLabelClass}>误差限 (ME)</span>
                                </div>
                                <div className={metricValueClass}>
                                    {formattedMeanMetricMargin}
                                </div>
                                <div className="mt-1 text-xs text-muted-foreground">
                                    ME = Z × SE
                                </div>
                            </div>
                            <div className={metricTileClass}>
                                <div className="mb-1 flex items-center gap-1.5">
                                    <Target className="size-3.5 text-primary" />
                                    <span className={metricLabelClass}>等效样本量</span>
                                </div>
                                <div className={metricValueClass}>
                                    {Math.ceil(metrics.n1).toLocaleString()}
                                </div>
                                <div className="mt-1 text-xs text-muted-foreground">
                                    有限总体校正后的 n₁
                                </div>
                            </div>
                        </>
                    ) : (
                        <div className={metricTileClass}>
                            <div className="mb-1 flex items-center gap-1.5">
                                <Target className="size-3.5 text-primary" />
                                <span className={metricLabelClass}>变异系数 (CV)</span>
                            </div>
                            <div className={metricValueClass}>
                                {formatPercent(metrics.relativeStandardError)}
                            </div>
                            <div className="mt-1 text-xs text-muted-foreground">
                                RSE = SE / p
                            </div>
                        </div>
                    )}
                </div>

                {isMeanEstimation ? (
                    <div className="rounded-xl border bg-background p-4">
                        <div className="mb-3 flex items-center gap-2">
                            <span className="text-sm font-medium text-foreground">{confidenceLevel}% 区间形式</span>
                            <Badge variant="outline" className="text-xs text-primary">
                                均值估计
                            </Badge>
                        </div>
                        <div className="flex flex-col gap-2 text-sm text-foreground">
                            <div className="rounded-lg bg-primary/10 px-3 py-2">
                                <span className="font-mono">ȳ ± Z×SE = ȳ ± {metrics.marginOfError.toFixed(4)}</span>
                            </div>
                            <p className="text-xs leading-relaxed text-muted-foreground">
                                这里展示的是当前样本量下的理论区间半宽。正式区间应以实际样本均值 ȳ 为中心，而不是预先假定一个真值中心。
                            </p>
                        </div>
                    </div>
                ) : (
                    <div className="rounded-xl border bg-background p-4">
                        <div className="mb-3 flex items-center gap-2">
                            <span className="text-sm font-medium text-foreground">{confidenceLevel}% 理论误差带</span>
                            <Badge variant="outline" className="text-xs text-primary">
                                比例估计
                            </Badge>
                        </div>
                        <div className="flex flex-wrap items-stretch justify-between gap-x-3 gap-y-4 sm:flex-nowrap sm:gap-x-4">
                            <div className="min-w-[5.5rem] flex-1 text-center">
                                <div className="mb-1 text-xs text-muted-foreground">下限</div>
                                <div className="flex items-center justify-center gap-1 text-chart-3">
                                    <Minus className="size-3 shrink-0" />
                                    <span className="font-bold tabular-nums">{formatCI(metrics.confidenceInterval.lower)}</span>
                                </div>
                            </div>
                            <div className="hidden min-h-[2.5rem] w-px shrink-0 self-center bg-border sm:block" aria-hidden />
                            <div className="min-w-[5.5rem] flex-1 text-center">
                                <div className="mb-1 text-xs text-muted-foreground">规划假设 p</div>
                                <div className="font-bold tabular-nums text-primary">{formatCI(p)}</div>
                            </div>
                            <div className="hidden min-h-[2.5rem] w-px shrink-0 self-center bg-border sm:block" aria-hidden />
                            <div className="min-w-[5.5rem] flex-1 text-center">
                                <div className="mb-1 text-xs text-muted-foreground">上限</div>
                                <div className="flex items-center justify-center gap-1 text-chart-3">
                                    <Plus className="size-3 shrink-0" />
                                    <span className="font-bold tabular-nums">{formatCI(metrics.confidenceInterval.upper)}</span>
                                </div>
                            </div>
                        </div>
                        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                            该范围基于当前规划假设 p 与样本量对应的理论误差限，用于教学说明。正式区间估计需以实际样本比例为中心重新计算。
                        </p>
                    </div>
                )}

                {/* 样本量计算过程 */}
                <div className="rounded-xl border bg-background p-3">
                    <div className="mb-2 text-xs font-medium text-foreground">样本量计算过程</div>
                    <div className="flex flex-col gap-1.5 font-mono text-xs">
                        <div className="flex justify-between">
                            <span className="text-muted-foreground">初始样本量 n₀</span>
                            <span className="text-foreground">{Math.ceil(metrics.n0).toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-muted-foreground">有限总体校正 n₁</span>
                            <span className="text-foreground">{Math.ceil(metrics.n1).toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between font-medium">
                            <span className="text-primary">最终样本量 n</span>
                            <span className="text-primary">{metrics.n.toLocaleString()}</span>
                        </div>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
