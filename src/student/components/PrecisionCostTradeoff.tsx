import { useState, useMemo, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { 
    DollarSign, 
    TrendingUp, 
    AlertCircle, 
    Target, 
    Calculator,
    Info,
    ChevronRight
} from "lucide-react";
import { zForConfidenceLevel } from "../experiment/confidence-level";
import { calculateFinitePopulationSampleSize } from "../experiment/sample-plan";
import { primarySliderClassName } from "./sample-planning-styles";

interface CostScenario {
    id: string;
    name: string;
    fixedCost: number;           // 固定成本（培训、督导等）
    variableCostPerUnit: number; // 单位样本成本（元/样本）
    totalBudget: number;         // 总预算
}

interface PrecisionCostTradeoffProps {
    populationSize: number;
    /** 决策面板传入，作为本工具内可改的初值 */
    confidenceLevel: string;
    designEffect: number;
    nonResponseRate: number;
    /** 与决策面板「允许误差」一致（%），用于「目标精度」滑块初值 */
    initialMarginOfError?: number;
    onApplyBudget: (budget: number, maxSampleSize: number) => void;
}

const PRESET_SCENARIOS: CostScenario[] = [
    {
        id: "phone",
        name: "电话调查",
        fixedCost: 5000,
        variableCostPerUnit: 15,
        totalBudget: 50000,
    },
    {
        id: "face",
        name: "面对面访谈",
        fixedCost: 10000,
        variableCostPerUnit: 80,
        totalBudget: 200000,
    },
    {
        id: "online",
        name: "线上问卷",
        fixedCost: 2000,
        variableCostPerUnit: 5,
        totalBudget: 30000,
    },
];

export function PrecisionCostTradeoff({
    populationSize,
    confidenceLevel,
    designEffect,
    nonResponseRate,
    initialMarginOfError = 5,
    onApplyBudget,
}: PrecisionCostTradeoffProps) {
    /** 与左侧决策面板解耦：继承为初值，在工具内可任意调整 */
    const [confidenceLevelLocal, setConfidenceLevelLocal] = useState(() => confidenceLevel);
    const [designEffectLocal, setDesignEffectLocal] = useState(() => designEffect);
    const [nonResponseRateLocal, setNonResponseRateLocal] = useState(() => nonResponseRate);

    const [selectedScenario, setSelectedScenario] = useState<CostScenario>(PRESET_SCENARIOS[0]!);
    const [customScenario, setCustomScenario] = useState<CostScenario>({
        id: "custom",
        name: "自定义",
        fixedCost: 5000,
        variableCostPerUnit: 20,
        totalBudget: 50000,
    });
    const [useCustom, setUseCustom] = useState(false);
    const [targetMarginOfError, setTargetMarginOfError] = useState(() => {
        const m = initialMarginOfError;
        if (m == null || !Number.isFinite(m)) return 5;
        // 与下方「目标精度」滑块 min/max 一致
        return Math.min(15, Math.max(1, Math.round(m)));
    });

    // 父级决策参数变化时同步本地（避免挂载后 props 更新而演算仍用旧初值）
    useEffect(() => {
        setConfidenceLevelLocal(confidenceLevel);
    }, [confidenceLevel]);
    useEffect(() => {
        setDesignEffectLocal(designEffect);
    }, [designEffect]);
    useEffect(() => {
        setNonResponseRateLocal(nonResponseRate);
    }, [nonResponseRate]);
    useEffect(() => {
        const m = initialMarginOfError;
        if (m == null || !Number.isFinite(m)) return;
        setTargetMarginOfError(Math.min(15, Math.max(1, Math.round(m))));
    }, [initialMarginOfError]);

    const currentScenario = useCustom ? customScenario : selectedScenario;

    // 计算预算约束下的最大样本量
    const maxFeasibleSampleSize = useMemo(() => {
        const { fixedCost, variableCostPerUnit, totalBudget } = currentScenario;
        if (variableCostPerUnit <= 0) return populationSize;
        const maxSample = Math.floor((totalBudget - fixedCost) / variableCostPerUnit);
        return Math.min(maxSample, populationSize);
    }, [currentScenario, populationSize]);

    // 计算预算约束下的精度
    const achievablePrecision = useMemo(() => {
        if (maxFeasibleSampleSize <= 0) return null;

        // 反向计算误差限：从样本量反推
        // 正向: n_final = (z²p(1-p)/E²) / (1+(n₀-1)/N) * deff / (1-nrr)
        // 反推: effectiveN = n_final * (1-nrr) / deff，然后含FPC反推E
        const z = zForConfidenceLevel(confidenceLevelLocal);
        const p = 0.5;
        
        // 去除deff和nrr调整，得到有限总体校正后的有效样本量
        // designEffect > 0 由UI slider下限保证（最小0.5）
        const safeDeff = designEffectLocal > 0 ? designEffectLocal : 1;
        const effectiveN = maxFeasibleSampleSize * (1 - nonResponseRateLocal) / safeDeff;
        // 含有限总体校正 (FPC) 的反推误差限: E = z * sqrt(p(1-p)/n * (1-n/N))
        const fpc = Math.max(0, 1 - effectiveN / populationSize);
        const marginOfError = z * Math.sqrt(p * (1 - p) / effectiveN * fpc) * 100;

        return {
            marginOfError: Math.min(marginOfError, 50), // 最大50%
            sampleSize: maxFeasibleSampleSize,
            totalCost: currentScenario.fixedCost + maxFeasibleSampleSize * currentScenario.variableCostPerUnit,
        };
    }, [maxFeasibleSampleSize, confidenceLevelLocal, populationSize, designEffectLocal, nonResponseRateLocal, currentScenario]);

    // 生成精度-成本曲线数据
    const curveData = useMemo(() => {
        const points: Array<{ sampleSize: number; marginOfError: number; totalCost: number }> = [];
        
        const sampleSizes = [30, 50, 100, 200, 300, 500, 800, 1000, 1500, 2000, 3000, 5000];
        const z = zForConfidenceLevel(confidenceLevelLocal);
        const p = 0.5;

        const safeDeff = designEffectLocal > 0 ? designEffectLocal : 1;

        sampleSizes.forEach(n => {
            if (n <= populationSize) {
                // 去除deff和nrr调整，得到有效样本量
                const effectiveN = n * (1 - nonResponseRateLocal) / safeDeff;
                // 含FPC反推误差限
                const fpc = Math.max(0, 1 - effectiveN / populationSize);
                const marginOfError = z * Math.sqrt(p * (1 - p) / effectiveN * fpc) * 100;
                
                // 计算成本
                const totalCost = currentScenario.fixedCost + n * currentScenario.variableCostPerUnit;
                
                points.push({
                    sampleSize: n,
                    marginOfError: Math.min(marginOfError, 50),
                    totalCost,
                });
            }
        });

        return points;
    }, [populationSize, confidenceLevelLocal, designEffectLocal, nonResponseRateLocal, currentScenario]);

    // 计算目标精度所需的样本量和成本
    const targetAnalysis = useMemo(() => {
        const requiredSampleSize = calculateFinitePopulationSampleSize({
            confidenceLevel: confidenceLevelLocal,
            marginOfError: targetMarginOfError,
            populationSize,
            designEffect: designEffectLocal,
            nonResponseRate: nonResponseRateLocal,
        }) ?? 0;

        const totalCost = currentScenario.fixedCost + requiredSampleSize * currentScenario.variableCostPerUnit;
        const isFeasible = totalCost <= currentScenario.totalBudget;

        return {
            requiredSampleSize,
            totalCost,
            isFeasible,
            budgetGap: totalCost - currentScenario.totalBudget,
        };
    }, [targetMarginOfError, confidenceLevelLocal, populationSize, designEffectLocal, nonResponseRateLocal, currentScenario]);

    return (
        <Card className="rounded-2xl border-primary/20 bg-primary/10 shadow-sm">
            <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <DollarSign className="w-5 h-5 text-primary" />
                        <CardTitle className="text-base text-primary">
                            精度与成本权衡
                        </CardTitle>
                    </div>
                </div>
                <CardDescription className="text-foreground/90">
                    在给定预算约束下，评估可达到的精度水平
                </CardDescription>
            </CardHeader>

            <CardContent className="space-y-4">
                {/* 场景选择 */}
                <div className="space-y-2">
                    <Label className="text-xs font-medium text-foreground">调查场景</Label>
                    <div className="grid grid-cols-3 gap-2">
                        {PRESET_SCENARIOS.map(scenario => (
                            <Button
                                key={scenario.id}
                                variant={!useCustom && selectedScenario.id === scenario.id ? "default" : "outline"}
                                size="sm"
                                onClick={() => {
                                    setSelectedScenario(scenario);
                                    setUseCustom(false);
                                }}
                                className={`text-xs h-auto py-2 ${
                                    !useCustom && selectedScenario.id === scenario.id
                                        ? "bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm"
                                        : "border-primary bg-background text-primary hover:bg-primary/10"
                                }`}
                            >
                                {scenario.name}
                            </Button>
                        ))}
                    </div>
                    <Button
                        variant={useCustom ? "default" : "outline"}
                        size="sm"
                        onClick={() => setUseCustom(true)}
                        className={`w-full text-xs ${
                            useCustom
                                ? "bg-primary text-primary-foreground hover:bg-primary/90"
                                : "border-primary bg-background text-primary hover:bg-primary/10"
                        }`}
                    >
                        自定义成本参数
                    </Button>
                </div>

                {/* 自定义参数 */}
                {useCustom && (
                    <div className="space-y-3 p-3 rounded-xl border border-primary/90 bg-background">
                        <div className="space-y-2">
                            <Label className="text-xs text-foreground">固定成本（元）</Label>
                            <Input
                                type="number"
                                value={customScenario.fixedCost}
                                onChange={(e) => setCustomScenario({
                                    ...customScenario,
                                    fixedCost: parseInt(e.target.value) || 0
                                })}
                                className="bg-background border-primary text-foreground"
                            />
                            <p className="text-xs text-muted-foreground">培训、督导、设备等固定支出</p>
                        </div>
                        <div className="space-y-2">
                            <Label className="text-xs text-foreground">单位样本成本（元/样本）</Label>
                            <Input
                                type="number"
                                value={customScenario.variableCostPerUnit}
                                onChange={(e) => setCustomScenario({
                                    ...customScenario,
                                    variableCostPerUnit: parseInt(e.target.value) || 0
                                })}
                                className="bg-background border-primary text-foreground"
                            />
                            <p className="text-xs text-muted-foreground">每个样本的调查费用（访问费、礼品等）</p>
                        </div>
                        <div className="space-y-2">
                            <Label className="text-xs text-foreground">总预算（元）</Label>
                            <Input
                                type="number"
                                value={customScenario.totalBudget}
                                onChange={(e) => setCustomScenario({
                                    ...customScenario,
                                    totalBudget: parseInt(e.target.value) || 0
                                })}
                                className="bg-background border-primary text-foreground"
                            />
                        </div>
                    </div>
                )}

                {/* 当前场景摘要 */}
                <div className="rounded-xl border border-primary/90 bg-background p-3 space-y-2">
                    <div className="flex justify-between text-sm">
                        <span className="text-foreground/90">固定成本</span>
                        <span className="font-mono text-primary">
                            ¥{currentScenario.fixedCost.toLocaleString()}
                        </span>
                    </div>
                    <div className="flex justify-between text-sm">
                        <span className="text-foreground/90">单位成本</span>
                        <span className="font-mono text-primary">
                            ¥{currentScenario.variableCostPerUnit}/样本
                        </span>
                    </div>
                    <div className="flex justify-between text-sm font-medium">
                        <span className="text-foreground/90">总预算</span>
                        <span className="font-mono text-primary">
                            ¥{currentScenario.totalBudget.toLocaleString()}
                        </span>
                    </div>
                </div>

                {/* 抽样假设：继承决策面板初值，仅影响本工具内演算 */}
                <div className="rounded-xl border border-primary/90 bg-background p-3 space-y-4">
                    <p className="text-xs font-medium text-foreground">抽样假设（可在此调整）</p>
                    <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">置信水平</Label>
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
                    <div className="space-y-1.5">
                        <div className="flex justify-between text-xs">
                            <span className="text-muted-foreground">设计效应</span>
                            <span className="font-bold tabular-nums text-primary">
                                {designEffectLocal.toFixed(1)}
                            </span>
                        </div>
                        <Slider
                            value={[Math.round(designEffectLocal * 10)]}
                            onValueChange={([v]) => v != null && setDesignEffectLocal(Math.round(v) / 10)}
                            min={10}
                            max={50}
                            step={1}
                            className={primarySliderClassName}
                        />
                    </div>
                    <div className="space-y-1.5">
                        <div className="flex justify-between text-xs">
                            <span className="text-muted-foreground">无回答率</span>
                            <span className="font-bold tabular-nums text-destructive">
                                {Math.round(nonResponseRateLocal * 100)}%
                            </span>
                        </div>
                        <Slider
                            value={[Math.round(nonResponseRateLocal * 100)]}
                            onValueChange={([v]) => v != null && setNonResponseRateLocal((v ?? 0) / 100)}
                            min={0}
                            max={50}
                            step={5}
                            className={primarySliderClassName}
                        />
                    </div>
                </div>

                {/* 预算约束分析 */}
                <div className="rounded-xl border-2 border-primary/90 bg-background p-4 shadow-sm">
                    <div className="flex items-center gap-2 mb-3">
                        <Target className="w-5 h-5 text-primary" />
                        <span className="font-bold text-primary">预算约束分析</span>
                    </div>

                    <div className="space-y-3">
                        <div className="flex justify-between items-center">
                            <span className="text-sm text-foreground/90">预算可支持的最大样本量</span>
                            <span className="text-xl font-bold tabular-nums text-primary">
                                {maxFeasibleSampleSize.toLocaleString()}
                            </span>
                        </div>

                        {achievablePrecision && (
                            <>
                                <div className="flex justify-between items-center">
                                    <span className="text-sm text-foreground/90">可达到的最佳精度</span>
                                    <span className="text-lg font-bold tabular-nums text-info">
                                        ±{achievablePrecision.marginOfError.toFixed(1)}%
                                    </span>
                                </div>
                                <div className="flex justify-between items-center text-sm">
                                    <span className="text-foreground/90">实际总成本</span>
                                    <span className="font-mono text-primary">
                                        ¥{achievablePrecision.totalCost.toLocaleString()}
                                    </span>
                                </div>
                            </>
                        )}
                    </div>

                    {achievablePrecision && achievablePrecision.totalCost > currentScenario.totalBudget * 0.9 && (
                        <div className="mt-3 rounded-lg border border-warning/20 bg-warning/10 p-2">
                            <div className="flex items-center gap-2 text-xs text-warning">
                                <AlertCircle className="w-4 h-4 shrink-0 text-warning" />
                                <span>预算已接近上限，无法进一步提高精度</span>
                            </div>
                        </div>
                    )}
                </div>

                {/* 目标精度分析（与决策面板「允许误差」1～10% 可保存值不同，此处为工具内试算 1～15%） */}
                <div className="space-y-3">
                    <div>
                        <Label className="text-xs font-medium text-foreground">
                            目标精度（工具内试算，1～15%）
                        </Label>
                        <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">
                            左侧决策面板的「允许误差」为可保存的 1～10%；此处滑块仅用于在本工具中估算所需样本量与成本，不会单独写入保存记录。
                        </p>
                    </div>
                    <p className="text-xs font-medium text-foreground/90 tabular-nums">
                        当前设定：±{targetMarginOfError}%
                    </p>
                    <Slider
                        value={[targetMarginOfError]}
                        onValueChange={(v) => setTargetMarginOfError(v[0] ?? 5)}
                        min={1}
                        max={15}
                        step={1}
                        className={primarySliderClassName}
                    />

                    <div className="rounded-xl border border-primary/90 bg-background p-3">
                        <div className="space-y-2">
                            <div className="flex justify-between text-sm">
                                <span className="text-foreground/90">所需样本量</span>
                                <span className="font-mono text-primary">
                                    {targetAnalysis.requiredSampleSize.toLocaleString()}
                                </span>
                            </div>
                            <div className="flex justify-between text-sm">
                                <span className="text-foreground/90">预估总成本</span>
                                <span className="font-mono text-primary">
                                    ¥{targetAnalysis.totalCost.toLocaleString()}
                                </span>
                            </div>

                            {targetAnalysis.isFeasible ? (
                                <div className="flex items-center gap-2 text-sm text-info">
                                    <Badge className="border-0 bg-info text-info-foreground hover:bg-info/90">可行</Badge>
                                    <span>预算充足，可实现目标精度</span>
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    <div className="flex items-center gap-2 text-sm text-destructive">
                                        <Badge variant="destructive">超预算</Badge>
                                        <span>还需 ¥{targetAnalysis.budgetGap.toLocaleString()}</span>
                                    </div>
                                    <p className="text-xs text-destructive">
                                        建议：放宽误差限至 ±{Math.ceil(achievablePrecision?.marginOfError || targetMarginOfError)}% 
                                        或增加预算
                                    </p>
                                </div>
                            )}
                        </div>

                        {targetAnalysis.isFeasible && (
                            <>
                                <p className="text-xs text-muted-foreground leading-relaxed mt-3">
                                    「应用」仅将样本量写入最终样本量。若抽样假设与左侧不一致，理解此 n 时以本工具为准；左侧不会随本工具更新，勿用左侧参数代回验算。
                                </p>
                                <Button
                                    onClick={() => onApplyBudget(currentScenario.totalBudget, targetAnalysis.requiredSampleSize)}
                                    className="w-full mt-2 bg-primary text-primary-foreground hover:bg-primary/90"
                                    size="sm"
                                >
                                    应用此样本量
                                    <ChevronRight className="w-4 h-4 ml-1" />
                                </Button>
                            </>
                        )}
                    </div>
                </div>

                {/* 精度-成本曲线图 */}
                <div className="rounded-xl border border-primary/90 bg-background p-3">
                    <div className="flex items-center gap-2 mb-3">
                        <TrendingUp className="w-4 h-4 text-primary" />
                        <span className="font-medium text-primary text-sm">
                            精度-成本关系
                        </span>
                    </div>

                    {/* 简化的可视化 */}
                    <div className="space-y-2">
                        <div className="flex justify-between text-xs text-muted-foreground">
                            <span>样本量 →</span>
                            <span>成本 →</span>
                        </div>
                        <div className="relative h-32 rounded-lg overflow-hidden border border-primary/20 bg-primary/5">
                            {/* 网格线 */}
                            <div className="absolute inset-0 flex flex-col justify-between p-2">
                                {[0, 1, 2, 3].map(i => (
                                    <div key={i} className="border-t border-muted-foreground/40" />
                                ))}
                            </div>

                            {/* 曲线点 */}
                            <div className="absolute inset-0 p-2 flex items-end justify-between">
                                {curveData.slice(0, 8).map((point, index) => {
                                    const maxCost = Math.max(...curveData.map(p => p.totalCost));
                                    const heightPercent = maxCost > 0 
                                        ? (point.totalCost / maxCost) * 80 + 10 
                                        : 50;
                                    
                                    return (
                                        <div 
                                            key={index}
                                            className="flex flex-col items-center gap-1"
                                            style={{ width: `${100 / 8}%` }}
                                        >
                                            <div 
                                                className="w-2 rounded-t bg-primary transition-all"
                                                style={{ height: `${heightPercent}%` }}
                                            />
                                            <span className="text-[10px] text-foreground/90">
                                                {point.sampleSize < 1000 
                                                    ? point.sampleSize 
                                                    : (point.sampleSize / 1000).toFixed(1) + 'k'
                                                }
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                        <p className="text-xs text-muted-foreground text-center">
                            随着样本量增加，边际精度收益递减
                        </p>
                    </div>
                </div>

                {/* 决策建议（与比例对比卡片的说明区一致：浅青绿提示框） */}
                <div className="rounded-xl border border-info/20 bg-info/10 p-3">
                    <div className="flex items-start gap-2">
                        <Info className="w-4 h-4 text-info shrink-0 mt-0.5" />
                        <div className="text-xs space-y-1 text-info">
                            <p className="font-medium">决策建议</p>
                            <ul className="space-y-1 list-disc list-inside text-info">
                                <li>在预算约束下，精度与成本呈非线性关系</li>
                                <li>当样本量超过1000后，精度提升的边际效益显著下降</li>
                                <li>建议优先保证 ±3-5% 的误差限，性价比最高</li>
                                <li>如需更高精度（±1-2%），成本将呈指数增长</li>
                            </ul>
                        </div>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
