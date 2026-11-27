import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { StatusBadge } from "@/components/StatusBadge";
import { PieChart } from "lucide-react";

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

    const maxSampleSize = Math.max(...comparison.map(c => c.sampleSize), currentSampleSize);

    return (
        <Card className="rounded-surface border-border bg-card">
            <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <PieChart className="w-5 h-5 text-primary" />
                        <CardTitle className="text-body text-foreground">
                            不同比例估计的样本量对比
                        </CardTitle>
                    </div>
                </div>
                <CardDescription className="text-muted-foreground">
                    当估计比例(p)不同时，所需样本量的变化
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="space-y-3">
                    {comparison.map((item, index) => {
                        const isSelected = item.p === 0.5;
                        const percentage = maxSampleSize > 0 ? (item.sampleSize / maxSampleSize) * 100 : 0;

                        return (
                            <div
                                key={index}
                                className={`rounded-surface border p-3.5 ${
                                    isSelected
                                        ? "border-primary-border bg-card"
                                        : "border-border bg-card"
                                }`}
                            >
                                <div className="flex items-center justify-between mb-2">
                                    <div className="flex items-center gap-2">
                                        <span className="font-medium tabular-nums text-foreground">
                                            p = {item.pLabel}
                                        </span>
                                        {isSelected && (
                                            <StatusBadge intent="primary">当前使用</StatusBadge>
                                        )}
                                    </div>
                                    <span className="text-subheading font-medium tabular-nums text-primary">
                                        {item.sampleSize.toLocaleString()}
                                    </span>
                                </div>

                                <div className="h-2 rounded-control bg-muted overflow-hidden mb-2">
                                    <div
                                        className="h-full rounded-control bg-primary transition-[width]"
                                        style={{ width: `${percentage}%` }}
                                    />
                                </div>

                                <p className="text-meta text-muted-foreground">
                                    {item.description}
                                </p>
                            </div>
                        );
                    })}
                </div>

                <div className="rounded-surface bg-muted p-3.5 text-meta text-muted-foreground space-y-1">
                    <p className="font-medium text-foreground">为什么使用 p=0.5？</p>
                    <p className="leading-relaxed">
                        当目标是控制比例估计的绝对 Wald 误差限时，p=0.5 使 p×(1-p) 达到最大值 0.25，因此给出该公式下最保守的样本量。
                        稀有事件、相对误差或最低期望事件数等目标不适用这条结论，应另行规划。
                    </p>
                </div>

                <div className="rounded-surface bg-muted p-3.5">
                    <div className="text-meta font-medium text-foreground mb-2">方差 p×(1-p) 对比</div>
                    <div className="space-y-1.5 text-meta tabular-nums">
                        {comparison.map((item, index) => (
                            <div key={index} className="flex justify-between items-center">
                                <span className="text-muted-foreground">p = {item.pLabel}</span>
                                <div className="flex items-center gap-2">
                                    <div className="w-16 h-1.5 rounded-control bg-secondary overflow-hidden">
                                        <div
                                            className="h-full rounded-control bg-primary"
                                            style={{ width: `${(item.p * (1 - item.p) / 0.25) * 100}%` }}
                                        />
                                    </div>
                                    <span className="font-mono text-foreground w-14 text-right">
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
