import { useState, useMemo, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from "@/components/ui/dialog";
import { ChevronRight, RotateCcw, Info, Wrench } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
    calculateSampleSizeMetrics,
    calculateSampleSizeSensitivity,
    calculateSampleSizeForDifferentP,
} from "../../../experiment/sample-plan";
import {
    type SampleParams,
    getFinalSampleSizeBounds,
    isSmallPopulationSampleBounds,
} from "../types";
import {
    ADVANCED_TAB_CONFIG,
    type AdvancedTab,
    type AdvancedNonStandardSampleLockSource,
} from "../../../components/sample-planning/advancedTabs";
import { DomainEstimationManager, type Domain } from "../../../components/DomainEstimationManager";
import { PrecisionCostTradeoff } from "../../../components/PrecisionCostTradeoff";
import { DesignEffectEstimator } from "../../../components/DesignEffectEstimator";
import { MultiVariableSamplePlan, type SurveyVariable } from "../../../components/MultiVariableSamplePlan";
import { CVBasedSampleSizeCalculator } from "../../../components/CVBasedSampleSizeCalculator";
import { ClusterSamplingCalculator } from "../../../components/ClusterSamplingCalculator";
import { EnhancedMetricsCard } from "../../../components/EnhancedMetricsCard";
import { PValueComparisonCard } from "../../../components/PValueComparisonCard";
import { SensitivityAnalysisCard } from "../../../components/SensitivityAnalysisCard";

/** 成本/CV/整群等非标准路径：仅写最终 n；工具内参数不写入左侧，解释 n 时以本工具为准 */
const TOAST_APPLY_SAMPLE_SIZE_ONLY_DESC =
    "仅将最终样本量按工具结果更新。本工具内试算参数未写回左侧；若与左侧不一致，解释此 n 时以本工具推演为准，勿用左侧显示参数代回标准公式验算。";

/** 多变量表为会话内状态（P0），不入持久化 samplePlan */
const TOAST_APPLY_MULTIVAR_DESC =
    "变量调查表仅保存在当前会话。持久化含当时决策面板参数与最终样本量；若与多变量推荐不一致，解释最终样本量时以本工具推演为准。";

interface Props {
    params: SampleParams;
    onConfidenceLevelChange: (v: string) => void;
    onMarginOfErrorChange: (v: number) => void;
    onDesignEffectChange: (v: number) => void;
    onNonResponseRateChange: (v: number) => void;
    onFinalSizeChange: (v: number) => void;
    onResetFinalSize: () => void;
    onNext: () => void;
    /** 子总体等：由父级持有以便阶段间保留；不进入 SamplePlanData / 后端同步（P0）。 */
    domains?: Domain[];
    onDomainsChange?: (d: Domain[]) => void;
    /** 多变量调查变量列表：同上，仅前端会话内使用（P0）。 */
    surveyVariables?: SurveyVariable[];
    onSurveyVariablesChange?: (v: SurveyVariable[]) => void;
    /** 样本量来自非标准公式时，记录来源（仅 cost / multivar / cv / cluster） */
    advancedPlanLock: AdvancedNonStandardSampleLockSource | null;
    /** 在首次写入「非标准样本量」前调用：父级保存基线快照 */
    onBeforeAdvancedCommit: () => void;
    onAdvancedCommitted: (source: AdvancedNonStandardSampleLockSource) => void;
    onCancelAdvancedLock: () => void;
}

export function DecisionPhase({
    params,
    onConfidenceLevelChange,
    onMarginOfErrorChange,
    onDesignEffectChange,
    onNonResponseRateChange,
    onFinalSizeChange,
    onResetFinalSize,
    onNext,
    domains: externalDomains,
    onDomainsChange: externalOnDomainsChange,
    surveyVariables: externalSurveyVariables,
    onSurveyVariablesChange: externalOnSurveyVariablesChange,
    advancedPlanLock,
    onBeforeAdvancedCommit,
    onAdvancedCommitted,
    onCancelAdvancedLock,
}: Props) {
    const { populationSize: N, recommendedSize, finalSampleSize } = params;
    const { min: minSize, max: maxSize } = useMemo(() => getFinalSampleSizeBounds(N), [N]);
    const isValidSize = finalSampleSize >= minSize && finalSampleSize <= maxSize;
    const showSmallPopulationHint = isSmallPopulationSampleBounds(N);

    const paramsLocked = advancedPlanLock != null;
    const lockLabel =
        advancedPlanLock != null
            ? (ADVANCED_TAB_CONFIG.find((c) => c.key === advancedPlanLock)?.label ?? "")
            : "";

    // --- Advanced tools ---
    const [activeAdvancedTab, setActiveAdvancedTab] = useState<AdvancedTab | null>(null);

    // Local fallback state when parent doesn't manage these
    const [localDomains, setLocalDomains] = useState<Domain[]>([]);
    const [localSurveyVariables, setLocalSurveyVariables] = useState<SurveyVariable[]>([]);

    const domains = externalDomains ?? localDomains;
    const onDomainsChange = externalOnDomainsChange ?? setLocalDomains;
    const surveyVariables = externalSurveyVariables ?? localSurveyVariables;
    const onSurveyVariablesChange = externalOnSurveyVariablesChange ?? setLocalSurveyVariables;

    // --- Metrics ---
    const metrics = useMemo(
        () =>
            calculateSampleSizeMetrics({
                confidenceLevel: params.confidenceLevel,
                marginOfError: params.marginOfError,
                populationSize: N,
                designEffect: params.designEffect,
                nonResponseRate: params.nonResponseRate,
            }),
        [params.confidenceLevel, params.marginOfError, N, params.designEffect, params.nonResponseRate],
    );

    const sensitivity = useMemo(
        () =>
            calculateSampleSizeSensitivity({
                populationSize: N,
                designEffect: params.designEffect,
                nonResponseRate: params.nonResponseRate,
            }),
        [N, params.designEffect, params.nonResponseRate],
    );

    const pComparison = useMemo(
        () =>
            calculateSampleSizeForDifferentP({
                confidenceLevel: params.confidenceLevel,
                marginOfError: params.marginOfError,
                populationSize: N,
                designEffect: params.designEffect,
                nonResponseRate: params.nonResponseRate,
            }),
        [params.confidenceLevel, params.marginOfError, N, params.designEffect, params.nonResponseRate],
    );

    /** 高级工具弹层：仅在点击「应用」后写回父级状态，并关闭弹层 */
    const closeAdvancedDialog = useCallback(() => {
        setActiveAdvancedTab(null);
    }, []);

    /** 非标准样本量提交：保证先打基线快照，再写状态，再标记锁定（P2） */
    const commitNonStandardLock = useCallback(
        (source: AdvancedNonStandardSampleLockSource, apply: () => void) => {
            onBeforeAdvancedCommit();
            apply();
            onAdvancedCommitted(source);
        },
        [onBeforeAdvancedCommit, onAdvancedCommitted],
    );

    const isSecondaryToolBlockedWhileLocked = useCallback(
        (key: AdvancedTab) =>
            paramsLocked && (key === "domain" || key === "deff"),
        [paramsLocked],
    );

    const [domainDraft, setDomainDraft] = useState<Domain[]>([]);
    const [domainDraftKey, setDomainDraftKey] = useState(0);
    const [multivarDraft, setMultivarDraft] = useState<SurveyVariable[]>([]);
    const [multivarKey, setMultivarKey] = useState(0);
    const [deffDraft, setDeffDraft] = useState(params.designEffect);

    useEffect(() => {
        if (activeAdvancedTab !== "domain") return;
        setDomainDraft(domains.length ? domains.map((d) => ({ ...d })) : []);
        setDomainDraftKey((k) => k + 1);
    }, [activeAdvancedTab, domains]);

    useEffect(() => {
        if (activeAdvancedTab !== "multivar") return;
        setMultivarDraft(surveyVariables.length ? [...surveyVariables] : []);
        setMultivarKey((k) => k + 1);
    }, [activeAdvancedTab, surveyVariables]);

    useEffect(() => {
        if (activeAdvancedTab === "deff") {
            setDeffDraft(params.designEffect);
        }
    }, [activeAdvancedTab, params.designEffect]);

    return (
        <div className="space-y-6">
            <div className="text-center space-y-2">
                <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-100 dark:bg-indigo-950/50 text-xs font-medium text-indigo-700 dark:text-indigo-300">
                    决策面板
                </span>
                <h2 className="text-2xl font-bold text-gray-900 dark:text-slate-100">确认你的样本量</h2>
            </div>

            {paramsLocked && (
                <div className="rounded-xl border border-amber-200/90 bg-amber-50/95 dark:border-amber-800/60 dark:bg-amber-950/35 px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div className="flex items-start gap-2 text-sm text-amber-950 dark:text-amber-100">
                        <Info className="w-4 h-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
                        <span>
                            当前最终样本量由非标准公式工具「<span className="font-semibold">{lockLabel}</span>」确定；解释此样本量请以该工具内推演为准，勿用左侧快照参数代回标准公式验算。左侧参数与建议样本量已锁定展示，最终样本量不可在输入框中直接修改，请先「取消应用」后再调整。
                        </span>
                    </div>
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={onCancelAdvancedLock}
                        className="shrink-0 border-amber-300 bg-white text-amber-900 hover:bg-amber-100 dark:border-amber-700 dark:bg-slate-900 dark:text-amber-100 dark:hover:bg-amber-950/80"
                    >
                        取消应用，恢复常规规划
                    </Button>
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Left: Parameter controls */}
                <div
                    className={cn(
                        "rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-5 shadow-sm transition-colors",
                        paramsLocked && "opacity-55 grayscale-[0.35] pointer-events-none select-none",
                    )}
                    aria-disabled={paramsLocked}
                >
                    <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">参数控制</h3>

                    <div className="space-y-1.5">
                        <Label className="text-xs text-slate-500">置信水平</Label>
                        <Select
                            value={params.confidenceLevel}
                            onValueChange={onConfidenceLevelChange}
                            disabled={paramsLocked}
                        >
                            <SelectTrigger className="h-9 text-sm bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 disabled:opacity-60">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="90">90% (Z=1.645)</SelectItem>
                                <SelectItem value="95">95% (Z=1.96)</SelectItem>
                                <SelectItem value="99">99% (Z=2.576)</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-1.5">
                        <div className="flex justify-between">
                            <Label className="text-xs text-slate-500">允许误差</Label>
                            <span className="text-xs font-bold text-teal-600 dark:text-teal-400 tabular-nums">&plusmn;{params.marginOfError}%</span>
                        </div>
                        <Slider
                            value={[params.marginOfError]}
                            onValueChange={([v]) => v != null && onMarginOfErrorChange(v)}
                            min={1} max={10} step={1}
                            disabled={paramsLocked}
                            className="py-1 [&>.relative>.absolute]:bg-teal-500"
                        />
                    </div>

                    <div className="space-y-1.5">
                        <div className="flex justify-between">
                            <Label className="text-xs text-slate-500">设计效应</Label>
                            <span className="text-xs font-bold text-amber-600 dark:text-amber-400 tabular-nums">{params.designEffect.toFixed(1)}</span>
                        </div>
                        <Slider
                            value={[params.designEffect * 10]}
                            onValueChange={([v]) => v != null && onDesignEffectChange(Math.round(v) / 10)}
                            min={10} max={50} step={1}
                            disabled={paramsLocked}
                            className="py-1 [&>.relative>.absolute]:bg-amber-500"
                        />
                    </div>

                    <div className="space-y-1.5">
                        <div className="flex justify-between">
                            <Label className="text-xs text-slate-500">无回答率</Label>
                            <span className="text-xs font-bold text-rose-600 dark:text-rose-400 tabular-nums">{Math.round(params.nonResponseRate * 100)}%</span>
                        </div>
                        <Slider
                            value={[Math.round(params.nonResponseRate * 100)]}
                            onValueChange={([v]) => v != null && onNonResponseRateChange(v / 100)}
                            min={0} max={50} step={5}
                            disabled={paramsLocked}
                            className="py-1 [&>.relative>.absolute]:bg-rose-500"
                        />
                    </div>
                </div>

                {/* Right: Metrics gauge — 锁定与非标准 n 一致置灰 */}
                <div
                    className={cn(
                        "rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm flex flex-col items-center justify-center space-y-4 transition-colors",
                        paramsLocked && "opacity-55 grayscale-[0.35] pointer-events-none select-none",
                    )}
                    aria-disabled={paramsLocked}
                >
                    <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">建议样本量</h3>
                    <div className="text-5xl font-black tabular-nums text-indigo-500">
                        {recommendedSize.toLocaleString()}
                    </div>
                    <div className="grid grid-cols-3 gap-3 w-full text-center">
                        <MetricBadge label="SE" value={metrics?.standardError.toFixed(4) ?? "–"} />
                        <MetricBadge label="CV" value={metrics ? `${(metrics.relativeStandardError * 100).toFixed(1)}%` : "–"} />
                        <MetricBadge
                            label="CI"
                            value={
                                metrics
                                    ? `[${metrics.confidenceInterval.lower.toFixed(2)}, ${metrics.confidenceInterval.upper.toFixed(2)}]`
                                    : "–"
                            }
                        />
                    </div>
                </div>
            </div>

            {/* Sensitivity heatmap */}
            {sensitivity && (
                <div
                    className={cn(
                        "rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm space-y-3 transition-opacity",
                        paramsLocked && "opacity-45 pointer-events-none",
                    )}
                >
                    <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">权衡探索器</h3>
                    <p className="text-xs text-slate-400">不同置信水平与允许误差组合下的样本量</p>
                    <SensitivityGrid
                        data={sensitivity}
                        currentCL={params.confidenceLevel}
                        currentME={params.marginOfError}
                    />
                </div>
            )}

            {/* Advanced tools */}
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm space-y-3">
                <div className="flex items-center gap-2">
                    <Wrench className="w-4 h-4 text-slate-400" />
                    <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">高级工具</h3>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {ADVANCED_TAB_CONFIG.map(({ key, label }) => {
                        const isActiveLock = advancedPlanLock === key;
                        const dimOthers =
                            advancedPlanLock != null && key !== advancedPlanLock && key !== "metrics";
                        const secondaryBlocked = isSecondaryToolBlockedWhileLocked(key);
                        return (
                            <button
                                key={key}
                                type="button"
                                disabled={secondaryBlocked}
                                title={
                                    secondaryBlocked
                                        ? "请先取消「非标准公式样本量」应用后，再调整子总体或设计效应"
                                        : undefined
                                }
                                onClick={() => {
                                    if (secondaryBlocked) return;
                                    setActiveAdvancedTab(key);
                                }}
                                className={cn(
                                    "rounded-lg border px-2.5 py-2 text-xs font-medium transition-colors",
                                    secondaryBlocked && "opacity-45 cursor-not-allowed",
                                    isActiveLock
                                        ? "ring-2 ring-indigo-500 border-indigo-400 bg-indigo-50 text-indigo-800 dark:ring-indigo-400 dark:border-indigo-500 dark:bg-indigo-950/55 dark:text-indigo-200 shadow-sm"
                                        : cn(
                                            "border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-indigo-50 hover:border-indigo-300 hover:text-indigo-700 dark:hover:bg-indigo-950/40 dark:hover:border-indigo-600 dark:hover:text-indigo-300",
                                            dimOthers && "opacity-45",
                                        ),
                                )}
                            >
                                {label}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Advanced tool Dialog */}
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

                    {activeAdvancedTab === "domain" && (
                        <>
                            <DomainEstimationManager
                                key={domainDraftKey}
                                totalPopulationSize={N}
                                stratifiedFields={[]}
                                onDomainsChange={setDomainDraft}
                                initialDomains={domainDraft}
                            />
                            <div className="flex justify-end gap-2 pt-4 border-t border-slate-200 dark:border-slate-800">
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={closeAdvancedDialog}
                                    className="border-slate-300 dark:border-slate-700"
                                >
                                    取消
                                </Button>
                                <Button
                                    type="button"
                                    disabled={paramsLocked}
                                    title={
                                        paramsLocked
                                            ? "请先取消「非标准公式样本量」应用后再调整子总体"
                                            : undefined
                                    }
                                    onClick={() => {
                                        onDomainsChange(domainDraft);
                                        toast.success("已应用子总体设置");
                                        closeAdvancedDialog();
                                    }}
                                    className="bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-50"
                                >
                                    应用到样本量规划
                                </Button>
                            </div>
                        </>
                    )}

                    {activeAdvancedTab === "cost" && (
                        <PrecisionCostTradeoff
                            populationSize={N}
                            confidenceLevel={params.confidenceLevel}
                            designEffect={params.designEffect}
                            nonResponseRate={params.nonResponseRate}
                            initialMarginOfError={params.marginOfError}
                            onApplyBudget={(_budget, sampleSize) => {
                                commitNonStandardLock("cost", () => {
                                    onFinalSizeChange(sampleSize);
                                });
                                toast.success(`已应用样本量 ${sampleSize}`, {
                                    description: TOAST_APPLY_SAMPLE_SIZE_ONLY_DESC,
                                });
                                closeAdvancedDialog();
                            }}
                        />
                    )}

                    {activeAdvancedTab === "deff" && (
                        <>
                            <DesignEffectEstimator
                                currentDeff={deffDraft}
                                onDeffChange={setDeffDraft}
                            />
                            <div className="flex justify-end gap-2 pt-4 border-t border-slate-200 dark:border-slate-800">
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={closeAdvancedDialog}
                                    className="border-slate-300 dark:border-slate-700"
                                >
                                    取消
                                </Button>
                                <Button
                                    type="button"
                                    disabled={paramsLocked}
                                    title={
                                        paramsLocked
                                            ? "请先取消「非标准公式样本量」应用后再调整设计效应"
                                            : undefined
                                    }
                                    onClick={() => {
                                        onDesignEffectChange(deffDraft);
                                        toast.success(`已应用设计效应 deff = ${deffDraft.toFixed(1)}`);
                                        closeAdvancedDialog();
                                    }}
                                    className="bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-50"
                                >
                                    应用到样本量规划
                                </Button>
                            </div>
                        </>
                    )}

                    {activeAdvancedTab === "multivar" && (
                        <MultiVariableSamplePlan
                            key={multivarKey}
                            populationSize={N}
                            defaultConfidenceLevel={params.confidenceLevel}
                            defaultMarginOfError={params.marginOfError}
                            onVariablesChange={setMultivarDraft}
                            initialVariables={multivarDraft}
                            onApplyToPlan={({ variables, recommendedSampleSize }) => {
                                const locksPanel =
                                    variables.length > 0 && recommendedSampleSize > 0;
                                if (locksPanel) {
                                    commitNonStandardLock("multivar", () => {
                                        onSurveyVariablesChange(variables);
                                        if (recommendedSampleSize > 0) {
                                            onFinalSizeChange(recommendedSampleSize);
                                        }
                                    });
                                } else {
                                    onSurveyVariablesChange(variables);
                                    if (recommendedSampleSize > 0) {
                                        onFinalSizeChange(recommendedSampleSize);
                                    }
                                }
                                toast.success("已应用多变量规划", {
                                    description: TOAST_APPLY_MULTIVAR_DESC,
                                });
                                closeAdvancedDialog();
                            }}
                        />
                    )}

                    {activeAdvancedTab === "cv" && (
                        <CVBasedSampleSizeCalculator
                            populationSize={N}
                            confidenceLevel={params.confidenceLevel}
                            initialDesignEffect={params.designEffect}
                            initialNonResponseRate={params.nonResponseRate}
                            onApplySampleSize={(size) => {
                                commitNonStandardLock("cv", () => {
                                    onFinalSizeChange(size);
                                });
                                toast.success(`已应用样本量 ${size}`, {
                                    description: TOAST_APPLY_SAMPLE_SIZE_ONLY_DESC,
                                });
                                closeAdvancedDialog();
                            }}
                        />
                    )}

                    {activeAdvancedTab === "cluster" && (
                        <ClusterSamplingCalculator
                            populationSize={N}
                            confidenceLevel={params.confidenceLevel}
                            marginOfError={params.marginOfError}
                            initialNonResponseRate={params.nonResponseRate}
                            onApplyResult={(clusters, sampleSize) => {
                                commitNonStandardLock("cluster", () => {
                                    onFinalSizeChange(sampleSize);
                                });
                                toast.success(`整群方案：${clusters} 个群，共 ${sampleSize} 人`, {
                                    description: TOAST_APPLY_SAMPLE_SIZE_ONLY_DESC,
                                });
                                closeAdvancedDialog();
                            }}
                        />
                    )}

                    {activeAdvancedTab === "metrics" && metrics && (
                        <>
                            <div className="grid min-w-0 grid-cols-1 gap-5 lg:grid-cols-3 lg:gap-6">
                                <EnhancedMetricsCard
                                    metrics={metrics}
                                    confidenceLevel={params.confidenceLevel}
                                    finalSampleSize={finalSampleSize}
                                />
                                <PValueComparisonCard
                                    comparison={pComparison}
                                    currentSampleSize={recommendedSize}
                                />
                                {sensitivity && (
                                    <SensitivityAnalysisCard
                                        matrix={sensitivity}
                                        currentConfidenceLevel={params.confidenceLevel}
                                        currentMarginOfError={params.marginOfError}
                                    />
                                )}
                            </div>
                            <div className="flex justify-end pt-4 border-t border-slate-200 dark:border-slate-800">
                                <Button
                                    type="button"
                                    onClick={closeAdvancedDialog}
                                    className="bg-indigo-600 hover:bg-indigo-700 text-white"
                                >
                                    完成
                                </Button>
                            </div>
                        </>
                    )}
                    {activeAdvancedTab === "metrics" && !metrics && (
                        <>
                            <p className="text-sm text-slate-500 py-4">
                                当前参数下无法计算指标（例如总体规模无效）。请先在决策面板中设定有效的置信水平与允许误差。
                            </p>
                            <div className="flex justify-end pt-4 border-t border-slate-200 dark:border-slate-800">
                                <Button
                                    type="button"
                                    onClick={closeAdvancedDialog}
                                    variant="outline"
                                    className="border-slate-300 dark:border-slate-700"
                                >
                                    关闭
                                </Button>
                            </div>
                        </>
                    )}
                </DialogContent>
            </Dialog>

            {/* Final sample size — 锁定时保持正常对比度，仅只读且隐藏建议值/重置 */}
            <div
                className={cn(
                    "rounded-2xl border p-5 shadow-sm space-y-3 transition-colors",
                    isValidSize
                        ? "border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900"
                        : "border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/30",
                )}
            >
                <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">最终样本量</h3>
                {showSmallPopulationHint && !paramsLocked && (
                    <p className="text-xs text-amber-700/95 dark:text-amber-300/90 leading-relaxed">
                        总体规模较小时，合法区间会随上限 ⌊N/2⌋ 收紧（下限与上限对齐，避免出现无法选取的区间）。
                    </p>
                )}
                <div className={cn("flex gap-3", paramsLocked ? "items-stretch" : "items-end")}>
                    <div className="flex-1 space-y-1">
                        <div className="flex justify-between text-xs">
                            <span className="text-slate-500">设定样本量</span>
                            {!paramsLocked && (
                                <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                                    建议值 {recommendedSize.toLocaleString()}
                                </span>
                            )}
                        </div>
                        <div className="relative">
                            <Input
                                type="number"
                                value={finalSampleSize}
                                readOnly={paramsLocked}
                                aria-readonly={paramsLocked || undefined}
                                onChange={(e) => onFinalSizeChange(parseInt(e.target.value, 10) || 0)}
                                min={minSize}
                                max={maxSize}
                                data-testid="immersive-sp-final-size"
                                className={cn(
                                    "pr-12 text-lg font-bold bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700",
                                    isValidSize ? "text-indigo-600 dark:text-indigo-400" : "text-rose-500",
                                    paramsLocked && "cursor-not-allowed opacity-100",
                                )}
                            />
                            <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 text-sm">人</span>
                        </div>
                    </div>
                    {!paramsLocked && (
                        <Button
                            type="button"
                            variant="outline"
                            onClick={onResetFinalSize}
                            className="border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-400 shrink-0"
                        >
                            <RotateCcw className="w-4 h-4 mr-1" />
                            重置
                        </Button>
                    )}
                </div>
                {!isValidSize && (
                    <div className="flex items-center gap-2 text-sm text-rose-600 dark:text-rose-400">
                        <Info className="w-4 h-4 shrink-0" />
                        样本量需在 {minSize} – {maxSize.toLocaleString()} 之间
                    </div>
                )}
            </div>

            <div className="flex justify-center pt-2">
                <Button
                    type="button"
                    onClick={onNext}
                    disabled={!isValidSize}
                    data-testid="immersive-sp-decision-next"
                    className="bg-indigo-600 hover:bg-indigo-700 text-white px-8 py-5 rounded-xl shadow-lg shadow-indigo-500/20 disabled:opacity-40"
                >
                    进入理解自检
                    <ChevronRight className="w-5 h-5 ml-2" />
                </Button>
            </div>
        </div>
    );
}

// --- Sub-components ---

function MetricBadge({ label, value }: { label: string; value: string }) {
    return (
        <div className="rounded-lg bg-slate-50 dark:bg-slate-800 px-2 py-2">
            <p className="text-[10px] font-medium uppercase tracking-wider text-slate-400">{label}</p>
            <p className="text-xs font-bold tabular-nums text-slate-700 dark:text-slate-200 mt-0.5">{value}</p>
        </div>
    );
}

function SensitivityGrid({
    data,
    currentCL,
    currentME,
}: {
    data: Array<{ confidenceLabel: string; confidenceLevel: string; marginOfError: number; sampleSize: number }>;
    currentCL: string;
    currentME: number;
}) {
    // Build a grid: rows = confidence levels, cols = margins of error
    const clLabels = [...new Set(data.map((d) => d.confidenceLevel))];
    const meValues = [...new Set(data.map((d) => d.marginOfError))].sort((a, b) => a - b);
    const maxSample = Math.max(...data.map((d) => d.sampleSize));

    const lookup = new Map(data.map((d) => [`${d.confidenceLevel}-${d.marginOfError}`, d.sampleSize]));

    return (
        <div className="overflow-x-auto">
            <table className="w-full text-xs">
                <thead>
                    <tr>
                        <th className="text-left text-slate-400 font-normal pb-2 pr-2">置信↓ / 误差→</th>
                        {meValues.map((me) => (
                            <th
                                key={me}
                                className={`text-center font-normal pb-2 px-1 tabular-nums ${
                                    me === currentME ? "text-teal-600 dark:text-teal-400 font-bold" : "text-slate-400"
                                }`}
                            >
                                &plusmn;{me}%
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {clLabels.map((cl) => {
                        const clDisplay = data.find((d) => d.confidenceLevel === cl)?.confidenceLabel ?? cl;
                        return (
                            <tr key={cl}>
                                <td className={`pr-2 py-1 whitespace-nowrap ${
                                    cl === currentCL ? "text-indigo-600 dark:text-indigo-400 font-bold" : "text-slate-500"
                                }`}>
                                    {clDisplay}
                                </td>
                                {meValues.map((me) => {
                                    const n = lookup.get(`${cl}-${me}`) ?? 0;
                                    const isCurrent = cl === currentCL && me === currentME;
                                    const intensity = Math.round((n / maxSample) * 100);
                                    return (
                                        <td key={me} className="px-1 py-1">
                                            <div
                                                className={`rounded px-1.5 py-1 text-center tabular-nums transition-colors ${
                                                    isCurrent
                                                        ? "bg-indigo-500 text-white font-bold ring-2 ring-indigo-400 ring-offset-1 dark:ring-offset-slate-900"
                                                        : `text-slate-600 dark:text-slate-300`
                                                }`}
                                                style={
                                                    !isCurrent
                                                        ? { backgroundColor: `rgba(99, 102, 241, ${intensity / 400})` }
                                                        : undefined
                                                }
                                            >
                                                {n.toLocaleString()}
                                            </div>
                                        </td>
                                    );
                                })}
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}
