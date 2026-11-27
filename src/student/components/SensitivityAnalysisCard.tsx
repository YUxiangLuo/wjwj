import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { StatusBadge } from "@/components/StatusBadge";
import { Activity, Info } from "lucide-react";

interface SensitivityAnalysisCardProps {
    matrix: Array<{
        confidenceLabel: string;
        confidenceLevel: string;
        marginOfError: number;
        sampleSize: number;
    }> | null;
    currentConfidenceLevel: string;
    currentMarginOfError: number;
}

export function SensitivityAnalysisCard({
    matrix,
    currentConfidenceLevel,
    currentMarginOfError
}: SensitivityAnalysisCardProps) {
    if (!matrix || matrix.length === 0) return null;

    const groupedByConfidence: Record<string, typeof matrix> = {};
    matrix?.forEach(item => {
        const group = groupedByConfidence[item.confidenceLevel];
        if (group) {
            group.push(item);
        } else {
            groupedByConfidence[item.confidenceLevel] = [item];
        }
    });

    const maxSampleSize = matrix ? Math.max(...matrix.map(m => m.sampleSize)) : 0;
    const minSampleSize = matrix ? Math.min(...matrix.map(m => m.sampleSize)) : 0;
    const currentConfidenceItems = groupedByConfidence[currentConfidenceLevel] ?? [];
    const sampleAtThreePercent = currentConfidenceItems.find((item) => item.marginOfError === 3)?.sampleSize;
    const sampleAtFivePercent = currentConfidenceItems.find((item) => item.marginOfError === 5)?.sampleSize;
    const correctedRatio = sampleAtThreePercent && sampleAtFivePercent
        ? sampleAtThreePercent / sampleAtFivePercent
        : null;

    const getIntensity = (sampleSize: number) => {
        const ratio = maxSampleSize > minSampleSize
            ? (sampleSize - minSampleSize) / (maxSampleSize - minSampleSize)
            : 0;
        return 20 + Math.round(ratio * 80);
    };

    return (
        <Card className="rounded-surface border-border bg-card">
            <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Activity className="w-5 h-5 text-primary" />
                        <CardTitle className="text-body text-foreground">
                            样本量敏感性分析
                        </CardTitle>
                    </div>
                </div>
                <CardDescription className="text-muted-foreground">
                    样本量随置信水平和允许误差的变化
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="overflow-x-auto rounded-surface border border-border">
                    <table className="w-full text-label">
                        <thead>
                            <tr className="border-b border-border bg-muted">
                                <th className="text-left py-2.5 px-3 text-muted-foreground font-medium">置信水平 \ 允许误差</th>
                                <th className="text-center py-2.5 px-2 text-muted-foreground font-medium tabular-nums">±1%</th>
                                <th className="text-center py-2.5 px-2 text-muted-foreground font-medium tabular-nums">±2%</th>
                                <th className="text-center py-2.5 px-2 text-muted-foreground font-medium tabular-nums">±3%</th>
                                <th className="text-center py-2.5 px-2 text-muted-foreground font-medium tabular-nums">±5%</th>
                                <th className="text-center py-2.5 px-2 text-muted-foreground font-medium tabular-nums">±7%</th>
                                <th className="text-center py-2.5 px-2 text-muted-foreground font-medium tabular-nums">±10%</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                            {Object.entries(groupedByConfidence).map(([confidenceLevel, items]) => {
                                const isCurrentConfidence = confidenceLevel === currentConfidenceLevel;

                                return (
                                    <tr key={confidenceLevel} className="bg-card">
                                        <td className="py-2 px-3">
                                            <div className="flex items-center gap-2">
                                                <span className="font-medium tabular-nums text-foreground">
                                                    {confidenceLevel}%
                                                </span>
                                                {isCurrentConfidence && (
                                                    <StatusBadge intent="primary">当前</StatusBadge>
                                                )}
                                            </div>
                                        </td>
                                        {items.map((item, idx) => {
                                            const isCurrentCell = isCurrentConfidence && item.marginOfError === currentMarginOfError;
                                            const intensity = getIntensity(item.sampleSize);

                                            return (
                                                <td key={idx} className="py-1.5 px-1">
                                                    <div
                                                        className={`
                                                            rounded-control py-2 px-2 text-center font-mono text-meta
                                                            ${getSensitivityHeatClass(intensity, isCurrentCell)}
                                                            ${isCurrentCell ? "font-medium" : ""}
                                                        `}
                                                    >
                                                        <span className="text-foreground tabular-nums">
                                                            {item.sampleSize.toLocaleString()}
                                                        </span>
                                                    </div>
                                                </td>
                                            );
                                        })}
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>

                <div className="flex items-start gap-2 text-meta text-muted-foreground rounded-surface bg-muted p-3.5">
                    <Info className="w-4 h-4 shrink-0 mt-0.5 text-muted-foreground" />
                    <div className="space-y-1 leading-relaxed">
                        <p>
                            <span className="font-medium text-foreground">颜色深浅</span>：颜色越深表示样本量越大，描边高亮显示当前设置。
                        </p>
                        <p>
                            <span className="font-medium text-foreground">规律</span>：置信水平越高、允许误差越小，所需样本量越大。仅在未校正 n₀ 且其他参数固定时，5%降至3%的理论倍数为 (5/3)²≈2.78；
                            {correctedRatio !== null
                                ? `当前表格在 ${currentConfidenceLevel}% 置信水平下，经有限总体、设计效应、无回答和封顶处理后的实际倍数为 ${correctedRatio.toFixed(2)}。`
                                : "有限总体校正和封顶后应以表格计算值为准。"}
                        </p>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}

export function getSensitivityHeatClass(intensity: number, isCurrent: boolean) {
    if (isCurrent) return "bg-card ring-2 ring-primary";
    if (intensity < 40) return "bg-heatmap-low";
    if (intensity < 55) return "bg-heatmap-moderate";
    if (intensity < 72) return "bg-heatmap-high";
    return "bg-heatmap-maximum";
}
