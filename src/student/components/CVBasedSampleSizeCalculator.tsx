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
import { primarySliderClassName } from "./sample-planning-styles";

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
    /** 应用时回传完整输入与结果（用于高级规划快照持久化与服务端复算）。 */
    onSnapshot?: (snapshot: {
        inputs: {
            confidenceLevel: string;
            targetCV: number;
            estimatedCV: number;
            designEffect: number;
            nonResponseRate: number;
        };
        result: { requiredSampleSize: number; expectedRespondentSampleSize: number; achievedCV: number };
    }) => void;
}

export function CVBasedSampleSizeCalculator({
    populationSize,
    confidenceLevel,
    estimationType = "proportion",
    initialDesignEffect,
    initialNonResponseRate,
    onApplySampleSize,
    onSnapshot,
}: CVBasedSampleSizeCalculatorProps) {
    const [confidenceLevelLocal, setConfidenceLevelLocal] = useState(() => confidenceLevel);

    const [targetCV, setTargetCV] = useState(5); // 目标变异系数 (%)
    const [estimatedCV, setEstimatedCV] = useState(30); // 估计变异系数 (%)
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
            targetCV: targetCV / 100, // 转换为小数
            populationSize,
            estimatedCV: estimatedCV / 100,
            designEffect,
            nonResponseRate: nonResponseRate / 100,
        });
        setResult(newResult);
    }, [targetCV, estimatedCV, confidenceLevelLocal, populationSize, designEffect, nonResponseRate]);

    return (
        <Card className="rounded-surface border-primary-border bg-primary-muted ">
            <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Target className="w-5 h-5 text-primary" />
                        <CardTitle className="text-body text-primary">
                            基于变异系数(CV)的样本量计算
                        </CardTitle>
                    </div>
                    <Badge
                        variant="outline"
                        className="text-meta bg-primary-muted border-primary-border text-primary"
                    >
                        高级方法
                    </Badge>
                </div>
                <CardDescription className="text-foreground">
                    为具有有意义零点的正值均值，按目标设计 CV 反推计划发放量。应用结果只改最终 n，不改变抽样执行方法。
                </CardDescription>
            </CardHeader>

            <CardContent className="space-y-4">
                {/* 说明 */}
                <div className="rounded-surface border border-info-border bg-info-muted p-3">
                    <div className="flex gap-2">
                        <Info className="w-4 h-4 text-info shrink-0 mt-0.5" />
                        <div className="text-meta text-info space-y-1.5">
                            <p className="font-medium">什么时候使用CV计算？</p>
                            <p>
                                当目标变量是具有有意义零点的正值比率尺度，且你关注均值估计的<strong>相对标准误</strong>
                                SE(ȳ)/ȳ 时使用。均值接近零、可正可负、名义分类或一般态度评分不适用。
                            </p>
                            {estimationType === "proportion" && (
                                <p className="font-medium">
                                    当前主流程是比例估计；通常应直接用预计比例 p 和误差限规划，不要套用经验 CV 区间。
                                </p>
                            )}
                            <p className="text-info leading-relaxed">
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
                        <Label className="text-meta text-primary">置信水平</Label>
                        <Select value={confidenceLevelLocal} onValueChange={setConfidenceLevelLocal}>
                            <SelectTrigger aria-label="CV 计算置信水平" className="h-9 text-label bg-card border-primary">
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
                            <Label className="text-meta text-primary">
                                目标变异系数 (CV)
                            </Label>
                            <span className="text-label font-bold tabular-nums text-info">
                                {targetCV}%
                            </span>
                        </div>
                        <Slider
                            aria-label="目标变异系数"
                            value={[targetCV]}
                            onValueChange={(v) => setTargetCV(v[0] ?? 5)}
                            min={1}
                            max={20}
                            step={0.5}
                            className={primarySliderClassName}
                        />
                        <div className="flex justify-between text-meta text-muted-foreground">
                            <span>1% (高精度)</span>
                            <span>10% (中等)</span>
                            <span>20% (较低)</span>
                        </div>
                    </div>

                    {/* 估计CV */}
                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <Label htmlFor="cv-estimated-value" className="text-meta text-primary">
                                估计总体变异系数
                            </Label>
                            <div className="flex items-center gap-1">
                                <Input
                                    id="cv-estimated-value"
                                    type="number"
                                    value={estimatedCV}
                                    onChange={(e) => setEstimatedCV(parseFloat(e.target.value) || 0)}
                                    className="w-16 h-7 text-meta bg-card border-primary text-foreground"
                                    min={1}
                                    max={100}
                                    step={1}
                                />
                                <span className="text-meta text-primary">%</span>
                            </div>
                        </div>
                        <p className="text-meta text-primary">
                            基于以往调查或预调查数据估计
                        </p>
                    </div>

                    {/* 其他参数 */}
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                            <Label htmlFor="cv-design-effect" className="text-meta text-primary">设计效应</Label>
                            <Input
                                id="cv-design-effect"
                                type="number"
                                value={designEffect}
                                onChange={(e) => setDesignEffect(parseFloat(e.target.value) || 1)}
                                className="bg-card border-primary text-foreground"
                                min={0.5}
                                max={5}
                                step={0.1}
                            />
                        </div>
                        <div className="space-y-1">
                            <Label htmlFor="cv-non-response-rate" className="text-meta text-primary">无回答率 (%)</Label>
                            <Input
                                id="cv-non-response-rate"
                                type="number"
                                value={nonResponseRate}
                                onChange={(e) => setNonResponseRate(parseFloat(e.target.value) || 0)}
                                className="bg-card border-primary text-foreground"
                                min={0}
                                max={50}
                                step={1}
                            />
                        </div>
                    </div>
                </div>

                {/* 计算结果 */}
                {result && (
                    <div className="rounded-surface border-2 border-primary bg-background p-4 ">
                        <div className="flex items-center gap-2 mb-4">
                            <Calculator className="w-5 h-5 text-primary" />
                            <span className="font-bold text-primary">计算结果</span>
                        </div>

                        <div className="space-y-4">
                            {/* 主要结果 */}
                            <div className="flex items-center justify-between">
                                <span className="text-label text-foreground">计划发放量</span>
                                <span className="text-page-title font-bold tabular-nums text-info">
                                    {result.requiredSampleSize.toLocaleString()}
                                </span>
                            </div>

                            <div className="flex items-center justify-between text-label">
                                <span className="text-foreground">按回答率假设的预期完成量</span>
                                <span className="font-mono font-bold tabular-nums text-primary">
                                    {result.expectedRespondentSampleSize.toLocaleString(undefined, { maximumFractionDigits: 1 })}
                                </span>
                            </div>
                            <div className="flex items-center justify-between text-label">
                                <span className="text-foreground flex items-center gap-1">
                                    <TrendingDown className="w-4 h-4 text-info" />
                                    预期设计 CV（近似）
                                </span>
                                <span className="font-mono font-bold tabular-nums text-info">
                                    {(result.achievedCV * 100).toFixed(2)}%
                                </span>
                            </div>
                            {result.cappedAtPopulation && nonResponseRate > 0 && (
                                <p className="rounded-surface border border-warning-border bg-warning-muted p-2 text-meta leading-relaxed text-warning">
                                    发放量已封顶为总体 N，但仍预期存在无回答，因此不是完整普查，CV 不为 0；增加发放量也不能自动消除非随机无回答偏差。
                                </p>
                            )}

                            {/* 随置信水平变化：Z×CV(ȳ)，与主公式求 n 无关 */}
                            <div className="flex items-center justify-between text-label border-t border-primary pt-3">
                                <span className="text-foreground">
                                    置信区间相对半宽（Z×CV，近似）
                                </span>
                                <span className="font-mono font-bold tabular-nums text-primary">
                                    {(result.z * result.achievedCV * 100).toFixed(2)}%
                                </span>
                            </div>
                            <p className="text-meta text-muted-foreground leading-relaxed -mt-2">
                                切换置信水平会改变 Z，故本行会更新；所需样本量仍由上式按「目标 CV」决定，与 Z 无关。
                            </p>

                            {/* 公式展示 */}
                            <div className="rounded-surface border border-primary bg-background p-2">
                                <p className="text-meta font-mono text-primary">
                                    {result.formula}
                                </p>
                                <p className="text-meta text-primary mt-1">
                                    目标CV={targetCV}%, 估计CV={estimatedCV}%
                                </p>
                                <p className="text-meta text-primary mt-0.5">
                                    若需置信区间相对半宽，可用 Z×CV(ȳ)（{confidenceLevelLocal}% 置信水平下 Z={result.z}）
                                </p>
                            </div>

                            {/* 对比误差限方法 */}
                            <div className="rounded-surface border border-warning-border bg-warning-muted p-2">
                                <div className="flex items-start gap-2 text-meta">
                                    <BarChart3 className="w-4 h-4 text-warning shrink-0 mt-0.5" />
                                    <div className="text-warning">
                                        <span className="font-medium">CV vs 误差限：</span>
                                        此处 CV 是均值估计的相对标准误 SE(ȳ)/ȳ；只有变量量纲和零点有意义时才适合跨尺度解释。
                                        误差限是绝对指标，适合有明确绝对容忍度的场景。
                                    </div>
                                </div>
                            </div>

                            {/* 应用按钮 */}
                            {onApplySampleSize && (
                                <>
                                    <p className="text-meta text-muted-foreground leading-relaxed">
                                        「应用」仅将上述发放量写入最终样本量。无回答膨胀只补足预期完成数量，不能修正回答概率与研究变量相关造成的选择偏差。若本工具内参数与左侧不一致，以本工具假设为准。
                                    </p>
                                    <Button
                                        onClick={() => {
                                            onSnapshot?.({
                                                inputs: {
                                                    confidenceLevel: confidenceLevelLocal,
                                                    targetCV,
                                                    estimatedCV,
                                                    designEffect,
                                                    nonResponseRate,
                                                },
                                                result: {
                                                    requiredSampleSize: result.requiredSampleSize,
                                                    expectedRespondentSampleSize: result.expectedRespondentSampleSize,
                                                    achievedCV: result.achievedCV,
                                                },
                                            });
                                            onApplySampleSize(result.requiredSampleSize);
                                        }}
                                        className="w-full bg-primary text-primary-foreground hover:bg-primary-hover"
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
                <div className="rounded-surface border border-auxiliary-border bg-auxiliary-muted p-3">
                    <div className="flex items-start gap-2">
                        <Info className="w-4 h-4 text-auxiliary shrink-0 mt-0.5" />
                        <div className="text-meta text-auxiliary-strong space-y-1.5">
                            <p className="font-medium">给定变异系数确定分层抽样样本量（课件第24页）</p>
                            <p className="text-auxiliary-strong leading-relaxed">
                                在分层抽样中，可先给定总体估计值的变异系数 <em>C</em>，再由各层方差与分配系数推导所需样本量：
                            </p>
                            <div className="font-mono text-meta bg-background rounded-control p-2 border border-auxiliary-border leading-relaxed">
                                n = Σ(N<sub>h</sub>²S<sub>h</sub>²/a<sub>h</sub>) / (N²C²Ȳ² + ΣN<sub>h</sub>S<sub>h</sub>²)
                                <br />
                                其中 a<sub>h</sub> 为分配系数，各层样本量 n<sub>h</sub> = n × a<sub>h</sub>
                            </div>
                            <p className="text-auxiliary">
                                上方计算器适用于简单随机抽样下的 CV 估算；若采用分层抽样，可在「抽样执行」阶段的分层分配方法对比中查看各层实际分配结果。
                            </p>
                        </div>
                    </div>
                </div>

                <div className="rounded-surface border border-border bg-background p-3 text-meta text-muted-foreground space-y-1.5">
                    <p className="font-medium text-foreground">使用前提</p>
                    <p>总体 CV 应来自同一目标变量的历史调查或预调查，并记录总体、时间和计算口径。</p>
                    <p>普通 CV 不适合没有自然零点的变量；均值接近 0 时结果会非常不稳定。</p>
                </div>
            </CardContent>
        </Card>
    );
}
