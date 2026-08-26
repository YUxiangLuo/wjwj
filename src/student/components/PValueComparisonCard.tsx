import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PieChart, AlertTriangle } from "lucide-react";

interface PValueComparisonCardProps {
    comparison: Array<{
        p: number;
        pLabel: string;
        sampleSize: number;
        description: string;
    }>;
    currentSampleSize: number;
}

export function PValueComparisonCard({ comparison, currentSampleSize }: PValueComparisonCardProps) {
    if (!comparison.length) return null;

    // 找出最大样本量（用于计算进度条）
    const maxSampleSize = Math.max(...comparison.map(c => c.sampleSize), currentSampleSize);

    return (
        <Card className="rounded-2xl border-info/20 bg-info/10 shadow-sm">
            <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <PieChart className="w-5 h-5 text-info" />
                        <CardTitle className="text-base text-info">
                            不同比例估计的样本量对比
                        </CardTitle>
                    </div>
                </div>
                <CardDescription className="text-info">
                    当估计比例(p)不同时，所需样本量的变化
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                {/* 对比表格 */}
                <div className="space-y-3">
                    {comparison.map((item, index) => {
                        const isSelected = item.p === 0.5; // 当前使用 p=0.5
                        const percentage = maxSampleSize > 0 ? (item.sampleSize / maxSampleSize) * 100 : 0;

                        return (
                            <div
                                key={index}
                                className={`rounded-xl border p-3 transition-all ${
                                    isSelected
                                        ? "border-info bg-background shadow-sm ring-1 ring-info/60"
                                        : "border-info/80 bg-background"
                                }`}
                            >
                                <div className="flex items-center justify-between mb-2">
                                    <div className="flex items-center gap-2">
                                        <span className="font-bold text-info">
                                            p = {item.pLabel}
                                        </span>
                                        {isSelected && (
                                            <Badge className="bg-info text-info-foreground text-xs">
                                                当前使用
                                            </Badge>
                                        )}
                                    </div>
                                    <span className="text-lg font-bold text-info">
                                        {item.sampleSize.toLocaleString()}
                                    </span>
                                </div>

                                {/* 进度条 */}
                                <div className="h-2 rounded-full bg-info/30 overflow-hidden mb-2">
                                    <div
                                        className="h-full rounded-full bg-info transition-all"
                                        style={{ width: `${percentage}%` }}
                                    />
                                </div>

                                <p className="text-xs text-info">
                                    {item.description}
                                </p>
                            </div>
                        );
                    })}
                </div>

                {/* 解释说明 */}
                <div className="rounded-xl border border-warning/20 bg-warning/10 p-3">
                    <div className="flex gap-2">
                        <AlertTriangle className="w-4 h-4 text-warning shrink-0 mt-0.5" />
                        <div className="text-xs text-warning space-y-1">
                            <p className="font-medium">为什么使用 p=0.5？</p>
                            <p className="text-warning">
                                当目标是控制比例估计的绝对 Wald 误差限时，p=0.5 使 p×(1-p) 达到最大值 0.25，因此给出该公式下最保守的样本量。
                                稀有事件、相对误差或最低期望事件数等目标不适用这条结论，应另行规划。
                            </p>
                        </div>
                    </div>
                </div>

                {/* 方差对比 */}
                <div className="rounded-xl border border-border bg-background p-3">
                    <div className="text-xs font-medium text-foreground mb-2">方差 p×(1-p) 对比</div>
                    <div className="space-y-1.5 text-xs">
                        {comparison.map((item, index) => (
                            <div key={index} className="flex justify-between items-center">
                                <span className="text-muted-foreground">p = {item.pLabel}</span>
                                <div className="flex items-center gap-2">
                                    <div className="w-16 h-1.5 rounded-full bg-muted-foreground/50">
                                        <div
                                            className="h-full rounded-full bg-info"
                                            style={{ width: `${(item.p * (1 - item.p) / 0.25) * 100}%` }}
                                        />
                                    </div>
                                    <span className="text-foreground/90 w-12 text-right">
                                        {(item.p * (1 - item.p)).toFixed(4)}
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
