import { useState, useEffect, useMemo } from "react";
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
    CheckCircle2,
    ChevronDown,
    ChevronUp,
    Star
} from "lucide-react";
import { calculateFinitePopulationSampleSize } from "../experiment/sample-plan";

export interface SurveyVariable {
    id: string;
    name: string;
    type: "proportion" | "mean" | "total";
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
    onRecommendedSampleSizeChange: (size: number) => void;
    initialVariables?: SurveyVariable[];
}

const IMPORTANCE_LABELS: Record<string, { label: string; color: string; description: string }> = {
    primary: { 
        label: "主要变量", 
        color: "bg-rose-500",
        description: "核心调查指标，必须满足精度要求"
    },
    secondary: { 
        label: "次要变量", 
        color: "bg-amber-500",
        description: "重要但可接受稍低精度"
    },
    tertiary: { 
        label: "参考变量", 
        color: "bg-slate-400",
        description: "辅助参考，精度要求最低"
    },
};

export function MultiVariableSamplePlan({ 
    populationSize,
    onVariablesChange,
    onRecommendedSampleSizeChange,
    initialVariables = []
}: MultiVariableSamplePlanProps) {
    const [variables, setVariables] = useState<SurveyVariable[]>(initialVariables);
    const [expandedVariable, setExpandedVariable] = useState<string | null>(null);
    const [showExplanation, setShowExplanation] = useState(true);

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
                const z = variable.confidenceLevel === "90" ? 1.645 : 
                         variable.confidenceLevel === "95" ? 1.96 : 2.576;
                const e = variable.marginOfError / 100;
                const sigma = variable.estimatedStdDev;
                
                // n₀ = (Z × σ / E)²
                const n0 = Math.pow((z * sigma) / e, 2);
                // 有限总体校正
                requiredSampleSize = Math.ceil(n0 / (1 + (n0 - 1) / populationSize));
            } else {
                // 默认使用比例估计
                requiredSampleSize = calculateFinitePopulationSampleSize({
                    confidenceLevel: variable.confidenceLevel,
                    marginOfError: variable.marginOfError,
                    populationSize,
                    designEffect: 1,
                    nonResponseRate: 0,
                }) ?? 0;
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
            onVariablesChange(updatedVariables);
        }
    }, [variables.map(v => `${v.type}-${v.estimatedValue}-${v.estimatedStdDev}-${v.confidenceLevel}-${v.marginOfError}`).join(','), populationSize]);

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

    // 当推荐样本量变化时通知父组件
    useEffect(() => {
        onRecommendedSampleSizeChange(recommendedSampleSize);
    }, [recommendedSampleSize]);

    // 添加新变量
    const addVariable = () => {
        const newVariable: SurveyVariable = {
            id: `var-${Date.now()}`,
            name: `调查变量 ${variables.length + 1}`,
            type: "proportion",
            estimatedValue: 0.5,
            importance: "primary",
            confidenceLevel: "95",
            marginOfError: 5,
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
        <Card className="rounded-2xl border-indigo-200/90 bg-indigo-50/90 shadow-sm dark:border-indigo-900/45 dark:bg-slate-950">
            <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <BarChart3 className="w-5 h-5 text-indigo-500" />
                        <CardTitle className="text-base text-indigo-900 dark:text-indigo-200">
                            多变量样本量规划
                        </CardTitle>
                    </div>
                    <Badge 
                        variant="outline" 
                        className="text-xs bg-indigo-100/50 border-indigo-200 text-indigo-700 dark:bg-indigo-900/30 dark:border-indigo-500/30 dark:text-indigo-300"
                    >
                        {variables.length} 个变量
                    </Badge>
                </div>
                <CardDescription className="text-slate-700 dark:text-slate-300">
                    当调查包含多个指标时，确保所有重要变量都有足够精度
                </CardDescription>
            </CardHeader>

            <CardContent className="space-y-4">
                {/* 说明卡片 */}
                {showExplanation && (
                    <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-3 dark:border-amber-500/20 dark:bg-amber-500/10">
                        <div className="flex gap-2">
                            <Info className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                            <div className="text-xs text-amber-800 dark:text-amber-200 space-y-1">
                                <p className="font-medium">为什么需要多变量规划？</p>
                                <p className="text-amber-900 dark:text-amber-100">
                                    一个调查通常包含多个指标（如满意度、知晓率、消费金额等）。不同指标的变异程度不同，
                                    所需样本量也不同。系统会自动选择能够满足所有主要变量的最大样本量。
                                </p>
                                <button 
                                    onClick={() => setShowExplanation(false)}
                                    className="text-amber-600 hover:text-amber-700 dark:text-amber-400 dark:hover:text-amber-300 text-xs underline"
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
                                        ? "border-indigo-300 bg-white shadow-sm dark:border-indigo-700/50 dark:bg-slate-950"
                                        : "border-indigo-200/80 bg-white/95 dark:border-indigo-800/40 dark:bg-slate-950"
                                }`}
                            >
                                {/* 变量头部 */}
                                <div 
                                    className="flex items-center justify-between p-3 cursor-pointer"
                                    onClick={() => setExpandedVariable(isExpanded ? null : variable.id)}
                                >
                                    <div className="flex items-center gap-3">
                                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-sm ${importanceConfig.color}`}>
                                            {index + 1}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="font-medium text-indigo-900 dark:text-indigo-100 truncate">
                                                {variable.name}
                                            </div>
                                            <div className="flex items-center gap-2 text-xs text-indigo-800 dark:text-indigo-200">
                                                <span className="px-1.5 py-0.5 rounded bg-indigo-100 dark:bg-indigo-900/50">
                                                    {importanceConfig.label}
                                                </span>
                                                <span>需 n ≥ {variable.requiredSampleSize.toLocaleString()}</span>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {variable.importance === "primary" && (
                                            <Star className="w-4 h-4 text-rose-500 fill-rose-500" />
                                        )}
                                        {isExpanded ? (
                                            <ChevronUp className="w-4 h-4 text-indigo-500" />
                                        ) : (
                                            <ChevronDown className="w-4 h-4 text-indigo-500" />
                                        )}
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                removeVariable(variable.id);
                                            }}
                                            className="h-8 w-8 p-0 text-rose-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/30"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </Button>
                                    </div>
                                </div>

                                {/* 展开的配置面板 */}
                                {isExpanded && (
                                    <div className="px-4 pb-4 space-y-4">
                                        <div className="h-px bg-indigo-200/50 dark:bg-indigo-700/30" />
                                        
                                        {/* 名称 */}
                                        <div className="space-y-2">
                                            <Label className="text-xs text-indigo-700 dark:text-indigo-300">变量名称</Label>
                                            <Input
                                                value={variable.name}
                                                onChange={(e) => updateVariable(variable.id, { name: e.target.value })}
                                                className="bg-white dark:bg-slate-950 border-indigo-200 dark:border-indigo-700 text-slate-900 dark:text-slate-100"
                                                placeholder="如：满意度、知晓率、消费金额"
                                            />
                                        </div>

                                        {/* 变量类型 */}
                                        <div className="space-y-2">
                                            <Label className="text-xs text-indigo-700 dark:text-indigo-300">变量类型</Label>
                                            <Select 
                                                value={variable.type} 
                                                onValueChange={(value: "proportion" | "mean" | "total") => 
                                                    updateVariable(variable.id, { type: value })
                                                }
                                            >
                                                <SelectTrigger className="bg-white dark:bg-slate-950 border-indigo-200 dark:border-indigo-700 text-slate-900 dark:text-slate-100">
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent className="bg-white dark:bg-slate-950 border-indigo-200 dark:border-indigo-700">
                                                    <SelectItem value="proportion">比例（如知晓率、满意度）</SelectItem>
                                                    <SelectItem value="mean">均值（如消费金额、年龄）</SelectItem>
                                                    <SelectItem value="total">总量（如总消费、总人数）</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>

                                        {/* 估计值 */}
                                        <div className="space-y-2">
                                            <Label className="text-xs text-indigo-700 dark:text-indigo-300">
                                                {variable.type === "proportion" ? "估计比例 (p)" : 
                                                 variable.type === "mean" ? "估计均值" : "估计总量"}
                                            </Label>
                                            <div className="flex items-center gap-2">
                                                <Input
                                                    type="number"
                                                    value={variable.estimatedValue}
                                                    onChange={(e) => updateVariable(variable.id, { 
                                                        estimatedValue: parseFloat(e.target.value) || 0 
                                                    })}
                                                    className="bg-white dark:bg-slate-950 border-indigo-200 dark:border-indigo-700 text-slate-900 dark:text-slate-100"
                                                    step={0.01}
                                                    min={0}
                                                    max={variable.type === "proportion" ? 1 : undefined}
                                                />
                                                {variable.type === "proportion" && (
                                                    <span className="text-indigo-600 dark:text-indigo-400 text-sm">%</span>
                                                )}
                                            </div>
                                            {variable.type === "proportion" && (
                                                <p className="text-xs text-indigo-800 dark:text-indigo-200">
                                                    保守估计使用 p=0.5，此时方差最大
                                                </p>
                                            )}
                                        </div>

                                        {/* 标准差（均值类型时） */}
                                        {variable.type === "mean" && (
                                            <div className="space-y-2">
                                                <Label className="text-xs text-indigo-700 dark:text-indigo-300">估计标准差 (σ)</Label>
                                                <Input
                                                    type="number"
                                                    value={variable.estimatedStdDev || ""}
                                                    onChange={(e) => updateVariable(variable.id, { 
                                                        estimatedStdDev: parseFloat(e.target.value) || undefined 
                                                    })}
                                                    className="bg-white dark:bg-slate-950 border-indigo-200 dark:border-indigo-700 text-slate-900 dark:text-slate-100"
                                                    placeholder="输入估计的标准差"
                                                />
                                            </div>
                                        )}

                                        {/* 重要性 */}
                                        <div className="space-y-2">
                                            <Label className="text-xs text-indigo-700 dark:text-indigo-300">重要性</Label>
                                            <Select 
                                                value={variable.importance} 
                                                onValueChange={(value: "primary" | "secondary" | "tertiary") => 
                                                    updateVariable(variable.id, { importance: value })
                                                }
                                            >
                                                <SelectTrigger className="bg-white dark:bg-slate-950 border-indigo-200 dark:border-indigo-700 text-slate-900 dark:text-slate-100">
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent className="bg-white dark:bg-slate-950 border-indigo-200 dark:border-indigo-700">
                                                    <SelectItem value="primary">
                                                        <div className="flex items-center gap-2">
                                                            <div className="w-2 h-2 rounded-full bg-rose-500" />
                                                            主要变量（必须满足）
                                                        </div>
                                                    </SelectItem>
                                                    <SelectItem value="secondary">
                                                        <div className="flex items-center gap-2">
                                                            <div className="w-2 h-2 rounded-full bg-amber-500" />
                                                            次要变量（尽量满足）
                                                        </div>
                                                    </SelectItem>
                                                    <SelectItem value="tertiary">
                                                        <div className="flex items-center gap-2">
                                                            <div className="w-2 h-2 rounded-full bg-slate-400" />
                                                            参考变量（参考性）
                                                        </div>
                                                    </SelectItem>
                                                </SelectContent>
                                            </Select>
                                            <p className="text-xs text-indigo-800 dark:text-indigo-200">
                                                {importanceConfig?.description || "设置变量重要性等级"}
                                            </p>
                                        </div>

                                        {/* 精度要求 */}
                                        <div className="grid grid-cols-2 gap-3">
                                            <div className="space-y-2">
                                                <Label className="text-xs text-indigo-700 dark:text-indigo-300">置信水平</Label>
                                                <Select 
                                                    value={variable.confidenceLevel} 
                                                    onValueChange={(value) => updateVariable(variable.id, { confidenceLevel: value })}
                                                >
                                                    <SelectTrigger className="bg-white dark:bg-slate-950 border-indigo-200 dark:border-indigo-700 text-slate-900 dark:text-slate-100">
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent className="bg-white dark:bg-slate-950 border-indigo-200 dark:border-indigo-700">
                                                        <SelectItem value="90">90%</SelectItem>
                                                        <SelectItem value="95">95%</SelectItem>
                                                        <SelectItem value="99">99%</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                            <div className="space-y-2">
                                                <Label className="text-xs text-indigo-700 dark:text-indigo-300">允许误差</Label>
                                                <div className="flex items-center gap-1">
                                                    <Input
                                                        type="number"
                                                        value={variable.marginOfError}
                                                        onChange={(e) => updateVariable(variable.id, { 
                                                            marginOfError: parseFloat(e.target.value) || 0 
                                                        })}
                                                        className="bg-white dark:bg-slate-950 border-indigo-200 dark:border-indigo-700 text-slate-900 dark:text-slate-100"
                                                        min={0.1}
                                                        max={50}
                                                        step={0.1}
                                                    />
                                                    <span className="text-indigo-600 dark:text-indigo-400 text-sm">%</span>
                                                </div>
                                            </div>
                                        </div>

                                        {/* 计算结果 */}
                                        <div className="rounded-lg border border-indigo-200 bg-white p-3 dark:border-indigo-800/50 dark:bg-slate-950">
                                            <div className="flex items-center justify-between">
                                                <span className="text-xs text-slate-600 dark:text-slate-400">所需样本量</span>
                                                <span className="text-lg font-bold tabular-nums text-teal-700 dark:text-teal-300">
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
                    className="w-full border-indigo-300 text-indigo-700 hover:bg-indigo-50 dark:border-indigo-700 dark:text-indigo-400 dark:hover:bg-indigo-900/30"
                >
                    <Plus className="w-4 h-4 mr-2" />
                    添加调查变量
                </Button>

                {/* 总样本量计算 */}
                {variables.length > 0 && (
                    <div className="rounded-xl border-2 border-indigo-300 bg-white p-4 shadow-sm dark:border-indigo-700/50 dark:bg-slate-950">
                        <div className="flex items-center gap-2 mb-4">
                            <Target className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                            <span className="font-bold text-indigo-900 dark:text-indigo-100">样本量决策</span>
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
                                            <div className={`w-2 h-2 rounded-full ${config?.color || "bg-slate-400"}`} />
                                            <span className="text-indigo-700 dark:text-indigo-300">
                                                {config?.label || importance}（{vars.length}个）
                                            </span>
                                        </div>
                                        <span className="font-mono text-indigo-900 dark:text-indigo-100">
                                            max = {maxSampleSize.toLocaleString()}
                                        </span>
                                    </div>
                                );
                            })}
                        </div>

                        <div className="h-px bg-indigo-300/50 dark:bg-indigo-700/50 mb-4" />

                        <div className="flex justify-between items-center">
                            <span className="font-bold text-indigo-950 dark:text-indigo-50">建议总样本量</span>
                            <span className="text-2xl font-bold tabular-nums text-teal-700 dark:text-teal-300">
                                {recommendedSampleSize.toLocaleString()}
                            </span>
                        </div>

                        <p className="text-xs text-indigo-900 dark:text-indigo-100 mt-3 leading-relaxed">
                            原则：取主要变量所需样本量的最大值。次要变量和参考变量可能在样本量上有所妥协。
                        </p>
                    </div>
                )}

                {/* 各变量样本量对比 */}
                {variables.length > 1 && (
                    <div className="rounded-xl border border-indigo-200 bg-white p-3 dark:border-indigo-800/50 dark:bg-slate-950">
                        <div className="text-xs font-medium text-indigo-600 dark:text-indigo-400 mb-3">
                            各变量样本量需求对比
                        </div>
                        <div className="space-y-2">
                            {variables
                                .sort((a, b) => b.requiredSampleSize - a.requiredSampleSize)
                                .map((variable, index) => {
                                    const importanceConfig = getImportanceConfig(variable.importance);
                                    if (!importanceConfig) return null;
                                    
                                    const isMax = variable.requiredSampleSize === recommendedSampleSize && variable.importance === "primary";
                                    
                                    return (
                                        <div key={variable.id} className="flex items-center gap-3">
                                            <div className={`w-2 h-2 rounded-full ${importanceConfig?.color || "bg-slate-400"}`} />
                                            <span className="text-xs text-indigo-600 dark:text-indigo-400 flex-1 truncate">
                                                {variable.name}
                                            </span>
                                            <div className="flex items-center gap-2">
                                                <div className="w-20 h-1.5 rounded-full bg-indigo-200 dark:bg-indigo-800">
                                                    <div 
                                                        className={`h-full rounded-full ${isMax ? "bg-rose-500" : "bg-indigo-400"}`}
                                                        style={{ 
                                                            width: `${Math.min(100, (variable.requiredSampleSize / recommendedSampleSize) * 100)}%` 
                                                        }}
                                                    />
                                                </div>
                                                <span className={`text-xs font-mono w-12 text-right ${isMax ? "font-bold text-rose-600 dark:text-rose-400" : "text-indigo-600 dark:text-indigo-400"}`}>
                                                    {variable.requiredSampleSize.toLocaleString()}
                                                </span>
                                                {isMax && (
                                                    <Badge className="bg-rose-500 text-white text-[10px] px-1">
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
                    <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-3 dark:border-amber-500/20 dark:bg-amber-500/10">
                        <div className="flex items-start gap-2">
                            <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                            <div className="text-xs text-amber-800 dark:text-amber-200">
                                <p className="font-medium mb-1">精度权衡提示</p>
                                <p className="text-amber-900 dark:text-amber-100">
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
