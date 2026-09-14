import { useState, useMemo, useEffect, useCallback, useId } from "react";
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
import { calculatePlannedPrecision } from "../../../experiment/planned-precision";
import { PlanningOutcome, PlanningAssumptions } from "../PlanningShared";
import { designEffectValueTone, nonResponseRateValueTone, primarySliderClassName } from "../../sample-planning-styles";
import {
    calculateMeanSampleSizeMetrics,
    calculateSampleSizeMetrics,
    calculateSampleSizeSensitivity,
    calculateSampleSizeForDifferentP,
} from "../../../experiment/sample-plan";
import {
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
import type { AdvancedPlanSnapshot } from "../../../experiment/advanced-plan";
import { EnhancedMetricsCard } from "../../../components/EnhancedMetricsCard";
import { PValueComparisonCard } from "../../../components/PValueComparisonCard";
import { SensitivityAnalysisCard } from "../../../components/SensitivityAnalysisCard";

/** 成本/CV/整群等非标准路径：仅写最终 n；左侧常规建议继续显示，但解释该 n 时以本工具为准 */
const TOAST_APPLY_SAMPLE_SIZE_ONLY_DESC =
    "已将最终样本量更新为工具结果。常规公式建议仍供对照；若继续调整参数或最终样本量，将自动切回常规规划。";

/** 多变量表为会话内状态（P0），不入持久化 samplePlan */
const TOAST_APPLY_MULTIVAR_DESC =
    "变量调查表仅保存在当前会话。已将最终样本量更新为多变量推荐；若继续调整参数或最终样本量，将自动切回常规规划。";

interface Props {
    params: SampleParams;
    hideNext?: boolean;
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
    /** 高级工具「应用」时回传完整快照（inputs/result），随 SamplePlanData 持久化并在提交时复算。 */
    onAdvancedPlanSnapshot: (snapshot: AdvancedPlanSnapshot) => void;
}

export function DecisionPhase({
    params,
    hideNext = false,
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
    onAdvancedPlanSnapshot,
}: Props) {
    const { populationSize: N, recommendedSize, finalSampleSize } = params;
    const finalSizeId = useId();
    const isMeanEstimation = params.estimationType === "mean";
    const { min: minSize, max: maxSize } = useMemo(() => getFinalSampleSizeBounds(N, params.minimumSampleSize), [N, params.minimumSampleSize]);
    const isValidSize = Number.isInteger(finalSampleSize) && finalSampleSize >= minSize && finalSampleSize <= maxSize;

    const isValidPlan = isValidSize && calculatePlannedPrecision(params, finalSampleSize) != null;

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

    const isUnsupportedForEstimation = useCallback(
        (key: AdvancedTab) =>
            (isMeanEstimation && (key === "cost" || key === "cluster"))
            || (!isMeanEstimation && key === "cv"),
        [isMeanEstimation],
    );

    const unsupportedToolTitle = useCallback(
        (key: AdvancedTab) => key === "cv"
            ? "当前工具仅支持具有自然零点的均值目标"
            : "当前工具仅支持比例估计，请切换为比例估计后使用",
        [],
    );

    /** 统一构造高级规划快照并上报父级。 */
    const emitAdvancedSnapshot = useCallback(
        (snapshot: Omit<AdvancedPlanSnapshot, "version" | "appliedAt">) => {
            onAdvancedPlanSnapshot({
                version: 1,
                appliedAt: new Date().toISOString(),
                ...snapshot,
            } as AdvancedPlanSnapshot);
        },
        [onAdvancedPlanSnapshot],
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
            {hasAdvancedSource && (
                <div className="rounded-surface border border-warning-border bg-warning-muted px-4 py-3 flex flex-row items-center justify-between gap-3">
                    <div className="flex items-start gap-2 text-label text-warning">
                        <Info className="w-4 h-4 shrink-0 mt-0.5 text-warning" />
                        <span>
                            当前最终样本量正在使用高级工具「<span className="font-semibold">{sourceLabel}</span>」的结果；常规公式建议值仍供对照。若继续修改参数或最终样本量，将自动切回常规规划；解释当前 n 时请以该工具内推演为准。
                        </span>
                    </div>
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={onClearAdvancedSource}
                        className="shrink-0 border-warning bg-background text-warning hover:bg-warning-muted hover:text-warning hover:border-warning"
                    >
                        按常规继续
                    </Button>
                </div>
            )}

            <div className="grid grid-cols-2 items-start gap-5" data-testid="planning-workspace">
                {/* Keep controls and live results side by side, without a separate navigation rail. */}
                <section aria-label="规划参数" className="rounded-surface border border-border bg-card p-5 space-y-4">
                    <h2 tabIndex={-1} className="text-subheading font-semibold text-foreground outline-none">设置目标与假设</h2>

                    <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <Label className="text-label text-foreground">置信水平</Label>
                        <Select
                            value={params.confidenceLevel}
                            onValueChange={onConfidenceLevelChange}
                        >
                            <SelectTrigger aria-label="常规公式置信水平" className="w-full min-h-11 text-label bg-background border-input">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="90">90% (Z=1.645)</SelectItem>
                                <SelectItem value="95">95% (Z=1.96)</SelectItem>
                                <SelectItem value="99">99% (Z=2.576)</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor={`${finalSizeId}-error`} className="text-label text-foreground">{currentMarginLabel}</Label>
                        <Input id={`${finalSizeId}-error`} aria-label={isMeanEstimation ? "绝对误差限" : "比例估计允许误差"}
                            type="number" value={params.marginOfError || ""} min={isMeanEstimation ? undefined : 1} max={isMeanEstimation ? undefined : 10} step="any"
                            onChange={event => onMarginOfErrorChange(Number(event.target.value))}
                            aria-invalid={!Number.isFinite(params.marginOfError) || params.marginOfError <= 0 || (!isMeanEstimation && (params.marginOfError < 1 || params.marginOfError > 10))}
                            className="h-11 bg-background border-input"/>
                    </div>
                    </div>
                    <p className="text-meta text-muted-foreground">{isMeanEstimation ? "误差限必须为正数，与研究指标同单位；数值越小，要求越严格。" : "误差限以百分点计，可输入 1～10 之间的小数；数值越小，要求越严格。"}</p>
                    <div className="grid grid-cols-2 gap-5 border-t border-border pt-4">
                    <div className="space-y-1.5">
                        <div className="flex justify-between">
                            <Label className="text-label text-foreground">设计效应</Label>
                            <span className={`text-meta font-bold tabular-nums ${designEffectValueTone(params.designEffect)}`}>{params.designEffect.toFixed(1)}</span>
                        </div>
                        <Slider
                            aria-label="设计效应"
                            value={[params.designEffect]}
                            onValueChange={([v]) => v != null && onDesignEffectChange(Math.round(v * 10) / 10)}
                            min={0.5} max={5} step={0.1}
                            className={primarySliderClassName}
                        />
                        <p className="pt-2 text-meta text-muted-foreground">1 为简单随机抽样基准；范围 0.5～5。</p>
                    </div>
                    <div className="space-y-1.5">
                        <div className="flex justify-between">
                            <Label className="text-label text-foreground">预期无回答率</Label>
                            <span className={`text-meta font-bold tabular-nums ${nonResponseRateValueTone(params.nonResponseRate)}`}>{Math.round(params.nonResponseRate * 100)}%</span>
                        </div>
                        <Slider
                            aria-label="预期无回答率"
                            value={[Math.round(params.nonResponseRate * 100)]}
                            onValueChange={([v]) => v != null && onNonResponseRateChange(v / 100)}
                            min={0} max={50} step={5}
                            className={primarySliderClassName}
                        />
                        <p className="pt-2 text-meta text-muted-foreground">0 表示全部回答；范围 0～50%。</p>
                    </div>
                    </div>
                    <details className="border-t border-border pt-3 text-meta">
                        <summary className="cursor-pointer font-medium text-foreground">当前规划假设与适用范围</summary>
                        <div className="pt-3"><PlanningAssumptions params={params}/></div>
                    </details>
                </section>

                <div className="sticky top-4 space-y-4">
            {/* Final sample size */}
            <div
                className={cn(
                    "rounded-surface border p-5 space-y-3 transition-colors",
                    isValidSize
                        ? "border-primary-border bg-card"
                        : "border-destructive bg-destructive-muted",
                )}
            >
                <h3 className="text-subheading font-semibold text-foreground">你准备采用的样本量</h3>
                {minSize > 1 && <p className="text-meta text-info">本课题要求完成分层抽样。至少需要 {minSize} 个样本，才能在一个可用分层方案中覆盖每个非空层；分层更细时还需相应增加样本量。</p>}
                <div className="flex flex-wrap items-end gap-3">
                    <div className="w-full flex-1 space-y-2">
                        <div className="flex flex-wrap justify-between gap-2 text-meta">
                            <Label htmlFor={finalSizeId} className="text-meta text-muted-foreground">最终样本量</Label>
                            <span className="text-success font-medium">
                                建议值 {recommendedSize > 0 ? Math.max(minSize, recommendedSize).toLocaleString() : "—"}
                            </span>
                        </div>
                        <div className="relative">
                            <Input
                                id={finalSizeId}
                                aria-label="最终样本量"
                                type="number"
                                inputMode="numeric" step={1} aria-invalid={!isValidSize}
                                value={finalSampleSize === 0 ? "" : finalSampleSize}
                                onChange={(e) => {
                                    if (hasAdvancedSource) onClearAdvancedSource();
                                    onFinalSizeChange(Number(e.target.value));
                                }}
                                min={minSize}
                                max={maxSize}
                                data-testid="immersive-sp-final-size"
                                className={cn(
                                    "h-11 pr-24 text-section-title font-semibold bg-background border-input",
                                    isValidSize ? "text-primary" : "text-destructive",
                                )}
                            />
                            <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground text-label">个单位</span>
                        </div>
                    </div>
                    <Button
                        type="button"
                        variant="outline"
                        disabled={recommendedSize <= 0}
                        onClick={() => {
                            if (hasAdvancedSource) onClearAdvancedSource();
                            onResetFinalSize();
                        }}
                        className="min-h-11 border-input text-foreground shrink-0"
                    >
                        <RotateCcw className="w-4 h-4 mr-1" />
                        采用建议值
                    </Button>
                </div>
                <p className="text-meta text-muted-foreground">
                    样本量自动跟随建议；手动输入后保留你的选择。
                </p>
                {hasAdvancedSource && (
                    <p className="text-meta text-warning">
                        当前最终样本量保留了「{sourceLabel}」的结果。手动修改或重置后，将自动切回常规规划。
                    </p>
                )}
                {!isValidSize && (
                    <div className="flex items-center gap-2 text-label text-destructive">
                        <Info className="w-4 h-4 shrink-0" />
                        请输入 {minSize}～{maxSize.toLocaleString()} 之间的整数
                    </div>
                )}
                <div className="border-t border-border pt-4"><PlanningOutcome params={params}/></div>
            </div>


                </div>
            </div>

            {/* Sensitivity heatmap */}
            {sensitivity && (
                <details className="rounded-surface border border-border bg-card p-5 space-y-3">
                    <summary className="cursor-pointer text-label font-semibold text-foreground">比较其他精度方案（点击即可采用）</summary>
                    <p className="text-meta text-muted-foreground">看看不同置信水平与允许误差组合下，样本量会如何变化。{minSize > 1 && `可采用数量已考虑本课题至少 ${minSize} 个样本的分层要求。`}</p>
                    <SensitivityGrid
                        data={sensitivity.map(plan => ({ ...plan, sampleSize: Math.max(minSize, plan.sampleSize) }))}
                        currentCL={params.confidenceLevel}
                        currentME={params.marginOfError}
                        onSelect={(cl, me, sampleSize) => {
                            onConfidenceLevelChange(cl);
                            onMarginOfErrorChange(me);
                            // Apply the clicked count; resetting here would read the previous recommendation.
                            onFinalSizeChange(sampleSize);
                        }}
                    />
                </details>
            )}

            {/* Advanced tools */}
            <details className="rounded-surface border border-border bg-background p-5 ">
                <summary className="cursor-pointer text-label font-semibold text-foreground">
                    <Wrench className="mx-2 inline h-4 w-4 text-muted-foreground" />
                    高级工具（可选）
                </summary>
                <div className="mt-3 space-y-3">
                <div className="grid grid-cols-4 gap-2">
                    {ADVANCED_TAB_CONFIG.map(({ key, label }) => {
                        const isActiveSource = advancedPlanSource === key;
                        const isDisabled =
                            isUnsupportedForEstimation(key);
                        return (
                            <button
                                key={key}
                                type="button"
                                disabled={isDisabled}
                                title={
                                    isUnsupportedForEstimation(key)
                                        ? unsupportedToolTitle(key)
                                        : undefined
                                }
                                onClick={() => {
                                    if (isDisabled) return;
                                    setActiveAdvancedTab(key);
                                }}
                                className={cn(
                                    "rounded-surface border px-2.5 py-2 text-meta font-medium transition-none",
                                    isDisabled && "opacity-45 cursor-not-allowed",
                                    isActiveSource
                                        ? "ring-2 ring-primary border-primary bg-primary text-primary-foreground "
                                        : "border-border bg-card text-muted-foreground hover:bg-primary-muted hover:border-primary hover:text-primary",
                                )}
                            >
                                {label}
                            </button>
                        );
                    })}
                </div>
                </div>
            </details>

            {/* Advanced tool Dialog */}
            <Dialog open={activeAdvancedTab !== null} onOpenChange={(open) => { if (!open) setActiveAdvancedTab(null); }}>
                <DialogContent
                    className={`bg-background border-border text-foreground ${
                        activeAdvancedTab === "metrics"
                            ? "w-[96vw] max-w-[90rem]"
                            : "max-w-3xl"
                    } max-h-[85vh] overflow-y-auto`}
                >
                    {activeAdvancedTab && (() => {
                        const config = ADVANCED_TAB_CONFIG.find(c => c.key === activeAdvancedTab);
                        return (
                            <DialogHeader className="border-b border-border pb-4 mb-1 space-y-2">
                                <DialogTitle className="text-section-title font-semibold tracking-tight text-foreground pr-8">
                                    {config?.title}
                                </DialogTitle>
                                <DialogDescription className="text-muted-foreground text-label leading-relaxed">
                                    {config?.description}
                                </DialogDescription>
                                {config && (
                                    <div className="grid grid-cols-3 gap-2 pt-2 text-meta leading-relaxed" data-testid="student-advanced-tool-scope">
                                        <div className="rounded-surface border border-border bg-card p-2">
                                            <p className="font-semibold text-foreground">目标估计量</p>
                                            <p className="mt-1 text-muted-foreground">{config.targetEstimand}</p>
                                        </div>
                                        <div className="rounded-surface border border-border bg-card p-2">
                                            <p className="font-semibold text-foreground">假设与数据来源</p>
                                            <p className="mt-1 text-muted-foreground">{config.assumptionsAndSource}</p>
                                        </div>
                                        <div className="rounded-surface border border-border bg-card p-2">
                                            <p className="font-semibold text-foreground">适用范围与限制</p>
                                            <p className="mt-1 text-muted-foreground">{config.scopeAndLimitations}</p>
                                        </div>
                                    </div>
                                )}
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
                            <div className="flex justify-end gap-2 pt-4 border-t border-border">
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={closeAdvancedDialog}
                                    className="border-input"
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
                                    className="bg-primary hover:bg-primary-hover text-primary-foreground disabled:bg-muted disabled:text-muted-foreground disabled:border-border"
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
                            onSnapshot={(snapshot) => emitAdvancedSnapshot({ kind: "cost", ...snapshot })}
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
                            <div className="flex justify-end gap-2 pt-4 border-t border-border">
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={closeAdvancedDialog}
                                    className="border-input"
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
                                    className="bg-primary hover:bg-primary-hover text-primary-foreground"
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
                                if (hasRecommendation) {
                                    emitAdvancedSnapshot({
                                        kind: "multivar",
                                        inputs: { variables },
                                        result: { requiredSampleSize: recommendedSampleSize },
                                    });
                                }
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
                            onSnapshot={(snapshot) => emitAdvancedSnapshot({ kind: "cv", ...snapshot })}
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
                            onSnapshot={(snapshot) => emitAdvancedSnapshot({ kind: "cluster", ...snapshot })}
                            onApplyResult={(clusters, sampleSize) => {
                                applyAdvancedSource("cluster", () => {
                                    onFinalSizeChange(sampleSize);
                                });
                                toast.success(`整群方案：${clusters} 个群，共 ${sampleSize} 个单位`, {
                                    description: TOAST_APPLY_SAMPLE_SIZE_ONLY_DESC,
                                });
                                closeAdvancedDialog();
                            }}
                        />
                    )}

                    {activeAdvancedTab === "metrics" && metrics && (
                        <>
                            <div className={cn("grid min-w-0 grid-cols-1 gap-5", !isMeanEstimation && "grid-cols-3 gap-6")}>
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
                            <div className="flex justify-end pt-4 border-t border-border">
                                <Button
                                    type="button"
                                    onClick={closeAdvancedDialog}
                                    className="bg-primary hover:bg-primary-hover text-primary-foreground"
                                >
                                    完成
                                </Button>
                            </div>
                        </>
                    )}
                    {activeAdvancedTab === "metrics" && !metrics && (
                        <>
                            <p className="text-label text-muted-foreground py-4">
                                当前参数下无法计算指标（例如总体规模无效）。请先在决策面板中设定有效的置信水平与允许误差。
                            </p>
                            <div className="flex justify-end pt-4 border-t border-border">
                                <Button
                                    type="button"
                                    onClick={closeAdvancedDialog}
                                    variant="outline"
                                    className="border-input"
                                >
                                    关闭
                                </Button>
                            </div>
                        </>
                    )}
                </DialogContent>
            </Dialog>

            {!hideNext && <div className="flex justify-center pt-2">
                <Button
                    type="button"
                    onClick={onNext}
                    disabled={!isValidPlan}
                    data-testid="immersive-sp-decision-next"
                    className="rounded-surface bg-primary px-8 py-5 text-primary-foreground hover:bg-primary-hover disabled:border-border disabled:bg-muted disabled:text-muted-foreground"
                >
                    检查并确认方案
                    <ChevronRight className="w-5 h-5 ml-2" />
                </Button>
            </div>}
        </div>
    );
}

// --- Sub-components ---

function SensitivityGrid({
    data,
    currentCL,
    currentME,
    onSelect,
}: {
    data: Array<{ confidenceLabel: string; confidenceLevel: string; marginOfError: number; sampleSize: number }>;
    currentCL: string;
    currentME: number;
    onSelect: (confidence: string, margin: number, sampleSize: number) => void;
}) {
    // Build a grid: rows = confidence levels, cols = margins of error
    const clLabels = [...new Set(data.map((d) => d.confidenceLevel))];
    const meValues = [...new Set(data.map((d) => d.marginOfError))].sort((a, b) => a - b);

    const lookup = new Map(data.map((d) => [`${d.confidenceLevel}-${d.marginOfError}`, d.sampleSize]));

    return (
        <div className="overflow-x-auto">
            <table className="w-full text-meta">
                <thead>
                    <tr>
                        <th className="text-left text-muted-foreground font-normal pb-2 pr-2">置信↓ / 误差→</th>
                        {meValues.map((me) => (
                            <th
                                key={me}
                                className={`text-center font-normal pb-2 px-1 tabular-nums ${
                                    me === currentME ? "text-info font-bold" : "text-muted-foreground"
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
                                    cl === currentCL ? "text-primary font-bold" : "text-muted-foreground"
                                }`}>
                                    {clDisplay}
                                </td>
                                {meValues.map((me) => {
                                    const n = lookup.get(`${cl}-${me}`) ?? 0;
                                    const isCurrent = cl === currentCL && me === currentME;
                                    return (
                                        <td key={me} className="px-1 py-1">
                                            <button type="button" onClick={() => onSelect(cl, me, n)} aria-pressed={isCurrent} aria-label={`采用 ${cl}% 置信、误差 ${me} 个百分点的方案：${n} 个单位`}
                                                className={`min-h-11 w-full rounded-control px-1.5 py-1 text-center tabular-nums transition-colors ${
                                                    isCurrent
                                                        ? "bg-primary text-primary-foreground font-bold ring-2 ring-primary ring-offset-1"
                                                        : "bg-muted text-foreground hover:bg-primary-muted"
                                                }`}
                                            >
                                                {n.toLocaleString()}
                                            </button>
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
