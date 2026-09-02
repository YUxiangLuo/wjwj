import { useState, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useId } from "react";
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
import { calculateFinitePopulationSampleSize, calculateMeanEstimationSampleSize } from "../../experiment/sample-plan";
import type { ConfidenceLevel } from "../../experiment/confidence-level";
import { normalizeConfidenceLevel } from "../../experiment/confidence-level";
import { formatMarginOfError, formatSamplePlanNumber } from "../../experiment/sample-plan-display";
import type { AdvancedNonStandardSampleSource } from "../sample-planning/advancedTabs";
import type { AdvancedPlanSnapshot } from "../../experiment/advanced-plan";
import type { Domain } from "../DomainEstimationManager";
import type { SurveyVariable } from "../MultiVariableSamplePlan";
import { ImmersiveExperimentLaunch } from "../ImmersiveExperimentLaunch";
import { usePhaseState } from "./usePhaseState";
import {
    PHASE_ORDER,
    type EstimationType,
    type SampleParams,
    type SamplePlanningWizardDraft,
} from "./types";
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
const NAVIGABLE_PHASES = ["challenge", "precision", "factors", "fourstep", "decision", "quiz"] as const;

const PHASE_LABELS: Record<string, string> = {
    challenge: "开始规划",
    precision: "认识精度",
    factors: "判断条件",
    formula: "进入公式",
    fpc: "总体修正",
    fourstep: "计算 n",
    decision: "确认方案",
    quiz: "快速自检",
    confirm: "确认方案",
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
    estimationLocked?: boolean;
    initialDraft?: SamplePlanningWizardDraft | null;
    onDraftChange?: (draft: SamplePlanningWizardDraft) => void;
    onComplete: (params: SampleParams) => void;
    onClose: () => void;
    /** Called after the launch animation completes (phase reaches "done"). */
    onLaunchComplete?: () => void;
}

export function ImmersiveSamplePlanning({
    populationSize,
    initialConfidenceLevel = "95",
    initialMarginOfError,
    initialDesignEffect = 1,
    initialNonResponseRate = 0,
    initialFinalSampleSize,
    initialEstimationType = "proportion",
    initialPopulationVariance = 100,
    initialAdvancedPlanSource = null,
    estimationLocked = false,
    initialDraft = null,
    onDraftChange,
    onComplete,
    onClose,
    onLaunchComplete,
}: Props) {
    // --- Parameter state (shared across all phases) ---
    const [confidenceLevel, setConfidenceLevel] = useState<ConfidenceLevel>(() =>
        initialDraft?.confidenceLevel ?? normalizeConfidenceLevel(initialConfidenceLevel ?? "95"),
    );
    const [marginOfError, setMarginOfError] = useState(
        initialDraft?.marginOfError ?? initialMarginOfError ?? (initialEstimationType === "mean" ? 2 : 5),
    );
    const [designEffect, setDesignEffect] = useState(initialDraft?.designEffect ?? initialDesignEffect);
    const [nonResponseRate, setNonResponseRate] = useState(initialDraft?.nonResponseRate ?? initialNonResponseRate);
    const [estimationType, setEstimationType] = useState<EstimationType>(
        estimationLocked ? initialEstimationType : initialDraft?.estimationType ?? initialEstimationType,
    );
    const [populationVariance, setPopulationVariance] = useState(
        initialDraft?.populationVariance ?? initialPopulationVariance,
    );

    const [advancedPlanSource, setAdvancedPlanSource] = useState<AdvancedNonStandardSampleSource | null>(
        initialDraft?.advancedPlanSource ?? initialAdvancedPlanSource,
    );

    // 高级规划快照：每类保留最新一份，随草稿持久化，提交时服务端复算。
    const [advancedPlans, setAdvancedPlans] = useState<AdvancedPlanSnapshot[]>(
        () => initialDraft?.advancedPlans ?? [],
    );
    const handleAdvancedPlanSnapshot = useCallback((snapshot: AdvancedPlanSnapshot) => {
        setAdvancedPlans((previous) => [...previous.filter((plan) => plan.kind !== snapshot.kind), snapshot]);
    }, []);

    const clearAdvancedPlanSource = useCallback(() => {
        setAdvancedPlanSource(null);
    }, []);

    const handleEstimationTypeChange = useCallback((next: EstimationType) => {
        if (estimationLocked) return;
        setEstimationType((prev) => {
            if (prev === next) return prev;
            clearAdvancedPlanSource();
            setMarginOfError(next === "proportion" ? 5 : 2);
            return next;
        });
    }, [clearAdvancedPlanSource, estimationLocked]);

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

    const [finalSampleSize, setFinalSampleSize] = useState(
        initialDraft?.finalSampleSize ?? initialFinalSampleSize ?? recommendedSize,
    );

    // Keep final in sync with recommended when user hasn't touched it yet
    const [userTouchedFinal, setUserTouchedFinal] = useState(
        initialDraft?.userTouchedFinal ?? initialFinalSampleSize != null,
    );
    useEffect(() => {
        if (!userTouchedFinal) {
            setFinalSampleSize(recommendedSize);
        }
    }, [recommendedSize, userTouchedFinal]);

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
        ...(advancedPlanSource ? { advancedPlanSource } : {}),
        ...(advancedPlans.length > 0 ? { advancedPlans } : {}),
    };

    const paramsRef = useRef(params);
    paramsRef.current = params;

    // --- Advanced tools state (session-only, not persisted to backend / SamplePlanData) ---
    const [domains, setDomains] = useState<Domain[]>(() => initialDraft?.domains ?? []);
    const [surveyVariables, setSurveyVariables] = useState<SurveyVariable[]>(() => initialDraft?.surveyVariables ?? []);

    /** Tracks when final sample size currently comes from a non-standard tool. */
    const handleAdvancedApplied = useCallback((source: AdvancedNonStandardSampleSource) => {
        setAdvancedPlanSource(source);
    }, []);

    // --- Phase navigation ---
    const {
        phase,
        setPhase,
        direction,
        progress,
        navigationSnapshot,
        goNext,
        goPrev,
        jumpTo,
        skipQuiz,
    } = usePhaseState(initialDraft?.navigation);

    const onDraftChangeRef = useRef(onDraftChange);
    onDraftChangeRef.current = onDraftChange;
    useLayoutEffect(() => {
        if (phase.type === "done" || phase.type === "launching") return;
        onDraftChangeRef.current?.({
            navigation: navigationSnapshot,
            confidenceLevel,
            marginOfError,
            designEffect,
            nonResponseRate,
            estimationType,
            populationVariance,
            finalSampleSize,
            userTouchedFinal,
            advancedPlanSource,
            advancedPlans,
            domains,
            surveyVariables,
        });
    }, [
        advancedPlanSource,
        advancedPlans,
        confidenceLevel,
        designEffect,
        domains,
        estimationType,
        finalSampleSize,
        marginOfError,
        navigationSnapshot,
        nonResponseRate,
        phase.type,
        populationVariance,
        surveyVariables,
        userTouchedFinal,
    ]);

    // 确认规划结果仅完成规划并返回阶段页；进入抽样执行的启动动画由阶段页的
    // “确认并进入下一阶段”触发（见 SamplePlanning.tsx）。
    const handleConfirm = useCallback(() => jumpTo("done"), [jumpTo]);

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
        // 手动覆盖最终样本量即离开高级规划路径；高级工具应用时会在其后重新标记来源。
        clearAdvancedPlanSource();
        setUserTouchedFinal(true);
        setFinalSampleSize(v);
    }, [clearAdvancedPlanSource]);

    const resetFinalSize = useCallback(() => {
        clearAdvancedPlanSource();
        setUserTouchedFinal(false);
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
                        estimationLocked={estimationLocked}
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
                        onAdvancedPlanSnapshot={handleAdvancedPlanSnapshot}
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
                            <div className="mx-auto w-16 h-16 rounded-surface bg-success-muted border border-success-border flex items-center justify-center">
                                <CheckCircle2 className="w-8 h-8 text-success" />
                            </div>
                            <h2 className="text-page-title font-bold text-foreground">确认样本量规划</h2>
                            <p className="text-muted-foreground">
                                请确认以下核心参数。这里仅完成规划；返回阶段页并点击“确认并进入下一阶段”后才会保存。
                            </p>
                        </div>

                        <div className="rounded-surface border border-border bg-background p-6 space-y-5">
                            <div className="text-center">
                                <p className="text-meta font-medium uppercase tracking-wider text-muted-foreground mb-1">最终样本量</p>
                                <div className="text-display font-black tabular-nums text-primary">
                                    {finalSampleSize.toLocaleString()}
                                </div>
                                <p className="text-label text-muted-foreground mt-1">建议值 {recommendedSize.toLocaleString()}</p>
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
                                    <ParamSummaryItem label="总体方差" value={formatSamplePlanNumber(populationVariance)} />
                                )}
                            </div>
                        </div>

                        <div className="flex justify-center gap-3">
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => jumpTo("decision")}
                                className="border-input text-muted-foreground"
                            >
                                <ChevronLeft className="w-4 h-4 mr-1" />
                                返回修改
                            </Button>
                            <Button
                                type="button"
                                onClick={handleConfirm}
                                data-testid="immersive-sp-confirm"
                                className="bg-primary hover:bg-primary-hover text-primary-foreground px-8 py-5 rounded-surface "
                            >
                                确认规划结果
                                <ChevronRight className="w-5 h-5 ml-2" />
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
                className="fixed inset-0 z-50 bg-background outline-none"
                onKeyDown={focusTrap}
                tabIndex={-1}
            >
                {/* Progress bar */}
                <div className="absolute top-0 left-0 right-0 h-1 bg-muted z-10">
                    <div
                        className="h-full bg-primary transition-[width] duration-500 ease-out"
                        style={{ width: `${progress}%` }}
                    />
                </div>

                {/* Header */}
                <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-6 pt-4 z-10">
                    <div className="flex items-center gap-3">
                        <span className="text-label font-medium text-muted-foreground">
                            {PHASE_LABELS[phase.type] ?? ""}
                        </span>
                        {/* Phase dots */}
                        <div className="flex gap-1.5">
                            {NAVIGABLE_PHASES.map((t) => (
                                <div
                                    key={t}
                                    className={`h-1.5 rounded-control transition-colors ${
                                        t === phase.type
                                            ? "bg-primary w-5"
                                            : PHASE_ORDER.indexOf(t) < PHASE_ORDER.indexOf(phase.type)
                                                ? "bg-primary w-1.5"
                                                : "bg-input w-1.5"
                                    }`}
                                />
                            ))}
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={requestClose}
                        className="w-10 h-10 rounded-control flex items-center justify-center text-muted-foreground hover:text-muted-foreground hover:bg-muted transition-colors"
                        aria-label="关闭"
                        data-testid="immersive-sp-close"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Content */}
                <div className="h-full flex flex-col items-center justify-center overflow-y-auto px-6 pt-16 pb-24">
                    <div key={pageKey} className={`w-full max-w-2xl ${animationClass}`}>
                        <h1 id={titleId} className="sr-only">样本量规划</h1>
                        {renderPhase()}
                    </div>
                </div>

                {/* Keep the back action isolated from centered teaching content. */}
                {canGoPrev && (
                    <div className="pointer-events-none fixed bottom-4 left-6 z-10">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={goPrev}
                            className="pointer-events-auto bg-card text-muted-foreground hover:text-foreground"
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
                        className="flex fixed top-1/2 -translate-y-1/2 left-4 z-10 w-11 h-11 rounded-control border border-border bg-background items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
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
                        className="fixed top-1/2 right-4 z-10 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-control bg-primary text-primary-foreground transition-colors hover:bg-primary-hover"
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
                            当前规划进度已自动保存。下次打开本阶段时可以从这里继续。
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel type="button">取消</AlertDialogCancel>
                        <AlertDialogAction type="button" onClick={confirmExit} className="bg-destructive hover:bg-destructive-hover">
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
        <div className="rounded-surface bg-card px-3 py-2.5">
            <p className="text-meta font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
            <p className="text-label font-bold tabular-nums text-foreground mt-0.5">{value}</p>
        </div>
    );
}
