import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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

    // 组织数据：按置信水平分组
    const groupedByConfidence: Record<string, typeof matrix> = {};
    matrix?.forEach(item => {
        const group = groupedByConfidence[item.confidenceLevel];
        if (group) {
            group.push(item);
        } else {
            groupedByConfidence[item.confidenceLevel] = [item];
        }
    });

    // 找出最大样本量（用于颜色编码）
    const maxSampleSize = matrix ? Math.max(...matrix.map(m => m.sampleSize)) : 0;
    const minSampleSize = matrix ? Math.min(...matrix.map(m => m.sampleSize)) : 0;
    const currentConfidenceItems = groupedByConfidence[currentConfidenceLevel] ?? [];
    const sampleAtThreePercent = currentConfidenceItems.find((item) => item.marginOfError === 3)?.sampleSize;
    const sampleAtFivePercent = currentConfidenceItems.find((item) => item.marginOfError === 5)?.sampleSize;
    const correctedRatio = sampleAtThreePercent && sampleAtFivePercent
        ? sampleAtThreePercent / sampleAtFivePercent
        : null;

    // 获取颜色强度
    const getIntensity = (sampleSize: number) => {
        const ratio = maxSampleSize > minSampleSize 
            ? (sampleSize - minSampleSize) / (maxSampleSize - minSampleSize)
            : 0;
        // 返回 20-100 的范围
        return 20 + Math.round(ratio * 80);
    };

    // 置信水平颜色映射
    const confidenceColors: Record<string, string> = {
        "90": "bg-success",
        "95": "bg-info",
        "99": "bg-auxiliary",
    };

    const cellHeatClasses = (intensity: number, isCurrent: boolean) => {
        if (isCurrent) {
            return "bg-background ring-2 ring-primary shadow-sm";
        }
        if (intensity < 40) return "bg-primary/10";
        if (intensity < 55) return "bg-primary/20";
        if (intensity < 72) return "bg-primary/30";
        return "bg-primary/40";
    };

    return (
        <Card className="rounded-2xl border border-primary/20 bg-primary/10 shadow-sm">
            <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Activity className="w-5 h-5 text-primary" />
                        <CardTitle className="text-base text-foreground">
                            样本量敏感性分析
                        </CardTitle>
                    </div>
                </div>
                <CardDescription className="text-foreground/90">
                    样本量随置信水平和允许误差的变化
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                {/* 热力图表格 */}
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-border bg-muted/90">
                                <th className="text-left py-2 px-2 text-foreground font-medium">置信水平 \ 允许误差</th>
                                <th className="text-center py-2 px-2 text-foreground font-medium">±1%</th>
                                <th className="text-center py-2 px-2 text-foreground font-medium">±2%</th>
                                <th className="text-center py-2 px-2 text-foreground font-medium">±3%</th>
                                <th className="text-center py-2 px-2 text-foreground font-medium">±5%</th>
                                <th className="text-center py-2 px-2 text-foreground font-medium">±7%</th>
                                <th className="text-center py-2 px-2 text-foreground font-medium">±10%</th>
                            </tr>
                        </thead>
                        <tbody>
                            {Object.entries(groupedByConfidence).map(([confidenceLevel, items]) => {
                                const isCurrentConfidence = confidenceLevel === currentConfidenceLevel;
                                
                                return (
                                    <tr 
                                        key={confidenceLevel}
                                        className={`border-b border-border/80 ${
                                            isCurrentConfidence ? "bg-background/60" : ""
                                        }`}
                                    >
                                        <td className="py-2 px-2">
                                            <div className="flex items-center gap-2">
                                                <div className={`w-2 h-2 rounded-full ${confidenceColors[confidenceLevel] || "bg-muted-foreground/50"}`} />
                                                <span className={`font-medium ${isCurrentConfidence ? "text-foreground" : "text-foreground/90"}`}>
                                                    {confidenceLevel}%
                                                </span>
                                                {isCurrentConfidence && (
                                                    <Badge variant="outline" className="text-xs border-primary/20 text-primary bg-primary/10">
                                                        当前
                                                    </Badge>
                                                )}
                                            </div>
                                        </td>
                                        {items.map((item, idx) => {
                                            const isCurrentCell = isCurrentConfidence && item.marginOfError === currentMarginOfError;
                                            const intensity = getIntensity(item.sampleSize);
                                            
                                            return (
                                                <td key={idx} className="py-1 px-1">
                                                    <div
                                                        className={`
                                                            rounded-lg py-2 px-2 text-center font-mono text-xs
                                                            ${cellHeatClasses(intensity, isCurrentCell)}
                                                            ${isCurrentCell ? "font-bold" : ""}
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

                {/* 说明 */}
                <div className="flex items-start gap-2 text-xs text-foreground/90 rounded-xl border border-border bg-background/80 p-3">
                    <Info className="w-4 h-4 shrink-0 mt-0.5 text-primary" />
                    <div className="space-y-1">
                        <p>
                            <span className="font-medium">颜色深浅</span>：颜色越深表示样本量越大。行/列高亮显示当前设置。
                        </p>
                        <p>
                            <span className="font-medium">规律</span>：置信水平越高、允许误差越小，所需样本量越大。仅在未校正 n₀ 且其他参数固定时，5%降至3%的理论倍数为 (5/3)²≈2.78；
                            {correctedRatio !== null
                                ? `当前表格在 ${currentConfidenceLevel}% 置信水平下，经有限总体、设计效应、无回答和封顶处理后的实际倍数为 ${correctedRatio.toFixed(2)}。`
                                : "有限总体校正和封顶后应以表格计算值为准。"}
                        </p>
                    </div>
                </div>

                {/* 图例 */}
                <div className="flex flex-wrap items-center gap-4 text-xs text-foreground">
                    <div className="flex items-center gap-1.5">
                        <div className="w-3 h-3 rounded bg-success" />
                        <span>90% 置信度</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <div className="w-3 h-3 rounded bg-info" />
                        <span>95% 置信度</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <div className="w-3 h-3 rounded bg-auxiliary" />
                        <span>99% 置信度</span>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
