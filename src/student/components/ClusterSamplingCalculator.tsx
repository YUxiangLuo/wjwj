import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { 
    Calculator, 
    Layers, 
    Info,
    ArrowRight,
    AlertTriangle
} from "lucide-react";
import { calculateClusterSamplingSize, type ClusterSamplingResult } from "../experiment/sample-plan";
import { nonResponseDecimalToFormPercent } from "./inherit-planning-params";

interface ClusterSamplingCalculatorProps {
    populationSize: number;
    /** 决策面板传入，作为本工具内可改的初值 */
    confidenceLevel: string;
    marginOfError: number;
    /** 与决策面板一致，小数形式 0～1（如 0.1 表示 10%） */
    initialNonResponseRate?: number;
    onApplyResult?: (clusters: number, sampleSize: number) => void;
}

export function ClusterSamplingCalculator({
    populationSize,
    confidenceLevel,
    marginOfError,
    initialNonResponseRate,
    onApplyResult
}: ClusterSamplingCalculatorProps) {
    const sliderClass =
        "py-2 [&_[data-slot=slider-range]]:!bg-primary [&_[data-slot=slider-track]]:!bg-muted [&_[data-slot=slider-thumb]]:!border-primary [&_[data-slot=slider-thumb]]:!bg-background [&_[data-slot=slider-thumb]]:!ring-primary/25";

    const [confidenceLevelLocal, setConfidenceLevelLocal] = useState(() => confidenceLevel);
    const [marginOfErrorLocal, setMarginOfErrorLocal] = useState(() => marginOfError);

    const [clusterSize, setClusterSize] = useState(50);  // 群规模（每群平均人数）
    const [deff, setDeff] = useState(2.0);  // 设计效应
    const [nonResponseRate, setNonResponseRate] = useState(() =>
        nonResponseDecimalToFormPercent(initialNonResponseRate),
    );
    const [result, setResult] = useState<ClusterSamplingResult | null>(null);

    // 父级决策参数变化时同步本地
    useEffect(() => {
        setConfidenceLevelLocal(confidenceLevel);
    }, [confidenceLevel]);
    useEffect(() => {
        setMarginOfErrorLocal(marginOfError);
    }, [marginOfError]);
    useEffect(() => {
        setNonResponseRate(nonResponseDecimalToFormPercent(initialNonResponseRate));
    }, [initialNonResponseRate]);

    // 计算整群抽样
    useEffect(() => {
        const newResult = calculateClusterSamplingSize({
            populationSize,
            confidenceLevel: confidenceLevelLocal,
            marginOfError: marginOfErrorLocal,
            clusterSize,
            deff,
            nonResponseRate: nonResponseRate / 100,
        });
        setResult(newResult);
    }, [populationSize, confidenceLevelLocal, marginOfErrorLocal, clusterSize, deff, nonResponseRate]);

    return (
        <Card className="rounded-2xl border-primary/20 bg-primary/10 shadow-sm">
            <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Layers className="size-5 text-primary" />
                        <CardTitle className="text-base text-foreground">
                            整群抽样样本量计算
                        </CardTitle>
                    </div>
                    <Badge 
                        variant="outline" 
                        className="bg-background text-xs text-primary"
                    >
                        设计效应应用
                    </Badge>
                </div>
                <CardDescription className="text-muted-foreground">
                    计算整群抽样中所需群数和总样本量
                </CardDescription>
            </CardHeader>

            <CardContent className="flex flex-col gap-4">
                {/* 说明 */}
                <div className="rounded-xl border border-chart-3/20 bg-chart-3/10 p-3">
                    <div className="flex gap-2">
                        <Info className="mt-0.5 size-4 shrink-0 text-chart-3" />
                        <div className="flex flex-col gap-1 text-xs text-foreground">
                            <p className="font-medium">什么是整群抽样？</p>
                            <p>
                                整群抽样以"群"为单位抽样（如整栋居民楼、整个班级），群内所有单元都调查。
                                由于群内单元通常同质性高，需要更大的样本量来补偿（设计效应 deff &gt; 1）。
                            </p>
                        </div>
                    </div>
                </div>

                {/* 参数设置 */}
                <div className="flex flex-col gap-4">
                    {/* 群规模 */}
                    <div className="flex flex-col gap-2">
                        <div className="flex items-center justify-between">
                            <Label className="text-xs text-primary">
                                平均群规模（每群人数）
                            </Label>
                            <span className="text-sm font-bold text-foreground">
                                {clusterSize} 人
                            </span>
                        </div>
                        <Slider
                            value={[clusterSize]}
                            onValueChange={(v) => setClusterSize(v[0] ?? 50)}
                            min={10}
                            max={500}
                            step={10}
                            className={sliderClass}
                        />
                        <p className="text-xs text-muted-foreground">
                            例如：每栋楼平均50户、每班平均30名学生
                        </p>
                    </div>

                    {/* 设计效应 */}
                    <div className="flex flex-col gap-2">
                        <div className="flex items-center justify-between">
                            <Label className="text-xs text-primary">
                                设计效应 (deff)
                            </Label>
                            <span className="text-sm font-bold text-foreground">
                                {deff.toFixed(1)}
                            </span>
                        </div>
                        <Slider
                            value={[deff]}
                            onValueChange={(v) => setDeff(v[0] ?? 2)}
                            min={1}
                            max={5}
                            step={0.1}
                            className={sliderClass}
                        />
                        <div className="flex justify-between text-xs text-muted-foreground">
                            <span>1.0 (简单随机)</span>
                            <span>2.0 (中等)</span>
                            <span>5.0 (高度聚集)</span>
                        </div>
                    </div>

                    {/* 其他参数（继承决策面板，可在本工具内调整） */}
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div className="flex flex-col gap-1.5">
                            <Label className="text-xs text-primary">置信水平</Label>
                            <Select value={confidenceLevelLocal} onValueChange={setConfidenceLevelLocal}>
                                <SelectTrigger size="sm">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectGroup>
                                        <SelectItem value="90">90%</SelectItem>
                                        <SelectItem value="95">95%</SelectItem>
                                        <SelectItem value="99">99%</SelectItem>
                                    </SelectGroup>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="flex flex-col gap-1.5">
                            <div className="flex justify-between">
                                <Label className="text-xs text-primary">允许误差</Label>
                                <span className="text-xs font-bold tabular-nums text-chart-3">
                                    ±{marginOfErrorLocal}%
                                </span>
                            </div>
                            <Slider
                                value={[marginOfErrorLocal]}
                                onValueChange={([v]) => v != null && setMarginOfErrorLocal(v)}
                                min={1}
                                max={10}
                                step={1}
                                className={sliderClass}
                            />
                        </div>
                    </div>

                    <div className="flex flex-col gap-1">
                        <Label className="text-xs text-primary">无回答率 (%)</Label>
                        <Input
                            type="number"
                            value={nonResponseRate}
                            onChange={(e) => setNonResponseRate(parseFloat(e.target.value) || 0)}
                            className="bg-background text-foreground"
                            min={0}
                            max={50}
                            step={1}
                        />
                    </div>
                </div>

                {/* 计算结果 */}
                {result && (
                    <div className="rounded-xl border-2 border-primary/30 bg-background p-4 shadow-sm">
                        <div className="mb-4 flex items-center gap-2">
                            <Calculator className="size-5 text-primary" />
                            <span className="font-bold text-foreground">计算结果</span>
                        </div>

                        <div className="flex flex-col gap-4">
                            {/* 主要结果 */}
                            <div className="grid grid-cols-2 gap-4">
                                <div className="rounded-lg border bg-background p-3 text-center">
                                    <div className="mb-1 text-xs text-muted-foreground">所需群数</div>
                                    <div className="text-2xl font-bold tabular-nums text-primary">
                                        {result.requiredClusters}
                                    </div>
                                    <div className="text-xs text-muted-foreground">个群</div>
                                </div>
                                <div className="rounded-lg border bg-background p-3 text-center">
                                    <div className="mb-1 text-xs text-muted-foreground">总样本量</div>
                                    <div className="text-2xl font-bold tabular-nums text-chart-3">
                                        {result.requiredSampleSize.toLocaleString()}
                                    </div>
                                    <div className="text-xs text-muted-foreground">人</div>
                                </div>
                            </div>

                            {/* 设计效应说明 */}
                            <div className="rounded-lg border bg-background p-3">
                                <div className="flex flex-col gap-2 text-sm">
                                    <div className="flex items-center justify-between">
                                        <span className="text-muted-foreground">设计效应 (deff)</span>
                                        <span className="font-mono font-bold text-foreground">
                                            {result.deff.toFixed(2)}
                                        </span>
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <span className="text-muted-foreground">估计群内相关系数 (ρ)</span>
                                        <span className="font-mono font-bold text-foreground">
                                            {result.intraClassCorrelation.toFixed(3)}
                                        </span>
                                    </div>
                                </div>
                            </div>

                            {/* 公式解释 */}
                            <div className="rounded-lg border border-chart-4/20 bg-chart-4/10 p-2">
                                <div className="flex items-start gap-2">
                                    <AlertTriangle className="mt-0.5 size-4 shrink-0 text-chart-4" />
                                    <p className="text-xs text-foreground">
                                        {result.explanation} 群内相关系数 ρ = (deff-1)/(M-1)，
                                        其中 M={clusterSize} 为群规模。ρ 越大说明群内同质性越高，
                                        需要的补偿样本量越大。
                                    </p>
                                </div>
                            </div>

                            {/* 应用按钮 */}
                            {onApplyResult && (
                                <>
                                    <p className="text-xs leading-relaxed text-muted-foreground">
                                        「应用」仅将总样本量写入最终样本量。若本工具内参数与左侧不一致，理解此 n 时以本工具为准；左侧不会随本工具更新，勿用左侧参数代回标准公式验算。
                                    </p>
                                    <Button
                                        onClick={() => onApplyResult(result.requiredClusters, result.requiredSampleSize)}
                                        className="w-full"
                                    >
                                        应用整群抽样方案
                                        <ArrowRight data-icon="inline-end" />
                                    </Button>
                                </>
                            )}
                        </div>
                    </div>
                )}

                {/* 参考值 */}
                <div className="rounded-xl border bg-background p-3">
                    <p className="mb-2 text-xs font-medium text-foreground">设计效应参考</p>
                    <div className="flex flex-col gap-1.5 text-xs">
                        <div className="flex justify-between">
                            <span className="text-muted-foreground">简单随机抽样 (SRS)</span>
                            <span className="font-bold text-foreground">1.0</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-muted-foreground">分层抽样（层内同质）</span>
                            <span className="font-bold text-chart-3">0.7-0.9</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-muted-foreground">整群抽样（中等聚集）</span>
                            <span className="font-bold text-chart-4">1.5-2.5</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-muted-foreground">整群抽样（高度聚集）</span>
                            <span className="font-bold text-destructive">3.0-5.0</span>
                        </div>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
