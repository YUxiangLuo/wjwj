import { DraftSaveStatus } from "../../components/DraftSaveStatus";
import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, ClipboardList, Sparkles, ChevronLeft, ChevronRight, Info, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useExperiment } from "../ExperimentLayout";
import { experimentApi } from "../../api-client";
import type { SamplePlanData } from "@/domain/experiment/types";
import {
    formatMarginOfError,
    formatSamplePlanNumber,
    getEstimationTypeLabel,
    getMarginOfErrorLabel,
    normalizeSamplePlanData,
} from "../../experiment/sample-plan-display";
import { finitePopulationS2ToSigma2 } from "../../experiment/sample-plan";
import { getRequiredStratifiedMinimum } from "../../experiment/final-sample-bounds";
import { resolveSamplingPolicy } from "@/lib/sampling-policy";
import { ImmersiveSamplePlanning } from "../../components/immersive-sample-planning";
import { ImmersiveExperimentLaunch } from "../../components/ImmersiveExperimentLaunch";
import {
    getFinalSampleSizeBounds,
    type SampleParams,
    type SamplePlanningWizardDraft,
} from "../../components/immersive-sample-planning/types";
import {
    readExperimentDraft,
    useExperimentDraft,
} from "../../experiment/experiment-draft";

interface SamplePlanningProps {
    onPrev: () => void;
}

interface SamplePlanningStageDraft {
    samplePlan: SamplePlanData | null;
    wizard: SamplePlanningWizardDraft | null;
}

export function SamplePlanning({ onPrev }: SamplePlanningProps) {
    const { populationSize, experiment, completeStage } = useExperiment();

    const N = populationSize;
    const lockedEstimationType = experiment?.analysisTarget?.target.kind;
    const restoredDraft = useMemo(() => readExperimentDraft<Partial<SamplePlanningStageDraft>>({
        experimentId: experiment?.id,
        experimentVersion: experiment?.version,
        stage: 2,
    }), [experiment?.id, experiment?.version]);
    const initialData = useMemo(
        () => {
            const normalized = normalizeSamplePlanData(restoredDraft?.samplePlan ?? experiment?.samplePlan, N);
            if (!normalized || !lockedEstimationType) return normalized;
            return { ...normalized, estimationType: lockedEstimationType };
        },
        [experiment?.samplePlan, lockedEstimationType, N, restoredDraft?.samplePlan],
    );
    const [targetVariance, setTargetVariance] = useState<number | null>(
        initialData?.populationVariance ?? null,
    );
    const needsTargetVariance = lockedEstimationType === "mean";
    const requiresStratification = resolveSamplingPolicy(experiment?.samplingPolicy).methods.stratified === "required";
    const needsStats = needsTargetVariance || requiresStratification;
    const [minimumSampleSize, setMinimumSampleSize] = useState(1);
    const [targetVarianceReady, setTargetVarianceReady] = useState(!needsStats);
    const [targetVarianceError, setTargetVarianceError] = useState("");
    const [varianceReloadKey, setVarianceReloadKey] = useState(0);

    useEffect(() => {
        if (!needsStats || !experiment?.taskId) {
            setMinimumSampleSize(1);
            setTargetVarianceReady(true);
            return;
        }
        const field = experiment.analysisTarget?.target.field;
        let cancelled = false;
        const controller = new AbortController();
        setTargetVarianceReady(false);
        setTargetVarianceError("");
        void experimentApi.getStats(experiment.taskId, controller.signal).then((res) => {
            if (cancelled) return;
            if (requiresStratification) {
                const minimum = res.success ? getRequiredStratifiedMinimum(res.data?.stats, experiment.samplingPolicy, N) : null;
                if (minimum === null) {
                    setTargetVarianceError("必做分层抽样的总体分层数据尚不可用，请重新加载；仍失败时请联系教师检查课题。");
                    return;
                }
                setMinimumSampleSize(minimum);
            }
            if (!needsTargetVariance) return;
            const stat = res.success && field ? res.data?.populationNumericStats?.[field] : undefined;
            const variance = stat
                ? finitePopulationS2ToSigma2(stat.variance, stat.count)
                : null;
            if (variance != null && variance > 0) {
                setTargetVariance(variance);
            } else {
                setTargetVarianceError(variance === 0
                    ? "研究目标的总体值全部相同（方差为0）。当前均值样本量规划要求正方差，请联系教师调整研究目标或总体数据。"
                    : "无法取得研究目标的有效总体方差，请重试；不会使用默认方差代替实际数据。");
            }
        }).catch(() => {
            if (!cancelled) setTargetVarianceError("规划数据加载失败，请重试；不会使用默认方差或分层数代替实际数据。");
        }).finally(() => {
            if (!cancelled) setTargetVarianceReady(true);
        });
        return () => {
            cancelled = true;
            controller.abort();
        };
    }, [experiment?.analysisTarget, experiment?.taskId, experiment?.samplingPolicy, needsStats, needsTargetVariance, requiresStratification, N, varianceReloadKey]);

    const [confirmNextSaving, setConfirmNextSaving] = useState(false);
    // 进入抽样执行前的启动动画：点击“确认进入”后先播放，动画结束再保存。
    // 若保存失败，重试时不再重复播放。
    const [launching, setLaunching] = useState(false);
    const launchPlayedRef = useRef(false);

    // Display state — updated from planning flow completion or loaded from saved data
    const [displayData, setDisplayData] = useState<SamplePlanData | null>(initialData);
    const [wizardDraft, setWizardDraft] = useState<SamplePlanningWizardDraft | null>(
        restoredDraft?.wizard ?? null,
    );
    const samplePlanDraft = useMemo<SamplePlanningStageDraft>(
        () => ({ samplePlan: displayData, wizard: wizardDraft }),
        [displayData, wizardDraft],
    );
    const clearDraft = useExperimentDraft({
        experimentId: experiment?.id,
        experimentVersion: experiment?.version,
        stage: 2,
        data: samplePlanDraft,
        enabled: Boolean(experiment && (displayData || wizardDraft)),
    });

    const [immersiveOpen, setImmersiveOpen] = useState(false);
    const autoOpenedRef = useRef(false);
    const planningTriggerRef = useRef<HTMLButtonElement>(null);

    const closeImmersivePlanning = useCallback(() => {
        setImmersiveOpen(false);
        requestAnimationFrame(() => planningTriggerRef.current?.focus());
    }, []);

    useEffect(() => {
        if (autoOpenedRef.current || !targetVarianceReady) return;
        if (initialData && !restoredDraft?.wizard) return;
        autoOpenedRef.current = true;
        setImmersiveOpen(true);
    }, [initialData, restoredDraft?.wizard, targetVarianceReady]);

    const handleImmersiveDraftChange = useCallback((draft: SamplePlanningWizardDraft) => {
        setWizardDraft(draft);
        clearDraft.save({
            samplePlan: displayData,
            wizard: draft,
        } satisfies SamplePlanningStageDraft);
    }, [clearDraft.save, displayData]);

    const handleImmersiveComplete = useCallback((result: SampleParams) => {
        const estimationType = lockedEstimationType ?? result.estimationType;
        setDisplayData({
            estimationType,
            confidenceLevel: result.confidenceLevel,
            marginOfError: result.marginOfError,
            ...(estimationType === "mean" && result.populationVariance != null
                ? { populationVariance: result.populationVariance }
                : {}),
            designEffect: result.designEffect,
            nonResponseRate: result.nonResponseRate,
            recommendedSize: result.recommendedSize,
            finalSampleSize: result.finalSampleSize,
            ...(result.advancedPlanSource ? { advancedPlanSource: result.advancedPlanSource } : {}),
            ...(result.advancedPlans && result.advancedPlans.length > 0 ? { advancedPlans: result.advancedPlans } : {}),
        });
        setWizardDraft(null);
        closeImmersivePlanning();
    }, [closeImmersivePlanning, lockedEstimationType]);

    useEffect(() => {
        setDisplayData(initialData);
    }, [initialData]);

    const { min: minSampleSize, max: maxSampleSize } = useMemo(
        () => getFinalSampleSizeBounds(N, minimumSampleSize),
        [N, minimumSampleSize],
    );
    const isValidFinalSize =
        displayData != null
        && displayData.finalSampleSize >= minSampleSize
        && displayData.finalSampleSize <= maxSampleSize;

    const saveStage = useCallback(async () => {
        if (!displayData || experiment == null || !targetVarianceReady || targetVarianceError) {
            toast.error("实验数据未就绪，请稍后重试");
            return;
        }
        setConfirmNextSaving(true);
        try {
            if (clearDraft.save(samplePlanDraft) === "conflict") return;
            const ok = await completeStage(2, { samplePlan: displayData });
            if (!ok) {
                toast.error("保存失败，请重试");
            } else {
                clearDraft.clear();
            }
        } finally {
            setConfirmNextSaving(false);
        }
    }, [clearDraft, completeStage, displayData, experiment, samplePlanDraft, targetVarianceReady, targetVarianceError]);

    const handleConfirmNext = () => {
        if (!displayData || experiment == null) {
            toast.error("实验数据未就绪，请稍后重试");
            return;
        }
        if (launchPlayedRef.current) {
            void saveStage();
            return;
        }
        setLaunching(true);
    };

    const handleLaunchFinished = useCallback(() => {
        launchPlayedRef.current = true;
        setLaunching(false);
        void saveStage();
    }, [saveStage]);

    if (targetVarianceError) return (
        <div className="space-y-4" data-testid="student-stage-sample-plan">
            <DraftSaveStatus status={clearDraft.status} onRetry={clearDraft.retry} />
            <div role="alert" className="space-y-3 rounded-surface border border-warning-border bg-warning-muted p-4 text-body text-warning">
                <p>{targetVarianceError}</p>
                <Button type="button" variant="outline" onClick={() => setVarianceReloadKey(key => key + 1)}>重新加载规划数据</Button>
            </div>
            <Button type="button" variant="outline" onClick={onPrev}>上一阶段</Button>
        </div>
    );

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300" data-testid="student-stage-sample-plan">
            <DraftSaveStatus status={clearDraft.status} onRetry={clearDraft.retry} />
            {immersiveOpen && targetVarianceReady && (
                <ImmersiveSamplePlanning
                    populationSize={N}
                    minimumSampleSize={minimumSampleSize}
                    initialConfidenceLevel={displayData?.confidenceLevel}
                    initialMarginOfError={displayData?.marginOfError ?? (lockedEstimationType === "mean" ? 2 : 5)}
                    initialDesignEffect={displayData?.designEffect}
                    initialNonResponseRate={displayData?.nonResponseRate}
                    initialFinalSampleSize={displayData?.finalSampleSize}
                    initialEstimationType={lockedEstimationType ?? displayData?.estimationType ?? "proportion"}
                    initialPopulationVariance={targetVariance ?? displayData?.populationVariance ?? 100}
                    initialAdvancedPlanSource={displayData?.advancedPlanSource ?? null}
                    estimationLocked={Boolean(lockedEstimationType)}
                    initialDraft={wizardDraft}
                    onDraftChange={handleImmersiveDraftChange}
                    draftSaveStatus={clearDraft.status}
                    onRetryDraftSave={clearDraft.retry}
                    onComplete={handleImmersiveComplete}
                    onClose={closeImmersivePlanning}
                />
            )}

            <div className="flex items-start gap-2 rounded-surface border border-info-border bg-info-muted p-3 text-meta leading-relaxed text-info" data-testid="student-sample-plan-scope-notice">
                <Info className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                    本实验使用完整虚拟总体演示抽样设计。页面中的样本量、设计效应和无回答率计算是基于所列目标与假设的规划近似，不替代现实项目中的预调查、抽样框评估和专业统计设计；现实调查通常也无法直接看到未入样单位的总体真值。
                </span>
            </div>

            {/* Population info */}
            <Card className="gap-2 py-4 rounded-surface border-border bg-card ">
                <CardHeader className="border-b border-border px-4 pb-3 pt-0 [.border-b]:pb-3">
                    <CardTitle className="flex items-center gap-2 text-body text-foreground">
                        <Users className="w-4 h-4 shrink-0 text-primary" />
                        总体信息
                    </CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-1 pt-3">
                    <div className="flex items-center justify-between rounded-surface border border-border bg-background px-3 py-2.5">
                        <span className="text-muted-foreground">总体规模 (N)</span>
                        <span className="text-section-title font-bold tabular-nums text-primary">{N.toLocaleString()} <span className="text-label font-normal text-muted-foreground">个总体单位</span></span>
                    </div>
                </CardContent>
            </Card>

            {displayData ? (
                <>
                    {/* Parameter summary (read-only) */}
                    <Card className="gap-2 py-4 rounded-surface border-border bg-card ">
                        <CardHeader className="border-b border-border px-4 pb-3 pt-0 [.border-b]:pb-3">
                            <CardTitle className="flex items-center gap-2 text-body text-foreground">
                                <ClipboardList className="w-4 h-4 shrink-0 text-muted-foreground" />
                                参数摘要
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="px-4 pb-2 pt-3" data-testid="student-sample-plan-summary">
                            <div className="grid gap-x-6 gap-y-0 grid-cols-2">
                                <SummaryRow
                                    label="估计类型"
                                    value={getEstimationTypeLabel(displayData.estimationType)}
                                />
                                <SummaryRow label="置信水平" value={`${displayData.confidenceLevel}%`} />
                                <SummaryRow
                                    label={getMarginOfErrorLabel(displayData.estimationType)}
                                    value={formatMarginOfError(displayData.marginOfError, displayData.estimationType)}
                                />
                                {displayData.estimationType === "mean" && displayData.populationVariance != null && (
                                    <SummaryRow
                                        label="总体方差 σ²"
                                        value={formatSamplePlanNumber(displayData.populationVariance)}
                                    />
                                )}
                                <SummaryRow label="设计效应" value={displayData.designEffect.toFixed(1)} />
                                <SummaryRow label="无回答率" value={`${Math.round(displayData.nonResponseRate * 100)}%`} />
                            </div>
                            <div className="mt-2 grid grid-cols-2 gap-3 rounded-surface border border-border bg-background px-3 py-2">
                                <div>
                                    <p className="text-meta font-medium uppercase tracking-wide text-muted-foreground">建议样本量</p>
                                    <p className="text-body font-bold font-mono tabular-nums text-info">{displayData.recommendedSize.toLocaleString()}</p>
                                </div>
                                <div className="text-right">
                                    <p className="text-meta font-medium uppercase tracking-wide text-muted-foreground">最终设定</p>
                                    <p className="text-subheading font-bold font-mono tabular-nums text-primary">{displayData.finalSampleSize.toLocaleString()}</p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Re-open sample planning */}
                    <div className="flex justify-center">
                        <Button
                            ref={planningTriggerRef}
                            type="button"
                            variant="outline"
                            onClick={() => setImmersiveOpen(true)}
                            disabled={!targetVarianceReady}
                            className="border-primary text-primary hover:bg-primary-muted"
                        >
                            <Sparkles className="w-4 h-4 mr-1.5" />
                            {wizardDraft ? "继续规划样本量" : "重新规划样本量"}
                        </Button>
                    </div>

                    {!isValidFinalSize && (
                        <div className="flex items-center gap-2 rounded-surface border border-destructive-border bg-destructive-muted px-3 py-2 text-label text-destructive">
                            <Info className="h-4 w-4 shrink-0" />
                            最终样本量需在 {minSampleSize}～{maxSampleSize.toLocaleString()} 个单位之间，请重新规划样本量。
                        </div>
                    )}
                </>
            ) : (
                /* First visit — prompt to start sample planning */
                <Card className="gap-2 py-8 rounded-surface border-primary-border bg-primary-muted ">
                    <CardContent className="flex flex-col items-center text-center space-y-4 px-6">
                        <div className="w-14 h-14 rounded-surface bg-primary-muted border border-primary-border flex items-center justify-center">
                            <Sparkles className="w-7 h-7 text-primary" />
                        </div>
                        <div className="space-y-1">
                            <h3 className="text-subheading font-semibold text-foreground">开始样本量规划</h3>
                            <p className="text-label text-muted-foreground max-w-sm">
                                通过分步引导，逐步理解样本量计算原理并确定最终样本量。
                            </p>
                        </div>
                        <Button
                            ref={planningTriggerRef}
                            type="button"
                            onClick={() => setImmersiveOpen(true)}
                            disabled={!targetVarianceReady}
                            data-testid="student-sample-plan-start"
                            className="bg-primary hover:bg-primary-hover text-primary-foreground px-8 "
                        >
                            {targetVarianceReady ? (
                                <Sparkles className="w-4 h-4 mr-1.5" />
                            ) : (
                                <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                            )}
                            {targetVarianceReady ? "开始规划样本量" : "正在加载对照变量方差…"}
                        </Button>
                    </CardContent>
                </Card>
            )}

            {/* Bottom navigation */}
            <div className="flex justify-between items-center gap-3 pt-6 border-t border-border">
                <Button
                    variant="outline"
                    onClick={onPrev}
                    data-testid="student-sample-plan-prev"
                    className="border-input bg-muted text-foreground hover:bg-muted hover:text-foreground"
                >
                    <ChevronLeft className="w-4 h-4 mr-1" />
                    上一阶段
                </Button>
                {displayData && (
                    <Button
                        type="button"
                        onClick={handleConfirmNext}
                        disabled={clearDraft.status === "conflict" || !targetVarianceReady || !isValidFinalSize || confirmNextSaving || launching}
                        data-testid="student-sample-plan-next"
                        className="bg-primary text-primary-foreground hover:bg-primary-hover disabled:border-border disabled:bg-muted disabled:text-muted-foreground"
                    >
                        {confirmNextSaving ? (
                            <><Loader2 className="w-4 h-4 mr-2 animate-spin" />保存中…</>
                        ) : (
                            <>确认并进入下一阶段<ChevronRight className="w-4 h-4 ml-1" /></>
                        )}
                    </Button>
                )}
            </div>

            {/* 进入抽样执行前的启动动画 */}
            {launching && displayData && (
                <ImmersiveExperimentLaunch
                    populationSize={N}
                    sampleSize={displayData.finalSampleSize}
                    estimationType={displayData.estimationType}
                    confidenceLevel={displayData.confidenceLevel}
                    marginOfError={displayData.marginOfError}
                    onComplete={handleLaunchFinished}
                    onClose={handleLaunchFinished}
                />
            )}

        </div>
    );
}

// --- Sub-components ---

function SummaryRow({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex justify-between gap-2 border-b border-border py-1.5 text-label">
            <span className="text-muted-foreground">{label}</span>
            <span className="font-mono text-foreground tabular-nums">{value}</span>
        </div>
    );
}

export default SamplePlanning;
