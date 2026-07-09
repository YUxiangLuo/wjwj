import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { 
    Target, 
    Calculator, 
    TrendingDown, 
    Info,
    ArrowRight,
    BarChart3
} from "lucide-react";
import { calculateSampleSizeByCV, type CVBasedSampleSizeResult } from "../experiment/sample-plan";
import {
    initialDesignEffectFromParent,
    nonResponseDecimalToFormPercent,
} from "./inherit-planning-params";

interface CVBasedSampleSizeCalculatorProps {
    populationSize: number;
    /** 决策面板传入，作为本工具内可改的初值 */
    confidenceLevel: string;
    estimationType?: "proportion" | "mean";
    /** 与决策面板一致的设计效应 */
    initialDesignEffect?: number;
    /** 小数 0～1，与决策面板无回答率一致 */
    initialNonResponseRate?: number;
    onApplySampleSize?: (sampleSize: number) => void;
}

export function CVBasedSampleSizeCalculator({
    populationSize,
    confidenceLevel,
    estimationType = "proportion",
    initialDesignEffect,
    initialNonResponseRate,
    onApplySampleSize,
}: CVBasedSampleSizeCalculatorProps) {
    const sliderIndigo =
        "py-2 [&_[data-slot=slider-range]]:!bg-primary [&_[data-slot=slider-track]]:!bg-primary dark:[&_[data-slot=slider-track]]:!bg-primary/80 [&_[data-slot=slider-thumb]]:!border-primary [&_[data-slot=slider-thumb]]:!bg-background dark:[&_[data-slot=slider-thumb]]:!bg-background [&_[data-slot=slider-thumb]]:!ring-primary/25";

    const [confidenceLevelLocal, setConfidenceLevelLocal] = useState(() => confidenceLevel);

    const [targetCV, setTargetCV] = useState(5);  // 目标变异系数 (%)
    const [estimatedCV, setEstimatedCV] = useState(30);  // 估计变异系数 (%)
    const [designEffect, setDesignEffect] = useState(() => initialDesignEffectFromParent(initialDesignEffect));
    const [nonResponseRate, setNonResponseRate] = useState(() =>
        nonResponseDecimalToFormPercent(initialNonResponseRate),
    );
    const [result, setResult] = useState<CVBasedSampleSizeResult | null>(null);

    // 父级决策参数变化时同步本地（与左侧初值对齐；用户在本工具内修改后仍可由父级更新覆盖）
    useEffect(() => {
        setConfidenceLevelLocal(confidenceLevel);
    }, [confidenceLevel]);
    useEffect(() => {
        setDesignEffect(initialDesignEffectFromParent(initialDesignEffect));
    }, [initialDesignEffect]);
    useEffect(() => {
        setNonResponseRate(nonResponseDecimalToFormPercent(initialNonResponseRate));
    }, [initialNonResponseRate]);

    // 计算样本量
    useEffect(() => {
        const newResult = calculateSampleSizeByCV({
            confidenceLevel: confidenceLevelLocal,
            targetCV: targetCV / 100,  // 转换为小数
            populationSize,
            estimatedCV: estimatedCV / 100,
            designEffect,
            nonResponseRate: nonResponseRate / 100,
        });
        setResult(newResult);
    }, [targetCV, estimatedCV, confidenceLevelLocal, populationSize, designEffect, nonResponseRate]);

    return (
        <Card className="rounded-2xl border-primary/20 bg-primary/10 shadow-sm dark:border-primary/45 dark:bg-background">
            <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Target className="w-5 h-5 text-primary" />
                        <CardTitle className="text-base text-primary">
                            基于变异系数(CV)的样本量计算
                        </CardTitle>
                    </div>
                    <Badge 
                        variant="outline" 
                        className="text-xs bg-primary/10 border-primary/20 text-primary dark:bg-primary/10 dark:border-primary/30 dark:text-primary"
                    >
                        高级方法
                    </Badge>
                </div>
                <CardDescription className="text-foreground/90">
                    根据目标变异系数(CV)反推所需样本量
                </CardDescription>
            </CardHeader>

            <CardContent className="space-y-4">
                {/* 说明 */}
                <div className="rounded-xl border border-info/20 bg-info/10 p-3 dark:border-info/40 dark:bg-info/25">
                    <div className="flex gap-2">
                        <Info className="w-4 h-4 text-info shrink-0 mt-0.5" />
                        <div className="text-xs text-info space-y-1.5">
                            <p className="font-medium">什么时候使用CV计算？</p>
                            <p>
                                当你关注估计值的<strong>相对精度</strong>（变异系数）而非绝对误差限时，
                                例如要求"估计值的变异系数不超过5%"时。
                            </p>
                            <p className="text-info/95 dark:text-info/95 leading-relaxed">
                                <span className="font-medium">为何 n 往往比「误差限公式」小？</span>
                                本工具按 SE(ȳ)/ȳ ≤ 目标 CV 推导，核心为 n ∝ (CV<sub>总体</sub>/CV<sub>目标</sub>)²，
                                <strong className="font-semibold">不含 Z 值</strong>；左侧常规面板
                                {estimationType === "mean" ? "的均值误差限公式" : "的误差限公式"}同样含 Z²，
                                但目标是控制误差限而非 CV，二者不是同一套目标，数值不可直接对比。下方「置信水平」仅用于说明如何把 CV 换算成
                                置信区间相对半宽（Z×CV），<strong className="font-semibold">不参与上式求 n</strong>。
                            </p>
                        </div>
                    </div>
                </div>

                {/* 参数设置 */}
                <div className="space-y-4">
                    <div className="space-y-1.5">
                        <Label className="text-xs text-primary">置信水平</Label>
                        <Select value={confidenceLevelLocal} onValueChange={setConfidenceLevelLocal}>
                            <SelectTrigger className="h-9 text-sm bg-background border-primary">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="90">90%</SelectItem>
                                <SelectItem value="95">95%</SelectItem>
                                <SelectItem value="99">99%</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    {/* 目标CV */}
                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <Label className="text-xs text-primary">
                                目标变异系数 (CV)
                            </Label>
                            <span className="text-sm font-bold tabular-nums text-info">
                                {targetCV}%
                            </span>
                        </div>
                        <Slider
                            value={[targetCV]}
                            onValueChange={(v) => setTargetCV(v[0] ?? 5)}
                            min={1}
                            max={20}
                            step={0.5}
                            className={sliderIndigo}
                        />
                        <div className="flex justify-between text-xs text-muted-foreground">
                            <span>1% (高精度)</span>
                            <span>10% (中等)</span>
                            <span>20% (较低)</span>
                        </div>
                    </div>

                    {/* 估计CV */}
                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <Label className="text-xs text-primary">
                                估计总体变异系数
                            </Label>
                            <div className="flex items-center gap-1">
                                <Input
                                    type="number"
                                    value={estimatedCV}
                                    onChange={(e) => setEstimatedCV(parseFloat(e.target.value) || 0)}
                                    className="w-16 h-7 text-xs bg-background border-primary text-foreground"
                                    min={1}
                                    max={100}
                                    step={1}
                                />
                                <span className="text-xs text-primary">%</span>
                            </div>
                        </div>
                        <p className="text-xs text-primary">
                            基于以往调查或预调查数据估计
                        </p>
                    </div>

                    {/* 其他参数 */}
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                            <Label className="text-xs text-primary">设计效应</Label>
                            <Input
                                type="number"
                                value={designEffect}
                                onChange={(e) => setDesignEffect(parseFloat(e.target.value) || 1)}
                                className="bg-background border-primary text-foreground"
                                min={0.5}
                                max={5}
                                step={0.1}
                            />
                        </div>
                        <div className="space-y-1">
                            <Label className="text-xs text-primary">无回答率 (%)</Label>
                            <Input
                                type="number"
                                value={nonResponseRate}
                                onChange={(e) => setNonResponseRate(parseFloat(e.target.value) || 0)}
                                className="bg-background border-primary text-foreground"
                                min={0}
                                max={50}
                                step={1}
                            />
                        </div>
                    </div>
                </div>

                {/* 计算结果 */}
                {result && (
                    <div className="rounded-xl border-2 border-primary bg-background p-4 shadow-sm dark:border-primary/50 dark:bg-background">
                        <div className="flex items-center gap-2 mb-4">
                            <Calculator className="w-5 h-5 text-primary" />
                            <span className="font-bold text-primary">计算结果</span>
                        </div>

                        <div className="space-y-4">
                            {/* 主要结果 */}
                            <div className="flex items-center justify-between">
                                <span className="text-sm text-foreground/90">所需样本量</span>
                                <span className="text-2xl font-bold tabular-nums text-info">
                                    {result.requiredSampleSize.toLocaleString()}
                                </span>
                            </div>

                            {/* 能达到的CV */}
                            <div className="flex items-center justify-between text-sm">
                                <span className="text-foreground/90 flex items-center gap-1">
                                    <TrendingDown className="w-4 h-4 text-info" />
                                    实际能达到的CV
                                </span>
                                <span className="font-mono font-bold tabular-nums text-info">
                                    {(result.achievedCV * 100).toFixed(2)}%
                                </span>
                            </div>

                            {/* 随置信水平变化：Z×CV(ȳ)，与主公式求 n 无关 */}
                            <div className="flex items-center justify-between text-sm border-t border-primary pt-3">
                                <span className="text-foreground/90">
                                    置信区间相对半宽（Z×CV，近似）
                                </span>
                                <span className="font-mono font-bold tabular-nums text-primary">
                                    {(result.z * result.achievedCV * 100).toFixed(2)}%
                                </span>
                            </div>
                            <p className="text-[11px] text-muted-foreground leading-relaxed -mt-2">
                                切换置信水平会改变 Z，故本行会更新；所需样本量仍由上式按「目标 CV」决定，与 Z 无关。
                            </p>

                            {/* 公式展示 */}
                            <div className="rounded-lg border border-primary bg-background p-2 dark:border-primary/50 dark:bg-background">
                                <p className="text-xs font-mono text-primary">
                                    {result.formula}
                                </p>
                                <p className="text-xs text-primary mt-1">
                                    目标CV={targetCV}%, 估计CV={estimatedCV}%
                                </p>
                                <p className="text-xs text-primary mt-0.5">
                                    若需置信区间相对半宽，可用 Z×CV(ȳ)（{confidenceLevelLocal}% 置信水平下 Z={result.z}）
                                </p>
                            </div>

                            {/* 对比误差限方法 */}
                            <div className="rounded-lg border border-warning/20 bg-warning/10 p-2 dark:border-warning/40 dark:bg-background">
                                <div className="flex items-start gap-2 text-xs">
                                    <BarChart3 className="w-4 h-4 text-warning shrink-0 mt-0.5" />
                                    <div className="text-warning">
                                        <span className="font-medium">CV vs 误差限：</span>
                                        CV是相对指标（变异系数 = SE/均值），适合比较不同规模总体的精度；
                                        误差限是绝对指标，适合有明确误差容忍度的场景。
                                    </div>
                                </div>
                            </div>

                            {/* 应用按钮 */}
                            {onApplySampleSize && (
                                <>
                                    <p className="text-xs text-muted-foreground leading-relaxed">
                                        「应用」仅将上述样本量写入最终样本量。若本工具内参数与左侧不一致，理解此 n 时以本工具为准；左侧不会随本工具更新，勿用左侧参数代回标准公式验算。
                                    </p>
                                    <Button
                                        onClick={() => onApplySampleSize(result.requiredSampleSize)}
                                        className="w-full bg-primary text-primary-foreground hover:bg-primary"
                                    >
                                        应用此样本量
                                        <ArrowRight className="w-4 h-4 ml-2" />
                                    </Button>
                                </>
                            )}
                        </div>
                    </div>
                )}

                {/* 分层抽样中的 CV 准则（课件第24页） */}
                <div className="rounded-xl border border-auxiliary-border/90 bg-auxiliary-muted/50 p-3 dark:border-auxiliary-border/40 dark:bg-auxiliary-muted/20">
                    <div className="flex items-start gap-2">
                        <Info className="w-4 h-4 text-auxiliary shrink-0 mt-0.5" />
                        <div className="text-xs text-auxiliary-foreground space-y-1.5">
                            <p className="font-medium">给定变异系数确定分层抽样样本量（课件第24页）</p>
                            <p className="text-auxiliary-foreground/90 dark:text-auxiliary-foreground/90 leading-relaxed">
                                在分层抽样中，可先给定总体估计值的变异系数 <em>C</em>，再由各层方差与分配系数推导所需样本量：
                            </p>
                            <div className="font-mono text-[11px] bg-background/60 rounded p-2 border border-auxiliary-border/50 dark:border-auxiliary-border/40 leading-relaxed">
                                n = Σ(N<sub>h</sub>²S<sub>h</sub>²/a<sub>h</sub>) / (N²C²Ȳ² + ΣN<sub>h</sub>S<sub>h</sub>²)
                                <br />
                                其中 a<sub>h</sub> 为分配系数，各层样本量 n<sub>h</sub> = n × a<sub>h</sub>
                            </div>
                            <p className="text-auxiliary/80 dark:text-auxiliary/80">
                                上方计算器适用于简单随机抽样下的 CV 估算；若采用分层抽样，可在「抽样执行」阶段的分层分配方法对比中查看各层实际分配结果。
                            </p>
                        </div>
                    </div>
                </div>

                {/* 参考值 */}
                <div className="rounded-xl border border-border bg-background p-3 dark:border-input dark:bg-background">
                    <p className="text-xs font-medium text-foreground mb-2">常见变异系数参考</p>
                    <div className="space-y-1.5 text-xs">
                        <div className="flex justify-between">
                            <span className="text-muted-foreground">人口特征（如性别比例）</span>
                            <span className="text-foreground/90">20-40%</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-muted-foreground">经济指标（如收入）</span>
                            <span className="text-foreground/90">50-100%</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-muted-foreground">比例估计（如支持率）</span>
                            <span className="text-foreground/90">10-30%</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-muted-foreground">态度量表（如满意度）</span>
                            <span className="text-foreground/90">15-25%</span>
                        </div>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
