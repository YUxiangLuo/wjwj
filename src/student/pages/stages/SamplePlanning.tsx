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
import { ImmersiveSamplePlanning } from "../../components/immersive-sample-planning";
import {
    getFinalSampleSizeBounds,
    isSmallPopulationSampleBounds,
    type SampleParams,
} from "../../components/immersive-sample-planning/types";

interface SamplePlanningProps {
    onPrev: () => void;
}

export function SamplePlanning({ onPrev }: SamplePlanningProps) {
    const { populationSize, experiment, registerStageSave, saveExperiment } = useExperiment();

    const initialData = experiment?.samplePlan as SamplePlanData | null;
    const N = populationSize;

    const [confirmNextOpen, setConfirmNextOpen] = useState(false);
    const [confirmNextSaving, setConfirmNextSaving] = useState(false);

    // Display state — updated from planning flow completion or loaded from saved data
    const [displayData, setDisplayData] = useState<SamplePlanData | null>(initialData);

    // Auto-open planning overlay on first visit (no saved data)
    const [immersiveOpen, setImmersiveOpen] = useState(!initialData);

    const handleImmersiveComplete = useCallback((result: SampleParams) => {
        setDisplayData({
            confidenceLevel: result.confidenceLevel,
            marginOfError: result.marginOfError,
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

    const { min: minSampleSize, max: maxSampleSize } = useMemo(
        () => getFinalSampleSizeBounds(N),
        [N],
    );
    const showSmallPopulationHint = isSmallPopulationSampleBounds(N);
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
                    onComplete={handleImmersiveComplete}
                    onClose={() => setImmersiveOpen(false)}
                    saveExperiment={saveExperiment}
                />
            )}

            {/* Population info */}
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

            {displayData ? (
                <>
                    {/* Parameter summary (read-only) */}
                    <Card className="gap-2 py-4 rounded-2xl border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 shadow-sm">
                        <CardHeader className="border-b border-slate-200 dark:border-slate-800 px-4 pb-3 pt-0 [.border-b]:pb-3">
                            <CardTitle className="flex items-center gap-2 text-base text-slate-900 dark:text-slate-100">
                                <ClipboardList className="w-4 h-4 shrink-0 text-slate-500" />
                                参数摘要
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="px-4 pb-2 pt-3" data-testid="student-sample-plan-summary">
                            <div className="grid grid-cols-1 gap-x-6 gap-y-0 sm:grid-cols-2">
                                <SummaryRow label="置信水平" value={`${displayData.confidenceLevel}%`} />
                                <SummaryRow label="允许误差" value={`±${displayData.marginOfError}%`} />
                                <SummaryRow label="设计效应" value={displayData.designEffect.toFixed(1)} />
                                <SummaryRow label="无回答率" value={`${Math.round(displayData.nonResponseRate * 100)}%`} />
                            </div>
                            <div className="mt-2 grid grid-cols-2 gap-3 rounded-lg border border-slate-200 bg-white/50 px-3 py-2 dark:border-slate-800 dark:bg-slate-950/50">
                                <div>
                                    <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">建议样本量</p>
                                    <p className="text-base font-bold font-mono tabular-nums text-teal-600 dark:text-teal-400">{displayData.recommendedSize.toLocaleString()}</p>
                                </div>
                                <div className="text-right">
                                    <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">最终设定</p>
                                    <p className="text-lg font-bold font-mono tabular-nums text-indigo-500">{displayData.finalSampleSize.toLocaleString()}</p>
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
                            className="border-indigo-300 dark:border-indigo-700 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/30"
                        >
                            <Sparkles className="w-4 h-4 mr-1.5" />
                            重新规划样本量
                        </Button>
                    </div>

                    {showSmallPopulationHint && (
                        <p className="text-center text-xs text-amber-700/95 dark:text-amber-300/90 px-1">
                            总体规模较小时，最终样本量合法区间已随 ⌊N/2⌋ 收紧。
                        </p>
                    )}
                    {!isValidFinalSize && (
                        <div className="flex items-center gap-2 rounded-xl border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-sm text-rose-600 dark:text-rose-400">
                            <Info className="h-4 w-4 shrink-0" />
                            最终样本量需在 {minSampleSize}～{maxSampleSize.toLocaleString()} 人之间，请重新规划样本量。
                        </div>
                    )}
                </>
            ) : (
                /* First visit — prompt to start sample planning */
                <Card className="gap-2 py-8 rounded-2xl border-indigo-200 dark:border-indigo-800 bg-indigo-50/50 dark:bg-indigo-950/20 shadow-sm">
                    <CardContent className="flex flex-col items-center text-center space-y-4 px-6">
                        <div className="w-14 h-14 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center">
                            <Sparkles className="w-7 h-7 text-indigo-600 dark:text-indigo-400" />
                        </div>
                        <div className="space-y-1">
                            <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">开始样本量规划</h3>
                            <p className="text-sm text-slate-500 dark:text-slate-400 max-w-sm">
                                通过分步引导，逐步理解样本量计算原理并确定最终样本量。
                            </p>
                        </div>
                        <Button
                            type="button"
                            onClick={() => setImmersiveOpen(true)}
                            data-testid="student-sample-plan-start"
                            className="bg-indigo-600 hover:bg-indigo-700 text-white px-8 shadow-lg shadow-indigo-500/20"
                        >
                            <Sparkles className="w-4 h-4 mr-1.5" />
                            开始规划样本量
                        </Button>
                    </CardContent>
                </Card>
            )}

            {/* Bottom navigation */}
            <div className="flex justify-between items-center gap-3 pt-6 border-t border-slate-200/50 dark:border-slate-800/50">
                <Button
                    variant="outline"
                    onClick={onPrev}
                    data-testid="student-sample-plan-prev"
                    className="border-slate-300 dark:border-slate-700 bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-700 hover:text-slate-900 dark:hover:text-slate-100"
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
                        className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg shadow-indigo-500/20 disabled:opacity-40 disabled:shadow-none"
                    >
                        确认并进入下一阶段
                        <ChevronRight className="w-4 h-4 ml-1" />
                    </Button>
                )}
            </div>

            <AlertDialog open={confirmNextOpen} onOpenChange={handleConfirmNextDialogOpenChange}>
                <AlertDialogContent className="bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800">
                    <AlertDialogHeader>
                        <AlertDialogTitle>进入抽样执行？</AlertDialogTitle>
                        <AlertDialogDescription className="text-slate-600 dark:text-slate-300">
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
                            className="bg-indigo-600 hover:bg-indigo-700 text-white"
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
        <div className="flex justify-between gap-2 border-b border-slate-200/50 py-1.5 text-sm dark:border-slate-800/50">
            <span className="text-slate-500">{label}</span>
            <span className="font-mono text-slate-800 dark:text-slate-200 tabular-nums">{value}</span>
        </div>
    );
}

export default SamplePlanning;
