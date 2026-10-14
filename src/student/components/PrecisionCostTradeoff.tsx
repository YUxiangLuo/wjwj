import { useState, useMemo, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusBadge } from "@/components/StatusBadge";
import { CostPrecisionChart } from "./CostPrecisionChart";
import { calculateCostPlan } from "../experiment/cost-plan";
import { buildCostPrecisionCurve } from "../experiment/cost-precision-curve";
import {
    DollarSign,
    TrendingUp,
    AlertCircle,
    Target,
    Info,
    ChevronRight
} from "lucide-react";
import { zForConfidenceLevel } from "@/domain/statistics/confidence-level";
import { finitePopulationVarianceFactor } from "../experiment/sample-plan";
import { primarySliderClassName } from "./sample-planning-styles";

interface CostScenario {
    id: string;
    name: string;
    fixedCost: number;      // 固定成本（培训、督导等）
    variableCostPerUnit: number; // 每个发放单位的成本（含未完成者）
    totalBudget: number;     // 总预算
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
    /** 应用时回传完整输入与结果（用于高级规划快照持久化与服务端复算）。 */
    onSnapshot?: (snapshot: {
        inputs: {
            confidenceLevel: string;
            targetMarginOfError: number;
            designEffect: number;
            nonResponseRate: number;
            fixedCost: number;
            variableCostPerUnit: number;
            totalBudget: number;
        };
        result: { requiredSampleSize: number; totalCost: number; feasible: boolean };
    }) => void;
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
    onSnapshot,
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
        if (totalBudget < fixedCost) return 0;
        if (variableCostPerUnit === 0) return populationSize;
        const maxSample = Math.floor((totalBudget - fixedCost) / variableCostPerUnit);
        return Math.max(0, Math.min(maxSample, populationSize));
    }, [currentScenario, populationSize]);

    // 计算预算约束下的精度
    const achievablePrecision = useMemo(() => {
        if (maxFeasibleSampleSize <= 0) return null;

        // 从计划发放量先得到预期完成量 m=n(1-NRR)，再按
        // SE²≈deff×p(1-p)×FPC(m)/m 计算；FPC 必须使用完成量，不能使用除以 deff 后的“等效样本量”。
        const z = zForConfidenceLevel(confidenceLevelLocal);
        const p = 0.5;

        const safeDeff = designEffectLocal > 0 ? designEffectLocal : 1;
        const expectedRespondents = maxFeasibleSampleSize * (1 - nonResponseRateLocal);
        const fpc = finitePopulationVarianceFactor(populationSize, expectedRespondents);
        const marginOfError = z * Math.sqrt(safeDeff * p * (1 - p) / expectedRespondents * fpc) * 100;

        return {
            marginOfError,
            sampleSize: maxFeasibleSampleSize,
            totalCost: currentScenario.fixedCost + maxFeasibleSampleSize * currentScenario.variableCostPerUnit,
        };
    }, [maxFeasibleSampleSize, confidenceLevelLocal, populationSize, designEffectLocal, nonResponseRateLocal, currentScenario]);

    // 计算目标精度所需的样本量和成本
    const targetAnalysis = useMemo(() => calculateCostPlan({
        confidenceLevel: confidenceLevelLocal,
        targetMarginOfError,
        designEffect: designEffectLocal,
        nonResponseRate: nonResponseRateLocal,
        fixedCost: currentScenario.fixedCost,
        variableCostPerUnit: currentScenario.variableCostPerUnit,
        totalBudget: currentScenario.totalBudget,
    }, populationSize), [targetMarginOfError, confidenceLevelLocal, populationSize, designEffectLocal, nonResponseRateLocal, currentScenario]);

    const curveData = useMemo(() => buildCostPrecisionCurve({
        populationSize,
        confidenceLevel: confidenceLevelLocal,
        designEffect: designEffectLocal,
        nonResponseRate: nonResponseRateLocal,
        fixedCost: currentScenario.fixedCost,
        variableCostPerUnit: currentScenario.variableCostPerUnit,
        referenceSampleSizes: [maxFeasibleSampleSize, targetAnalysis?.requiredSampleSize ?? 0],
    }), [populationSize, confidenceLevelLocal, designEffectLocal, nonResponseRateLocal,
        currentScenario, maxFeasibleSampleSize, targetAnalysis]);

    return (
        <Card className="rounded-surface border-primary-border bg-primary-muted ">
            <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <DollarSign className="w-5 h-5 text-primary" />
                        <CardTitle className="text-body text-primary">
                            精度与成本权衡
                        </CardTitle>
                    </div>
                </div>
                <CardDescription className="text-foreground">
                    在给定预算约束下，评估可达到的精度水平
                </CardDescription>
            </CardHeader>

            <CardContent className="space-y-4">
                {/* 场景选择 */}
                <div className="space-y-2">
                    <Label className="text-meta font-medium text-foreground">调查场景</Label>
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
                                className={`text-meta h-auto py-2 ${
                                    !useCustom && selectedScenario.id === scenario.id
                                        ? "bg-primary text-primary-foreground hover:bg-primary-hover "
                                        : "border-primary bg-background text-primary hover:bg-primary-muted"
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
                        className={`w-full text-meta ${
                            useCustom
                                ? "bg-primary text-primary-foreground hover:bg-primary-hover"
                                : "border-primary bg-background text-primary hover:bg-primary-muted"
                        }`}
                    >
                        自定义成本参数
                    </Button>
                </div>

                {/* 自定义参数 */}
                {useCustom && (
                    <div className="space-y-3 p-3 rounded-surface border border-primary-border bg-background">
                        <div className="space-y-2">
                            <Label htmlFor="precision-fixed-cost" className="text-meta text-foreground">固定成本（元）</Label>
                            <Input
                                id="precision-fixed-cost"
                                type="number"
                                min={0}
                                step="any"
                                value={customScenario.fixedCost}
                                onChange={(e) => setCustomScenario({
                                    ...customScenario,
                                    fixedCost: Math.max(0, Number(e.target.value) || 0)
                                })}
                                className="bg-card border-primary text-foreground"
                            />
                            <p className="text-meta text-muted-foreground">培训、督导、设备等固定支出</p>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="precision-variable-cost" className="text-meta text-foreground">单位发放成本（元/单位）</Label>
                            <Input
                                id="precision-variable-cost"
                                type="number"
                                min={0}
                                step="any"
                                value={customScenario.variableCostPerUnit}
                                onChange={(e) => setCustomScenario({
                                    ...customScenario,
                                    variableCostPerUnit: Math.max(0, Number(e.target.value) || 0)
                                })}
                                className="bg-card border-primary text-foreground"
                            />
                            <p className="text-meta text-muted-foreground">按发放单位数计费，未完成者也计入成本；不按成功回收份数计费。</p>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="precision-total-budget" className="text-meta text-foreground">总预算（元）</Label>
                            <Input
                                id="precision-total-budget"
                                type="number"
                                min={0}
                                step="any"
                                value={customScenario.totalBudget}
                                onChange={(e) => setCustomScenario({
                                    ...customScenario,
                                    totalBudget: Math.max(0, Number(e.target.value) || 0)
                                })}
                                className="bg-card border-primary text-foreground"
                            />
                        </div>
                    </div>
                )}

                {/* 当前场景摘要 */}
                <div className="rounded-surface border border-primary-border bg-background p-3 space-y-2">
                    <div className="flex justify-between text-label">
                        <span className="text-foreground">固定成本</span>
                        <span className="font-mono text-primary">
                            ¥{currentScenario.fixedCost.toLocaleString()}
                        </span>
                    </div>
                    <div className="flex justify-between text-label">
                        <span className="text-foreground">单位发放成本</span>
                        <span className="font-mono text-primary">
                            ¥{currentScenario.variableCostPerUnit}/发放单位
                        </span>
                    </div>
                    <div className="flex justify-between text-label font-medium">
                        <span className="text-foreground">总预算</span>
                        <span className="font-mono text-primary">
                            ¥{currentScenario.totalBudget.toLocaleString()}
                        </span>
                    </div>
                </div>

                {/* 抽样假设：继承决策面板初值，仅影响本工具内演算 */}
                <div className="rounded-surface border border-primary-border bg-background p-3 space-y-4">
                    <p className="text-meta font-medium text-foreground">抽样假设（可在此调整）</p>
                    <div className="space-y-1.5">
                        <Label className="text-meta text-muted-foreground">置信水平</Label>
                        <Select value={confidenceLevelLocal} onValueChange={setConfidenceLevelLocal}>
                            <SelectTrigger aria-label="成本分析置信水平" className="h-9 text-label bg-card border-primary">
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
                        <div className="flex justify-between text-meta">
                            <span className="text-muted-foreground">设计效应</span>
                            <span className="font-bold tabular-nums text-primary">
                                {designEffectLocal.toFixed(1)}
                            </span>
                        </div>
                        <Slider
                            aria-label="成本分析设计效应"
                            value={[Math.round(designEffectLocal * 10)]}
                            onValueChange={([v]) => v != null && setDesignEffectLocal(Math.round(v) / 10)}
                            min={10}
                            max={50}
                            step={1}
                            className={primarySliderClassName}
                        />
                    </div>
                    <div className="space-y-1.5">
                        <div className="flex justify-between text-meta">
                            <span className="text-muted-foreground">无回答率</span>
                            <span className="font-bold tabular-nums text-destructive">
                                {Math.round(nonResponseRateLocal * 100)}%
                            </span>
                        </div>
                        <Slider
                            aria-label="成本分析无回答率"
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
                <div className="rounded-surface border-2 border-primary-border bg-background p-4 ">
                    <div className="flex items-center gap-2 mb-3">
                        <Target className="w-5 h-5 text-primary" />
                        <span className="font-bold text-primary">预算约束分析</span>
                    </div>

                    <div className="space-y-3">
                        <div className="flex justify-between items-center">
                            <span className="text-label text-foreground">预算可支持的最大样本量</span>
                            <span className="text-section-title font-bold tabular-nums text-primary">
                                {maxFeasibleSampleSize.toLocaleString()}
                            </span>
                        </div>

                        {achievablePrecision && (
                            <>
                                <div className="flex justify-between items-center">
                                    <span className="text-label text-foreground">预算内预期误差限</span>
                                    <span className="text-subheading font-bold tabular-nums text-info">
                                        ±{achievablePrecision.marginOfError.toFixed(1)}%
                                    </span>
                                </div>
                                <div className="flex justify-between items-center text-label">
                                    <span className="text-foreground">实际总成本</span>
                                    <span className="font-mono text-primary">
                                        ¥{achievablePrecision.totalCost.toLocaleString()}
                                    </span>
                                </div>
                            </>
                        )}
                    </div>

                    {achievablePrecision && achievablePrecision.totalCost > currentScenario.totalBudget * 0.9 && (
                        <div className="mt-3 rounded-surface border border-warning-border bg-warning-muted p-2">
                            <div className="flex items-center gap-2 text-meta text-warning">
                                <AlertCircle className="w-4 h-4 shrink-0 text-warning" />
                                <span>预算已接近上限，继续增加发放量可能需要追加预算</span>
                            </div>
                        </div>
                    )}
                </div>

                {/* 目标精度分析（与决策面板「允许误差」1～10% 可保存值不同，此处为工具内试算 1～15%） */}
                <div className="space-y-3">
                    <div>
                        <Label className="text-meta font-medium text-foreground">
                            目标精度（工具内试算，1～15%）
                        </Label>
                        <p className="text-meta text-muted-foreground mt-1 leading-relaxed">
                            左侧决策面板的「允许误差」为可保存的 1～10%；应用时会保存本工具的输入和结果快照；基础参数保持原值，后续结果页会分别展示。
                        </p>
                    </div>
                    <p className="text-meta font-medium text-foreground tabular-nums">
                        当前设定：±{targetMarginOfError}%
                    </p>
                    <Slider
                        aria-label="成本分析目标精度"
                        value={[targetMarginOfError]}
                        onValueChange={(v) => setTargetMarginOfError(v[0] ?? 5)}
                        min={1}
                        max={15}
                        step={1}
                        className={primarySliderClassName}
                    />

                    {targetAnalysis ? <div className="rounded-surface border border-primary-border bg-background p-3">
                        <div className="space-y-2">
                            <div className="flex justify-between text-label">
                                <span className="text-foreground">所需样本量</span>
                                <span className="font-mono text-primary">
                                    {targetAnalysis.requiredSampleSize.toLocaleString()}
                                </span>
                            </div>
                            <div className="flex justify-between text-label">
                                <span className="text-foreground">预估总成本</span>
                                <span className="font-mono text-primary">
                                    ¥{targetAnalysis.totalCost.toLocaleString()}
                                </span>
                            </div>

                            <p className="text-label text-foreground">
                                预期完成 {targetAnalysis.expectedCompleted.toLocaleString()} 份，预期误差限 ±{(targetAnalysis.marginOfError * 100).toFixed(2)} 个百分点（目标 ±{targetMarginOfError} 个百分点）。
                            </p>
                            <div className="flex flex-wrap items-center gap-2 text-label">
                                <StatusBadge intent={targetAnalysis.budgetFeasible ? "success" : "destructive"}>
                                    {targetAnalysis.budgetFeasible ? "预算充足" : "超预算"}
                                </StatusBadge>
                                <StatusBadge intent={targetAnalysis.precisionReached ? "success" : "warning"}>
                                    {targetAnalysis.precisionReached ? "预期精度达标" : "预期精度未达标"}
                                </StatusBadge>
                            </div>
                            {!targetAnalysis.budgetFeasible && <p className="text-meta text-destructive">还需 ¥{targetAnalysis.budgetGap.toLocaleString()}，请增加预算或调整目标。</p>}
                            {!targetAnalysis.precisionReached && <p className="text-meta text-warning">发放量已达到总体上限，按当前无回答率仍无法达到目标精度。请改善回答率或调整目标；增加预算本身不能解决这一限制。</p>}

                        </div>

                        {targetAnalysis.budgetFeasible && (
                            <>
                                <p className="text-meta text-muted-foreground leading-relaxed mt-3">
                                    「应用」仅将样本量写入最终样本量。若抽样假设与左侧不一致，理解此 n 时以本工具为准；左侧不会随本工具更新，勿用左侧参数代回验算。
                                </p>
                                <Button
                                    onClick={() => {
                                        onSnapshot?.({
                                            inputs: {
                                                confidenceLevel: confidenceLevelLocal,
                                                targetMarginOfError,
                                                designEffect: designEffectLocal,
                                                nonResponseRate: nonResponseRateLocal,
                                                fixedCost: currentScenario.fixedCost,
                                                variableCostPerUnit: currentScenario.variableCostPerUnit,
                                                totalBudget: currentScenario.totalBudget,
                                            },
                                            result: {
                                                requiredSampleSize: targetAnalysis.requiredSampleSize,
                                                totalCost: targetAnalysis.totalCost,
                                                feasible: targetAnalysis.isFeasible,
                                            },
                                        });
                                        onApplyBudget(currentScenario.totalBudget, targetAnalysis.requiredSampleSize);
                                    }}
                                    className="w-full mt-2 bg-primary text-primary-foreground hover:bg-primary-hover"
                                    size="sm"
                                >
                                    {targetAnalysis.precisionReached ? "应用此样本量" : "采用此未达标样本量"}
                                    <ChevronRight className="w-4 h-4 ml-1" />
                                </Button>
                            </>
                        )}
                    </div> : <p role="alert" className="text-label text-destructive">参数无效，无法计算成本与精度。</p>}
                </div>

                {/* 精度-成本曲线图 */}
                <div className="rounded-surface border border-primary-border bg-background p-3">
                    <div className="flex items-center gap-2 mb-3">
                        <TrendingUp className="w-4 h-4 text-primary" />
                        <span className="font-medium text-primary text-label">
                            精度-成本关系
                        </span>
                    </div>

                    <CostPrecisionChart {...curveData} targetMarginOfError={targetMarginOfError} budget={currentScenario.totalBudget} />

                </div>

                {/* 决策建议（与比例对比卡片的说明区一致：浅青绿提示框） */}
                <div className="rounded-surface border border-info-border bg-info-muted p-3">
                    <div className="flex items-start gap-2">
                        <Info className="w-4 h-4 text-info shrink-0 mt-0.5" />
                        <div className="text-meta space-y-1 text-info">
                            <p className="font-medium">决策建议</p>
                            <ul className="space-y-1 list-disc list-inside text-info">
                                <li>在抽样比很小且其他参数固定时，所需样本量近似与误差限平方的倒数成比例</li>
                                <li>例如误差限减半，线性单位成本下的样本量和变动成本约为原来的 4 倍</li>
                                <li>有限总体校正和发放量封顶会改变上述倍数，应以本页当前情景的计算结果为准</li>
                                <li>最终精度应由研究目标、关键子总体、预算与错误决策代价共同确定，不存在通用最优百分比</li>
                            </ul>
                        </div>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
