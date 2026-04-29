import { useState, useMemo, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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
    calculateMeanSampleSizeMetrics,
    calculateSampleSizeMetrics,
    calculateSampleSizeSensitivity,
    calculateSampleSizeForDifferentP,
} from "../../../experiment/sample-plan";
import {
    formatMarginOfError,
    getMarginOfErrorLabel,
} from "../../../experiment/sample-plan-display";
import {
    type SampleParams,
    getFinalSampleSizeBounds,
} from "../types";
import {
    ADVANCED_TAB_CONFIG,
    type AdvancedTab,
    type AdvancedNonStandardSampleSource,
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

/** 成本/CV/整群等非标准路径：仅写最终 n；左侧常规建议继续显示，但解释该 n 时以本工具为准 */
const TOAST_APPLY_SAMPLE_SIZE_ONLY_DESC =
    "已将最终样本量更新为工具结果。左侧仍显示常规公式建议；若继续调整参数或最终样本量，将自动切回常规规划。";

/** 多变量表为会话内状态（P0），不入持久化 samplePlan */
const TOAST_APPLY_MULTIVAR_DESC =
    "变量调查表仅保存在当前会话。已将最终样本量更新为多变量推荐；若继续调整参数或最终样本量，将自动切回常规规划。";

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
    advancedPlanSource: AdvancedNonStandardSampleSource | null;
    onAdvancedApplied: (source: AdvancedNonStandardSampleSource) => void;
    onClearAdvancedSource: () => void;
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
    advancedPlanSource,
    onAdvancedApplied,
    onClearAdvancedSource,
}: Props) {
    const { populationSize: N, recommendedSize, finalSampleSize } = params;
    const isMeanEstimation = params.estimationType === "mean";
    const { min: minSize, max: maxSize } = useMemo(() => getFinalSampleSizeBounds(N), [N]);
    const isValidSize = finalSampleSize >= minSize && finalSampleSize <= maxSize;

    const hasAdvancedSource = advancedPlanSource != null;
    const sourceLabel =
        advancedPlanSource != null
            ? (ADVANCED_TAB_CONFIG.find((c) => c.key === advancedPlanSource)?.label ?? "")
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
    const proportionMetrics = useMemo(
        () =>
            isMeanEstimation
                ? null
                : calculateSampleSizeMetrics({
                    confidenceLevel: params.confidenceLevel,
                    marginOfError: params.marginOfError,
                    populationSize: N,
                    designEffect: params.designEffect,
                    nonResponseRate: params.nonResponseRate,
                }),
        [isMeanEstimation, params.confidenceLevel, params.marginOfError, N, params.designEffect, params.nonResponseRate],
    );

    const meanMetrics = useMemo(
        () =>
            !isMeanEstimation || params.populationVariance == null
                ? null
                : calculateMeanSampleSizeMetrics({
                    confidenceLevel: params.confidenceLevel,
                    marginOfError: params.marginOfError,
                    populationSize: N,
                    populationVariance: params.populationVariance,
                    designEffect: params.designEffect,
                    nonResponseRate: params.nonResponseRate,
                }),
        [
            isMeanEstimation,
            params.confidenceLevel,
            params.marginOfError,
            N,
            params.populationVariance,
            params.designEffect,
            params.nonResponseRate,
        ],
    );

    const metrics = isMeanEstimation ? meanMetrics : proportionMetrics;

    const sensitivity = useMemo(
        () =>
            isMeanEstimation
                ? null
                : calculateSampleSizeSensitivity({
                    populationSize: N,
                    designEffect: params.designEffect,
                    nonResponseRate: params.nonResponseRate,
                }),
        [isMeanEstimation, N, params.designEffect, params.nonResponseRate],
    );

    const pComparison = useMemo(
        () =>
            isMeanEstimation
                ? []
                : calculateSampleSizeForDifferentP({
                    confidenceLevel: params.confidenceLevel,
                    marginOfError: params.marginOfError,
                    populationSize: N,
                    designEffect: params.designEffect,
                    nonResponseRate: params.nonResponseRate,
                }),
        [isMeanEstimation, params.confidenceLevel, params.marginOfError, N, params.designEffect, params.nonResponseRate],
    );

    const currentMarginLabel = getMarginOfErrorLabel(params.estimationType);
    const currentMarginValue = formatMarginOfError(params.marginOfError, params.estimationType);
    const formattedMeanMetricMargin = formatMarginOfError(Number(metrics?.marginOfError.toFixed(4) ?? 0), "mean");

    const metricCards = useMemo(() => {
        if (!metrics) return [];
        if (isMeanEstimation) {
            return [
                { label: "SE", value: metrics.standardError.toFixed(4) },
                { label: "ME", value: formattedMeanMetricMargin },
                { label: "n₁", value: Math.ceil(metrics.n1).toLocaleString() },
            ];
        }
        return [
            { label: "SE", value: metrics.standardError.toFixed(4) },
            { label: "CV", value: `${(metrics.relativeStandardError * 100).toFixed(1)}%` },
            {
                label: "CI",
                value: `[${metrics.confidenceInterval.lower.toFixed(2)}, ${metrics.confidenceInterval.upper.toFixed(2)}]`,
            },
        ];
    }, [formattedMeanMetricMargin, isMeanEstimation, metrics]);

    /** 高级工具弹层：仅在点击「应用」后写回父级状态，并关闭弹层 */
    const closeAdvancedDialog = useCallback(() => {
        setActiveAdvancedTab(null);
    }, []);

    const applyAdvancedSource = useCallback(
        (source: AdvancedNonStandardSampleSource, apply: () => void) => {
            apply();
            onAdvancedApplied(source);
        },
        [onAdvancedApplied],
    );

    const isUnsupportedInMeanMode = useCallback(
        (key: AdvancedTab) =>
            isMeanEstimation && (key === "cost" || key === "cluster"),
        [isMeanEstimation],
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
        <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-2 text-center">
                <span className="inline-flex items-center gap-2 self-center rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                    决策面板
                </span>
                <h2 className="text-2xl font-bold text-foreground">确认会用于抽样执行的最终样本量</h2>
                <p className="mx-auto max-w-2xl text-sm text-muted-foreground">
                    这里确认的 n 会保存到实验，并直接带入下一阶段的抽样执行与后续分析报告。
                </p>
            </div>

            {hasAdvancedSource && (
                <div className="student-callout student-callout-warning flex flex-col gap-3 rounded-xl px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-start gap-2 text-sm text-foreground">
                        <Info className="mt-0.5 size-4 shrink-0 text-current" />
                        <span>
                            当前最终样本量正在使用高级工具「<span className="font-semibold">{sourceLabel}</span>」的结果；左侧继续显示常规公式建议值。若继续修改参数或最终样本量，将自动切回常规规划；解释当前 n 时请以该工具内推演为准。
                        </span>
                    </div>
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={onClearAdvancedSource}
                        className="shrink-0"
                    >
                        按常规继续
                    </Button>
                </div>
            )}

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {/* Left: Parameter controls */}
                <div className="flex flex-col gap-5 rounded-2xl border bg-card p-5 text-card-foreground shadow-sm transition-colors">
                    <h3 className="text-sm font-semibold text-foreground">常规公式参数</h3>

                    <div className="flex flex-col gap-1.5">
                        <Label className="text-xs text-muted-foreground">置信水平</Label>
                        <Select
                            value={params.confidenceLevel}
                            onValueChange={onConfidenceLevelChange}
                        >
                            <SelectTrigger size="sm">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectGroup>
                                    <SelectItem value="90">90% (Z=1.645)</SelectItem>
                                    <SelectItem value="95">95% (Z=1.96)</SelectItem>
                                    <SelectItem value="99">99% (Z=2.576)</SelectItem>
                                </SelectGroup>
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="flex flex-col gap-1.5">
                        <div className="flex justify-between">
                            <Label className="text-xs text-muted-foreground">{currentMarginLabel}</Label>
                            <span className="text-xs font-bold tabular-nums text-metric-me">
                                {currentMarginValue}
                            </span>
                        </div>
                        {isMeanEstimation ? (
                            <div className="flex flex-col gap-2">
                                <Input
                                    type="number"
                                    value={params.marginOfError}
                                    onChange={(e) => onMarginOfErrorChange(Number.parseFloat(e.target.value) || 0)}
                                    min={0.01}
                                    step={0.1}
                                    className="h-9"
                                />
                                <p className="text-[11px] text-muted-foreground">
                                    均值估计使用与指标同单位的绝对误差，不使用百分比滑块。
                                </p>
                            </div>
                        ) : (
                            <Slider
                                value={[params.marginOfError]}
                                onValueChange={([v]) => v != null && onMarginOfErrorChange(v)}
                                min={1} max={10} step={1}
                                className="py-1"
                            />
                        )}
                    </div>

                    <div className="flex flex-col gap-1.5">
                        <div className="flex justify-between">
                            <Label className="text-xs text-muted-foreground">设计效应</Label>
                            <span className="text-xs font-bold tabular-nums text-warning">{params.designEffect.toFixed(1)}</span>
                        </div>
                        <Slider
                            value={[params.designEffect * 10]}
                            onValueChange={([v]) => v != null && onDesignEffectChange(Math.round(v) / 10)}
                            min={10} max={50} step={1}
                            className="py-1"
                        />
                    </div>

                    <div className="flex flex-col gap-1.5">
                        <div className="flex justify-between">
                            <Label className="text-xs text-muted-foreground">无回答率</Label>
                            <span className="text-xs font-bold tabular-nums text-destructive">{Math.round(params.nonResponseRate * 100)}%</span>
                        </div>
                        <Slider
                            value={[Math.round(params.nonResponseRate * 100)]}
                            onValueChange={([v]) => v != null && onNonResponseRateChange(v / 100)}
                            min={0} max={50} step={5}
                            className="py-1"
                        />
                    </div>
                </div>

                {/* Right: Metrics gauge */}
                <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border bg-card p-5 text-card-foreground shadow-sm transition-colors">
                    <h3 className="text-sm font-semibold text-foreground">常规公式建议值</h3>
                    <div className="text-5xl font-black tabular-nums text-primary">
                        {recommendedSize.toLocaleString()}
                    </div>
                    <div className="grid w-full grid-cols-3 gap-3 text-center">
                        {metricCards.map((card) => (
                            <MetricBadge key={card.label} label={card.label} value={card.value} />
                        ))}
                    </div>
                    {hasAdvancedSource && (
                        <p className="text-center text-[11px] text-warning">
                            当前最终样本量来自「{sourceLabel}」，这里仍展示常规公式建议值。
                        </p>
                    )}
                </div>
            </div>

            {/* Sensitivity heatmap */}
            {sensitivity && (
                <div className="flex flex-col gap-3 rounded-2xl border bg-card p-5 text-card-foreground shadow-sm transition-opacity">
                    <h3 className="text-sm font-semibold text-foreground">常规公式权衡探索</h3>
                    <p className="text-xs text-muted-foreground">看看不同置信水平与允许误差组合下，样本量会如何变化。</p>
                    <SensitivityGrid
                        data={sensitivity}
                        currentCL={params.confidenceLevel}
                        currentME={params.marginOfError}
                    />
                </div>
            )}

            {/* Advanced tools */}
            <div className="flex flex-col gap-3 rounded-2xl border bg-card p-5 text-card-foreground shadow-sm">
                <div className="flex items-center gap-2">
                    <Wrench className="size-4 text-muted-foreground" />
                    <h3 className="text-sm font-semibold text-foreground">高级工具（特殊规划场景）</h3>
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {ADVANCED_TAB_CONFIG.map(({ key, label }) => {
                        const isActiveSource = advancedPlanSource === key;
                        const isDisabled =
                            isUnsupportedInMeanMode(key);
                        return (
                            <button
                                key={key}
                                type="button"
                                disabled={isDisabled}
                                title={
                                    isUnsupportedInMeanMode(key)
                                            ? "当前工具仅支持比例估计，请切换为比例估计后使用"
                                            : undefined
                                }
                                onClick={() => {
                                    if (isDisabled) return;
                                    setActiveAdvancedTab(key);
                                }}
                                className={cn(
                                    "rounded-lg border px-2.5 py-2 text-xs font-medium transition-colors",
                                    isDisabled && "opacity-45 cursor-not-allowed",
                                    isActiveSource
                                        ? "border-primary/40 bg-primary/10 text-primary shadow-sm ring-2 ring-primary/40"
                                        : "bg-muted/50 text-foreground hover:border-primary/30 hover:bg-primary/10 hover:text-primary",
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
                    className={cn(
                        "max-h-[85vh] overflow-y-auto",
                        activeAdvancedTab === "metrics"
                            ? "w-[calc(100vw-1.5rem)] max-w-[calc(100vw-1.5rem)] sm:max-w-[min(90rem,96vw)]"
                            : "sm:max-w-3xl",
                    )}
                >
                    {activeAdvancedTab && (() => {
                        const config = ADVANCED_TAB_CONFIG.find(c => c.key === activeAdvancedTab);
                        return (
                            <DialogHeader className="mb-1 border-b pb-4">
                                <DialogTitle className="pr-8 text-xl font-semibold tracking-tight text-foreground">
                                    {config?.title}
                                </DialogTitle>
                                <DialogDescription className="text-sm leading-relaxed text-muted-foreground">
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
                                estimationType={params.estimationType}
                                populationVariance={params.populationVariance}
                                defaultConfidenceLevel={params.confidenceLevel}
                                defaultMarginOfError={params.marginOfError}
                            />
                            <div className="flex justify-end gap-2 border-t pt-4">
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={closeAdvancedDialog}
                                >
                                    取消
                                </Button>
                                <Button
                                    type="button"
                                    onClick={() => {
                                        onDomainsChange(domainDraft);
                                        toast.success("已应用子总体设置");
                                        closeAdvancedDialog();
                                    }}
                                    className="disabled:opacity-50"
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
                                applyAdvancedSource("cost", () => {
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
                            <div className="flex justify-end gap-2 border-t pt-4">
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={closeAdvancedDialog}
                                >
                                    取消
                                </Button>
                                <Button
                                    type="button"
                                    onClick={() => {
                                        onDesignEffectChange(deffDraft);
                                        toast.success(`已应用设计效应 deff = ${deffDraft.toFixed(1)}`);
                                        closeAdvancedDialog();
                                    }}
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
                            defaultMarginOfError={params.estimationType === "proportion" ? params.marginOfError : 5}
                            defaultMeanRelativeMargin={5}
                            defaultVariableType={params.estimationType}
                            onVariablesChange={setMultivarDraft}
                            initialVariables={multivarDraft}
                            onApplyToPlan={({ variables, recommendedSampleSize }) => {
                                const hasRecommendation =
                                    variables.length > 0 && recommendedSampleSize > 0;
                                onSurveyVariablesChange(variables);
                                if (recommendedSampleSize > 0) {
                                    onFinalSizeChange(recommendedSampleSize);
                                }
                                if (hasRecommendation) onAdvancedApplied("multivar");
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
                            estimationType={params.estimationType}
                            initialDesignEffect={params.designEffect}
                            initialNonResponseRate={params.nonResponseRate}
                            onApplySampleSize={(size) => {
                                applyAdvancedSource("cv", () => {
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
                                applyAdvancedSource("cluster", () => {
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
                            <div className={cn("grid min-w-0 grid-cols-1 gap-5", !isMeanEstimation && "lg:grid-cols-3 lg:gap-6")}>
                                <EnhancedMetricsCard
                                    metrics={metrics}
                                    estimationType={params.estimationType}
                                    confidenceLevel={params.confidenceLevel}
                                    populationVariance={params.populationVariance}
                                    finalSampleSize={finalSampleSize}
                                />
                                {!isMeanEstimation && (
                                    <PValueComparisonCard
                                        comparison={pComparison}
                                        currentSampleSize={recommendedSize}
                                    />
                                )}
                                {!isMeanEstimation && sensitivity && (
                                    <SensitivityAnalysisCard
                                        matrix={sensitivity}
                                        currentConfidenceLevel={params.confidenceLevel}
                                        currentMarginOfError={params.marginOfError}
                                    />
                                )}
                            </div>
                            <div className="flex justify-end border-t pt-4">
                                <Button
                                    type="button"
                                    onClick={closeAdvancedDialog}
                                >
                                    完成
                                </Button>
                            </div>
                        </>
                    )}
                    {activeAdvancedTab === "metrics" && !metrics && (
                        <>
                            <p className="py-4 text-sm text-muted-foreground">
                                当前参数下无法计算指标（例如总体规模无效）。请先在决策面板中设定有效的置信水平与允许误差。
                            </p>
                            <div className="flex justify-end border-t pt-4">
                                <Button
                                    type="button"
                                    onClick={closeAdvancedDialog}
                                    variant="outline"
                                >
                                    关闭
                                </Button>
                            </div>
                        </>
                    )}
                </DialogContent>
            </Dialog>

            {/* Final sample size */}
            <div
                className={cn(
                    "flex flex-col gap-3 rounded-2xl border p-5 shadow-sm transition-colors",
                    isValidSize
                        ? "bg-card text-card-foreground"
                        : "border-destructive/30 bg-destructive/10",
                )}
            >
                <h3 className="text-sm font-semibold text-foreground">最终样本量（将带入抽样执行）</h3>
                <div className="flex items-end gap-3">
                    <div className="flex flex-1 flex-col gap-1">
                        <div className="flex justify-between text-xs">
                            <span className="text-muted-foreground">这里实际准备调查多少人</span>
                            <span className="font-medium text-success">
                                建议值 {recommendedSize.toLocaleString()}
                            </span>
                        </div>
                        <div className="relative">
                            <Input
                                type="number"
                                value={finalSampleSize}
                                onChange={(e) => {
                                    if (hasAdvancedSource) onClearAdvancedSource();
                                    onFinalSizeChange(parseInt(e.target.value, 10) || 0);
                                }}
                                min={minSize}
                                max={maxSize}
                                data-testid="immersive-sp-final-size"
                                className={cn(
                                    "pr-12 text-lg font-bold",
                                    isValidSize ? "text-primary" : "text-destructive",
                                )}
                            />
                            <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">人</span>
                        </div>
                    </div>
                    <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                            if (hasAdvancedSource) onClearAdvancedSource();
                            onResetFinalSize();
                        }}
                        className="shrink-0"
                    >
                        <RotateCcw data-icon="inline-start" />
                        重置
                    </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                    这里确认的 n 会作为下一阶段抽样执行的目标样本量。
                </p>
                {hasAdvancedSource && (
                    <p className="text-xs text-warning">
                        当前最终样本量保留了「{sourceLabel}」的结果。手动修改或重置后，将自动切回常规规划。
                    </p>
                )}
                {!isValidSize && (
                    <div className="flex items-center gap-2 text-sm text-destructive">
                        <Info className="size-4 shrink-0" />
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
                    size="lg"
                    className="rounded-xl px-8 shadow-lg shadow-primary/20 disabled:opacity-40"
                >
                    继续：完成理解自检
                    <ChevronRight data-icon="inline-end" />
                </Button>
            </div>
        </div>
    );
}

// --- Sub-components ---

function MetricBadge({ label, value }: { label: string; value: string }) {
    return (
        <div className="rounded-lg bg-muted px-2 py-2">
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
            <p className="mt-0.5 text-xs font-bold tabular-nums text-foreground">{value}</p>
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
            <Table className="text-xs">
                <TableHeader>
                    <TableRow className="hover:bg-transparent">
                        <TableHead className="h-auto pb-2 pr-2 text-left font-normal normal-case tracking-normal">置信↓ / 误差→</TableHead>
                        {meValues.map((me) => (
                            <TableHead
                                key={me}
                                className={cn(
                                    "h-auto px-1 pb-2 text-center font-normal normal-case tracking-normal tabular-nums",
                                    me === currentME && "font-bold text-metric-me",
                                )}
                            >
                                &plusmn;{me}%
                            </TableHead>
                        ))}
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {clLabels.map((cl) => {
                        const clDisplay = data.find((d) => d.confidenceLevel === cl)?.confidenceLabel ?? cl;
                        return (
                            <TableRow key={cl} className="hover:bg-transparent">
                                <TableCell
                                    className={cn(
                                        "py-1 pr-2 text-muted-foreground",
                                        cl === currentCL && "font-bold text-primary",
                                    )}
                                >
                                    {clDisplay}
                                </TableCell>
                                {meValues.map((me) => {
                                    const n = lookup.get(`${cl}-${me}`) ?? 0;
                                    const isCurrent = cl === currentCL && me === currentME;
                                    const intensity = Math.round((n / maxSample) * 100);
                                    return (
                                        <TableCell key={me} className="px-1 py-1">
                                            <div
                                                className={cn(
                                                    "rounded px-1.5 py-1 text-center tabular-nums transition-colors",
                                                    isCurrent
                                                        ? "bg-primary font-bold text-primary-foreground ring-2 ring-primary/40 ring-offset-1 ring-offset-background"
                                                        : "text-foreground",
                                                )}
                                                style={
                                                    !isCurrent
                                                        ? { backgroundColor: `color-mix(in oklch, var(--primary) ${Math.min(35, intensity / 2)}%, transparent)` }
                                                        : undefined
                                                }
                                            >
                                                {n.toLocaleString()}
                                            </div>
                                        </TableCell>
                                    );
                                })}
                            </TableRow>
                        );
                    })}
                </TableBody>
            </Table>
        </div>
    );
}
