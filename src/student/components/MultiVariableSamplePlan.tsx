import type { SurveyVariableSpec } from "@/domain/experiment/planning-types";
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
import { calculateSurveyVariableRequiredSampleSize as calculateSurveyVariableRequiredSampleSizeImpl } from "../experiment/sample-plan";
import { getSurveyVariableParameterError } from "../experiment/survey-variable-validation";

export type SurveyVariable = SurveyVariableSpec;

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
        description: "用于标记研究优先级；已填写的精度要求仍是硬约束",
    },
    secondary: {
        label: "次要变量",
        color: "bg-warning",
        description: "用于结果解读排序；不会让系统忽略本变量的精度要求",
    },
    tertiary: {
        label: "参考变量",
        color: "bg-input",
        description: "若保留精度参数，仍参与最大样本量决策；不要求时请删除该变量",
    },
};

export function calculateSurveyVariableRequiredSampleSize(variable: SurveyVariable, populationSize: number) {
    return calculateSurveyVariableRequiredSampleSizeImpl(variable, populationSize);
}

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
        const updatedVariables = variables.map((variable) => ({
            ...variable,
            requiredSampleSize: calculateSurveyVariableRequiredSampleSize(variable, populationSize),
        }));

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

    // 每个已配置精度都是硬约束，因此取全部变量需求的最大值；重要性只用于研究优先级标记。
    const recommendedSampleSize = useMemo(() => (
        variables.length > 0 ? Math.max(...variables.map((variable) => variable.requiredSampleSize)) : 0
    ), [variables]);
    const variableErrors = variables.map(variable => ({
        id: variable.id,
        name: variable.name || "未命名变量",
        error: !variable.name.trim() ? "请填写变量名称。" : getSurveyVariableParameterError(variable)
            ?? (!Number.isSafeInteger(variable.requiredSampleSize) || variable.requiredSampleSize <= 0 ? "当前参数无法计算样本量。" : null),
    })).filter(variable => variable.error !== null);
    const hasInvalidVariables = variableErrors.length > 0;

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
        <Card className="rounded-surface border-primary-border bg-primary-muted ">
            <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <BarChart3 className="w-5 h-5 text-primary" />
                        <CardTitle className="text-body text-primary">
                            多变量样本量规划
                        </CardTitle>
                    </div>
                    <Badge
                        variant="outline"
                        className="text-meta bg-primary-muted border-primary-border text-primary"
                    >
                        {variables.length} 个变量
                    </Badge>
                </div>
                <CardDescription className="text-foreground">
                    将每个已配置变量的精度作为约束，取所需样本量的最大值
                </CardDescription>
            </CardHeader>

            <CardContent className="space-y-4">
                {/* 说明卡片 */}
                {showExplanation && (
                    <div className="rounded-surface border border-warning-border bg-warning-muted p-3">
                        <div className="flex gap-2">
                            <Info className="w-4 h-4 text-warning shrink-0 mt-0.5" />
                            <div className="text-meta text-warning space-y-1">
                                <p className="font-medium">为什么需要多变量规划？</p>
                                <p className="text-warning">
                                    一个调查通常包含多个指标（如满意度、知晓率、消费金额等）。不同指标的变异程度不同，
                                    所需样本量也不同。系统会取全部已配置变量所需样本量的最大值；重要性只标记研究优先级，不会静默取消精度约束。
                                </p>
                                <button
                                    onClick={() => setShowExplanation(false)}
                                    className="text-warning hover:text-warning text-meta underline"
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
                                className={`rounded-surface border transition-colors ${
                                    isExpanded
                                        ? "border-primary bg-background "
                                        : "border-primary-border bg-background"
                                }`}
                            >
                                {/* 变量头部 */}
                                <div className="flex items-center gap-2 p-3">
                                    <button
                                        type="button"
                                        className="flex min-w-0 flex-1 cursor-pointer items-center justify-between gap-2 text-left"
                                        aria-expanded={isExpanded}
                                        aria-controls={`sample-variable-panel-${variable.id}`}
                                        aria-label={`${isExpanded ? "收起" : "展开"}变量：${variable.name || "未命名变量"}`}
                                        onClick={() => setExpandedVariable(isExpanded ? null : variable.id)}
                                    >
                                        <div className="flex min-w-0 items-center gap-3">
                                            <div className={`w-8 h-8 shrink-0 rounded-control flex items-center justify-center text-primary-foreground font-bold text-label ${importanceConfig.color}`}>
                                                {index + 1}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="font-medium text-primary truncate">
                                                    {variable.name}
                                                </div>
                                                <div className="flex items-center gap-2 text-meta text-primary">
                                                    <span className="px-1.5 py-0.5 rounded-control bg-primary text-primary-foreground">
                                                        {importanceConfig.label}
                                                    </span>
                                                    <span>{variableErrors.some(error => error.id === variable.id) ? "无法计算" : `需 n ≥ ${variable.requiredSampleSize.toLocaleString()}`}</span>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex shrink-0 items-center gap-2">
                                            {variable.importance === "primary" && (
                                                <Star className="w-4 h-4 text-destructive fill-destructive" />
                                            )}
                                            {isExpanded ? (
                                                <ChevronUp className="w-4 h-4 text-primary" />
                                            ) : (
                                                <ChevronDown className="w-4 h-4 text-primary" />
                                            )}
                                        </div>
                                    </button>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        aria-label={`删除变量：${variable.name || "未命名变量"}`}
                                        onClick={() => removeVariable(variable.id)}
                                        className="h-8 w-8 shrink-0 p-0 text-destructive hover:text-destructive hover:bg-destructive-muted"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </Button>
                                </div>

                                {/* 展开的配置面板 */}
                                {isExpanded && (
                                    <div id={`sample-variable-panel-${variable.id}`} className="px-4 pb-4 space-y-4">
                                        <div className="h-px bg-primary-border" />

                                        {/* 名称 */}
                                        <div className="space-y-2">
                                            <Label htmlFor={`sample-variable-name-${variable.id}`} className="text-meta text-primary">变量名称</Label>
                                            <Input
                                                id={`sample-variable-name-${variable.id}`}
                                                value={variable.name}
                                                onChange={(e) => updateVariable(variable.id, { name: e.target.value })}
                                                className="bg-card border-primary text-foreground"
                                                placeholder="如：满意度、知晓率、消费金额"
                                            />
                                        </div>

                                        {/* 变量类型 */}
                                        <div className="space-y-2">
                                            <Label className="text-meta text-primary">变量类型</Label>
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
                                                <SelectTrigger aria-label={`${variable.name || "变量"}类型`} className="bg-card border-primary text-foreground">
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
                                            <Label htmlFor={`sample-variable-estimate-${variable.id}`} className="text-meta text-primary">
                                                {variable.type === "proportion" ? "估计比例 p（0-1）" : "估计均值"}
                                            </Label>
                                            <div className="flex items-center gap-2">
                                                <Input
                                                    id={`sample-variable-estimate-${variable.id}`}
                                                    type="number"
                                                    value={variable.estimatedValue}
                                                    onChange={(e) => updateVariable(variable.id, {
                                                        estimatedValue: parseFloat(e.target.value) || 0
                                                    })}
                                                    className="bg-card border-primary text-foreground"
                                                    step={0.01}
                                                    min={variable.type === "proportion" ? 0 : undefined}
                                                    max={variable.type === "proportion" ? 1 : undefined}
                                                />
                                                {variable.type === "proportion" && (
                                                    <span className="text-primary text-label">0-1</span>
                                                )}
                                            </div>
                                            {variable.type === "proportion" ? (
                                                <p className="text-meta text-primary">
                                                    输入 0-1 小数，例如 0.5 = 50%。若填 0 或 1，系统视为缺少可靠先验并按 p=0.5 保守规划。
                                                </p>
                                            ) : Math.abs(variable.estimatedValue) === 0 ? (
                                                <p className="text-meta text-destructive">
                                                    均值为 0 时相对误差没有稳定含义，请填写非零先验均值，或改用主流程的绝对误差限。
                                                </p>
                                            ) : (
                                                <p className="text-meta text-primary">
                                                    相对误差按估计均值的绝对值计算；均值接近 0 时结果会不稳定，宜改用绝对误差限。
                                                </p>
                                            )}
                                        </div>

                                        {/* 标准差（均值类型时） */}
                                        {variable.type === "mean" && (
                                            <div className="space-y-2">
                                                <Label htmlFor={`sample-variable-deviation-${variable.id}`} className="text-meta text-primary">估计标准差 (σ)</Label>
                                                <Input
                                                    id={`sample-variable-deviation-${variable.id}`}
                                                    type="number"
                                                    value={variable.estimatedStdDev || ""}
                                                    onChange={(e) => updateVariable(variable.id, {
                                                        estimatedStdDev: parseFloat(e.target.value) || undefined
                                                    })}
                                                    className="bg-card border-primary text-foreground"
                                                    placeholder="输入估计的标准差"
                                                />
                                            </div>
                                        )}

                                        {/* 重要性 */}
                                        <div className="space-y-2">
                                            <Label className="text-meta text-primary">重要性</Label>
                                            <Select
                                                value={variable.importance}
                                                onValueChange={(value: "primary" | "secondary" | "tertiary") =>
                                                    updateVariable(variable.id, { importance: value })
                                                }
                                            >
                                                <SelectTrigger aria-label={`${variable.name || "变量"}重要性`} className="bg-card border-primary text-foreground">
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent className="bg-background border-primary">
                                                    <SelectItem value="primary">
                                                        <div className="flex items-center gap-2">
                                                            <div className="w-2 h-2 rounded-circle bg-destructive" />
                                                            主要变量（必须满足）
                                                        </div>
                                                    </SelectItem>
                                                    <SelectItem value="secondary">
                                                        <div className="flex items-center gap-2">
                                                            <div className="w-2 h-2 rounded-circle bg-warning" />
                                                            次要变量（仍满足所填精度）
                                                        </div>
                                                    </SelectItem>
                                                    <SelectItem value="tertiary">
                                                        <div className="flex items-center gap-2">
                                                            <div className="w-2 h-2 rounded-circle bg-input" />
                                                            参考变量（仍参与约束）
                                                        </div>
                                                    </SelectItem>
                                                </SelectContent>
                                            </Select>
                                            <p className="text-meta text-primary">
                                                {importanceConfig?.description || "设置变量重要性等级"}
                                            </p>
                                        </div>

                                        {/* 精度要求 */}
                                        <div className="grid grid-cols-2 gap-3">
                                            <div className="space-y-2">
                                                <Label className="text-meta text-primary">置信水平</Label>
                                                <Select
                                                    value={variable.confidenceLevel}
                                                    onValueChange={(value) => updateVariable(variable.id, { confidenceLevel: value })}
                                                >
                                                    <SelectTrigger aria-label={`${variable.name || "变量"}置信水平`} className="bg-card border-primary text-foreground">
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
                                                <Label htmlFor={`sample-variable-margin-${variable.id}`} className="text-meta text-primary">
                                                    {variable.type === "mean" ? "允许相对误差" : "允许误差"}
                                                </Label>
                                                <div className="flex items-center gap-1">
                                                    <Input
                                                        id={`sample-variable-margin-${variable.id}`}
                                                        type="number"
                                                        value={variable.marginOfError}
                                                        onChange={(e) => updateVariable(variable.id, {
                                                            marginOfError: parseFloat(e.target.value) || 0
                                                        })}
                                                        className="bg-card border-primary text-foreground"
                                                        min={0.1}
                                                        max={50}
                                                        step={0.1}
                                                    />
                                                    <span className="text-primary text-label">%</span>
                                                </div>
                                                {variable.type === "mean" && (
                                                    <p className="text-meta text-primary">
                                                        绝对误差限 e =（上方相对误差百分数 ÷ 100）× |估计均值|。左侧主流程直接填写绝对误差限，两者单位不同。
                                                    </p>
                                                )}
                                            </div>
                                        </div>

                                        {/* 计算结果 */}
                                        <div className="rounded-surface border border-primary bg-background p-3">
                                            <div className="flex items-center justify-between">
                                                <span className="text-meta text-muted-foreground">所需样本量</span>
                                                <span className="text-subheading font-bold tabular-nums text-info">
                                                    {variableErrors.some(error => error.id === variable.id) ? "无法计算" : variable.requiredSampleSize.toLocaleString()}
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
                    className="w-full border-primary text-primary hover:bg-primary-muted"
                >
                    <Plus className="w-4 h-4 mr-2" />
                    添加调查变量
                </Button>

                {/* 无变量时不展示「应用」：避免误触清空父级状态；有变量后在下方卡片内应用 */}

                {/* 总样本量计算 */}
                {variables.length > 0 && (
                    <div className="rounded-surface border-2 border-primary bg-background p-4 ">
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
                                    <div key={importance} className="flex items-center justify-between text-label">
                                        <div className="flex items-center gap-2">
                                            <div className={`w-2 h-2 rounded-circle ${config?.color || "bg-input"}`} />
                                            <span className="text-primary">
                                                {config?.label || importance}（{vars.length}个）
                                            </span>
                                        </div>
                                        <span className="font-mono text-primary">
                                            {vars.some(variable => variableErrors.some(error => error.id === variable.id)) ? "无法计算" : `max = ${maxSampleSize.toLocaleString()}`}
                                        </span>
                                    </div>
                                );
                            })}
                        </div>

                        <div className="mb-4 h-px bg-primary-border" />

                        <div className="flex justify-between items-center">
                            <span className="font-bold text-primary">建议总样本量</span>
                            <span className="text-page-title font-bold tabular-nums text-info">
                                {hasInvalidVariables ? "无法计算" : recommendedSampleSize.toLocaleString()}
                            </span>
                        </div>

                        <p className="text-meta text-primary mt-3 leading-relaxed">
                            原则：取全部已配置变量所需样本量的最大值。重要性只用于标记分析优先级；如某变量不需要精度保证，请删除它或明确放宽误差限。
                        </p>

                        {onApplyToPlan && (
                            <Button
                                type="button"
                                onClick={() => onApplyToPlan({ variables, recommendedSampleSize })}
                                disabled={hasInvalidVariables || recommendedSampleSize <= 0}
                                className="w-full mt-4 bg-primary text-primary-foreground hover:bg-primary-hover"
                            >
                                应用到样本量规划
                                <ArrowRight className="w-4 h-4 ml-2" />
                            </Button>
                        )}
                    </div>
                )}

                {/* 各变量样本量对比 */}
                {variables.length > 1 && !hasInvalidVariables && (
                    <div className="rounded-surface border border-primary bg-background p-3">
                        <div className="text-meta font-medium text-primary mb-3">
                            各变量样本量需求对比
                        </div>
                        <div className="space-y-2">
                            {[...variables]
                                .sort((a, b) => b.requiredSampleSize - a.requiredSampleSize)
                                .map((variable) => {
                                    const importanceConfig = getImportanceConfig(variable.importance);
                                    if (!importanceConfig) return null;

                                    const isMax = variable.requiredSampleSize === recommendedSampleSize;

                                    return (
                                        <div key={variable.id} className="flex items-center gap-3">
                                            <div className={`w-2 h-2 rounded-circle ${importanceConfig?.color || "bg-input"}`} />
                                            <span className="text-meta text-primary flex-1 truncate">
                                                {variable.name}
                                            </span>
                                            <div className="flex items-center gap-2">
                                                <div className="w-20 h-1.5 rounded-control bg-primary">
                                                    <div
                                                        className={`h-full rounded-control ${isMax ? "bg-destructive" : "bg-primary"}`}
                                                        style={{
                                                            width: `${Math.min(100, (variable.requiredSampleSize / recommendedSampleSize) * 100)}%`
                                                        }}
                                                    />
                                                </div>
                                                <span className={`text-meta font-mono w-12 text-right ${isMax ? "font-bold text-destructive" : "text-primary"}`}>
                                                    {variable.requiredSampleSize.toLocaleString()}
                                                </span>
                                                {isMax && (
                                                    <Badge className="bg-destructive text-destructive-foreground text-meta px-1">
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

                {hasInvalidVariables && (
                    <div role="alert" className="rounded-surface border border-destructive-border bg-destructive-muted p-3">
                        <div className="flex items-start gap-2">
                            <AlertCircle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
                            <div className="text-meta text-destructive">
                                <p className="font-medium mb-1">存在无法计算的变量</p>
                                {variableErrors.map(variable => <p key={variable.id}>{variable.name}：{variable.error}</p>)}
                                <p>请修正后再应用样本量。</p>
                            </div>
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
