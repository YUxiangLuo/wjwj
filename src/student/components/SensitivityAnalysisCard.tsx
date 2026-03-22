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
        "90": "bg-emerald-500",
        "95": "bg-blue-500",
        "99": "bg-violet-500",
    };

    const cellHeatClasses = (intensity: number, isCurrent: boolean) => {
        if (isCurrent) {
            return "bg-white dark:bg-slate-950 ring-2 ring-indigo-500 dark:ring-indigo-400 shadow-sm";
        }
        if (intensity < 40) return "bg-indigo-50/95 dark:bg-indigo-950/45";
        if (intensity < 55) return "bg-indigo-100/90 dark:bg-indigo-900/40";
        if (intensity < 72) return "bg-indigo-200/85 dark:bg-indigo-800/35";
        return "bg-indigo-300/80 dark:bg-indigo-700/45";
    };

    return (
        <Card className="rounded-2xl border border-indigo-200/90 bg-indigo-50/90 shadow-sm dark:border-indigo-900/50 dark:bg-slate-950">
            <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Activity className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                        <CardTitle className="text-base text-slate-900 dark:text-slate-50">
                            样本量敏感性分析
                        </CardTitle>
                    </div>
                </div>
                <CardDescription className="text-slate-700 dark:text-slate-300">
                    样本量随置信水平和允许误差的变化
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                {/* 热力图表格 */}
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-slate-200 dark:border-slate-700 bg-slate-100/90 dark:bg-slate-900/90">
                                <th className="text-left py-2 px-2 text-slate-800 dark:text-slate-200 font-medium">置信水平 \ 允许误差</th>
                                <th className="text-center py-2 px-2 text-slate-800 dark:text-slate-200 font-medium">±1%</th>
                                <th className="text-center py-2 px-2 text-slate-800 dark:text-slate-200 font-medium">±2%</th>
                                <th className="text-center py-2 px-2 text-slate-800 dark:text-slate-200 font-medium">±3%</th>
                                <th className="text-center py-2 px-2 text-slate-800 dark:text-slate-200 font-medium">±5%</th>
                                <th className="text-center py-2 px-2 text-slate-800 dark:text-slate-200 font-medium">±7%</th>
                                <th className="text-center py-2 px-2 text-slate-800 dark:text-slate-200 font-medium">±10%</th>
                            </tr>
                        </thead>
                        <tbody>
                            {Object.entries(groupedByConfidence).map(([confidenceLevel, items]) => {
                                const isCurrentConfidence = confidenceLevel === currentConfidenceLevel;
                                
                                return (
                                    <tr 
                                        key={confidenceLevel}
                                        className={`border-b border-slate-200/80 dark:border-slate-800 ${
                                            isCurrentConfidence ? "bg-white/60 dark:bg-slate-900/60" : ""
                                        }`}
                                    >
                                        <td className="py-2 px-2">
                                            <div className="flex items-center gap-2">
                                                <div className={`w-2 h-2 rounded-full ${confidenceColors[confidenceLevel] || "bg-slate-400"}`} />
                                                <span className={`font-medium ${isCurrentConfidence ? "text-slate-900 dark:text-slate-100" : "text-slate-700 dark:text-slate-300"}`}>
                                                    {confidenceLevel}%
                                                </span>
                                                {isCurrentConfidence && (
                                                    <Badge variant="outline" className="text-xs border-indigo-300 text-indigo-800 dark:border-indigo-600 dark:text-indigo-200 bg-indigo-50 dark:bg-indigo-950/50">
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
                                                        <span className="text-slate-900 dark:text-slate-100 tabular-nums">
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
                <div className="flex items-start gap-2 text-xs text-slate-700 dark:text-slate-300 rounded-xl border border-slate-200 dark:border-slate-700 bg-white/80 dark:bg-slate-900/60 p-3">
                    <Info className="w-4 h-4 shrink-0 mt-0.5 text-indigo-600 dark:text-indigo-400" />
                    <div className="space-y-1">
                        <p>
                            <span className="font-medium">颜色深浅</span>：颜色越深表示样本量越大。行/列高亮显示当前设置。
                        </p>
                        <p>
                            <span className="font-medium">规律</span>：置信水平越高、允许误差越小，所需样本量越大。当允许误差从5%降至3%，样本量约增加2.8倍。
                        </p>
                    </div>
                </div>

                {/* 图例 */}
                <div className="flex flex-wrap items-center gap-4 text-xs text-slate-800 dark:text-slate-200">
                    <div className="flex items-center gap-1.5">
                        <div className="w-3 h-3 rounded bg-emerald-500" />
                        <span>90% 置信度</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <div className="w-3 h-3 rounded bg-blue-500" />
                        <span>95% 置信度</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <div className="w-3 h-3 rounded bg-violet-500" />
                        <span>99% 置信度</span>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
