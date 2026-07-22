import { useState, useEffect, useMemo, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
    Plus, 
    Trash2, 
    Target, 
    BarChart3, 
    AlertCircle, 
    Info,
    ChevronDown,
    ChevronUp,
    Star,
    ArrowRight,
} from "lucide-react";
import { zForConfidenceLevel } from "../experiment/confidence-level";
import { calculateFinitePopulationSampleSize } from "../experiment/sample-plan";

export interface SurveyVariable {
    id: string;
    name: string;
    type: "proportion" | "mean";
    estimatedValue: number;      // 估计值 (p或均值)
    estimatedStdDev?: number;    // 估计标准差 (均值类型时需要)
    importance: "primary" | "secondary" | "tertiary";
    confidenceLevel: string;
    marginOfError: number;
    requiredSampleSize: number;
}

interface MultiVariableSamplePlanProps {
    populationSize: number;
    onVariablesChange: (variables: SurveyVariable[]) => void;
    /** 若不需要实时同步推荐样本量到父组件，可省略 */
    onRecommendedSampleSizeChange?: (size: number) => void;
    initialVariables?: SurveyVariable[];
    /** 点击「应用到样本量规划」时一次性提交变量列表与建议样本量（用于弹层内先编辑再应用） */
    onApplyToPlan?: (payload: { variables: SurveyVariable[]; recommendedSampleSize: number }) => void;
    /** 新增变量时的默认置信水平（与决策面板一致） */
    defaultConfidenceLevel?: string;
    /** 新增比例变量时的默认允许误差 % */
    defaultMarginOfError?: number;
    /** 新增均值变量时的默认相对误差 % */
    defaultMeanRelativeMargin?: number;
    /** 新增变量时默认类型 */
    defaultVariableType?: "proportion" | "mean";
}

const IMPORTANCE_LABELS: Record<string, { label: string; color: string; description: string }> = {
    primary: { 
        label: "主要变量", 
        color: "bg-destructive",
        description: "核心调查指标，必须满足精度要求"
    },
    secondary: { 
        label: "次要变量", 
        color: "bg-warning",
        description: "重要但可接受稍低精度"
    },
    tertiary: { 
        label: "参考变量", 
        color: "bg-muted-foreground/50",
        description: "辅助参考，精度要求最低"
    },
};

export function MultiVariableSamplePlan({
    populationSize,
    onVariablesChange,
    onRecommendedSampleSizeChange,
    onApplyToPlan,
    initialVariables = [],
    defaultConfidenceLevel = "95",
    defaultMarginOfError = 5,
    defaultMeanRelativeMargin = 5,
    defaultVariableType = "proportion",
}: MultiVariableSamplePlanProps) {
    const [variables, setVariables] = useState<SurveyVariable[]>(initialVariables);
    const [expandedVariable, setExpandedVariable] = useState<string | null>(null);
    const [showExplanation, setShowExplanation] = useState(true);

    const onVariablesChangeRef = useRef(onVariablesChange);
    onVariablesChangeRef.current = onVariablesChange;

    const getDefaultMarginForType = (type: SurveyVariable["type"]) =>
        type === "mean" ? defaultMeanRelativeMargin : defaultMarginOfError;

    /** 仅当影响样本量计算的字段变化时变化，避免改名称/重要性等触发重算 */
    const variablesSampleCalcKey = useMemo(
        () =>
            variables
                .map(
                    (v) =>
                        `${v.type}-${v.estimatedValue}-${v.estimatedStdDev ?? ""}-${v.confidenceLevel}-${v.marginOfError}`,
                )
                .join(","),
        [variables],
    );

    // 计算每个变量所需的样本量
    useEffect(() => {
        const updatedVariables = variables.map(variable => {
            let requiredSampleSize = 0;

            if (variable.type === "proportion") {
                // 比例估计的样本量计算
                const p = variable.estimatedValue;
                requiredSampleSize = calculateFinitePopulationSampleSize({
                    confidenceLevel: variable.confidenceLevel,
                    marginOfError: variable.marginOfError,
                    populationSize,
                    designEffect: 1,
                    nonResponseRate: 0,
                    p: p > 0 && p < 1 ? p : 0.5,
                }) ?? 0;
            } else if (variable.type === "mean" && variable.estimatedStdDev) {
                // 均值估计的样本量计算（简化版）
                const z = zForConfidenceLevel(variable.confidenceLevel);
                const sigma = variable.estimatedStdDev;
                // 相对误差限：用户输入的百分比 × 估计均值 = 绝对误差
                // 例如：均值1000元、误差5% → E = 50元
                const e = (variable.marginOfError / 100) * (variable.estimatedValue || 1);

                // n₀ = (Z × σ / E)²
                const n0 = Math.pow((z * sigma) / e, 2);
                // 有限总体校正
                requiredSampleSize = Math.ceil(n0 / (1 + (n0 - 1) / populationSize));
            }

            return {
                ...variable,
                requiredSampleSize,
            };
        });

        // 检查是否有变化
        const hasChanged = updatedVariables.some((variable, index) => {
            const oldVariable = variables[index];
            return oldVariable && variable.requiredSampleSize !== oldVariable.requiredSampleSize;
        });

        if (hasChanged || updatedVariables.length !== variables.length) {
            setVariables(updatedVariables);
            onVariablesChangeRef.current(updatedVariables);
        }
        // 依赖不含 onVariablesChange：用 ref 始终调用最新回调，避免因父级内联函数导致 effect 每帧重跑
    }, [variablesSampleCalcKey, populationSize]);

    // 确定建议样本量（取主要变量中的最大值）
    const recommendedSampleSize = useMemo(() => {
        if (variables.length === 0) return 0;
        
        // 按重要性分组
        const primaryVars = variables.filter(v => v.importance === "primary");
        const secondaryVars = variables.filter(v => v.importance === "secondary");
        
        // 优先取主要变量的最大值
        if (primaryVars.length > 0) {
            return Math.max(...primaryVars.map(v => v.requiredSampleSize));
        }
        
        // 如果没有主要变量，取次要变量的最大值
        if (secondaryVars.length > 0) {
            return Math.max(...secondaryVars.map(v => v.requiredSampleSize));
        }
        
        // 否则取所有变量的最大值
        return Math.max(...variables.map(v => v.requiredSampleSize));
    }, [variables]);

    const onRecommendedSampleSizeChangeRef = useRef(onRecommendedSampleSizeChange);
    onRecommendedSampleSizeChangeRef.current = onRecommendedSampleSizeChange;

    // 当推荐样本量变化时可选通知父组件；传入 onApplyToPlan 时仅手动「应用」写回
    useEffect(() => {
        if (onApplyToPlan) return;
        onRecommendedSampleSizeChangeRef.current?.(recommendedSampleSize);
    }, [recommendedSampleSize, onApplyToPlan]);

    // 添加新变量
    const addVariable = () => {
        const type = defaultVariableType;
        const newVariable: SurveyVariable = {
            id: `var-${Date.now()}`,
            name: `调查变量 ${variables.length + 1}`,
            type,
            estimatedValue: type === "proportion" ? 0.5 : 0,
            importance: "primary",
            confidenceLevel: defaultConfidenceLevel,
            marginOfError: getDefaultMarginForType(type),
            estimatedStdDev: type === "mean" ? undefined : undefined,
            requiredSampleSize: 0,
        };
        const newVariables = [...variables, newVariable];
        setVariables(newVariables);
        setExpandedVariable(newVariable.id);
        onVariablesChange(newVariables);
    };

    // 删除变量
    const removeVariable = (id: string) => {
        const newVariables = variables.filter(v => v.id !== id);
        setVariables(newVariables);
        onVariablesChange(newVariables);
    };

    // 更新变量
    const updateVariable = (id: string, updates: Partial<SurveyVariable>) => {
        const newVariables = variables.map(v => 
            v.id === id ? { ...v, ...updates } : v
        );
        setVariables(newVariables);
        onVariablesChange(newVariables);
    };

    // 获取重要性配置
    const getImportanceConfig = (importance: string) => {
        return IMPORTANCE_LABELS[importance] || IMPORTANCE_LABELS.tertiary;
    };

    return (
        <Card className="rounded-2xl border-primary/20 bg-primary/10 shadow-sm">
            <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <BarChart3 className="w-5 h-5 text-primary" />
                        <CardTitle className="text-base text-primary">
                            多变量样本量规划
                        </CardTitle>
                    </div>
                    <Badge 
                        variant="outline" 
                        className="text-xs bg-primary/10 border-primary/20 text-primary"
                    >
                        {variables.length} 个变量
                    </Badge>
                </div>
                <CardDescription className="text-foreground/90">
                    当调查包含多个指标时，确保所有重要变量都有足够精度
                </CardDescription>
            </CardHeader>

            <CardContent className="space-y-4">
                {/* 说明卡片 */}
                {showExplanation && (
                    <div className="rounded-xl border border-warning/20 bg-warning/10 p-3">
                        <div className="flex gap-2">
                            <Info className="w-4 h-4 text-warning shrink-0 mt-0.5" />
                            <div className="text-xs text-warning space-y-1">
                                <p className="font-medium">为什么需要多变量规划？</p>
                                <p className="text-warning">
                                    一个调查通常包含多个指标（如满意度、知晓率、消费金额等）。不同指标的变异程度不同，
                                    所需样本量也不同。系统会自动选择能够满足所有主要变量的最大样本量。
                                </p>
                                <button 
                                    onClick={() => setShowExplanation(false)}
                                    className="text-warning hover:text-warning text-xs underline"
                                >
                                    隐藏说明
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* 变量列表 */}
                <div className="space-y-3">
                    {variables.map((variable, index) => {
                        const importanceConfig = getImportanceConfig(variable.importance);
                        const isExpanded = expandedVariable === variable.id;
                        
                        // 如果找不到配置，使用默认值
                        if (!importanceConfig) {
                            return null;
                        }
                        
                        return (
                            <div 
                                key={variable.id}
                                className={`rounded-xl border transition-all ${
                                    isExpanded
                                        ? "border-primary bg-background shadow-sm"
                                        : "border-primary/80 bg-background/95"
                                }`}
                            >
                                {/* 变量头部 */}
                                <div 
                                    className="flex items-center justify-between p-3 cursor-pointer"
                                    onClick={() => setExpandedVariable(isExpanded ? null : variable.id)}
                                >
                                    <div className="flex items-center gap-3">
                                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-primary-foreground font-bold text-sm ${importanceConfig.color}`}>
                                            {index + 1}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="font-medium text-primary truncate">
                                                {variable.name}
                                            </div>
                                            <div className="flex items-center gap-2 text-xs text-primary">
                                                <span className="px-1.5 py-0.5 rounded bg-primary text-primary-foreground">
                                                    {importanceConfig.label}
                                                </span>
                                                <span>需 n ≥ {variable.requiredSampleSize.toLocaleString()}</span>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {variable.importance === "primary" && (
                                            <Star className="w-4 h-4 text-destructive fill-destructive" />
                                        )}
                                        {isExpanded ? (
                                            <ChevronUp className="w-4 h-4 text-primary" />
                                        ) : (
                                            <ChevronDown className="w-4 h-4 text-primary" />
                                        )}
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                removeVariable(variable.id);
                                            }}
                                            className="h-8 w-8 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </Button>
                                    </div>
                                </div>

                                {/* 展开的配置面板 */}
                                {isExpanded && (
                                    <div className="px-4 pb-4 space-y-4">
                                        <div className="h-px bg-primary/50" />
                                        
                                        {/* 名称 */}
                                        <div className="space-y-2">
                                            <Label className="text-xs text-primary">变量名称</Label>
                                            <Input
                                                value={variable.name}
                                                onChange={(e) => updateVariable(variable.id, { name: e.target.value })}
                                                className="bg-background border-primary text-foreground"
                                                placeholder="如：满意度、知晓率、消费金额"
                                            />
                                        </div>

                                        {/* 变量类型 */}
                                        <div className="space-y-2">
                                            <Label className="text-xs text-primary">变量类型</Label>
                                            <Select 
                                                value={variable.type} 
                                                onValueChange={(value: "proportion" | "mean") =>
                                                    updateVariable(variable.id, {
                                                        type: value,
                                                        estimatedValue: value === "proportion"
                                                            ? Math.min(Math.max(variable.estimatedValue, 0), 1) || 0.5
                                                            : variable.estimatedValue,
                                                        estimatedStdDev: value === "mean" ? variable.estimatedStdDev : undefined,
                                                        marginOfError: getDefaultMarginForType(value),
                                                    })
                                                }
                                            >
                                                <SelectTrigger className="bg-background border-primary text-foreground">
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent className="bg-background border-primary">
                                                    <SelectItem value="proportion">比例（如知晓率、满意度）</SelectItem>
                                                    <SelectItem value="mean">均值（如消费金额、年龄）</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>

                                        {/* 估计值 */}
                                        <div className="space-y-2">
                                            <Label className="text-xs text-primary">
                                                {variable.type === "proportion" ? "估计比例 p（0-1）" : "估计均值"}
                                            </Label>
                                            <div className="flex items-center gap-2">
                                                <Input
                                                    type="number"
                                                    value={variable.estimatedValue}
                                                    onChange={(e) => updateVariable(variable.id, { 
                                                        estimatedValue: parseFloat(e.target.value) || 0 
                                                    })}
                                                    className="bg-background border-primary text-foreground"
                                                    step={0.01}
                                                    min={0}
                                                    max={variable.type === "proportion" ? 1 : undefined}
                                                />
                                                {variable.type === "proportion" && (
                                                    <span className="text-primary text-sm">0-1</span>
                                                )}
                                            </div>
                                            {variable.type === "proportion" && (
                                                <p className="text-xs text-primary">
                                                    输入 0-1 小数，例如 0.5 = 50%。保守估计通常取 p=0.5，此时方差最大。
                                                </p>
                                            )}
                                        </div>

                                        {/* 标准差（均值类型时） */}
                                        {variable.type === "mean" && (
                                            <div className="space-y-2">
                                                <Label className="text-xs text-primary">估计标准差 (σ)</Label>
                                                <Input
                                                    type="number"
                                                    value={variable.estimatedStdDev || ""}
                                                    onChange={(e) => updateVariable(variable.id, { 
                                                        estimatedStdDev: parseFloat(e.target.value) || undefined 
                                                    })}
                                                    className="bg-background border-primary text-foreground"
                                                    placeholder="输入估计的标准差"
                                                />
                                            </div>
                                        )}

                                        {/* 重要性 */}
                                        <div className="space-y-2">
                                            <Label className="text-xs text-primary">重要性</Label>
                                            <Select 
                                                value={variable.importance} 
                                                onValueChange={(value: "primary" | "secondary" | "tertiary") => 
                                                    updateVariable(variable.id, { importance: value })
                                                }
                                            >
                                                <SelectTrigger className="bg-background border-primary text-foreground">
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent className="bg-background border-primary">
                                                    <SelectItem value="primary">
                                                        <div className="flex items-center gap-2">
                                                            <div className="w-2 h-2 rounded-full bg-destructive" />
                                                            主要变量（必须满足）
                                                        </div>
                                                    </SelectItem>
                                                    <SelectItem value="secondary">
                                                        <div className="flex items-center gap-2">
                                                            <div className="w-2 h-2 rounded-full bg-warning" />
                                                            次要变量（尽量满足）
                                                        </div>
                                                    </SelectItem>
                                                    <SelectItem value="tertiary">
                                                        <div className="flex items-center gap-2">
                                                            <div className="w-2 h-2 rounded-full bg-muted-foreground/50" />
                                                            参考变量（参考性）
                                                        </div>
                                                    </SelectItem>
                                                </SelectContent>
                                            </Select>
                                            <p className="text-xs text-primary">
                                                {importanceConfig?.description || "设置变量重要性等级"}
                                            </p>
                                        </div>

                                        {/* 精度要求 */}
                                        <div className="grid grid-cols-2 gap-3">
                                            <div className="space-y-2">
                                                <Label className="text-xs text-primary">置信水平</Label>
                                                <Select 
                                                    value={variable.confidenceLevel} 
                                                    onValueChange={(value) => updateVariable(variable.id, { confidenceLevel: value })}
                                                >
                                                    <SelectTrigger className="bg-background border-primary text-foreground">
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent className="bg-background border-primary">
                                                        <SelectItem value="90">90%</SelectItem>
                                                        <SelectItem value="95">95%</SelectItem>
                                                        <SelectItem value="99">99%</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                            <div className="space-y-2">
                                                <Label className="text-xs text-primary">
                                                    {variable.type === "mean" ? "允许相对误差" : "允许误差"}
                                                </Label>
                                                <div className="flex items-center gap-1">
                                                    <Input
                                                        type="number"
                                                        value={variable.marginOfError}
                                                        onChange={(e) => updateVariable(variable.id, { 
                                                            marginOfError: parseFloat(e.target.value) || 0 
                                                        })}
                                                        className="bg-background border-primary text-foreground"
                                                        min={0.1}
                                                        max={50}
                                                        step={0.1}
                                                    />
                                                    <span className="text-primary text-sm">%</span>
                                                </div>
                                                {variable.type === "mean" && (
                                                    <p className="text-xs text-primary">
                                                        这里使用相对误差：绝对误差限 e = 相对误差 × 估计均值。它与左侧主流程里的绝对误差限不是同一语义。
                                                    </p>
                                                )}
                                            </div>
                                        </div>

                                        {/* 计算结果 */}
                                        <div className="rounded-lg border border-primary bg-background p-3">
                                            <div className="flex items-center justify-between">
                                                <span className="text-xs text-muted-foreground">所需样本量</span>
                                                <span className="text-lg font-bold tabular-nums text-info">
                                                    {variable.requiredSampleSize.toLocaleString()}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>

                {/* 添加按钮 */}
                <Button
                    variant="outline"
                    onClick={addVariable}
                    className="w-full border-primary text-primary hover:bg-primary/10"
                >
                    <Plus className="w-4 h-4 mr-2" />
                    添加调查变量
                </Button>

                {/* 无变量时不展示「应用」：避免误触清空父级状态；有变量后在下方卡片内应用 */}

                {/* 总样本量计算 */}
                {variables.length > 0 && (
                    <div className="rounded-xl border-2 border-primary bg-background p-4 shadow-sm">
                        <div className="flex items-center gap-2 mb-4">
                            <Target className="w-5 h-5 text-primary" />
                            <span className="font-bold text-primary">样本量决策</span>
                        </div>

                        {/* 按重要性分组显示 */}
                        <div className="space-y-3 mb-4">
                            {["primary", "secondary", "tertiary"].map(importance => {
                                const vars = variables.filter(v => v.importance === importance);
                                if (vars.length === 0) return null;
                                
                                const config = getImportanceConfig(importance);
                                if (!config) return null;
                                
                                const maxSampleSize = Math.max(...vars.map(v => v.requiredSampleSize));
                                
                                return (
                                    <div key={importance} className="flex items-center justify-between text-sm">
                                        <div className="flex items-center gap-2">
                                            <div className={`w-2 h-2 rounded-full ${config?.color || "bg-muted-foreground/50"}`} />
                                            <span className="text-primary">
                                                {config?.label || importance}（{vars.length}个）
                                            </span>
                                        </div>
                                        <span className="font-mono text-primary">
                                            max = {maxSampleSize.toLocaleString()}
                                        </span>
                                    </div>
                                );
                            })}
                        </div>

                        <div className="h-px bg-primary/50 mb-4" />

                        <div className="flex justify-between items-center">
                            <span className="font-bold text-primary">建议总样本量</span>
                            <span className="text-2xl font-bold tabular-nums text-info">
                                {recommendedSampleSize.toLocaleString()}
                            </span>
                        </div>

                        <p className="text-xs text-primary mt-3 leading-relaxed">
                            原则：取主要变量所需样本量的最大值。次要变量和参考变量可能在样本量上有所妥协。
                        </p>

                        {onApplyToPlan && (
                            <Button
                                type="button"
                                onClick={() => onApplyToPlan({ variables, recommendedSampleSize })}
                                className="w-full mt-4 bg-primary text-primary-foreground hover:bg-primary/90"
                            >
                                应用到样本量规划
                                <ArrowRight className="w-4 h-4 ml-2" />
                            </Button>
                        )}
                    </div>
                )}

                {/* 各变量样本量对比 */}
                {variables.length > 1 && (
                    <div className="rounded-xl border border-primary bg-background p-3">
                        <div className="text-xs font-medium text-primary mb-3">
                            各变量样本量需求对比
                        </div>
                        <div className="space-y-2">
                            {variables
                                .sort((a, b) => b.requiredSampleSize - a.requiredSampleSize)
                                .map((variable) => {
                                    const importanceConfig = getImportanceConfig(variable.importance);
                                    if (!importanceConfig) return null;
                                    
                                    const isMax = variable.requiredSampleSize === recommendedSampleSize && variable.importance === "primary";
                                    
                                    return (
                                        <div key={variable.id} className="flex items-center gap-3">
                                            <div className={`w-2 h-2 rounded-full ${importanceConfig?.color || "bg-muted-foreground/50"}`} />
                                            <span className="text-xs text-primary flex-1 truncate">
                                                {variable.name}
                                            </span>
                                            <div className="flex items-center gap-2">
                                                <div className="w-20 h-1.5 rounded-full bg-primary">
                                                    <div 
                                                        className={`h-full rounded-full ${isMax ? "bg-destructive" : "bg-primary"}`}
                                                        style={{ 
                                                            width: `${Math.min(100, (variable.requiredSampleSize / recommendedSampleSize) * 100)}%` 
                                                        }}
                                                    />
                                                </div>
                                                <span className={`text-xs font-mono w-12 text-right ${isMax ? "font-bold text-destructive" : "text-primary"}`}>
                                                    {variable.requiredSampleSize.toLocaleString()}
                                                </span>
                                                {isMax && (
                                                    <Badge className="bg-destructive text-destructive-foreground text-[10px] px-1">
                                                        决定因素
                                                    </Badge>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                        </div>
                    </div>
                )}

                {/* 提示信息 */}
                {variables.some(v => v.importance !== "primary") && (
                    <div className="rounded-xl border border-warning/20 bg-warning/10 p-3">
                        <div className="flex items-start gap-2">
                            <AlertCircle className="w-4 h-4 text-warning shrink-0 mt-0.5" />
                            <div className="text-xs text-warning">
                                <p className="font-medium mb-1">精度权衡提示</p>
                                <p className="text-warning">
                                    非主要变量的实际精度可能低于设定值。如需所有变量都达到目标精度，
                                    建议将所有变量设为"主要"或将次要变量的误差限放宽。
                                </p>
                            </div>
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
