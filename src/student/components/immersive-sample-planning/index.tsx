import { useState, useCallback, useEffect, useMemo, useRef, useId } from "react";
import { X, ChevronLeft, ChevronRight, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { calculateFinitePopulationSampleSize, calculateMeanEstimationSampleSize } from "../../experiment/sample-plan";
import type { ConfidenceLevel } from "../../experiment/confidence-level";
import { normalizeConfidenceLevel } from "../../experiment/confidence-level";
import { formatMarginOfError } from "../../experiment/sample-plan-display";
import type { SamplePlanData } from "../../api-client";
import type { AdvancedNonStandardSampleSource } from "../sample-planning/advancedTabs";
import type { Domain } from "../DomainEstimationManager";
import type { SurveyVariable } from "../MultiVariableSamplePlan";
import { ImmersiveExperimentLaunch } from "../ImmersiveExperimentLaunch";
import { usePhaseState } from "./usePhaseState";
import { PHASE_ORDER, type EstimationType, type SampleParams } from "./types";
import { ChallengePhase } from "./phases/ChallengePhase";
import { PrecisionPhase } from "./phases/PrecisionPhase";
import { FactorsPhase } from "./phases/FactorsPhase";
import { FormulaPhase } from "./phases/FormulaPhase";
import { FPCPhase } from "./phases/FPCPhase";
import { FourStepPhase } from "./phases/FourStepPhase";
import { DecisionPhase } from "./phases/DecisionPhase";
import { QuizPhase } from "./phases/QuizPhase";

const FOCUSABLE_SELECTOR =
    'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

/** Phases shown as dots in the header — excludes internal/terminal phases. */
const NAVIGABLE_PHASES = PHASE_ORDER.filter(
    (t) => t !== "confirm" && t !== "launching" && t !== "done",
);

const PHASE_LABELS: Record<string, string> = {
    challenge: "开始规划",
    precision: "认识精度",
    factors: "判断条件",
    formula: "进入公式",
    fpc: "总体修正",
    fourstep: "汇总 n",
    decision: "确认方案",
    quiz: "快速自检",
    confirm: "确认保存",
    launching: "进入抽样",
    done: "完成",
};

interface Props {
    populationSize: number;
    initialConfidenceLevel?: string;
    initialMarginOfError?: number;
    initialDesignEffect?: number;
    initialNonResponseRate?: number;
    initialFinalSampleSize?: number;
    initialEstimationType?: EstimationType;
    initialPopulationVariance?: number;
    initialAdvancedPlanSource?: AdvancedNonStandardSampleSource | null;
    onComplete: (params: SampleParams) => void;
    onClose: () => void;
    /** When provided, 「确认并保存」只写入 samplePlan 并关闭浮层，不进入抽样执行开场动画。未提供时（独立预览）仍会走启动动画。 */
    saveExperiment?: (data: { samplePlan: SamplePlanData }) => Promise<boolean>;
    /** Called after the launch animation completes (phase reaches "done"). */
    onLaunchComplete?: () => void;
}

export function ImmersiveSamplePlanning({
    populationSize,
    initialConfidenceLevel = "95",
    initialMarginOfError = 5,
    initialDesignEffect = 1,
    initialNonResponseRate = 0,
    initialFinalSampleSize,
    initialEstimationType = "proportion",
    initialPopulationVariance = 100,
    initialAdvancedPlanSource = null,
    onComplete,
    onClose,
    saveExperiment,
    onLaunchComplete,
}: Props) {
    // --- Parameter state (shared across all phases) ---
    const [confidenceLevel, setConfidenceLevel] = useState<ConfidenceLevel>(() =>
        normalizeConfidenceLevel(initialConfidenceLevel ?? "95"),
    );
    const [marginOfError, setMarginOfError] = useState(initialMarginOfError);
    const [designEffect, setDesignEffect] = useState(initialDesignEffect);
    const [nonResponseRate, setNonResponseRate] = useState(initialNonResponseRate);
    const [estimationType, setEstimationType] = useState<EstimationType>(initialEstimationType);
    const [populationVariance, setPopulationVariance] = useState(initialPopulationVariance);

    const [advancedPlanSource, setAdvancedPlanSource] = useState<AdvancedNonStandardSampleSource | null>(initialAdvancedPlanSource);

    const clearAdvancedPlanSource = useCallback(() => {
        setAdvancedPlanSource(null);
    }, []);

    const handleEstimationTypeChange = useCallback((next: EstimationType) => {
        setEstimationType((prev) => {
            if (prev === next) return prev;
            clearAdvancedPlanSource();
            setMarginOfError(next === "proportion" ? 5 : 2);
            return next;
        });
    }, [clearAdvancedPlanSource]);

    const recommendedSize = useMemo(() => {
        if (estimationType === "mean") {
            return calculateMeanEstimationSampleSize({
                confidenceLevel,
                marginOfError,
                populationSize,
                populationVariance,
                designEffect,
                nonResponseRate,
            }) ?? Math.min(30, populationSize);
        }
        return calculateFinitePopulationSampleSize({
            confidenceLevel,
            marginOfError,
            populationSize,
            designEffect,
            nonResponseRate,
        }) ?? Math.min(30, populationSize);
    }, [estimationType, confidenceLevel, marginOfError, populationSize, populationVariance, designEffect, nonResponseRate]);

    const [finalSampleSize, setFinalSampleSize] = useState(initialFinalSampleSize ?? recommendedSize);

    // Keep final in sync with recommended when user hasn't touched it yet
    const userTouchedFinal = useRef(initialFinalSampleSize != null);
    useEffect(() => {
        if (!userTouchedFinal.current) {
            setFinalSampleSize(recommendedSize);
        }
    }, [recommendedSize]);

    const params: SampleParams = {
        populationSize,
        estimationType,
        confidenceLevel,
        marginOfError,
        populationVariance: estimationType === "mean" ? populationVariance : undefined,
        designEffect,
        nonResponseRate,
        finalSampleSize,
        recommendedSize,
    };

    const paramsRef = useRef(params);
    paramsRef.current = params;

    // --- Advanced tools state (session-only, not persisted to backend / SamplePlanData) ---
    const [domains, setDomains] = useState<Domain[]>([]);
    const [surveyVariables, setSurveyVariables] = useState<SurveyVariable[]>([]);

    /** Tracks when final sample size currently comes from a non-standard tool. */
    const handleAdvancedApplied = useCallback((source: AdvancedNonStandardSampleSource) => {
        setAdvancedPlanSource(source);
    }, []);

    // --- Phase navigation ---
    const { phase, setPhase, direction, progress, goNext, goPrev, jumpTo, skipQuiz } = usePhaseState();

    // --- Save & confirm ---
    const [saving, setSaving] = useState(false);
    const savingRef = useRef(false);

    const handleConfirm = useCallback(async () => {
        if (savingRef.current) return;
        if (!saveExperiment) {
            // Standalone / preview: no persistence — play launch animation then complete
            jumpTo("launching");
            return;
        }
        savingRef.current = true;
        setSaving(true);
        try {
            const success = await saveExperiment({
                samplePlan: {
                    ...(advancedPlanSource ? { advancedPlanSource } : {}),
                    estimationType,
                    confidenceLevel,
                    marginOfError,
                    ...(estimationType === "mean" ? { populationVariance } : {}),
                    designEffect,
                    nonResponseRate,
                    recommendedSize,
                    finalSampleSize,
                },
            });
            if (success) {
                // Persist-only flow: return to classic page without launch animation
                onComplete(paramsRef.current);
                onClose();
            } else {
                toast.error("保存失败，请重试");
            }
        } finally {
            savingRef.current = false;
            setSaving(false);
        }
    }, [saveExperiment, jumpTo, advancedPlanSource, estimationType, confidenceLevel, marginOfError, populationVariance, designEffect, nonResponseRate, recommendedSize, finalSampleSize, onComplete, onClose]);

    const handleLaunchComplete = useCallback(() => {
        jumpTo("done");
    }, [jumpTo]);

    const onCompleteRef = useRef(onComplete);
    onCompleteRef.current = onComplete;
    const onLaunchCompleteRef = useRef(onLaunchComplete);
    onLaunchCompleteRef.current = onLaunchComplete;

    const doneTriggered = useRef(false);
    useEffect(() => {
        if (phase.type === "done" && !doneTriggered.current) {
            doneTriggered.current = true;
            onCompleteRef.current(paramsRef.current);
            onLaunchCompleteRef.current?.();
        }
    }, [phase.type]);

    // --- Exit confirmation ---
    const [exitConfirmOpen, setExitConfirmOpen] = useState(false);

    const hasProgress = phase.type !== "challenge" || phase.guess !== null;

    const requestClose = useCallback(() => {
        if (hasProgress) {
            setExitConfirmOpen(true);
        } else {
            onClose();
        }
    }, [hasProgress, onClose]);

    const confirmExit = useCallback(() => {
        setExitConfirmOpen(false);
        onClose();
    }, [onClose]);

    // --- Focus management ---
    const overlayRef = useRef<HTMLDivElement>(null);
    const titleId = useId();

    const pageKey =
        phase.type === "formula" ? `formula-${phase.step}`
            : phase.type === "factors" ? `factors-${phase.step}`
                : phase.type === "fourstep" ? `fourstep-${phase.scenario}`
                    : phase.type === "quiz" ? `quiz-${phase.questionIndex}`
                        : phase.type;

    useEffect(() => {
        if (exitConfirmOpen) return;
        const root = overlayRef.current;
        if (!root) return;
        const t = window.setTimeout(() => {
            const focusables = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
            focusables[0]?.focus();
        }, 0);
        return () => window.clearTimeout(t);
    }, [pageKey, exitConfirmOpen]);

    // Escape key
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.key !== "Escape" || exitConfirmOpen || phase.type === "done" || phase.type === "launching") return;
            e.preventDefault();
            requestClose();
        };
        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
    }, [exitConfirmOpen, phase.type, requestClose]);

    // Prevent body scroll
    useEffect(() => {
        document.body.style.overflow = "hidden";
        return () => { document.body.style.overflow = ""; };
    }, []);

    // Focus trap
    const focusTrap = useCallback(
        (e: React.KeyboardEvent) => {
            if (exitConfirmOpen || e.key !== "Tab" || !overlayRef.current) return;
            const root = overlayRef.current;
            const focusables = Array.from(
                root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
            ).filter((el) => el.offsetParent !== null);
            if (focusables.length === 0) return;
            const first = focusables[0]!;
            const last = focusables[focusables.length - 1]!;
            if (e.shiftKey) {
                if (document.activeElement === first) { e.preventDefault(); last.focus(); }
            } else if (document.activeElement === last) { e.preventDefault(); first.focus(); }
        },
        [exitConfirmOpen],
    );

    // --- Animation ---
    const animationClass = direction === "forward"
        ? "animate-in fade-in slide-in-from-right-4 duration-300"
        : "animate-in fade-in slide-in-from-left-4 duration-300";

    // --- Can navigate? ---
    const canGoNext =
        phase.type === "challenge" ? phase.revealed
            : phase.type === "confirm" || phase.type === "launching" || phase.type === "done" ? false
                : true;

    const canGoPrev =
        phase.type !== "challenge"
        && phase.type !== "confirm"
        && phase.type !== "launching"
        && phase.type !== "done";

    const showNav = canGoNext || canGoPrev;

    // --- Standard-flow setters: changing params clears any advanced source tag ---
    const handleConfidenceLevelChange = useCallback((v: string) => {
        clearAdvancedPlanSource();
        setConfidenceLevel(normalizeConfidenceLevel(v));
    }, [clearAdvancedPlanSource]);

    const handleMarginOfErrorChange = useCallback((v: number) => {
        clearAdvancedPlanSource();
        setMarginOfError(v);
    }, [clearAdvancedPlanSource]);

    const handleDesignEffectChange = useCallback((v: number) => {
        clearAdvancedPlanSource();
        setDesignEffect(v);
    }, [clearAdvancedPlanSource]);

    const handleNonResponseRateChange = useCallback((v: number) => {
        clearAdvancedPlanSource();
        setNonResponseRate(v);
    }, [clearAdvancedPlanSource]);

    const handlePopulationVarianceChange = useCallback((v: number) => {
        clearAdvancedPlanSource();
        setPopulationVariance(v);
    }, [clearAdvancedPlanSource]);

    // --- Handle setting final size (marks user-touched) ---
    const handleSetFinalSize = useCallback((v: number) => {
        userTouchedFinal.current = true;
        setFinalSampleSize(v);
    }, []);

    const resetFinalSize = useCallback(() => {
        clearAdvancedPlanSource();
        userTouchedFinal.current = false;
        setFinalSampleSize(recommendedSize);
    }, [clearAdvancedPlanSource, recommendedSize]);

    // --- Render current phase ---
    const renderPhase = () => {
        switch (phase.type) {
            case "challenge":
                return (
                    <ChallengePhase
                        populationSize={populationSize}
                        estimationType={estimationType}
                        confidenceLevel={confidenceLevel}
                        marginOfError={marginOfError}
                        recommendedSize={recommendedSize}
                        guess={phase.guess}
                        revealed={phase.revealed}
                        onCommitGuess={(g: number) =>
                            setPhase((prev) =>
                                prev.type === "challenge" ? { ...prev, guess: g, revealed: true } : prev)}
                        onNext={goNext}
                    />
                );
            case "precision":
                return (
                    <PrecisionPhase
                        params={params}
                        onNext={goNext}
                    />
                );
            case "factors":
                return (
                    <FactorsPhase
                        step={phase.step}
                        params={params}
                        onNext={goNext}
                    />
                );
            case "formula":
                return (
                    <FormulaPhase
                        step={phase.step}
                        params={params}
                        estimationType={estimationType}
                        populationVariance={populationVariance}
                        onEstimationTypeChange={handleEstimationTypeChange}
                        onPopulationVarianceChange={handlePopulationVarianceChange}
                        onConfidenceLevelChange={handleConfidenceLevelChange}
                        onMarginOfErrorChange={handleMarginOfErrorChange}
                        onNext={goNext}
                    />
                );
            case "fpc":
                return (
                    <FPCPhase params={params} onNext={goNext} />
                );
            case "fourstep":
                return (
                    <FourStepPhase
                        scenario={phase.scenario}
                        params={params}
                        estimationType={estimationType}
                        populationVariance={populationVariance}
                        onDesignEffectChange={handleDesignEffectChange}
                        onNonResponseRateChange={handleNonResponseRateChange}
                        onNext={goNext}
                    />
                );
            case "decision":
                return (
                    <DecisionPhase
                        params={params}
                        onConfidenceLevelChange={handleConfidenceLevelChange}
                        onMarginOfErrorChange={handleMarginOfErrorChange}
                        onDesignEffectChange={handleDesignEffectChange}
                        onNonResponseRateChange={handleNonResponseRateChange}
                        onFinalSizeChange={handleSetFinalSize}
                        onResetFinalSize={resetFinalSize}
                        onNext={goNext}
                        domains={domains}
                        onDomainsChange={setDomains}
                        surveyVariables={surveyVariables}
                        onSurveyVariablesChange={setSurveyVariables}
                        advancedPlanSource={advancedPlanSource}
                        onAdvancedApplied={handleAdvancedApplied}
                        onClearAdvancedSource={clearAdvancedPlanSource}
                    />
                );
            case "quiz":
                return (
                    <QuizPhase
                        questionIndex={phase.questionIndex}
                        onNext={goNext}
                        onSkip={skipQuiz}
                    />
                );
            case "confirm":
                return (
                    <div className="space-y-8">
                        <div className="text-center space-y-3">
                            <div className="mx-auto w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                                <CheckCircle2 className="w-8 h-8 text-emerald-600 dark:text-emerald-400" />
                            </div>
                            <h2 className="text-2xl font-bold text-gray-900 dark:text-slate-100">确认样本量规划</h2>
                            <p className="text-gray-500 dark:text-slate-400">
                                请确认以下核心参数。保存后，这里的最终样本量会写入实验，并直接用于后续抽样执行与分析报告；之后仍可返回修改。
                            </p>
                        </div>

                        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-sm space-y-5">
                            <div className="text-center">
                                <p className="text-xs font-medium uppercase tracking-wider text-slate-400 mb-1">最终样本量</p>
                                <div className="text-5xl font-black tabular-nums text-indigo-500">
                                    {finalSampleSize.toLocaleString()}
                                </div>
                                <p className="text-sm text-slate-400 mt-1">建议值 {recommendedSize.toLocaleString()}</p>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <ParamSummaryItem label="估计类型" value={estimationType === "proportion" ? "比例" : "均值"} />
                                <ParamSummaryItem label="置信水平" value={`${confidenceLevel}%`} />
                                <ParamSummaryItem
                                    label={estimationType === "mean" ? "绝对误差限" : "允许误差"}
                                    value={formatMarginOfError(marginOfError, estimationType)}
                                />
                                <ParamSummaryItem label="设计效应" value={designEffect.toFixed(1)} />
                                <ParamSummaryItem label="无回答率" value={`${Math.round(nonResponseRate * 100)}%`} />
                                {estimationType === "mean" && (
                                    <ParamSummaryItem label="总体方差" value={populationVariance.toString()} />
                                )}
                            </div>
                        </div>

                        <div className="flex justify-center gap-3">
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => jumpTo("decision")}
                                className="border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300"
                            >
                                <ChevronLeft className="w-4 h-4 mr-1" />
                                返回修改
                            </Button>
                            <Button
                                type="button"
                                onClick={handleConfirm}
                                disabled={saving}
                                data-testid="immersive-sp-confirm"
                                className="bg-indigo-600 hover:bg-indigo-700 text-white px-8 py-5 rounded-xl shadow-lg shadow-indigo-500/20 disabled:opacity-60"
                            >
                                {saving ? "保存中..." : "确认并保存"}
                                {!saving && <ChevronRight className="w-5 h-5 ml-2" />}
                            </Button>
                        </div>
                    </div>
                );
            case "launching":
            case "done":
                return null;
        }
    };

    // --- Early returns for terminal phases ---

    if (phase.type === "done") return null;

    if (phase.type === "launching") {
        return (
            <ImmersiveExperimentLaunch
                populationSize={populationSize}
                sampleSize={finalSampleSize}
                estimationType={estimationType}
                confidenceLevel={confidenceLevel}
                marginOfError={marginOfError}
                onComplete={handleLaunchComplete}
                onClose={handleLaunchComplete}
            />
        );
    }

    return (
        <>
            <div
                ref={overlayRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                data-testid="immersive-sample-planning"
                className="fixed inset-0 z-50 bg-gradient-to-br from-slate-50 dark:from-slate-950 via-white dark:via-slate-900 to-indigo-50/40 dark:to-indigo-950/40 outline-none"
                onKeyDown={focusTrap}
                tabIndex={-1}
            >
                {/* Progress bar */}
                <div className="absolute top-0 left-0 right-0 h-1 bg-gray-100 dark:bg-slate-800 z-10">
                    <div
                        className="h-full bg-indigo-500 transition-all duration-500 ease-out"
                        style={{ width: `${progress}%` }}
                    />
                </div>

                {/* Header */}
                <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-4 sm:px-6 pt-4 z-10">
                    <div className="flex items-center gap-3">
                        <span className="text-sm font-medium text-gray-400 dark:text-slate-500">
                            {PHASE_LABELS[phase.type] ?? ""}
                        </span>
                        {/* Phase dots */}
                        <div className="hidden sm:flex gap-1.5">
                            {NAVIGABLE_PHASES.map((t) => (
                                <div
                                    key={t}
                                    className={`h-1.5 rounded-full transition-all ${
                                        t === phase.type
                                            ? "bg-indigo-500 w-5"
                                            : PHASE_ORDER.indexOf(t) < PHASE_ORDER.indexOf(phase.type)
                                                ? "bg-indigo-300 dark:bg-indigo-600 w-1.5"
                                                : "bg-gray-200 dark:bg-slate-600 w-1.5"
                                    }`}
                                />
                            ))}
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={requestClose}
                        className="w-10 h-10 rounded-full flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors"
                        aria-label="关闭"
                        data-testid="immersive-sp-close"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Content */}
                <div className="h-full flex flex-col items-center justify-center overflow-y-auto px-4 sm:px-6 pt-16 pb-24">
                    <div key={pageKey} className={`w-full max-w-2xl ${animationClass}`}>
                        <h1 id={titleId} className="sr-only">样本量规划</h1>
                        {renderPhase()}
                    </div>
                </div>

                {/* Bottom bar */}
                {canGoPrev && (
                    <div className="fixed bottom-0 left-0 right-0 z-10 flex items-center justify-start px-4 sm:px-6 pb-4 pt-2 bg-gradient-to-t from-white dark:from-slate-950 via-white/80 dark:via-slate-950/80 to-transparent">
                        <Button
                            type="button"
                            variant="ghost"
                            onClick={goPrev}
                            className="text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                        >
                            <ChevronLeft className="w-4 h-4 mr-1" />
                            上一步
                        </Button>
                    </div>
                )}

                {/* Side navigation arrows on desktop */}
                {showNav && canGoPrev && (
                    <button
                        type="button"
                        onClick={goPrev}
                        className="hidden lg:flex fixed top-1/2 -translate-y-1/2 left-4 z-10 w-11 h-11 rounded-full border border-gray-200 dark:border-slate-700 bg-white/90 dark:bg-slate-900/90 backdrop-blur-sm shadow-sm items-center justify-center text-gray-500 hover:text-gray-800 dark:hover:text-slate-200 hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors"
                        aria-label="上一步"
                    >
                        <ChevronLeft className="w-5 h-5" />
                    </button>
                )}
                {showNav && canGoNext && (
                    <button
                        type="button"
                        onClick={goNext}
                        data-testid="immersive-sp-next"
                        className="hidden lg:flex fixed top-1/2 -translate-y-1/2 right-4 z-10 w-11 h-11 rounded-full bg-indigo-600 shadow-lg shadow-indigo-500/20 items-center justify-center text-white hover:bg-indigo-700 transition-colors"
                        aria-label="下一步"
                    >
                        <ChevronRight className="w-5 h-5" />
                    </button>
                )}
            </div>

            <AlertDialog open={exitConfirmOpen} onOpenChange={setExitConfirmOpen}>
                <AlertDialogContent className="z-[60]">
                    <AlertDialogHeader>
                        <AlertDialogTitle>退出样本量规划？</AlertDialogTitle>
                        <AlertDialogDescription>
                            当前进度将不会保存。你可以稍后重新规划样本量。
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel type="button">取消</AlertDialogCancel>
                        <AlertDialogAction type="button" onClick={confirmExit} className="bg-rose-600 hover:bg-rose-700">
                            确定退出
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}

// --- Sub-components ---

function ParamSummaryItem({ label, value }: { label: string; value: string }) {
    return (
        <div className="rounded-lg bg-slate-50 dark:bg-slate-800 px-3 py-2.5">
            <p className="text-[10px] font-medium uppercase tracking-wider text-slate-400">{label}</p>
            <p className="text-sm font-bold tabular-nums text-slate-700 dark:text-slate-200 mt-0.5">{value}</p>
        </div>
    );
}
