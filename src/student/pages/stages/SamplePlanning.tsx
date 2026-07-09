import { useState, useCallback, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
    AlertDialog,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Users, ClipboardList, Sparkles, ChevronLeft, ChevronRight, Info, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useExperiment } from "../ExperimentLayout";
import type { SamplePlanData } from "../../api-client";
import {
    formatMarginOfError,
    getEstimationTypeLabel,
    getMarginOfErrorLabel,
    normalizeSamplePlanData,
} from "../../experiment/sample-plan-display";
import { ImmersiveSamplePlanning } from "../../components/immersive-sample-planning";
import {
    getFinalSampleSizeBounds,
    type SampleParams,
} from "../../components/immersive-sample-planning/types";

interface SamplePlanningProps {
    onPrev: () => void;
}

export function SamplePlanning({ onPrev }: SamplePlanningProps) {
    const { populationSize, experiment, registerStageSave, saveExperiment } = useExperiment();

    const N = populationSize;
    const initialData = useMemo(
        () => normalizeSamplePlanData(experiment?.samplePlan, N),
        [experiment?.samplePlan, N],
    );

    const [confirmNextOpen, setConfirmNextOpen] = useState(false);
    const [confirmNextSaving, setConfirmNextSaving] = useState(false);

    // Display state — updated from planning flow completion or loaded from saved data
    const [displayData, setDisplayData] = useState<SamplePlanData | null>(initialData);

    // Auto-open planning overlay on first visit (no saved data)
    const [immersiveOpen, setImmersiveOpen] = useState(!initialData);

    const handleImmersiveComplete = useCallback((result: SampleParams) => {
        setDisplayData({
            estimationType: result.estimationType,
            confidenceLevel: result.confidenceLevel,
            marginOfError: result.marginOfError,
            ...(result.estimationType === "mean" && result.populationVariance != null
                ? { populationVariance: result.populationVariance }
                : {}),
            designEffect: result.designEffect,
            nonResponseRate: result.nonResponseRate,
            recommendedSize: result.recommendedSize,
            finalSampleSize: result.finalSampleSize,
        });
        setImmersiveOpen(false);
    }, []);

    // Register stage save handler (saves current display data if present)
    const saveSamplePlan = useCallback(async () => {
        if (!displayData) return true;
        return saveExperiment({ samplePlan: displayData });
    }, [displayData, saveExperiment]);

    useEffect(() => {
        registerStageSave(saveSamplePlan);
        return () => registerStageSave(null);
    }, [registerStageSave, saveSamplePlan]);

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

    const handleConfirmNext = async () => {
        if (!displayData || experiment == null) {
            toast.error("实验数据未就绪，请稍后重试");
            return;
        }
        setConfirmNextSaving(true);
        try {
            const ok = await saveExperiment({ samplePlan: displayData, currentStage: 3 });
            if (ok) {
                try {
                    sessionStorage.setItem(`wj-sampling-intro-${experiment.id}`, "1");
                } catch {
                    /* 隐私模式等可能导致不可用，不阻断进入下一阶段 */
                }
                setConfirmNextOpen(false);
            } else {
                toast.error("保存失败，请重试");
            }
        } finally {
            setConfirmNextSaving(false);
        }
    };

    const handleConfirmNextDialogOpenChange = (open: boolean) => {
        if (!open && confirmNextSaving) return;
        setConfirmNextOpen(open);
    };

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300" data-testid="student-stage-sample-plan">
            {immersiveOpen && (
                <ImmersiveSamplePlanning
                    populationSize={N}
                    initialConfidenceLevel={displayData?.confidenceLevel}
                    initialMarginOfError={displayData?.marginOfError}
                    initialDesignEffect={displayData?.designEffect}
                    initialNonResponseRate={displayData?.nonResponseRate}
                    initialFinalSampleSize={displayData?.finalSampleSize}
                    initialEstimationType={displayData?.estimationType ?? "proportion"}
                    initialPopulationVariance={displayData?.populationVariance ?? 100}
                    initialAdvancedPlanSource={displayData?.advancedPlanSource ?? null}
                    onComplete={handleImmersiveComplete}
                    onClose={() => setImmersiveOpen(false)}
                    saveExperiment={saveExperiment}
                />
            )}

            {/* Population info */}
            <Card className="gap-2 py-4 rounded-2xl border-border bg-card/50 shadow-sm">
                <CardHeader className="border-b border-border px-4 pb-3 pt-0 [.border-b]:pb-3">
                    <CardTitle className="flex items-center gap-2 text-base text-foreground">
                        <Users className="w-4 h-4 shrink-0 text-primary" />
                        总体信息
                    </CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-1 pt-3">
                    <div className="flex items-center justify-between rounded-xl border border-border bg-background/50 px-3 py-2.5 dark:border-border dark:bg-background/50">
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
                            <div className="mt-2 grid grid-cols-2 gap-3 rounded-lg border border-border bg-background/50 px-3 py-2 dark:border-border dark:bg-background/50">
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
                            type="button"
                            variant="outline"
                            onClick={() => setImmersiveOpen(true)}
                            className="border-primary text-primary hover:bg-primary/10"
                        >
                            <Sparkles className="w-4 h-4 mr-1.5" />
                            重新规划样本量
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
                <Card className="gap-2 py-8 rounded-2xl border-primary/20 bg-primary/5 shadow-sm dark:bg-primary/5">
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
                            type="button"
                            onClick={() => setImmersiveOpen(true)}
                            data-testid="student-sample-plan-start"
                            className="bg-primary hover:bg-primary text-primary-foreground px-8 shadow-lg shadow-primary/20"
                        >
                            <Sparkles className="w-4 h-4 mr-1.5" />
                            开始规划样本量
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
                        onClick={() => setConfirmNextOpen(true)}
                        disabled={!isValidFinalSize}
                        data-testid="student-sample-plan-next"
                        className="bg-primary hover:bg-primary text-primary-foreground shadow-lg shadow-primary/20 disabled:opacity-40 disabled:shadow-none"
                    >
                        确认并进入下一阶段
                        <ChevronRight className="w-4 h-4 ml-1" />
                    </Button>
                )}
            </div>

            <AlertDialog open={confirmNextOpen} onOpenChange={handleConfirmNextDialogOpenChange}>
                <AlertDialogContent className="bg-card border-border">
                    <AlertDialogHeader>
                        <AlertDialogTitle>进入抽样执行？</AlertDialogTitle>
                        <AlertDialogDescription className="text-muted-foreground">
                            将保存当前样本量规划并进入「抽样执行」阶段。若之后返回修改本阶段，后续阶段已填数据可能被清空。
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel type="button" disabled={confirmNextSaving}>
                            取消
                        </AlertDialogCancel>
                        <Button
                            type="button"
                            onClick={() => void handleConfirmNext()}
                            disabled={confirmNextSaving}
                            className="bg-primary hover:bg-primary text-primary-foreground"
                        >
                            {confirmNextSaving ? (
                                <>
                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                    保存中…
                                </>
                            ) : (
                                "确认进入"
                            )}
                        </Button>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}

// --- Sub-components ---

function SummaryRow({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex justify-between gap-2 border-b border-border/50 py-1.5 text-sm dark:border-border/50">
            <span className="text-muted-foreground">{label}</span>
            <span className="font-mono text-foreground tabular-nums">{value}</span>
        </div>
    );
}

export default SamplePlanning;
