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
        <Card className="rounded-2xl border-teal-200 bg-teal-50/80 shadow-sm dark:border-teal-500/20 dark:bg-teal-500/10">
            <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <PieChart className="w-5 h-5 text-teal-500" />
                        <CardTitle className="text-base text-teal-900 dark:text-teal-200">
                            不同比例估计的样本量对比
                        </CardTitle>
                    </div>
                </div>
                <CardDescription className="text-teal-700 dark:text-teal-300">
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
                                        ? "border-teal-300 bg-teal-100/50 dark:border-teal-400/40 dark:bg-teal-900/30" 
                                        : "border-teal-200/50 bg-white/50 dark:border-teal-500/10 dark:bg-teal-950/20"
                                }`}
                            >
                                <div className="flex items-center justify-between mb-2">
                                    <div className="flex items-center gap-2">
                                        <span className="font-bold text-teal-900 dark:text-teal-100">
                                            p = {item.pLabel}
                                        </span>
                                        {isSelected && (
                                            <Badge className="bg-teal-500 text-white text-xs">
                                                当前使用
                                            </Badge>
                                        )}
                                    </div>
                                    <span className="text-lg font-bold text-teal-700 dark:text-teal-300">
                                        {item.sampleSize.toLocaleString()}
                                    </span>
                                </div>
                                
                                {/* 进度条 */}
                                <div className="h-2 rounded-full bg-teal-200/30 dark:bg-teal-900/30 overflow-hidden mb-2">
                                    <div 
                                        className="h-full rounded-full bg-teal-500 transition-all"
                                        style={{ width: `${percentage}%` }}
                                    />
                                </div>
                                
                                <p className="text-xs text-teal-600/80 dark:text-teal-400/70">
                                    {item.description}
                                </p>
                            </div>
                        );
                    })}
                </div>

                {/* 解释说明 */}
                <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-3 dark:border-amber-500/20 dark:bg-amber-500/10">
                    <div className="flex gap-2">
                        <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                        <div className="text-xs text-amber-800 dark:text-amber-200 space-y-1">
                            <p className="font-medium">为什么使用 p=0.5？</p>
                            <p className="text-amber-700/80 dark:text-amber-300/80">
                                当 p=0.5 时，p×(1-p) 达到最大值 0.25，此时方差最大，计算出的样本量最为保守。
                                这是一种稳健的做法，确保无论真实比例是多少，样本量都足够。
                            </p>
                        </div>
                    </div>
                </div>

                {/* 方差对比 */}
                <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3 dark:border-slate-700 dark:bg-slate-900/40">
                    <div className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-2">方差 p×(1-p) 对比</div>
                    <div className="space-y-1.5 text-xs">
                        {comparison.map((item, index) => (
                            <div key={index} className="flex justify-between items-center">
                                <span className="text-slate-500">p = {item.pLabel}</span>
                                <div className="flex items-center gap-2">
                                    <div className="w-16 h-1.5 rounded-full bg-slate-200 dark:bg-slate-700">
                                        <div 
                                            className="h-full rounded-full bg-teal-500"
                                            style={{ width: `${(item.p * (1 - item.p) / 0.25) * 100}%` }}
                                        />
                                    </div>
                                    <span className="text-slate-700 dark:text-slate-300 w-12 text-right">
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
