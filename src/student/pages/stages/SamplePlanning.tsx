import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, ClipboardList, Sparkles, ChevronLeft, ChevronRight, Info, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useExperiment } from "../ExperimentLayout";
import { experimentApi, type SamplePlanData } from "../../api-client";
import {
    formatMarginOfError,
    getEstimationTypeLabel,
    getMarginOfErrorLabel,
    normalizeSamplePlanData,
} from "../../experiment/sample-plan-display";
import { finitePopulationS2ToSigma2 } from "../../experiment/sample-plan";
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
    writeExperimentDraft,
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
    const [targetVarianceReady, setTargetVarianceReady] = useState(
        !needsTargetVariance || (typeof experiment?.samplePlan?.populationVariance === "number" && experiment.samplePlan.populationVariance > 0),
    );

    useEffect(() => {
        if (lockedEstimationType !== "mean" || !experiment?.taskId || !experiment.analysisTarget) {
            setTargetVarianceReady(true);
            return;
        }
        const field = experiment.analysisTarget.target.field;
        let cancelled = false;
        void experimentApi.getStats(experiment.taskId).then((res) => {
            if (cancelled) return;
            const stat = res.data?.populationNumericStats?.[field];
            const variance = stat
                ? finitePopulationS2ToSigma2(stat.variance, stat.count)
                : null;
            if (variance != null && variance > 0) {
                setTargetVariance(variance);
            }
        }).catch(() => {}).finally(() => {
            if (!cancelled) setTargetVarianceReady(true);
        });
        return () => {
            cancelled = true;
        };
    }, [experiment?.analysisTarget, experiment?.taskId, lockedEstimationType]);

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
        writeExperimentDraft({
            experimentId: experiment?.id,
            experimentVersion: experiment?.version,
            stage: 2,
        }, {
            samplePlan: displayData,
            wizard: draft,
        } satisfies SamplePlanningStageDraft);
        setWizardDraft(draft);
    }, [displayData, experiment?.id, experiment?.version]);

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
            finalSizeSource: result.finalSizeSource ?? (result.advancedPlanSource ? "advanced" : "manual"),
            ...(result.advancedPlans?.length ? { advancedPlans: result.advancedPlans } : {}),
        });
        setWizardDraft(null);
        closeImmersivePlanning();
    }, [closeImmersivePlanning, lockedEstimationType]);

    useEffect(() => {
        setDisplayData(initialData);
    }, [initialData]);

    const { min: minSampleSize, max: maxSampleSize } = useMemo(
        () => getFinalSampleSizeBounds(N),
        [N],
    );
    const isValidFinalSize =
        displayData != null
        && displayData.finalSampleSize >= minSampleSize
        && displayData.finalSampleSize <= maxSampleSize;

    const saveStage = useCallback(async () => {
        if (!displayData || experiment == null) {
            toast.error("实验数据未就绪，请稍后重试");
            return;
        }
        setConfirmNextSaving(true);
        try {
            const ok = await completeStage(2, { samplePlan: displayData });
            if (!ok) {
                toast.error("保存失败，请重试");
            } else {
                clearDraft();
            }
        } finally {
            setConfirmNextSaving(false);
        }
    }, [clearDraft, completeStage, displayData, experiment]);

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

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300" data-testid="student-stage-sample-plan">
            {immersiveOpen && targetVarianceReady && (
                <ImmersiveSamplePlanning
                    populationSize={N}
                    initialConfidenceLevel={displayData?.confidenceLevel}
                    initialMarginOfError={displayData?.marginOfError ?? (lockedEstimationType === "mean" ? 2 : 5)}
                    initialDesignEffect={displayData?.designEffect}
                    initialNonResponseRate={displayData?.nonResponseRate}
                    initialFinalSampleSize={displayData?.finalSampleSize}
                    initialEstimationType={lockedEstimationType ?? displayData?.estimationType ?? "proportion"}
                    initialPopulationVariance={targetVariance ?? displayData?.populationVariance ?? 100}
                    initialAdvancedPlanSource={displayData?.advancedPlanSource ?? null}
                    initialAdvancedPlans={displayData?.advancedPlans ?? []}
                    initialFinalSizeSource={displayData?.finalSizeSource}
                    estimationLocked={Boolean(lockedEstimationType)}
                    initialDraft={wizardDraft}
                    onDraftChange={handleImmersiveDraftChange}
                    onComplete={handleImmersiveComplete}
                    onClose={closeImmersivePlanning}
                />
            )}

            <div className="flex items-start gap-2 rounded-xl border border-info/20 bg-info/10 p-3 text-xs leading-relaxed text-info" data-testid="student-sample-plan-scope-notice">
                <Info className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                    本实验使用完整虚拟总体演示抽样设计。页面中的样本量、设计效应和无回答率计算是基于所列目标与假设的规划近似，不替代现实项目中的预调查、抽样框评估和专业统计设计；现实调查通常也无法直接看到未入样单位的总体真值。
                </span>
            </div>

            {/* Population info */}
            <Card className="gap-2 py-4 rounded-2xl border-border bg-card/50 shadow-sm">
                <CardHeader className="border-b border-border px-4 pb-3 pt-0 [.border-b]:pb-3">
                    <CardTitle className="flex items-center gap-2 text-base text-foreground">
                        <Users className="w-4 h-4 shrink-0 text-primary" />
                        总体信息
                    </CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-1 pt-3">
                    <div className="flex items-center justify-between rounded-xl border border-border bg-background/50 px-3 py-2.5">
                        <span className="text-muted-foreground">总体规模 (N)</span>
                        <span className="text-xl font-bold tabular-nums text-primary">{N.toLocaleString()} <span className="text-sm font-normal text-muted-foreground">人</span></span>
                    </div>
                </CardContent>
            </Card>

            {displayData ? (
                <>
                    {/* Parameter summary (read-only) */}
                    <Card className="gap-2 py-4 rounded-2xl border-border bg-card/50 shadow-sm">
                        <CardHeader className="border-b border-border px-4 pb-3 pt-0 [.border-b]:pb-3">
                            <CardTitle className="flex items-center gap-2 text-base text-foreground">
                                <ClipboardList className="w-4 h-4 shrink-0 text-muted-foreground" />
                                参数摘要
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="px-4 pb-2 pt-3" data-testid="student-sample-plan-summary">
                            <div className="grid grid-cols-1 gap-x-6 gap-y-0 sm:grid-cols-2">
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
                                        value={String(displayData.populationVariance)}
                                    />
                                )}
                                <SummaryRow label="设计效应" value={displayData.designEffect.toFixed(1)} />
                                <SummaryRow label="无回答率" value={`${Math.round(displayData.nonResponseRate * 100)}%`} />
                            </div>
                            <div className="mt-2 grid grid-cols-1 gap-3 rounded-lg border border-border bg-background/50 px-3 py-2 sm:grid-cols-2">
                                <div>
                                    <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">建议样本量</p>
                                    <p className="text-base font-bold font-mono tabular-nums text-info">{displayData.recommendedSize.toLocaleString()}</p>
                                </div>
                                <div className="text-right">
                                    <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">最终设定</p>
                                    <p className="text-lg font-bold font-mono tabular-nums text-primary">{displayData.finalSampleSize.toLocaleString()}</p>
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
                            className="border-primary text-primary hover:bg-primary/10"
                        >
                            <Sparkles className="w-4 h-4 mr-1.5" />
                            {wizardDraft ? "继续规划样本量" : "重新规划样本量"}
                        </Button>
                    </div>

                    {!isValidFinalSize && (
                        <div className="flex items-center gap-2 rounded-xl border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                            <Info className="h-4 w-4 shrink-0" />
                            最终样本量需在 {minSampleSize}～{maxSampleSize.toLocaleString()} 人之间，请重新规划样本量。
                        </div>
                    )}
                </>
            ) : (
                /* First visit — prompt to start sample planning */
                <Card className="gap-2 py-8 rounded-2xl border-primary/20 bg-primary/5 shadow-sm">
                    <CardContent className="flex flex-col items-center text-center space-y-4 px-6">
                        <div className="w-14 h-14 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center">
                            <Sparkles className="w-7 h-7 text-primary" />
                        </div>
                        <div className="space-y-1">
                            <h3 className="text-lg font-semibold text-foreground">开始样本量规划</h3>
                            <p className="text-sm text-muted-foreground max-w-sm">
                                通过分步引导，逐步理解样本量计算原理并确定最终样本量。
                            </p>
                        </div>
                        <Button
                            ref={planningTriggerRef}
                            type="button"
                            onClick={() => setImmersiveOpen(true)}
                            disabled={!targetVarianceReady}
                            data-testid="student-sample-plan-start"
                            className="bg-primary hover:bg-primary/90 text-primary-foreground px-8 shadow-lg shadow-primary/20"
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
            <div className="flex justify-between items-center gap-3 pt-6 border-t border-border/50">
                <Button
                    variant="outline"
                    onClick={onPrev}
                    data-testid="student-sample-plan-prev"
                    className="border-input bg-muted text-foreground/90 hover:bg-muted hover:text-foreground"
                >
                    <ChevronLeft className="w-4 h-4 mr-1" />
                    上一阶段
                </Button>
                {displayData && (
                    <Button
                        type="button"
                        onClick={handleConfirmNext}
                        disabled={!isValidFinalSize || confirmNextSaving || launching}
                        data-testid="student-sample-plan-next"
                        className="bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/20 disabled:opacity-40 disabled:shadow-none"
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
        <div className="flex justify-between gap-2 border-b border-border/50 py-1.5 text-sm">
            <span className="text-muted-foreground">{label}</span>
            <span className="font-mono text-foreground tabular-nums">{value}</span>
        </div>
    );
}

export default SamplePlanning;
