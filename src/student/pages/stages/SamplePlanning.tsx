import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from "@/components/ui/dialog";
import { Calculator, Users, Info, CheckCircle, RotateCcw, Settings2, ClipboardList } from "lucide-react";
import { useExperiment } from "../ExperimentLayout";
import type { SamplePlanData } from "../../api-client";
import { ImmersiveExperimentLaunch } from "../../components/ImmersiveExperimentLaunch";
import { 
    calculateFinitePopulationSampleSize, 
    calculateSampleSizeMetrics,
    calculateSampleSizeForDifferentP,
    calculateSampleSizeSensitivity,
    type SampleSizeMetrics,
} from "../../experiment/sample-plan";
import { EnhancedMetricsCard } from "../../components/EnhancedMetricsCard";
import { PValueComparisonCard } from "../../components/PValueComparisonCard";
import { SensitivityAnalysisCard } from "../../components/SensitivityAnalysisCard";
import { DomainEstimationManager, type Domain } from "../../components/DomainEstimationManager";
import { PrecisionCostTradeoff } from "../../components/PrecisionCostTradeoff";
import { DesignEffectEstimator } from "../../components/DesignEffectEstimator";
import { MultiVariableSamplePlan, type SurveyVariable } from "../../components/MultiVariableSamplePlan";
import { CVBasedSampleSizeCalculator } from "../../components/CVBasedSampleSizeCalculator";
import { ClusterSamplingCalculator } from "../../components/ClusterSamplingCalculator";
import { ADVANCED_TAB_CONFIG, type AdvancedTab } from "../../components/sample-planning/advancedTabs";
import { SamplePlanningAdvancedFeatures } from "../../components/sample-planning/SamplePlanningAdvancedFeatures";
import { SamplePlanningStudyGuide } from "../../components/sample-planning/SamplePlanningStudyGuide";

interface SamplePlanningProps {
    onPrev: () => void;
}

export function SamplePlanning({ onPrev }: SamplePlanningProps) {
    const { populationSize, experiment, registerStageSave, saveExperiment } = useExperiment();

    // Initialize from saved data
    const initialData = experiment?.samplePlan as SamplePlanData | null;

    const [confidenceLevel, setConfidenceLevel] = useState(initialData?.confidenceLevel ?? "95");
    const [marginOfError, setMarginOfError] = useState([initialData?.marginOfError ?? 5]);
    const [designEffect, setDesignEffect] = useState(initialData?.designEffect ?? 1);
    const [nonResponseRate, setNonResponseRate] = useState(initialData?.nonResponseRate ?? 0);
    const [finalSampleSize, setFinalSampleSize] = useState(initialData?.finalSampleSize ?? 384);
    const [confirmNextOpen, setConfirmNextOpen] = useState(false);
    
    // 增强指标
    const [metrics, setMetrics] = useState<SampleSizeMetrics | null>(null);
    const [pComparison, setPComparison] = useState<Array<{ p: number; pLabel: string; sampleSize: number; description: string }>>([]);
    const [sensitivityMatrix, setSensitivityMatrix] = useState<Array<{
        confidenceLabel: string;
        confidenceLevel: string;
        marginOfError: number;
        sampleSize: number;
    }> | null>(null);

    // 高级功能面板 — 一次只显示一个（Modal 形式）
    const [activeAdvancedTab, setActiveAdvancedTab] = useState<AdvancedTab | null>(null);

    // 子总体估计数据
    const [domains, setDomains] = useState<Domain[]>([]);

    // 多变量样本量规划数据
    const [surveyVariables, setSurveyVariables] = useState<SurveyVariable[]>([]);

    const N = populationSize;

    // Z values for confidence levels
    const zValues: Record<string, number> = {
        "90": 1.645,
        "95": 1.96,
        "99": 2.576,
    };

    // Calculate recommended sample size
    const calculateSampleSize = useCallback(() => {
        return calculateFinitePopulationSampleSize({
            confidenceLevel,
            marginOfError: marginOfError[0] ?? 5,
            populationSize: N,
            designEffect,
            nonResponseRate,
        }) ?? 384;
    }, [confidenceLevel, marginOfError, N, designEffect, nonResponseRate]);

    const recommendedSize = calculateSampleSize();

    // Calculate enhanced metrics when parameters change
    useEffect(() => {
        const newMetrics = calculateSampleSizeMetrics({
            confidenceLevel,
            marginOfError: marginOfError[0] ?? 5,
            populationSize: N,
            designEffect,
            nonResponseRate,
        });
        setMetrics(newMetrics);

        const pComparisonData = calculateSampleSizeForDifferentP({
            confidenceLevel,
            marginOfError: marginOfError[0] ?? 5,
            populationSize: N,
            designEffect,
            nonResponseRate,
        });
        setPComparison(pComparisonData);

        const sensitivityData = calculateSampleSizeSensitivity({
            populationSize: N,
            designEffect,
            nonResponseRate,
        });
        setSensitivityMatrix(sensitivityData);
    }, [confidenceLevel, marginOfError, N, designEffect, nonResponseRate]);
    const minSize = 30;
    const maxSize = Math.floor(N * 0.5);

    const isValidSize = finalSampleSize >= minSize && finalSampleSize <= maxSize;

    const buildSamplePlanData = useCallback((): SamplePlanData => ({
        confidenceLevel,
        marginOfError: marginOfError[0] ?? 5,
        designEffect,
        nonResponseRate,
        recommendedSize,
        finalSampleSize,
    }), [confidenceLevel, marginOfError, designEffect, nonResponseRate, recommendedSize, finalSampleSize]);

    const saveSamplePlan = useCallback(async () => {
        return saveExperiment({ samplePlan: buildSamplePlanData() });
    }, [buildSamplePlanData, saveExperiment]);

    useEffect(() => {
        registerStageSave(saveSamplePlan);
        return () => {
            registerStageSave(null);
        };
    }, [registerStageSave, saveSamplePlan]);

    // Auto-update final sample size when recommended changes (only if user hasn't modified it - simplified logic for now: update if no initial data)
    useEffect(() => {
        if (!initialData) {
            setFinalSampleSize(recommendedSize);
        }
    }, [recommendedSize, initialData]);

    const handleConfirmNext = async () => {
        const samplePlanData = buildSamplePlanData();
        const success = await saveExperiment({ samplePlan: samplePlanData, currentStage: 3 });
        if (success) setShowLaunch(true);
    };

    const [showLaunch, setShowLaunch] = useState(false);

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300" data-testid="student-stage-sample-plan">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 space-y-4">
                    <Card className="gap-2 py-4 rounded-2xl border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 shadow-sm">
                        <CardHeader className="border-b border-slate-200 dark:border-slate-800 px-4 pb-3 pt-0 [.border-b]:pb-3">
                            <CardTitle className="flex items-center gap-2 text-base text-slate-900 dark:text-slate-100">
                                <Users className="w-4 h-4 shrink-0 text-indigo-500" />
                                总体信息
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="px-4 pb-1 pt-3">
                            <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white/50 px-3 py-2.5 dark:border-slate-800 dark:bg-slate-950/50">
                                <span className="text-slate-600 dark:text-slate-400">总体规模 (N)</span>
                                <span className="text-xl font-bold tabular-nums text-indigo-500">{N.toLocaleString()} <span className="text-sm font-normal text-slate-500">人</span></span>
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="gap-2 py-4 rounded-2xl border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 shadow-sm">
                        <CardHeader className="border-b border-slate-200 dark:border-slate-800 px-4 pb-3 pt-0 [.border-b]:pb-3">
                            <div className="flex items-center justify-between">
                                <CardTitle className="flex items-center gap-2 text-base text-slate-900 dark:text-slate-100">
                                    <Calculator className="w-4 h-4 shrink-0 text-teal-500" />
                                    参数设置
                                </CardTitle>
                            </div>
                            <CardDescription className="mt-0.5 text-sm text-slate-600 dark:text-slate-400">
                                调整置信水平和允许误差来计算建议样本量
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4 px-4 pb-2 pt-4">
                            <div className="grid grid-cols-1 gap-5 md:grid-cols-2 md:gap-6">
                                <div className="space-y-2.5">
                                    <div className="flex justify-between">
                                        <Label className="text-slate-700 dark:text-slate-300">置信水平</Label>
                                        <span className="text-xs font-mono text-indigo-500 bg-indigo-500/10 px-2 py-0.5 rounded">Z = {zValues[confidenceLevel]}</span>
                                    </div>
                                    <Select value={confidenceLevel} onValueChange={setConfidenceLevel}>
                                        <SelectTrigger data-testid="student-sample-plan-confidence" className="bg-white/50 dark:bg-slate-950/50 border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 focus:ring-teal-500/50">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent className="bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200">
                                            <SelectItem value="90">90% (宽松)</SelectItem>
                                            <SelectItem value="95">95% (标准)</SelectItem>
                                            <SelectItem value="99">99% (严谨)</SelectItem>
                                        </SelectContent>
                                    </Select>
                                    <p className="text-xs leading-snug text-slate-500">
                                        置信水平越高，结果的可信度越高，但所需样本量也越大。
                                    </p>
                                </div>

                                <div className="space-y-2.5">
                                    <div className="flex justify-between items-center">
                                        <Label className="text-slate-700 dark:text-slate-300">允许误差 (Margin of Error)</Label>
                                        <div className="flex items-center gap-1">
                                            <Input
                                                type="number"
                                                value={marginOfError[0]}
                                                onChange={(e) => {
                                                    const v = parseInt(e.target.value);
                                                    if (!Number.isNaN(v) && v >= 1 && v <= 10) {
                                                        setMarginOfError([v]);
                                                    }
                                                }}
                                                min={1}
                                                max={10}
                                                data-testid="student-sample-plan-margin-input"
                                                className="w-16 h-7 text-sm font-bold text-teal-600 dark:text-teal-400 bg-white/50 dark:bg-slate-950/50 border-slate-200 dark:border-slate-800 text-center px-1"
                                            />
                                            <span className="text-sm font-bold text-teal-600 dark:text-teal-400">%</span>
                                        </div>
                                    </div>
                                    <Slider
                                        value={marginOfError}
                                        onValueChange={setMarginOfError}
                                        min={1}
                                        max={10}
                                        step={1}
                                        className="py-2 [&>.relative>.absolute]:bg-teal-500"
                                    />
                                    <p className="flex justify-between text-xs leading-snug text-slate-500">
                                        <span>1% (精确)</span>
                                        <span>10% (粗略)</span>
                                    </p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="gap-2 py-4 rounded-2xl border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 shadow-sm">
                        <CardHeader className="border-b border-slate-200 dark:border-slate-800 px-4 pb-3 pt-0 [.border-b]:pb-3">
                            <div className="flex items-center justify-between">
                                <CardTitle className="flex items-center gap-2 text-base text-slate-900 dark:text-slate-100">
                                    <Settings2 className="w-4 h-4 shrink-0 text-amber-500" />
                                    调整参数
                                </CardTitle>
                            </div>
                            <CardDescription className="mt-0.5 text-sm text-slate-600 dark:text-slate-400">
                                根据实际调查情况设置设计效应和预期无回答率
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4 px-4 pb-2 pt-4">
                            <div className="grid grid-cols-1 gap-5 md:grid-cols-2 md:gap-6">
                                <div className="space-y-2.5">
                                    <div className="flex justify-between items-center">
                                        <Label className="text-slate-700 dark:text-slate-300">设计效应 (deff)</Label>
                                        <span className="text-xs font-mono text-amber-600 dark:text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded">
                                            deff = {designEffect.toFixed(1)}
                                        </span>
                                    </div>
                                    <Input
                                        type="number"
                                        value={designEffect}
                                        onChange={(e) => {
                                            const v = parseFloat(e.target.value);
                                            if (!Number.isNaN(v) && v >= 1 && v <= 5) {
                                                setDesignEffect(Math.round(v * 10) / 10);
                                            }
                                        }}
                                        min={1}
                                        max={5}
                                        step={0.1}
                                        data-testid="student-sample-plan-deff"
                                        className="bg-white/50 dark:bg-slate-950/50 border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 focus:ring-amber-500/50"
                                    />
                                    <p className="text-xs leading-snug text-slate-500">
                                        设计效应反映复杂抽样设计对方差的影响。简单随机抽样时为 1.0，使用整群抽样时通常为 1.5-3.0。
                                    </p>
                                </div>

                                <div className="space-y-2.5">
                                    <div className="flex justify-between items-center">
                                        <Label className="text-slate-700 dark:text-slate-300">预期无回答率</Label>
                                        <div className="flex items-center gap-1">
                                            <Input
                                                type="number"
                                                value={Math.round(nonResponseRate * 100)}
                                                onChange={(e) => {
                                                    const v = parseInt(e.target.value);
                                                    if (!Number.isNaN(v) && v >= 0 && v <= 50) {
                                                        setNonResponseRate(v / 100);
                                                    }
                                                }}
                                                min={0}
                                                max={50}
                                                data-testid="student-sample-plan-nrr-input"
                                                className="w-16 h-7 text-sm font-bold text-amber-600 dark:text-amber-400 bg-white/50 dark:bg-slate-950/50 border-slate-200 dark:border-slate-800 text-center px-1"
                                            />
                                            <span className="text-sm font-bold text-amber-600 dark:text-amber-400">%</span>
                                        </div>
                                    </div>
                                    <Slider
                                        value={[Math.round(nonResponseRate * 100)]}
                                        onValueChange={(v) => setNonResponseRate((v[0] ?? 0) / 100)}
                                        min={0}
                                        max={50}
                                        step={5}
                                        data-testid="student-sample-plan-nrr"
                                        className="py-2 [&>.relative>.absolute]:bg-amber-500"
                                    />
                                    <p className="text-xs leading-snug text-slate-500">
                                        预期无回答率用于补偿调查中不回应的比例。一般线上调查约 10%-30%，面对面调查约 5%-15%。
                                    </p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    <Card className={`gap-2 py-4 rounded-2xl border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 shadow-sm transition-colors ${!isValidSize ? "border-rose-500/50 ring-1 ring-rose-500/20" : ""}`}>
                        <CardHeader className="border-b border-slate-200 dark:border-slate-800 px-4 pb-3 pt-0 [.border-b]:pb-3">
                            <CardTitle className="flex items-center gap-2 text-base text-slate-900 dark:text-slate-100">
                                <CheckCircle className="w-4 h-4 shrink-0 text-emerald-500" />
                                最终样本量
                            </CardTitle>
                            <CardDescription className="text-sm text-slate-600 dark:text-slate-400">您可以根据实际情况微调最终样本量</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-3 px-4 pb-2 pt-4">
                            <div className="flex flex-col items-end gap-3 md:flex-row">
                                <div className="w-full flex-1 space-y-1.5">
                                    <div className="flex items-center justify-between gap-3">
                                        <Label htmlFor="finalSize" className="text-slate-700 dark:text-slate-300">设定样本量</Label>
                                        <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                                            建议值 {recommendedSize.toLocaleString()} 人
                                        </span>
                                    </div>
                                    <div className="relative">
                                        <Input
                                            id="finalSize"
                                            type="number"
                                            value={finalSampleSize}
                                            onChange={(e) => setFinalSampleSize(parseInt(e.target.value) || 0)}
                                            min={minSize}
                                            max={maxSize}
                                            data-testid="student-sample-plan-final-size"
                                            className={`pr-16 bg-white/50 dark:bg-slate-950/50 border-slate-200 dark:border-slate-800 text-lg font-bold ${!isValidSize ? "text-rose-500 border-rose-500/50 focus-visible:ring-rose-500" : "text-emerald-600 focus-visible:ring-emerald-500"}`}
                                        />
                                        <span className="pointer-events-none absolute right-8 top-1/2 -translate-y-1/2 text-slate-500 text-sm">人</span>
                                    </div>
                                </div>
                                <Button
                                    variant="outline"
                                    onClick={() => setFinalSampleSize(recommendedSize)}
                                    data-testid="student-sample-plan-reset"
                                    className="border-slate-300 dark:border-slate-700 bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-700 hover:text-slate-900 dark:hover:text-slate-100"
                                >
                                    <RotateCcw className="w-4 h-4 mr-2" />
                                    重置为建议值
                                </Button>
                            </div>

                            {!isValidSize ? (
                                <div className="flex items-center gap-2 rounded-xl border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-sm text-rose-600">
                                    <Info className="h-4 w-4 shrink-0" />
                                    样本量超出有效范围，建议在 {minSize} - {maxSize.toLocaleString()} 之间
                                </div>
                            ) : (
                                <div className="flex justify-between rounded-xl border border-slate-200 bg-white/50 px-3 py-2 text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-950/50">
                                    <span>最小建议: {minSize}</span>
                                    <span>最大建议 (总体50%): {maxSize.toLocaleString()}</span>
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    <Card className="gap-2 py-4 rounded-2xl border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 shadow-sm">
                        <CardHeader className="border-b border-slate-200 dark:border-slate-800 px-4 pb-3 pt-0 [.border-b]:pb-3">
                            <CardTitle className="flex items-center gap-2 text-base text-slate-900 dark:text-slate-100">
                                <ClipboardList className="w-4 h-4 shrink-0 text-slate-500" />
                                参数摘要
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="px-4 pb-2 pt-3" data-testid="student-sample-plan-summary">
                            <div className="grid grid-cols-1 gap-x-6 gap-y-0 sm:grid-cols-2">
                                <div className="flex justify-between gap-2 border-b border-slate-200/50 py-1.5 text-sm dark:border-slate-800/50">
                                    <span className="text-slate-500">置信水平</span>
                                    <span className="font-mono text-slate-800 dark:text-slate-200 tabular-nums">{confidenceLevel}%</span>
                                </div>
                                <div className="flex justify-between gap-2 border-b border-slate-200/50 py-1.5 text-sm dark:border-slate-800/50">
                                    <span className="text-slate-500">允许误差</span>
                                    <span className="font-mono text-slate-800 dark:text-slate-200 tabular-nums">{marginOfError[0]}%</span>
                                </div>
                                <div className="flex justify-between gap-2 border-b border-slate-200/50 py-1.5 text-sm dark:border-slate-800/50">
                                    <span className="text-slate-500">设计效应</span>
                                    <span className="font-mono text-slate-800 dark:text-slate-200 tabular-nums">{designEffect.toFixed(1)}</span>
                                </div>
                                <div className="flex justify-between gap-2 border-b border-slate-200/50 py-1.5 text-sm dark:border-slate-800/50">
                                    <span className="text-slate-500">无回答率</span>
                                    <span className="font-mono text-slate-800 dark:text-slate-200 tabular-nums">{Math.round(nonResponseRate * 100)}%</span>
                                </div>
                            </div>
                            <div className="mt-2 grid grid-cols-2 gap-3 rounded-lg border border-slate-200 bg-white/50 px-3 py-2 dark:border-slate-800 dark:bg-slate-950/50">
                                <div>
                                    <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">建议样本量</p>
                                    <p className="text-base font-bold font-mono tabular-nums text-teal-600 dark:text-teal-400">{recommendedSize}</p>
                                </div>
                                <div className="text-right">
                                    <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">最终设定</p>
                                    <p className="text-lg font-bold font-mono tabular-nums text-indigo-500">{finalSampleSize}</p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                <div className="space-y-6">
                    <SamplePlanningStudyGuide />
                    <SamplePlanningAdvancedFeatures
                        activeAdvancedTab={activeAdvancedTab}
                        onAdvancedTabChange={setActiveAdvancedTab}
                    />
                </div>
            </div>

            {/* 高级功能 Modal */}
            <Dialog open={activeAdvancedTab !== null} onOpenChange={(open) => { if (!open) setActiveAdvancedTab(null); }}>
                <DialogContent
                    className={`bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 ${
                        activeAdvancedTab === "metrics"
                            ? "w-[calc(100vw-1.5rem)] max-w-[calc(100vw-1.5rem)] sm:max-w-[min(90rem,96vw)]"
                            : "sm:max-w-3xl"
                    } max-h-[85vh] overflow-y-auto`}
                >
                    {activeAdvancedTab && (() => {
                        const config = ADVANCED_TAB_CONFIG.find(c => c.key === activeAdvancedTab);
                        return (
                            <DialogHeader className="border-b border-slate-200 dark:border-slate-800 pb-4 mb-1 space-y-2">
                                <DialogTitle className="text-xl font-semibold tracking-tight text-slate-900 dark:text-slate-50 pr-8">
                                    {config?.title}
                                </DialogTitle>
                                <DialogDescription className="text-slate-600 dark:text-slate-300 text-sm leading-relaxed">
                                    {config?.description}
                                </DialogDescription>
                            </DialogHeader>
                        );
                    })()}

                    {activeAdvancedTab === 'domain' && (
                        <DomainEstimationManager
                            totalPopulationSize={N}
                            stratifiedFields={[]}
                            onDomainsChange={(newDomains) => {
                                setDomains(newDomains);
                            }}
                            initialDomains={domains}
                        />
                    )}

                    {activeAdvancedTab === 'cost' && (
                        <PrecisionCostTradeoff
                            populationSize={N}
                            confidenceLevel={confidenceLevel}
                            designEffect={designEffect}
                            nonResponseRate={nonResponseRate}
                            onApplyBudget={(_budget, sampleSize) => {
                                setFinalSampleSize(sampleSize);
                            }}
                        />
                    )}

                    {activeAdvancedTab === 'deff' && (
                        <DesignEffectEstimator
                            currentDeff={designEffect}
                            onDeffChange={(newDeff) => setDesignEffect(newDeff)}
                        />
                    )}

                    {activeAdvancedTab === 'multivar' && (
                        <MultiVariableSamplePlan
                            populationSize={N}
                            onVariablesChange={setSurveyVariables}
                            onRecommendedSampleSizeChange={() => {}}
                            initialVariables={surveyVariables}
                        />
                    )}

                    {activeAdvancedTab === 'cv' && (
                        <CVBasedSampleSizeCalculator
                            populationSize={N}
                            confidenceLevel={confidenceLevel}
                            onApplySampleSize={(size) => {
                                setFinalSampleSize(size);
                                toast.success(`已应用基于CV计算的样本量: ${size}`);
                            }}
                        />
                    )}

                    {activeAdvancedTab === 'cluster' && (
                        <ClusterSamplingCalculator
                            populationSize={N}
                            confidenceLevel={confidenceLevel}
                            marginOfError={marginOfError[0] ?? 5}
                            onApplyResult={(clusters, sampleSize) => {
                                setFinalSampleSize(sampleSize);
                                toast.success(`整群抽样方案: ${clusters}个群, 共${sampleSize}个样本`);
                            }}
                        />
                    )}

                    {activeAdvancedTab === 'metrics' && metrics && (
                        <div className="grid min-w-0 grid-cols-1 gap-5 lg:grid-cols-3 lg:gap-6 xl:gap-8">
                            <EnhancedMetricsCard metrics={metrics} confidenceLevel={confidenceLevel} finalSampleSize={finalSampleSize} />
                            <PValueComparisonCard
                                comparison={pComparison}
                                currentSampleSize={recommendedSize}
                            />
                            {sensitivityMatrix && (
                                <SensitivityAnalysisCard
                                    matrix={sensitivityMatrix}
                                    currentConfidenceLevel={confidenceLevel}
                                    currentMarginOfError={marginOfError[0] ?? 5}
                                />
                            )}
                        </div>
                    )}
                </DialogContent>
            </Dialog>

            <div className="flex justify-between pt-6 border-t border-slate-200/50 dark:border-slate-800/50">
                <Button variant="outline" onClick={onPrev} data-testid="student-sample-plan-prev" className="border-slate-300 dark:border-slate-700 bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-700 hover:text-slate-900 dark:hover:text-slate-100">
                    上一阶段
                </Button>
                <div className="flex gap-3">
                    <Button onClick={() => setConfirmNextOpen(true)} disabled={!isValidSize} data-testid="student-sample-plan-next" className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg shadow-indigo-500/20">
                        确认并进入下一阶段
                    </Button>
                </div>
            </div>

            {/* Confirm Next Stage Dialog */}
            <AlertDialog open={confirmNextOpen} onOpenChange={setConfirmNextOpen}>
                <AlertDialogContent className="bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200" data-testid="student-sample-plan-confirm-dialog">
                    <AlertDialogHeader>
                        <AlertDialogTitle className="text-slate-900 dark:text-slate-100">确认样本量规划</AlertDialogTitle>
                        <AlertDialogDescription className="text-slate-600 dark:text-slate-400 text-base">
                            您设定的最终样本量为 <strong className="text-emerald-600 text-lg">{finalSampleSize}</strong>。
                            <br /><br />
                            确认后将进入抽样执行阶段。如需修改，您需要返回本阶段，届时后续阶段（抽样执行、分析报告）的数据将被<strong className="text-rose-600">清空</strong>。
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel className="bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100">取消</AlertDialogCancel>
                        <AlertDialogAction onClick={handleConfirmNext} data-testid="student-sample-plan-confirm" className="bg-indigo-600 hover:bg-indigo-700 text-white">确认</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {showLaunch && (
                <ImmersiveExperimentLaunch
                    populationSize={N}
                    sampleSize={finalSampleSize}
                    confidenceLevel={confidenceLevel}
                    marginOfError={marginOfError[0] ?? 5}
                    onComplete={() => setShowLaunch(false)}
                    onClose={() => setShowLaunch(false)}
                />
            )}
        </div>
    );
}

export default SamplePlanning;
