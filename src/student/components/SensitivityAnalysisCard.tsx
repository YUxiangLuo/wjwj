import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
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
    const confidenceDotClasses: Record<string, string> = {
        "90": "bg-chart-2",
        "95": "bg-chart-3",
        "99": "bg-chart-4",
    };

    const cellHeatClasses = (intensity: number, isCurrent: boolean) => {
        if (isCurrent) {
            return "bg-background shadow-sm ring-2 ring-primary/40";
        }
        if (intensity < 40) return "bg-primary/5";
        if (intensity < 55) return "bg-primary/10";
        if (intensity < 72) return "bg-primary/15";
        return "bg-primary/20";
    };

    return (
        <Card className="rounded-2xl border-primary/20 bg-primary/10 shadow-sm">
            <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Activity className="size-5 text-primary" />
                        <CardTitle className="text-base text-foreground">
                            样本量敏感性分析
                        </CardTitle>
                    </div>
                </div>
                <CardDescription className="text-muted-foreground">
                    样本量随置信水平和允许误差的变化
                </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
                {/* 热力图表格 */}
                <div className="overflow-x-auto">
                    <Table>
                        <TableHeader>
                            <TableRow className="bg-muted/70">
                                <TableHead className="h-auto py-2 normal-case tracking-normal text-foreground">置信水平 \ 允许误差</TableHead>
                                <TableHead className="h-auto py-2 text-center normal-case tracking-normal text-foreground">±1%</TableHead>
                                <TableHead className="h-auto py-2 text-center normal-case tracking-normal text-foreground">±2%</TableHead>
                                <TableHead className="h-auto py-2 text-center normal-case tracking-normal text-foreground">±3%</TableHead>
                                <TableHead className="h-auto py-2 text-center normal-case tracking-normal text-foreground">±5%</TableHead>
                                <TableHead className="h-auto py-2 text-center normal-case tracking-normal text-foreground">±7%</TableHead>
                                <TableHead className="h-auto py-2 text-center normal-case tracking-normal text-foreground">±10%</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {Object.entries(groupedByConfidence).map(([confidenceLevel, items]) => {
                                const isCurrentConfidence = confidenceLevel === currentConfidenceLevel;
                                
                                return (
                                    <TableRow
                                        key={confidenceLevel}
                                        className={cn(
                                            isCurrentConfidence && "bg-background/60",
                                        )}
                                    >
                                        <TableCell className="py-2">
                                            <div className="flex items-center gap-2">
                                                <div className={cn("size-2 rounded-full", confidenceDotClasses[confidenceLevel] ?? "bg-muted-foreground")} />
                                                <span className={cn("font-medium", isCurrentConfidence ? "text-foreground" : "text-muted-foreground")}>
                                                    {confidenceLevel}%
                                                </span>
                                                {isCurrentConfidence && (
                                                    <Badge variant="info">
                                                        当前
                                                    </Badge>
                                                )}
                                            </div>
                                        </TableCell>
                                        {items.map((item, idx) => {
                                            const isCurrentCell = isCurrentConfidence && item.marginOfError === currentMarginOfError;
                                            const intensity = getIntensity(item.sampleSize);
                                            
                                            return (
                                                <TableCell key={idx} className="px-1 py-1">
                                                    <div
                                                        className={cn(
                                                            "rounded-lg px-2 py-2 text-center font-mono text-xs",
                                                            cellHeatClasses(intensity, isCurrentCell),
                                                            isCurrentCell && "font-bold",
                                                        )}
                                                    >
                                                        <span className="tabular-nums text-foreground">
                                                            {item.sampleSize.toLocaleString()}
                                                        </span>
                                                    </div>
                                                </TableCell>
                                            );
                                        })}
                                    </TableRow>
                                );
                            })}
                        </TableBody>
                    </Table>
                </div>

                {/* 说明 */}
                <div className="flex items-start gap-2 rounded-xl border bg-background/80 p-3 text-xs text-foreground">
                    <Info className="mt-0.5 size-4 shrink-0 text-primary" />
                    <div className="flex flex-col gap-1">
                        <p>
                            <span className="font-medium">颜色深浅</span>：颜色越深表示样本量越大。行/列高亮显示当前设置。
                        </p>
                        <p>
                            <span className="font-medium">规律</span>：置信水平越高、允许误差越小，所需样本量越大。当允许误差从5%降至3%，样本量约增加2.8倍。
                        </p>
                    </div>
                </div>

                {/* 图例 */}
                <div className="flex flex-wrap items-center gap-4 text-xs text-foreground">
                    <div className="flex items-center gap-1.5">
                        <div className="size-3 rounded bg-chart-2" />
                        <span>90% 置信度</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <div className="size-3 rounded bg-chart-3" />
                        <span>95% 置信度</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <div className="size-3 rounded bg-chart-4" />
                        <span>99% 置信度</span>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
