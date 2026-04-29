import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
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
                        <PieChart className="size-5 text-info" />
                        <CardTitle className="text-base text-foreground">
                            不同比例估计的样本量对比
                        </CardTitle>
                    </div>
                </div>
                <CardDescription className="text-muted-foreground">
                    当估计比例(p)不同时，所需样本量的变化
                </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
                {/* 对比表格 */}
                <div className="flex flex-col gap-3">
                    {comparison.map((item, index) => {
                        const isSelected = item.p === 0.5; // 当前使用 p=0.5
                        const percentage = maxSampleSize > 0 ? (item.sampleSize / maxSampleSize) * 100 : 0;
                        
                        return (
                            <div 
                                key={index}
                                className={cn(
                                    "rounded-xl border bg-background p-3 transition-all",
                                    isSelected && "border-info/50 shadow-sm ring-1 ring-info/40",
                                )}
                            >
                                <div className="mb-2 flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <span className="font-bold text-foreground">
                                            p = {item.pLabel}
                                        </span>
                                        {isSelected && (
                                            <Badge variant="info">
                                                当前使用
                                            </Badge>
                                        )}
                                    </div>
                                    <span className="text-lg font-bold text-info">
                                        {item.sampleSize.toLocaleString()}
                                    </span>
                                </div>
                                
                                {/* 进度条 */}
                                <div className="mb-2 h-2 overflow-hidden rounded-full bg-muted">
                                    <div 
                                        className="h-full rounded-full bg-info transition-all"
                                        style={{ width: `${percentage}%` }}
                                    />
                                </div>
                                
                                <p className="text-xs text-foreground">
                                    {item.description}
                                </p>
                            </div>
                        );
                    })}
                </div>

                {/* 解释说明 */}
                <div className="student-callout student-callout-info p-3">
                    <div className="flex gap-2">
                        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-current" />
                        <div className="flex flex-col gap-1 text-xs text-foreground">
                            <p className="font-medium">为什么使用 p=0.5？</p>
                            <p>
                                当 p=0.5 时，p×(1-p) 达到最大值 0.25，此时方差最大，计算出的样本量最为保守。
                                这是一种稳健的做法，确保无论真实比例是多少，样本量都足够。
                            </p>
                        </div>
                    </div>
                </div>

                {/* 方差对比 */}
                <div className="rounded-xl border bg-background p-3">
                    <div className="mb-2 text-xs font-medium text-foreground">方差 p×(1-p) 对比</div>
                    <div className="flex flex-col gap-1.5 text-xs">
                        {comparison.map((item, index) => (
                            <div key={index} className="flex items-center justify-between">
                                <span className="text-muted-foreground">p = {item.pLabel}</span>
                                <div className="flex items-center gap-2">
                                    <div className="h-1.5 w-16 rounded-full bg-muted">
                                        <div 
                                            className="h-full rounded-full bg-info"
                                            style={{ width: `${(item.p * (1 - item.p) / 0.25) * 100}%` }}
                                        />
                                    </div>
                                    <span className="w-12 text-right text-foreground">
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
