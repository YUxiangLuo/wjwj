import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, Sigma, Target, Minus, Plus } from "lucide-react";
import type { MeanSampleSizeMetrics, SampleSizeMetrics } from "../experiment/sample-plan";
import { formatMarginOfError } from "../experiment/sample-plan-display";

interface EnhancedMetricsCardProps {
    metrics: SampleSizeMetrics | MeanSampleSizeMetrics | null;
    estimationType?: "proportion" | "mean";
    confidenceLevel?: string; // "90" | "95" | "99"
    p?: number;        // 估计比例，默认0.5
    populationVariance?: number;
    finalSampleSize?: number; // 学生实际选择的样本量（用于对比提示）
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

    return (
        <Card className="rounded-surface border-primary-border bg-primary-muted ">
            <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <TrendingUp className="w-5 h-5 text-primary" />
                        <CardTitle className="text-body text-primary">
                            精度指标分析
                        </CardTitle>
                    </div>
                    <Badge variant="outline" className="text-meta bg-primary-muted border-primary-border text-primary">
                        {isMeanEstimation ? `基于 σ²=${populationVariance ?? "—"}` : `基于 p=${p}`}
                    </Badge>
                </div>
                <CardDescription className="text-primary">
                    基于预期完成样本量（{Math.ceil(metrics.expectedCompleted).toLocaleString()}）与设计效应后的规划精度
                </CardDescription>
                {metrics.cappedAtPopulation && (
                    <p className="text-meta text-warning mt-1">
                        邀请数已封顶为全体发放（n = {metrics.n}）；预期完成约 {Math.ceil(metrics.expectedCompleted).toLocaleString()} 个有效样本。若存在无回答，这不等于完整普查或零误差。
                    </p>
                )}
                {metrics.precisionUnreachable && (
                    <p className="text-meta text-destructive mt-1">
                        目标精度不可达：预期误差限大于设定目标。
                    </p>
                )}
                {sizeDeviation && (
                    <p className="text-meta text-warning mt-1">
                        您选择的最终样本量 ({finalSampleSize}) 与公式推荐值 ({metrics.n}) 不同，实际精度可能有偏差
                    </p>
                )}
            </CardHeader>
            <CardContent className="space-y-4">
                {/* 核心指标 */}
                <div className={`grid gap-3 ${isMeanEstimation ? "grid-cols-3" : "grid-cols-2"}`}>
                    <div className="rounded-surface border border-primary bg-background p-3">
                        <div className="flex items-center gap-1.5 mb-1">
                            <Sigma className="w-3.5 h-3.5 text-primary" />
                            <span className="text-meta text-primary">标准误差 (SE)</span>
                        </div>
                        <div className="text-subheading font-bold text-primary">
                            {isMeanEstimation ? metrics.standardError.toFixed(4) : formatPercent(metrics.standardError)}
                        </div>
                        <div className="text-meta text-primary mt-1">
                            {isMeanEstimation ? "SE(ȳ) = √[σ²/n × (N−n)/(N−1)]" : "SE = √[p(1−p)/n × (N−n)/(N−1)]"}
                        </div>
                    </div>

                    {isMeanEstimation ? (
                        <>
                            <div className="rounded-surface border border-primary bg-background p-3">
                                <div className="flex items-center gap-1.5 mb-1">
                                    <Target className="w-3.5 h-3.5 text-primary" />
                                    <span className="text-meta text-primary">误差限 (ME)</span>
                                </div>
                                <div className="text-subheading font-bold text-primary">
                                    {formattedMeanMetricMargin}
                                </div>
                                <div className="text-meta text-primary mt-1">
                                    ME = Z × SE
                                </div>
                            </div>
                            <div className="rounded-surface border border-primary bg-background p-3">
                                <div className="flex items-center gap-1.5 mb-1">
                                    <Target className="w-3.5 h-3.5 text-primary" />
                                    <span className="text-meta text-primary">等效样本量</span>
                                </div>
                                <div className="text-subheading font-bold text-primary">
                                    {Math.ceil(metrics.expectedCompleted).toLocaleString()}
                                </div>
                                <div className="text-meta text-primary mt-1">
                                    预期完成样本量
                                </div>
                            </div>
                        </>
                    ) : (
                        <div className="rounded-surface border border-primary bg-background p-3">
                            <div className="flex items-center gap-1.5 mb-1">
                                <Target className="w-3.5 h-3.5 text-primary" />
                                <span className="text-meta text-primary">变异系数 (CV)</span>
                            </div>
                            <div className="text-subheading font-bold text-primary">
                                {formatPercent(metrics.relativeStandardError)}
                            </div>
                            <div className="text-meta text-primary mt-1">
                                RSE = SE / p
                            </div>
                        </div>
                    )}
                </div>

                {isMeanEstimation ? (
                    <div className="rounded-surface border border-primary bg-background p-4">
                        <div className="flex items-center gap-2 mb-3">
                            <span className="text-label font-medium text-primary">{confidenceLevel}% 规划假设下的预期半宽</span>
                            <Badge variant="outline" className="text-meta text-primary border-primary">
                                均值估计
                            </Badge>
                        </div>
                        <div className="space-y-2 text-label text-primary">
                            <div className="rounded-surface bg-primary-muted px-3 py-2">
                                <span className="font-mono">ȳ ± Z×SE = ȳ ± {metrics.marginOfError.toFixed(4)}</span>
                            </div>
                            <p className="text-meta leading-relaxed text-primary">
                                这里展示的是当前样本量下的理论区间半宽。正式区间应以实际样本均值 ȳ 为中心，而不是预先假定一个真值中心。
                            </p>
                        </div>
                    </div>
                ) : (
                    <div className="rounded-surface border border-primary bg-background p-4">
                        <div className="flex items-center gap-2 mb-3">
                            <span className="text-label font-medium text-primary">{confidenceLevel}% 规划假设下的预期误差带</span>
                            <Badge variant="outline" className="text-meta text-primary border-primary">
                                比例估计
                            </Badge>
                        </div>
                        <div className="flex items-stretch justify-between gap-y-4 flex-nowrap gap-x-4">
                            <div className="min-w-[5.5rem] flex-1 text-center">
                                <div className="text-meta text-primary mb-1">下限</div>
                                <div className="flex items-center justify-center gap-1 text-success">
                                    <Minus className="w-3 h-3 shrink-0" />
                                    <span className="font-bold tabular-nums">{formatCI(metrics.confidenceInterval.lower)}</span>
                                </div>
                            </div>
                            <div className="min-h-[2.5rem] w-px shrink-0 self-center bg-primary" aria-hidden />
                            <div className="min-w-[5.5rem] flex-1 text-center">
                                <div className="text-meta text-primary mb-1">规划假设 p</div>
                                <div className="font-bold tabular-nums text-primary">{formatCI(p)}</div>
                            </div>
                            <div className="min-h-[2.5rem] w-px shrink-0 self-center bg-primary" aria-hidden />
                            <div className="min-w-[5.5rem] flex-1 text-center">
                                <div className="text-meta text-primary mb-1">上限</div>
                                <div className="flex items-center justify-center gap-1 text-success">
                                    <Plus className="w-3 h-3 shrink-0" />
                                    <span className="font-bold tabular-nums">{formatCI(metrics.confidenceInterval.upper)}</span>
                                </div>
                            </div>
                        </div>
                        <p className="text-meta text-primary mt-3 leading-relaxed">
                            该范围基于当前规划假设 p 与样本量对应的理论误差限，用于教学说明。正式区间估计需以实际样本比例为中心重新计算。
                        </p>
                    </div>
                )}

                {/* 样本量计算过程 */}
                <div className="rounded-surface border border-border bg-background p-3">
                    <div className="text-meta font-medium text-foreground mb-2">样本量计算过程</div>
                    <div className="space-y-1.5 text-meta font-mono">
                        <div className="flex justify-between">
                            <span className="text-muted-foreground">初始样本量 n₀</span>
                            <span className="text-foreground">{Math.ceil(metrics.n0).toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-muted-foreground">设计效应后 n₁</span>
                            <span className="text-foreground">{metrics.nDeff.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-muted-foreground">有限总体校正 n₂</span>
                            <span className="text-foreground">{metrics.nFpc.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-muted-foreground">预期完成</span>
                            <span className="text-foreground">{Math.ceil(metrics.expectedCompleted).toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between font-medium">
                            <span className="text-primary">计划邀请数 n</span>
                            <span className="text-primary">{metrics.n.toLocaleString()}</span>
                        </div>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
